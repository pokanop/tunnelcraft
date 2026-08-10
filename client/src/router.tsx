/* URL routing: every view is deep-linkable and the back button works.
   The shell (App) is the root layout; pages render into its outlet. */
import { useEffect, useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  redirect,
  useParams,
} from "@tanstack/react-router";
import App, { useApp } from "./App";
import { LandingPage } from "./pages/landing";
import { LearnPage } from "./pages/learn";
import { DashboardPage } from "./pages/dashboard";
import { TrackPage } from "./pages/track";
import { ModulePage } from "./pages/module";
import { AuthView, ResetPasswordView } from "./components/auth";
import { AccountView } from "./components/account";
import { AdminView } from "./components/admin";
import { ReviewView } from "./components/review";
import { GlossaryView } from "./components/glossary";
import { ExamView } from "./components/exam";
import { getToken } from "./lib/api";
import { TRACKS } from "./curriculum/tracks";
import { byId } from "./lib/stats";
import { authFragmentDestination, resetTokenFromHash } from "./lib/auth-links";

/* ---------- thin page wrappers around existing views ---------- */
function AuthPage() {
  const { onAuthed, go, user } = useApp();
  if (user) return <Navigate to="/dashboard" replace />;
  return <AuthView onAuthed={onAuthed} onBack={() => go({ v: "home" })} />;
}

function ResetPasswordPage() {
  const { go, clearSession } = useApp();
  const [resetToken] = useState(() =>
    typeof window === "undefined" ? null : resetTokenFromHash(window.location.hash)
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.startsWith("#reset=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  return (
    <ResetPasswordView
      token={resetToken}
      onBack={() => go({ v: "home" })}
      onDone={() => {
        clearSession();
        go({ v: "auth" });
      }}
    />
  );
}

function AccountPage() {
  const { user, signOut, onDeleted, go } = useApp();
  if (!getToken()) return <Navigate to="/auth" replace />;
  if (!user) return null; // token present, /me in flight
  return (
    <AccountView
      user={user}
      onSignOut={signOut}
      onDeleted={onDeleted}
      onBack={() => go({ v: "home" })}
    />
  );
}

function AdminPage() {
  const { user, go } = useApp();
  if (!getToken()) return <Navigate to="/auth" replace />;
  // Cosmetic gate only — the API enforces the role on every call, so a non-admin
  // who deep-links here sees the 403 state and nothing works.
  if (!user) return null; // token present, /me in flight
  if (user.role !== "admin")
    return (
      <div className="wrap">
        <div className="authcard admincard">
          <div className="eyebrow">403 // ADMIN ACCESS REQUIRED</div>
          <h2 className="authttl">Not available</h2>
          <p className="authsub">Your account does not have admin privileges.</p>
          <button className="btn" onClick={() => go({ v: "home" })}>
            BACK TO COURSE
          </button>
        </div>
      </div>
    );
  return <AdminView me={user} onBack={() => go({ v: "home" })} />;
}

function ReviewPage() {
  const { prog, reviewAnswer, go } = useApp();
  return <ReviewView byId={byId} prog={prog} onAnswer={reviewAnswer} go={go} />;
}

function GlossaryPage() {
  const { go } = useApp();
  return <GlossaryView go={go} />;
}

function ExamPage() {
  const { prog, update, user, go } = useApp();
  const params = useParams({ strict: false }) as { trackId?: string };
  const track = TRACKS.find((t) => t.id === params.trackId);
  useEffect(() => {
    if (!track) go({ v: "home" });
  }, [track]);
  if (!track) return null;
  return <ExamView track={track} user={user} prog={prog} update={update} go={go} />;
}

function NotFound() {
  const { go } = useApp();
  return (
    <div className="wrap">
      <div className="modhead" style={{ paddingTop: 40 }}>
        <p className="eyebrow">SIGNAL LOST // 404</p>
        <h1 className="maph1">No route to host.</h1>
        <p className="sub mapsub">That path doesn't resolve. The curriculum map always does.</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ v: "home" })}>
          BACK TO THE MAP →
        </button>
      </div>
    </div>
  );
}

/* ---------- route tree ---------- */
const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: ({ location }) => {
      const fragmentDestination = authFragmentDestination(location.hash);
      if (fragmentDestination) {
        throw redirect({ to: fragmentDestination, hash: true, replace: true });
      }
    },
    component: LandingPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/learn", component: LearnPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: DashboardPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/tracks/$trackId", component: TrackPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/m/$modId", component: ModulePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/m/$modId/$tab", component: ModulePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/exam/$trackId", component: ExamPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/glossary", component: GlossaryPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/review", component: ReviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/auth", component: AuthPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/reset-password",
    component: ResetPasswordPage,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/account", component: AccountPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage }),
];

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
