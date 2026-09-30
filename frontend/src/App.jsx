import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Provider } from "./store";
import { Header, Footer } from "./components";
import {
  HomePage,
  ExplorePage,
  ProjectDetail,
  ExpertDetail,
  WorkDetail,
  SavedPage,
  MyPage,
  GuidePage,
  NotFound,
} from "./pages";
import { RequestForm, ProposalForm } from "./forms";
import Workroom from "./Workroom";
import AuthPage, { AuthHeader, AuthFooter } from "./Auth.jsx";
import "./explore-cards.css";

function ScrollAndTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const titles = {
      "/": "재능이 프로젝트가 되는 곳",
      "/projects": "일 찾기",
      "/experts": "전문가 찾기",
      "/works": "작업물 둘러보기",
      "/request/new": "의뢰 등록",
      "/my": "마이페이지",
      "/guide": "이용안내",
      "/workroom": "프로젝트 워크룸",
      "/saved": "찜한 목록",
      "/search": "통합 검색",
      "/login": "로그인",
      "/signup": "회원가입",
      "/password-reset": "비밀번호 재설정",
    };
    document.title = `${titles[pathname] || "프로젝트와 함께하는 이야기"} | 백석대학교 긱창업`;
  }, [pathname]);
  return null;
}
export default function App() {
  const { pathname } = useLocation();
  const authPage = ["/login", "/signup", "/password-reset"].includes(pathname);
  return (
    <Provider>
      <div className={authPage ? "auth-shell" : undefined}>
        <ScrollAndTitle />
        {authPage ? <AuthHeader /> : <Header />}
        <main id="main" className={authPage ? "auth-main" : undefined}>
          <Routes>
            <Route path="/login" element={<AuthPage key="login" />} />
            <Route
              path="/signup"
              element={<AuthPage key="signup" mode="signup" />}
            />
            <Route
              path="/password-reset"
              element={<AuthPage key="reset" mode="reset" />}
            />
            <Route path="/" element={<HomePage />} />
            <Route path="/projects" element={<ExplorePage type="projects" />} />
            <Route path="/experts" element={<ExplorePage type="experts" />} />
            <Route path="/works" element={<ExplorePage type="works" />} />
            <Route path="/search" element={<ExplorePage global />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/apply" element={<ProposalForm />} />
            <Route path="/experts/:id" element={<ExpertDetail />} />
            <Route path="/works/:id" element={<WorkDetail />} />
            <Route path="/request/new" element={<RequestFormWrapper />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/my" element={<MyPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/workroom" element={<Workroom />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        {authPage ? <AuthFooter /> : <Footer />}
      </div>
    </Provider>
  );
}
function RequestFormWrapper() {
  const location = useLocation();
  return <RequestForm key={location.search} />;
}
