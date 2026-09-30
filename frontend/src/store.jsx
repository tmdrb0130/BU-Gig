import { createContext, useContext, useEffect, useState } from "react";
import { initialProjects } from "./data";
import { readStored, writeStored } from "./lib";
import { currentDemoUser, loginDemo, logoutDemo } from "./auth";

const Context = createContext(null);
export const useApp = () => useContext(Context);
export function Provider({ children }) {
  const [user, setUser] = useState(currentDemoUser);
  const login = async (email, password, remember) =>
    setUser(await loginDemo(email, password, remember));
  const logout = () => {
    logoutDemo();
    setUser(null);
  };
  const [projects, setProjects] = useState(() =>
    readStored("projects", initialProjects),
  );
  const [saved, setSaved] = useState(() => readStored("saved", []));
  const [proposals, setProposals] = useState(() => readStored("proposals", []));
  const [requests, setRequests] = useState(() => readStored("requests", []));
  const [recent, setRecent] = useState(() => readStored("recent", []));
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const results = [
      writeStored("projects", projects),
      writeStored("saved", saved),
      writeStored("proposals", proposals),
      writeStored("requests", requests),
      writeStored("recent", recent),
    ];
    setStorageError(results.includes(false));
  }, [projects, saved, proposals, requests, recent]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const toggleSave = (id) => {
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const remember = (type, id) =>
    setRecent((r) =>
      [{ type, id }, ...r.filter((x) => x.id !== id)].slice(0, 6),
    );
  return (
    <Context.Provider
      value={{
        user,
        login,
        logout,
        projects,
        setProjects,
        saved,
        toggleSave,
        proposals,
        setProposals,
        requests,
        setRequests,
        recent,
        remember,
        notify: setToast,
      }}
    >
      {children}
      {storageError && (
        <div className="storage-warning" role="alert">
          브라우저 저장 공간을 사용할 수 없어 변경 사항은 이번 접속 동안만
          유지됩니다.
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
