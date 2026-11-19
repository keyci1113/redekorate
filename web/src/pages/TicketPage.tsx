import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Project } from "../lib/types";
import { ErrorNote, PageSkeleton } from "../components/ui";
import { TicketFull } from "../tickets/TicketDetail";

/** A ticket on its own page: /projects/:id/tickets/:number */
export function TicketPage() {
  const { id, number } = useParams();
  const nav = useNavigate();
  const project = useLoad(() => api.get<{ project: Project }>(`/projects/${id}`), [id]);
  const n = Number(number);
  if (project.loading) return <PageSkeleton />;
  if (project.error || !project.data || !Number.isInteger(n) || n < 1) return <div className="p-10"><ErrorNote>{project.error ?? "404"}</ErrorNote></div>;
  return (
    <div className="page">
      <TicketFull key={n} projectId={project.data.project.id} projectName={project.data.project.name} projectColor={project.data.project.color} number={n} onDeleted={() => nav(`/projects/${id}?tab=tickets`)} />
    </div>
  );
}
