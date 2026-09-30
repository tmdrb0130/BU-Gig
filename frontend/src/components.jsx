import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Search,
  Bell,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  Heart,
  Eye,
  BadgeCheck,
  GraduationCap,
  LayoutGrid,
  Palette,
  Code2,
  Video,
  Megaphone,
  FileText,
  Lightbulb,
  BookOpen,
  CalendarDays,
  Ellipsis,
  Home,
  MessageCircle,
  UserRound,
  X,
  RotateCcw,
  Clock3,
  Wallet,
  MapPin,
  Star,
  Zap,
  ShieldCheck,
  Menu,
  Check,
} from "lucide-react";
import { asset, categories, experts, portfolios } from "./data";
import {
  budgetLabel,
  deadlineDays,
  parseBudgetRange,
  budgetRangeLabel,
} from "./lib";
import { useApp } from "./store";
import FieldFilter from "./FieldFilter";
import { readFields, withFields, fieldLabel } from "./lib";

export const categoryIcons = [
  LayoutGrid,
  Palette,
  Code2,
  Video,
  Megaphone,
  FileText,
  Lightbulb,
  BookOpen,
  CalendarDays,
  Ellipsis,
];
export const IconCategory = ({ category, ...props }) => {
  const Icon = categoryIcons[Math.max(0, categories.indexOf(category))];
  return <Icon {...props} />;
};
export const Verified = () => (
  <span className="verified">
    <BadgeCheck size={14} fill="currentColor" />
    <span>백석대 인증</span>
  </span>
);
export const Avatar = ({ n = 1, review = false, ...props }) => (
  <img
    className="avatar"
    src={asset(`demo/avatars/${review ? "review" : "expert"}-0${n}`)}
    alt=""
    {...props}
  />
);
export const Tags = ({ tags = [] }) => (
  <div className="tags">
    {tags.slice(0, 3).map((t) => (
      <span key={t}>#{t}</span>
    ))}
  </div>
);
export function SaveButton({ id, className = "" }) {
  const { saved, toggleSave } = useApp();
  const active = saved.includes(id);
  const [feedback, setFeedback] = useState(0);
  return (
    <button
      type="button"
      className={`icon-button save ${active ? "saved" : ""} ${className}`}
      aria-label={active ? "저장 취소" : "관심 목록에 저장"}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        toggleSave(id);
        setFeedback((value) => value + 1);
      }}
    >
      <span key={feedback} className={feedback ? "save-feedback" : "save-symbol"}>
        <Heart size={20} fill={active ? "currentColor" : "none"} />
      </span>
    </button>
  );
}
export function SearchBox({
  large = false,
  compact = false,
  placeholder = "프로젝트, 전문가, 작업물 검색",
}) {
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get("q") || "");
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const triggerRef = useRef(null);
  const [narrow, setNarrow] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = !compact || (narrow ? searchMode : hovered || focused || value.length > 0);
  useLayoutEffect(() => {
    if (!compact) return;
    const container = formRef.current.parentElement;
    const measure = () => setNarrow(window.innerWidth < 768 || container.clientWidth < 240);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [compact]);
  useEffect(() => {
    if (searchMode) inputRef.current?.focus();
  }, [searchMode]);
  const closeSearch = () => {
    setSearchMode(false);
    setHovered(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => setValue(params.get("q") || ""), [params]);
  return (
    <form
      ref={formRef}
      className={`searchbox ${large ? "large" : ""} ${compact ? "compact-search" : ""} ${compact && expanded ? "expanded" : ""} ${compact && narrow && searchMode ? "header-search-mode" : ""}`}
      role="search"
      onKeyDown={(e) => {
        if (e.key === "Escape" && narrow && searchMode) {
          e.preventDefault();
          closeSearch();
        }
      }}
      onMouseEnter={() => {
        if (matchMedia("(hover: hover)").matches) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        const base = ["/projects", "/experts", "/works"].includes(
          location.pathname,
        )
          ? location.pathname
          : "/search";
        navigate(`${base}?q=${encodeURIComponent(value.trim())}`);
        if (narrow) closeSearch();
      }}
    >
      {compact ? (
        <>
        {narrow && searchMode && (
          <button type="button" className="icon-button search-back" aria-label="검색 닫기" onClick={closeSearch}>
            <ArrowLeft size={22} />
          </button>
        )}
        <button
          ref={triggerRef}
          type="button"
          className="icon-button compact-search-trigger"
          aria-label="헤더 검색 열기"
          aria-expanded={expanded}
          onClick={() => {
            if (narrow) setSearchMode(true);
            else inputRef.current?.focus();
          }}
        >
          <Search size={20} />
        </button>
        </>
      ) : (
        <Search size={large ? 22 : 18} />
      )}
      <input
        ref={inputRef}
        enterKeyHint="search"
        tabIndex={expanded ? 0 : -1}
        aria-label="검색어"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {compact && narrow && searchMode && (
        <>
          {value && <button type="button" className="icon-button" aria-label="검색어 지우기" onClick={() => { setValue(""); inputRef.current?.focus(); }}><X size={18} /></button>}
          <button type="submit" className="search-submit">검색</button>
        </>
      )}
      {large && (
        <button className="btn primary" type="submit">
          검색하기
          <ArrowRight size={17} />
        </button>
      )}
    </form>
  );
}
export function Header() {
  const [panel, setPanel] = useState("");
  const ref = useRef();
  const location = useLocation();
  const { proposals, requests, user, logout } = useApp();
  useEffect(() => setPanel(""), [location]);
  useEffect(() => {
    const click = (e) => {
      if (!ref.current?.contains(e.target)) setPanel("");
    };
    const key = (e) => {
      if (e.key === "Escape") setPanel("");
    };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        본문으로 바로가기
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="백석대학교 긱창업 홈">
            <img src={asset("brand/logo-mark")} alt="" />
            <span>
              백석대학교 <b>긱창업</b>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="주 메뉴">
            <NavLink to="/projects">일 찾기</NavLink>
            <NavLink to="/experts">전문가 찾기</NavLink>
            <NavLink to="/works">작업물 둘러보기</NavLink>
            <NavLink to="/guide">이용안내</NavLink>
          </nav>
          <div className="header-tools" ref={ref}>
            <div className="header-search">
              <SearchBox compact />
            </div>
            <button
              className="icon-button notification-trigger"
              aria-label="알림"
              aria-expanded={panel === "notifications"}
              onClick={() =>
                setPanel(panel === "notifications" ? "" : "notifications")
              }
            >
              <Bell size={21} />
              {proposals.length + requests.length > 0 && <i />}
            </button>
            {user ? <button
              className="profile-trigger"
              aria-label="내 메뉴"
              aria-expanded={panel === "profile"}
              onClick={() => setPanel(panel === "profile" ? "" : "profile")}
            >
              <Avatar n={2} />
              <ChevronDown size={15} />
            </button> : <Link className="header-login" to="/login">로그인</Link>}
            <Link className="btn primary header-cta" to="/request/new">
              <Plus size={18} />
              <span>의뢰 등록</span>
            </Link>
            <button
              className="icon-button menu-trigger"
              aria-label="전체 메뉴"
              aria-expanded={panel === "menu"}
              onClick={() => setPanel(panel === "menu" ? "" : "menu")}
            >
              <Menu />
            </button>
            {panel && (
              <div className="header-popover">
                {panel === "notifications" ? (
                  <>
                    <h3>
                      알림{" "}
                      <span className="muted">
                        {proposals.length + requests.length}
                      </span>
                    </h3>
                    {proposals.length + requests.length === 0 ? (
                      <p className="muted">
                        아직 새 알림이 없어요.
                        <br />
                        프로젝트를 시작하면 이곳에서 알려드릴게요.
                      </p>
                    ) : (
                      <>
                        <p>
                          지원 {proposals.length}건 · 지정 요청{" "}
                          {requests.length}건이 저장되었어요.
                        </p>
                        <Link to="/my">
                          내 활동 확인하기 <ArrowRight size={15} />
                        </Link>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <strong>{user ? `안녕하세요, ${user.name}님` : "백석의 새로운 연결을 시작하세요"}</strong>
                    <span className="muted small">{user ? "데모 계정 · 학교 미인증" : "로그인하고 나의 프로젝트를 이어가세요"}</span>
                    {!user && <><Link to="/login">로그인 <ChevronRight size={16} /></Link><Link to="/signup">회원가입 <ChevronRight size={16} /></Link></>}
                    {[
                      ["/my", "마이페이지"],
                      ["/saved", "찜한 목록"],
                      ["/workroom", "프로젝트 워크룸"],
                      ...(panel === "menu"
                        ? [
                            ["/projects", "일 찾기"],
                            ["/experts", "전문가 찾기"],
                            ["/works", "작업물 둘러보기"],
                            ["/guide", "이용안내"],
                          ]
                        : []),
                    ].map(([url, label]) => (
                      <Link to={url} key={url}>
                        {label}
                        <ChevronRight size={16} />
                      </Link>
                    ))}
                    {user && <button className="btn" onClick={() => { logout(); setPanel(""); }}>로그아웃</button>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {[
          ["/", "홈", Home],
          ["/projects", "탐색", Search],
          ["/request/new", "의뢰", Plus],
          ["/workroom", "채팅", MessageCircle],
          [user ? "/my" : "/login?next=/my", "MY", UserRound],
        ].map(([url, label, Icon]) => (
          <NavLink end={url === "/"} to={url} key={url}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-main">
          <div>
            <Link className="brand" to="/">
              <img src={asset("brand/logo-mark")} alt="" />
              <span>
                백석대학교 <b>긱창업</b>
              </span>
            </Link>
            <p>
              같은 학교의 재능과 기회를 연결합니다.
              <br />
              함께 만드는 오늘이 더 빛나는 내일이 됩니다.
            </p>
            <span className="footer-hashtag">
              #백석대학교　#캠퍼스메이트　#함께하는성장
            </span>
          </div>
          <div className="footer-links">
            <div>
              <b>프로젝트</b>
              <Link to="/projects">일 찾기</Link>
              <Link to="/request/new">의뢰 등록</Link>
              <Link to="/my">내 프로젝트</Link>
            </div>
            <div>
              <b>둘러보기</b>
              <Link to="/experts">전문가 찾기</Link>
              <Link to="/works">작업물 둘러보기</Link>
              <Link to="/saved">찜한 목록</Link>
            </div>
            <div>
              <b>이용안내</b>
              <Link to="/guide">시작 가이드</Link>
              <Link to="/guide#faq">자주 묻는 질문</Link>
              <Link to="/workroom">워크룸 안내</Link>
            </div>
          </div>
          <img
            className="footer-illustration"
            src={asset("brand/footer-campus-illustration")}
            alt="백석대학교 캠퍼스 일러스트"
            loading="lazy"
          />
        </div>
        <div className="trust-strip">
          <span>
            <GraduationCap />
            <b>백석대학교 구성원 연결</b>
            <small>우리 학교에서 만나는 든든한 동료</small>
          </span>
          <span>
            <ShieldCheck />
            <b>함께 만드는 프로젝트</b>
            <small>의뢰부터 완료까지 한곳에서</small>
          </span>
          <span>
            <FileText />
            <b>포트폴리오 중심 매칭</b>
            <small>실제 결과물로 보여주는 나의 가능성</small>
          </span>
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 백석대학교 긱창업.{" "}
            <span className="demo-note">
              화면의 인물·프로젝트·후기는 시연용 데이터입니다.
            </span>
          </span>
          <button
            className="text-button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            맨 위로 <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
export function Breadcrumb({ items = [] }) {
  return (
    <nav className="breadcrumb" aria-label="현재 위치">
      <Link to="/" aria-label="홈">
        <Home size={15} />
      </Link>
      {items.map((item, i) => (
        <span key={i}>
          <ChevronRight size={13} />
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  to,
  label = "전체보기",
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <div className="heading-line">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {to && (
        <Link className="more-link" to={to}>
          {label}
          <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function CategoryBar() {
  return (
    <div className="categories">
      {categories.map((c, i) => {
        const Icon = categoryIcons[i];
        return (
          <Link
            key={c}
            to={i ? `/projects?category=${encodeURIComponent(c)}` : "/projects"}
          >
            <span>
              <Icon size={23} strokeWidth={1.6} />
            </span>
            <b>{c}</b>
          </Link>
        );
      })}
    </div>
  );
}
export function PortfolioCard({ work }) {
  const expert = experts.find((e) => e.id === work.expertId);
  return (
    <article className="portfolio-card">
      <div className="portfolio-image">
        <Link to={`/works/${work.id}`}>
          <img
            src={asset(`portfolio/${work.image}`)}
            alt={work.title}
            loading="lazy"
          />
        </Link>
        <span className="image-label">{work.category}</span>
        <SaveButton id={work.id} />
        {work.category === "영상·사진" && (
          <span className="play-icon" aria-label="영상 작업물">
            ▷
          </span>
        )}
      </div>
      <div className="portfolio-info">
        <Link to={`/works/${work.id}`}>
          <h3>{work.title}</h3>
        </Link>
        <p>{work.description}</p>
        <div className="portfolio-meta">
          <Link to={`/experts/${expert.id}`}>
            <Avatar n={expert.avatar} />
            {expert.name}
          </Link>
          <span>
            <Heart size={13} />
            {work.likes}
            <Eye size={14} />
            {work.views}
          </span>
        </div>
      </div>
    </article>
  );
}
export function ExpertCard({ expert: e, compact = false }) {
  return (
    <article className={`expert-card ${compact ? "compact" : "list-card"}`}>
      <Link className="expert-image" to={`/experts/${e.id}`}>
        <img
          src={asset(`portfolio/${compact ? e.homeImage : e.image}`)}
          alt={`${e.name}의 대표 작업물`}
          loading="lazy"
        />
      </Link>
      <div className="expert-info">
        {!compact && <span className="badge">{e.category}</span>}
        <Link className="expert-title" to={`/experts/${e.id}`}>
          {compact && <Avatar n={e.avatar} />}
          <h3>{e.name}</h3>
          {compact ? <Verified /> : <span>{e.specialty}</span>}
        </Link>
        {compact && <b className="specialty">{e.specialty}</b>}
        <p>{e.description}</p>
        <Tags tags={e.tags} />
        <div className="expert-stats">
          <span>
            <Star size={14} fill="currentColor" />
            <b>{e.rating}</b> ({e.reviews})
          </span>
          <span>작업 {e.completed}건</span>
          {!compact && (
            <span>
              <Zap size={14} />
              평균 {e.response}시간 내 응답
            </span>
          )}
          {!compact && <Verified />}
        </div>
        {!compact && (
          <div className="expert-bottom">
            <Link to={`/experts/${e.id}`} className="btn primary small-btn">
              프로필 보기
              <ChevronRight size={15} />
            </Link>
          </div>
        )}
      </div>
      {!compact && <SaveButton id={e.id} />}
    </article>
  );
}
export function ProjectCard({ project: p, compact = false }) {
  const { proposals } = useApp();
  const applied = proposals.some((x) => x.projectId === p.id);
  const closed =
    p.status !== "OPEN" || new Date(p.deadline + "T23:59:59") < new Date();
  return (
    <article className={`project-card ${compact ? "compact" : "list-card"}`}>
      {!compact && (
        <Link className="project-image" to={`/projects/${p.id}`}>
          {p.image ? (
            <img src={asset(`projects/${p.image}`)} alt="" loading="lazy" />
          ) : (
            <span className="category-placeholder">
              <IconCategory category={p.category} size={35} />
              <small>{p.category}</small>
            </span>
          )}
        </Link>
      )}
      <div className="project-info">
        <span className="badge">{p.category}</span>
        <Link to={`/projects/${p.id}`}>
          <h3>{p.title}</h3>
        </Link>
        <p>{p.summary}</p>
        {!compact && <Tags tags={p.tags} />}
      </div>
      <div className="project-side">
        <div className="project-numbers">
          <strong>
            <Wallet size={16} />
            {budgetLabel(p)}
          </strong>
          <span>
            <CalendarDays size={15} />
            {p.days}일
          </span>
          <span className={deadlineDays(p.deadline) <= 3 ? "urgent" : ""}>
            {closed ? "모집 마감" : `D-${deadlineDays(p.deadline)}`}
          </span>
        </div>
        <div className="project-owner">
          <span>
            {p.owner} {!compact && <Verified />}
          </span>
          {p.ownerId === "me" ? (
            <Link className={`btn ${compact ? "soft" : "primary"} small-btn`} to={`/projects/${p.id}`}>
              내 의뢰
            </Link>
          ) : (
            <Link
              aria-disabled={closed || applied}
              className={`btn ${compact ? "soft" : "primary"} small-btn ${closed || applied ? "disabled" : ""}`}
              to={`/projects/${p.id}${closed || applied ? "" : "/apply"}`}
            >
              {applied ? "지원 완료" : closed ? "마감" : "지원하기"}
              {!compact && !closed && !applied && <ChevronRight size={15} />}
            </Link>
          )}
        </div>
      </div>
      {!compact && <SaveButton id={p.id} />}
    </article>
  );
}
export function EmptyState({
  title = "조건에 맞는 결과가 없어요",
  description = "필터를 줄이거나 다른 검색어로 다시 찾아보세요.",
  onReset,
}) {
  return (
    <div className="empty">
      <Search size={35} />
      <h3>{title}</h3>
      <p>{description}</p>
      {onReset && (
        <button className="btn soft" onClick={onReset}>
          <RotateCcw size={16} />
          필터 초기화
        </button>
      )}
    </div>
  );
}
export function ExploreSidebar({ type = "projects" }) {
  const { recent, projects } = useApp();
  const records = recent
    .filter((x) => x.type === type)
    .map((x) =>
      (type === "projects" ? projects : experts).find((e) => e.id === x.id),
    )
    .filter(Boolean)
    .slice(0, 3);
  return (
    <aside className="explore-sidebar">
      <div className="helper-card">
        <h3>
          어떤 {type === "projects" ? "프로젝트" : "전문가"}를<br />
          찾고 계신가요?
        </h3>
        <p>
          나에게 맞는 조건으로
          <br />
          새로운 가능성을 찾아보세요.
        </p>
        <Search size={60} strokeWidth={1} />
      </div>
      <div className="sidebar-card">
        <h3>인기 검색어</h3>
        {["포스터", "영상 편집", "React", "PPT", "로고 디자인"].map((t, i) => (
          <Link key={t} to={`/${type}?q=${encodeURIComponent(t)}`}>
            <span className={i < 3 ? "rank blue" : "rank"}>{i + 1}</span>
            {t}
            <ChevronRight size={15} />
          </Link>
        ))}
      </div>
      <div className="sidebar-card">
        <h3>최근 본 {type === "projects" ? "프로젝트" : "전문가"}</h3>
        {records.length ? (
          records.map((p) => (
            <Link className="recent-item" key={p.id} to={`/${type}/${p.id}`}>
              <span>
                {p.title || p.name}
                <small>
                  {p.specialty || budgetLabel(p) + " · " + p.days + "일"}
                </small>
              </span>
              <ChevronRight size={14} />
            </Link>
          ))
        ) : (
          <p className="muted small">
            둘러본 {type === "projects" ? "프로젝트" : "전문가"}가<br />
            여기에 표시돼요.
          </p>
        )}
      </div>
      <Link className="sidebar-tip" to="/guide">
        <Lightbulb size={20} />
        <span>
          처음이라면?<b>긱창업 이용 가이드</b>
        </span>
        <ArrowRight size={17} />
      </Link>
    </aside>
  );
}
export function Filters({ type }) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState("");
  const { projects } = useApp();
  const fields = readFields(params);
  const fieldOpen = open === "category";
  const editingFields = useRef(false);
  useEffect(() => {
    if (!fieldOpen) editingFields.current = false;
  }, [fieldOpen]);
  const ref = useRef();
  const triggers = useRef({});
  const panelRef = useRef();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = triggers.current[open];
    const panel = panelRef.current;
    const container = ref.current;
    if (!anchor || !panel || !container) return;

    const reposition = () => {
      if (!matchMedia("(min-width: 768px)").matches) return;
      const bounds = container.getBoundingClientRect();
      const button = anchor.getBoundingClientRect();
      const left = Math.max(
        0,
        Math.min(button.left - bounds.left, bounds.width - panel.offsetWidth),
      );
      const top = button.bottom - bounds.top + 6;
      setPosition((previous) =>
        previous.left === left && previous.top === top
          ? previous
          : { left, top },
      );
    };

    reposition();
    const observer = new ResizeObserver(reposition);
    [container, anchor, panel].forEach((element) => observer.observe(element));
    window.addEventListener("resize", reposition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [open, type]);
  const expert = type === "experts";
  const work = type === "works";
  const update = (key, value) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    if (key === "category") p.delete("service");
    if (key === "budget") {
      p.delete("budgetMin");
      p.delete("budgetMax");
    }
    p.delete("page");
    setParams(p);
    setOpen("");
  };
  useEffect(() => {
    const click = (e) => {
      if (!ref.current?.contains(e.target)) setOpen("");
    };
    const key = (e) => {
      if (e.key === "Escape") setOpen("");
    };
    document.addEventListener("pointerdown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      document.removeEventListener("keydown", key);
    };
  }, []);
  const defs = work
    ? [
        ["category", "카테고리", LayoutGrid],
        ["skill", "사용 기술", Code2],
        ["verified", "검증된 작업", ShieldCheck],
      ]
    : expert
      ? [
          ["category", "전문 분야 선택", LayoutGrid],
          ["skill", "기술", Code2],
          ["rating", "후기", Star],
          ["completed", "완료 프로젝트", CalendarDays],
          ["available", "현재 의뢰 가능", Clock3],
          ["verified", "학교 인증", GraduationCap],
        ]
      : [
          ["category", "카테고리 선택", LayoutGrid],
          ["budget", "예산", Wallet],
          ["days", "기간", CalendarDays],
          ["mode", "진행 방식", MapPin],
          ["urgent", "마감 임박", Clock3],
          ["skill", "필요 기술", Code2],
          ["verified", "학교 인증", GraduationCap],
        ];
  const options = {
    budget: [
      ["10만원 이하", "10만원 이하"],
      ["10~30만원", "10~30만원"],
      ["30만원 이상", "30만원 이상"],
    ],
    days: [
      ["7", "7일 이내"],
      ["14", "14일 이내"],
      ["30", "30일 이내"],
    ],
    mode: ["온라인", "오프라인", "혼합"].map((s) => [s, s]),
    rating: [
      ["4.5", "4.5점 이상"],
      ["4.0", "4.0점 이상"],
      ["3.5", "3.5점 이상"],
    ],
    completed: [
      ["10", "10건 이상"],
      ["20", "20건 이상"],
      ["30", "30건 이상"],
    ],
    skill: [
      "Figma",
      "Illustrator",
      "Photoshop",
      "React",
      "Premiere Pro",
      "영문 번역",
      "Excel",
    ].map((s) => [s, s]),
  };
  const isQuickFilter = (key) =>
    ["verified", "urgent", "available"].includes(key);
  const renderFilter = ([key, label, Icon]) => {
    const toggle = isQuickFilter(key);
    const fieldButton = key === "category";
    const fieldCount = fields.length;
    return (
      <button
        key={key}
        ref={(element) => {
          triggers.current[key] = element;
        }}
        className={`filter-button ${toggle ? "quick-filter" : ""} ${params.has(key) || open === key || (fieldButton && fieldCount > 0) || (key === "budget" && (params.has("budgetMin") || params.has("budgetMax"))) ? "active" : ""}`}
        aria-expanded={toggle ? undefined : open === key}
        aria-pressed={toggle ? params.has(key) : undefined}
        onMouseEnter={() => {
          if (fieldOpen && editingFields.current) return;
          if (matchMedia("(min-width: 768px) and (hover:hover)").matches)
            setOpen(toggle ? "" : key);
        }}
        onClick={() =>
          toggle ? update(key, params.has(key) ? "" : "1") : setOpen(key)
        }
      >
        <Icon size={17} />
        {label}
        {fieldButton && fieldCount > 0 && (
          <span className="filter-selection-count">{fieldCount}</span>
        )}
        {toggle ? (
          <span className="quick-filter-indicator" aria-hidden="true" />
        ) : (
          <ChevronDown size={13} />
        )}
      </button>
    );
  };
  return (
    <div className="filter-wrap" ref={ref}>
      <div className="filter-bar">
        {defs.filter(([key]) => !isQuickFilter(key)).map(renderFilter)}
        {defs.filter(([key]) => isQuickFilter(key)).map(renderFilter)}
        <button
          className="filter-reset"
          onClick={() => {
            setParams({});
            setOpen("");
          }}
        >
          <RotateCcw size={16} />
          초기화
        </button>
      </div>
      {open && (
        <div
          ref={panelRef}
          style={{
            "--filter-left": `${position.left}px`,
            "--filter-top": `${position.top}px`,
          }}
          className={`filter-panel ${fieldOpen ? "mega-menu field-picker-panel" : ""} ${open === "budget" ? "budget-panel" : ""}`}
        >
          <div className="sheet-heading">
            <h3>검색 조건 선택</h3>
            <button
              className="icon-button"
              aria-label="필터 닫기"
              onClick={() => setOpen("")}
            >
              <X />
            </button>
          </div>
          {fieldOpen ? (
            <FieldFilter
              key={params.toString()}
              params={params}
              type={type}
              items={
                type === "projects"
                  ? projects
                  : type === "experts"
                    ? experts
                    : portfolios
              }
              onEdit={() => {
                editingFields.current = true;
              }}
              onCancel={() => setOpen("")}
              onApply={(next) => {
                setParams(next);
                setOpen("");
              }}
            />
          ) : (
            <div className="filter-options">
              <button onClick={() => update(open, "")}>
                전체 <Check size={14} />
              </button>
              {(options[open] || []).map(([value, label]) => (
                <button
                  className={params.get(open) === value ? "active" : ""}
                  key={value}
                  onClick={() => update(open, value)}
                >
                  {label}
                  {params.get(open) === value && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
          {open === "budget" && (
            <BudgetRangeForm
              params={params}
              onApply={(range) => {
                const next = new URLSearchParams(params);
                ["budget", "budgetMin", "budgetMax", "page"].forEach((key) =>
                  next.delete(key),
                );
                if (range.min !== null)
                  next.set("budgetMin", String(range.min));
                if (range.max !== null)
                  next.set("budgetMax", String(range.max));
                setParams(next);
                setOpen("");
              }}
            />
          )}
          <button
            className={`btn primary sheet-done ${open === "budget" || fieldOpen ? "budget-sheet-dismiss" : ""}`}
            onClick={() => setOpen("")}
          >
            결과 보기
          </button>
        </div>
      )}
    </div>
  );
}
function BudgetRangeForm({ params, onApply }) {
  const [minimum, setMinimum] = useState(params.get("budgetMin") || "");
  const [maximum, setMaximum] = useState(params.get("budgetMax") || "");
  const [error, setError] = useState("");
  return (
    <form
      className="budget-range-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const range = parseBudgetRange(minimum, maximum);
        if (range.error) {
          setError(range.error);
          return;
        }
        onApply(range);
      }}
    >
      <h4>
        직접 입력 <span>원</span>
      </h4>
      <div className="budget-range-inputs">
        <label>
          최소 금액
          <input
            type="text"
            inputMode="numeric"
            placeholder="제한 없음"
            value={minimum}
            aria-invalid={!!error}
            aria-describedby={error ? "budget-range-error" : undefined}
            onChange={(event) => {
              setMinimum(event.target.value);
              setError("");
            }}
          />
        </label>
        <span aria-hidden="true">~</span>
        <label>
          최대 금액
          <input
            type="text"
            inputMode="numeric"
            placeholder="제한 없음"
            value={maximum}
            aria-invalid={!!error}
            aria-describedby={error ? "budget-range-error" : undefined}
            onChange={(event) => {
              setMaximum(event.target.value);
              setError("");
            }}
          />
        </label>
      </div>
      <p className="budget-range-hint">최소 또는 최대 금액만 입력해도 돼요.</p>
      {error && (
        <p id="budget-range-error" className="budget-range-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" type="submit">
        예산 적용
      </button>
    </form>
  );
}
export function AppliedFilters() {
  const [p, setP] = useSearchParams();
  const fields = readFields(p);
  const range = parseBudgetRange(p.get("budgetMin"), p.get("budgetMax"));
  const labels = {
    verified: "학교 인증",
    urgent: "마감 3일 이내",
    available: "현재 의뢰 가능",
    days: "일 이내",
    rating: "점 이상",
    completed: "건 이상",
  };
  return (
    <div className="applied-filters">
      {fields.map((field, index) => (
        <button
          key={JSON.stringify(field)}
          onClick={() =>
            setP(
              withFields(
                p,
                fields.filter((_, i) => i !== index),
              ),
            )
          }
        >
          {fieldLabel(field)}
          <X size={13} />
        </button>
      ))}
      {range.active && (
        <button
          onClick={() => {
            const next = new URLSearchParams(p);
            ["budgetMin", "budgetMax", "page"].forEach((key) =>
              next.delete(key),
            );
            setP(next);
          }}
        >
          {budgetRangeLabel(range)}
          <X size={13} />
        </button>
      )}
      {[...p.entries()]
        .filter(
          ([k]) =>
            ![
              "sort",
              "page",
              "tab",
              "budgetMin",
              "budgetMax",
              "field",
              "category",
            ].includes(k) && !(k === "service" && fields.length),
        )
        .map(([key, value]) => (
          <button
            key={key}
            onClick={() => {
              const next = new URLSearchParams(p);
              next.delete(key);
              if (key === "category") next.delete("service");
              next.delete("page");
              setP(next);
            }}
          >
            {["verified", "urgent", "available"].includes(key)
              ? labels[key]
              : value + (labels[key] || "")}
            <X size={13} />
          </button>
        ))}
    </div>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current.querySelectorAll(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="section-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
