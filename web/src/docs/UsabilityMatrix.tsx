import { Plus, Trash2 } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, exStr, useDoc } from "./Sections";

export type TaskStatus = "pass" | "partial" | "fail" | "na";
export interface UTask { id: string; name: string; success: string }
export interface UUser { id: string; name: string; profile: string }
export interface UsabilityData { tasks: UTask[]; users: UUser[]; results: Record<string, { status: TaskStatus | null; note: string }> }

const STATUS: { id: TaskStatus; label: string; icon: string; cls: string }[] = [
  { id: "pass", label: "Pasa", icon: "✓", cls: "border-good bg-good-soft text-good" },
  { id: "partial", label: "Parcial", icon: "◐", cls: "border-warn bg-warn-soft text-warn" },
  { id: "fail", label: "Falla", icon: "✗", cls: "border-bad bg-bad-soft text-bad" },
  { id: "na", label: "N/A", icon: "–", cls: "border-line-2 bg-paper text-ink-3" },
];
const VALUE: Record<TaskStatus, number | null> = { pass: 1, partial: 0.5, fail: 0, na: null };

/** Tasa de éxito: Pasa = 100 %, Parcial = 50 %, Falla = 0 %; N/A y vacíos no cuentan. */
export function taskRate(d: UsabilityData, taskId: string) {
  const vals = d.users.map((u) => d.results[`${taskId}:${u.id}`]?.status).filter((s): s is TaskStatus => !!s && s !== "na");
  return { n: vals.length, done: vals.filter((s) => s === "pass").length, rate: vals.length ? vals.reduce((a, s) => a + (VALUE[s] ?? 0), 0) / vals.length : null };
}

