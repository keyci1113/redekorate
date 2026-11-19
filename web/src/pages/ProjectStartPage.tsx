// Right after a project is created: choose what to set up first. Nothing is created here; each choice opens the place where that work starts.
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, FlaskConical, Kanban, Map as MapIcon } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Project } from "../lib/types";
import { BackLink, ErrorNote, Spinner } from "../components/ui";
import { categoryOf, startOrder, type ProjectCategory, type StartChoice } from "../lib/projectCategories";

interface Choice { to: string; icon: ReactNode; title: string; text: string; next: string }

/** One line that explains why the first choice comes first for this kind of project. */
const startHint = (c: ProjectCategory) => ({
  ux_research: t("En un proyecto de investigación UX lo habitual es empezar con un estudio."),
  design: t("En un proyecto de diseño lo habitual es empezar con un estudio para validar ideas."),
  software: t("En un proyecto de desarrollo de software lo habitual es empezar con el tablero de tickets."),
  ai: t("En un proyecto de inteligencia artificial lo habitual es empezar con el tablero de tickets."),
  automation: t("En un proyecto de automatizaciones lo habitual es empezar con el tablero de tickets."),
  it: t("En un proyecto de TI lo habitual es empezar con el tablero de tickets."),
  other: "",
})[c];

export function ProjectStartPage() {
  const { id } = useParams();
  const project = useLoad(() => api.get<{ project: Project }>(`/projects/${id}`), [id]);
  if (project.loading) return <Spinner />;
  if (project.error || !project.data) return <div className="p-10"><ErrorNote>{project.error}</ErrorNote></div>;
  const p = project.data.project;
  const category = categoryOf(p);
  const all: Record<StartChoice, Choice> = {
    study: { to: `/projects/${p.id}/new?nuevo=1`, icon: <FlaskConical size={22} />, title: t("Estudio con usuarios"),
      text: t("Una prueba o encuesta que envías a participantes: prueba de prototipo, encuesta, card sorting, SUS… Configúrala y comparte el link."), next: t("Elegir un método") },
    tickets: { to: `/projects/${p.id}?tab=tickets`, icon: <Kanban size={22} />, title: t("Tablero de tickets"),
      text: t("Registra tareas, bugs, pedidos y cambios, y muévelos por el tablero de Por hacer a Hecho."), next: t("Abrir el tablero") },
    milestones: { to: `/projects/${p.id}?tab=milestones`, icon: <MapIcon size={22} />, title: t("Gestión del proyecto"),
      text: t("Planea entregas con hitos y fechas, y ve su avance en la hoja de ruta."), next: t("Crear hitos") },
  };
  // Research and design projects start with a study; software, AI, automation and IT projects with the board.
  const choices = startOrder(category).map((k) => all[k]);
  return (
    <div className="page">
      <BackLink to={`/projects/${p.id}`} color={p.color} label={p.name} />
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-good/20 bg-good-soft px-4 py-3 text-sm text-good" role="status">
        <CheckCircle2 size={18} aria-hidden /> <span>{t("Proyecto")} <b>{p.name}</b> {t("creado.")}</span>
      </div>
      <h1 className="page-title mt-6">{t("¿Con qué quieres empezar?")}</h1>
      <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
        {category !== "other" && <>{startHint(category)}{" "}</>}
        {t("Elige lo primero que vas a armar. Las otras dos opciones siguen disponibles en las pestañas del proyecto cuando las necesites.")}
      </p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {choices.map((c) => (
          <li key={c.to}>
            <Link to={c.to} className="focus-ring group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-6 hover:border-accent">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden>{c.icon}</span>
              <span className="text-lg font-bold">{c.title}</span>
              <span className="text-sm leading-relaxed text-ink-2">{c.text}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-accent-ink">{c.next}<ArrowRight size={15} aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6"><Link to={`/projects/${p.id}`} className="focus-ring inline-flex min-h-11 items-center rounded text-sm font-medium text-ink-2 hover:text-ink hover:underline">{t("Decidir después e ir al proyecto")}</Link></p>
    </div>
  );
}
