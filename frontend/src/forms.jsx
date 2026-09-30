import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  ShieldCheck,
  FileText,
  Lightbulb,
  Link2,
  Send,
  Plus,
} from "lucide-react";
import { categories, services, portfolios, experts, asset } from "./data";
import { readStored, writeStored, budgetLabel } from "./lib";
import { useApp } from "./store";
import { Breadcrumb, Verified, EmptyState } from "./components";
import { NotFound } from "./pages";

const blank = {
  title: "",
  category: "",
  service: "",
  summary: "",
  tags: "",
  content: "",
  deliverables: "",
  requirements: "",
  budgetType: "고정 금액",
  budget: "",
  budgetMax: "",
  days: "",
  deadline: "",
  mode: "온라인",
  reference: "",
};
export const Field = ({ label, hint, required, children }) => (
  <label className="field">
    <span>
      {label}
      {required && <i>*</i>}
    </span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

export function RequestForm() {
  const [params] = useSearchParams();
  const expert = experts.find((e) => e.id === params.get("expert"));
  const draftKey = `request-draft${expert ? "-" + expert.id : ""}`;
  const [form, setForm] = useState(() =>
    readStored(draftKey, {
      ...blank,
      ...(expert ? { category: expert.category, service: expert.service } : {}),
    }),
  );
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState(
    "작성 내용은 이 브라우저에 자동 저장됩니다.",
  );
  const { setProjects, setRequests, notify } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    const ok = writeStored(draftKey, form);
    setSaveState(
      ok
        ? "작성 내용이 이 브라우저에 자동 저장되었어요."
        : "저장 공간이 부족해 자동 저장하지 못했어요.",
    );
  }, [form, draftKey]);
  const update = (key, value) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "category" ? { service: "" } : {}),
    }));
    setError("");
  };
  const validate = () => {
    if (
      step === 0 &&
      (!form.title.trim() ||
        !form.category ||
        !form.service ||
        !form.summary.trim())
    )
      return "제목, 카테고리, 세부 분야, 한 줄 요약을 입력해 주세요.";
    if (step === 1 && (!form.content.trim() || !form.deliverables.trim()))
      return "작업 내용과 원하는 결과물을 입력해 주세요.";
    if (step === 2) {
      if (form.budgetType !== "협의" && !(Number(form.budget) > 0))
        return "예산은 0보다 큰 금액으로 입력해 주세요.";
      if (
        form.budgetType === "범위" &&
        Number(form.budgetMax) < Number(form.budget)
      )
        return "최대 예산은 최소 예산 이상이어야 해요.";
      if (
        !Number.isInteger(Number(form.days)) ||
        Number(form.days) < 1 ||
        Number(form.days) > 365
      )
        return "작업 기간은 1~365일로 입력해 주세요.";
      if (!form.deadline || new Date(form.deadline + "T23:59:59") <= new Date())
        return "모집 마감일은 오늘 이후로 선택해 주세요.";
    }
    if (
      step === 3 &&
      form.reference &&
      !/^https?:\/\/\S+$/i.test(form.reference)
    )
      return "참고 링크는 https:// 또는 http://로 시작해야 해요.";
    return "";
  };
  const submit = (e) => {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (step < 3) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 100, behavior: "smooth" });
      return;
    }
    const data = {
      ...form,
      id: crypto.randomUUID(),
      tags: form.tags
        .split(/[,#]/)
        .map((s) => s.trim())
        .filter(Boolean),
      budget: Number(form.budget) || 0,
      budgetMax: Number(form.budgetMax) || 0,
      days: Number(form.days),
      createdAt: new Date().toISOString(),
      status: expert ? "PENDING" : "OPEN",
      owner: "백석",
      ownerId: "me",
      applicants: 0,
    };
    if (expert) {
      setRequests((r) => [{ ...data, expertId: expert.id }, ...r]);
      notify(`${expert.name}님에게 보낼 요청이 데모에 저장되었어요.`);
      navigate("/my");
    } else {
      setProjects((p) => [data, ...p]);
      notify("의뢰가 등록되었어요.");
      navigate(`/projects/${data.id}`);
    }
    writeStored(draftKey, null);
  };
  const steps = ["기본 정보", "작업 내용", "보상·일정", "참고자료·확인"];
  return (
    <div className="form-page">
      <div className="container">
        <Breadcrumb items={[{ label: "의뢰 등록" }]} />
        <div className="page-heading">
          <span className="eyebrow">START YOUR NEXT PROJECT</span>
          <h1>
            {expert ? (
              <>
                {expert.name}님과 <em>함께할 프로젝트</em>
              </>
            ) : (
              <>
                어떤 일을 <em>함께하고 싶으세요?</em>
              </>
            )}
          </h1>
          <p>
            작은 아이디어도 괜찮아요. 필요한 내용을 알려주시면 딱 맞는 동료를
            만날 수 있어요.
          </p>
        </div>
        <div className="request-layout">
          <div>
            <ol className="stepper">
              {steps.map((s, i) => (
                <li
                  key={s}
                  className={i === step ? "current" : i < step ? "done" : ""}
                >
                  <span>{i < step ? <Check size={17} /> : i + 1}</span>
                  <b>{s}</b>
                </li>
              ))}
            </ol>
            <form className="request-form" onSubmit={submit} noValidate>
              <div className="form-section-heading">
                <span className="eyebrow">STEP 0{step + 1}</span>
                <h2>
                  {
                    [
                      "프로젝트의 첫인상을 알려주세요",
                      "어떤 결과물을 기대하시나요?",
                      "예산과 일정을 정해주세요",
                      "등록 전, 마지막으로 확인해요",
                    ][step]
                  }
                </h2>
                <p>
                  필수 항목은 <i>*</i>로 표시되어 있어요.
                </p>
              </div>
              {step === 0 ? (
                <>
                  <Field label="프로젝트 제목" required>
                    <input
                      maxLength={80}
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                      placeholder="예: 학교 행사 포스터를 디자인해 주실 분을 찾아요"
                    />
                  </Field>
                  <div className="field">
                    <span>
                      어떤 분야의 일인가요? <i>*</i>
                    </span>
                    <div className="category-choices">
                      {categories.slice(1).map((c) => (
                        <button
                          type="button"
                          key={c}
                          className={form.category === c ? "selected" : ""}
                          onClick={() => update("category", c)}
                        >
                          {c}
                          {form.category === c && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="세부 분야" required>
                    <select
                      value={form.service}
                      onChange={(e) => update("service", e.target.value)}
                    >
                      <option value="">세부 분야를 선택해 주세요</option>
                      {Object.entries(services[form.category] || {}).map(
                        ([group, items]) => (
                          <optgroup key={group} label={group}>
                            {items.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </optgroup>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field
                    label="한 줄 요약"
                    required
                    hint={`${form.summary.length}/160자 · 목록 카드에 표시됩니다.`}
                  >
                    <input
                      maxLength={160}
                      value={form.summary}
                      onChange={(e) => update("summary", e.target.value)}
                      placeholder="어떤 도움이 필요한지 한 문장으로 설명해 주세요"
                    />
                  </Field>
                  <Field
                    label="필요한 기술·도구"
                    hint="쉼표로 구분해 주세요. 예: Figma, Photoshop"
                  >
                    <input
                      value={form.tags}
                      onChange={(e) => update("tags", e.target.value)}
                      placeholder="Figma, Illustrator, React …"
                    />
                  </Field>
                </>
              ) : step === 1 ? (
                <>
                  <Field
                    label="프로젝트 내용"
                    required
                    hint="작업의 목적, 대상, 준비된 내용을 적어주세요."
                  >
                    <textarea
                      rows={6}
                      value={form.content}
                      onChange={(e) => update("content", e.target.value)}
                      placeholder="어떤 프로젝트인가요? 동료가 이해할 수 있도록 설명해 주세요."
                    />
                  </Field>
                  <Field
                    label="원하는 결과물"
                    required
                    hint="결과물을 한 줄에 하나씩 적어 주세요."
                  >
                    <textarea
                      rows={4}
                      value={form.deliverables}
                      onChange={(e) => update("deliverables", e.target.value)}
                      placeholder={
                        "예: A2 포스터 1종\nSNS 홍보 이미지 1종\n편집 가능한 원본 파일"
                      }
                    />
                  </Field>
                  <Field
                    label="작업 요청사항"
                    hint="원하는 분위기, 수정 횟수 등 추가로 전달할 내용을 적어 주세요."
                  >
                    <textarea
                      rows={4}
                      value={form.requirements}
                      onChange={(e) => update("requirements", e.target.value)}
                      placeholder="밝고 트렌디한 분위기였으면 좋겠어요."
                    />
                  </Field>
                </>
              ) : step === 2 ? (
                <>
                  <Field label="예산 유형" required>
                    <select
                      value={form.budgetType}
                      onChange={(e) => update("budgetType", e.target.value)}
                    >
                      {["고정 금액", "범위", "협의"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  {form.budgetType !== "협의" && (
                    <div className="form-two-col">
                      <Field
                        label={
                          form.budgetType === "범위"
                            ? "최소 예산 (원)"
                            : "예산 (원)"
                        }
                        required
                      >
                        <input
                          type="number"
                          min="1"
                          max="1000000000"
                          value={form.budget}
                          onChange={(e) => update("budget", e.target.value)}
                          placeholder="100000"
                        />
                      </Field>
                      {form.budgetType === "범위" && (
                        <Field label="최대 예산 (원)" required>
                          <input
                            type="number"
                            min={form.budget || 1}
                            value={form.budgetMax}
                            onChange={(e) =>
                              update("budgetMax", e.target.value)
                            }
                            placeholder="200000"
                          />
                        </Field>
                      )}
                    </div>
                  )}
                  <div className="form-two-col">
                    <Field label="작업 희망 기간 (일)" required>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={form.days}
                        onChange={(e) => update("days", e.target.value)}
                        placeholder="7"
                      />
                    </Field>
                    <Field label="모집 마감일" required>
                      <input
                        type="date"
                        value={form.deadline}
                        min={new Date().toLocaleDateString("en-CA")}
                        onChange={(e) => update("deadline", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="진행 방식">
                    <select
                      value={form.mode}
                      onChange={(e) => update("mode", e.target.value)}
                    >
                      {["온라인", "오프라인", "혼합"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="form-hint">
                    <ShieldCheck size={20} />
                    <p>
                      플랫폼 내 결제는 제공하지 않아요.
                      <br />
                      합의한 금액은 당사자 간 직접 지급합니다.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Field
                    label="참고 링크 (선택)"
                    hint="공개된 기획서나 참고 이미지의 링크를 넣어주세요."
                  >
                    <input
                      type="url"
                      value={form.reference}
                      onChange={(e) => update("reference", e.target.value)}
                      placeholder="https://"
                    />
                  </Field>
                  <div className="request-preview">
                    <div className="inline between">
                      <span className="badge">
                        {form.category} · {form.service}
                      </span>
                      <b className="small muted">미리보기</b>
                    </div>
                    <h2>{form.title}</h2>
                    <p>{form.summary}</p>
                    <div className="preview-facts">
                      <b>{budgetLabel(form)}</b>
                      <span>{form.days}일</span>
                      <span>{form.mode}</span>
                    </div>
                    <h3>프로젝트 내용</h3>
                    <p className="preserve">{form.content}</p>
                    <h3>원하는 결과물</h3>
                    <p className="preserve">{form.deliverables}</p>
                    {form.requirements && (
                      <>
                        <h3>작업 요청사항</h3>
                        <p className="preserve">{form.requirements}</p>
                      </>
                    )}
                    <small className="muted">모집 마감 {form.deadline}</small>
                  </div>
                  <div className="form-hint">
                    <Lightbulb size={20} />
                    <p>
                      대표 이미지는 없어도 괜찮아요.
                      <br />
                      업무 내용과 조건을 보기 좋게 정리해 드립니다.
                    </p>
                  </div>
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                {step > 0 ? (
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => {
                      setStep((s) => s - 1);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} />
                    이전
                  </button>
                ) : (
                  <Link to="/" className="btn outline">
                    나중에 작성
                  </Link>
                )}
                <button
                  type="button"
                  className="text-button save-draft"
                  onClick={() =>
                    notify(
                      writeStored(draftKey, form)
                        ? "작성 중인 의뢰를 임시저장했어요."
                        : "저장 공간을 확인해 주세요.",
                    )
                  }
                >
                  <Save size={16} />
                  임시저장
                </button>
                <button className="btn primary" type="submit">
                  {step === 3
                    ? expert
                      ? "지정 요청 보내기"
                      : "의뢰 등록하기"
                    : "다음 단계"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <p className="autosave">
                <Check size={13} />
                {saveState}
              </p>
            </form>
          </div>
          <aside className="request-help">
            <div className="helper-card">
              <Lightbulb size={25} />
              <h3>
                좋은 의뢰의 시작은
                <br />
                명확한 설명이에요.
              </h3>
              <p>
                {
                  [
                    "누가, 무엇을, 왜 필요한지 간단하게 설명해 주세요. 동료가 프로젝트를 이해하는 데 도움이 돼요.",
                    "넘겨받고 싶은 결과물을 구체적으로 적어주세요. 작업 범위가 명확할수록 좋은 제안을 받을 수 있어요.",
                    "적정 예산이 고민된다면 협의로 등록해 보세요. 동료의 제안을 받아 결정할 수 있어요.",
                    "개인 연락처나 학번 같은 민감한 정보가 포함되어 있지 않은지 확인해 주세요.",
                  ][step]
                }
              </p>
            </div>
            <div className="sidebar-card">
              <h3>이렇게 진행돼요</h3>
              {[
                "의뢰 등록",
                "지원자와 대표작 확인",
                "함께할 동료 선정",
                "워크룸에서 프로젝트 시작",
              ].map((t, i) => (
                <p key={t}>
                  <span className="step-number">{i + 1}</span>
                  {t}
                </p>
              ))}
            </div>
            <p className="muted small">
              현재는 프론트엔드 데모입니다.
              <br />
              등록 내용은 이 브라우저에만 저장됩니다.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function ProposalForm() {
  const { id } = useParams();
  const { projects, proposals, setProposals, notify } = useApp();
  const navigate = useNavigate();
  const p = projects.find((x) => x.id === id);
  const [form, setForm] = useState(() =>
    readStored(`proposal-draft-${id}`, {
      message: "",
      budget: "",
      days: "",
      works: [],
    }),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    writeStored(`proposal-draft-${id}`, form);
  }, [form, id]);
  if (!p) return <NotFound />;
  const applied = proposals.some((x) => x.projectId === id);
  const blocked =
    p.ownerId === "me" ||
    applied ||
    p.status !== "OPEN" ||
    new Date(p.deadline + "T23:59:59") < new Date();
  if (blocked)
    return (
      <div className="container simple-page">
        <EmptyState
          title={
            applied
              ? "이미 지원한 프로젝트입니다"
              : "현재 지원할 수 없는 프로젝트입니다"
          }
          description="내 의뢰 또는 마감된 프로젝트에는 지원할 수 없어요."
        />
        <Link className="btn primary" to={`/projects/${id}`}>
          프로젝트로 돌아가기
        </Link>
      </div>
    );
  const submit = (e) => {
    e.preventDefault();
    if (
      !form.message.trim() ||
      !(Number(form.budget) > 0) ||
      !Number.isInteger(Number(form.days)) ||
      Number(form.days) < 1 ||
      Number(form.days) > 365
    ) {
      setError(
        "제안 내용, 0원보다 큰 금액, 1~365일의 예상 기간을 입력해 주세요.",
      );
      return;
    }
    setProposals((all) => [
      ...all,
      {
        ...form,
        id: crypto.randomUUID(),
        projectId: id,
        status: "SUBMITTED",
        createdAt: new Date().toISOString(),
      },
    ]);
    writeStored(`proposal-draft-${id}`, null);
    notify("제안이 저장되었어요. 마이페이지에서 확인할 수 있어요.");
    navigate(`/projects/${id}`);
  };
  return (
    <div className="container simple-page narrow">
      <Breadcrumb
        items={[
          { label: "일 찾기", to: "/projects" },
          { label: "프로젝트 상세", to: `/projects/${id}` },
          { label: "지원하기" },
        ]}
      />
      <div className="page-heading">
        <span className="eyebrow">SHOW YOUR POSSIBILITIES</span>
        <h1>
          나의 재능으로 <em>함께할게요</em>
        </h1>
        <p>{p.title}</p>
      </div>
      <form className="request-form" onSubmit={submit} noValidate>
        <div className="form-hint">
          <Verified />
          <p>
            경력과 기술은 프로필로 전달돼요.
            <br />이 프로젝트에 대한 제안과 대표작만 선택해 주세요.
          </p>
        </div>
        <Field label="제안 한마디" required>
          <textarea
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="어떻게 작업할지, 어떤 경험이 있는지 알려주세요."
          />
        </Field>
        <div className="form-two-col">
          <Field label="제안 금액 (원)" required>
            <input
              type="number"
              min="1"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
            />
          </Field>
          <Field label="예상 기간 (일)" required>
            <input
              type="number"
              min="1"
              max="365"
              value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value })}
            />
          </Field>
        </div>
        <div className="field">
          <span>
            이 의뢰에 보여줄 대표작 <small>최대 3개</small>
          </span>
          <p className="muted small">데모용 포트폴리오에서 선택합니다.</p>
          <div className="portfolio-picker">
            {portfolios.slice(0, 4).map((w) => (
              <label
                key={w.id}
                className={form.works.includes(w.id) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={form.works.includes(w.id)}
                  disabled={
                    !form.works.includes(w.id) && form.works.length >= 3
                  }
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      works: f.works.includes(w.id)
                        ? f.works.filter((x) => x !== w.id)
                        : [...f.works, w.id],
                    }))
                  }
                />
                <img src={asset(`portfolio/${w.image}`)} alt="" />
                <span>{w.title}</span>
              </label>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="btn outline" to={`/projects/${id}`}>
            취소
          </Link>
          <button className="btn primary">
            제안 보내기
            <Send size={16} />
          </button>
        </div>
        <p className="autosave">
          <Check size={13} />
          작성 내용은 이 브라우저에 자동 저장됩니다.
        </p>
      </form>
    </div>
  );
}
