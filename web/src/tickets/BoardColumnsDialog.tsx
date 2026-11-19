// Editing the columns of a project's ticket board: rename, reorder, add and remove.
// Every column counts as one of four statuses; that is what reports, milestones and My work read.
// Rows reorder with the arrow buttons (keyboard) or by dragging the grip, the same pointer drag as ranking questions.
import { useRef, useState, type PointerEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { uid } from "../lib/hooks";
import { t } from "../lib/i18n";
import { Button, ErrorNote, cx } from "../components/ui";
import { rankSlot, rankTarget } from "../blocks/ranking";
import { MAX_COLUMNS, STATUSES, columnOf, columnsProblem, looksLikeReviewAsDone, moveItem, type Column, type ColumnDraft, type Ticket, type TicketStatus } from "./model";
import { ColumnChip, Dialog, columnName, statusLabel } from "./parts";

type Saved = { columns: Column[]; tickets: Ticket[] };
/** A row being dragged: where it started, where it would land, and the rows' geometry measured when the drag began. */
type RowDrag = { from: number; to: number; dy: number; startY: number; listTop: number; tops: number[]; heights: number[] };
const ROW_GAP = 8;   // space-y-2 between rows
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** What each status means for the numbers, in plain words, shown next to the picker. */
const statusHelp = (s: TicketStatus) => ({
  todo: t("Aún no empieza. Aquí llegan los tickets nuevos."),
  in_progress: t("Alguien está trabajando en ello."),
  in_review: t("QA, pruebas o revisión: aún no cuenta como terminado."),
  done: t("Cuenta como terminado en dashboards y avance. Va al final del tablero."),
})[s];

export function BoardColumnsDialog({ projectId, columns, tickets, onClose, onSaved }: {
  projectId: string; columns: Column[]; tickets: Ticket[]; onClose: () => void; onSaved: (r: Saved) => void;
}) {
  const [draft, setDraft] = useState<ColumnDraft[]>(() => columns.map((c) => ({ key: c.id, id: c.id, name: columnName(c), status: c.status })));
  // Where the tickets of each removed column go (removed column id → key of a column in the draft).
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  const count = (id: string) => tickets.filter((x) => columnOf(x, columns).id === id).length;
  const removed = columns.filter((c) => !draft.some((d) => d.id === c.id) && count(c.id) > 0);
  const problem = columnsProblem(draft);
  const problemText = problem === null ? null
    : problem === "count" ? t("El tablero necesita entre 2 y {a} columnas.", { a: MAX_COLUMNS })
    : problem === "name" ? t("Cada columna necesita un nombre.")
    : problem === "duplicate" ? t("Dos columnas no pueden llamarse igual.")
    : problem === "todo" ? t("Al menos una columna debe contar como Por hacer: ahí llegan los tickets nuevos.")
    : problem === "done" ? t("Al menos una columna debe contar como Hecho: así se sabe qué está terminado.")
    : t("Las columnas que cuentan como Hecho van al final del tablero. Muévelas al final, o cambia a En revisión las que todavía se están probando.");
  const set = (key: string, patch: Partial<ColumnDraft>) => setDraft(draft.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  /** The column a removed one hands its tickets to, unless another was picked: same status first. */
  // Only columns that already exist can receive them: a brand-new column has no id to point at until it is saved.
  const existing = draft.filter((d) => d.id);
  const target = (c: Column) => existing.find((d) => d.key === moves[c.id]) ?? existing.find((d) => d.status === c.status) ?? existing[0];

  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { columns: draft.map((d) => ({ id: d.id, name: d.name.trim(), status: d.status })), moves: Object.fromEntries(removed.map((c) => [c.id, target(c)?.id]).filter(([, to]) => to)) };
      onSaved(await api.put<Saved>(`/projects/${projectId}/tickets/columns`, body));
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function reset() {
    if (!confirm(t("¿Volver a las cuatro columnas originales? Cada ticket queda en la columna de su estado."))) return;
    setBusy(true); setError(null);
    try { onSaved(await api.del<Saved>(`/projects/${projectId}/tickets/columns`)); } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  // Dragging by the grip: the row follows the pointer and the others make room, as in ranking questions.
  const start = (e: PointerEvent<HTMLElement>, i: number) => {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = draft.map((d) => rows.current.get(d.key)!.getBoundingClientRect());
    setDrag({ from: i, to: i, dy: 0, startY: e.clientY, listTop: list.current!.getBoundingClientRect().top, tops: rects.map((r) => r.top), heights: rects.map((r) => r.height) });
  };
  const track = (e: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const last = drag.tops.length - 1;
    const min = drag.tops[0] - drag.tops[drag.from];
    const max = drag.tops[last] + drag.heights[last] - drag.heights[drag.from] - drag.tops[drag.from];
    // The dialog can scroll during the drag: measure against the list, not the window.
    const scrolled = drag.listTop - list.current!.getBoundingClientRect().top;
    const dy = Math.min(max, Math.max(min, e.clientY - drag.startY + scrolled));
    setDrag({ ...drag, dy, to: rankTarget({ ...drag, dy }) });
  };
  const finish = (commit: boolean) => {
    if (!drag) return;
    setDrag(null);
    if (commit) setDraft(moveItem(draft, drag.from, drag.to));
  };
  const icon = "focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink disabled:opacity-30";

  return (
    <Dialog title={t("Columnas del tablero")} subtitle={t("Cambia el nombre, el orden y cuántas columnas tiene el tablero de este proyecto.")} onClose={onClose} width={640}
      footer={<>
        {columns.some((c) => c.custom) && <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={busy} onClick={reset} className="mr-auto">{t("Restablecer")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
        <Button variant="primary" disabled={busy || problem !== null} onClick={save}>{t("Guardar columnas")}</Button>
      </>}>
      <div className="space-y-4">
        <ol ref={list} className="space-y-2">
          {draft.map((d, i) => {
            const held = drag?.from === i;
            const shift = drag && !held ? (rankSlot(i, drag.from, drag.to) - i) * (drag.heights[drag.from] + ROW_GAP) : 0;
            return (
            <li key={d.key} ref={(el) => { if (el) rows.current.set(d.key, el); else rows.current.delete(d.key); }}
              style={{ transform: held ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined, transition: drag && !held ? `transform 200ms ${EASE}` : undefined }}
              className={cx("relative flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-2", held ? "z-10 border-accent shadow-xl" : "border-line")}>
              <span className={cx("-mr-1 flex h-9 w-7 shrink-0 touch-none select-none items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink", held ? "cursor-grabbing" : "cursor-grab")}
                title={t("Arrastra para cambiar el orden")} aria-hidden
                onPointerDown={(e) => start(e, i)} onPointerMove={track} onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)}>
                <GripVertical size={16} />
              </span>
              <span className="flex">
                <button type="button" className={icon} disabled={i === 0} onClick={() => setDraft(moveItem(draft, i, i - 1))} aria-label={`${t("Mover arriba")}: ${d.name}`} title={t("Mover arriba")}><ArrowUp size={15} /></button>
                <button type="button" className={icon} disabled={i === draft.length - 1} onClick={() => setDraft(moveItem(draft, i, i + 1))} aria-label={`${t("Mover abajo")}: ${d.name}`} title={t("Mover abajo")}><ArrowDown size={15} /></button>
              </span>
              <input className="field h-10 min-w-[140px] flex-1 py-0" maxLength={40} value={d.name} aria-label={t("Nombre de la columna {a}", { a: i + 1 })} placeholder={t("Nombre de la columna")}
                data-autofocus={d.id ? undefined : true} onChange={(e) => set(d.key, { name: e.target.value })} />
              <label className="flex items-center gap-2 text-[13px] text-ink-3">{t("Cuenta como")}
                <select className="field h-10 w-36 py-0 text-[13px]" value={d.status} onChange={(e) => set(d.key, { status: e.target.value as TicketStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                </select>
              </label>
              <span className="w-16 text-right text-xs text-ink-3 tabular-nums">{d.id ? t("{a} tickets", { a: count(d.id) }) : t("nueva")}</span>
              <button type="button" className={cx(icon, "hover:bg-bad-soft hover:text-bad")} disabled={draft.length <= 2} onClick={() => setDraft(draft.filter((x) => x.key !== d.key))} aria-label={t("Quitar la columna {a}", { a: d.name })} title={t("Quitar columna")}><Trash2 size={15} /></button>
              <p className="basis-full pl-1 text-xs text-ink-3 sm:pl-28">{statusHelp(d.status)}</p>
              {looksLikeReviewAsDone(d) && (
                <p className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink-2">
                  <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden />
                  <span className="min-w-0 flex-1">{t("\"{a}\" parece un paso de pruebas o revisión. Si sus tickets aún no están terminados, mejor que cuente como En revisión.", { a: d.name.trim() })}</span>
                  <button type="button" className="focus-ring rounded-md px-2 py-1 font-semibold text-accent-ink hover:underline" onClick={() => set(d.key, { status: "in_review" })}>{t("Usar En revisión")}</button>
                </p>
              )}
            </li>
            );
          })}
        </ol>
        <Button icon={<Plus size={15} />} disabled={draft.length >= MAX_COLUMNS} onClick={() => setDraft([...draft, { key: uid(), name: "", status: "in_progress" }])}>{t("Agregar columna")}</Button>

        {removed.length > 0 && (
          <div className="space-y-2 rounded-xl border border-warn/30 bg-warn-soft p-3 text-sm">
            <p className="font-semibold">{t("Los tickets de las columnas que quitas se mueven, no se borran.")}</p>
            {removed.map((c) => (
              <label key={c.id} className="flex flex-wrap items-center gap-2">
                <ColumnChip column={c} /><span className="text-ink-2">{t("{a} tickets pasan a", { a: count(c.id) })}</span>
                <select className="field h-9 w-44 py-0 text-[13px]" value={target(c)?.key ?? ""} onChange={(e) => setMoves({ ...moves, [c.id]: e.target.value })}>
                  {existing.map((d) => <option key={d.key} value={d.key}>{d.name || t("(sin nombre)")}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-3">{t("\"Cuenta como\" decide cómo aparece cada columna en dashboards, hitos y Mi trabajo. Por ejemplo, \"QA\" puede contar como En revisión y \"Publicado\" como Hecho.")} {t("Arrastra el ícono de la izquierda o usa las flechas para cambiar el orden.")}</p>
        {problemText && <p role="alert" className="text-sm text-bad">{problemText}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Dialog>
  );
}
