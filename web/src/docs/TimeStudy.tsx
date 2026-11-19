import { useState } from "react";
import { ArrowLeftRight, BarChart3, CalendarDays, ListChecks, Plus, Table2, Trash2 } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, useDoc } from "./Sections";
import { addRound, compare, duration, logTable, nextRow, normalize, roundInUse, roundOf, summarize, today, type TimeStudyData, type TSCell, type TSDelta, type TSLine, type TSRow } from "./timeStudyModel";

export type { TimeStudyData };

type Tab = "log" | "summary" | "compare" | "schedule" | "lists";
const TABS: { id: Tab; label: string; icon: typeof Table2 }[] = [
  { id: "log", label: "Registro de tiempo", icon: Table2 },
  { id: "summary", label: "Resumen", icon: BarChart3 },
  { id: "compare", label: "Antes y después", icon: ArrowLeftRight },
  { id: "schedule", label: "Calendario", icon: CalendarDays },
  { id: "lists", label: "Categorías y herramientas", icon: ListChecks },
];

const h = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A change with its sign spelled out, so a drop never reads as a positive number. */
const signed = (x: number) => (Math.abs(x) < 0.05 ? "0.0" : `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`);
const signedPct = (x: number | null) => (x === null ? "—" : Math.abs(x) < 0.005 ? "0%" : `${x > 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`);
const input = "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] outline-none hover:border-line focus:border-accent";
const th = "p-2 text-left text-[12px] font-semibold whitespace-nowrap";
const addBtn = "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:border-accent print:hidden";

/**
 * Time study (observation log), modelled on a real one kept in a spreadsheet: one row per activity, picked from
 * activity buckets and tools the team defines, and a summary per person that adds the time up.
 */
export function TimeStudy({ data, set, ex }: { data: TimeStudyData; set: (d: TimeStudyData) => void; ex?: TimeStudyData }) {
  const { T, readOnly } = useDoc();
  const d = normalize(data);
  const [tab, setTab] = useState<Tab>(d.rows.length || readOnly ? (readOnly ? "summary" : "log") : "lists");
  const [picked, setRound] = useState(d.rounds.at(-1)?.id ?? "");
  const upd = (p: Partial<TimeStudyData>) => set({ ...d, ...p });
  // Two or more rounds: the log and the summary show one round at a time, and the comparison opens up.
  const multi = d.rounds.length > 1;
  const round = multi ? (d.rounds.some((r) => r.id === picked) ? picked : d.rounds.at(-1)!.id) : undefined;
  const observeAgain = () => {
    const r = addRound(d, { first: T("Antes|ronda"), next: d.rounds.length ? T("Ronda {a}", { a: d.rounds.length + 1 }) : T("Después|ronda") });
    set(r.data); setRound(r.round); setTab("log");
  };

  // Read-only (shared link, PDF): everything one after the other, no tabs.
  if (readOnly) return (
    <div className="space-y-8">
      {multi && <Compare d={d} />}
      {multi ? d.rounds.map((r) => <Summary key={r.id} d={d} round={r.id} />) : <Summary d={d} />}
      <Log d={d} upd={upd} ex={ex} />
      <Schedule d={d} upd={upd} />
      <Lists d={d} upd={upd} onObserveAgain={observeAgain} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.filter((x) => x.id !== "compare" || multi).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cx("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold", tab === id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}>
            <Icon size={14} /> {T(label)}{id === "log" && d.rows.length > 0 && <span className="rounded-full bg-ink/5 px-1.5 text-[10px] text-ink-2 tabular-nums">{d.rows.length}</span>}
          </button>
        ))}
      </div>
      {multi && (tab === "log" || tab === "summary") && (
        <div className="flex flex-wrap items-center gap-1.5 print:hidden" role="group" aria-label={T("Ronda de observación")}>
          <span className="mr-1 text-[12px] font-medium text-ink-3">{T("Ronda")}</span>
          {d.rounds.map((r, i) => (
            <button key={r.id} type="button" aria-pressed={round === r.id} onClick={() => setRound(r.id)}
              className={cx("rounded-full border px-2.5 py-0.5 text-[12px]", round === r.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2")}>{r.name || `${T("Ronda")} ${i + 1}`}</button>
          ))}
        </div>
      )}
      {tab === "log" ? <Log d={d} upd={upd} ex={ex} round={round} />
        : tab === "summary" ? <Summary d={d} round={round} onObserveAgain={observeAgain} />
        : tab === "compare" && multi ? <Compare d={d} />
        : tab === "schedule" ? <Schedule d={d} upd={upd} /> : <Lists d={d} upd={upd} onObserveAgain={observeAgain} />}
    </div>
  );
}

