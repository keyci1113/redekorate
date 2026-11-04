import { useMemo, useState } from "react";
import { ArrowRight, Flag, MousePointerClick, Route, Timer } from "lucide-react";
import type { PrototypeTaskBlock } from "./types";
import type { Prototype, PrototypeTaskValue } from "./prototype";
import { isDirect, screenName } from "./prototype";
import type { Answer } from "../lib/types";
import { mean, median } from "../lib/analytics";
import { formatDuration } from "../lib/hooks";
import { cx } from "../components/ui";

import { t } from "../lib/i18n";
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function PrototypeResult({ block, answers, proto }: { block: PrototypeTaskBlock; answers: Answer[]; proto?: Prototype }) {
  const vals = answers.map((a) => a.value as PrototypeTaskValue).filter((v) => v?.path);
  const [tab, setTab] = useState<"paths" | "screens">("paths");
  const n = vals.length;
  const success = vals.filter((v) => v.outcome === "success");
  const direct = success.filter((v) => isDirect(v, block.expectedPath)).length;
  const gaveUp = n - success.length;
  const allClicks = vals.flatMap((v) => v.clicks);
  const misclicks = allClicks.filter((c) => !c.h).length;

  if (!proto) return <p className="text-sm text-warn">{t("El prototipo de esta tarea fue eliminado del estudio.")}</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={<Flag size={14} />} label={t("Tasa de éxito")} value={`${pct(success.length, n)}%`} sub={t("{a} de {b}", { a: success.length, b: n })} />
        <Kpi icon={<Route size={14} />} label={t("Éxito directo")} value={`${pct(direct, n)}%`} sub={block.expectedPath.length >= 2 ? t("siguió la ruta esperada") : t("sin regresar a pantallas")} />
        <Kpi icon={<Timer size={14} />} label={t("Tiempo mediano")} value={formatDuration(median(success.map((v) => v.ms)))} sub={t("en tareas exitosas")} />
        <Kpi icon={<MousePointerClick size={14} />} label={t("Clics fuera de zona")} value={`${pct(misclicks, allClicks.length)}%`} sub={t("{a} de {b} clics", { a: misclicks, b: allClicks.length })} />
      </div>

      <div>
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
          {direct > 0 && <div className="bg-good" style={{ flex: direct }} title={t("Directo: {a}", { a: direct })} />}
          {success.length - direct > 0 && <div className="bg-good/45" style={{ flex: success.length - direct }} title={t("Indirecto: {a}", { a: success.length - direct })} />}
          {gaveUp > 0 && <div className="bg-bad/70" style={{ flex: gaveUp }} title={t("Abandono: {a}", { a: gaveUp })} />}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good" />{t("Directo")} {pct(direct, n)}%</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good/45" />{t("Indirecto")} {pct(success.length - direct, n)}%</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad/70" />{t("No la completó")} {pct(gaveUp, n)}%</span>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-paper p-1">
        {([["paths", t("Rutas")], ["screens", t("Mapas de calor por pantalla")]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={cx("flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition", tab === id ? "bg-surface shadow-sm" : "text-ink-3 hover:text-ink")}>{l}</button>
        ))}
      </div>
      {tab === "paths" ? <Paths block={block} vals={vals} proto={proto} /> : <Screens vals={vals} proto={proto} />}
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-paper px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-ink-2">{icon}{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-3">{sub}</p>
    </div>
  );
}

function Chain({ ids, proto }: { ids: string[]; proto: Prototype }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[12px]">
      {ids.map((id, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ArrowRight size={11} className="text-ink-3" />}
          <span className="rounded bg-paper px-1.5 py-0.5 ring-1 ring-line">{screenName(proto, id)}</span>
        </span>
      ))}
    </span>
  );
}

