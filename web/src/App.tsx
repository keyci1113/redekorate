import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { Layout } from "./components/Layout";
// Every page is its own chunk: participants opening /s/:slug only download the runner,
// not the builder, results or document templates.
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
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

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      {/* Público */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/s/:slug" element={<RunnerPage />} />
      <Route path="/r/:token" element={<ReportPage />} />
      <Route path="/pr/:token" element={<ProjectReportPage />} />
      <Route path="/d/:token" element={<PublicDocPage />} />

      {/* Privado */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/projects/:id/new" element={<NewStudyPage />} />
        <Route path="/studies" element={<LiveStudiesPage />} />
        <Route path="/studies/:id/results" element={<ResultsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/orgs/:id" element={<OrgPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
      <Route path="/studies/:id/edit" element={<Private><BuilderPage /></Private>} />
      <Route path="/docs/:id" element={<Private><DocumentPage /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
