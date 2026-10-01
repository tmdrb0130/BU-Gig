import { useState, useEffect, useRef } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, upload, errorText } from "./api";
import { Modal } from "./modal";
import { Picture, Verified, Pagination } from "./ui";
import {
  useSession,
  useQuery,
  useCommand,
  QueryState,
  ErrorMessage,
  isVerified,
} from "./session";
import {
  Page,
  Field,
  Action,
  Empty,
  Download,
  budget,
  status,
  date,
} from "./ui";
const defaults = {
  title: "",
  summary: "",
  content: "",
  deliverables: "",
  requirements: "",
  fieldId: "",
  skillIds: [],
  tags: [],
  budgetType: "FIXED",
  budgetMin: 100000,
  budgetMax: 100000,
  days: 7,
  mode: "ONLINE",
  mediaIds: [],
};
export function TermsForm({
  initial = {},
  onSubmit,
  submitLabel = "저장",
  busy,
  error,
  children,
  wizard = false,
  purpose = "DIRECT_REQUEST",
  uploadTarget,
  onDraft,
}) {
  const [terms, setTerms] = useState({
      ...defaults,
      referenceUrl: null,
      ...Object.fromEntries(
        Object.entries(initial).filter(
          ([key]) => key in defaults || key === "referenceUrl",
        ),
      ),
    }),
    [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false),
    [fileBusy, setFileBusy] = useState(false),
    [fileError, setFileError] = useState("");
  const tax = useQuery("/categories"),
    skills = useQuery("/skills");
  useEffect(() => {
    if (error) setDirty(true);
  }, [error]);
  const update = (k, v) => {
    setDirty(true);
    setTerms((t) => ({ ...t, [k]: v }));
  };
  useEffect(() => {
    if (!dirty) return;
    const leave = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const link = (e) => {
      const a = e.target.closest("a[href]");
      if (
        a &&
        a.origin === location.origin &&
        !a.hash &&
        !window.confirm("저장하지 않은 내용이 있습니다. 이동하시겠어요?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", link, true);
    };
  }, [dirty]);
  const body = () => ({
    ...terms,
    referenceUrl: terms.referenceUrl || null,
    budgetMin:
      terms.budgetType === "NEGOTIABLE" ? null : Number(terms.budgetMin),
    budgetMax:
      terms.budgetType === "NEGOTIABLE"
        ? null
        : Number(
            terms.budgetType === "FIXED" ? terms.budgetMin : terms.budgetMax,
          ),
    days: Number(terms.days),
  });
  const valid = (form, n) => {
    const nodes = [
      ...form.querySelectorAll(
        `[data-step="${n}"] input,[data-step="${n}"] select,[data-step="${n}"] textarea`,
      ),
    ];
    const invalid = nodes.find((e) => !e.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  };
  const textField = (key, label, max = 10000, required = true) => (
    <Field label={label}>
      {max > 160 ? (
        <textarea
          name={key}
          required={required}
          maxLength={max}
          value={terms[key] || ""}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <input
          name={key}
          required={required}
          maxLength={max}
          value={terms[key] || ""}
          onChange={(e) => update(key, e.target.value)}
        />
      )}
    </Field>
  );
  return (
    <div className="request-layout">
      <div>
        {wizard && (
          <ol className="stepper">
            {["기본 정보", "작업 내용", "보상·일정", "참고자료·확인"].map(
              (label, i) => (
                <li
                  className={i === step ? "active" : i < step ? "done" : ""}
                  key={label}
                >
                  <span>{i + 1}</span>
                  {label}
                </li>
              ),
            )}
          </ol>
        )}
        <form
          className="request-form release-form"
          noValidate
          onChange={() => setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            if (wizard && step < 3) {
              if (valid(form, step)) setStep(step + 1);
              return;
            }
            const bad = [0, 1, 2, 3].find(
              (n) =>
                ![
                  ...form.querySelectorAll(
                    `[data-step="${n}"] input,[data-step="${n}"] select,[data-step="${n}"] textarea`,
                  ),
                ].every((el) => el.checkValidity()),
            );
            if (bad !== undefined) {
              setStep(bad);
              setTimeout(() => valid(form, bad), 0);
              return;
            }
            setDirty(false);
            onSubmit(body());
          }}
        >
          <fieldset data-step="0" hidden={wizard && step !== 0}>
            <legend>기본 정보</legend>
            {textField("title", "제목", 80)}
            {textField("summary", "한 줄 요약", 160)}
            <Field label="활동 분야">
              <select
                name="fieldId"
                required
                value={terms.fieldId}
                onChange={(e) => update("fieldId", e.target.value)}
              >
                <option value="">분야 선택</option>
                {tax.data?.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="필요 기술">
              <select
                multiple
                value={terms.skillIds}
                onChange={(e) =>
                  update(
                    "skillIds",
                    [...e.target.selectedOptions].map((x) => x.value),
                  )
                }
              >
                {skills.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
          <fieldset data-step="1" hidden={wizard && step !== 1}>
            <legend>작업 내용</legend>
            {textField("content", "작업 내용")}
            {textField("deliverables", "원하는 결과물")}
            {textField("requirements", "요청사항", 10000, false)}
          </fieldset>
          <fieldset data-step="2" hidden={wizard && step !== 2}>
            <legend>보상·일정</legend>
            <Field label="예산 유형">
              <select
                value={terms.budgetType}
                onChange={(e) => update("budgetType", e.target.value)}
              >
                <option value="FIXED">고정 금액</option>
                <option value="RANGE">범위</option>
                <option value="NEGOTIABLE">협의</option>
              </select>
            </Field>
            {terms.budgetType !== "NEGOTIABLE" && (
              <div className="form-row">
                <Field label="예산 (원)">
                  <input
                    type="number"
                    min="1"
                    max="1000000000"
                    required
                    value={terms.budgetMin ?? ""}
                    onChange={(e) => update("budgetMin", e.target.value)}
                  />
                </Field>
                {terms.budgetType === "RANGE" && (
                  <Field label="최대 예산 (원)">
                    <input
                      type="number"
                      min={terms.budgetMin || 1}
                      max="1000000000"
                      required
                      value={terms.budgetMax ?? ""}
                      onChange={(e) => update("budgetMax", e.target.value)}
                    />
                  </Field>
                )}
              </div>
            )}
            <div className="form-row">
              <Field label="작업 기간 (일)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  required
                  value={terms.days}
                  onChange={(e) => update("days", e.target.value)}
                />
              </Field>
              <Field label="진행 방식">
                <select
                  value={terms.mode}
                  onChange={(e) => update("mode", e.target.value)}
                >
                  <option value="ONLINE">온라인</option>
                  <option value="OFFLINE">오프라인</option>
                  <option value="HYBRID">혼합</option>
                </select>
              </Field>
            </div>
            {children}
          </fieldset>
          <fieldset data-step="3" hidden={wizard && step !== 3}>
            <legend>참고자료·확인</legend>
            <Field label="참고 링크">
              <input
                type="url"
                pattern="https?://.*"
                placeholder="https://"
                value={terms.referenceUrl || ""}
                onChange={(e) => update("referenceUrl", e.target.value)}
              />
            </Field>
            <Field label="참고자료 첨부">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                disabled={fileBusy}
                onChange={async (e) => {
                  setFileBusy(true);
                  setFileError("");
                  try {
                    const files = [...e.target.files];
                    if (files.length + terms.mediaIds.length > 10)
                      throw Error("최대 10개까지 첨부할 수 있습니다.");
                    for (const f of files) {
                      if (f.size > 20 * 1024 * 1024)
                        throw Error("파일당 최대 20MB입니다.");
                      const target = await uploadTarget?.(body());
                      const id = await upload(f, purpose, target);
                      setTerms((t) => ({
                        ...t,
                        mediaIds: [...t.mediaIds, id],
                      }));
                    }
                    setDirty(true);
                  } catch (e) {
                    setFileError(errorText(e));
                  } finally {
                    setFileBusy(false);
                  }
                }}
              />
            </Field>
            {fileBusy && <p role="status">파일 전송·검사 중…</p>}
            {fileError && <p role="alert">{fileError}</p>}
            {terms.mediaIds.map((mid, i) => (
              <div className="release-file" key={mid}>
                <Download id={mid}>첨부 {i + 1}</Download>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "mediaIds",
                      terms.mediaIds.filter((x) => x !== mid),
                    )
                  }
                >
                  제거
                </button>
              </div>
            ))}
            {wizard && (
              <section className="request-preview">
                <h2>등록 전 미리보기</h2>
                <span className="badge">
                  {tax.data?.fields.find((f) => f.id === terms.fieldId)?.label}
                </span>
                <h3>{terms.title}</h3>
                <p>{terms.summary}</p>
                <b>
                  {budget(body())} · {terms.days}일
                </b>
                <h3>작업 내용</h3>
                <p className="preserve">{terms.content}</p>
                <h3>원하는 결과물</h3>
                <p className="preserve">{terms.deliverables}</p>
              </section>
            )}
          </fieldset>
          <ErrorMessage error={error} />
          <div className="form-actions">
            {wizard && step > 0 && (
              <button
                type="button"
                className="btn outline"
                onClick={() => setStep(step - 1)}
              >
                이전
              </button>
            )}
            {onDraft && (
              <button
                type="button"
                className="btn outline"
                disabled={busy || fileBusy}
                onClick={() => {
                  setDirty(false);
                  onDraft(body());
                }}
              >
                임시저장
              </button>
            )}
            <button className="btn primary" disabled={busy || fileBusy}>
              {busy ? "저장 중…" : wizard && step < 3 ? "다음" : submitLabel}
            </button>
          </div>
        </form>
      </div>
      <aside className="request-help">
        <h3>좋은 의뢰를 만드는 방법</h3>
        <p>무엇을, 언제까지, 어떤 결과물로 받고 싶은지 알려주세요.</p>
        <p>대표 이미지 없이도 내용을 읽기 좋게 구성해 드립니다.</p>
        <Link to="/guide">이용 가이드 →</Link>
      </aside>
    </div>
  );
}
export function Request() {
  const uploadDraft = useRef(null);
  const [params] = useSearchParams(),
    expertId = params.get("expert"),
    draftId = params.get("draft");
  const expert = useQuery(expertId ? `/experts/${expertId}` : null),
    draft = useQuery(draftId ? `/projects/${draftId}` : null),
    s = useSession(),
    nav = useNavigate();
  const [deadline, setDeadline] = useState("");
  const [workingDraft, setWorkingDraft] = useState(null);
  const savedId = workingDraft?.id || draftId,
    savedVersion = workingDraft?.version || draft.data?.version;
  useEffect(() => {
    if (draft.data?.closesAt)
      setDeadline(
        new Date(Date.parse(draft.data.closesAt) + 9 * 3600000)
          .toISOString()
          .slice(0, 10),
      );
  }, [draft.data?.id]);
  const c = useCommand((r) =>
    nav(expertId ? `/direct-requests/${r.id}` : `/my/projects/${r.id}`),
  );
  const q = expertId ? expert : draft;
  return (
    <Page title={expertId ? "지정 요청 작성" : "의뢰 작성"}>
      <QueryState query={q}>
        {(!expertId || expert.data) && (!draftId || draft.data) && (
          <>
            {expertId && <p>{expert.data.displayName}님에게만 전달됩니다.</p>}
            {!isVerified(s.session) && (
              <p>
                초안을 저장할 수 있습니다. 실제 게시·지정 요청에는{" "}
                <Link to="/my/verification">학교 인증</Link>이 필요합니다.
              </p>
            )}
            <TermsForm
              wizard
              uploadTarget={
                expertId
                  ? undefined
                  : async (terms) => {
                      if (savedId) return savedId;
                      uploadDraft.current ||= api("/projects", {
                        method: "POST",
                        body: { terms },
                      });
                      let r;
                      try {
                        r = await uploadDraft.current;
                      } catch (e) {
                        uploadDraft.current = null;
                        throw e;
                      }
                      setWorkingDraft(r.data);
                      return r.data.id;
                    }
              }
              purpose={expertId ? "DIRECT_REQUEST" : "PROJECT"}
              onDraft={
                !expertId
                  ? (terms) =>
                      c.run(
                        savedId ? `/projects/${savedId}` : "/projects",
                        {
                          terms,
                          ...(deadline
                            ? {
                                closesAt: new Date(
                                  deadline + "T23:59:59+09:00",
                                ).toISOString(),
                              }
                            : {}),
                          ...(savedId ? { expectedVersion: savedVersion } : {}),
                        },
                        savedId ? "PATCH" : "POST",
                      )
                  : undefined
              }
              key={draftId || expertId || "new"}
              initial={draft.data || {}}
              busy={c.busy}
              error={c.error}
              submitLabel={expertId ? "지정 요청 보내기" : "의뢰 초안 저장"}
              onSubmit={(terms) => {
                if (!deadline) return;
                const closesAt = new Date(
                  deadline + "T23:59:59+09:00",
                ).toISOString();
                if (expertId)
                  c.run("/direct-requests", {
                    recipientId: expert.data.userId,
                    mediaIds: terms.mediaIds,
                    terms,
                    expiresAt: closesAt,
                  });
                else if (savedId)
                  c.run(
                    `/projects/${savedId}`,
                    { terms, closesAt, expectedVersion: savedVersion },
                    "PATCH",
                  );
                else c.run("/projects", { terms, closesAt });
              }}
            >
              <Field label={expertId ? "응답 마감일" : "모집 마감일"}>
                <input
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </TermsForm>
          </>
        )}
      </QueryState>
    </Page>
  );
}
export function Apply() {
  const { id } = useParams(),
    p = useQuery(`/projects/${id}`),
    works = useQuery("/me/portfolios?pageSize=50"),
    s = useSession(),
    nav = useNavigate(),
    [selected, setSelected] = useState([]),
    [share, setShare] = useState(false);
  const [files, setFiles] = useState([]);
  const c = useCommand((r) => nav(`/my/proposals/${r.id}`));
  return (
    <Page title="프로젝트 지원">
      <QueryState query={p}>
        {p.data && (
          <>
            <h2>{p.data.title}</h2>
            {!isVerified(s.session) ? (
              <Empty to="/my/verification" label="학교 인증 신청">
                학교 인증 후 지원할 수 있어요.
              </Empty>
            ) : p.data.owner?.userId === s.user.id ||
              p.data.status !== "OPEN" ||
              Date.parse(p.data.closesAt) <= Date.now() ? (
              <Empty>현재 지원할 수 없는 의뢰입니다.</Empty>
            ) : (
              <form
                className="request-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const ids = selected.map(
                    (id) =>
                      works.data.find((w) => w.id === id).currentVersionId,
                  );
                  c.run(`/projects/${id}/proposals`, {
                    content: f.get("content"),
                    amount: Number(f.get("amount")),
                    days: Number(f.get("days")),
                    portfolioVersionIds: ids,
                    explicitShareIds: share ? ids : [],
                    mediaIds: files,
                  });
                }}
              >
                <Field label="제안 내용">
                  <textarea name="content" required maxLength={10000} />
                </Field>
                <Field label="제안 금액 (원)">
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    max="1000000000"
                    required
                  />
                </Field>
                <Field label="예상 기간 (일)">
                  <input name="days" type="number" min="1" max="365" required />
                </Field>
                <AttachmentInput
                  purpose="PROPOSAL"
                  targetId={id}
                  files={files}
                  setFiles={setFiles}
                />
                <h3>본인 대표작 선택 (선택, 최대 3개)</h3>
                <QueryState query={works}>
                  {works.data?.length ? (
                    works.data.map((w) => (
                      <label key={w.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(w.id)}
                          disabled={
                            !selected.includes(w.id) && selected.length >= 3
                          }
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked
                                ? [...ids, w.id]
                                : ids.filter((id) => id !== w.id),
                            )
                          }
                        />
                        {w.title} · {status(w.visibility)}
                      </label>
                    ))
                  ) : (
                    <p>
                      등록한 대표작이 없습니다. 대표작 없이 지원하거나{" "}
                      <Link to="/my/portfolios">작업물을 등록</Link>할 수
                      있어요.
                    </p>
                  )}
                </QueryState>
                {selected.length > 0 && (
                  <label>
                    <input
                      type="checkbox"
                      required
                      checked={share}
                      onChange={(e) => setShare(e.target.checked)}
                    />
                    선택한 작업물의 현재 버전을 의뢰자에게 공유합니다. 이후
                    수정과 별도로 제출 버전이 보존됩니다.
                  </label>
                )}
                <button className="btn primary" disabled={c.busy}>
                  지원서 제출
                </button>
                <ErrorMessage error={c.error} />
              </form>
            )}
          </>
        )}
      </QueryState>
    </Page>
  );
}
export function ManageProject() {
  const [selected, setSelected] = useState([]),
    [compare, setCompare] = useState(false),
    [page, setPage] = useState(1);
  const { id } = useParams(),
    p = useQuery(`/projects/${id}`),
    proposals = useQuery(
      p.data && p.data.status !== "DRAFT"
        ? `/projects/${id}/proposals?pageSize=12&page=${page}`
        : null,
    ),
    s = useSession(),
    nav = useNavigate();
  const c = useCommand((r) =>
    r.workroomId ? nav(`/workrooms/${r.workroomId}`) : p.reload(),
  );
  return (
    <Page title="내 의뢰 관리">
      <QueryState query={p}>
        {p.data && (
          <>
            <h2>{p.data.title}</h2>
            <p>
              {status(p.data.status)} · {budget(p.data)}
            </p>
            {p.data.owner.userId !== s.user.id ? (
              <Empty>관리 권한이 없습니다.</Empty>
            ) : (
              <>
                <div className="form-actions">
                  {["DRAFT", "OPEN", "CLOSED"].includes(p.data.status) && (
                    <Link to={`/request/new?draft=${id}`}>내용 수정</Link>
                  )}
                  {p.data.status === "DRAFT" && (
                    <button
                      className="btn primary"
                      disabled={c.busy}
                      onClick={() =>
                        c.run(`/projects/${id}/publish`, {
                          expectedVersion: p.data.version,
                        })
                      }
                    >
                      의뢰 게시
                    </button>
                  )}
                  {p.data.status === "OPEN" && (
                    <Action
                      path={`/projects/${id}/close`}
                      body={{ expectedVersion: p.data.version }}
                      onDone={p.reload}
                    >
                      모집 마감
                    </Action>
                  )}
                  {["DRAFT", "OPEN", "CLOSED"].includes(p.data.status) && (
                    <Action
                      path={`/projects/${id}/cancel`}
                      body={{ expectedVersion: p.data.version }}
                      onDone={p.reload}
                    >
                      의뢰 취소
                    </Action>
                  )}
                </div>
                <ErrorMessage error={c.error} />
                <h2>받은 지원</h2>
                <button
                  className="btn outline"
                  disabled={selected.length < 2}
                  onClick={() => setCompare(true)}
                >
                  선택한 지원자 비교 ({selected.length}/3)
                </button>
                {compare && (
                  <Modal title="지원자 비교" onClose={() => setCompare(false)}>
                    <div className="release-compare">
                      {selected.map((a) => (
                        <ProposalCompare key={a.id} proposal={a} />
                      ))}
                    </div>
                  </Modal>
                )}
                <QueryState query={proposals}>
                  {proposals.data?.length ? (
                    proposals.data.map((a) => (
                      <article className="live-card" key={a.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.some((x) => x.id === a.id)}
                            disabled={
                              !selected.some((x) => x.id === a.id) &&
                              selected.length >= 3
                            }
                            onChange={(e) =>
                              setSelected((all) =>
                                e.target.checked
                                  ? [...all, a]
                                  : all.filter((x) => x.id !== a.id),
                              )
                            }
                          />
                          비교 선택
                        </label>
                        <h3>
                          {a.applicant?.displayName || "지원자"}{" "}
                          <Verified value={a.applicant?.schoolVerified} />
                        </h3>
                        <p>{a.content}</p>
                        <p>
                          {a.amount}원 · {a.days}일 · {status(a.status)}
                        </p>
                        <Link to={`/my/proposals/${a.id}`}>
                          지원서·대표작 확인
                        </Link>
                        {["OPEN", "CLOSED"].includes(p.data.status) &&
                          ["SUBMITTED", "IN_DISCUSSION"].includes(a.status) && (
                            <>
                              <button
                                className="btn primary"
                                disabled={c.busy}
                                onClick={() =>
                                  c.run(`/projects/${id}/selection`, {
                                    expectedVersion: p.data.version,
                                    proposalId: a.id,
                                    proposalRevisionId: a.currentRevisionId,
                                    acknowledgedProjectRevisionId:
                                      p.data.currentRevisionId,
                                  })
                                }
                              >
                                이 지원자 선정
                              </button>
                              <Action
                                path={`/proposals/${a.id}/reject`}
                                body={{ expectedVersion: a.version }}
                                onDone={proposals.reload}
                              >
                                지원 거절
                              </Action>
                            </>
                          )}
                      </article>
                    ))
                  ) : (
                    <Empty>아직 받은 지원이 없어요.</Empty>
                  )}
                </QueryState>
                <Pagination
                  meta={proposals.meta}
                  page={page}
                  setPage={setPage}
                />
                <Link to="/workrooms">내 워크룸 보기</Link>
              </>
            )}
          </>
        )}
      </QueryState>
    </Page>
  );
}
function AttachmentInput({ purpose, targetId, files, setFiles }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="live-card">
      <Field label="참고자료 첨부 (선택)">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
          disabled={busy || files.length >= 10}
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const id = await upload(file, purpose, targetId);
              setFiles((old) => [...old, id]);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </Field>
      <p role="status">{busy ? "파일 검사 중…" : `첨부 ${files.length}개`}</p>
      {files.map((id, i) => (
        <div key={id}>
          <Download id={id}>참고자료 {i + 1}</Download>
          <button
            type="button"
            onClick={() => setFiles((old) => old.filter((x) => x !== id))}
          >
            첨부 삭제
          </button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function ProposalCompare({ proposal: a }) {
  const q = useQuery(`/proposals/${a.id}`);
  return (
    <article className="live-card">
      <Picture avatar src={a.applicant?.avatarUrl} />
      <h3>{a.applicant?.displayName || "지원자"}</h3>
      <Verified value={a.applicant?.schoolVerified} />
      <dl>
        <dt>제안 금액</dt>
        <dd>{Number(a.amount).toLocaleString()}원</dd>
        <dt>예상 기간</dt>
        <dd>{a.days}일</dd>
      </dl>
      <p>{a.content}</p>
      <QueryState query={q}>
        {q.data?.portfolios.map((p) => (
          <div key={p.portfolioVersionId}>
            <h4>{p.metadata.title}</h4>
            {p.metadata.mediaIds?.map((id) => (
              <Download key={id} id={id}>
                제출 대표작 확인
              </Download>
            ))}
          </div>
        ))}
      </QueryState>
      {a.applicant?.profileId && (
        <Link to={`/experts/${a.applicant.profileId}`}>공개 프로필 보기</Link>
      )}
    </article>
  );
}
export function Proposal() {
  const { id } = useParams(),
    q = useQuery(`/proposals/${id}`),
    s = useSession();
  const [editing, setEditing] = useState(false);
  return (
    <Page title="지원 내용">
      <QueryState query={q}>
        {q.data && (
          <>
            <p>{status(q.data.status)}</p>
            {q.data.attachments?.map((a) => (
              <Download key={a.mediaId} id={a.mediaId}>
                {a.name}
              </Download>
            ))}
            {q.data.revisions.map((r) => (
              <article className="live-card" key={r.id}>
                <p>{r.content}</p>
                <p>
                  {r.amount}원 · {r.days}일
                </p>
              </article>
            ))}
            {q.data.portfolios.map((p) => (
              <article className="live-card" key={p.portfolioVersionId}>
                <h3>{p.metadata.title}</h3>
                <p>{p.metadata.summary}</p>
                {p.metadata.mediaIds?.map((mid) => (
                  <Download key={mid} id={mid}>
                    공유 대표작 보기
                  </Download>
                ))}
              </article>
            ))}
            {s.user.id === q.data.applicantId &&
              ["SUBMITTED", "IN_DISCUSSION"].includes(q.data.status) && (
                <>
                  <button
                    className="btn primary"
                    onClick={() => setEditing(true)}
                  >
                    지원서 수정
                  </button>
                  <Action
                    path={`/proposals/${id}/withdraw`}
                    body={{ expectedVersion: q.data.version }}
                    onDone={q.reload}
                  >
                    지원 철회
                  </Action>
                </>
              )}
            {editing && (
              <Modal title="지원서 수정" onClose={() => setEditing(false)}>
                <ProposalEdit
                  proposal={q.data}
                  done={() => {
                    setEditing(false);
                    q.reload();
                  }}
                />
              </Modal>
            )}
            <Link to={`/projects/${q.data.projectId}`}>의뢰 보기</Link>
          </>
        )}
      </QueryState>
    </Page>
  );
}
function ProposalEdit({ proposal: p, done }) {
  const current =
      p.revisions.find((r) => r.id === p.currentRevisionId) ||
      p.revisions.at(-1),
    [files, setFiles] = useState(p.attachments?.map((a) => a.mediaId) || []),
    c = useCommand(done);
  return (
    <form
      className="release-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ids = p.portfolios.map((w) => w.portfolioVersionId);
        c.run(
          `/proposals/${p.id}`,
          {
            expectedVersion: p.version,
            content: f.get("content"),
            amount: Number(f.get("amount")),
            days: Number(f.get("days")),
            portfolioVersionIds: ids,
            explicitShareIds: ids,
            mediaIds: files,
          },
          "PATCH",
        );
      }}
    >
      <Field label="제안 내용">
        <textarea
          name="content"
          defaultValue={current.content}
          required
          maxLength={10000}
        />
      </Field>
      <Field label="제안 금액 (원)">
        <input
          name="amount"
          type="number"
          min="1"
          max="1000000000"
          defaultValue={current.amount}
          required
        />
      </Field>
      <Field label="예상 기간 (일)">
        <input
          name="days"
          type="number"
          min="1"
          max="365"
          defaultValue={current.days}
          required
        />
      </Field>
      <p>기존에 공유한 대표작 버전은 유지됩니다.</p>
      <AttachmentInput
        purpose="PROPOSAL"
        targetId={p.projectId}
        files={files}
        setFiles={setFiles}
      />
      <button className="btn primary" disabled={c.busy}>
        지원서 변경 저장
      </button>
      <ErrorMessage error={c.error} />
    </form>
  );
}
export function DirectRequest() {
  const { id } = useParams(),
    q = useQuery(`/direct-requests/${id}`),
    s = useSession(),
    nav = useNavigate(),
    [quote, setQuote] = useState(false);
  const chat = useCommand((r) => nav(`/messages/${r.id}`));
  const c = useCommand((r) =>
    r.workroomId
      ? nav(`/workrooms/${r.workroomId}`)
      : (setQuote(false), q.reload()),
  );
  const r = q.data,
    t = r?.terms.find((t) => t.id === r.latestTermsId),
    pending = r?.status === "PENDING" && Date.parse(r.expiresAt) > Date.now();
  return (
    <Page title="지정 요청">
      <QueryState query={q}>
        {r && t && (
          <>
            <h2>{t.terms.title}</h2>
            <p>
              {status(r.status)} · 응답 마감 {date(r.expiresAt)}
            </p>
            <p>{t.terms.content}</p>
            <p>결과물: {t.terms.deliverables}</p>
            <b>
              {budget(t.terms)} · {t.terms.days}일
            </b>
            <p>{t.kind === "QUOTE" ? "최신 견적" : "최초 요청 조건"}</p>
            {pending && (
              <div className="form-actions">
                <button
                  className="btn outline"
                  disabled={chat.busy}
                  onClick={() =>
                    chat.run("/conversations", { directRequestId: id })
                  }
                >
                  조건 문의하기
                </button>
                <ErrorMessage error={chat.error} />
                {(t.kind === "ORIGINAL" ? r.recipientId : r.senderId) ===
                  s.user.id && (
                  <button
                    className="btn primary"
                    disabled={c.busy}
                    onClick={() =>
                      c.run(`/direct-requests/${id}/accept`, {
                        expectedVersion: r.version,
                        termsId: t.id,
                      })
                    }
                  >
                    이 조건 수락
                  </button>
                )}
                {s.user.id === r.recipientId ? (
                  <>
                    <button
                      className="btn outline"
                      onClick={() => setQuote(!quote)}
                    >
                      새 견적 제안
                    </button>
                    <Action
                      path={`/direct-requests/${id}/reject`}
                      body={{ expectedVersion: r.version }}
                      onDone={q.reload}
                    >
                      거절
                    </Action>
                  </>
                ) : (
                  <Action
                    path={`/direct-requests/${id}/cancel`}
                    body={{ expectedVersion: r.version }}
                    onDone={q.reload}
                  >
                    요청 취소
                  </Action>
                )}
              </div>
            )}
            <ErrorMessage error={c.error} />
            {quote && pending && (
              <TermsForm
                initial={t.terms}
                busy={c.busy}
                error={c.error}
                submitLabel="견적 보내기"
                onSubmit={(terms) =>
                  c.run(`/direct-requests/${id}/quotes`, {
                    terms,
                    mediaIds: terms.mediaIds || [],
                    expectedVersion: r.version,
                  })
                }
              />
            )}
            <details>
              <summary>조건 변경 이력</summary>
              {r.terms.map((t) => (
                <p key={t.id}>
                  {t.revisionNo}차 · {budget(t.terms)} · {t.terms.days}일
                </p>
              ))}
            </details>
            {r.status === "ACCEPTED" && (
              <Link className="btn primary" to="/workrooms">
                워크룸 목록
              </Link>
            )}
          </>
        )}
      </QueryState>
    </Page>
  );
}
export function Portfolios() {
  const [editing, setEditing] = useState(null),
    [preview, setPreview] = useState(null),
    [page, setPage] = useState(1);
  const q = useQuery(`/me/portfolios?pageSize=12&page=${page}`),
    tax = useQuery("/categories"),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const c = useCommand(() => {
    q.reload();
    setFiles([]);
    setEditing(null);
  });
  return (
    <Page title="내 작업물">
      <FeaturedPortfolios portfolios={q.data || []} />
      <p>
        기존 결과물의 제목·소개·역할과 파일을 등록합니다. 공개 거래 실적 표시는
        완료 거래의 별도 공개 승인이 있어야 부여됩니다.
      </p>
      <form
        className="request-form release-form"
        key={editing?.id || "new"}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          c.run(
            editing ? `/portfolios/${editing.id}` : "/portfolios",
            {
              title: f.get("title"),
              summary: f.get("summary"),
              role: f.get("role"),
              fieldId: f.get("fieldId"),
              mediaIds: files,
              ...(editing
                ? {
                    expectedVersion: editing.version,
                    skillIds: editing.skillIds || [],
                  }
                : {}),
            },
            editing ? "PATCH" : "POST",
          );
        }}
      >
        {[
          ["title", "작업물 제목"],
          ["summary", "작업물 소개"],
          ["role", "담당 역할"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              defaultValue={editing?.[key] || ""}
              required
              maxLength={key === "title" ? 100 : 200}
            />
          </Field>
        ))}
        <Field label="분야">
          <select name="fieldId" required defaultValue={editing?.fieldId || ""}>
            <option value="">선택</option>
            {tax.data?.fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="작업 이미지 (최대 10개)">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={busy}
            onChange={async (e) => {
              setBusy(true);
              setError("");
              try {
                const picked = [...e.target.files];
                if (picked.length + files.length > 10)
                  throw new Error("이미지는 최대 10개입니다.");
                const mids = [];
                for (const f of picked) mids.push(await upload(f, "PORTFOLIO"));
                setFiles((all) => [...all, ...mids]);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
        <p>{busy ? "파일 검사 중…" : `준비된 파일 ${files.length}개`}</p>
        {files.map((mid, i) => (
          <div className="release-file" key={mid}>
            <Download id={mid}>
              첨부 {i + 1}
              {i === 0 ? " · 대표 이미지" : ""}
            </Download>
            <button
              type="button"
              disabled={!i}
              onClick={() =>
                setFiles((all) => {
                  const next = [...all];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  return next;
                })
              }
            >
              위로
            </button>
            <button
              type="button"
              onClick={() => setFiles((all) => all.filter((x) => x !== mid))}
            >
              제거
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn outline"
          onClick={(e) => {
            const f = new FormData(e.currentTarget.form);
            setPreview({ ...Object.fromEntries(f), mediaIds: files });
          }}
        >
          미리보기
        </button>
        <button className="btn primary" disabled={busy || c.busy}>
          {editing ? "작업물 수정 저장" : "작업물 초안 저장"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFiles([]);
            }}
          >
            수정 취소
          </button>
        )}
        <ErrorMessage error={c.error} />
        {error && <p role="alert">{error}</p>}
      </form>
      {preview && (
        <Modal title="작업물 미리보기" onClose={() => setPreview(null)}>
          <div className="portfolio-editor-preview">
            <h2>{preview.title}</h2>
            <p>{preview.summary}</p>
            <p>담당 역할: {preview.role}</p>
            {preview.mediaIds.map((id) => (
              <Picture key={id} src={`/api/v1/media/${id}/preview`} />
            ))}
          </div>
        </Modal>
      )}
      <QueryState query={q}>
        {q.data?.map((w) => (
          <article className="live-card" key={w.id}>
            <h2>{w.title}</h2>
            <p>{status(w.visibility)}</p>
            <button
              className="btn outline"
              onClick={() => {
                setEditing(w);
                setFiles(w.mediaIds || []);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              작업물 수정
            </button>
            {w.visibility === "PUBLIC" && (
              <Link to={`/works/${w.id}`}>공개 화면 보기</Link>
            )}
            {w.visibility === "PUBLIC" &&
              w.currentVersionId !== w.publishedVersionId && (
                <Action
                  path={`/portfolios/${w.id}/publish`}
                  body={{ expectedVersion: w.version }}
                  onDone={q.reload}
                >
                  수정본 공개
                </Action>
              )}
            <Action
              path={`/portfolios/${w.id}/${w.visibility === "PUBLIC" ? "unpublish" : "publish"}`}
              body={{ expectedVersion: w.version }}
              onDone={q.reload}
            >
              {w.visibility === "PUBLIC" ? "비공개로 변경" : "공개하기"}
            </Action>
          </article>
        ))}
      </QueryState>
      <Pagination meta={q.meta} page={page} setPage={setPage} />
    </Page>
  );
}
function FeaturedPortfolios({ portfolios }) {
  const profile = useQuery("/me/profile"),
    [selected, setSelected] = useState(null),
    [saved, setSaved] = useState(false);
  const command = useCommand(() => {
    profile.reload();
    setSelected(null);
    setSaved(true);
  });
  const ids = selected || profile.data?.featuredPortfolioIds || [];
  return (
    <section className="live-card">
      <h2>대표 작업물</h2>
      <p>공개한 본인 작업물을 최대 3개 선택해 전문가 프로필에 표시합니다.</p>
      <QueryState query={profile}>
        <ol>
          {ids.map((id, i) => (
            <li key={id}>
              {portfolios.find((p) => p.id === id)?.title || "선택한 작업물"}{" "}
              <button
                disabled={!i}
                onClick={() => {
                  const next = [...ids];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setSelected(next);
                  setSaved(false);
                }}
              >
                위로
              </button>
            </li>
          ))}
        </ol>
        {portfolios
          .filter((p) => p.visibility === "PUBLIC")
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={ids.includes(p.id)}
                disabled={!ids.includes(p.id) && ids.length >= 3}
                onChange={(e) => {
                  setSaved(false);
                  setSelected(
                    e.target.checked
                      ? [...ids, p.id]
                      : ids.filter((id) => id !== p.id),
                  );
                }}
              />
              {p.title}
            </label>
          ))}
        <button
          disabled={!profile.data || command.busy}
          onClick={() =>
            command.run(
              "/me/featured-portfolios",
              { portfolioIds: ids, expectedVersion: profile.data.version },
              "PUT",
            )
          }
        >
          대표 작업물 저장
        </button>
      </QueryState>
      <ErrorMessage error={command.error} />
      {saved && <p role="status">대표 작업물을 저장했습니다.</p>}
    </section>
  );
}
export function Publications() {
  const q = useQuery("/me/publication-requests?pageSize=50");
  return (
    <Page title="작업물 공개 승인">
      <QueryState query={q}>
        {q.data?.length ? (
          q.data.map((r) => (
            <Publication key={r.id} request={r} reload={q.reload} />
          ))
        ) : (
          <Empty>
            공개 승인 요청이 없습니다. 완료한 워크룸에서 본인 작업물의 공개
            승인을 요청할 수 있습니다.
          </Empty>
        )}
      </QueryState>
    </Page>
  );
}
function Publication({ request: r, reload }) {
  const { user } = useSession();
  const detail = useQuery(`/publication-requests/${r.id}`);
  return (
    <article className="live-card">
      <p>{status(r.state)}</p>
      <p>대상 버전 {r.portfolioVersionId}</p>
      <QueryState query={detail}>
        {detail.data?.portfolioVersion && (
          <>
            <h3>{detail.data.portfolioVersion.body.title}</h3>
            <p>{detail.data.portfolioVersion.body.summary}</p>
            {detail.data.portfolioVersion.body.mediaIds?.map((id) => (
              <Download key={id} id={id}>
                공개 요청 결과물 확인
              </Download>
            ))}
          </>
        )}
      </QueryState>
      {r.state === "PENDING_APPROVAL" &&
        (r.requesterId === user.id ? (
          <Action
            path={`/publication-requests/${r.id}/cancel`}
            body={{ expectedVersion: r.version }}
            onDone={reload}
          >
            요청 취소
          </Action>
        ) : (
          <>
            <Action
              path={`/publication-requests/${r.id}/approve`}
              body={{ expectedVersion: r.version }}
              onDone={reload}
              disabled={!detail.data}
            >
              공개 승인
            </Action>
            <Action
              path={`/publication-requests/${r.id}/reject`}
              body={{ expectedVersion: r.version }}
              onDone={reload}
            >
              거절
            </Action>
          </>
        ))}
    </article>
  );
}
