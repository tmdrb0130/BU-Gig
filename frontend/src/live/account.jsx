import { useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, upload, errorText, API } from "./api";
import { Modal } from "./modal";
import { Pagination, Picture } from "./ui";
import { NotificationPreferences } from "./extras";
import {
  useSession,
  useQuery,
  useCommand,
  QueryState,
  ErrorMessage,
  isVerified,
} from "./session";
import { Page, Field, Action, Empty, Card, status, date, Download } from "./ui";
export function Auth({ mode = "login" }) {
  const s = useSession(),
    nav = useNavigate(),
    [params] = useSearchParams(),
    config = useQuery("/public-config");
  const [success, setSuccess] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const loginLock = useRef(false);
  const c = useCommand();
  const signup = mode === "signup",
    reset = mode === "reset";
  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (signup && f.password !== f.confirm) {
      setSuccess("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (signup) {
      const result = await c.run("/auth/signup", {
        email: f.email,
        password: f.password,
        displayName: f.name,
        consents: [
          { type: "TERMS", version: config.data.termsVersion },
          { type: "PRIVACY", version: config.data.privacyVersion },
        ],
      });
      if (result)
        setSuccess(
          "가입 요청을 처리했습니다. 기존 계정이 있다면 동일한 이메일로 로그인해 주세요.",
        );
    } else if (reset) {
      const result = await c.run(
        params.get("token")
          ? "/auth/password-resets/confirm"
          : "/auth/password-resets",
        params.get("token")
          ? { token: params.get("token"), newPassword: f.password }
          : { email: f.email },
      );
      if (result)
        setSuccess(
          params.get("token")
            ? "비밀번호가 변경되었습니다. 다시 로그인해 주세요."
            : "등록된 계정이면 재설정 안내를 발송합니다.",
        );
    } else {
      if (loginLock.current) return;
      loginLock.current = true;
      setLoggingIn(true);
      try {
        await s.login({
          email: f.email,
          password: f.password,
          remember: !!f.remember,
        });
        const next = params.get("next");
        nav(
          next?.startsWith("/") &&
            !next.startsWith("//") &&
            !next.includes("\\")
            ? next
            : "/my",
        );
      } catch (e) {
        setSuccess(errorText(e));
      } finally {
        loginLock.current = false;
        setLoggingIn(false);
      }
    }
  };
  return (
    <section className={`auth-page ${signup ? "auth-signup" : ""}`}>
      <div className="auth-motto" aria-hidden="true">
        함께 만드는
        <br />
        <span>더 큰 가능성</span>
        <i />
      </div>
      <div className="auth-card">
        <h1>{signup ? "회원가입" : reset ? "비밀번호 재설정" : "로그인"}</h1>
        <p className="muted">같은 학교의 재능과 기회를 연결합니다.</p>
        <QueryState query={config}>
          {config.data && (
            <>
              {s.user && !reset ? (
                <>
                  <p>{s.user.displayName}님, 로그인되어 있어요.</p>
                  <Link to="/my">마이페이지</Link>
                </>
              ) : (
                <form className="auth-form" onSubmit={submit}>
                  {signup && (
                    <Field label="이름">
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={20}
                      />
                    </Field>
                  )}
                  {!(reset && params.get("token")) && (
                    <Field label="이메일">
                      <input
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                      />
                    </Field>
                  )}
                  {(!reset || params.get("token")) && (
                    <Field label="비밀번호">
                      <input
                        name="password"
                        type="password"
                        minLength={8}
                        maxLength={128}
                        autoComplete={
                          signup || reset ? "new-password" : "current-password"
                        }
                        required
                      />
                    </Field>
                  )}
                  {signup && (
                    <>
                      <Field label="비밀번호 확인">
                        <input
                          name="confirm"
                          type="password"
                          required
                          minLength={8}
                        />
                      </Field>
                      <p>
                        {config.data.termsUrl ? (
                          <a
                            target="_blank"
                            rel="noreferrer"
                            href={config.data.termsUrl}
                          >
                            이용약관 보기
                          </a>
                        ) : (
                          "개발 환경: 정식 운영 약관이 설정되지 않았습니다."
                        )}
                      </p>
                      <p>
                        {config.data.privacyUrl && (
                          <a
                            target="_blank"
                            rel="noreferrer"
                            href={config.data.privacyUrl}
                          >
                            개인정보 처리방침 보기
                          </a>
                        )}
                      </p>
                      <label>
                        <input type="checkbox" required />
                        이용약관 및 개인정보 처리방침에 동의합니다.
                      </label>
                    </>
                  )}
                  {!signup && !reset && (
                    <label>
                      <input name="remember" type="checkbox" />
                      로그인 상태 유지
                    </label>
                  )}
                  <button
                    className="btn primary"
                    disabled={
                      c.busy ||
                      loggingIn ||
                      (signup && !config.data.registrationEnabled)
                    }
                  >
                    {c.busy
                      ? "처리 중…"
                      : signup
                        ? "회원가입"
                        : reset
                          ? "재설정 요청"
                          : "로그인"}
                  </button>
                  {signup && !config.data.registrationEnabled && (
                    <p>현재 가입 준비 중입니다.</p>
                  )}
                  <ErrorMessage error={c.error} />
                  {success && <p role="status">{success}</p>}
                </form>
              )}
              <div className="form-actions">
                <Link to="/login">로그인</Link>
                <Link to="/signup">회원가입</Link>
                <Link to="/password-reset">비밀번호 찾기</Link>
              </div>
              {config.data.oauthProviders.map((p) => (
                <a
                  className={`social-button ${p}`}
                  aria-label={`${p === "kakao" ? "카카오" : "네이버"} 로그인`}
                  key={p}
                  href={`${API}/auth/oauth/${p}/start`}
                >
                  <img
                    src={
                      p === "kakao"
                        ? "/brand/kakao-login.svg"
                        : "/brand/naver-login.png"
                    }
                    alt=""
                  />
                </a>
              ))}
              <p className="muted">회원가입과 학교 인증은 별도로 진행됩니다.</p>
              {config.data.mailMode === "file" && reset && (
                <p>
                  개발 환경에서는 메일을 외부로 보내지 않습니다. 서버의 개발
                  메일함을 확인해 주세요.
                </p>
              )}
            </>
          )}
        </QueryState>
      </div>
    </section>
  );
}
export function Profile() {
  const q = useQuery("/me/profile"),
    taxonomy = useQuery("/categories"),
    s = useSession();
  return (
    <Page title="내 프로필">
      <QueryState query={q}>
        {q.data && (
          <>
            <div className="profile-readiness">
              <h2>프로필 준비하기</h2>
              <p>소개 · 활동 분야 · 기술 · 프로필 사진을 차례로 채워보세요.</p>
              <progress
                max="4"
                value={
                  [
                    q.data.headline,
                    q.data.fieldIds?.length,
                    q.data.skillIds?.length,
                    q.data.avatarMediaId,
                  ].filter(Boolean).length
                }
              />
              <div className="form-actions">
                <Link to="/my/portfolios">대표 작업물 등록</Link>
                {q.data.visibility === "PUBLIC" && (
                  <Link to={`/experts/${q.data.id}`}>
                    공개 프로필 미리보기 →
                  </Link>
                )}
              </div>
            </div>
            <ProfileForm
              key={q.data.version}
              profile={q.data}
              fields={taxonomy.data?.fields || []}
              reload={q.reload}
            />
          </>
        )}
      </QueryState>
      <h2>학교 인증</h2>
      <p>
        현재 상태:{" "}
        {isVerified(s.session)
          ? "인증 완료"
          : status(s.session?.verification?.state || "UNVERIFIED")}
      </p>
      <Link className="btn outline" to="/my/verification">
        인증 신청·결과 확인
      </Link>
      <h2>약관 동의</h2>
      <Consents />
      <h2>경력·제공 서비스</h2>
      <ProfileItems type="careers" title="경력" />
      <ProfileItems type="services" title="서비스" />
    </Page>
  );
}
function Consents() {
  const q = useQuery("/public-config");
  return q.data?.registrationEnabled ? (
    <>
      <p>
        {q.data.termsUrl && <a href={q.data.termsUrl}>이용약관</a>}{" "}
        {q.data.privacyUrl && <a href={q.data.privacyUrl}>개인정보 처리방침</a>}
      </p>
      <Action
        path="/me/consents"
        body={{
          termsVersion: q.data.termsVersion,
          privacyVersion: q.data.privacyVersion,
        }}
      >
        약관을 확인하고 동의
      </Action>
    </>
  ) : null;
}
function ProfileForm({ profile: p, fields, reload }) {
  const skills = useQuery("/skills");
  const c = useCommand(reload),
    [uploadError, setUploadError] = useState(""),
    [busy, setBusy] = useState(false),
    [avatar, setAvatar] = useState(p.avatarMediaId);
  return (
    <form
      className="request-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        c.run(
          "/me/profile",
          {
            expectedVersion: p.version,
            headline: f.get("headline"),
            bio: f.get("bio"),
            visibility: f.get("visibility"),
            availability: f.get("availability"),
            fieldIds: f.getAll("fields"),
            skillIds: f.getAll("skills"),
            avatarMediaId: avatar || null,
          },
          "PATCH",
        );
      }}
    >
      <Field label="소개 문구">
        <input name="headline" defaultValue={p.headline} maxLength={100} />
      </Field>
      <Field label="상세 소개">
        <textarea name="bio" defaultValue={p.bio} maxLength={2000} />
      </Field>
      <Field label="활동 분야">
        <select name="fields" multiple defaultValue={p.fieldIds}>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="프로필 공개">
        <select name="visibility" defaultValue={p.visibility}>
          <option value="PRIVATE">비공개</option>
          <option value="PUBLIC">공개</option>
        </select>
      </Field>
      <Field label="보유 기술">
        <select name="skills" multiple defaultValue={p.skillIds}>
          {skills.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="의뢰 가능 여부">
        <select name="availability" defaultValue={p.availability}>
          <option value="AVAILABLE">의뢰 가능</option>
          <option value="BUSY">현재 작업 중</option>
        </select>
      </Field>
      <Field label="프로필 사진">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            setBusy(true);
            setUploadError("");
            try {
              setAvatar(await upload(f, "AVATAR"));
            } catch (e) {
              setUploadError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {uploadError && <p role="alert">{uploadError}</p>}
      <p>
        소개와 활동 분야를 입력하고 공개로 저장하면 전문가 목록에 표시됩니다.
        학교 인증은 별도입니다.
      </p>
      <button className="btn primary" disabled={c.busy || busy}>
        프로필 저장
      </button>
      <ErrorMessage error={c.error} />
    </form>
  );
}
function ProfileItems({ type, title }) {
  const [editing, setEditing] = useState(null);
  const q = useQuery(`/me/${type}`),
    c = useCommand(q.reload);
  return (
    <section>
      <h3>{title}</h3>
      <QueryState query={q}>
        {q.data?.map((x) => (
          <p key={x.id}>
            {x.body.title} · {x.body.description}{" "}
            <button className="text-button" onClick={() => setEditing(x)}>
              수정
            </button>
            <Action
              path={`/me/${type}/${x.id}`}
              method="DELETE"
              body={{ expectedVersion: x.version }}
              onDone={q.reload}
            >
              삭제
            </Action>
          </p>
        ))}
      </QueryState>
      {editing && (
        <Modal title={`${title} 수정`} onClose={() => setEditing(null)}>
          <ProfileItemEdit
            type={type}
            item={editing}
            done={() => {
              setEditing(null);
              q.reload();
            }}
          />
        </Modal>
      )}
      <form
        className="live-search"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          c.run(`/me/${type}`, {
            title: f.get("title"),
            description: f.get("description"),
          });
        }}
      >
        <input
          name="title"
          aria-label={`${title} 제목`}
          placeholder={`${title} 제목`}
          required
          maxLength={100}
        />
        <input
          name="description"
          aria-label={`${title} 설명`}
          placeholder="설명"
          maxLength={2000}
        />
        <button disabled={c.busy}>추가</button>
      </form>
      <ErrorMessage error={c.error} />
    </section>
  );
}
function ProfileItemEdit({ type, item, done }) {
  const c = useCommand(done);
  return (
    <form
      className="release-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        c.run(
          `/me/${type}/${item.id}`,
          {
            expectedVersion: item.version,
            title: f.get("title"),
            description: f.get("description"),
            ...(f.get("startDate") ? { startDate: f.get("startDate") } : {}),
            ...(f.get("endDate") ? { endDate: f.get("endDate") } : {}),
          },
          "PATCH",
        );
      }}
    >
      <Field label="활동·작업명">
        <input
          name="title"
          defaultValue={item.body.title}
          required
          maxLength={100}
        />
      </Field>
      <Field label="상세 설명">
        <textarea
          name="description"
          defaultValue={item.body.description}
          maxLength={2000}
        />
      </Field>
      {type === "careers" && (
        <div className="form-row">
          <Field label="시작일">
            <input
              name="startDate"
              type="date"
              defaultValue={item.body.startDate}
            />
          </Field>
          <Field label="종료일">
            <input
              name="endDate"
              type="date"
              defaultValue={item.body.endDate}
            />
          </Field>
        </div>
      )}
      <button className="btn primary" disabled={c.busy}>
        변경 저장
      </button>
      <ErrorMessage error={c.error} />
    </form>
  );
}
export function Verification() {
  const q = useQuery("/me/school-verifications"),
    s = useSession(),
    c = useCommand(async () => {
      q.reload();
      await s.refresh();
    }),
    [mediaId, setMediaId] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Page title="학교 인증">
      <p>
        학교 소속을 확인할 수 있는 증빙을 제출해 주세요. 불필요한 개인정보는
        가린 후 제출해 주세요. 심사 결과와 만료일은 이 화면에서 확인할 수
        있습니다.
      </p>
      <QueryState query={q}>
        {q.data?.map((v) => (
          <article className="live-card" key={v.id}>
            <b>{status(v.state)}</b>
            <p>{v.reason}</p>
            {v.expiresAt && <small>유효기간 {date(v.expiresAt)}</small>}
          </article>
        ))}
      </QueryState>
      <form
        className="request-form"
        onSubmit={(e) => {
          e.preventDefault();
          c.run("/me/school-verifications", {
            method: "EVIDENCE",
            affiliationType: new FormData(e.currentTarget).get("affiliation"),
            evidenceMediaId: mediaId,
          });
        }}
      >
        <Field label="소속">
          <select name="affiliation">
            <option value="STUDENT">학생</option>
            <option value="FACULTY">교수</option>
            <option value="STAFF">교직원</option>
          </select>
        </Field>
        <Field label="인증 증빙">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={async (e) => {
              if (!e.target.files[0]) return;
              setMediaId(null);
              setBusy(true);
              setError("");
              try {
                setMediaId(await upload(e.target.files[0], "VERIFICATION"));
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
        <p>
          {busy
            ? "파일을 검사하고 있습니다."
            : mediaId
              ? "증빙 업로드 완료"
              : ""}
        </p>
        <button
          className="btn primary"
          disabled={
            busy ||
            c.busy ||
            !mediaId ||
            q.data?.some((v) => v.state === "PENDING")
          }
        >
          학교 인증 신청
        </button>
        <ErrorMessage error={c.error} />
        {error && <p role="alert">{error}</p>}
      </form>
    </Page>
  );
}
export function Dashboard() {
  const { session, user } = useSession(),
    q = useQuery("/me/dashboard");
  const [tab, setTab] = useState("projects");
  return (
    <Page title={`${user.displayName}님의 활동`}>
      <div className="form-actions dashboard-links">
        <Link to="/my/profile">프로필 설정</Link>
        <Link to="/my/verification">학교 인증</Link>
        <Link to="/email-verification">이메일 확인</Link>
        <Link to="/my/portfolios">내 작업물</Link>
        <Link to="/my/publication-requests">공개 승인</Link>
        <Link to="/notifications">알림</Link>
        <Link to="/messages">메시지</Link>
        <Link to="/settings/account">계정 설정</Link>
        <Link to="/support">내 문의</Link>
        {session.permissions?.length > 0 && <Link to="/admin">운영 관리</Link>}
      </div>
      {!isVerified(session) && (
        <p className="live-notice">
          의뢰 게시·지원·지정 요청을 시작하려면{" "}
          <Link to="/my/verification">학교 인증</Link>이 필요합니다. 초안은 먼저
          작성할 수 있어요.
        </p>
      )}
      <QueryState query={q}>
        {q.data && (
          <div className="live-dashboard-stats">
            {[
              ["projects", "내 의뢰"],
              ["proposals", "내 지원"],
              ["receivedRequests", "받은 요청"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() =>
                  setTab(
                    key === "receivedRequests"
                      ? "direct-requests?direction=received"
                      : key,
                  )
                }
              >
                <span>{label}</span>
                <strong>
                  {q.data[key]}
                  <small>건</small>
                </strong>
                <span>활동 확인 →</span>
              </button>
            ))}
          </div>
        )}
      </QueryState>
      <div className="live-dashboard-banner">
        <div>
          <h2>오늘, 새로운 연결을 시작해 보세요</h2>
          <p>필요한 도움을 의뢰하거나 나의 작업물로 재능을 소개하세요.</p>
        </div>
        <Link className="btn primary" to="/request/new">
          의뢰 등록하기
        </Link>
      </div>
      <nav className="tabs">
        {[
          ["projects", "내 의뢰"],
          ["proposals", "내 지원"],
          ["direct-requests?direction=sent", "보낸 요청"],
          ["direct-requests?direction=received", "받은 요청"],
          ["workrooms", "워크룸"],
          ["reviews", "받은 후기"],
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
      <ActivityList
        key={tab}
        path={`/me/${tab}${tab.includes("?") ? "&" : "?"}pageSize=50`}
        type={tab.split("?")[0]}
      />
    </Page>
  );
}
export function EmailVerification() {
  const [params] = useSearchParams(),
    { user } = useSession();
  const [done, setDone] = useState(false);
  const command = useCommand(() => setDone(true));
  const token = params.get("token");
  return (
    <Page title="이메일 확인">
      <p>이메일 확인은 학교 소속 인증과 별도입니다.</p>
      {done ? (
        <p role="status">
          {token
            ? "이메일 확인이 완료되었습니다."
            : "확인 메일을 요청했습니다. 메일의 링크를 열어 주세요."}
        </p>
      ) : token || user ? (
        <button
          className="btn primary"
          disabled={command.busy}
          onClick={() =>
            command.run(
              token
                ? "/auth/email-verifications/confirm"
                : "/auth/email-verifications",
              token ? { token } : {},
            )
          }
        >
          {token ? "이메일 확인 완료하기" : "확인 메일 받기"}
        </button>
      ) : (
        <Link to="/login?next=/email-verification">
          로그인 후 확인 메일 받기
        </Link>
      )}
      <ErrorMessage error={command.error} />
    </Page>
  );
}
export function ActivityList({ path, type }) {
  const [page, setPage] = useState(1),
    q = useQuery(path + `${path.includes("?") ? "&" : "?"}page=${page}`);
  return (
    <>
      <QueryState query={q}>
        {q.data?.length ? (
          <div className="live-grid">
            {q.data.map((p) => (
              <article className="live-card" key={p.id}>
                <h3>
                  {p.title ||
                    p.projectSummary?.title ||
                    p.latestTerms?.title ||
                    p.body ||
                    "프로젝트"}
                </h3>
                <p>{status(p.status)}</p>
                {type === "projects" ? (
                  <Link className="btn outline" to={`/my/projects/${p.id}`}>
                    의뢰 관리
                  </Link>
                ) : type === "proposals" ? (
                  <Link to={`/my/proposals/${p.id}`}>지원 내용</Link>
                ) : type === "workrooms" ? (
                  <Link to={`/workrooms/${p.id}`}>워크룸 열기</Link>
                ) : type === "direct-requests" ? (
                  <Link to={`/direct-requests/${p.id}`}>요청 내용</Link>
                ) : (
                  <span>★ {p.rating}</span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty to="/projects" label="의뢰 둘러보기">
            아직 활동 내역이 없어요.
          </Empty>
        )}
      </QueryState>
      <Pagination meta={q.meta} page={page} setPage={setPage} />
    </>
  );
}
export function Saved() {
  const [page, setPage] = useState(1),
    q = useQuery(`/me/favorites?pageSize=12&page=${page}`);
  return (
    <Page title="찜한 목록">
      <QueryState query={q}>
        {q.data?.length ? (
          <div className="live-grid">
            {q.data.map((x) => (
              <div key={`${x.type}:${x.item.id}`}>
                <Card type={x.type} item={x.item} />
                <Action
                  path={`/me/favorites/${x.type}/${x.item.id}`}
                  method="DELETE"
                  onDone={q.reload}
                >
                  저장 취소
                </Action>
              </div>
            ))}
          </div>
        ) : (
          <Empty to="/projects" label="둘러보기">
            현재 볼 수 있는 저장 항목이 없어요.
          </Empty>
        )}
      </QueryState>
      <Pagination meta={q.meta} page={page} setPage={setPage} />
    </Page>
  );
}
export function Notifications() {
  const [cursor, setCursor] = useState(""),
    q = useQuery(`/me/notifications${cursor ? "?cursor=" + cursor : ""}`);
  return (
    <Page title="알림">
      <details className="release-faq">
        <summary>알림 수신 설정</summary>
        <NotificationPreferences />
      </details>
      <p>읽지 않은 알림 {q.meta.unreadCount ?? 0}개</p>
      <QueryState query={q}>
        {q.data?.length ? (
          q.data.map((n) => (
            <article className="live-card" key={n.id}>
              <p>{notificationLabel(n.type)}</p>
              <small>{date(n.createdAt)}</small>
              <p>
                <Link to={notificationTarget(n.targetRef)}>관련 내용 보기</Link>
              </p>
              {!n.readAt && (
                <Action
                  path={`/me/notifications/${n.id}/read`}
                  method="PUT"
                  onDone={q.reload}
                >
                  읽음 처리
                </Action>
              )}
            </article>
          ))
        ) : (
          <Empty>아직 새 알림이 없어요.</Empty>
        )}
        {q.meta.hasMore && (
          <button onClick={() => setCursor(q.meta.nextCursor)}>
            이전 알림 더 보기
          </button>
        )}
      </QueryState>
    </Page>
  );
}
export function notificationLabel(type) {
  const group = type?.split(".")[0];
  return (
    {
      proposal: "지원 내용이 변경되었습니다.",
      project: "의뢰 상태가 변경되었습니다.",
      contract: "계약 상태가 변경되었습니다.",
      message: "대화가 업데이트되었습니다.",
      completion: "완료 요청이 업데이트되었습니다.",
      cancellation: "취소 요청이 업데이트되었습니다.",
      direct_request: "지정 요청이 업데이트되었습니다.",
      verification: "학교 인증 결과가 업데이트되었습니다.",
      media: "파일 검사가 처리되었습니다.",
      review: "새 후기가 등록되었습니다.",
      portfolio: "작업물 공개 요청이 업데이트되었습니다.",
    }[group] || "새로운 활동이 있습니다."
  );
}
function notificationTarget(r = {}) {
  return r.workroomId
    ? `/workrooms/${r.workroomId}`
    : r.requestId
      ? `/direct-requests/${r.requestId}`
      : r.publicationRequestId
        ? "/my/publication-requests"
        : r.projectId
          ? `/projects/${r.projectId}`
          : r.userId
            ? "/my/verification"
            : "/my";
}
export function Admin() {
  const { session } = useSession(),
    [tab, setTab] = useState("verifications"),
    [page, setPage] = useState(1);
  const tabs = [
    ["verifications", "verification", "학교 인증"],
    ["reports", "dispute", "신고"],
    ["tickets", "support", "문의"],
    ["jobs", "operations", "작업"],
    ["audit-logs", "audit", "감사"],
  ].filter((x) => session.permissions.includes(x[1]));
  const active = tabs.some((x) => x[0] === tab) ? tab : tabs[0]?.[0];
  const q = useQuery(
    active ? `/admin/${active}?pageSize=20&page=${page}` : null,
  );
  return (
    <Page title="운영 관리">
      {!tabs.length ? (
        <Empty>담당 권한이 없습니다.</Empty>
      ) : (
        <>
          <nav className="tabs">
            {tabs.map(([key, , label]) => (
              <button
                key={key}
                className={active === key ? "active" : ""}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <QueryState query={q}>
            {q.data?.map((r) => (
              <AdminItem key={r.id} type={active} item={r} reload={q.reload} />
            ))}
          </QueryState>
          <Pagination meta={q.meta} page={page} setPage={setPage} />
        </>
      )}
    </Page>
  );
}
function AdminItem({ type, item: r, reload }) {
  const [open, setOpen] = useState(false),
    q = useQuery(
      open && type === "verifications" ? `/admin/verifications/${r.id}` : null,
    ),
    [reason, setReason] = useState(""),
    [expires, setExpires] = useState("");
  return (
    <article className="live-card">
      <p>{r.userId || r.subject || r.handler || r.action || r.id}</p>
      <p>{status(r.state || r.status)}</p>
      {type === "verifications" && (
        <>
          <button onClick={() => setOpen(!open)}>증빙 심사</button>
          {open && (
            <QueryState query={q}>
              {q.data && (
                <>
                  <Download id={q.data.evidenceMediaId}>증빙 열람</Download>
                  <Field label="심사 사유">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <Field label="인증 만료일">
                    <input
                      type="date"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                    />
                  </Field>
                  {r.state === "PENDING" && (
                    <>
                      <Action
                        path={`/admin/verifications/${r.id}`}
                        method="PATCH"
                        disabled={!reason || !expires}
                        body={{
                          expectedVersion: r.version,
                          state: "VERIFIED",
                          reason,
                          expiresAt: expires
                            ? new Date(
                                expires + "T23:59:59+09:00",
                              ).toISOString()
                            : undefined,
                        }}
                        onDone={reload}
                      >
                        인증 승인
                      </Action>
                      <Action
                        path={`/admin/verifications/${r.id}`}
                        method="PATCH"
                        disabled={!reason}
                        body={{
                          expectedVersion: r.version,
                          state: "REJECTED",
                          reason,
                        }}
                        onDone={reload}
                      >
                        반려
                      </Action>
                    </>
                  )}
                  {r.state === "VERIFIED" && (
                    <Action
                      path={`/admin/verifications/${r.id}`}
                      method="PATCH"
                      disabled={!reason}
                      body={{
                        expectedVersion: r.version,
                        state: "REVOKED",
                        reason,
                      }}
                      onDone={reload}
                    >
                      인증 해제
                    </Action>
                  )}
                </>
              )}
            </QueryState>
          )}
        </>
      )}
      {type === "jobs" && r.state === "FAILED" && (
        <Action
          path={`/admin/jobs/${r.id}/retry`}
          body={{ reason: "운영 화면에서 재처리 요청" }}
          onDone={reload}
        >
          재처리
        </Action>
      )}
      {type === "tickets" && (
        <Link className="btn primary" to={`/admin/tickets/${r.id}`}>
          문의 확인·답변
        </Link>
      )}
      {type === "reports" && (
        <>
          <p>{r.reason}</p>
          <Link to={`/projects/${r.projectId}`}>관련 의뢰</Link>
          <Field label="처리 사유">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
          </Field>
          {[
            ["INVESTIGATING", "분쟁 조사 시작", true],
            ["RESOLVED", "분쟁 처리 완료", false],
          ].map(([value, label, active]) => (
            <Action
              key={value}
              path={`/admin/reports/${r.id}`}
              method="PATCH"
              body={{
                expectedVersion: r.version,
                status: value,
                disputeActive: active,
                reason,
              }}
              disabled={!reason}
              onDone={reload}
            >
              {label}
            </Action>
          ))}
        </>
      )}
    </article>
  );
}
