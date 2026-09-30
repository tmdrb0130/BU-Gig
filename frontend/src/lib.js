export function readStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(`bu-gig:${key}`));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key, value) {
  try {
    localStorage.setItem(`bu-gig:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export const money = (value) => Number(value).toLocaleString("ko-KR") + "원";
export function deadlineDays(date, now = new Date()) {
  const end = new Date(`${date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end - today) / 86400000));
}
export const budgetLabel = (p) =>
  p.budgetType === "협의"
    ? "협의"
    : p.budgetType === "범위"
      ? `${Number(p.budget).toLocaleString("ko-KR")}~${money(p.budgetMax)}`
      : money(p.budget);
export function parseBudgetRange(minimum = "", maximum = "") {
  const parse = (value) => {
    const text = String(value ?? "")
      .trim()
      .replaceAll(",", "");
    if (!text) return null;
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text))
      ? Number(text)
      : NaN;
  };
  const min = parse(minimum);
  const max = parse(maximum);
  const error =
    Number.isNaN(min) || Number.isNaN(max)
      ? "금액은 0 이상의 정수로 입력해 주세요."
      : min !== null && max !== null && min > max
        ? "최대 금액은 최소 금액 이상이어야 해요."
        : "";
  return { min, max, error, active: min !== null || max !== null };
}
export function budgetRangeLabel(range) {
  if (range.error) return "예산 범위 확인 필요";
  if (range.min !== null && range.max !== null)
    return `예산 ${money(range.min)} ~ ${money(range.max)}`;
  if (range.min !== null) return `예산 ${money(range.min)} 이상`;
  if (range.max !== null) return `예산 ${money(range.max)} 이하`;
  return "전체 예산";
}
// A field is a category plus an optional service. Whole-category selections
// subsume their children; different fields are alternatives (OR).
export function normalizeFields(fields) {
  const unique = [
    ...new Map(fields.map((field) => [JSON.stringify(field), field])).values(),
  ];
  const whole = new Set(
    unique.filter((field) => !field.service).map((field) => field.category),
  );
  return unique.filter((field) => !field.service || !whole.has(field.category));
}
export function readFields(params) {
  if (params.has("field")) {
    return normalizeFields(
      params.getAll("field").flatMap((value) => {
        try {
          const [category, service] = JSON.parse(value);
          return typeof category === "string" &&
            category &&
            (service === null || typeof service === "string")
            ? [{ category, service: service || null }]
            : [];
        } catch {
          return [];
        }
      }),
    );
  }
  const category = params.get("category");
  return category ? [{ category, service: params.get("service") || null }] : [];
}
export function withFields(params, fields) {
  const next = new URLSearchParams(params);
  ["category", "service", "field", "page"].forEach((key) => next.delete(key));
  normalizeFields(fields).forEach(({ category, service }) =>
    next.append("field", JSON.stringify([category, service || null])),
  );
  return next;
}
export const fieldLabel = (field) =>
  field.service
    ? `${field.category} · ${field.service}`
    : `${field.category} 전체`;
export function filterItems(items, params, type) {
  const q = (params.get("q") || "").trim().toLowerCase();
  const range = parseBudgetRange(
    params.get("budgetMin"),
    params.get("budgetMax"),
  );
  if (range.error) return [];
  const fields = readFields(params);
  const filtered = items.filter((p) => {
    if (p.status === "CANCELLED") return false;
    if (
      q &&
      ![
        p.title,
        p.name,
        p.specialty,
        p.summary,
        p.description,
        p.category,
        p.service,
        ...(p.tags || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (
      fields.length &&
      !fields.some(
        (field) =>
          p.category === field.category &&
          (!field.service ||
            p.service === field.service ||
            p.tags?.includes(field.service)),
      )
    )
      return false;
    if (
      !fields.length &&
      params.get("service") &&
      p.service !== params.get("service") &&
      !p.tags?.includes(params.get("service"))
    )
      return false;
    if (params.get("skill") && !p.tags?.includes(params.get("skill")))
      return false;
    if (params.get("mode") && p.mode !== params.get("mode")) return false;
    if (range.active) {
      if (p.budgetType === "협의" || !Number.isFinite(Number(p.budget)))
        return false;
      const lower = Number(p.budget);
      const upper = p.budgetType === "범위" ? Number(p.budgetMax) : lower;
      if (
        !Number.isFinite(upper) ||
        (range.min !== null && upper < range.min) ||
        (range.max !== null && lower > range.max)
      )
        return false;
    }
    if (
      params.get("budget") === "10만원 이하" &&
      (p.budgetType === "협의" || p.budget > 100000)
    )
      return false;
    if (
      params.get("budget") === "10~30만원" &&
      (p.budgetType === "협의" || p.budget < 100000 || p.budget > 300000)
    )
      return false;
    if (
      params.get("budget") === "30만원 이상" &&
      (p.budgetType === "협의" || p.budget < 300000)
    )
      return false;
    if (params.get("days") && p.days > Number(params.get("days"))) return false;
    if (
      params.get("urgent") &&
      (deadlineDays(p.deadline) > 3 || p.status !== "OPEN")
    )
      return false;
    if (params.get("available") && !p.available) return false;
    if (params.get("rating") && p.rating < Number(params.get("rating")))
      return false;
    if (
      params.get("completed") &&
      p.completed < Number(params.get("completed"))
    )
      return false;
    if (params.get("verified") && p.verified === false) return false;
    return true;
  });
  const sort = params.get("sort");
  return filtered.sort((a, b) =>
    sort === "budget"
      ? (b.budget || 0) - (a.budget || 0)
      : sort === "deadline"
        ? new Date(a.deadline) - new Date(b.deadline)
        : sort === "rating"
          ? b.rating - a.rating
          : sort === "reviews"
            ? b.reviews - a.reviews
            : sort === "completed"
              ? b.completed - a.completed
              : sort === "popular"
                ? b.likes - a.likes
                : type === "projects"
                  ? new Date(b.createdAt) - new Date(a.createdAt)
                  : 0,
  );
}
