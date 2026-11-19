import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { Layout } from "./components/Layout";
import { useLang } from "./lib/i18n";
import { isSharedLink, pageTitle } from "./lib/pageTitle";
// Every page is its own chunk: participants opening /s/:slug only download the runner,
// not the builder, results or document templates.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.ForgotPage })));
const ResetPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.ResetPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const ProjectPage = lazy(() => import("./pages/ProjectPage").then((m) => ({ default: m.ProjectPage })));
const NewStudyPage = lazy(() => import("./pages/NewStudyPage").then((m) => ({ default: m.NewStudyPage })));
const BuilderPage = lazy(() => import("./pages/BuilderPage").then((m) => ({ default: m.BuilderPage })));
const ResultsPage = lazy(() => import("./pages/ResultsPage").then((m) => ({ default: m.ResultsPage })));
const LiveStudiesPage = lazy(() => import("./pages/LiveStudiesPage").then((m) => ({ default: m.LiveStudiesPage })));
const RunnerPage = lazy(() => import("./pages/RunnerPage").then((m) => ({ default: m.RunnerPage })));
const ReportPage = lazy(() => import("./pages/ReportPage").then((m) => ({ default: m.ReportPage })));
const ProjectReportPage = lazy(() => import("./pages/ProjectReportPage").then((m) => ({ default: m.ProjectReportPage })));
const AccountPage = lazy(() => import("./pages/AccountPage").then((m) => ({ default: m.AccountPage })));
const DocumentPage = lazy(() => import("./pages/DocumentPage").then((m) => ({ default: m.DocumentPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const PublicDocPage = lazy(() => import("./pages/PublicDocPage").then((m) => ({ default: m.PublicDocPage })));
const OrgsPage = lazy(() => import("./pages/OrgsPage").then((m) => ({ default: m.OrgsPage })));
const OrgPage = lazy(() => import("./pages/OrgsPage").then((m) => ({ default: m.OrgPage })));
const WelcomePage = lazy(() => import("./pages/WelcomePage").then((m) => ({ default: m.WelcomePage })));
const TicketPage = lazy(() => import("./pages/TicketPage").then((m) => ({ default: m.TicketPage })));
const MyWorkPage = lazy(() => import("./pages/MyWorkPage").then((m) => ({ default: m.MyWorkPage })));
const PublicRoadmapPage = lazy(() => import("./pages/RoadmapPages").then((m) => ({ default: m.PublicRoadmapPage })));
const OrgRoadmapPage = lazy(() => import("./pages/RoadmapPages").then((m) => ({ default: m.OrgRoadmapPage })));
const AuthorizePage = lazy(() => import("./pages/AuthorizePage").then((m) => ({ default: m.AuthorizePage })));
const DashboardsPage = lazy(() => import("./pages/DashboardsPage").then((m) => ({ default: m.DashboardsPage })));
const WidgetSettingsPage = lazy(() => import("./pages/WidgetSettingsPage").then((m) => ({ default: m.WidgetSettingsPage })));
const ProjectStartPage = lazy(() => import("./pages/ProjectStartPage").then((m) => ({ default: m.ProjectStartPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((m) => ({ default: m.HelpPage })));

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  // A new account goes through the welcome wizard once (it can finish it or skip it; both set onboarded_at).
  if (!user.onboarded_at && pathname !== "/welcome") return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** Keeps the browser-tab title in step with the route and the interface language. */
function PageTitle() {
  const { pathname } = useLocation();
  const { lang } = useLang();
  useEffect(() => { if (!isSharedLink(pathname)) document.title = pageTitle(pathname, lang); }, [pathname, lang]);
  return null;
}

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <PageTitle />
    <Routes>
      {/* Público */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/authorize" element={<AuthorizePage />} />
      <Route path="/s/:slug" element={<RunnerPage />} />
      <Route path="/r/:token" element={<ReportPage />} />
      <Route path="/pr/:token" element={<ProjectReportPage />} />
      <Route path="/d/:token" element={<PublicDocPage />} />
      <Route path="/rm/:token" element={<PublicRoadmapPage />} />

      {/* Privado */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/" element={<DashboardPage />} />
        {/* Each dashboard has its own data shape: the key remounts the page so one never renders with another's data. */}
        <Route path="/dashboards" element={<DashboardsPage key="studies" tab="studies" />} />
        <Route path="/dashboards/tickets" element={<DashboardsPage key="tickets" tab="tickets" />} />
        <Route path="/dashboards/projects" element={<DashboardsPage key="projects" tab="projects" />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/projects/:id/start" element={<ProjectStartPage />} />
        <Route path="/projects/:id/new" element={<NewStudyPage />} />
        <Route path="/projects/:id/tickets/:number" element={<TicketPage />} />
        <Route path="/projects/:id/widget" element={<WidgetSettingsPage />} />
        <Route path="/studies" element={<LiveStudiesPage />} />
        <Route path="/studies/:id/results" element={<ResultsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/orgs/:id" element={<OrgPage />} />
        <Route path="/orgs/:id/roadmap" element={<OrgRoadmapPage />} />
        <Route path="/my-work" element={<MyWorkPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route path="/welcome" element={<Private><WelcomePage /></Private>} />
      <Route path="/studies/:id/edit" element={<Private><BuilderPage /></Private>} />
      <Route path="/docs/:id" element={<Private><DocumentPage /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