function Paths({ block, vals, proto }: { block: PrototypeTaskBlock; vals: PrototypeTaskValue[]; proto: Prototype }) {
  const n = vals.length;
  const exp = block.expectedPath;
  // Embudo: cuántos siguieron la ruta esperada hasta cada paso
  const funnel = exp.map((_, i) => vals.filter((v) => exp.slice(0, i + 1).every((s, k) => v.path[k]?.s === s)).length);
  const groups = useMemo(() => {
    const m = new Map<string, { ids: string[]; count: number; ok: number }>();
    for (const v of vals) {
      const ids = v.path.map((p) => p.s); const k = ids.join(">");
      const g = m.get(k) ?? { ids, count: 0, ok: 0 }; g.count++; if (v.outcome === "success") g.ok++; m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [vals]);

  return (
    <div className="space-y-6">
      {exp.length >= 2 && (
        <div>
          <p className="mb-3 text-[13px] font-medium text-ink-2">{t("Ruta esperada · ¿hasta dónde la siguieron?")}</p>
          <div className="space-y-2">
            {exp.map((id, i) => (
              <div key={i} className="grid grid-cols-[150px_1fr_80px] items-center gap-3 text-sm">
                <span className="truncate">{i + 1}. {screenName(proto, id)}</span>
                <div className="h-6 rounded-md bg-ink/[0.05]"><div className="h-6 rounded-md bg-accent/75" style={{ width: `${pct(funnel[i], n)}%`, minWidth: funnel[i] ? 4 : 0 }} /></div>
                <span className="text-right tabular-nums">{pct(funnel[i], n)}% {i > 0 && funnel[i - 1] > funnel[i] && <span className="text-xs text-bad">−{funnel[i - 1] - funnel[i]}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-3 text-[13px] font-medium text-ink-2">{t("Rutas más comunes")}</p>
        <ul className="space-y-2">
          {groups.slice(0, 6).map((g, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border border-line p-3">
              <span className="w-12 shrink-0 text-right">
                <span className="block text-lg font-semibold tabular-nums">{pct(g.count, n)}%</span>
                <span className="text-[11px] text-ink-3">{g.count} {t("pers.")}</span>
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Chain ids={g.ids} proto={proto} />
                <span className={cx("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", g.ok === g.count ? "bg-good-soft text-good" : g.ok === 0 ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
                  {g.ok === g.count ? t("Completada") : g.ok === 0 ? t("No completada") : t("Mixta")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Screens({ vals, proto }: { vals: PrototypeTaskValue[]; proto: Prototype }) {
  const stats = proto.screens.map((s) => {
    const clicks = vals.flatMap((v) => v.clicks.filter((c) => c.s === s.id));
    const times: number[] = [];
    for (const v of vals) v.path.forEach((p, i) => { if (p.s === s.id) times.push((v.path[i + 1]?.t ?? v.ms) - p.t); });
    return { s, clicks, visits: times.length, time: mean(times), miss: clicks.filter((c) => !c.h).length };
  }).filter((x) => x.visits > 0);
  const [sel, setSel] = useState(stats[0]?.s.id);
  const [mode, setMode] = useState<"heat" | "dots">("heat");
  const cur = stats.find((x) => x.s.id === sel) ?? stats[0];
  if (!cur) return <p className="text-sm text-ink-3">{t("Sin datos de navegación todavía.")}</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <ul className="space-y-1.5 lg:max-h-[640px] lg:overflow-y-auto">
        {stats.map((x) => (
          <li key={x.s.id}>
            <button onClick={() => setSel(x.s.id)} className={cx("flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition", cur.s.id === x.s.id ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-2")}>
              <img src={x.s.image} alt="" className="h-12 w-9 rounded border border-line object-cover object-top" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{x.s.name}</span>
                <span className="block text-[11px] text-ink-2">{x.visits} {t("visitas ·")} {formatDuration(x.time)}</span>
                {x.miss > 0 && <span className="block text-[11px] text-bad">{x.miss} {t("clics fuera de zona")}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm"><b>{cur.s.name}</b> <span className="text-ink-2">· {cur.clicks.length} {t("clics ·")} {pct(cur.miss, cur.clicks.length)}{t("% fuera de zona · tiempo promedio")} {formatDuration(cur.time)}</span></p>
          <div className="flex rounded-lg bg-paper p-0.5 text-xs">
            {([["heat", t("Mapa de calor")], ["dots", t("Clics")]] as const).map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-2.5 py-1 font-medium", mode === m ? "bg-surface shadow-sm" : "text-ink-3")}>{l}</button>
            ))}
          </div>
        </div>
        <div className={cx("relative mx-auto overflow-hidden rounded-xl border border-line", proto.device === "mobile" ? "max-w-[360px]" : "")}>
          <img src={cur.s.image} alt="" className="block w-full" />
          <div className="absolute inset-0 bg-ink/30" />
          {mode === "heat" ? cur.clicks.map((c, i) => (
            <span key={i} className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, background: c.h ? "radial-gradient(circle, rgba(250,204,21,.85) 0%, rgba(249,115,22,.45) 30%, rgba(124,58,237,0) 70%)" : "radial-gradient(circle, rgba(248,113,113,.9) 0%, rgba(220,38,38,.4) 30%, rgba(220,38,38,0) 70%)" }} />
          )) : cur.clicks.map((c, i) => (
            <span key={i} title={c.h ? t("Clic en zona") : t("Clic fuera de zona")} className={cx("absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow", c.h ? "bg-accent" : "bg-bad")}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} />
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", mode === "heat" ? "bg-[#F59E0B]" : "bg-accent")} />{t("Clic en zona clicable")}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad" />{t("Clic fuera de zona (posible confusión)")}</span>
        </div>
      </div>
    </div>
  );
}
