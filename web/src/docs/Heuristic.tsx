import { useState } from "react";
import { BarChart3, Plus, X } from "lucide-react";
import { uid } from "../lib/hooks";
import { cx } from "../components/ui";
import { AutoText, exStr, useDoc } from "./Sections";
import { SEVERITY, heuristicCategories, type Framework } from "./heuristics";

type Result = "pass" | "fail" | "na";
interface Answer { r: Result | null; s: number | null; n: string }
export interface HeuristicData { framework: Framework; product: string; evaluators: { id: string; name: string }[]; answers: Record<string, Answer> }

const RESULTS: { id: Result; label: string; cls: string }[] = [
  { id: "pass", label: "Pasa", cls: "border-good bg-good-soft text-good" },
  { id: "fail", label: "Falla", cls: "border-bad bg-bad-soft text-bad" },
  { id: "na", label: "N/A", cls: "border-line-2 bg-paper text-ink-3" },
];

export function Heuristic({ data, set, ex }: { data: HeuristicData; set: (d: HeuristicData) => void; ex?: HeuristicData }) {
  const { T, lang, readOnly } = useDoc();
  const fw = data.framework ?? "weinschenk";
  const evaluators = data.evaluators ?? [];
  const answers = data.answers ?? {};
  const cats = heuristicCategories(fw, lang);
  const items = cats.flatMap((c) => c.items);
  const [tab, setTab] = useState<string>(readOnly ? "global" : evaluators[0]?.id ?? "global");
  const upd = (p: Partial<HeuristicData>) => set({ framework: fw, product: data.product ?? "", evaluators, answers, ...p });
  const ans = (item: string, ev: string): Answer => answers[`${item}:${ev}`] ?? { r: null, s: null, n: "" };
  const setAns = (item: string, ev: string, p: Partial<Answer>) => upd({ answers: { ...answers, [`${item}:${ev}`]: { ...ans(item, ev), ...p } } });
  const sevLabel = (s: number) => SEVERITY[s][lang === "en" ? 1 : 0];
  const evName = (ev: { id: string; name: string }) => ev.name || `${T("Evaluador")} ${evaluators.indexOf(ev) + 1}`;
  // Ejemplo de nota para el ítem, tomado del evaluador en la misma posición
  const exNote = (item: string) => { const k = evaluators.findIndex((e) => e.id === tab); const eid = ex?.evaluators[k]?.id; return eid ? exStr(ex, "answers", `${item}:${eid}`, "n") : undefined; };

  return (
    <div className="space-y-5">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="text-[12px] font-semibold text-ink-2">{T("Marco de evaluación")}</span>
          <div className="flex rounded-lg bg-paper p-0.5 text-[12px] font-medium">
            {([["weinschenk", "Heurísticas psicológicas (Weinschenk)"], ["nielsen", "10 heurísticas de Nielsen"]] as const).map(([id, l]) => (
              <button key={id} type="button" onClick={() => upd({ framework: id })} className={cx("rounded-md px-3 py-1.5", fw === id ? "bg-surface shadow-sm" : "text-ink-3")}>{T(l)}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-line print:hidden">
        {evaluators.map((ev, k) => {
          const done = items.filter((it) => ans(it.id, ev.id).r).length;
          return (
            <div key={ev.id} className={cx("group -mb-px flex items-center gap-1 border-b-2 px-2 py-2", tab === ev.id ? "border-accent" : "border-transparent")}>
              {readOnly ? <button type="button" onClick={() => setTab(ev.id)} className="text-[13px] font-medium">{evName(ev)}</button>
                : <input value={ev.name} placeholder={exStr(ex, "evaluators", k, "name") ?? evName(ev)} onFocus={() => setTab(ev.id)} onChange={(e) => upd({ evaluators: evaluators.map((x) => (x.id === ev.id ? { ...x, name: e.target.value } : x)) })} className="w-28 bg-transparent text-[13px] font-medium outline-none" />}
              <span className="rounded-full bg-ink/5 px-1.5 text-[10px] text-ink-2 tabular-nums">{done}/{items.length}</span>
              {!readOnly && evaluators.length > 1 && <button type="button" onClick={() => { upd({ evaluators: evaluators.filter((x) => x.id !== ev.id) }); setTab("global"); }} className="text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad"><X size={11} /></button>}
            </div>
          );
        })}
        {!readOnly && <button type="button" onClick={() => { const id = uid(); upd({ evaluators: [...evaluators, { id, name: "" }] }); setTab(id); }} className="flex items-center gap-1 px-2 py-2 text-[12px] font-medium text-accent"><Plus size={12} /> {T("Evaluador")}</button>}
        <button type="button" onClick={() => setTab("global")} className={cx("-mb-px ml-auto flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold", tab === "global" ? "border-accent text-ink" : "border-transparent text-ink-3")}>
          <BarChart3 size={14} /> {T("Resultados globales")}
        </button>
      </div>

      {tab !== "global" && evaluators.some((e) => e.id === tab) ? (
        <div className="space-y-5">
          {cats.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-line break-inside-avoid">
              <p className="bg-accent-soft/60 px-3 py-2 font-semibold">{c.name}</p>
              {c.items.map((it, i) => {
                const a = ans(it.id, tab);
                return (
                  <div key={it.id} className="grid gap-2 border-t border-line p-3 md:grid-cols-[1fr_auto]">
                    <p className="text-[13px]"><span className="mr-1.5 text-ink-3 tabular-nums">{fw === "weinschenk" ? `${c.id.slice(1)}.${i + 1}` : ""}</span>{it.text}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {RESULTS.map((r) => (
                        <button key={r.id} type="button" disabled={readOnly} onClick={() => setAns(it.id, tab, { r: a.r === r.id ? null : r.id, s: r.id === "fail" ? a.s ?? 2 : null })}
                          className={cx("rounded-md border px-2 py-0.5 text-[11px] font-semibold", a.r === r.id ? r.cls : "border-line text-ink-3 hover:border-line-2")}>{T(r.label)}</button>
                      ))}
                      {a.r === "fail" && (
                        <select disabled={readOnly} value={a.s ?? 2} onChange={(e) => setAns(it.id, tab, { s: +e.target.value })} className="field h-7 w-36 py-0 text-[12px]" aria-label={T("Severidad")}>
                          {SEVERITY.map((_, s) => <option key={s} value={s}>{sevLabel(s)}</option>)}
                        </select>
                      )}
                    </div>
                    {(a.r === "fail" || a.n) && (
                      <div className="md:col-span-2">
                        {readOnly ? <p className="text-[12px] text-ink-2">{a.n}</p>
                          : <AutoText value={a.n} minRows={1} placeholder={exNote(it.id) ?? T("Notas del evaluador: ¿dónde ocurre? ¿qué recomiendas?")} onChange={(v) => setAns(it.id, tab, { n: v })} className="text-[12px]" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <Global cats={cats} evaluators={evaluators} ans={ans} sevLabel={sevLabel} />
      )}
    </div>
  );
}

function Global({ cats, evaluators, ans, sevLabel }: {
  cats: ReturnType<typeof heuristicCategories>; evaluators: { id: string; name: string }[];
  ans: (i: string, e: string) => Answer; sevLabel: (s: number) => string;
}) {
  const { T } = useDoc();
  const rows = cats.map((c) => {
    let pass = 0, fail = 0; const sev: number[] = [];
    for (const it of c.items) for (const ev of evaluators) { const a = ans(it.id, ev.id); if (a.r === "pass") pass++; if (a.r === "fail") { fail++; if (a.s !== null) sev.push(a.s); } }
    return { c, pass, fail, compliance: pass + fail ? pass / (pass + fail) : null, sev: sev.length ? sev.reduce((x, y) => x + y, 0) / sev.length : null };
  });
  const tp = rows.reduce((a, r) => a + r.pass, 0), tf = rows.reduce((a, r) => a + r.fail, 0);
  const issues = cats.flatMap((c) => c.items.map((it) => {
    const fails = evaluators.map((ev) => ({ ev, a: ans(it.id, ev.id) })).filter((x) => x.a.r === "fail");
    return { c, it, fails, max: Math.max(-1, ...fails.map((f) => f.a.s ?? 0)), avg: fails.length ? fails.reduce((s, f) => s + (f.a.s ?? 0), 0) / fails.length : 0 };
  })).filter((x) => x.fails.length).sort((a, b) => b.avg - a.avg || b.fails.length - a.fails.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[[T("Cumplimiento global"), tp + tf ? `${Math.round((tp / (tp + tf)) * 100)}%` : "—"], [T("Problemas encontrados"), issues.length], [T("Evaluadores"), evaluators.length]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-paper p-3"><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-xs text-ink-2">{l}</p></div>
        ))}
      </div>
      <div className="rounded-xl border border-line p-4 break-inside-avoid">
        <p className="mb-3 text-[13px] font-semibold">{T("Cumplimiento por heurística")}</p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.c.id} className="grid grid-cols-[minmax(0,1fr)_120px_70px_100px] items-center gap-3 text-[13px]">
              <span className="truncate">{r.c.name}</span>
              <div className="h-2.5 rounded-full bg-ink/[0.06]"><div className={cx("h-2.5 rounded-full", (r.compliance ?? 0) >= 0.8 ? "bg-good" : (r.compliance ?? 0) >= 0.5 ? "bg-warn" : "bg-bad")} style={{ width: `${(r.compliance ?? 0) * 100}%` }} /></div>
              <span className="text-right font-semibold tabular-nums">{r.compliance === null ? "—" : `${Math.round(r.compliance * 100)}%`}</span>
              <span className="text-right text-[12px] text-ink-2 tabular-nums">{r.sev === null ? "" : `${T("sev.")} ${r.sev.toFixed(1)}`}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-[13px] font-semibold">{T("Problemas priorizados por severidad")}</p>
        {issues.length === 0 ? <p className="rounded-xl bg-paper p-4 text-sm text-ink-3">{T("Aún no hay ítems marcados como Falla.")}</p> : (
          <ol className="space-y-2">
            {issues.map(({ c, it, fails, max }) => (
              <li key={it.id} className="rounded-xl border border-line p-3 break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[13px] font-medium">{it.text}</p>
                  <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", max >= 3 ? "bg-bad-soft text-bad" : max === 2 ? "bg-warn-soft text-warn" : "bg-paper text-ink-2")}>{sevLabel(Math.max(0, max))}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-3">{c.name} · {fails.length}/{evaluators.length} {T("evaluadores")}</p>
                {fails.filter((f) => f.a.n).map((f) => <p key={f.ev.id} className="mt-1.5 text-[12px] text-ink-2"><b>{f.ev.name || `${T("Evaluador")} ${evaluators.indexOf(f.ev) + 1}`}:</b> {f.a.n}</p>)}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
