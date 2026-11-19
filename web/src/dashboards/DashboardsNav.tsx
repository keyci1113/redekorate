// The "Dashboards · Studies | Tickets | Projects" control: one component, so Home and every dashboard show the same thing.
import { ChartColumn } from "lucide-react";
import { Link } from "react-router-dom";
import { cx } from "../components/ui";
import { t } from "../lib/i18n";

export type DashTab = "studies" | "tickets" | "projects";
export const dashPath = (tab: DashTab) => (tab === "studies" ? "/dashboards" : `/dashboards/${tab}`);

/** `current` marks the open dashboard (none on Home); `query` keeps the filters when moving between dashboards. */
export function DashboardsNav({ current, query = "" }: { current?: DashTab; query?: string }) {
  const tabs: [DashTab, string][] = [["studies", t("Estudios")], ["tickets", t("Tickets")], ["projects", t("Proyectos")]];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span id="dashboards-nav" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3"><ChartColumn size={15} aria-hidden />{t("Dashboards")}</span>
      <nav aria-labelledby="dashboards-nav" className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-ink/5 p-1">
        {tabs.map(([id, label]) => (
          <Link key={id} to={`${dashPath(id)}${query}`} title={id === "studies" ? t("Un estudio es una prueba o encuesta que envías a participantes: pruebas de prototipo, encuestas, card sorting…") : undefined} aria-current={current === id ? "page" : undefined}
            className={cx("focus-ring inline-flex min-h-9 items-center rounded-lg px-3.5 text-[13px] whitespace-nowrap transition",
              current === id ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2 hover:bg-surface hover:text-ink hover:shadow-sm")}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
