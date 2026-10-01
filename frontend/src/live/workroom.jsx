import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ReportForm } from "./extras";
import { Modal } from "./modal";
import { API, api, upload, errorText } from "./api";
import {
  useQuery,
  useSession,
  useCommand,
  QueryState,
  ErrorMessage,
} from "./session";
import {
  Page,
  Field,
  Action,
  Empty,
  Download,
  status,
  date,
  money,
} from "./ui";
export function Workroom() {
  const { id } = useParams(),
    q = useQuery(`/workrooms/${id}`),
    { user } = useSession();
  const [params, setParams] = useSearchParams(),
    [report, setReport] = useState(false);
  const tab = [
    "overview",
    "messages",
    "contract",
    "files",
    "completion",
  ].includes(params.get("tab"))
    ? params.get("tab")
    : "overview";
  const setTab = (value) => setParams({ tab: value });
  const room = q.data;
  useEffect(() => {
    const events = new EventSource(API + "/events", { withCredentials: true });
    const refresh = () => q.reload();
    for (const type of [
      "project.matched",
      "contract.published",
      "contract.accepted",
      "contract.signed",
      "contract.withdrawn",
      "completion.requested",
      "completion.resolved",
      "cancellation.requested",
      "cancellation.resolved",
      "project.cancelled",
      "stream.reset",
    ])
      events.addEventListener(type, refresh);
    return () => events.close();
  }, [id]);
  return (
    <Page title={room?.project?.terms?.title || "워크룸"}>
      <QueryState query={q}>
        {room && (
          <>
            <p>
              {status(room.project.status)} ·{" "}
              {room.project.ownerId === user.id ? "의뢰자" : "수행자"}
            </p>
            <ol className="release-progress">
              {["선정 완료", "계약 확인", "작업 진행", "완료"].map(
                (label, i) => (
                  <li
                    key={label}
                    className={
                      i <=
                      (room.project.status === "COMPLETED"
                        ? 3
                        : room.signedVersion
                          ? 2
                          : 1)
                        ? "active"
                        : ""
                    }
                  >
                    <span>{i + 1}</span>
                    {label}
                  </li>
                ),
              )}
            </ol>
            <nav className="tabs workroom-tabs">
              {[
                ["overview", "개요"],
                ["messages", "대화"],
                ["contract", "계약"],
                ["files", "파일"],
                ["completion", "완료·취소"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={key === tab ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "overview" ? (
              <div className="release-workroom-overview">
                <article className="live-card">
                  <h2>프로젝트 개요</h2>
                  <p>{room.project.terms.content}</p>
                  <p>결과물: {room.project.terms.deliverables}</p>
                </article>
                <article className="live-card">
                  <h2>계약</h2>
                  <p>
                    {room.signedVersion
                      ? "양측 동의 완료"
                      : room.reviewVersion?.status === "WAITING_ACCEPTANCE"
                        ? "계약 검토 중"
                        : "계약 작성 대기"}
                  </p>
                  <button
                    className="btn outline"
                    onClick={() => setTab("contract")}
                  >
                    계약 확인하기
                  </button>
                  <p>
                    계약 금액과 범위는 계약 탭에서 양측이 확인하고 동의해야
                    확정됩니다.
                  </p>
                </article>
                <article className="live-card">
                  <h2>함께 작업하기</h2>
                  <button
                    className="btn outline"
                    onClick={() => setTab("messages")}
                  >
                    대화 열기
                  </button>
                  <button
                    className="btn outline"
                    onClick={() => setTab("files")}
                  >
                    공유 파일 보기
                  </button>
                  <p>
                    <Link to="/my">내 활동으로 돌아가기</Link>
                  </p>
                </article>
              </div>
            ) : tab === "messages" ? (
              <Messages room={room} />
            ) : tab === "contract" ? (
              <Contracts room={room} reload={q.reload} />
            ) : tab === "files" ? (
              <Files room={room} />
            ) : (
              <Completion room={room} reload={q.reload} />
            )}
            <div className="form-actions">
              <Link to="/messages">전체 대화 목록</Link>
              <button className="text-button" onClick={() => setReport(true)}>
                신고·분쟁 접수
              </button>
            </div>
            {report && (
              <Modal title="신고·분쟁 접수" onClose={() => setReport(false)}>
                <ReportForm projectId={room.projectId} />
              </Modal>
            )}
          </>
        )}
      </QueryState>
    </Page>
  );
}
export function Messages({ room }) {
  const q = useQuery(`/conversations/${room.conversationId}/messages`),
    { user } = useSession(),
    [text, setText] = useState(""),
    [items, setItems] = useState([]),
    [cursor, setCursor] = useState(0),
    [error, setError] = useState("");
  const c = useCommand(() => {
    setText("");
    q.reload();
  });
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (q.data) {
      setItems((all) =>
        [...all, ...q.data.filter((m) => !all.some((x) => x.id === m.id))].sort(
          (a, b) => a.sequence - b.sequence,
        ),
      );
      setCursor((current) =>
        Math.max(Number(current || 0), Number(q.meta.nextCursor || 0)),
      );
    }
  }, [q.data]);
  useEffect(() => {
    const timer = setInterval(() => more(), 5000);
    return () => clearInterval(timer);
  }, [room.id, cursor]);
  const more = async () => {
    try {
      const r = await api(
        `/conversations/${room.conversationId}/messages?cursor=${cursor}`,
      );
      setItems((all) => [
        ...all,
        ...r.data.filter((m) => !all.some((x) => x.id === m.id)),
      ]);
      setCursor(r.meta.nextCursor);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <>
      <QueryState query={q}>
        {items.length ? (
          <div className="live-messages" role="log" aria-label="대화 내역">
            {items.map((m) => (
              <div
                className={`live-card ${m.senderId === user.id ? "mine" : ""}`}
                key={m.id}
              >
                <small>
                  {m.kind === "SYSTEM"
                    ? "상태 알림"
                    : m.senderId === user.id
                      ? "나"
                      : "상대방"}{" "}
                  · {date(m.createdAt)}
                </small>
                <p>
                  {m.kind === "SYSTEM"
                    ? "프로젝트 상태가 업데이트되었습니다. 개요와 계약을 확인해 주세요."
                    : m.text}
                </p>
                {m.mediaIds?.map((mid) => (
                  <Download key={mid} id={mid}>
                    메시지 첨부파일
                  </Download>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <Empty>아직 대화가 없습니다. 작업 방향을 함께 정해보세요.</Empty>
        )}
      </QueryState>
      {items.length >= 50 && <button onClick={more}>다음 대화 불러오기</button>}
      <form
        className="live-search"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await c.run(
            `/conversations/${room.conversationId}/messages`,
            { text, clientMessageId: messageId },
          );
          if (r) setMessageId(crypto.randomUUID());
        }}
      >
        <input
          aria-label="메시지"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessageId(crypto.randomUUID());
          }}
          maxLength={3000}
          required
        />
        <button className="btn primary" disabled={c.busy}>
          메시지 보내기
        </button>
      </form>
      <Action
        path={`/conversations/${room.conversationId}/read`}
        method="PUT"
        body={{ lastReadSequence: Number(cursor || 0) }}
      >
        여기까지 읽음
      </Action>
      <ErrorMessage error={c.error} />
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Contracts({ room, reload }) {
  const q = useQuery(`/contracts/${room.contractId}`),
    { user } = useSession(),
    [edit, setEdit] = useState(false);
  const c = useCommand(() => {
    q.reload();
    reload();
    setEdit(false);
  });
  const contract = q.data,
    review = contract?.versions.find((v) => v.id === contract.reviewVersionId),
    signed = contract?.versions.find((v) => v.id === contract.signedVersionId);
  const editable =
    ["MATCHED", "IN_PROGRESS"].includes(room.project.status) &&
    !room.activeCancellationRequest;
  return (
    <QueryState query={q}>
      {contract && (
        <>
          <p>
            체결본과 변경 검토본은 별도로 보관됩니다. 두 사람이 같은 버전에
            동의해야 체결됩니다.
          </p>
          {signed && <ContractVersion version={signed} />}{" "}
          {review && (
            <article className="live-card">
              <ContractVersion version={review} />
              <p>
                동의한 당사자:{" "}
                {
                  contract.acceptances.filter(
                    (a) => a.contractVersionId === review.id,
                  ).length
                }{" "}
                / 2
              </p>
              {editable && (
                <div className="form-actions">
                  {review.status === "DRAFT" && review.authorId === user.id && (
                    <button
                      className="btn primary"
                      disabled={c.busy}
                      onClick={() =>
                        c.run(`/contract-versions/${review.id}/publish`, {
                          expectedVersion: contract.version,
                        })
                      }
                    >
                      계약 검토 요청
                    </button>
                  )}
                  {review.status === "WAITING_ACCEPTANCE" &&
                    !contract.acceptances.some(
                      (a) =>
                        a.contractVersionId === review.id &&
                        a.userId === user.id,
                    ) && (
                      <button
                        className="btn primary"
                        disabled={c.busy}
                        onClick={() =>
                          c.run(`/contract-versions/${review.id}/acceptances`, {
                            expectedVersion: contract.version,
                            contentHash: review.contentHash,
                          })
                        }
                      >
                        이 계약 내용에 동의
                      </button>
                    )}
                  {review.authorId === user.id && (
                    <Action
                      path={`/contract-versions/${review.id}/withdraw`}
                      body={{ expectedVersion: contract.version }}
                      onDone={() => {
                        q.reload();
                        reload();
                      }}
                    >
                      검토본 철회
                    </Action>
                  )}
                </div>
              )}
            </article>
          )}
          {editable && (
            <button className="btn outline" onClick={() => setEdit(!edit)}>
              새 계약 버전 작성
            </button>
          )}
          {edit && editable && (
            <form
              className="request-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                c.run(`/workrooms/${room.id}/contracts/versions`, {
                  expectedVersion: contract.version,
                  baseSignedVersionId: contract.signedVersionId,
                  body: {
                    scope: f.get("scope"),
                    deliverables: f.get("deliverables"),
                    amount: Number(f.get("amount")),
                    days: Number(f.get("days")),
                    revisions: f.get("revisions"),
                    otherAgreements: f.get("otherAgreements"),
                  },
                });
              }}
            >
              {[
                ["scope", "작업 범위"],
                ["deliverables", "결과물"],
                ["revisions", "수정 조건"],
                ["otherAgreements", "기타 합의"],
              ].map(([name, label]) => (
                <Field key={name} label={label}>
                  <textarea
                    name={name}
                    required={["scope", "deliverables"].includes(name)}
                    defaultValue={(review || signed)?.body[name] || ""}
                  />
                </Field>
              ))}
              <Field label="계약 금액">
                <input
                  name="amount"
                  type="number"
                  min="1"
                  max="1000000000"
                  defaultValue={(review || signed)?.body.amount || ""}
                  required
                />
              </Field>
              <Field label="계약 기간 (일)">
                <input
                  name="days"
                  type="number"
                  min="1"
                  max="365"
                  defaultValue={(review || signed)?.body.days || 7}
                  required
                />
              </Field>
              <button className="btn primary" disabled={c.busy}>
                새 검토본 저장
              </button>
            </form>
          )}
          <ErrorMessage error={c.error} />
          <details>
            <summary>이전 계약 버전</summary>
            {contract.versions
              .filter(
                (v) =>
                  ![
                    contract.reviewVersionId,
                    contract.signedVersionId,
                  ].includes(v.id),
              )
              .map((v) => (
                <ContractVersion key={v.id} version={v} />
              ))}
          </details>
        </>
      )}
    </QueryState>
  );
}
function ContractVersion({ version: v }) {
  const document = useQuery(
    v.status === "SIGNED" ? `/contract-versions/${v.id}/document` : null,
  );
  return (
    <div className="live-contract">
      <h3>
        계약 {v.sequence}차 · {status(v.status)}
      </h3>
      <p className="preserve">{v.body.scope}</p>
      <p>결과물: {v.body.deliverables}</p>
      <p>
        {money(v.body.amount)} · {v.body.days}일
      </p>
      {v.body.revisions && <p>수정 조건: {v.body.revisions}</p>}
      {v.body.otherAgreements && <p>기타 합의: {v.body.otherAgreements}</p>}
      {v.status === "SIGNED" &&
        (document.data?.url ? (
          <a className="btn outline" href={document.data.url}>
            체결 계약 PDF 다운로드
          </a>
        ) : (
          <button className="btn outline" onClick={document.reload}>
            계약 PDF 생성 상태 확인
          </button>
        ))}
    </div>
  );
}
function Files({ room }) {
  const [cursor, setCursor] = useState(""),
    q = useQuery(
      `/workrooms/${room.id}/files${cursor ? "?cursor=" + cursor : ""}`,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <QueryState query={q}>
        {q.data?.length ? (
          q.data.map((f) => (
            <p key={f.mediaId}>
              <Download id={f.mediaId}>{f.name}</Download>
            </p>
          ))
        ) : (
          <Empty>아직 공유한 파일이 없어요.</Empty>
        )}
        {q.meta.hasMore && (
          <button onClick={() => setCursor(q.meta.nextCursor)}>
            이전 파일
          </button>
        )}
      </QueryState>
      {!["COMPLETED", "CANCELLED"].includes(room.project.status) && (
        <Field label="파일 공유">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              setBusy(true);
              setError("");
              try {
                const mediaId = await upload(f, "WORKROOM", room.id);
                await api(`/workrooms/${room.id}/files`, {
                  method: "POST",
                  body: { mediaId },
                });
                q.reload();
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
      )}
      {busy && <p role="status">파일 전송·검사 중입니다.</p>}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Completion({ room: r, reload }) {
  const mine = useQuery(
    r.project.status === "COMPLETED"
      ? `/projects/${r.projectId}/my-review`
      : null,
  );
  const { user } = useSession(),
    provider = r.project.providerId === user.id,
    c = useCommand(() => {
      reload();
      mine.reload();
    }),
    [reason, setReason] = useState("");
  const works = useQuery(
      r.project.status === "COMPLETED" && provider
        ? "/me/portfolios?pageSize=50"
        : null,
    ),
    [portfolio, setPortfolio] = useState("");
  const completion = r.activeCompletionRequest,
    cancel = r.activeCancellationRequest;
  return (
    <>
      <Field label="완료 내용 / 처리 사유">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
        />
      </Field>
      {r.project.status === "IN_PROGRESS" &&
        provider &&
        !cancel &&
        !r.reviewVersion && (
          <button
            className="btn primary"
            disabled={!reason || c.busy}
            onClick={() =>
              c.run(`/workrooms/${r.id}/completion-requests`, {
                expectedVersion: r.version,
                signedVersionId: r.signedVersion.id,
                note: reason,
              })
            }
          >
            완료 확인 요청
          </button>
        )}
      {completion && (
        <article className="live-card">
          <h3>완료 확인 요청</h3>
          <p>{completion.note}</p>
          {provider ? (
            <Action
              path={`/completion-requests/${completion.id}/cancel`}
              body={{ expectedVersion: completion.version }}
              onDone={reload}
            >
              완료 요청 철회
            </Action>
          ) : (
            <>
              <Action
                path={`/completion-requests/${completion.id}/approve`}
                disabled={!!cancel}
                body={{ expectedVersion: completion.version }}
                onDone={reload}
              >
                완료 승인
              </Action>
              <Action
                path={`/completion-requests/${completion.id}/request-changes`}
                disabled={!reason || !!cancel}
                body={{ expectedVersion: completion.version, reason }}
                onDone={reload}
              >
                보완 요청
              </Action>
            </>
          )}
        </article>
      )}
      {["MATCHED", "IN_PROGRESS", "COMPLETION_REQUESTED"].includes(
        r.project.status,
      ) &&
        !cancel && (
          <Action
            path={`/projects/${r.projectId}/cancellation-requests`}
            body={{ expectedVersion: r.version, reason }}
            disabled={!reason}
            onDone={reload}
          >
            거래 취소 협의 요청
          </Action>
        )}
      {cancel && (
        <article className="live-card">
          <h3>취소 협의 중</h3>
          <p>{cancel.reason}</p>
          {cancel.requesterId === user.id ? (
            <Action
              path={`/cancellation-requests/${cancel.id}/withdraw`}
              body={{ expectedVersion: cancel.version }}
              onDone={reload}
            >
              취소 요청 철회
            </Action>
          ) : (
            <>
              <Action
                path={`/cancellation-requests/${cancel.id}/approve`}
                body={{ expectedVersion: cancel.version }}
                onDone={reload}
              >
                취소 동의
              </Action>
              <Action
                path={`/cancellation-requests/${cancel.id}/reject`}
                body={{ expectedVersion: cancel.version }}
                onDone={reload}
              >
                취소 거절
              </Action>
            </>
          )}
        </article>
      )}
      {r.project.status === "COMPLETED" && (
        <>
          <h2>거래 후기</h2>
          <QueryState query={mine}>
            {mine.data ? (
              <article className="live-card">
                <p>등록한 후기 · {mine.data.rating}점</p>
                <p>{mine.data.body}</p>
                <Action
                  path={`/me/reviews/${mine.data.id}`}
                  method="PATCH"
                  body={{
                    visibility:
                      mine.data.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC",
                    homeFeaturedOptIn: false,
                  }}
                  onDone={mine.reload}
                >
                  {mine.data.visibility === "PUBLIC"
                    ? "후기 비공개로 변경"
                    : "후기 공개로 변경"}
                </Action>
              </article>
            ) : (
              <form
                className="request-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  c.run(`/projects/${r.projectId}/reviews`, {
                    rating: Number(f.get("rating")),
                    body: f.get("body"),
                    homeFeaturedOptIn: f.get("home") === "on",
                  });
                }}
              >
                <Field label="평점">
                  <select name="rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
                <Field label="후기 내용">
                  <textarea name="body" required maxLength={2000} />
                </Field>
                <p>
                  공개된 거래 후기는 서비스 내에 표시됩니다. 개인정보와 비공개
                  거래 내용은 입력하지 마세요.
                </p>
                <button className="btn primary" disabled={c.busy}>
                  후기 등록
                </button>
                <label>
                  <input type="checkbox" name="home" />
                  공개 의뢰의 후기 본문과 별점을 홈 소개에 사용하는 데
                  동의합니다. (선택)
                </label>
              </form>
            )}
          </QueryState>
          {provider && (
            <>
              <h3>완료 실적 공개 승인 요청</h3>
              <select
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
              >
                <option value="">본인 작업물 선택</option>
                {works.data?.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
              <Action
                path={`/portfolios/${portfolio}/publication-requests`}
                disabled={!portfolio}
                body={{
                  projectId: r.projectId,
                  portfolioVersionId: works.data?.find(
                    (w) => w.id === portfolio,
                  )?.currentVersionId,
                }}
              >
                해당 버전 공개 승인 요청
              </Action>
            </>
          )}
        </>
      )}
      <ErrorMessage error={c.error} />
    </>
  );
}
