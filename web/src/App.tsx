import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { Layout } from "./components/Layout";
import { ForgotPage, LoginPage, ResetPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectPage } from "./pages/ProjectPage";
import { NewStudyPage } from "./pages/NewStudyPage";
import { BuilderPage } from "./pages/BuilderPage";
import { ResultsPage } from "./pages/ResultsPage";
import { RunnerPage } from "./pages/RunnerPage";
import { ReportPage } from "./pages/ReportPage";
import { AccountPage } from "./pages/AccountPage";
import { DocumentPage } from "./pages/DocumentPage";
import { PublicDocPage } from "./pages/PublicDocPage";

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/reset" element={<ResetPage />} />
      <Route path="/s/:slug" element={<RunnerPage />} />
      <Route path="/r/:token" element={<ReportPage />} />
      <Route path="/d/:token" element={<PublicDocPage />} />

      {/* Privado */}
      <Route element={<Private><Layout /></Private>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectPage />} />
        <Route path="/projects/:id/new" element={<NewStudyPage />} />
        <Route path="/studies/:id/results" element={<ResultsPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="/studies/:id/edit" element={<Private><BuilderPage /></Private>} />
      <Route path="/docs/:id" element={<Private><DocumentPage /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
