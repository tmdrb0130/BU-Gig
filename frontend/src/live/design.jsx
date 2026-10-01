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
  GraduationCap,
  ShieldCheck,
  FileText,
  Menu,
  Home,
  MessageCircle,
  UserRound,
  X,
  LayoutGrid,
  Palette,
  Code2,
  Video,
  Megaphone,
  Lightbulb,
  BookOpen,
  CalendarDays,
  Ellipsis,
} from "lucide-react";
import { asset } from "../assets";
import { useSession, useQuery, isVerified, ErrorMessage } from "./session";
import { Picture } from "./ui";
export function CategoryBar() {
  const q = useQuery("/categories");
  const icons = [
    Palette,
    Code2,
    Video,
    FileText,
    Megaphone,
    Lightbulb,
    BookOpen,
    CalendarDays,
    Ellipsis,
  ];
  return (
    <div className="categories">
      <Link to="/projects">
        <span>
          <LayoutGrid size={23} />
        </span>
        <b>전체</b>
      </Link>
      {q.data?.categories?.map((c, i) => {
        const Icon = icons[i % icons.length];
        return (
          <Link key={c.id} to={`/projects?categoryId=${c.id}`}>
            <span>
              <Icon size={23} strokeWidth={1.6} />
            </span>
            <b>{c.label}</b>
          </Link>
        );
      })}
    </div>
  );
}
export function AuthHeader() {
  return (
    <header className="auth-header">
      <Link className="brand" to="/">
        <img src={asset("brand/logo-mark")} alt="" />
        <span>
          백석대학교 <b>긱창업</b>
        </span>
      </Link>
    </header>
  );
}
export function AuthFooter() {
  const q = useQuery("/public-config");
  return (
    <footer className="auth-footer">
      <nav>
        {q.data?.termsUrl && <a href={q.data.termsUrl}>이용약관</a>}
        {q.data?.privacyUrl && (
          <a href={q.data.privacyUrl}>개인정보 처리방침</a>
        )}
        <Link to="/guide">이용안내</Link>
      </nav>
      <small>© 2026 백석대학교 긱창업. All rights reserved.</small>
    </footer>
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
  const expanded =
    !compact || (narrow ? searchMode : hovered || focused || value.length > 0);
  useLayoutEffect(() => {
    if (!compact) return;
    const container = formRef.current.parentElement;
    const measure = () =>
      setNarrow(window.innerWidth < 768 || container.clientWidth < 240);
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
            <button
              type="button"
              className="icon-button search-back"
              aria-label="검색 닫기"
              onClick={closeSearch}
            >
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
          {value && (
            <button
              type="button"
              className="icon-button"
              aria-label="검색어 지우기"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          )}
          <button type="submit" className="search-submit">
            검색
          </button>
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
export function Header({ notifications: q }) {
  const [panel, setPanel] = useState("");
  const ref = useRef();
  const location = useLocation();
  const { user, session, logout: signOut } = useSession();
  const [error, setError] = useState(null);
  const logout = async () => {
    try {
      await signOut();
    } catch (e) {
      setError(e);
    }
  };
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
      <ErrorMessage error={error} />
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
              {(q.meta.unreadCount || 0) > 0 && <i />}
            </button>
            {user ? (
              <button
                className="profile-trigger"
                aria-label="내 메뉴"
                aria-expanded={panel === "profile"}
                onClick={() => setPanel(panel === "profile" ? "" : "profile")}
              >
                <Picture avatar />
                <ChevronDown size={15} />
              </button>
            ) : (
              <Link className="header-login" to="/login">
                로그인
              </Link>
            )}
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
                    <ErrorMessage error={q.error} />
                    <h3>
                      알림{" "}
                      <span className="muted">{q.meta.unreadCount || 0}</span>
                    </h3>
                    {(q.meta.unreadCount || 0) === 0 ? (
                      <p className="muted">
                        아직 새 알림이 없어요.
                        <br />
                        프로젝트를 시작하면 이곳에서 알려드릴게요.
                      </p>
                    ) : (
                      <>
                        <p>읽지 않은 알림이 있습니다.</p>
                        <Link to="/notifications">
                          알림 확인하기 <ArrowRight size={15} />
                        </Link>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <strong>
                      {user
                        ? `안녕하세요, ${user.displayName}님`
                        : "백석의 새로운 연결을 시작하세요"}
                    </strong>
                    <span className="muted small">
                      {user
                        ? isVerified(session)
                          ? "학교 인증 완료"
                          : "학교 인증 확인하기"
                        : "로그인하고 나의 프로젝트를 이어가세요"}
                    </span>
                    {!user && (
                      <>
                        <Link to="/login">
                          로그인 <ChevronRight size={16} />
                        </Link>
                        <Link to="/signup">
                          회원가입 <ChevronRight size={16} />
                        </Link>
                      </>
                    )}
                    {[
                      ["/my", "마이페이지"],
                      ["/saved", "찜한 목록"],
                      ["/messages", "메시지"],
                      ["/settings/account", "계정 설정"],
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
                    {user && (
                      <button
                        className="btn"
                        onClick={() => {
                          logout();
                          setPanel("");
                        }}
                      >
                        로그아웃
                      </button>
                    )}
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
  const q = useQuery("/public-config");
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
              <Link to="/support">고객센터·문의</Link>
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
            {q.data?.termsUrl && <a href={q.data.termsUrl}>이용약관</a>}{" "}
            {q.data?.privacyUrl && (
              <a href={q.data.privacyUrl}>개인정보 처리방침</a>
            )}
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
