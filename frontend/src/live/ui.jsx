import { useState, useId, cloneElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, mediaUrl, errorText } from "./api";
import { useSession, useCommand, useQuery, ErrorMessage } from "./session";
import { Heart, FolderOpen } from "lucide-react";
export const labels = {
  DRAFT: "초안",
  OPEN: "모집 중",
  CLOSED: "모집 마감",
  MATCHED: "선정 완료",
  IN_PROGRESS: "작업 중",
  COMPLETION_REQUESTED: "완료 확인 대기",
  COMPLETED: "완료",
  CANCELLED: "취소",
  PENDING: "대기 중",
  ACCEPTED: "수락",
  REJECTED: "거절",
  EXPIRED: "만료",
  SUBMITTED: "지원 완료",
  IN_DISCUSSION: "협의 중",
  SELECTED: "선정",
  WITHDRAWN: "철회",
  VERIFIED: "인증 완료",
  UNVERIFIED: "미인증",
  REVOKED: "인증 해제",
  WAITING_ACCEPTANCE: "동의 대기",
  SIGNED: "체결",
  SUPERSEDED: "이전 검토본",
  APPROVED: "승인",
  CHANGES_REQUESTED: "보완 요청",
  PENDING_APPROVAL: "공개 승인 대기",
  PRIVATE: "비공개",
  PUBLIC: "공개",
};
export const status = (s) => labels[s] || s;
export const money = (n) =>
  n === null || n === undefined
    ? "협의"
    : `${Number(n).toLocaleString("ko-KR")}원`;
export const budget = (p) =>
  p.budgetType === "NEGOTIABLE"
    ? "협의"
    : p.budgetType === "RANGE"
      ? `${money(p.budgetMin)} ~ ${money(p.budgetMax)}`
      : money(p.budgetMin);
