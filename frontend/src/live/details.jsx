import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Wallet, CalendarDays, Users, MapPin, Share2 } from "lucide-react";
import {
  useQuery,
  useSession,
  useCommand,
  QueryState,
  ErrorMessage,
} from "./session";
import {
  Page,
  Empty,
  Picture,
  Verified,
  Card,
  ReviewList,
  Save,
  Download,
  budget,
  status,
  date,
} from "./ui";
export function ShareButton() {
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(location.href);
            setMessage("링크를 복사했습니다.");
          } catch {
            setMessage("주소창의 링크를 복사해 주세요.");
          }
        }}
      >
        <Share2 size={16} />
        링크 공유
      </button>
      {message && <small role="status">{message}</small>}
    </>
  );
}
export function TaxonomyTags({ fields = [], skills = [] }) {
  const taxonomy = useQuery("/categories"),
    allSkills = useQuery(skills.length ? "/skills" : null);
  return (
    <div className="tags">
      {fields.map((id) => (
        <span key={id}>
          {taxonomy.data?.fields.find((f) => f.id === id)?.label || id}
        </span>
      ))}
      {skills.map((id) => (
        <span key={id}>
          #{allSkills.data?.find((s) => s.id === id)?.label || id}
        </span>
      ))}
    </div>
  );
}
export function Detail({ type }) {
  const { id } = useParams(),
    { user } = useSession(),
    nav = useNavigate(),
    q = useQuery(`/${type}/${id}`),
    viewer = useQuery(user ? "/me/viewer-state" : null, {
      method: "POST",
      body: { targets: [{ type, id }] },
    }),
    [reviewPage, setReviewPage] = useState(1);
  const reviews = useQuery(
      type === "projects"
        ? null
        : `/${type}/${id}/reviews?page=${reviewPage}&pageSize=6`,
    ),
    chat = useCommand((r) => nav(`/messages/${r.id}`)),
    p = q.data,
    state = viewer.data?.[0];
  const own = state?.isOwner,
    open = p?.status === "OPEN" && Date.parse(p.closesAt) > Date.now();
  useEffect(() => {
    if (!p) return;
    try {
      const key = `bu-live-recent:${user?.id || "guest"}`,
        old = JSON.parse(sessionStorage.getItem(key) || "[]");
      sessionStorage.setItem(
        key,
        JSON.stringify(
          [{ type, id }, ...old.filter((x) => x.id !== id)].slice(0, 12),
        ),
      );
    } catch {}
  }, [p?.id, type, id, user?.id]);
  const projectAction = () =>
    own ? (
      <Link className="btn primary" to={`/my/projects/${id}`}>
        내 의뢰 관리
      </Link>
    ) : state?.myProposal ? (
      <Link className="btn outline" to={`/my/proposals/${state.myProposal.id}`}>
        내 지원 확인
      </Link>
    ) : !open ? (
      <p>현재 지원을 받고 있지 않습니다.</p>
    ) : user && state && !state.allowedActions.includes("apply") ? (
      <Link className="btn primary" to="/my/verification">
        학교 인증 후 지원하기
      </Link>
    ) : (
      <Link className="btn primary" to={`/projects/${id}/apply`}>
        지원하기
      </Link>
    );
  return (
    <Page title={p?.title || p?.displayName || "상세 정보"}>
      <QueryState query={q}>
        {p && (
          <div className="detail-layout release-detail">
            <article className="detail-main">
              {type === "projects" ? (
                <>
                  <div className="detail-section">
                    <span className="badge">{status(p.status)}</span>
                    <p className="detail-summary">{p.summary}</p>
                    <p>
                      {p.owner?.displayName || "작성자 정보 없음"}{" "}
                      <Verified value={p.owner?.schoolVerified} />
                    </p>
                    <TaxonomyTags fields={[p.fieldId]} skills={p.skillIds} />
                  </div>
                  <section className="detail-section">
                    <h2>한눈에 보는 프로젝트</h2>
                    <div className="release-facts">
                      {[
                        [Wallet, "예산", budget(p)],
                        [CalendarDays, "작업 기간", `${p.days}일`],
                        [CalendarDays, "모집 마감", date(p.closesAt)],
                        [Users, "지원자", `${p.applicantCount}명`],
                        [
                          MapPin,
                          "진행 방식",
                          {
                            ONLINE: "온라인",
                            OFFLINE: "오프라인",
                            HYBRID: "혼합",
                          }[p.mode],
                        ],
                      ].map(([Icon, label, value]) => (
                        <div key={label}>
                          <Icon size={19} />
                          <span>{label}</span>
                          <b>{value}</b>
                        </div>
                      ))}
                    </div>
                  </section>
                  {[
                    ["프로젝트 내용", p.content],
                    ["원하는 결과물", p.deliverables],
                    ["작업 요청사항", p.requirements],
                  ]
                    .filter(([, v]) => v)
                    .map(([title, value]) => (
                      <section className="detail-section" key={title}>
                        <h2>{title}</h2>
                        <p className="preserve">{value}</p>
                      </section>
                    ))}
                  <section className="detail-section">
                    <h2>일정 안내</h2>
                    <p>모집 마감 {date(p.closesAt)}</p>
                    <p>
                      작업 기간 {p.days}일 · 구체적인 시작일은 계약 시
                      협의합니다.
                    </p>
                  </section>
                  {(p.referenceUrl || p.attachments?.length > 0) && (
                    <section className="detail-section">
                      <h2>참고자료</h2>
                      {p.referenceUrl && (
                        <a
                          href={p.referenceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          참고 링크 ↗
                        </a>
                      )}
                      {p.attachments?.map((f) => (
                        <div className="release-file" key={f.mediaId}>
                          <span>{f.name}</span>
                          <Download id={f.mediaId}>파일 확인</Download>
                        </div>
                      ))}
                    </section>
                  )}
                  <section className="detail-section">
                    <h2>의뢰자 정보</h2>
                    <Picture avatar src={p.owner?.avatarUrl} />
                    <p>
                      {p.owner?.displayName || "작성자 정보 없음"}{" "}
                      <Verified value={p.owner?.schoolVerified} />
                    </p>
                    {p.owner?.profileId && (
                      <Link to={`/experts/${p.owner.profileId}`}>
                        공개 프로필 보기 →
                      </Link>
                    )}
                  </section>
                </>
              ) : type === "experts" ? (
                <>
                  <div className="profile-overview">
                    <Picture avatar src={p.avatarUrl} />
                    <div>
                      <h2>{p.headline}</h2>
                      <Verified value={p.schoolVerified} />
                      <p>
                        {p.availability === "AVAILABLE"
                          ? "의뢰 가능"
                          : "현재 작업 중"}
                      </p>
                      <TaxonomyTags fields={p.fields} skills={p.skills} />
                    </div>
                  </div>
                  <section className="detail-section">
                    <h2>대표 작업</h2>
                    {p.featuredPortfolios?.length ? (
                      <div className="portfolio-grid">
                        {p.featuredPortfolios.map((w) => (
                          <Card key={w.id} type="portfolios" item={w} />
                        ))}
                      </div>
                    ) : (
                      <Empty>아직 등록한 대표 작업이 없어요.</Empty>
                    )}
                  </section>
                  <section className="detail-section">
                    <h2>소개</h2>
                    <p className="preserve">
                      {p.bio || "상세 소개를 준비하고 있어요."}
                    </p>
                  </section>
                  {p.careers?.length > 0 && (
                    <section className="detail-section">
                      <h2>경력과 활동</h2>
                      {p.careers.map((c, i) => (
                        <article className="release-timeline" key={i}>
                          <h3>{c.title}</h3>
                          <small>
                            {c.startDate} {c.endDate && `~ ${c.endDate}`}
                          </small>
                          <p>{c.description}</p>
                        </article>
                      ))}
                    </section>
                  )}
                  {p.services?.length > 0 && (
                    <section className="detail-section">
                      <h2>제공 가능한 작업</h2>
                      <div className="live-grid">
                        {p.services.map((s, i) => (
                          <article className="live-card" key={i}>
                            <h3>{s.title}</h3>
                            <p>{s.description}</p>
                            {p.userId !== user?.id && p.schoolVerified && (
                              <Link to={`/request/new?expert=${p.id}`}>
                                이 작업 의뢰하기 →
                              </Link>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <>
                  <div className="release-gallery">
                    <Picture src={p.coverUrl} alt={p.title} />
                    {p.mediaIds?.slice(1).map((mid) => (
                      <Picture
                        key={mid}
                        src={`/api/v1/media/${mid}/preview`}
                        alt="작업 결과물"
                      />
                    ))}
                  </div>
                  <section className="detail-section">
                    <h2>작업 소개</h2>
                    <p className="preserve">{p.summary}</p>
                    <h3>담당 역할</h3>
                    <p>{p.role}</p>
                    <TaxonomyTags fields={[p.fieldId]} skills={p.skillIds} />
                    {p.verifiedWork && (
                      <p className="verified">
                        완료 거래 · 해당 버전의 공개 승인 확인
                      </p>
                    )}
                    {p.mediaIds?.map((mid) => (
                      <Download key={mid} id={mid}>
                        원본 파일 확인
                      </Download>
                    ))}
                  </section>
                </>
              )}
              {type !== "projects" && (
                <section className="detail-section">
                  <h2>실제 거래 후기</h2>
                  <QueryState query={reviews}>
                    <ReviewList items={reviews.data || []} />
                  </QueryState>
                  <div className="pagination">
                    {reviewPage > 1 && (
                      <button onClick={() => setReviewPage((n) => n - 1)}>
                        이전 후기
                      </button>
                    )}
                    {reviews.meta.total > reviewPage * 6 && (
                      <button onClick={() => setReviewPage((n) => n + 1)}>
                        다음 후기
                      </button>
                    )}
                  </div>
                </section>
              )}
            </article>
            <aside className="detail-sidebar">
              <div className="sticky-cta release-sticky">
                <span className="badge">
                  {type === "projects"
                    ? status(p.status)
                    : type === "experts"
                      ? "함께할 동료"
                      : "작업물"}
                </span>
                <h2>
                  {type === "projects"
                    ? budget(p)
                    : p.displayName ||
                      p.author?.displayName ||
                      "작성자 정보 없음"}
                </h2>
                {type === "projects" ? (
                  <>
                    {projectAction()}
                    {!own && open && (
                      <button
                        className="btn outline"
                        disabled={chat.busy}
                        onClick={() =>
                          user
                            ? chat.run("/conversations", { projectId: id })
                            : nav(`/login?next=/projects/${id}`)
                        }
                      >
                        문의하기
                      </button>
                    )}
                    <ErrorMessage error={chat.error} />
                  </>
                ) : type === "experts" ? (
                  <>
                    {own ? (
                      <Link className="btn primary" to="/my/profile">
                        프로필 관리
                      </Link>
                    ) : p.schoolVerified ? (
                      <Link
                        className="btn primary"
                        to={`/request/new?expert=${id}`}
                      >
                        이 전문가에게 의뢰하기
                      </Link>
                    ) : (
                      <p>지금은 지정 요청을 받지 않습니다.</p>
                    )}
                    <p>
                      {p.reviewCount
                        ? `★ ${p.rating.toFixed(1)} · 후기 ${p.reviewCount}개`
                        : "아직 받은 후기가 없어요"}
                    </p>
                    <small>완료 작업 {p.providerCompletedCount}건</small>
                  </>
                ) : p.author?.profileId ? (
                  <>
                    <Link
                      className="btn primary"
                      to={`/experts/${p.author.profileId}`}
                    >
                      수행자 프로필 보기
                    </Link>
                    {p.author.schoolVerified &&
                      p.author.userId !== user?.id && (
                        <Link
                          className="btn outline"
                          to={`/request/new?expert=${p.author.profileId}`}
                        >
                          이런 작업 의뢰하기
                        </Link>
                      )}
                  </>
                ) : (
                  <p>작성자의 프로필이 공개되지 않았습니다.</p>
                )}
                <Save
                  type={type}
                  id={id}
                  saved={state?.isSaved}
                  onDone={viewer.reload}
                />
                <ShareButton />
                <ErrorMessage error={viewer.error} />
              </div>
            </aside>
            {type === "projects" && (
              <div className="release-mobile-cta">
                <b>{budget(p)}</b>
                {projectAction()}
              </div>
            )}
          </div>
        )}
      </QueryState>
    </Page>
  );
}
