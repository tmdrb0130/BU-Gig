export const API = import.meta.env.VITE_API_BASE || "/api/v1";
let csrf, csrfPromise;
export class ApiError extends Error {
  constructor(status, error = {}) {
    super(
      error.message ||
        "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
    this.status = status;
    this.code = error.code;
    this.fields = error.fieldErrors || [];
  }
}
export function forgetSession() {
  csrf = null;
  csrfPromise = null;
}
export async function api(path, { method = "GET", body, signal, key } = {}) {
  if (method !== "GET" && !csrf) {
    csrfPromise ||= api("/auth/csrf")
      .then((r) => {
        csrf = r.data.csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
    await csrfPromise;
  }
  let response;
  try {
    response = await fetch(API + path, {
      method,
      credentials: "include",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET"
          ? {
              "X-CSRF-Token": csrf,
              "Idempotency-Key": key || crypto.randomUUID(),
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(0);
  }
  const json =
    response.status === 204
      ? { data: null }
      : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      forgetSession();
      window.dispatchEvent(new Event("session-expired"));
    }
    if (json.error?.code === "CSRF_REJECTED") forgetSession();
    throw new ApiError(response.status, json.error);
  }
  if (json.data?.csrfToken) csrf = json.data.csrfToken;
  return json;
}
export function mediaUrl(url) {
  return url?.startsWith("/api/v1/") ? API + url.slice(7) : url;
}
export async function upload(file, purpose, targetId) {
  const { data: u } = await api("/uploads", {
    method: "POST",
    body: {
      filename: file.name,
      size: file.size,
      mime: file.type || "text/plain",
      purpose,
      ...(targetId ? { targetId } : {}),
    },
  });
  const put = await fetch(u.url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "text/plain" },
    body: file,
  });
  if (!put.ok) throw new Error("파일 전송에 실패했습니다.");
  await api(`/uploads/${u.uploadId}/complete`, { method: "POST", body: {} });
  for (let i = 0; i < 60; i++) {
    const { data } = await api(`/uploads/${u.uploadId}`);
    if (data.state === "READY") return u.mediaId;
    if (["REJECTED", "EXPIRED"].includes(data.state))
      throw new Error("사용할 수 없는 파일입니다. 다른 파일을 선택해 주세요.");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("파일 검사가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
}
export async function download(id) {
  const { data } = await api(`/media/${id}/download`);
  window.location.assign(data.url);
}
export function errorText(e) {
  const messages = {
    SCHOOL_VERIFICATION_REQUIRED: "학교 인증이 필요합니다.",
    CONSENT_REQUIRED: "필수 약관 동의가 필요합니다.",
    PROFILE_INCOMPLETE: "소개 문구와 활동 분야를 입력해 주세요.",
    INVALID_CREDENTIALS: "이메일 또는 비밀번호를 확인해 주세요.",
    VERSION_CONFLICT:
      "다른 변경이 반영되었습니다. 새로고침 후 내용을 확인해 주세요.",
    UNAUTHENTICATED: "로그인이 필요합니다.",
    TRADE_RESTRICTED: "취소 협의 또는 분쟁 처리 중에는 진행할 수 없습니다.",
    RECRUITMENT_CLOSED: "모집이 마감되었습니다.",
    NOT_FOUND: "현재 볼 수 없는 항목입니다.",
    INVALID_TOKEN: "확인 코드가 만료되었거나 이미 사용되었습니다.",
    CONSTRAINT_CONFLICT: "이미 처리된 요청이거나 현재 상태와 맞지 않습니다.",
    RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  };
  return (
    messages[e?.code] ||
    (e?.fields?.length
      ? e.fields.map((f) => `${f.field}: ${f.message}`).join(" / ")
      : e?.message) ||
    "요청을 처리하지 못했습니다."
  );
}
