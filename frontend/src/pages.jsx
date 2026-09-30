import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  Star,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  FileText,
  CalendarDays,
  Wallet,
  Users,
  Globe,
  Link2,
  Plus,
  Send,
  MessageCircle,
  Heart,
  FolderOpen,
} from "lucide-react";
import { asset, experts, portfolios, reviews } from "./data";
import { budgetLabel, deadlineDays, filterItems } from "./lib";
import { useApp } from "./store";
import {
  Avatar,
  Verified,
  Tags,
  SaveButton,
  SearchBox,
  SectionHeading,
  CategoryBar,
  PortfolioCard,
  ExpertCard,
  ProjectCard,
  Breadcrumb,
  Filters,
  AppliedFilters,
  ExploreSidebar,
  EmptyState,
  Modal,
} from "./components";

export function HomePage() {
  const { projects } = useApp();
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">BAEKSEOK UNIVERSITY · GIG STARTUP</span>
            <h1>
              같은 학교의
              <br />
              <em>실력 있는 사람</em>에게
              <br />
              필요한 일을 맡겨보세요.
            </h1>
            <p>
              백석대학교 구성원이 만드는 특별한 연결.
              <br />
              지금, 캠퍼스 안에서 나의 동료를 만나보세요.
            </p>
            <div className="hero-note">
              <span />
              <span>우리의 재능이, 새로운 가능성이 되는 곳</span>
            </div>
          </div>
          <div className="hero-art">
            <img
              src={asset("home/hero-collage")}
              alt="노트북으로 작업하는 학생과 백석대학교 캠퍼스"
              fetchPriority="high"
            />
            <div className="hero-sticker">
              <Sparkles size={16} />
              함께 만드는 더 큰 가능성
            </div>
          </div>
        </div>
      </section>
      <div className="container home-content">
        <div className="home-search">
          <SearchBox large placeholder="어떤 프로젝트를 함께하고 싶으신가요?" />
          <div className="popular-keywords">
            <span>인기 검색어</span>
            {[
              "로고 디자인",
              "영상 편집",
              "앱 개발",
              "영문 번역",
              "PPT",
              "행사 기획",
            ].map((t) => (
              <Link key={t} to={`/search?q=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </div>
        </div>
        <CategoryBar />
        <section className="home-section">
          <SectionHeading
            eyebrow="MADE ON CAMPUS"
            title="지금 눈에 띄는 작업물"
            description="우리 학교의 재능, 결과물로 먼저 만나보세요."
            to="/works"
          />
          <div className="portfolio-grid">
            {portfolios.slice(0, 4).map((w) => (
              <PortfolioCard key={w.id} work={w} />
            ))}
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            title="이런 전문가가 있어요"
            description="함께하면 더 좋은 결과를 만들 수 있어요."
            to="/experts"
          />
          <div className="expert-grid">
            {experts.map((e) => (
              <ExpertCard expert={e} compact key={e.id} />
            ))}
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            title="새로 올라온 의뢰"
            description="나의 재능을 발휘할 다음 프로젝트를 찾아보세요."
            to="/projects"
          />
          <div className="compact-project-grid">
            {projects
              .filter((p) => p.status === "OPEN")
              .slice(0, 4)
              .map((p) => (
                <ProjectCard project={p} compact key={p.id} />
              ))}
          </div>
        </section>
        <section className="promo">
          <div>
            <span className="eyebrow">YOUR TALENT, OUR NEXT CHAPTER</span>
            <h2>
              백석의 재능이
              <br />
              <em>프로젝트</em>가 됩니다.
            </h2>
            <p>
              작은 아이디어도, 특별한 재능도.
              <br />
              긱창업에서 더 큰 가능성을 만나보세요.
            </p>
            <Link to="/experts" className="btn primary">
              나의 동료 찾기
              <ArrowRight size={17} />
            </Link>
          </div>
          <img
            src={asset("home/promo-collage")}
            alt="함께 프로젝트를 만드는 백석대학교 학생들"
            loading="lazy"
          />
        </section>
        <section className="home-section reviews-section">
          <div className="center-heading">
            <span className="eyebrow">BETTER TOGETHER</span>
            <h2>함께해서 더 좋았던 순간들</h2>
            <p>작은 의뢰에서 시작된, 우리 학교의 새로운 연결</p>
          </div>
          <div className="review-grid">
            {reviews.map((r, i) => (
              <article className="review-card" key={r.name}>
                <div className="review-person">
                  <Avatar review n={i + 1} />
                  <span>
                    <b>{r.name}</b>
                    <small>{r.department}</small>
                  </span>
                  <span className="review-check">
                    <Check size={12} />
                    완료 작업
                  </span>
                </div>
                <div className="stars">★★★★★</div>
                <p>“{r.text}”</p>
                <small>{r.work}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function ExplorePage({ type = "projects", global = false }) {
  const { projects } = useApp();
  const [params, setParams] = useSearchParams();
  const selected = global ? params.get("tab") || "projects" : type;
  const safeType = ["projects", "experts", "works"].includes(selected)
    ? selected
    : "projects";
  const list =
    safeType === "projects"
      ? projects
      : safeType === "experts"
        ? experts
        : portfolios;
  const results = filterItems(list, params, safeType);
  const pageSize = 6;
  const page = Math.max(
    1,
    Math.min(
      Number(params.get("page")) || 1,
      Math.ceil(results.length / pageSize) || 1,
    ),
  );
  const noun =
    safeType === "projects"
      ? "프로젝트"
      : safeType === "experts"
        ? "전문가"
        : "작업물";
  const sorting =
    safeType === "projects"
      ? [
          ["", "최신순"],
          ["deadline", "마감 임박순"],
          ["budget", "높은 예산순"],
        ]
      : safeType === "experts"
        ? [
            ["", "추천순"],
            ["reviews", "리뷰 많은순"],
            ["rating", "평점 높은순"],
            ["completed", "완료 작업 많은순"],
          ]
        : [
            ["", "최신순"],
            ["popular", "인기순"],
          ];
  return (
    <>
      <section className="explore-top">
        <div className="container">
          <Breadcrumb
            items={[{ label: global ? "통합 검색" : noun + " 찾기" }]}
          />
          <div className="page-heading">
            <h1>
              {global ? (
                <>‘{params.get("q") || "전체"}’ 검색 결과</>
              ) : safeType === "works" ? (
                <>
                  우리의 가능성이 담긴 <em>작업물</em>
                </>
              ) : (
                <>
                  지금, 함께할 <em>{noun}</em>를 찾아보세요
                </>
              )}
            </h1>
            <p>
              {safeType === "projects"
                ? "백석대학교 구성원의 다양한 프로젝트가 기다리고 있어요."
                : safeType === "experts"
                  ? "각자의 재능으로 더 좋은 내일을 만드는 동료들을 만나보세요."
                  : "마음에 드는 작업물에서, 함께할 동료를 발견해 보세요."}
            </p>
          </div>
          {global && (
            <div className="tabs">
              {[
                ["projects", "프로젝트"],
                ["experts", "전문가"],
                ["works", "작업물"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={safeType === key ? "active" : ""}
                  onClick={() => {
                    const next = new URLSearchParams();
                    next.set("q", params.get("q") || "");
                    next.set("tab", key);
                    setParams(next);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="mobile-explore-search">
            <SearchBox />
          </div>
          <Filters type={safeType} />
        </div>
      </section>
      <div
        className={`container explore-layout ${safeType === "works" ? "no-sidebar" : ""}`}
      >
        <div className="results">
          <div className="results-toolbar">
            <h2>
              {noun} <em>{results.length}</em>
              <span>{safeType === "experts" ? "명" : "건"}</span>
            </h2>
            <AppliedFilters />
            <select
              aria-label="결과 정렬"
              value={params.get("sort") || ""}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                next.set("sort", e.target.value);
                next.delete("page");
                setParams(next);
              }}
            >
              {sorting.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {results.length ? (
            <div
              className={
                safeType === "works" ? "portfolio-grid" : "result-list"
              }
            >
              {results
                .slice((page - 1) * pageSize, page * pageSize)
                .map((p) =>
                  safeType === "projects" ? (
                    <ProjectCard project={p} key={p.id} />
                  ) : safeType === "experts" ? (
                    <ExpertCard expert={p} key={p.id} />
                  ) : (
                    <PortfolioCard work={p} key={p.id} />
                  ),
                )}
            </div>
          ) : (
            <EmptyState onReset={() => setParams({})} />
          )}
          <div className="pagination">
            {Array.from(
              { length: Math.ceil(results.length / pageSize) },
              (_, i) => (
                <button
                  aria-label={`${i + 1}페이지`}
                  aria-current={page === i + 1 ? "page" : undefined}
                  className={page === i + 1 ? "active" : ""}
                  key={i}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set("page", String(i + 1));
                    setParams(next);
                    window.scrollTo({ top: 200, behavior: "smooth" });
                  }}
                >
                  {i + 1}
                </button>
              ),
            )}
          </div>
          <p className="results-footnote">
            <ShieldCheck size={14} />
            같은 학교에서 시작하는, 새로운 가능성
          </p>
        </div>
        {safeType !== "works" && <ExploreSidebar type={safeType} />}
      </div>
    </>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const { projects, remember, proposals, setProjects, notify } = useApp();
  const p = projects.find((x) => x.id === id);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (p) remember("projects", id);
  }, [id]);
  if (!p) return <NotFound />;
  const mine = p.ownerId === "me";
  const applied = proposals.some((x) => x.projectId === id);
  const closed =
    p.status !== "OPEN" || new Date(p.deadline + "T23:59:59") < new Date();
  return (
    <div className="container detail-page">
      <Breadcrumb
        items={[
          { label: "일 찾기", to: "/projects" },
          { label: "프로젝트 상세" },
        ]}
      />
      <div className="detail-layout">
        <article className="detail-body">
          <div className="detail-title">
            <div className="inline">
              <span className="badge">{p.category}</span>
              <span className="muted small">{p.service}</span>
              <span className={`status ${closed ? "" : "green"}`}>
                {closed ? "모집 마감" : "모집 중"}
              </span>
            </div>
            <h1>{p.title}</h1>
            <p>{p.summary}</p>
            <div className="inline">
              <Verified />
              <span className="muted small">
                {p.owner} · {new Date(p.createdAt).toLocaleDateString("ko-KR")}{" "}
                등록
              </span>
            </div>
            <Tags tags={p.tags} />
          </div>
          <section>
            <h2>한눈에 보는 프로젝트</h2>
            <div className="project-facts">
              {[
                [Wallet, "예산", budgetLabel(p)],
                [CalendarDays, "작업 기간", `${p.days}일`],
                [
                  ClockIcon,
                  "모집 마감",
                  closed ? "마감" : `D-${deadlineDays(p.deadline)}`,
                ],
                [Users, "지원자", `${p.applicants || 0}명`],
                [Globe, "진행 방식", p.mode],
              ].map(([Icon, label, value]) => (
                <div key={label}>
                  <Icon size={19} />
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2>프로젝트 내용</h2>
            <p className="preserve">{p.content || p.summary}</p>
          </section>
          <section>
            <h2>원하는 결과물</h2>
            <div className="deliverables">
              {(p.deliverables || "협의된 최종 결과물")
                .split("\n")
                .filter(Boolean)
                .map((t, i) => (
                  <p key={i}>
                    <Check size={18} />
                    {t}
                  </p>
                ))}
            </div>
          </section>
          {p.requirements && (
            <section>
              <h2>작업 요청사항</h2>
              <p className="preserve">{p.requirements}</p>
            </section>
          )}
          <section>
            <h2>필요한 기술 및 도구</h2>
            <Tags tags={p.tags} />
          </section>
          <section>
            <h2>일정 안내</h2>
            <div className="info-rows">
              <p>
                <span>모집 마감</span>
                <b>{p.deadline}</b>
              </p>
              <p>
                <span>작업 기간</span>
                <b>시작일로부터 {p.days}일</b>
              </p>
              <p>
                <span>진행 방식</span>
                <b>{p.mode}</b>
              </p>
            </div>
          </section>
          {p.reference && (
            <section>
              <h2>참고자료</h2>
              <a
                className="attachment"
                href={p.reference}
                target="_blank"
                rel="noreferrer"
              >
                <Link2 size={18} />
                참고 링크 열기
                <ArrowRight size={16} />
              </a>
            </section>
          )}
          <section>
            <h2>의뢰자 정보</h2>
            <div className="requester">
              <span className="initial-avatar">{p.owner.slice(0, 1)}</span>
              <div>
                <h3>{p.owner}</h3>
                <Verified />
              </div>
            </div>
          </section>
        </article>
        <aside className="detail-aside">
          <div className="sticky-card">
            <div className="inline between">
              <span className={`status ${closed ? "" : "green"}`}>
                {closed ? "모집 마감" : "모집 중"}
              </span>
              <span className="muted small">{p.deadline}</span>
            </div>
            <p className="muted small">프로젝트 예산</p>
            <strong className="big-price">{budgetLabel(p)}</strong>
            <p className="muted small">예상 작업 기간 {p.days}일</p>
            {mine ? (
              <>
                <Link to="/my" className="btn primary">
                  내 의뢰 관리
                  <ArrowRight size={16} />
                </Link>
                {!closed && (
                  <button
                    className="btn outline"
                    onClick={() => setClosing(true)}
                  >
                    모집 마감하기
                  </button>
                )}
              </>
            ) : applied ? (
              <>
                <button className="btn soft" disabled>
                  <Check size={17} />
                  지원 완료
                </button>
                <Link className="btn outline" to="/my">
                  내 지원 내용 보기
                </Link>
              </>
            ) : closed ? (
              <button disabled className="btn outline">
                모집이 마감되었습니다
              </button>
            ) : (
              <Link className="btn primary" to={`/projects/${id}/apply`}>
                이 프로젝트 지원하기
                <ArrowRight size={16} />
              </Link>
            )}
            <div className="save-row">
              <SaveButton id={id} />
              <span>관심 프로젝트 저장</span>
            </div>
            <div className="aside-note">
              <ShieldCheck size={17} />
              <span>
                프로필과 대표작으로
                <br />
                나의 가능성을 보여주세요.
              </span>
            </div>
          </div>
        </aside>
      </div>
      <div className="mobile-detail-action">
        <div>
          <small>프로젝트 예산</small>
          <b>{budgetLabel(p)}</b>
        </div>
        {mine ? (
          <Link className="btn primary" to="/my">
            내 의뢰 관리
          </Link>
        ) : applied || closed ? (
          <button className="btn soft" disabled>
            {applied ? "지원 완료" : "모집 마감"}
          </button>
        ) : (
          <Link className="btn primary" to={`/projects/${id}/apply`}>
            지원하기
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {closing && (
        <Modal
          title="프로젝트 모집을 마감할까요?"
          onClose={() => setClosing(false)}
        >
          <p>마감 후에는 새로운 지원을 받을 수 없습니다.</p>
          <div className="form-actions">
            <button className="btn outline" onClick={() => setClosing(false)}>
              취소
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setProjects((all) =>
                  all.map((x) =>
                    x.id === id ? { ...x, status: "CLOSED" } : x,
                  ),
                );
                setClosing(false);
                notify("모집을 마감했어요.");
              }}
            >
              모집 마감
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
const ClockIcon = CalendarDays;

export function ExpertDetail() {
  const { id } = useParams();
  const { remember, notify } = useApp();
  const e = experts.find((x) => x.id === id);
  const [tab, setTab] = useState("작업물");
  useEffect(() => {
    if (e) remember("experts", id);
  }, [id]);
  if (!e) return <NotFound />;
  const works = portfolios.filter((p) => p.expertId === id);
  return (
    <div className="container detail-page">
      <Breadcrumb
        items={[{ label: "전문가 찾기", to: "/experts" }, { label: e.name }]}
      />
      <div className="profile-cover">
        <div className="profile-identity">
          <Avatar n={e.avatar} />
          <div>
            <div className="inline">
              <h1>{e.name}</h1>
              <Verified />
            </div>
            <h3>{e.specialty}</h3>
            <p>{e.description}</p>
            <Tags tags={e.tags} />
          </div>
        </div>
        <div className="profile-summary">
          <span className={`status ${e.available ? "green" : ""}`}>
            {e.available ? "현재 의뢰 가능" : "현재 작업 중"}
          </span>
          <span>
            <Star size={16} fill="currentColor" />
            {e.rating} ({e.reviews}개의 후기)
          </span>
          <span>완료한 작업 {e.completed}건</span>
        </div>
      </div>
      <div className="detail-layout">
        <article className="detail-body profile-body">
          <section>
            <SectionHeading
              title="대표 작업"
              description="결과물로 만나는 나의 이야기"
            />
            <div className="portfolio-grid profile-works">
              {works.slice(0, 3).map((w) => (
                <PortfolioCard key={w.id} work={w} />
              ))}
            </div>
          </section>
          <div className="tabs">
            {["작업물", "소개", "경력·기술", "후기"].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <section>
            {tab === "작업물" ? (
              <>
                <h2>제공 가능한 작업</h2>
                <div className="service-grid">
                  {e.tags.map((t) => (
                    <div className="service-card" key={t}>
                      <span className="badge">{e.category}</span>
                      <h3>{t}</h3>
                      <p>기획부터 최종 결과물까지 함께해요.</p>
                      <span className="muted small">기간·금액 협의</span>
                      <Link to={`/request/new?expert=${e.id}`}>
                        이 작업 의뢰하기 <ArrowRight size={15} />
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            ) : tab === "소개" ? (
              <>
                <h2>안녕하세요, {e.name}입니다.</h2>
                <p>{e.description}</p>
                <p>
                  좋은 결과는 충분한 대화에서 시작한다고 믿어요. 프로젝트의
                  목적을 함께 고민하고, 세심하게 완성해 나갑니다.
                </p>
              </>
            ) : tab === "경력·기술" ? (
              <>
                <h2>경력과 활동</h2>
                <div className="timeline">
                  <b>2026</b>
                  <p>
                    백석대학교 교내 프로젝트 참여
                    <br />
                    <small className="muted">
                      {e.specialty} · 기획 및 제작
                    </small>
                  </p>
                </div>
                <h2>주요 기술</h2>
                <Tags tags={e.tags} />
              </>
            ) : (
              <>
                <h2>함께한 사람들의 이야기</h2>
                <div className="review-card">
                  <div className="stars">★★★★★</div>
                  <p>
                    “요청한 내용을 잘 이해하고 꼼꼼하게 작업해 주셨어요.
                    다음에도 함께하고 싶습니다.”
                  </p>
                  <small className="muted">완료 프로젝트 기반 예시 후기</small>
                </div>
              </>
            )}
          </section>
        </article>
        <aside className="detail-aside">
          <div className="sticky-card">
            <span className="eyebrow">LET'S WORK TOGETHER</span>
            <h2>
              함께 만들 준비,
              <br />
              되셨나요?
            </h2>
            <p className="muted">평균 {e.response}시간 내 응답</p>
            <Link className="btn primary" to={`/request/new?expert=${id}`}>
              이 전문가에게 의뢰하기
              <ArrowRight size={16} />
            </Link>
            <button
              className="btn outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  notify("프로필 링크를 복사했어요.");
                } catch {
                  notify("주소창의 링크를 복사해 주세요.");
                }
              }}
            >
              <Link2 size={17} />
              프로필 공유
            </button>
            <div className="save-row">
              <SaveButton id={id} />
              <span>관심 전문가 저장</span>
            </div>
            <div className="aside-note">
              <GraduationCap size={19} />
              <span>백석대학교 인증 전문가</span>
            </div>
          </div>
        </aside>
      </div>
      <div className="mobile-detail-action">
        <div>
          <small>{e.specialty}</small>
          <b>{e.name}</b>
        </div>
        <Link className="btn primary" to={`/request/new?expert=${id}`}>
          의뢰하기
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

export function WorkDetail() {
  const { id } = useParams();
  const w = portfolios.find((x) => x.id === id);
  if (!w) return <NotFound />;
  const e = experts.find((x) => x.id === w.expertId);
  return (
    <div className="container work-detail detail-page">
      <Breadcrumb
        items={[{ label: "작업물 둘러보기", to: "/works" }, { label: w.title }]}
      />
      <div className="work-detail-heading">
        <div>
          <span className="badge">{w.category}</span>
          <h1>{w.title}</h1>
          <Link className="inline" to={`/experts/${e.id}`}>
            <Avatar n={e.avatar} />
            <b>{e.name}</b>
            <Verified />
          </Link>
        </div>
        <SaveButton id={id} />
      </div>
      <img
        className="work-hero"
        src={asset(`portfolio/${w.image}`)}
        alt={w.title}
      />
      <div className="work-description">
        <div>
          <span className="eyebrow">ABOUT THE PROJECT</span>
          <h2>작업 이야기</h2>
          <p>{w.description}</p>
          <h3>이 프로젝트에서 한 일</h3>
          <p>
            프로젝트의 목적과 사용자 경험을 바탕으로 방향을 정하고,
            <br />
            기획부터 최종 결과물 제작까지 직접 진행했습니다.
          </p>
          <Tags tags={w.tags} />
          {w.verified && (
            <div className="verification-panel">
              <ShieldCheck size={24} />
              <div>
                <b>긱창업에서 함께 완성한 작업</b>
                <p>프로젝트 완료와 결과물 공개를 확인한 예시 작업입니다.</p>
              </div>
            </div>
          )}
        </div>
        <div className="work-author">
          <Avatar n={e.avatar} />
          <h3>{e.name}</h3>
          <p>{e.specialty}</p>
          <Link className="btn primary" to={`/request/new?expert=${e.id}`}>
            비슷한 작업 의뢰하기
            <ArrowRight size={16} />
          </Link>
          <Link className="more-link" to={`/experts/${e.id}`}>
            프로필 보기
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SavedPage() {
  const { saved, projects } = useApp();
  const items = [
    ...projects
      .filter((p) => saved.includes(p.id))
      .map((p) => <ProjectCard key={p.id} project={p} />),
    ...experts
      .filter((e) => saved.includes(e.id))
      .map((e) => <ExpertCard key={e.id} expert={e} />),
  ];
  const works = portfolios.filter((w) => saved.includes(w.id));
  return (
    <div className="container simple-page">
      <Breadcrumb items={[{ label: "찜한 목록" }]} />
      <div className="page-heading">
        <h1>
          다시 만나고 싶은 <em>가능성</em>
        </h1>
        <p>관심 있는 프로젝트와 전문가, 작업물을 모았어요.</p>
      </div>
      {!saved.length ? (
        <EmptyState
          title="아직 저장한 항목이 없어요"
          description="마음에 드는 카드의 하트를 눌러 나만의 목록을 만들어보세요."
        />
      ) : (
        <>
          <div className="result-list">{items}</div>
          {works.length > 0 && (
            <section className="home-section">
              <h2>저장한 작업물</h2>
              <div className="portfolio-grid">
                {works.map((w) => (
                  <PortfolioCard key={w.id} work={w} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function MyPage() {
  const { projects, proposals, requests, user } = useApp();
  const [tab, setTab] = useState("내 의뢰");
  const mine = projects.filter((x) => x.ownerId === "me");
  return (
    <div className="container simple-page">
      <Breadcrumb items={[{ label: "마이페이지" }]} />
      <div className="page-heading">
        <span className="eyebrow">MY CAMPUS, MY POSSIBILITIES</span>
        <h1>
          반가워요, {user?.name || "방문자"}님 <span className="wave">✳</span>
        </h1>
        <p>오늘도 나의 재능으로 새로운 연결을 만들어 보세요.</p>
        {!user && <Link className="btn primary" to="/login?next=/my">로그인 / 회원가입</Link>}
        <p className="muted small">아래 활동은 계정별로 분리되지 않는 공용 데모 데이터입니다.</p>
      </div>
      <div className="dashboard-stats">
        {[
          ["내 의뢰", mine.length],
          ["내 지원", proposals.length],
          ["보낸 지정 요청", requests.length],
        ].map(([label, value]) => (
          <button key={label} onClick={() => setTab(label)}>
            <span>
              {label}
              <ChevronRight size={16} />
            </span>
            <b>
              {value}
              <small>건</small>
            </b>
          </button>
        ))}
      </div>
      <div className="dashboard-banner">
        <div>
          <b>함께하는 프로젝트가 있다면</b>
          <p>채팅, 계약, 파일을 워크룸 한곳에서 관리해요.</p>
        </div>
        <Link className="btn outline" to="/workroom">
          워크룸 둘러보기
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="tabs">
        {["내 의뢰", "내 지원", "보낸 지정 요청"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="result-list">
        {tab === "내 의뢰" ? (
          mine.length ? (
            mine.map((p) => <ProjectCard key={p.id} project={p} />)
          ) : (
            <EmptyState
              title="첫 번째 프로젝트를 시작해 보세요"
              description="상단의 의뢰 등록 버튼으로 필요한 일을 등록할 수 있어요."
            />
          )
        ) : tab === "내 지원" ? (
          proposals.length ? (
            proposals.map((p) => (
              <div className="activity-card" key={p.id}>
                <div className="inline between">
                  <h3>{projects.find((x) => x.id === p.projectId)?.title}</h3>
                  <span className="status green">지원 완료</span>
                </div>
                <p className="preserve">{p.message}</p>
                <b>
                  {Number(p.budget).toLocaleString()}원 · {p.days}일
                </b>
                <p className="muted small">
                  대표 작업물 {p.works.length}개 첨부
                </p>
                <Link className="more-link" to={`/projects/${p.projectId}`}>
                  프로젝트 보기
                  <ArrowRight size={15} />
                </Link>
              </div>
            ))
          ) : (
            <EmptyState
              title="아직 지원한 프로젝트가 없어요"
              description="일 찾기에서 나에게 맞는 프로젝트를 만나보세요."
            />
          )
        ) : requests.length ? (
          requests.map((r) => (
            <div className="activity-card" key={r.id}>
              <div className="inline between">
                <h3>{r.title}</h3>
                <span className="status">응답 대기</span>
              </div>
              <p>
                {experts.find((e) => e.id === r.expertId)?.name}님에게 보낸 요청
              </p>
              <p>{r.content}</p>
              <b>
                {budgetLabel(r)} · {r.days}일
              </b>
            </div>
          ))
        ) : (
          <EmptyState
            title="아직 보낸 지정 요청이 없어요"
            description="전문가의 프로필에서 직접 의뢰를 보낼 수 있어요."
          />
        )}
      </div>
    </div>
  );
}

export function GuidePage() {
  return (
    <div className="container simple-page guide">
      <Breadcrumb items={[{ label: "이용안내" }]} />
      <div className="center-heading">
        <span className="eyebrow">LET'S START SOMETHING GOOD</span>
        <h1>
          작은 재능에서 시작되는
          <br />
          <em>우리의 다음 프로젝트</em>
        </h1>
        <p>
          의뢰하는 사람도, 실력을 펼치는 사람도. 긱창업에서는 모두 동료입니다.
        </p>
      </div>
      <div className="guide-paths">
        <section>
          <span className="badge">일을 맡기고 싶다면</span>
          <h2>아이디어를 현실로 만들어요</h2>
          {[
            "필요한 작업을 의뢰로 등록해요.",
            "지원자의 프로필과 대표작을 확인해요.",
            "함께할 동료를 정하고 워크룸에서 진행해요.",
            "결과물을 확인하고 후기를 남겨요.",
          ].map((t, i) => (
            <p key={t}>
              <b>0{i + 1}</b>
              {t}
            </p>
          ))}
          <Link className="btn primary" to="/request/new">
            첫 의뢰 등록하기
            <ArrowRight size={17} />
          </Link>
        </section>
        <section>
          <span className="badge">나의 실력을 펼치고 싶다면</span>
          <h2>재능이 경험이 됩니다</h2>
          {[
            "나의 프로필과 대표 작업물을 준비해요.",
            "관심 있는 프로젝트에 제안을 보내요.",
            "워크룸에서 작업과 소통을 함께해요.",
            "완료한 작업을 다음 기회로 연결해요.",
          ].map((t, i) => (
            <p key={t}>
              <b>0{i + 1}</b>
              {t}
            </p>
          ))}
          <Link className="btn outline" to="/projects">
            나에게 맞는 일 찾기
            <ArrowRight size={17} />
          </Link>
        </section>
      </div>
      <section className="faq" id="faq">
        <h2>자주 묻는 질문</h2>
        {[
          [
            "누가 이용할 수 있나요?",
            "백석대학교 학생, 교수, 교직원을 위한 플랫폼입니다. 현재 화면은 기능과 디자인을 확인할 수 있는 데모이며, 실제 로그인과 학교 인증은 서버 연동 후 제공됩니다.",
          ],
          [
            "프로젝트 등록에 이미지가 꼭 필요한가요?",
            "아니요. 업무 내용, 원하는 결과물, 예산과 일정만 작성하면 읽기 좋은 의뢰 페이지가 만들어집니다.",
          ],
          [
            "의뢰자와 전문가 계정을 따로 만들어야 하나요?",
            "하나의 계정으로 의뢰도 하고 프로젝트에 지원할 수도 있습니다.",
          ],
          [
            "결제는 어떻게 진행하나요?",
            "플랫폼 내 결제 기능은 제공하지 않습니다. 금액 지급은 당사자 간 처리하며, 플랫폼에는 합의 조건과 진행 상태를 기록하는 구조입니다.",
          ],
          [
            "지금 등록한 내용은 어디에 저장되나요?",
            "이 프론트엔드 데모에서는 현재 브라우저의 로컬 저장소에 저장됩니다. 다른 사용자나 기기로 전송되지 않습니다.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <Plus size={17} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="empty not-found">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>찾으시는 페이지가 없어요</h1>
      <p>주소가 변경되었거나 존재하지 않는 항목입니다.</p>
      <Link className="btn primary" to="/">
        홈으로 돌아가기
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