export const date = (d) => (d ? new Date(d).toLocaleString("ko-KR") : "미정");
export function Verified({ value }) {
  return value === true ? (
    <span className="verified" title="학교 소속 확인이며 실력 보증이 아닙니다">
      ✓ 학교 인증
    </span>
  ) : null;
}
export function Picture({ src, alt = "", avatar = false }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      className={avatar ? "avatar" : "live-image"}
      src={mediaUrl(src)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className={avatar ? "initial-avatar" : "live-placeholder"}
      aria-label={alt || "등록된 이미지 없음"}
    >
      {avatar ? "●" : "함께할 가능성"}
    </span>
  );
}
export function Empty({ children = "아직 등록된 항목이 없어요.", to, label }) {
  return (
    <div className="empty">
      <FolderOpen size={38} strokeWidth={1.3} />
      <p>{children}</p>
      {to && (
        <Link className="btn primary" to={to}>
          {label}
        </Link>
      )}
    </div>
  );
}
export function Page({ title, children }) {
  return (
    <div className="container simple-page live-page">
      <div className="breadcrumb">
        <Link to="/">홈</Link>
        <span>› {title}</span>
      </div>
      <div className="page-heading">
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Field({ label, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function Action({
  path,
  body = {},
  method = "POST",
  children,
  onDone,
  disabled,
}) {
  const c = useCommand(onDone);
  return (
    <>
      <button
        className="btn outline"
        type="button"
        disabled={disabled || c.busy}
        onClick={() => c.run(path, body, method)}
      >
        {c.busy ? "처리 중…" : children}
      </button>
      <ErrorMessage error={c.error} />
    </>
  );
}
export function Save({ type, id, saved, onDone }) {
  const { user } = useSession();
  const nav = useNavigate();
  const c = useCommand(onDone);
  return (
    <>
      <button
        className="btn outline small-btn"
        aria-pressed={!!saved}
        disabled={c.busy}
        onClick={() =>
          user
            ? c.run(`/me/favorites/${type}/${id}`, {}, saved ? "DELETE" : "PUT")
            : nav("/login?next=/saved")
        }
      >
        {saved ? "♥ 저장 취소" : "♡ 저장"}
      </button>
      <ErrorMessage error={c.error} />
    </>
  );
}
export function Card({ type, item: p, compact = false }) {
  if (type === "portfolios")
    return (
      <article className="portfolio-card">
        <CardSave type={type} id={p.id} />
        <Link className="portfolio-image" to={`/works/${p.id}`}>
          <Picture src={p.coverUrl} alt={p.title} />
          {p.verifiedWork && (
            <span className="image-label">완료 거래 · 공개 승인 확인</span>
          )}
        </Link>
        <div className="portfolio-info">
          <Link to={`/works/${p.id}`}>
            <h3>{p.title}</h3>
          </Link>
          <p>{p.summary}</p>
          <div className="portfolio-meta">
            <span>{p.author?.displayName || "작성자 정보 없음"}</span>
            <span>♡ {p.favoriteCount ?? 0}</span>
          </div>
        </div>
      </article>
    );
  if (type === "experts")
    return (
      <article className={`expert-card ${compact ? "compact" : "list-card"}`}>
        <CardSave type={type} id={p.id} />
        <Link className="expert-image" to={`/experts/${p.id}`}>
          <Picture src={p.coverUrl} alt={`${p.displayName}의 대표 작업물`} />
        </Link>
        <div className="expert-info">
          <Link className="expert-title" to={`/experts/${p.id}`}>
            <Picture avatar src={p.avatarUrl} />
            <h3>{p.displayName}</h3>
          </Link>
          <Verified value={p.schoolVerified} />
          <b className="specialty">{p.headline}</b>
          <p>{p.bio}</p>
          <div className="expert-stats">
            <span>
              {p.reviewCount > 0 && p.rating !== null
                ? `★ ${p.rating.toFixed(1)} · 후기 ${p.reviewCount}개`
                : "아직 받은 후기가 없어요"}
            </span>
            <span>완료 작업 {p.providerCompletedCount}건</span>
            <span className="badge">
              {p.availability === "AVAILABLE" ? "의뢰 가능" : "의뢰 중"}
            </span>
          </div>
          {!compact && (
            <div className="expert-bottom">
              <Link className="btn primary small-btn" to={`/experts/${p.id}`}>
                프로필 보기 →
              </Link>
            </div>
          )}
        </div>
      </article>
    );
  return (
    <article className={`project-card ${compact ? "compact" : "list-card"}`}>
      <CardSave type={type} id={p.id} />
      {!compact && (
        <Link className="project-image" to={`/projects/${p.id}`}>
          {p.attachments?.some((a) => a.mime?.startsWith("image/")) ? (
            <Picture
              src={`/api/v1/media/${p.attachments.find((a) => a.mime?.startsWith("image/")).mediaId}/preview`}
              alt={p.title}
            />
          ) : (
            <span className="category-placeholder">
              <span>✦</span>
              <small>{status(p.status)}</small>
            </span>
          )}
        </Link>
      )}
      <div className="project-info">
        <span className="badge">{status(p.status)}</span>
        <Link to={`/projects/${p.id}`}>
          <h3>{p.title || "작성 중인 의뢰"}</h3>
        </Link>
        <p>{p.summary}</p>
      </div>
      <div className="project-side">
        <div className="project-numbers">
          <strong>{budget(p)}</strong>
          <span>{p.days || "미정"}일</span>
        </div>
        <small>{p.closesAt ? `모집 마감 ${date(p.closesAt)}` : ""}</small>
        <div className="project-owner">
          <span>
            {p.owner?.displayName || "작성자 정보 없음"}{" "}
            <Verified value={p.owner?.schoolVerified} />
          </span>
          <Link className="btn soft small-btn" to={`/projects/${p.id}`}>
            의뢰 보기 →
          </Link>
        </div>
      </div>
    </article>
  );
}
function CardSave({ type, id }) {
  const { user } = useSession(),
    nav = useNavigate(),
    q = useQuery(user ? "/me/viewer-state" : null, {
      method: "POST",
      body: { targets: [{ type, id }] },
    }),
    command = useCommand(q.reload),
    saved = q.data?.[0]?.isSaved;
  return (
    <div className="card-save">
      <button
        className={`icon-button save ${saved ? "saved" : ""}`}
        aria-label={saved ? "저장 취소" : "관심 목록에 저장"}
        aria-pressed={!!saved}
        disabled={command.busy || (!!user && q.loading)}
        onClick={() =>
          user
            ? command.run(
                `/me/favorites/${type}/${id}`,
                {},
                saved ? "DELETE" : "PUT",
              )
            : nav(
                `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
              )
        }
      >
        <Heart size={20} fill={saved ? "currentColor" : "none"} />
      </button>
      <ErrorMessage error={command.error || q.error} />
    </div>
  );
}
export function Pagination({ meta, page, setPage }) {
  return (
    <nav className="pagination" aria-label="페이지">
      {page > 1 && <button onClick={() => setPage(page - 1)}>이전</button>}
      {meta.total > 0 && (
        <span>
          {page} / {Math.ceil(meta.total / meta.pageSize)}
        </span>
      )}
      {page * meta.pageSize < meta.total && (
        <button onClick={() => setPage(page + 1)}>다음</button>
      )}
    </nav>
  );
}
export function ReviewList({ items = [] }) {
  return items.length ? (
    <div className="review-grid">
      {items.map((r, i) => (
        <article className="review-card" key={r.id || i}>
          <p aria-label={`5점 만점 ${r.rating}점`}>
            {"★".repeat(r.rating)}
            {"☆".repeat(5 - r.rating)}
          </p>
          <p>{r.body}</p>
          <small>{date(r.createdAt)}</small>
        </article>
      ))}
    </div>
  ) : (
    <Empty>아직 받은 후기가 없어요.</Empty>
  );
}
export function Download({ id, children }) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="btn outline"
        type="button"
        onClick={async () => {
          try {
            const { data } = await api(`/media/${id}/download`);
            window.location.assign(data.url);
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        {children || "파일 다운로드"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
