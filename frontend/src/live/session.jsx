import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, forgetSession, errorText } from "./api";
const Session = createContext(null);
export const useSession = () => useContext(Session);
export function SessionProvider({ children }) {
  const generation = useRef(0);
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [epoch, setEpoch] = useState(0);
  const clear = useCallback(() => {
    generation.current++;
    setSession(null);
    setLoading(false);
    setEpoch((n) => n + 1);
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setError(null);
    try {
      const r = await api("/auth/session");
      if (request !== generation.current) return;
      setSession(r.data);
      return r.data;
    } catch (e) {
      if (request !== generation.current) return;
      if (e.status !== 401) setError(e);
      setSession(null);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("session-expired", clear);
    const changed = (e) => {
      if (e.key !== "bu-session-change") return;
      forgetSession();
      clear();
      refresh();
    };
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("session-expired", clear);
      window.removeEventListener("storage", changed);
    };
  }, [refresh, clear]);
  const login = async (body) => {
    await api("/auth/login", { method: "POST", body });
    await refresh();
    setEpoch((n) => n + 1);
    try {
      localStorage.setItem("bu-session-change", crypto.randomUUID());
    } catch {}
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    forgetSession();
    clear();
    try {
      localStorage.setItem("bu-session-change", crypto.randomUUID());
    } catch {}
  };
  return (
    <Session.Provider
      value={{
        session,
        user: session?.user,
        loading,
        error,
        refresh,
        login,
        logout,
        epoch,
      }}
    >
      {children}
    </Session.Provider>
  );
}
export function useQuery(path, request = {}) {
  const { epoch, user } = useSession();
  const [retry, setRetry] = useState(0),
    [state, setState] = useState({
      data: null,
      meta: {},
      loading: true,
      error: null,
    });
  const base = `${user?.id || "guest"}:${epoch}:${path}:${JSON.stringify(request)}`;
  const token = `${base}:${retry}`;
  const current = useRef(token);
  current.current = token;
  useEffect(() => {
    if (!path) {
      setState({ data: null, meta: {}, loading: false, error: null, token });
      return;
    }
    const controller = new AbortController();
    setState((previous) =>
      previous.base === base
        ? { ...previous, loading: false, error: null, token }
        : { data: null, meta: {}, loading: true, error: null, token, base },
    );
    api(path, { ...request, signal: controller.signal })
      .then((r) => {
        if (current.current === token)
          setState({ ...r, loading: false, error: null, token, base });
      })
      .catch((e) => {
        if (!controller.signal.aborted && current.current === token)
          setState({ data: null, meta: {}, loading: false, error: e, token });
      });
    return () => controller.abort();
  }, [token, path]);
  return {
    ...(state.token === token
      ? state
      : state.base === base
        ? state
        : { data: null, meta: {}, loading: !!path, error: null }),
    reload: () => setRetry((n) => n + 1),
  };
}
export function useCommand(after) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const lock = useRef(false),
    attempt = useRef(null);
  return {
    busy,
    error,
    run: async (path, body = {}, method = "POST") => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError(null);
      const signature = JSON.stringify([path, method, body]);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      try {
        const r = await api(path, { method, body, key: attempt.current.key });
        attempt.current = null;
        await after?.(r.data);
        return r.data;
      } catch (e) {
        setError(e);
        return undefined;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
}
export function QueryState({ query, children }) {
  if (query.loading)
    return (
      <p role="status" className="empty">
        불러오는 중…
      </p>
    );
  if (query.error)
    return (
      <div className="empty" role="alert">
        <p>{errorText(query.error)}</p>
        <button className="btn outline" onClick={query.reload}>
          다시 시도
        </button>
      </div>
    );
  return children;
}
export function ErrorMessage({ error }) {
  return error ? (
    <p className="form-error" role="alert">
      {errorText(error)}
    </p>
  ) : null;
}
export function RequireAuth({ children }) {
  const s = useSession(),
    location = useLocation();
  if (s.loading) return <p className="empty">로그인 확인 중…</p>;
  if (s.error)
    return (
      <div className="empty">
        <ErrorMessage error={s.error} />
        <button onClick={s.refresh}>다시 시도</button>
      </div>
    );
  if (!s.user)
    return (
      <Navigate
        replace
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  return <div key={`${s.user.id}:${s.epoch}`}>{children}</div>;
}
export const isVerified = (s) =>
  s?.verification?.state === "VERIFIED" &&
  Date.parse(s.verification.expiresAt) > Date.now();
