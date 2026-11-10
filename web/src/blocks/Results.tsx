import { useState } from "react";
import type { Block, CardSortBlock, CardSortValue, ChoiceValue, FirstClickBlock, FirstClickValue, MatrixBlock, PreferenceBlock, PreferenceValue, TreeTestBlock, TreeTestValue } from "./types";
import { parseTree } from "./types";
import { isSuccess } from "./logic";
import { PrototypeResult } from "./PrototypeResults";
import { KanoResults } from "./KanoViews";
import { TimedTaskResult } from "./TimedTaskResults";
import type { StudySettings } from "../lib/settings";
import type { Answer } from "../lib/types";
import { blockDef, SUS_ITEMS } from "./registry";
import { cardSortSummary, norm, choiceCounts, distribution, mean, median, nps, rankingSummary, susGrade, susScore } from "../lib/analytics";
import { Card, Stat, cx, toneFor } from "../components/ui";
import { usePrint } from "../lib/print";
import { formatDuration } from "../lib/hooks";

import { t } from "../lib/i18n";
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Barra horizontal: una sola serie, un solo tono; el texto siempre en tinta. */
function Bar({ label, count, total, max, highlight }: { label: string; count: number; total: number; max: number; highlight?: boolean }) {
  return (
    <div className="group" title={`${label}: ${count} (${pct(count, total)}%)`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-ink">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-2">{pct(count, total)}% <span className="text-ink-3">· {count}</span></span>
      </div>
      <div className="h-2 rounded-full bg-ink/[0.05]">
        <div className={cx("h-2 rounded-full transition-all group-hover:opacity-80", highlight ? "bg-accent" : "bg-accent/55")}
          style={{ width: `${max ? (count / max) * 100 : 0}%`, minWidth: count ? 4 : 0 }} />
      </div>
    </div>
  );
}

/** Histograma vertical para escalas. */
function Columns({ rows, total }: { rows: { value: number; count: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex h-36 items-end gap-[2px]">
      {rows.map((r) => (
        <div key={r.value} className="group relative flex h-full flex-1 flex-col items-center justify-end">
          <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper opacity-0 shadow transition group-hover:opacity-100">
            {r.value}: {r.count} ({pct(r.count, total)}%)
          </span>
          <div className="w-full rounded-t bg-accent/70 transition group-hover:bg-accent" style={{ height: `${(r.count / max) * 100}%`, minHeight: r.count ? 4 : 0 }} />
          <span className="mt-1.5 text-xs tabular-nums text-ink-3">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function BlockResult({ block, answers, index, settings }: { block: Block; answers: Answer[]; index: number; settings?: StudySettings }) {
  const def = blockDef(block.type);
  const n = answers.length;
  const med = median(answers.map((a) => a.duration_ms ?? 0).filter(Boolean));
  return (
    <Card className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4 break-after-avoid">
        <div>
          <p className="label flex items-center gap-1.5 !text-[12px]">{def?.icon}<span>{index}. {def?.label}</span></p>
          <h3 className="display mt-2 text-[22px] leading-snug text-balance [overflow-wrap:anywhere] sm:text-[26px]">{block.title}</h3>
        </div>
        <div className="shrink-0 text-right text-[13px] text-ink-3">
          <p className="tabular-nums"><span className="font-semibold text-ink">{n}</span> {t("respuestas")}</p>
          {med > 0 && <p className="tabular-nums">{t("mediana")} {formatDuration(med)}</p>}
        </div>
      </div>
      {n === 0 ? <p className="py-6 text-center text-sm text-ink-3">{t("Aún no hay respuestas para este bloque.")}</p> : <Body block={block} answers={answers} settings={settings} />}
    </Card>
  );
}

function Body({ block, answers, settings }: { block: Block; answers: Answer[]; settings?: StudySettings }) {
  const print = usePrint();
  switch (block.type) {
    case "choice": {
      const { rows, others, n } = choiceCounts(block, answers.map((a) => a.value as ChoiceValue));
      const max = Math.max(1, ...rows.map((r) => r.count));
      return (
        <div className="space-y-3">
          {rows.map((r, i) => <Bar key={r.id} label={r.label} count={r.count} total={n} max={max} highlight={i === 0 && r.count > 0} />)}
          {block.multiple && <p className="text-xs text-ink-3">{t("Selección múltiple: los porcentajes pueden sumar más de 100%.")}</p>}
          {others.length > 0 && <TextList title={t("Respuestas en \"Otro\" ({a})", { a: others.length })} items={others} />}
        </div>
      );
    }
    case "scale": {
      const vals = answers.map((a) => a.value as number);
      const lo = block.style === "emoji" ? 1 : block.min, hi = block.style === "emoji" ? 5 : block.max;
      return (
        <div className="grid items-start gap-6 sm:grid-cols-[220px_1fr]">
          {/* Posición del promedio en la escala: arriba del 70% bien, 50–70% atención, abajo mal */}
          <Stat label={`${t("promedio de")} ${lo}–${hi}`} value={mean(vals).toFixed(1)} sub={`${t("Mediana")} ${median(vals)}`}
            tone={toneFor((mean(vals) - lo) / Math.max(1, hi - lo), 0.7, 0.5, { n: vals.length })} />
          <div>
            <Columns rows={distribution(lo, hi, vals)} total={vals.length} />
            <div className="mt-1 flex justify-between text-xs text-ink-3"><span>{block.minLabel}</span><span>{block.maxLabel}</span></div>
          </div>
        </div>
      );
    }
    case "nps": {
      const vals = answers.map((a) => a.value as number);
      const r = nps(vals);
      const seg = [
        { k: t("Detractores"), sub: "0–6", v: r.detractors, cls: "bg-bad" },
        { k: t("Pasivos"), sub: "7–8", v: r.passives, cls: "bg-ink-3/50" },
        { k: t("Promotores"), sub: "9–10", v: r.promoters, cls: "bg-good" },
      ];
      return (
        <div className="space-y-5">
          <div className="max-w-xs">
            <Stat label={t("NPS · rango −100 a +100")} value={`${r.score > 0 ? "+" : ""}${r.score}`} tone={toneFor(r.score, 30, 0, { n: r.n })}
              note={r.score >= 30 ? t("Bueno") : r.score >= 0 ? t("Mejorable") : t("Más detractores que promotores")} />
          </div>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {seg.filter((s) => s.v).map((s) => <div key={s.k} className={s.cls} style={{ flex: s.v }} title={`${s.k}: ${s.v}`} />)}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {seg.map((s) => (
              <div key={s.k}>
                <p className="flex items-center gap-1.5 text-ink-2"><span className={cx("h-2 w-2 rounded-full", s.cls)} />{s.k} <span className="text-ink-3">{s.sub}</span></p>
                <p className="mt-0.5 font-semibold tabular-nums">{pct(s.v, r.n)}% <span className="font-normal text-ink-3">· {s.v}</span></p>
              </div>
            ))}
          </div>
          <Columns rows={distribution(0, 10, vals)} total={vals.length} />
        </div>
      );
    }
    case "sus": {
      const all = answers.map((a) => a.value as number[]).filter((v) => Array.isArray(v) && v.length === 10);
      const scores = all.map(susScore);
      const avg = mean(scores);
      const g = susGrade(avg);
      const itemMeans = SUS_ITEMS.map((_, i) => mean(all.map((v) => v[i])));
      return (
        <div className="space-y-6">
          <div className="max-w-sm">
            <Stat label={t("Puntaje SUS")} value={avg.toFixed(1)} tone={toneFor(avg, 68, 51, { n: scores.length })} note={`${g.grade} · ${g.adjective}`}
              sub={`${avg >= 68 ? t("Por encima") : t("Por debajo")} ${t("del promedio de la industria (68)")}`} />
          </div>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-bad/25 via-warn/25 to-good/30">
            <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink-3" style={{ left: "68%" }} title={t("Promedio 68")} />
            <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow" style={{ left: `${avg}%` }} />
          </div>
          <div className="flex justify-between text-xs text-ink-3"><span>0</span><span>{t("68 · promedio")}</span><span>100</span></div>
          <details className="group" open={print || undefined}>
            <summary className="cursor-pointer text-sm font-medium text-accent">{t("Ver promedio por ítem")}</summary>
            <div className="mt-3 space-y-2">
              {SUS_ITEMS.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 shrink-0 tabular-nums text-ink-3">{i + 1}</span>
                  <span className="flex-1 text-ink-2">{t(item).replace("{p}", block.product)}</span>
                  <span className={cx("w-10 text-right font-semibold tabular-nums", (i % 2 === 0 ? itemMeans[i] >= 3.5 : itemMeans[i] <= 2.5) ? "text-good" : "text-ink")}>{itemMeans[i].toFixed(1)}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-ink-3">{t("Ítems impares: más alto es mejor. Ítems pares: más bajo es mejor.")}</p>
            </div>
          </details>
        </div>
      );
    }
    case "yes_no": {
      const yes = answers.filter((a) => a.value === "yes").length, no = answers.length - yes;
      return (
        <div className="space-y-3">
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {yes > 0 && <div className="bg-accent" style={{ flex: yes }} title={`${block.yesLabel}: ${yes}`} />}
            {no > 0 && <div className="bg-ink-3/40" style={{ flex: no }} title={`${block.noLabel}: ${no}`} />}
          </div>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{block.yesLabel} <b className="tabular-nums">{pct(yes, answers.length)}%</b> <span className="text-ink-3">· {yes}</span></span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-3/40" />{block.noLabel} <b className="tabular-nums">{pct(no, answers.length)}%</b> <span className="text-ink-3">· {no}</span></span>
          </div>
        </div>
      );
    }
    case "ranking": {
      const rows = rankingSummary(block.items, answers.map((a) => a.value as string[]));
      const k = block.items.length;
      return (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3" title={t("Posición promedio {a} · {b} lo pusieron primero", { a: r.avg.toFixed(2), b: r.firsts })}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-semibold text-accent-ink">{i + 1}</span>
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-sm"><span>{r.label}</span><span className="tabular-nums text-ink-2">{t("promedio")} {r.avg.toFixed(1)} <span className="text-ink-3">· {r.firsts}{t("× primero")}</span></span></div>
                <div className="h-2 rounded-full bg-ink/[0.05]"><div className="h-2 rounded-full bg-accent/70" style={{ width: `${k > 1 ? ((k - r.avg) / (k - 1)) * 100 : 100}%`, minWidth: 4 }} /></div>
              </div>
            </div>
          ))}
          <p className="text-xs text-ink-3">{t("Ordenado por posición promedio (1 = más importante).")}</p>
        </div>
      );
    }
    case "matrix": return <MatrixResult block={block} answers={answers} />;
    case "card_sort": return <CardSortResult block={block} answers={answers} />;
    case "tree_test": return <TreeResult block={block} answers={answers} />;
    case "preference": return <PreferenceResult block={block} answers={answers} />;
    case "first_click": return <FirstClickResult block={block} answers={answers} />;
    case "kano": return <KanoResults block={block} answers={answers} />;
    case "timed_task": return <TimedTaskResult block={block} answers={answers} />;
    case "prototype_task": return <PrototypeResult block={block} answers={answers} proto={settings?.prototypes?.find((p) => p.id === block.prototypeId)} />;
    case "five_second":
      return (
        <div className="flex items-center gap-4">
          {block.image?.url && <img src={block.image.url} alt="" className="h-20 w-32 rounded-lg border border-line object-cover" />}
          <p className="text-sm text-ink-2"><b className="text-ink">{answers.length}</b> {t("personas vieron la imagen durante")} {block.seconds} {t("segundos. Revisa las preguntas siguientes para ver qué recordaron.")}</p>
        </div>
      );
    case "open_question":
      return <TextList items={answers.map((a) => String(a.value ?? "")).filter(Boolean)} />;
    default:
      return null;
  }
}

function TextList({ title, items }: { title?: string; items: string[] }) {
  const print = usePrint();
  const [all, setAll] = useState(false);
  const shown = print ? items.slice(0, 8) : all ? items : items.slice(0, 6);
  return (
    <div>
      {title && <p className="mb-2 text-[13px] font-medium text-ink-2">{title}</p>}
      <ul className="space-y-2">
        {shown.map((t, i) => (
          <li key={i} className="rounded-lg border-l-2 border-accent/40 bg-paper px-3 py-2 text-sm leading-relaxed text-ink break-inside-avoid">“{t}”</li>
        ))}
      </ul>
      {print && items.length > 8 && <p className="mt-2 text-xs text-ink-3">{t("… y {a} respuestas más (ver el CSV o el reporte en línea)", { a: items.length - 8 })}</p>}
      {!print && items.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-3 text-sm font-medium text-accent">
          {all ? t("Ver menos") : t("Ver las {a} respuestas", { a: items.length })}
        </button>
      )}
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return <div className="flex flex-wrap gap-4 text-xs text-ink-2">{items.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", c)} />{l}</span>)}</div>;
}

function MatrixResult({ block, answers }: { block: MatrixBlock; answers: Answer[] }) {
  const vals = answers.map((a) => a.value as Record<string, string>);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr><th />{block.columns.map((c) => <th key={c.id} className="p-2 text-center text-xs font-medium text-ink-3">{c.label}</th>)}</tr></thead>
        <tbody>
          {block.rows.map((r) => {
            const n = vals.filter((v) => v?.[r.id]).length;
            return (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2 pr-3">{r.label}</td>
                {block.columns.map((c) => {
                  const k = vals.filter((v) => v?.[r.id] === c.id).length, p = n ? k / n : 0;
                  return (
                    <td key={c.id} className="p-1 text-center" title={`${r.label} · ${c.label}: ${k} (${Math.round(p * 100)}%)`}>
                      <div className="rounded-md py-2 text-xs font-medium tabular-nums" style={{ background: `color-mix(in srgb, var(--color-accent) ${Math.round(p * 85)}%, transparent)`, color: p > 0.45 ? "var(--color-on-accent)" : undefined }}>
                        {Math.round(p * 100)}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Grupos naturales: recorre el orden del clustering y corta donde la similitud con la tarjeta anterior cae. */
function naturalGroups(order: number[], sim: number[][], cut = 0.4) {
  const groups: number[][] = [];
  order.forEach((i, k) => {
    if (k === 0 || sim[order[k - 1]][i] < cut) groups.push([i]);
    else groups[groups.length - 1].push(i);
  });
  return groups.map((g) => {
    const pairs: number[] = [];
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) pairs.push(sim[g[a]][g[b]]);
    return { members: g, cohesion: pairs.length ? pairs.reduce((x, y) => x + y, 0) / pairs.length : 0 };
  });
}

const agreeColor = (a: number) => (a >= 0.7 ? "bg-good" : a >= 0.4 ? "bg-accent/70" : "bg-warn");
// Misma normalización que cardSortSummary, para que los conteos coincidan con las categorías
const normName = (x: string) => norm(x || t("(sin nombre)"));

function CardSortResult({ block, answers }: { block: CardSortBlock; answers: Answer[] }) {
  const print = usePrint();
  const [current, setView] = useState<"cards" | "matrix" | "categories">("cards");
  const show = (v: typeof current) => print || current === v;
  const view = current;
  const printHead = (label: string) => (print ? <h4 className="mb-3 text-[15px] font-semibold">{label}</h4> : null);
  const values = answers.map((a) => a.value as CardSortValue);
  const r = cardSortSummary(block.cards, values);
  const label = (i: number) => block.cards[i].label;
  const byId = new Map(block.cards.map((c, i) => [c.id, i]));
  const avgAgreement = r.perCard.length ? r.perCard.reduce((x, c) => x + c.agreement, 0) / r.perCard.length : 0;
  const lowCards = r.perCard.filter((c) => c.agreement < 0.4);
  const clusters = naturalGroups(r.order, r.sim);
  const groups = clusters.filter((g) => g.members.length > 1);
  const loners = clusters.filter((g) => g.members.length === 1).map((g) => g.members[0]);
  // Pares de tarjetas que más se agruparon juntas
  const pairs: { a: number; b: number; v: number }[] = [];
  for (let i = 0; i < block.cards.length; i++) for (let j = i + 1; j < block.cards.length; j++) pairs.push({ a: i, b: j, v: r.sim[i][j] });
  const topPairs = pairs.sort((x, y) => y.v - x.v).slice(0, 6);
  // Qué tarjetas cayeron en cada categoría
  const catCards = new Map<string, Map<string, number>>();
  for (const v of values) for (const g of v.groups) {
    const k = normName(g.name || "");
    const m = catCards.get(k) ?? new Map<string, number>();
    for (const id of g.cardIds) m.set(id, (m.get(id) ?? 0) + 1);
    catCards.set(k, m);
  }
  const topCategory = (members: number[]) => {
    const votes = new Map<string, number>();
    for (const i of members) { const c = r.perCard.find((p) => p.id === block.cards[i].id)?.top; if (c) votes.set(c.name, (votes.get(c.name) ?? 0) + 1); }
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Participantes")} value={r.n} />
        <Stat label={t("Grupos promedio")} value={r.avgGroups.toFixed(1)} />
        <Stat label={block.mode === "closed" ? t("Categorías usadas") : t("Categorías distintas")} value={r.categories.length} />
        <Stat label={t("Acuerdo promedio")} value={`${Math.round(avgAgreement * 100)}%`} tone={toneFor(avgAgreement, 0.7, 0.4, { n: r.n })}
          sub={lowCards.length ? t("{a} tarjetas con acuerdo bajo", { a: lowCards.length }) : t("Ninguna tarjeta con acuerdo bajo")} />
      </div>
      <div className="flex gap-1 rounded-lg bg-paper p-1 print:hidden">
        {([["cards", t("Por tarjeta")], ["matrix", t("Matriz de similitud")], ["categories", t("Categorías")]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} className={cx("flex-1 rounded-md px-3 py-2 text-sm font-medium transition", view === id ? "bg-surface shadow-sm" : "text-ink-3 hover:text-ink")}>{l}</button>
        ))}
      </div>

      {show("cards") && (
        <div className="space-y-3">
          {printHead(t("Por tarjeta"))}
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.6fr)] gap-x-6 border-b border-line pb-2 text-xs font-semibold text-ink-3 lg:grid">
            <span>{t("Tarjeta")}</span><span>{t("Categoría más elegida")}</span><span>{t("Acuerdo y otras categorías")}</span>
          </div>
          {r.perCard.map((c) => (
            <div key={c.id} className="grid break-inside-avoid items-center gap-x-6 gap-y-1.5 border-b border-line pb-3 last:border-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.6fr)]">
              <span className="text-[15px] font-semibold">{c.label}</span>
              <span className="text-[15px] text-ink-2">→ {c.top?.name ?? "—"}</span>
              <div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 rounded-full bg-ink/[0.06]"><div className={cx("h-2.5 rounded-full", agreeColor(c.agreement))} style={{ width: `${c.agreement * 100}%`, minWidth: 4 }} /></div>
                  <span className="w-11 text-right text-sm font-semibold tabular-nums">{Math.round(c.agreement * 100)}%</span>
                </div>
                {c.all.length > 1 && <p className="mt-1 truncate text-xs text-ink-3" title={c.all.map((a) => `${a.name}: ${a.count}`).join("\n")}>{c.all.slice(1, 4).map((a) => `${a.name} ${Math.round((a.count / Math.max(1, r.n)) * 100)}%`).join(" · ")}</p>}
              </div>
            </div>
          ))}
          <Legend items={[["bg-good", t("Acuerdo alto ≥70%")], ["bg-accent/70", t("Medio 40–69%")], ["bg-warn", t("Bajo <40% · revisar")]]} />
        </div>
      )}

      {show("matrix") && (
        <div className="grid gap-8 xl:grid-cols-[auto_minmax(0,1fr)]">
          {print && <div className="xl:col-span-2 -mb-5">{printHead(t("Matriz de similitud"))}</div>}
          <div className="overflow-x-auto">
            <table className="text-xs">
              <tbody>
                {r.order.map((i) => (
                  <tr key={i}>
                    <td className="max-w-48 truncate py-0.5 pr-3 text-right text-[13px] text-ink-2">{label(i)}</td>
                    {r.order.map((j) => {
                      const v = i === j ? 1 : r.sim[i][j];
                      return <td key={j} className="p-[1.5px]" title={i === j ? label(i) : `${label(i)} + ${label(j)}: ${Math.round(v * 100)}%`}>
                        <div className="flex h-9 w-9 items-center justify-center rounded tabular-nums" style={{ background: i === j ? "var(--color-line)" : `color-mix(in srgb, var(--color-accent) ${Math.round(v * 90)}%, var(--color-paper))`, color: v > 0.5 && i !== j ? "var(--color-on-accent)" : "var(--color-ink-3)" }}>
                          {i !== j && v > 0 ? Math.round(v * 100) : ""}
                        </div>
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 max-w-xl text-xs text-ink-3">{t("% de participantes que agruparon ambas tarjetas juntas. Los bloques oscuros revelan grupos naturales.")}</p>
          </div>
          <div className="space-y-6">
            <div>
              <h4 className="text-[15px] font-semibold">{t("Grupos naturales")}</h4>
              <p className="mt-0.5 text-xs text-ink-3">{t("Tarjetas que la mayoría puso juntas, con el nombre más usado para ellas.")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {groups.map((g, k) => (
                  <div key={k} className="rounded-xl border border-line bg-paper p-3.5 break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{topCategory(g.members)}</p>
                      <span className="shrink-0 text-xs text-ink-3 tabular-nums">{t("cohesión")} {Math.round(g.cohesion * 100)}%</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{g.members.map((i) => <span key={i} className="rounded-md border border-line bg-surface px-2 py-0.5 text-[13px]">{label(i)}</span>)}</div>
                  </div>
                ))}
              </div>
              {loners.length > 0 && <p className="mt-3 text-sm text-ink-2"><span className="font-semibold text-warn">{t("Sin grupo claro:")}</span> {loners.map(label).join(", ")}</p>}
            </div>
            <div>
              <h4 className="text-[15px] font-semibold">{t("Pares más fuertes")}</h4>
              <ul className="mt-2 divide-y divide-line">
                {topPairs.map((p) => (
                  <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{label(p.a)} <span className="text-ink-3">+</span> {label(p.b)}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{Math.round(p.v * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {show("categories") && printHead(t("Categorías"))}
      {show("categories") && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {r.categories.map((c) => {
            const placed = [...(catCards.get(normName(c.name)) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
            const share = c.people / Math.max(1, r.n);
            return (
              <div key={c.name} className="rounded-xl border border-line bg-paper p-4 break-inside-avoid">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-semibold">{c.name}</p>
                  <span className="shrink-0 text-sm tabular-nums"><b>{Math.round(share * 100)}%</b> <span className="text-ink-3">· {c.people}</span></span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-ink/[0.06]"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${share * 100}%` }} /></div>
                {placed.length > 0 && (
                  <>
                    <p className="mt-3 text-xs text-ink-3">{t("Tarjetas que más pusieron aquí")}</p>
                    <ul className="mt-1.5 space-y-1">
                      {placed.map(([id, n]) => <li key={id} className="flex justify-between gap-2 text-[13px]"><span className="truncate">{label(byId.get(id) ?? 0)}</span><span className="shrink-0 text-ink-3 tabular-nums">{n}</span></li>)}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TreeResult({ block, answers }: { block: TreeTestBlock; answers: Answer[] }) {
  const vals = answers.map((a) => a.value as TreeTestValue);
  const n = vals.length;
  const ok = vals.filter((v) => block.correct.includes(v.selected));
  const direct = ok.filter((v) => v.backtracks === 0).length;
  const dest = new Map<string, number>();
  vals.forEach((v) => dest.set(v.selected, (dest.get(v.selected) ?? 0) + 1));
  const rows = [...dest.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const hasTree = parseTree(block.treeText).length > 0;
  return (
    <div className="space-y-5">
      {block.correct.length === 0 ? <p className="text-sm text-warn">{t("No se definió respuesta correcta: se muestran solo los destinos elegidos.")}</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t("Tasa de éxito")} value={`${pct(ok.length, n)}%`} sub={t("{a} de {b}", { a: ok.length, b: n })} tone={toneFor(pct(ok.length, n), 70, 50, { n })} />
            <Stat label={t("Éxito directo")} value={`${pct(direct, n)}%`} sub={t("sin regresar en el menú")} tone={toneFor(pct(direct, n), 60, 40, { n })} />
            <Stat label={t("Fallo")} value={`${pct(n - ok.length, n)}%`} sub={t("eligió un destino incorrecto")} tone={toneFor(pct(n - ok.length, n), 30, 50, { n, lowerIsBetter: true })} />
          </div>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {direct > 0 && <div className="bg-good" style={{ flex: direct }} />}
            {ok.length - direct > 0 && <div className="bg-good/45" style={{ flex: ok.length - direct }} />}
            {n - ok.length > 0 && <div className="bg-bad/70" style={{ flex: n - ok.length }} />}
          </div>
          <Legend items={[["bg-good", t("Éxito directo {a}%", { a: pct(direct, n) })], ["bg-good/45", t("Éxito indirecto {a}%", { a: pct(ok.length - direct, n) })], ["bg-bad/70", t("Fallo {a}%", { a: pct(n - ok.length, n) })]]} />
        </>
      )}
      {hasTree && <div className="space-y-2.5 border-t border-line pt-4">
        <p className="text-[13px] font-medium text-ink-2">{t("Dónde lo buscaron")}</p>
        {rows.slice(0, 8).map(([id, c]) => <Bar key={id} label={`${block.correct.includes(id) ? "✓ " : ""}${id.replaceAll("/", " › ")}`} count={c} total={n} max={max} highlight={block.correct.includes(id)} />)}
      </div>}
    </div>
  );
}

function PreferenceResult({ block, answers }: { block: PreferenceBlock; answers: Answer[] }) {
  const vals = answers.map((a) => a.value as PreferenceValue);
  const rows = block.options.map((o, i) => ({ ...o, label: o.label || t("Diseño {a}", { a: i + 1 }), count: vals.filter((v) => v.choice === o.id).length })).sort((a, b) => b.count - a.count);
  const print = usePrint();
  const [tab, setTab] = useState(rows[0]?.id);
  const whys = vals.filter((v) => v.choice === tab && v.why?.trim()).map((v) => v.why!);
  return (
    <div className="space-y-5">
      <div className={cx("grid gap-4", rows.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {rows.map((o, i) => (
          <button key={o.id} onClick={() => setTab(o.id)} className={cx("overflow-hidden rounded-xl border-2 text-left transition", tab === o.id ? "border-accent" : "border-line")}>
            {o.image ? <img src={o.image} alt="" className="aspect-[4/3] w-full bg-paper object-contain" /> : <div className="aspect-[4/3] bg-paper" />}
            <div className="p-3">
              <div className="flex items-baseline justify-between"><span className="text-sm font-medium">{o.label}{i === 0 && o.count > 0 && " 🏆"}</span><span className="text-xl font-semibold tabular-nums">{pct(o.count, vals.length)}%</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-ink/[0.05]"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct(o.count, vals.length)}%` }} /></div>
              <p className="mt-1 text-xs text-ink-3">{o.count} {t("votos")}</p>
            </div>
          </button>
        ))}
      </div>
      {block.askWhy && !print && <TextList title={t("Por qué eligieron \"{a}\" ({b})", { a: rows.find((r) => r.id === tab)?.label, b: whys.length })} items={whys} />}
      {block.askWhy && print && rows.map((o) => {
        const w = vals.filter((v) => v.choice === o.id && v.why?.trim()).map((v) => v.why!);
        return w.length ? <TextList key={o.id} title={t("Por qué eligieron \"{a}\" ({b})", { a: o.label, b: w.length })} items={w} /> : null;
      })}
    </div>
  );
}

function FirstClickResult({ block, answers }: { block: FirstClickBlock; answers: Answer[] }) {
  const vals = answers.map((a) => a.value as FirstClickValue);
  const ok = block.area ? vals.filter((v) => isSuccess(block, v)).length : null;
  const a = block.area;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
        {ok !== null && <Stat label={t("hizo clic en el área correcta")} value={`${pct(ok, vals.length)}%`} sub={t("{a} de {b}", { a: ok, b: vals.length })} tone={toneFor(pct(ok, vals.length), 70, 50, { n: vals.length })} />}
        <Stat label={t("tiempo mediano al primer clic")} value={formatDuration(median(vals.map((v) => v.ms)))} />
      </div>
      {block.image?.url && (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <img src={block.image.url} alt="" className="w-full" />
          <div className="absolute inset-0 bg-black/25" />
          {a && <div className="absolute rounded border-2 border-dashed border-white" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` }} />}
          {vals.map((v, i) => (
            <span key={i} className={cx("absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow", isSuccess(block, v) === false ? "bg-bad/80" : "bg-accent/85")}
              style={{ left: `${v.x * 100}%`, top: `${v.y * 100}%` }} title={formatDuration(v.ms)} />
          ))}
        </div>
      )}
      {a && <Legend items={[["bg-accent", t("Clic correcto")], ["bg-bad/80", t("Clic fuera del área")]]} />}
    </div>
  );
}
