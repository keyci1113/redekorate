import type { KanoBlock } from "./types";
import { KANO_ANSWERS, KANO_COLOR, KANO_HELP, KANO_NAMES, kanoSummary, type KanoCat, type KanoValue } from "./kano";
import type { Answer } from "../lib/types";
import { t } from "../lib/i18n";
import { cx } from "../components/ui";

export const kanoAnswered = (b: KanoBlock, v?: KanoValue) => !!v && b.features.every((f) => v[f.id]?.f && v[f.id]?.d && (!b.askImportance || v[f.id]?.imp));

/** Vista del participante: dos preguntas por funcionalidad (+ importancia). */
export function KanoRunner({ block, value, onChange }: { block: KanoBlock; value?: KanoValue; onChange: (v: unknown) => void }) {
  const v = value ?? {};
  const set = (id: string, p: Partial<{ f: number; d: number; imp: number }>) => onChange({ ...v, [id]: { ...v[id], ...p } });
  const Q = ({ text, val, onPick }: { text: string; val?: number; onPick: (n: number) => void }) => (
    <div>
      <p className="mb-2 text-[14px] font-medium">{text}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
        {KANO_ANSWERS.map((a, i) => (
          <button key={a} type="button" onClick={() => onPick(i + 1)}
            className={cx("focus-ring rounded-lg border px-2 py-2 text-[13px] transition", val === i + 1 ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-line-2")}>{t(a)}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      {block.features.map((f, i) => (
        <div key={f.id} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-[12px] text-accent-ink">{i + 1}</span>{f.label}</p>
          <Q text={block.funcQ.replace("{f}", f.label)} val={v[f.id]?.f} onPick={(n) => set(f.id, { f: n })} />
          <Q text={block.dysQ.replace("{f}", f.label)} val={v[f.id]?.d} onPick={(n) => set(f.id, { d: n })} />
          {block.askImportance && (
            <div>
              <p className="mb-2 text-[14px] font-medium">{t("¿Qué tan importante es para ti?")}</p>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                  <button key={n} type="button" onClick={() => set(f.id, { imp: n })} className={cx("focus-ring h-9 min-w-0 flex-1 rounded-md border text-[13px] tabular-nums", v[f.id]?.imp === n ? "border-accent bg-accent text-white" : "border-line hover:border-line-2")}>{n}</button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{t("Nada")}</span><span>{t("Extremadamente")}</span></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Resultados: categoría por funcionalidad, coeficientes y gráfica Better/Worse. */
export function KanoResults({ block, answers }: { block: KanoBlock; answers: Answer[] }) {
  const rows = kanoSummary(block.features.map((f) => f.id), answers.map((a) => a.value as KanoValue));
  const label = (id: string) => block.features.find((f) => f.id === id)?.label ?? "";
  const cats: KanoCat[] = ["A", "O", "M", "I", "R", "Q"];
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-2">
              <th className="py-2 pr-3 font-medium">{t("Funcionalidad")}</th>
              <th className="py-2 pr-3 font-medium">{t("Categoría")}</th>
              {cats.map((c) => <th key={c} className="px-1 py-2 text-center font-medium" title={t(KANO_NAMES[c])}>{c}</th>)}
              <th className="px-2 py-2 text-right font-medium">{t("Satisfacción")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("Insatisfacción")}</th>
              {block.askImportance && <th className="py-2 pl-2 text-right font-medium">{t("Importancia")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2 pr-3 font-medium">{label(r.id)}</td>
                <td className="py-2 pr-3">{r.category && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: KANO_COLOR[r.category] }}>{t(KANO_NAMES[r.category])}</span>}</td>
                {cats.map((c) => <td key={c} className={cx("px-1 py-2 text-center tabular-nums", r.category === c ? "font-bold" : "text-ink-2")}>{r.counts[c]}</td>)}
                <td className="px-2 py-2 text-right tabular-nums">{r.better.toFixed(2)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.worse.toFixed(2)}</td>
                {block.askImportance && <td className="py-2 pl-2 text-right tabular-nums">{r.importance?.toFixed(1) ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gráfica de coeficientes: x = insatisfacción (|worse|), y = satisfacción (better) */}
      <div className="grid gap-5 md:grid-cols-[1fr_220px]">
        <div className="relative aspect-[4/3] rounded-xl border border-line bg-surface">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 text-[11px] font-semibold text-ink-3">
            <span className="border-r border-b border-dashed border-line-2 p-2">{t("Atractivas")}</span>
            <span className="border-b border-dashed border-line-2 p-2 text-right">{t("Unidimensionales")}</span>
            <span className="flex items-end border-r border-dashed border-line-2 p-2">{t("Indiferentes")}</span>
            <span className="flex items-end justify-end p-2">{t("Obligatorias")}</span>
          </div>
          {rows.filter((r) => r.n).map((r) => (
            <div key={r.id} className="absolute flex -translate-x-1/2 translate-y-1/2 flex-col items-center" style={{ left: `${Math.abs(r.worse) * 100}%`, bottom: `${r.better * 100}%` }}>
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white shadow" style={{ background: r.category ? KANO_COLOR[r.category] : "#999" }} />
              <span className="mt-0.5 max-w-28 truncate rounded bg-surface/90 px-1 text-[10px] font-medium">{label(r.id)}</span>
            </div>
          ))}
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-ink-2">{t("Insatisfacción si falta →")}</span>
          <span className="absolute top-1/2 -left-1 origin-left -translate-y-1/2 -rotate-90 text-[11px] whitespace-nowrap text-ink-2">{t("Satisfacción si está →")}</span>
        </div>
        <ul className="space-y-2 text-[12px]">
          {cats.map((c) => (
            <li key={c} className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KANO_COLOR[c] }} /><span><b>{c} · {t(KANO_NAMES[c])}</b> — {t(KANO_HELP[c])}</span></li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-ink-3">{t("Satisfacción = (A+O)/(A+O+M+I) · Insatisfacción = −(O+M)/(A+O+M+I). Prioriza primero las obligatorias, luego las unidimensionales y después las atractivas.")}</p>
    </div>
  );
}