type Props = { d: TimeStudyData; upd: (p: Partial<TimeStudyData>) => void };

function Log({ d, upd, ex, round }: Props & { ex?: TimeStudyData; round?: string }) {
  const { T, readOnly } = useDoc();
  const [who, setWho] = useState("");
  const multi = d.rounds.length > 1;
  const rows = d.rows.filter((r) => (!who || r.person === who) && (round === undefined || roundOf(d, r) === round));
  const roundName = (r: TSRow) => d.rounds.find((x) => x.id === roundOf(d, r))?.name ?? "";
  const setRow = (id: string, p: Partial<TSRow>) => upd({ rows: d.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const name = (id: string) => d.people.find((p) => p.id === id)?.name || "";
  const examples = !readOnly && d.rows.length === 0 && ex ? logTable(ex) : [];
  const ready = d.people.length > 0 && d.buckets.length > 0;

  return (
    <div className="space-y-3">
      {readOnly ? <p className="text-[15px] font-semibold">{T("Registro de tiempo")}</p> : (
        <p className="text-[13px] text-ink-2">{T("Una fila por actividad. Empieza una fila nueva cada vez que cambia la actividad, la herramienta o el asunto, aunque sea una tarea de 2 minutos. La duración se calcula con la hora de inicio y de fin.")}</p>
      )}
      {!readOnly && d.people.length > 1 && (
        <div className="flex flex-wrap gap-1 print:hidden">
          {[{ id: "", name: T("Todas las personas") }, ...d.people.map((p, i) => ({ id: p.id, name: p.name || `${T("Persona")} ${i + 1}` }))].map((p) => (
            <button key={p.id} type="button" onClick={() => setWho(p.id)} className={cx("rounded-full border px-2.5 py-0.5 text-[12px]", who === p.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2")}>{p.name}</button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-[13px]">
          <thead className="bg-paper">
            <tr>
              <th className={th}>{T("Persona")}</th><th className={th}>{T("Fecha")}</th><th className={th}>{T("Hora de inicio")}</th><th className={th}>{T("Hora de fin")}</th>
              <th className={cx(th, "text-right")}>{T("Duración (min)")}</th><th className={th}>{T("Categoría de actividad")}</th><th className={th}>{T("Herramienta principal")}</th>
              <th className={th}>{T("Otras herramientas")}</th><th className={th}>{T("Asunto / referencia")}</th><th className={cx(th, "min-w-64")}>{T("Notas del observador")}</th>
              {multi && <th className={th}>{T("Ronda")}</th>}
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {examples.map((r, i) => (
              <tr key={`ex${i}`} className="border-t border-line text-ink-3 italic">
                <td className="p-2">{T("Ejemplo")}</td>{r.slice(1).map((c, k) => <td key={k} className={cx("p-2", k === 3 && "text-right tabular-nums")}>{c}</td>)}<td />
              </tr>
            ))}
            {rows.map((r) => {
              const min = duration(r);
              return readOnly ? (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="p-2">{name(r.person)}</td><td className="p-2 tabular-nums">{r.date}</td><td className="p-2 tabular-nums">{r.start}</td><td className="p-2 tabular-nums">{r.end}</td>
                  <td className="p-2 text-right tabular-nums">{min ?? ""}</td>
                  <td className="p-2">{d.buckets.find((b) => b.id === r.bucket)?.name}</td><td className="p-2">{d.tools.find((t) => t.id === r.tool)?.name}</td>
                  <td className="p-2">{r.other}</td><td className="p-2">{r.ref}</td><td className="p-2 text-ink-2">{r.notes}</td>
                  {multi && <td className="p-2">{roundName(r)}</td>}
                </tr>
              ) : (
                <tr key={r.id} className="group border-t border-line align-top">
                  <td className="p-1"><select aria-label={T("Persona")} value={r.person} onChange={(e) => setRow(r.id, { person: e.target.value })} className={cx(input, "w-32")}>
                    <option value="">—</option>{d.people.map((p, i) => <option key={p.id} value={p.id}>{p.name || `${T("Persona")} ${i + 1}`}</option>)}
                  </select></td>
                  <td className="p-1"><input type="date" aria-label={T("Fecha")} value={r.date} onChange={(e) => setRow(r.id, { date: e.target.value })} className={cx(input, "w-36")} /></td>
                  <td className="p-1"><input type="time" aria-label={T("Hora de inicio")} value={r.start} onChange={(e) => setRow(r.id, { start: e.target.value })} className={cx(input, "w-28")} /></td>
                  <td className="p-1"><input type="time" aria-label={T("Hora de fin")} value={r.end} onChange={(e) => setRow(r.id, { end: e.target.value })} className={cx(input, "w-28")} /></td>
                  <td className={cx("p-2 text-right font-semibold tabular-nums", r.start && r.end && min === null && "text-bad")} title={r.start && r.end && min === null ? T("El fin debe ser después del inicio") : undefined}>{min ?? (r.start && r.end ? "!" : "")}</td>
                  <td className="p-1"><select aria-label={T("Categoría de actividad")} value={r.bucket} onChange={(e) => setRow(r.id, { bucket: e.target.value })} className={cx(input, "w-44")}>
                    <option value="">—</option>{d.buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></td>
                  <td className="p-1"><select aria-label={T("Herramienta principal")} value={r.tool} onChange={(e) => setRow(r.id, { tool: e.target.value })} className={cx(input, "w-40")}>
                    <option value="">—</option>{d.tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></td>
                  <td className="p-1"><input aria-label={T("Otras herramientas")} value={r.other} onChange={(e) => setRow(r.id, { other: e.target.value })} className={cx(input, "w-28")} /></td>
                  <td className="p-1"><input aria-label={T("Asunto / referencia")} value={r.ref} onChange={(e) => setRow(r.id, { ref: e.target.value })} className={cx(input, "w-32")} /></td>
                  <td className="p-1"><AutoText value={r.notes} minRows={1} placeholder={T("¿Qué hizo? ¿Lo interrumpieron?")} onChange={(v) => setRow(r.id, { notes: v })} className="text-[13px]" /></td>
                  {multi && <td className="p-1"><select aria-label={T("Ronda")} value={roundOf(d, r)} onChange={(e) => setRow(r.id, { round: e.target.value })} className={cx(input, "w-32")}>
                    {d.rounds.map((x, i) => <option key={x.id} value={x.id}>{x.name || `${T("Ronda")} ${i + 1}`}</option>)}
                  </select></td>}
                  <td className="p-1"><button type="button" onClick={() => upd({ rows: d.rows.filter((x) => x.id !== r.id) })} className="mt-1 text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-bad" aria-label={T("Eliminar fila")}><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={addBtn} onClick={() => { const r = nextRow(d, round); upd({ rows: [...d.rows, who ? { ...r, person: who } : r] }); }}><Plus size={14} /> {T("Actividad")}</button>
          {!ready && <p className="text-[12px] text-ink-3">{T("Primero agrega a las personas y las categorías en la pestaña Categorías y herramientas.")}</p>}
          {examples.length > 0 && <p className="text-[12px] text-ink-3">{T("Las filas de ejemplo solo son una guía: no se guardan ni cuentan en el resumen.")}</p>}
        </div>
      )}
    </div>
  );
}

function Summary({ d, round, onObserveAgain }: { d: TimeStudyData; round?: string; onObserveAgain?: () => void }) {
  const { T, readOnly } = useDoc();
  const s = summarize(d, round);
  const roundName = round ? d.rounds.find((r) => r.id === round)?.name : undefined;
  const key = d.keyLabel.trim() || T("herramientas clave");
  const who = (i: number) => s.people[i].person.name || `${T("Persona")} ${i + 1}`;
  const many = s.people.length > 1;

  const overview: [string, (p: typeof s.total) => string][] = [
    [T("Días observados"), (p) => String(p.days)],
    [T("Horas registradas"), (p) => h(p.hours)],
    [T("Promedio de horas registradas por día"), (p) => h(p.perDay)],
    [T("Horas con {a} como herramienta principal", { a: key }), (p) => h(p.keyHours)],
    [T("{a}, horas estimadas por semana", { a: key }), (p) => h(p.keyPerWeek)],
  ];

  const table = (title: string, first: string, lines: TSLine[], none: string) => (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-[13px]">
          <thead className="bg-paper">
            <tr><th className={th} rowSpan={2}>{first}</th>{s.people.map((_, i) => <th key={i} colSpan={3} className={cx(th, "border-l border-line text-center")}>{who(i)}</th>)}{many && <th colSpan={3} className={cx(th, "border-l border-line text-center")}>{T("Total")}</th>}</tr>
            <tr className="text-[11px] text-ink-3">{[...s.people, ...(many ? [null] : [])].map((_, i) => [T("Horas"), T("% del registro"), T("Horas/semana (est.)")].map((l, k) => <th key={`${i}${k}`} className={cx("px-2 pb-1.5 text-right font-medium", k === 0 && "border-l border-line")}>{l}</th>))}</tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id || "none"} className={cx("border-t border-line", l.total.hours === 0 && "text-ink-3")}>
                <td className="p-2">{l.id ? l.name : <span className="text-warn">{none}</span>}{l.key && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent-ink">{key}</span>}</td>
                {[...l.cells, ...(many ? [l.total] : [])].map((c: TSCell, i) => [h(c.hours), pct(c.share), h(c.perWeek)].map((v, k) => <td key={`${i}${k}`} className={cx("px-2 py-2 text-right tabular-nums", k === 0 && "border-l border-line")}>{v}</td>))}
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <td className="p-2">{T("Total")}</td>
              {[...s.people.map((p) => p.hours), ...(many ? [s.total.hours] : [])].map((hours, i) => {
                const sum = lines.reduce((a, l) => a + (i < s.people.length ? l.cells[i].hours : l.total.hours), 0);
                const days = i < s.people.length ? s.people[i].days : s.total.days;
                return [h(sum), pct(hours ? sum / hours : 0), h(days ? (sum / days) * d.workdays : 0)].map((v, k) => <td key={`${i}${k}`} className={cx("px-2 py-2 text-right tabular-nums", k === 0 && "border-l border-line")}>{v}</td>);
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {readOnly && <p className="text-[15px] font-semibold">{roundName ? `${T("Resumen")}: ${roundName}` : T("Resumen")}</p>}
      {s.people.length === 0 ? <p className="rounded-xl bg-paper p-4 text-sm text-ink-3">{T("Agrega a las personas que vas a observar en Categorías y herramientas.")}</p> : <>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-max text-[13px]">
            <thead className="bg-paper"><tr><th className={th}>{T("Métrica")}</th>{s.people.map((_, i) => <th key={i} className={cx(th, "text-right")}>{who(i)}</th>)}{many && <th className={cx(th, "text-right")}>{T("Total")}</th>}</tr></thead>
            <tbody>
              {overview.map(([label, f]) => (
                <tr key={label} className="border-t border-line"><td className="p-2">{label}</td>{s.people.map((p, i) => <td key={i} className="p-2 text-right font-semibold tabular-nums">{f(p)}</td>)}{many && <td className="p-2 text-right font-semibold tabular-nums">{f(s.total)}</td>}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-ink-3">
          {T("Las estimaciones semanales son horas ÷ días observados × {a} días de trabajo por semana. Solo la herramienta principal cuenta para {b} y para el desglose por herramienta.", { a: d.workdays, b: key })}
          {s.rowsSkipped > 0 && <> {T("{a} filas no cuentan porque les falta la persona, la fecha o una hora de inicio y fin válida.", { a: s.rowsSkipped })}</>}
        </p>
        {table(T("Tiempo por actividad"), T("Actividad"), s.byBucket, T("Sin categoría"))}
        {table(T("Tiempo por herramienta principal"), T("Herramienta"), s.byTool, T("Sin herramienta"))}
        {!readOnly && onObserveAgain && d.rounds.length < 2 && s.rowsCounted > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-4 print:hidden">
            <div className="min-w-60 flex-1">
              <p className="text-[13px] font-semibold">{T("¿Cambió algo? Mide de nuevo")}</p>
              <p className="text-[12px] text-ink-2">{T("Después de un cambio (una herramienta nueva, IA, otro proceso), observa a las mismas personas otra vez. Lo registrado hasta ahora queda como «Antes» y Antes y después compara las horas por semana con las mismas categorías y herramientas.")}</p>
            </div>
            <button type="button" className={addBtn} onClick={onObserveAgain}><Plus size={14} /> {T("Ronda «Después»")}</button>
          </div>
        )}
      </>}
    </div>
  );
}

/** Before and after: the same buckets and tools in two rounds, on hours per person per week. */
function Compare({ d }: { d: TimeStudyData }) {
  const { T, readOnly } = useDoc();
  const [a, setA] = useState(d.rounds[0].id);
  const [b, setB] = useState(d.rounds.at(-1)!.id);
  const ok = (id: string) => d.rounds.some((r) => r.id === id);
  const before = ok(a) ? a : d.rounds[0].id, after = ok(b) ? b : d.rounds.at(-1)!.id;
  const c = compare(d, before, after);
  const key = d.keyLabel.trim() || T("herramientas clave");
  const name = (id: string) => { const i = d.rounds.findIndex((r) => r.id === id); return d.rounds[i]?.name || `${T("Ronda")} ${i + 1}`; };
  const [nb, na] = [name(before), name(after)];
  const empty = c.before.rowsCounted === 0 || c.after.rowsCounted === 0;

  const head = (first: string) => (
    <thead className="bg-paper"><tr>
      <th className={th}>{first}</th><th className={cx(th, "text-right")}>{nb}</th><th className={cx(th, "text-right")}>{na}</th>
      <th className={cx(th, "text-right")}>{T("Cambio")}</th><th className={cx(th, "text-right")}>{T("Cambio %")}</th>
    </tr></thead>
  );
  const cells = (x: TSDelta, fmt: (n: number) => string = h) => <>
    <td className="p-2 text-right tabular-nums">{fmt(x.before)}</td><td className="p-2 text-right tabular-nums">{fmt(x.after)}</td>
    <td className="p-2 text-right font-semibold tabular-nums">{signed(x.change)}</td><td className="p-2 text-right tabular-nums text-ink-2">{signedPct(x.ratio)}</td>
  </>;
  const table = (title: string, first: string, lines: ReturnType<typeof compare>["byBucket"], none: string) => (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold">{title}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-[13px]">
          {head(first)}
          <tbody>
            {lines.map((l) => (
              <tr key={l.id || "none"} className={cx("border-t border-line", l.delta.before === 0 && l.delta.after === 0 && "text-ink-3")}>
                <td className="p-2">{l.id ? l.name : <span className="text-warn">{none}</span>}{l.key && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-accent-ink">{key}</span>}</td>
                {cells(l.delta)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {readOnly ? <p className="text-[15px] font-semibold">{T("Antes y después")}: {nb} → {na}</p> : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] text-ink-2">{T("Antes|ronda")}
            <select value={before} onChange={(e) => setA(e.target.value)} className="field mt-1 block w-44">{d.rounds.map((r) => <option key={r.id} value={r.id}>{name(r.id)}</option>)}</select></label>
          <ArrowLeftRight size={14} className="mb-3 text-ink-3" aria-hidden />
          <label className="text-[12px] text-ink-2">{T("Después|ronda")}
            <select value={after} onChange={(e) => setB(e.target.value)} className="field mt-1 block w-44">{d.rounds.map((r) => <option key={r.id} value={r.id}>{name(r.id)}</option>)}</select></label>
        </div>
      )}
      {empty ? <p className="rounded-xl bg-paper p-4 text-sm text-ink-3">{T("Las dos rondas necesitan filas completas en el registro para compararlas.")}</p> : <>
        {c.biggest && (
          <p className="rounded-xl bg-accent-soft/50 p-4 text-[14px]">
            {T("El mayor cambio: {a}, {b} h por persona por semana ({c} → {d}).", { a: c.biggest.name || T("Sin categoría"), b: signed(c.biggest.delta.change), c: h(c.biggest.delta.before), d: h(c.biggest.delta.after) })}
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-max text-[13px]">
            {head(T("Métrica"))}
            <tbody>
              <tr className="border-t border-line"><td className="p-2">{T("Días observados")}</td><td className="p-2 text-right tabular-nums">{c.before.total.days}</td><td className="p-2 text-right tabular-nums">{c.after.total.days}</td><td /><td /></tr>
              <tr className="border-t border-line"><td className="p-2">{T("Promedio de horas registradas por día")}</td>{cells(c.perDay)}</tr>
              <tr className="border-t border-line"><td className="p-2">{T("{a}, horas por persona por semana (est.)", { a: key })}</td>{cells(c.keyPerWeek)}</tr>
              {c.people.length > 1 && c.people.map((p, i) => (
                <tr key={p.person.id} className="border-t border-line text-ink-2">
                  <td className="p-2 pl-5">{p.person.name || `${T("Persona")} ${i + 1}`}</td>
                  <td className="p-2 text-right tabular-nums">{p.before === null ? "—" : h(p.before)}</td><td className="p-2 text-right tabular-nums">{p.after === null ? "—" : h(p.after)}</td>
                  <td className="p-2 text-right tabular-nums">{p.before === null || p.after === null ? "—" : signed(p.after - p.before)}</td><td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table(T("Horas por persona por semana, por actividad"), T("Actividad"), c.byBucket, T("Sin categoría"))}
        {table(T("Horas por persona por semana, por herramienta principal"), T("Herramienta"), c.byTool, T("Sin herramienta"))}
        <p className="text-[12px] text-ink-3">{T("Las horas por semana son horas ÷ días observados × {a} días de trabajo, promediadas por persona, así que las rondas se comparan aunque duren distinto o observen a otra cantidad de personas.", { a: d.workdays })}</p>
      </>}
    </div>
  );
}

function Schedule({ d, upd }: Props) {
  const { T, readOnly } = useDoc();
  const setDay = (id: string, p: Partial<TimeStudyData["schedule"][number]>) => upd({ schedule: d.schedule.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  if (readOnly && d.schedule.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className={cx(readOnly ? "text-[15px] font-semibold" : "text-[13px] text-ink-2")}>{readOnly ? T("Calendario") : T("Qué día se observa a quién y quién observa.")}</p>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-[13px]">
          <thead className="bg-paper"><tr><th className={th}>{T("Día")}</th><th className={th}>{T("Persona")}</th><th className={th}>{T("Fecha")}</th><th className={th}>{T("Observador(a)")}</th><th className={cx(th, "min-w-64")}>{T("Notas")}</th>{!readOnly && <th className="w-8" />}</tr></thead>
          <tbody>
            {d.schedule.map((x, i) => readOnly ? (
              <tr key={x.id} className="border-t border-line"><td className="p-2 tabular-nums">{i + 1}</td><td className="p-2">{d.people.find((p) => p.id === x.person)?.name}</td><td className="p-2 tabular-nums">{x.date}</td><td className="p-2">{x.observer}</td><td className="p-2 text-ink-2">{x.notes}</td></tr>
            ) : (
              <tr key={x.id} className="group border-t border-line align-top">
                <td className="p-2 text-ink-3 tabular-nums">{i + 1}</td>
                <td className="p-1"><select aria-label={T("Persona")} value={x.person} onChange={(e) => setDay(x.id, { person: e.target.value })} className={cx(input, "w-36")}><option value="">—</option>{d.people.map((p, k) => <option key={p.id} value={p.id}>{p.name || `${T("Persona")} ${k + 1}`}</option>)}</select></td>
                <td className="p-1"><input type="date" aria-label={T("Fecha")} value={x.date} onChange={(e) => setDay(x.id, { date: e.target.value })} className={cx(input, "w-36")} /></td>
                <td className="p-1"><input aria-label={T("Observador(a)")} value={x.observer} onChange={(e) => setDay(x.id, { observer: e.target.value })} className={cx(input, "w-40")} /></td>
                <td className="p-1"><AutoText value={x.notes} minRows={1} onChange={(v) => setDay(x.id, { notes: v })} className="text-[13px]" /></td>
                <td className="p-1"><button type="button" onClick={() => upd({ schedule: d.schedule.filter((y) => y.id !== x.id) })} className="mt-1 text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-bad" aria-label={T("Eliminar")}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" className={addBtn} onClick={() => { const last = d.schedule.at(-1); upd({ schedule: [...d.schedule, { id: uid(), person: "", date: last?.date ?? today(), observer: last?.observer ?? "", notes: "" }] }); }}><Plus size={14} /> {T("Día")}</button>}
    </div>
  );
}

function Lists({ d, upd, onObserveAgain }: Props & { onObserveAgain: () => void }) {
  const { T, readOnly } = useDoc();
  const key = d.keyLabel.trim() || T("herramientas clave");
  const box = "space-y-2 rounded-xl border border-line p-4";
  const del = (onClick: () => void) => !readOnly && <button type="button" onClick={onClick} className="text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-bad" aria-label={T("Eliminar")}><Trash2 size={13} /></button>;
  const used = (field: "person" | "bucket" | "tool", id: string) => d.rows.some((r) => r[field] === id);
  const confirmRemove = (field: "person" | "bucket" | "tool", id: string, go: () => void) => () => {
    if (used(field, id) && !confirm(T("Hay filas del registro que la usan. Si la quitas, esas filas quedan sin valor. ¿Quitarla?"))) return;
    go();
  };

  return (
    <div className="space-y-4">
      {readOnly && <p className="text-[15px] font-semibold">{T("Categorías y herramientas")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={box}>
          <p className="text-[13px] font-semibold">{T("Personas observadas")}</p>
          {d.people.map((p, i) => (
            <div key={p.id} className="group flex items-center gap-2">
              {readOnly ? <p className="text-[13px]">{p.name}</p> : <input value={p.name} placeholder={`${T("Persona")} ${i + 1}`} onChange={(e) => upd({ people: d.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} className={cx(input, "border-line")} />}
              {del(confirmRemove("person", p.id, () => upd({ people: d.people.filter((x) => x.id !== p.id) })))}
            </div>
          ))}
          {!readOnly && <button type="button" className={addBtn} onClick={() => upd({ people: [...d.people, { id: uid(), name: "" }] })}><Plus size={14} /> {T("Persona")}</button>}
        </div>
        <div className={box}>
          <p className="text-[13px] font-semibold">{T("Ajustes del resumen")}</p>
          <label className="block text-[12px] text-ink-2">{T("Días de trabajo por semana (para las estimaciones semanales)")}
            <input type="number" min={1} max={7} step={0.5} disabled={readOnly} value={d.workdays} onChange={(e) => upd({ workdays: Math.min(7, Math.max(1, Number(e.target.value) || 5)) })} className="field mt-1 w-24" /></label>
          <label className="block text-[12px] text-ink-2">{T("Nombre del grupo de herramientas que mides")}
            <input disabled={readOnly} value={d.keyLabel} placeholder={T("Ej.: nuestro producto")} onChange={(e) => upd({ keyLabel: e.target.value })} className="field mt-1" /></label>
          <p className="text-[11px] text-ink-3">{T("El resumen suma por separado el tiempo con estas herramientas como herramienta principal. Márcalas en la lista de herramientas.")}</p>
        </div>
      </div>

      {d.rounds.length > 0 && (
        <div className={box}>
          <p className="text-[13px] font-semibold">{T("Rondas de observación")}</p>
          <p className="text-[11px] text-ink-3">{T("Cada ronda observa a las mismas personas en otro momento, con las mismas categorías y herramientas. Una ronda solo se puede quitar mientras no tenga filas.")}</p>
          {d.rounds.map((r, i) => {
            const used = roundInUse(d, r.id);
            return (
              <div key={r.id} className="group flex items-center gap-2">
                {readOnly ? <p className="text-[13px]">{r.name}</p> : <input value={r.name} aria-label={T("Nombre de la ronda")} placeholder={`${T("Ronda")} ${i + 1}`} onChange={(e) => upd({ rounds: d.rounds.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} className={cx(input, "max-w-64 border-line")} />}
                {!readOnly && !used && del(() => upd({ rounds: d.rounds.filter((x) => x.id !== r.id) }))}
              </div>
            );
          })}
          {!readOnly && <button type="button" className={addBtn} onClick={onObserveAgain}><Plus size={14} /> {T("Ronda")}</button>}
        </div>
      )}

      <div className={box}>
        <p className="text-[13px] font-semibold">{T("Categorías de actividad")}</p>
        <div className="grid gap-x-3 gap-y-1 text-[11px] font-medium text-ink-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]"><span>{T("Categoría de actividad")}</span><span className="hidden sm:block">{T("Qué cuenta")}</span><span /></div>
        {d.buckets.map((b) => (
          <div key={b.id} className="group grid items-start gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
            {readOnly ? <><p className="text-[13px] font-medium">{b.name}</p><p className="text-[13px] text-ink-2">{b.what}</p></> : <>
              <input value={b.name} aria-label={T("Categoría de actividad")} onChange={(e) => upd({ buckets: d.buckets.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)) })} className={cx(input, "border-line font-medium")} />
              <AutoText value={b.what} minRows={1} placeholder={T("Qué cuenta en esta categoría")} onChange={(v) => upd({ buckets: d.buckets.map((x) => (x.id === b.id ? { ...x, what: v } : x)) })} className="text-[13px]" />
            </>}
            {del(confirmRemove("bucket", b.id, () => upd({ buckets: d.buckets.filter((x) => x.id !== b.id) })))}
          </div>
        ))}
        {!readOnly && <button type="button" className={addBtn} onClick={() => upd({ buckets: [...d.buckets, { id: uid(), name: "", what: "" }] })}><Plus size={14} /> {T("Categoría de actividad")}</button>}
      </div>

      <div className={box}>
        <p className="text-[13px] font-semibold">{T("Herramientas")}</p>
        {d.tools.map((t) => (
          <div key={t.id} className="group flex items-center gap-3">
            {readOnly ? <p className="flex-1 text-[13px]">{t.name}</p> : <input value={t.name} aria-label={T("Herramienta")} onChange={(e) => upd({ tools: d.tools.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} className={cx(input, "max-w-64 border-line")} />}
            <label className="flex items-center gap-1.5 text-[12px] text-ink-2"><input type="checkbox" disabled={readOnly} checked={t.key} onChange={(e) => upd({ tools: d.tools.map((x) => (x.id === t.id ? { ...x, key: e.target.checked } : x)) })} /> {T("Cuenta como {a}", { a: key })}</label>
            {del(confirmRemove("tool", t.id, () => upd({ tools: d.tools.filter((x) => x.id !== t.id) })))}
          </div>
        ))}
        {!readOnly && <button type="button" className={addBtn} onClick={() => upd({ tools: [...d.tools, { id: uid(), name: "", key: false }] })}><Plus size={14} /> {T("Herramienta")}</button>}
      </div>
    </div>
  );
}
