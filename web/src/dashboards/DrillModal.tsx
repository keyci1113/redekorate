// The detail modal a dashboard opens when a tile, a bar or a column is clicked: the items behind that number, each a link.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { fmtNum, plural, relTime, t } from "../lib/i18n";
import { Button, ErrorNote, Modal, SeverityBadge, StatusBadge } from "../components/ui";
import { templateByKey } from "../templates/catalog";
import { Skeleton, StatusChip, fmtDay } from "../tickets/parts";
import { EmptyNote, Flag } from "./charts";
import { drillPath, insightLink, studyLink, ticketLink, type Drill, type DrillAnswer, type DrillRow } from "./drill";
import type { DashFilters } from "./model";

const NO_FILTERS: DashFilters = { project: null, period: "30" };

/** Opens when `drill` is set; `filters` are the dashboard's (period and project), kept by the items it loads. */
export function DrillModal({ drill, filters = NO_FILTERS, onClose }: { drill: Drill | null; filters?: DashFilters; onClose: () => void }) {
  return (
    <Modal open={!!drill} onClose={onClose} title={drill?.title ?? ""} wide>
      {drill && (drill.kind === "rows" ? <Rows rows={drill.rows} empty={drill.empty} note={drill.note} total={drill.total} /> : <Remote key={drillPath(drill, filters)} path={drillPath(drill, filters)} />)}
    </Modal>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="-mx-2 flex max-h-[60vh] flex-col divide-y divide-line/60 overflow-y-auto">{children}</ul>;
}
function Item({ to, title, sub, end }: { to: string; title: ReactNode; sub?: ReactNode; end?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="focus-ring group flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-ink/[0.04]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold group-hover:underline">{title}</span>
          {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
        </span>
        {end && <span className="flex shrink-0 items-center gap-2 text-[13px] font-semibold tabular-nums">{end}</span>}
        <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

function Rows({ rows, empty, note, total }: { rows: DrillRow[]; empty: string; note?: string; total?: number }) {
  if (!rows.length) return <EmptyNote>{empty}</EmptyNote>;
  const count = total !== undefined && total > rows.length
    ? t("Mostrando {a} de {b}", { a: fmtNum(rows.length), b: fmtNum(total) })
    : plural(rows.length, { one: "{n} elemento", other: "{n} elementos" });
  const end = (r: DrillRow) => r.severity ? <SeverityBadge severity={r.severity} /> : r.end ? (r.tone ? <Flag tone={r.tone}>{r.end}</Flag> : r.end) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">{count}{note ? ` · ${note}` : ""}</p>
      <List>{rows.map((r) => <Item key={r.key} to={r.to} title={r.title} sub={r.sub} end={end(r)} />)}</List>
    </div>
  );
}

function Remote({ path }: { path: string }) {
  const load = useLoad(() => api.get<DrillAnswer>(path), [path]);
  if (load.error) return <div className="space-y-3"><ErrorNote>{load.error}</ErrorNote><Button onClick={() => load.reload()}>{t("Reintentar")}</Button></div>;
  if (!load.data) return <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("Cargando…")}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  const d = load.data;
  if (!d.items.length) return <EmptyNote>{t("No hay elementos detrás de esta cifra.")}</EmptyNote>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3" role="status">
        {d.total > d.items.length ? t("Mostrando {a} de {b}", { a: fmtNum(d.items.length), b: fmtNum(d.total) }) : plural(d.total, { one: "{n} elemento", other: "{n} elementos" })}
      </p>
      <List>
        {d.kind === "tickets" ? d.items.map((x) => (
          <Item key={`${x.project_id}-${x.number}`} to={ticketLink(x)} title={<><span className="text-ink-3 tabular-nums">#{x.number}</span> {x.title}</>}
            sub={[x.project_name, x.assignees ?? t("Sin asignar"), x.closed_at ? t("cerrado {a}", { a: relTime(x.closed_at) }) : t("creado {a}", { a: relTime(x.created_at) })].join(" · ")}
            end={<>{x.due_date && x.status !== "done" && (x.due_date < today ? <Flag tone="bad">{t("Vencía el {a}", { a: fmtDay(x.due_date) })}</Flag> : <span className="text-ink-2">{fmtDay(x.due_date)}</span>)}<StatusChip status={x.status} /></>} />
        )) : d.kind === "studies" ? d.items.map((s) => (
          <Item key={s.id} to={studyLink(s)} title={s.title}
            sub={`${s.project_name} · ${templateByKey(s.method)?.name ?? s.method} · ${t("{a} de {b} terminaron", { a: s.finished, b: s.started })}`}
            end={<>{s.n !== null && <span>{fmtNum(s.n)}</span>}<StatusBadge status={s.status} /></>} />
        )) : d.items.map((i) => (
          <Item key={i.id} to={insightLink(i)} title={i.title}
            sub={[i.project_name, i.study_title, relTime(i.created_at)].filter(Boolean).join(" · ")}
            end={<SeverityBadge severity={i.severity} />} />
        ))}
      </List>
    </div>
  );
}
