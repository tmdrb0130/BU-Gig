import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { SessionProvider, useSession, RequireAuth, useQuery } from "./session";
import { API } from "./api";
import { Home, Explore, Detail, Guide } from "./public";
import {
  Auth,
  EmailVerification,
  Profile,
  Verification,
  Dashboard,
  Saved,
  Notifications,
  Admin,
  ActivityList,
} from "./account";
import {
  Request,
  Apply,
  ManageProject,
  Proposal,
  DirectRequest,
  Portfolios,
  Publications,
} from "./forms";
import { Workroom } from "./workroom";
import { Page, Empty } from "./ui";
import "./live.css";
import "../explore-cards.css";
import "../auth.css";
import "./completion.css";
import { Header, Footer, AuthHeader, AuthFooter } from "./design";
import {
  Settings,
  Support,
  Ticket,
  Reports,
  Conversations,
  PolicyPage,
} from "./extras";
const protect = (node) => <RequireAuth>{node}</RequireAuth>;
function Shell() {
  const s = useSession(),
    location = useLocation(),
    q = useQuery(s.user ? "/me/notifications" : null);
  const authPage = ["/login", "/signup", "/password-reset"].includes(
    location.pathname,
  );
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "백석대학교 긱창업";
  }, [location.pathname]);
  useEffect(() => {
    if (!s.user) return;
    const events = new EventSource(API + "/events", { withCredentials: true });
    const names = [
      "proposal.submitted",
      "direct_request.received",
      "contract.signed",
      "completion.requested",
      "verification.changed",
      "message.created",
      "stream.reset",
    ];
    const update = () => {
      q.reload();
    };
    const verify = () => s.refresh();
    names.forEach((t) => events.addEventListener(t, update));
    events.addEventListener("verification.changed", verify);
    return () => events.close();
  }, [s.user?.id, s.epoch]);
  return (
    <div className={authPage ? "auth-shell" : undefined}>
      {authPage ? <AuthHeader /> : <Header notifications={q} />}
      <main id="main" className={authPage ? "auth-main" : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<Explore type="projects" />} />
          <Route path="/experts" element={<Explore type="experts" />} />
          <Route path="/works" element={<Explore type="portfolios" />} />
          <Route path="/search" element={<Explore />} />
          <Route path="/projects/:id" element={<Detail type="projects" />} />
          <Route path="/experts/:id" element={<Detail type="experts" />} />
          <Route path="/works/:id" element={<Detail type="portfolios" />} />
          <Route path="/login" element={<Auth key="login" />} />
          <Route path="/signup" element={<Auth key="signup" mode="signup" />} />
          <Route
            path="/password-reset"
            element={<Auth key="reset" mode="reset" />}
          />
          <Route path="/guide" element={<Guide />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/tickets/:id" element={protect(<Ticket />)} />
          <Route
            path="/admin/tickets/:id"
            element={protect(<Ticket admin />)}
          />
          <Route path="/settings/account" element={protect(<Settings />)} />
          <Route
            path="/settings/notifications"
            element={protect(<Notifications />)}
          />
          <Route path="/messages" element={protect(<Conversations />)} />
          <Route path="/messages/:id" element={protect(<Conversations />)} />
          <Route path="/my/reports" element={protect(<Reports />)} />
          <Route path="/terms" element={<PolicyPage />} />
          <Route path="/privacy" element={<PolicyPage privacy />} />
          <Route path="/onboarding" element={protect(<Profile />)} />
          <Route path="/verification" element={protect(<Verification />)} />
          <Route path="/email-verification" element={<EmailVerification />} />
          <Route path="/my" element={protect(<Dashboard />)} />
          <Route path="/my/profile" element={protect(<Profile />)} />
          <Route path="/my/verification" element={protect(<Verification />)} />
          <Route path="/my/portfolios" element={protect(<Portfolios />)} />
          <Route
            path="/my/publication-requests"
            element={protect(<Publications />)}
          />
          <Route path="/my/projects/:id" element={protect(<ManageProject />)} />
          <Route path="/my/proposals/:id" element={protect(<Proposal />)} />
          <Route
            path="/request/new"
            element={protect(<Request key={location.search} />)}
          />
          <Route path="/projects/:id/apply" element={protect(<Apply />)} />
          <Route
            path="/direct-requests/:id"
            element={protect(<DirectRequest />)}
          />
          <Route path="/saved" element={protect(<Saved />)} />
          <Route path="/notifications" element={protect(<Notifications />)} />
          <Route
            path="/workroom"
            element={protect(
              <Page title="내 워크룸">
                <ActivityList
                  path="/me/workrooms?pageSize=50"
                  type="workrooms"
                />
              </Page>,
            )}
          />
          <Route
            path="/workrooms"
            element={protect(
              <Page title="내 워크룸">
                <ActivityList
                  path="/me/workrooms?pageSize=50"
                  type="workrooms"
                />
              </Page>,
            )}
          />
          <Route path="/workrooms/:id" element={protect(<Workroom />)} />
          <Route path="/admin" element={protect(<Admin />)} />
          <Route
            path="*"
            element={
              <Page title="페이지를 찾을 수 없어요">
                <Empty to="/" label="홈으로 돌아가기">
                  주소를 확인해 주세요.
                </Empty>
              </Page>
            }
          />
        </Routes>
      </main>
      {authPage ? <AuthFooter /> : <Footer />}
    </div>
  );
}
export default function LiveApp() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
