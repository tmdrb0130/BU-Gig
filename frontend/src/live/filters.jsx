import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LayoutGrid,
  Wallet,
  CalendarDays,
  MapPin,
  GraduationCap,
  Star,
  Code2,
  ChevronDown,
  RotateCcw,
  X,
  Search,
  ArrowRight,
} from "lucide-react";
import { useQuery, QueryState, useSession } from "./session";
import { asset } from "../assets";
const axes = {
  fields: ["분야", LayoutGrid],
  budget: ["예산", Wallet],
  days: ["기간", CalendarDays],
  mode: ["진행 방식", MapPin],
  skills: ["필요 기술", Code2],
  rating: ["후기", Star],
  completed: ["완료 프로젝트", CalendarDays],
};
const keys = {
  fields: ["categoryId", "fieldId"],
  budget: ["budgetMin", "budgetMax"],
  days: ["daysMin", "daysMax"],
  mode: ["mode"],
  skills: ["skillId"],
  rating: ["ratingMin"],
  completed: ["completedMin"],
};
export function ExploreFilters({ type, taxonomy }) {
  const [params, setParams] = useSearchParams(),
    [open, setOpen] = useState(""),
    [draft, setDraft] = useState(new URLSearchParams()),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const root = useRef(),
    trigger = useRef();
  const panel = useRef();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!open) return;
    const mobile = matchMedia("(max-width:767px)").matches;
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button,input")?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const items = [
        ...panel.current.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
        ),
      ].filter((x) => x.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", trap);
      trigger.current?.focus();
    };
  }, [open]);
  const skills = useQuery(open === "skills" ? "/skills" : null);
  const close = () => {
    setOpen("");
    setError("");
  };
  useEffect(() => {
    const outside = (e) => {
      if (!root.current?.contains(e.target)) close();
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => close(), [params.toString()]);
  const show = (key, e, hover = false) => {
    if (
      hover &&
      (dirty || !matchMedia("(min-width:768px) and (hover:hover)").matches)
    )
      return;
    if (open === key) {
      return;
    }
    trigger.current = e.currentTarget;
    setOffset(
      key === "fields"
        ? 0
        : Math.max(
            0,
            Math.min(
              e.currentTarget.offsetLeft,
              root.current.clientWidth - 360,
            ),
          ),
    );
    setDraft(new URLSearchParams(params));
    setDirty(false);
    setError("");
    setOpen(key);
  };
  const edit = (key, value, multi = false) => {
    setDirty(true);
    setDraft((old) => {
      const p = new URLSearchParams(old);
      if (multi) {
        const values = p.getAll(key);
        p.delete(key);
        (values.includes(value)
          ? values.filter((x) => x !== value)
          : [...values, value]
        ).forEach((x) => p.append(key, x));
      } else {
        p.delete(key);
        if (value !== "") p.set(key, value);
      }
      return p;
    });
  };
  const apply = () => {
    for (const key of ["budgetMin", "budgetMax", "daysMin", "daysMax"]) {
      const value = draft.get(key);
      if (
        value &&
        (!Number.isFinite(Number(value)) ||
          Number(value) < 0 ||
          !Number.isInteger(Number(value)))
      ) {
        setError("예산과 기간은 0 이상의 정수로 입력해 주세요.");
        return;
      }
    }
    for (const [a, b] of [
      ["budgetMin", "budgetMax"],
      ["daysMin", "daysMax"],
    ]) {
      if (
        draft.get(a) &&
        draft.get(b) &&
        Number(draft.get(a)) > Number(draft.get(b))
      ) {
        setError("최솟값은 최댓값보다 클 수 없습니다.");
        return;
      }
    }
    const p = new URLSearchParams(params);
    keys[open].forEach((k) => {
      p.delete(k);
      draft
        .getAll(k)
        .filter(Boolean)
        .forEach((v) => p.append(k, v));
    });
    p.delete("page");
    setParams(p);
    close();
  };
  const options =
    type === "projects"
      ? ["fields", "budget", "days", "mode", "skills"]
      : type === "experts"
        ? ["fields", "skills", "rating", "completed"]
        : ["fields", "skills"];
  const toggles =
    type === "projects"
      ? [
          ["urgent", "마감 임박"],
          ["schoolVerified", "학교 인증"],
        ]
      : type === "experts"
        ? [
            ["available", "현재 의뢰 가능"],
            ["schoolVerified", "학교 인증"],
          ]
        : [
            ["schoolVerified", "학교 인증"],
            ["verifiedWork", "검증 작업"],
          ];
  return (
    <div className="filter-wrap" ref={root}>
      <div className="filter-bar">
        {options.map((key) => {
          const [label, Icon] = axes[key];
          return (
            <button
              key={key}
              className={`filter-button ${open === key || keys[key].some((k) => params.has(k)) ? "active" : ""}`}
              aria-expanded={open === key}
              onMouseEnter={(e) => show(key, e, true)}
              onClick={(e) => show(key, e)}
            >
              <Icon size={17} />
              {key === "fields"
                ? type === "experts"
                  ? "전문 분야 선택"
                  : "카테고리 선택"
                : label}
              <ChevronDown size={14} />
            </button>
          );
        })}
        {toggles.map(([key, label]) => (
          <button
            key={key}
            className="filter-button quick-filter"
            aria-pressed={params.get(key) === "true"}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.get(key) === "true" ? p.delete(key) : p.set(key, "true");
              p.delete("page");
              setParams(p);
              close();
            }}
          >
            <span className="quick-filter-indicator" />
            {label}
          </button>
        ))}
        <button
          className="text-button filter-reset"
          onClick={() => {
            setParams(params.has("type") ? { type } : {});
            close();
          }}
        >
          <RotateCcw size={16} />
          필터 초기화
        </button>
      </div>
      {open && <div className="live-filter-backdrop" onClick={close} />}
      {open && (
        <div
          ref={panel}
          style={{ "--filter-offset": `${offset}px` }}
          className={`release-filter-panel ${open === "fields" ? "wide" : ""}`}
          role="dialog"
          aria-label={`${axes[open][0]} 선택`}
        >
          <div className="sheet-heading">
            <h3>{axes[open][0]}</h3>
            <button
              className="icon-button"
              aria-label="필터 닫기"
              onClick={close}
            >
              <X />
            </button>
          </div>
          {open === "fields" ? (
            <FieldPicker
              taxonomy={taxonomy}
              draft={draft}
              change={(p) => {
                setDirty(true);
                setDraft(p);
              }}
            />
          ) : (
            <div className="release-filter-options">
              {open === "skills" && (
                <QueryState query={skills}>
                  {skills.data?.map((s) => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={draft.getAll("skillId").includes(s.id)}
                        onChange={() => edit("skillId", s.id, true)}
                      />
                      {s.label}
                    </label>
                  ))}
                </QueryState>
              )}
              {open === "mode" &&
                [
                  ["ONLINE", "온라인"],
                  ["OFFLINE", "오프라인"],
                  ["HYBRID", "혼합"],
                ].map(([v, l]) => (
                  <label key={v}>
                    <input
                      type="checkbox"
                      checked={draft.getAll("mode").includes(v)}
                      onChange={() => edit("mode", v, true)}
                    />
                    {l}
                  </label>
                ))}
              {open === "rating" &&
                ["", "4.5", "4", "3.5"].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="rating"
                      checked={(draft.get("ratingMin") || "") === v}
                      onChange={() => edit("ratingMin", v)}
                    />
                    {v ? `${Number(v).toFixed(1)}점 이상` : "전체"}
                  </label>
                ))}
              {open === "completed" &&
                ["", "1", "5", "10"].map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="completed"
                      checked={(draft.get("completedMin") || "") === v}
                      onChange={() => edit("completedMin", v)}
                    />
                    {v ? `${v}건 이상` : "전체 · 신규 포함"}
                  </label>
                ))}
              {["budget", "days"].includes(open) && (
                <>
                  <div className="form-actions">
                    {(open === "budget"
                      ? [
                          ["전체", "", ""],
                          ["10만원 이하", "", "100000"],
                          ["10~50만원", "100000", "500000"],
                        ]
                      : [
                          ["전체", "", ""],
                          ["7일 이내", "", "7"],
                          ["30일 이내", "", "30"],
                        ]
                    ).map(([l, min, max]) => (
                      <button
                        key={l}
                        className="btn outline small-btn"
                        onClick={() => {
                          edit(keys[open][0], min);
                          edit(keys[open][1], max);
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {keys[open].map((k, i) => (
                    <label key={k}>
                      {i ? "최대" : "최소"}{" "}
                      {open === "budget" ? "예산 (원)" : "기간 (일)"}
                      <input
                        type="number"
                        min={open === "budget" ? 0 : 1}
                        max={open === "budget" ? 1000000000 : 365}
                        value={draft.get(k) || ""}
                        onChange={(e) => edit(k, e.target.value)}
                      />
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="field-picker-actions">
            <button className="btn outline" onClick={close}>
              취소
            </button>
            <button className="btn primary" onClick={apply}>
              결과 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function FieldPicker({ taxonomy, draft, change }) {
  const [active, setActive] = useState(taxonomy?.categories?.[0]?.id);
  const data = taxonomy || { categories: [], fields: [] },
    fields = data.fields.filter((f) => f.categoryId === active),
    whole = draft.getAll("categoryId").includes(active);
  const toggle = (id, category = false) => {
    const p = new URLSearchParams(draft),
      cats = p.getAll("categoryId"),
      selected = p.getAll("fieldId");
    p.delete("categoryId");
    p.delete("fieldId");
    let c = cats,
      f = selected;
    if (category) {
      c = whole ? cats.filter((x) => x !== active) : [...cats, active];
      f = selected.filter((x) => !fields.some((z) => z.id === x));
    } else if (whole) {
      c = cats.filter((x) => x !== active);
      f = [...selected, ...fields.filter((x) => x.id !== id).map((x) => x.id)];
    } else
      f = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
    c.forEach((x) => p.append("categoryId", x));
    [...new Set(f)].forEach((x) => p.append("fieldId", x));
    change(p);
  };
  return (
    <div className="field-picker">
      <div className="field-picker-heading">
        <div>
          <h3>함께 찾아볼 분야를 선택하세요</h3>
          <p>서로 다른 분야도 여러 개 선택할 수 있어요.</p>
        </div>
      </div>
      <div className="field-picker-body">
        <div className="mega-categories">
          {data.categories.map((c) => (
            <button
              key={c.id}
              className={active === c.id ? "active" : ""}
              onClick={() => setActive(c.id)}
              onMouseEnter={() => {
                if (matchMedia("(min-width:768px) and (hover:hover)").matches)
                  setActive(c.id);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="field-picker-services">
          <label className="field-whole">
            <input
              type="checkbox"
              checked={whole}
              onChange={() => toggle(active, true)}
            />
            <strong>
              {data.categories.find((c) => c.id === active)?.label} 전체
            </strong>
          </label>
          <div className="mega-columns">
            {[...new Set(fields.map((f) => f.groupLabel))].map((group) => (
              <div key={group}>
                <h4>{group}</h4>
                {fields
                  .filter((f) => f.groupLabel === group)
                  .map((f) => (
                    <label className="field-service" key={f.id}>
                      <input
                        type="checkbox"
                        checked={
                          whole || draft.getAll("fieldId").includes(f.id)
                        }
                        onChange={() => toggle(f.id)}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="field-picker-footer">
        선택한 분야{" "}
        {draft.getAll("categoryId").length + draft.getAll("fieldId").length}개
      </div>
    </div>
  );
}
export function FilterChips({ taxonomy }) {
  const [params, setParams] = useSearchParams();
  const labels = {
    schoolVerified: "학교 인증",
    urgent: "마감 임박",
    available: "의뢰 가능",
    verifiedWork: "검증 작업",
    budgetMin: "최소 예산",
    budgetMax: "최대 예산",
    daysMin: "최소 기간",
    daysMax: "최대 기간",
    ratingMin: "최소 평점",
    completedMin: "최소 완료",
    skillId: "기술",
    mode: "진행 방식",
    q: "검색",
  };
  const skills = useQuery(params.has("skillId") ? "/skills" : null);
  return (
    <div className="applied-filters">
      {[...params]
        .filter(([k]) => !["type", "page", "pageSize", "sort"].includes(k))
        .map(([k, v]) => (
          <button
            key={k + v}
            onClick={() => {
              const p = new URLSearchParams(params),
                all = p.getAll(k).filter((x) => x !== v);
              p.delete(k);
              all.forEach((x) => p.append(k, x));
              p.delete("page");
              setParams(p);
            }}
          >
            {k === "categoryId"
              ? taxonomy?.categories.find((c) => c.id === v)?.label || "분야"
              : k === "fieldId"
                ? taxonomy?.fields.find((f) => f.id === v)?.label || "세부 분야"
                : k === "skillId"
                  ? skills.data?.find((s) => s.id === v)?.label || "기술"
                  : `${labels[k] || k}${v === "true" ? "" : ` ${v}`}`}
            <X size={13} />
          </button>
        ))}
    </div>
  );
}
export function ExploreSidebar({ type }) {
  const { user } = useSession(),
    [recent, setRecent] = useState([]);
  useEffect(() => {
    try {
      setRecent(
        JSON.parse(
          sessionStorage.getItem(`bu-live-recent:${user?.id || "guest"}`) ||
            "[]",
        )
          .filter((x) => x.type === type)
          .slice(0, 3),
      );
    } catch {
      setRecent([]);
    }
  }, [type, user?.id]);
  return (
    <aside className="explore-sidebar">
      <div className="helper-card">
        <h3>
          어떤 {type === "experts" ? "전문가" : "프로젝트"}를<br />
          찾고 계신가요?
        </h3>
        <p>
          원하는 조건으로
          <br />
          새로운 가능성을 찾아보세요.
        </p>
        <Search size={60} strokeWidth={1} />
      </div>
      <div className="sidebar-card">
        <h3>추천 검색어</h3>
        {["포스터", "영상 편집", "React", "PPT", "로고 디자인"].map((t) => (
          <Link key={t} to={`/${type}?q=${encodeURIComponent(t)}`}>
            {t}
            <ArrowRight size={14} />
          </Link>
        ))}
      </div>
      <div className="sidebar-card">
        <h3>최근 본 {type === "projects" ? "프로젝트" : "전문가"}</h3>
        {recent.length ? (
          recent.map((r) => <RecentItem key={r.id} item={r} />)
        ) : (
          <p className="muted small">둘러본 항목이 여기에 표시돼요.</p>
        )}
      </div>
      <Link className="sidebar-tip" to="/guide">
        <GraduationCap />
        <span>
          처음이라면?<b>긱창업 이용 가이드</b>
        </span>
      </Link>
    </aside>
  );
}
function RecentItem({ item }) {
  const q = useQuery(`/${item.type}/${item.id}`);
  return q.data ? (
    <Link className="recent-item" to={`/${item.type}/${item.id}`}>
      <span>
        {q.data.title || q.data.displayName}
        <small>{q.data.summary || q.data.headline}</small>
      </span>
      <ArrowRight size={14} />
    </Link>
  ) : null;
}
