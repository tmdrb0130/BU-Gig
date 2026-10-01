import { ExploreFilters, FilterChips, ExploreSidebar } from "./filters";
import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { SearchBox, CategoryBar, SectionHeading } from "./design";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { asset } from "../assets";
import { useQuery, QueryState, useSession, ErrorMessage } from "./session";
import {
  Page,
  Card,
  Empty,
  Verified,
  Picture,
  ReviewList,
  Save,
  Download,
  budget,
  date,
  status,
} from "./ui";
function Search({ initial = "", type }) {
  return (
    <form action="/search" className="live-search">
      {type && <input type="hidden" name="type" value={type} />}
      <input
        name="q"
        aria-label="검색어"
        placeholder="어떤 일을 함께하고 싶으신가요?"
        defaultValue={initial}
      />
      <button className="btn primary">검색</button>
    </form>
  );
}
export function Home() {
  const q = useQuery("/home");
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
            <span>추천 검색어</span>
            {q.data?.recommendedKeywords?.map((t) => (
              <Link key={t} to={`/search?q=${encodeURIComponent(t)}`}>
                {t}
              </Link>
            ))}
          </div>
        </div>
        <CategoryBar />
        <QueryState query={q}>
          {q.data && (
            <>
              {[
                ["portfolios", "지금 눈에 띄는 작업물", "/works"],
                ["experts", "함께할 전문가", "/experts"],
                ["projects", "새로 올라온 의뢰", "/projects"],
              ].map(([type, title, to]) => (
                <section className="home-section" key={type}>
                  <SectionHeading
                    title={title}
                    to={to}
                    eyebrow={
                      type === "portfolios" ? "MADE ON CAMPUS" : undefined
                    }
                    description={
                      type === "projects"
                        ? "나의 재능을 발휘할 다음 프로젝트를 찾아보세요."
                        : "우리 학교의 재능과 새로운 가능성을 만나보세요."
                    }
                  />
                  {q.data[type]?.length ? (
                    <div
                      className={
                        type === "portfolios"
                          ? "portfolio-grid"
                          : type === "experts"
                            ? "expert-grid"
                            : "compact-project-grid"
                      }
                    >
                      {q.data[type].map((item) => (
                        <Card key={item.id} type={type} item={item} compact />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      to={type === "projects" ? "/request/new" : "/my/profile"}
                      label={
                        type === "projects" ? "첫 의뢰 등록" : "내 프로필 준비"
                      }
                    >
                      아직 공개된{" "}
                      {type === "projects"
                        ? "의뢰가"
                        : type === "experts"
                          ? "프로필이"
                          : "작업물이"}{" "}
                      없어요. 첫 연결을 시작해 보세요.
                    </Empty>
                  )}
                </section>
              ))}
              {q.data.reviews?.length >= 3 && (
                <section className="home-section reviews-section">
                  <div className="center-heading">
                    <span className="eyebrow">BETTER TOGETHER</span>
                    <h2>함께해서 더 좋았던 순간들</h2>
                    <p>완료된 공개 거래의 실제 후기입니다.</p>
                  </div>
                  <ReviewList items={q.data.reviews} />
                </section>
              )}
            </>
          )}
        </QueryState>
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
      </div>
    </>
  );
}
export function Explore({ type: provided }) {
  const [params, setParams] = useSearchParams();
  const type =
    provided ||
    (["projects", "experts", "portfolios"].includes(params.get("type"))
      ? params.get("type")
      : "projects");
  const query = new URLSearchParams(params);
  query.delete("type");
  query.set("pageSize", "6");
  const q = useQuery(`/${type}?${query}`),
    taxonomy = useQuery("/categories");
  const noun = {
    projects: "프로젝트",
    experts: "전문가",
    portfolios: "작업물",
  }[type];
  const update = (key, value) => {
    const p = new URLSearchParams(params);
    p.set(key, value);
    if (key !== "page") p.delete("page");
    setParams(p);
  };
  return (
    <>
      <section className="explore-top">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">홈</Link>
            <span>› {noun} 찾기</span>
          </div>
          <div className="page-heading">
            <h1>
              지금, 함께할 <em>{noun}</em>를 찾아보세요
            </h1>
            <p>백석대학교 구성원의 재능과 새로운 가능성을 만나보세요.</p>
          </div>
          {!provided && (
            <>
              <Search initial={params.get("q") || ""} type={type} />
              <nav className="tabs">
                {[
                  ["projects", "프로젝트"],
                  ["experts", "전문가"],
                  ["portfolios", "작업물"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={type === k ? "active" : ""}
                    onClick={() =>
                      setParams({ q: params.get("q") || "", type: k })
                    }
                  >
                    {l}
                  </button>
                ))}
              </nav>
            </>
          )}
          <div className="mobile-explore-search">
            <SearchBox />
          </div>
          <QueryState query={taxonomy}>
            <ExploreFilters key={type} type={type} taxonomy={taxonomy.data} />
          </QueryState>
        </div>
      </section>
      <div
        className={`container explore-layout ${type === "portfolios" ? "no-sidebar" : ""}`}
      >
        <div className="results">
          <div className="results-toolbar">
            <h2>
              {noun} <em>{q.meta.total ?? "—"}</em>
              <span>{type === "experts" ? "명" : "건"}</span>
            </h2>
            <FilterChips taxonomy={taxonomy.data} />
            <select
              aria-label="결과 정렬"
              value={
                params.get("sort") ||
                (type === "experts" ? "reviews" : "newest")
              }
              onChange={(e) => update("sort", e.target.value)}
            >
              {(type === "projects"
                ? [
                    ["newest", "최신순"],
                    ["deadline", "마감 임박순"],
                    ["budget", "높은 예산순"],
                  ]
                : type === "experts"
                  ? [
                      ["reviews", "리뷰 많은순"],
                      ["rating", "평점 높은순"],
                      ["completed", "완료 많은순"],
                    ]
                  : [
                      ["newest", "최신순"],
                      ["popular", "찜 많은순"],
                    ]
              ).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <QueryState query={q}>
            {q.data?.length ? (
              <div
                className={
                  type === "portfolios" ? "portfolio-grid" : "result-list"
                }
              >
                {q.data.map((p) => (
                  <Card key={p.id} type={type} item={p} />
                ))}
              </div>
            ) : (
              <Empty>
                {[...params.keys()].some(
                  (k) => !["page", "pageSize", "sort", "type"].includes(k),
                )
                  ? "조건에 맞는 결과가 없어요. 검색어나 필터를 바꿔보세요."
                  : "아직 공개된 항목이 없어요."}
              </Empty>
            )}
            <nav className="pagination" aria-label="결과 페이지">
              {q.meta.page > 1 && (
                <button onClick={() => update("page", String(q.meta.page - 1))}>
                  이전
                </button>
              )}
              {q.meta.total > 0 && (
                <span>
                  {q.meta.page} / {Math.ceil(q.meta.total / q.meta.pageSize)}
                </span>
              )}
              {q.meta.page * q.meta.pageSize < q.meta.total && (
                <button onClick={() => update("page", String(q.meta.page + 1))}>
                  다음
                </button>
              )}
            </nav>
          </QueryState>
        </div>
        {type !== "portfolios" && <ExploreSidebar type={type} />}
      </div>
    </>
  );
}
export { Detail } from "./details";
export function Guide() {
  return (
    <Page title="처음 이용하시나요?">
      <h2>의뢰하고 싶어요</h2>
      <p>
        회원가입 → 학교 인증 → 의뢰 등록 → 지원자 검토·선정 → 계약 확인·쌍방
        동의 → 결과물 확인·완료 승인
      </p>
      <h2>재능을 나누고 싶어요</h2>
      <p>
        프로필 작성 → 학교 인증 → 의뢰에 지원 → 조건 합의 → 계약 체결 → 결과물
        제출 → 완료 후 후기
      </p>
      <h2>인증과 실적의 의미</h2>
      <p>
        학교 인증은 소속 확인이며 실력이나 결과물 품질 보증이 아닙니다. 완료
        거래 배지는 거래 완료와 해당 작업물 버전의 공개 승인이 확인된 경우
        표시합니다. 평점은 실제 공개 후기만 사용합니다.
      </p>
      <p>
        결제·정산 기능은 제공하지 않습니다. 금액과 지급 방법은 계약 내용을
        확인하고 당사자 간 합의해 주세요.
      </p>
      <Link className="btn primary" to="/my/profile">
        내 프로필 준비하기
      </Link>
      <section id="faq" className="live-guide-faq">
        <h2>자주 묻는 질문</h2>
        {[
          [
            "아직 작업 실적이 없어도 시작할 수 있나요?",
            "네. 기존 작업물을 등록하고 본인의 분야와 기술을 소개할 수 있습니다. 완료 거래 배지는 실제 거래를 완료하고 공개 승인을 받은 작업에만 표시됩니다.",
          ],
          [
            "의뢰 초안은 바로 공개되나요?",
            "초안은 본인에게만 보입니다. 학교 인증과 필수 내용 확인 후 의뢰 관리에서 직접 공개해 주세요.",
          ],
          [
            "선정한 뒤에는 어떻게 진행하나요?",
            "워크룸에서 조건을 확인하고 양쪽 모두 계약에 동의하면 작업을 진행합니다. 파일 제출과 완료 승인도 워크룸에 기록됩니다.",
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
        <Link className="btn outline" to="/support">
          고객센터 문의하기
        </Link>
      </section>
    </Page>
  );
}
