import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useQuery,
  useCommand,
  useSession,
  QueryState,
  ErrorMessage,
} from "./session";
import { Page, Field, Empty, Pagination, status, date, Action } from "./ui";
import { Modal } from "./modal";
import { Messages } from "./workroom";
export function Settings() {
  const q = useQuery("/me"),
    s = useSession(),
    [done, setDone] = useState(""),
    [remove, setRemove] = useState(false);
  const c = useCommand(async () => {
    setDone("계정 정보를 저장했습니다.");
    await s.refresh();
  });
  return (
    <Page title="계정 설정">
      <div className="settings-layout">
        <nav className="account-nav">
          <Link to="/my/profile">프로필 편집</Link>
          <Link to="/my/verification">학교 인증</Link>
          <Link to="/email-verification">이메일 확인</Link>
          <Link to="/support">고객센터</Link>
        </nav>
        <div>
          <section className="live-card">
            <h2>기본 정보</h2>
            <QueryState query={q}>
              {q.data && (
                <form
                  className="release-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    c.run(
                      "/me",
                      {
                        displayName: new FormData(e.currentTarget).get(
                          "displayName",
                        ),
                      },
                      "PATCH",
                    );
                  }}
                >
                  <Field label="활동 이름">
                    <input
                      name="displayName"
                      defaultValue={q.data.displayName}
                      required
                      minLength={2}
                      maxLength={20}
                    />
                  </Field>
                  <p>로그인 이메일: {q.data.email || "소셜 계정"}</p>
                  <button className="btn primary" disabled={c.busy}>
                    계정 정보 저장
                  </button>
                </form>
              )}
            </QueryState>
            <ErrorMessage error={c.error} />
            {done && <p role="status">{done}</p>}
          </section>
          <section className="live-card">
            <h2>로그인과 보안</h2>
            <p>
              비밀번호는 본인 이메일로 받은 재설정 링크에서 변경할 수 있습니다.
              변경하면 기존 로그인 세션이 종료됩니다.
            </p>
            <Link className="btn outline" to="/password-reset">
              비밀번호 변경
            </Link>
          </section>
          <section className="live-card">
            <h2>알림</h2>
            <p>
              지원·계약·완료 등 거래 관련 알림을 확인하고 읽음 상태를
              관리하세요.
            </p>
            <Link to="/notifications">내 알림 관리 →</Link>
            <NotificationPreferences />
          </section>
          <section className="live-card">
            <h2>회원 탈퇴</h2>
            <p>
              진행 중인 거래가 있으면 탈퇴할 수 없습니다. 탈퇴 시 프로필과
              작업물이 비공개 처리됩니다.
            </p>
            <button className="btn outline" onClick={() => setRemove(true)}>
              회원 탈퇴 안내
            </button>
          </section>
        </div>
      </div>
      {remove && (
        <Modal title="회원 탈퇴" onClose={() => setRemove(false)}>
          <Withdraw />
        </Modal>
      )}
    </Page>
  );
}
export function NotificationPreferences() {
  const q = useQuery("/me/notification-preferences"),
    [done, setDone] = useState(false),
    c = useCommand(() => {
      q.reload();
      setDone(true);
    });
  return (
    <QueryState query={q}>
      {q.data && (
        <form
          className="release-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            c.run(
              "/me/notification-preferences",
              { messages: f.has("messages"), matching: f.has("matching") },
              "PUT",
            );
          }}
        >
          <label>
            <input
              name="messages"
              type="checkbox"
              defaultChecked={q.data.messages}
            />
            새 메시지 알림
          </label>
          <label>
            <input
              name="matching"
              type="checkbox"
              defaultChecked={q.data.matching}
            />
            새 지원·지정 요청 알림
          </label>
          <p>
            계약·완료·인증 등 필수 거래 알림은 항상 전달됩니다. 설정 변경은 이후
            알림부터 적용됩니다.
          </p>
          <button className="btn outline" disabled={c.busy}>
            알림 설정 저장
          </button>
          {done && <small role="status">알림 설정을 저장했습니다.</small>}
          <ErrorMessage error={c.error} />
        </form>
      )}
    </QueryState>
  );
}
function Withdraw() {
  const s = useSession(),
    nav = useNavigate(),
    c = useCommand(async () => {
      await s.refresh();
      nav("/");
    });
  return (
    <form
      className="release-form"
      onSubmit={(e) => {
        e.preventDefault();
        c.run(
          "/me",
          { password: new FormData(e.currentTarget).get("password") },
          "DELETE",
        );
      }}
    >
      <p>
        이 계정을 탈퇴합니다. 거래 기록은 운영 보관 정책에 따라 별도로 보관될 수
        있습니다.
      </p>
      <Field label="현재 비밀번호">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </Field>
      <label>
        <input type="checkbox" required />
        탈퇴와 공개 정보 비공개 처리에 동의합니다.
      </label>
      <button className="btn primary" disabled={c.busy}>
        확인 후 탈퇴
      </button>
      <ErrorMessage error={c.error} />
    </form>
  );
}
export function Support() {
  const [page, setPage] = useState(1),
    { user } = useSession(),
    q = useQuery(user ? `/me/tickets?page=${page}&pageSize=10` : null),
    nav = useNavigate(),
    c = useCommand((r) => nav(`/support/tickets/${r.id}`));
  return (
    <Page title="고객센터">
      <div className="detail-layout">
        <section>
          <h2>자주 묻는 질문</h2>
          {[
            [
              "학교 인증은 어떻게 하나요?",
              "내 프로필의 학교 인증에서 증빙을 제출하면 담당자가 확인합니다. 이메일 확인만으로 학교 인증을 부여하지 않습니다.",
            ],
            [
              "결제는 어디서 하나요?",
              "플랫폼 결제는 제공하지 않습니다. 금액과 지급 방법은 양측 계약에서 합의하세요.",
            ],
            [
              "계약 내용을 바꾸고 싶어요.",
              "워크룸 계약 탭에서 변경안을 작성하세요. 기존 체결본은 새 버전에 양측이 동의할 때까지 보존됩니다.",
            ],
            [
              "결과물을 공개하고 싶어요.",
              "완료된 워크룸에서 작업물 공개 승인을 요청하세요. 의뢰자가 해당 버전의 공개를 승인해야 검증 작업으로 표시됩니다.",
            ],
          ].map(([title, body]) => (
            <details className="release-faq" key={title}>
              <summary>{title}</summary>
              <p>{body}</p>
            </details>
          ))}
          {user ? (
            <>
              <h2>내 문의</h2>
              <QueryState query={q}>
                {q.data?.length ? (
                  q.data.map((t) => (
                    <Link
                      className="release-file"
                      key={t.id}
                      to={`/support/tickets/${t.id}`}
                    >
                      <b>{t.subject}</b>
                      <span>
                        {status(t.status)} · {date(t.createdAt)}
                      </span>
                    </Link>
                  ))
                ) : (
                  <Empty>등록한 문의가 없습니다.</Empty>
                )}
              </QueryState>
              <Pagination meta={q.meta} page={page} setPage={setPage} />
              <Link to="/my/reports">내 신고·분쟁 확인 →</Link>
            </>
          ) : (
            <Link className="btn primary" to="/login?next=/support">
              로그인 후 문의하기
            </Link>
          )}
        </section>
        <aside className="live-card">
          <h2>1:1 문의</h2>
          {user && (
            <form
              className="release-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                c.run("/me/tickets", {
                  subject: f.get("subject"),
                  body: f.get("body"),
                });
              }}
            >
              <Field label="문의 제목">
                <input name="subject" required maxLength={100} />
              </Field>
              <Field label="문의 내용">
                <textarea name="body" required maxLength={10000} />
              </Field>
              <button className="btn primary" disabled={c.busy}>
                문의 접수
              </button>
              <ErrorMessage error={c.error} />
            </form>
          )}
        </aside>
      </div>
    </Page>
  );
}
export function Ticket({ admin = false }) {
  const { id } = useParams();
  return (
    <Page title={admin ? "문의 답변" : "내 문의"}>
      <TicketThread id={id} admin={admin} />
    </Page>
  );
}
export function TicketThread({ id, admin = false }) {
  const prefix = admin ? "/admin" : "/me",
    q = useQuery(`${prefix}/tickets/${id}${admin ? "/replies" : ""}`),
    [text, setText] = useState(""),
    c = useCommand(() => {
      setText("");
      q.reload();
    });
  return (
    <QueryState query={q}>
      {q.data && (
        <>
          <h2>{q.data.subject}</h2>
          <p>{status(q.data.status)}</p>
          {q.data.replies.map((r) => (
            <article className="live-card" key={r.id}>
              <small>{date(r.createdAt)}</small>
              <p>{r.body}</p>
            </article>
          ))}
          <form
            className="release-form live-card"
            onSubmit={(e) => {
              e.preventDefault();
              c.run(`${prefix}/tickets/${id}/replies`, { body: text });
            }}
          >
            <Field label="답변 내용">
              <textarea
                required
                maxLength={10000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <button className="btn primary" disabled={c.busy}>
              답변 등록
            </button>
            <ErrorMessage error={c.error} />
          </form>
        </>
      )}
    </QueryState>
  );
}
export function Reports() {
  const q = useQuery("/me/reports?pageSize=50");
  return (
    <Page title="내 신고·분쟁">
      <QueryState query={q}>
        {q.data?.length ? (
          q.data.map((r) => (
            <article className="live-card" key={r.id}>
              <span className="badge">{status(r.status)}</span>
              <p>{r.reason}</p>
              <Link to={`/projects/${r.projectId}`}>관련 의뢰</Link>
            </article>
          ))
        ) : (
          <Empty>
            접수한 신고가 없습니다. 거래 워크룸에서 관련 의뢰를 지정해 접수할 수
            있습니다.
          </Empty>
        )}
      </QueryState>
    </Page>
  );
}
export function ReportForm({ projectId }) {
  const [done, setDone] = useState(false),
    c = useCommand(() => setDone(true));
  return done ? (
    <p role="status">
      신고를 접수했습니다. <Link to="/my/reports">처리 상태 보기</Link>
    </p>
  ) : (
    <form
      className="release-form"
      onSubmit={(e) => {
        e.preventDefault();
        c.run("/me/reports", {
          projectId,
          reason: new FormData(e.currentTarget).get("reason"),
        });
      }}
    >
      <p>관련 의뢰와 처리 사유가 운영 담당자에게 전달됩니다.</p>
      <Field label="신고 사유">
        <textarea name="reason" required maxLength={2000} />
      </Field>
      <button className="btn primary" disabled={c.busy}>
        신고 접수
      </button>
      <ErrorMessage error={c.error} />
    </form>
  );
}
export function Conversations() {
  const { id } = useParams(),
    q = useQuery("/conversations");
  const selected = q.data?.find((c) => c.id === id);
  return (
    <Page title="메시지">
      <QueryState query={q}>
        <div className="conversation-layout">
          <aside className="conversation-list">
            {q.data?.length ? (
              q.data.map((r, i) => (
                <Link
                  key={r.id}
                  className={r.id === id ? "active" : ""}
                  to={`/messages/${r.id}`}
                >
                  <b>{r.title || `프로젝트 대화 ${i + 1}`}</b>
                  <small>
                    {Number(r.nextSequence) > Number(r.lastReadSequence)
                      ? "읽지 않은 대화"
                      : "대화 보기"}
                  </small>
                </Link>
              ))
            ) : (
              <Empty to="/projects" label="프로젝트 찾기">
                아직 시작한 대화가 없어요.
              </Empty>
            )}
          </aside>
          <section className="conversation-main">
            {selected ? (
              <>
                <h2>{selected.title || "프로젝트 대화"}</h2>
                {selected.workroomId ? (
                  <Link to={`/workrooms/${selected.workroomId}`}>
                    워크룸 열기 →
                  </Link>
                ) : selected.projectId ? (
                  <Link to={`/projects/${selected.projectId}`}>
                    관련 의뢰 →
                  </Link>
                ) : (
                  <Link to={`/direct-requests/${selected.directRequestId}`}>
                    관련 지정 요청 →
                  </Link>
                )}
                <Messages key={id} room={{ id, conversationId: id }} />
              </>
            ) : (
              <Empty>
                {id
                  ? "현재 볼 수 없는 대화입니다."
                  : "목록에서 대화를 선택해 주세요."}
              </Empty>
            )}
          </section>
        </div>
      </QueryState>
    </Page>
  );
}
export function PolicyPage({ privacy = false }) {
  const q = useQuery("/public-config");
  return (
    <Page title={privacy ? "개인정보 처리방침" : "이용약관"}>
      <QueryState query={q}>
        {q.data?.[privacy ? "privacyUrl" : "termsUrl"] ? (
          <a
            className="btn primary"
            href={q.data[privacy ? "privacyUrl" : "termsUrl"]}
          >
            정식 문서 열기
          </a>
        ) : (
          <Empty>정식 문서가 아직 게시되지 않았습니다.</Empty>
        )}
      </QueryState>
    </Page>
  );
}