export function UsabilityMatrix({ data, set, ex }: { data: UsabilityData; set: (d: UsabilityData) => void; ex?: UsabilityData }) {
  const { T, readOnly } = useDoc();
  const { tasks = [], users = [], results = {} } = data;
  const upd = (p: Partial<UsabilityData>) => set({ tasks, users, results, ...p });
  const res = (t: string, u: string) => results[`${t}:${u}`] ?? { status: null, note: "" };
  const setRes = (t: string, u: string, p: Partial<{ status: TaskStatus | null; note: string }>) => upd({ results: { ...results, [`${t}:${u}`]: { ...res(t, u), ...p } } });
  const rates = tasks.map((tk) => taskRate({ tasks, users, results }, tk.id));
  const valid = rates.filter((r) => r.rate !== null);
  const total = valid.length ? valid.reduce((a, r) => a + (r.rate ?? 0), 0) / valid.length : null;
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[[T("Participantes"), users.length], [T("Tareas"), tasks.length], [T("Tasa total de tareas completadas"), pct(total)]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-paper p-3"><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-xs text-ink-2">{l}</p></div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="bg-accent text-left text-white">
              <th className="p-2.5 font-semibold">#</th>
              <th className="min-w-48 p-2.5 font-semibold">{T("Tarea")}</th>
              <th className="min-w-56 p-2.5 font-semibold">{T("Descripción de éxito")}</th>
              {users.map((u, k) => (
                <th key={u.id} className="group min-w-52 border-l border-white/20 p-2 align-top font-semibold">
                  {readOnly ? <><p>{u.name || `${T("Participante")} ${k + 1}`}</p><p className="text-[11px] font-normal text-white/85">{u.profile}</p></> : <>
                    <div className="flex items-center gap-1">
                      <input value={u.name} placeholder={exStr(ex, "users", k, "name") ?? `${T("Participante")} ${k + 1}`} onChange={(e) => upd({ users: users.map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)) })} className="w-full bg-transparent font-semibold outline-none placeholder:text-white/70" />
                      <button type="button" onClick={() => upd({ users: users.filter((x) => x.id !== u.id) })} className="opacity-0 group-hover:opacity-100 print:hidden" aria-label={T("Eliminar")}><Trash2 size={12} /></button>
                    </div>
                    <input value={u.profile} placeholder={exStr(ex, "users", k, "profile") ?? T("Perfil / país / rol")} onChange={(e) => upd({ users: users.map((x) => (x.id === u.id ? { ...x, profile: e.target.value } : x)) })} className="w-full bg-transparent text-[11px] font-normal outline-none placeholder:text-white/70" />
                  </>}
                </th>
              ))}
              <th className="border-l border-white/20 p-2.5 text-center font-semibold">{T("Completadas")}</th>
              <th className="p-2.5 text-center font-semibold">{T("Tasa de éxito")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((tk, i) => (
              <tr key={tk.id} className="group border-t border-line align-top">
                <td className="p-2.5 text-ink-3 tabular-nums">{i + 1}</td>
                <td className="p-1.5">
                  {readOnly ? <p className="p-1 font-medium">{tk.name}</p> : <div className="flex">
                    <AutoText value={tk.name} minRows={1} placeholder={exStr(ex, "tasks", i, "name") ?? T("Nombre de la tarea")} onChange={(v) => upd({ tasks: tasks.map((x) => (x.id === tk.id ? { ...x, name: v } : x)) })} className="font-medium" />
                    <button type="button" onClick={() => upd({ tasks: tasks.filter((x) => x.id !== tk.id) })} className="mt-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad print:hidden" aria-label={T("Eliminar")}><Trash2 size={12} /></button>
                  </div>}
                </td>
                <td className="p-1.5">{readOnly ? <p className="p-1 text-ink-2">{tk.success}</p>
                  : <AutoText value={tk.success} minRows={1} placeholder={exStr(ex, "tasks", i, "success") ?? T("¿Qué debe hacer para completarla? Ej.: Menú > Configuración > Empresa")} onChange={(v) => upd({ tasks: tasks.map((x) => (x.id === tk.id ? { ...x, success: v } : x)) })} className="text-ink-2" />}</td>
                {users.map((u, k) => {
                  const r = res(tk.id, u.id);
                  const exTask = ex?.tasks[i]?.id, exUser = ex?.users[k]?.id;
                  const exNote = exTask && exUser ? ex?.results[`${exTask}:${exUser}`]?.note : undefined;
                  return (
                    <td key={u.id} className="border-l border-line p-1.5">
                      <div className="flex gap-1">
                        {STATUS.map((st) => (
                          <button key={st.id} type="button" disabled={readOnly} title={T(st.label)} onClick={() => setRes(tk.id, u.id, { status: r.status === st.id ? null : st.id })}
                            className={cx("rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition", r.status === st.id ? st.cls : readOnly ? "hidden" : "border-line text-ink-3 hover:border-line-2")}>
                            {st.icon} {T(st.label)}
                          </button>
                        ))}
                      </div>
                      {readOnly ? (r.note && <p className="mt-1 text-[12px] text-ink-2">{r.note}</p>)
                        : <AutoText value={r.note} minRows={1} placeholder={exNote || T("Observaciones…")} onChange={(v) => setRes(tk.id, u.id, { note: v })} className="mt-1 text-[12px]" />}
                    </td>
                  );
                })}
                <td className="border-l border-line p-2.5 text-center font-semibold tabular-nums">{rates[i].done}</td>
                <td className="p-2.5 text-center">
                  <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums", rates[i].rate === null ? "text-ink-3" : rates[i].rate! >= 0.8 ? "bg-good-soft text-good" : rates[i].rate! >= 0.5 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad")}>{pct(rates[i].rate)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={() => upd({ tasks: [...tasks, { id: uid(), name: "", success: "" }] })} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:border-accent"><Plus size={14} /> {T("Tarea")}</button>
          <button type="button" onClick={() => upd({ users: [...users, { id: uid(), name: "", profile: "" }] })} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:border-accent"><Plus size={14} /> {T("Participante")}</button>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="rounded-xl border border-line p-4 break-inside-avoid">
          <p className="mb-3 text-[13px] font-semibold">{T("Éxito por tarea")}</p>
          <div className="space-y-2">
            {tasks.map((tk, i) => (
              <div key={tk.id} className="grid grid-cols-[160px_1fr_48px] items-center gap-3 text-[13px]">
                <span className="truncate">{i + 1}. {tk.name || `${T("Tarea")} ${i + 1}`}</span>
                <div className="h-2.5 rounded-full bg-ink/[0.06]"><div className={cx("h-2.5 rounded-full", (rates[i].rate ?? 0) >= 0.8 ? "bg-good" : (rates[i].rate ?? 0) >= 0.5 ? "bg-warn" : "bg-bad")} style={{ width: `${(rates[i].rate ?? 0) * 100}%`, minWidth: rates[i].rate ? 4 : 0 }} /></div>
                <span className="text-right font-semibold tabular-nums">{pct(rates[i].rate)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">{T("Pasa = 100 %, Parcial = 50 %, Falla = 0 %. N/A no cuenta para el promedio.")}</p>
        </div>
      )}
    </div>
  );
}
