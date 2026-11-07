import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { fmtNum, fmtPct, plural, relTime, t } from "../../lib/i18n";
import {
  COMPLETION_THRESHOLD, HOME_VIEWS, completion, isLowCompletion, sortLive, type Day, type HomeView, type LiveSort,
} from "../../lib/home";
import { familyColor, familyOf } from "../../lib/families";
import { templateByKey } from "../../templates/catalog";
import { cx } from "../ui";
import { Chip, CompletionBar, LowChip, Ring, Section, SectionState, TrendBars, completionSr } from "./bits";
import type { Load, LiveStudy } from "./types";

const methodName = (m: string) => templateByKey(m)?.name ?? m;
const VIEW_NAME = (): Record<HomeView, string> => ({ snapshot: t("Snapshot"), funnel: t("Funnel"), inline: t("Inline") });
const VIEW_DESC = (): Record<HomeView, string> => ({
  snapshot: t("Panel lateral con el anillo de completado y los números clave."),
  funnel: t("Panel lateral con el embudo de quién terminó y una recomendación."),
  inline: t("Sin panel: la fila elegida se abre debajo, a todo el ancho."),
});

/** Miniatura esquemática de cada vista para el selector. */
function ViewThumb({ view }: { view: HomeView }) {
  const rows = [0, 1, 2].map((i) => <rect key={i} x="4" y={6 + i * 9} width={view === "inline" ? 52 : 30} height="6" rx="1.5" className="fill-ink/15" />);
  return (
    <svg viewBox="0 0 60 36" className="h-9 w-[3.75rem] shrink-0 rounded-md border border-line bg-paper" aria-hidden>
      {rows}
      {view === "snapshot" && <><rect x="38" y="5" width="18" height="26" rx="2" className="fill-accent/15" /><circle cx="47" cy="14" r="5" fill="none" strokeWidth="2" className="stroke-accent" /></>}
      {view === "funnel" && <><rect x="38" y="5" width="18" height="26" rx="2" className="fill-accent/15" /><rect x="40" y="12" width="14" height="4" rx="1" className="fill-accent" /><rect x="40" y="19" width="9" height="4" rx="1" className="fill-accent/70" /></>}
      {view === "inline" && <rect x="4" y="15" width="52" height="15" rx="2" className="fill-accent/15" />}
    </svg>
  );
}

/** Botón "Vista: …" con popover nativo (Esc y clic afuera lo cierran; el foco vuelve al botón). */
function ViewPicker({ view, onChange }: { view: HomeView; onChange: (v: HomeView) => void }) {
  const uid = useId().replace(/:/g, "");
  const popId = `view-pop-${uid}`;
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = pop.current;
    if (!p) return;
    // Posiciona el popover bajo el botón, alineado a su borde derecho y dentro de la ventana
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open" || !btn.current) return;
      const r = btn.current.getBoundingClientRect();
      const w = Math.min(320, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      p.style.width = `${w}px`;
      p.style.top = `${r.bottom + 6}px`;
      p.style.left = `${left}px`;
      p.style.transformOrigin = `${r.right - left - r.width / 2}px top`;
    };
    p.addEventListener("beforetoggle", place);
    return () => p.removeEventListener("beforetoggle", place);
  }, []);

  const choose = (v: HomeView) => {
    onChange(v);
    pop.current?.hidePopover();
    btn.current?.focus();
  };

  return (
    <>
      <button ref={btn} type="button" popoverTarget={popId} aria-haspopup="dialog"
        className="press focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:border-line-2">
        {t("Vista: {a}", { a: VIEW_NAME()[view] })} <ChevronDown size={14} aria-hidden />
      </button>
      <div ref={pop} id={popId} popover="auto" role="dialog" aria-label={t("Vista del detalle")}
        className="view-pop rounded-xl border border-line bg-surface p-2 text-ink shadow-(--shadow-lift)">
        <fieldset>
          <legend className="px-2 pt-1 pb-2 text-xs font-semibold tracking-[0.06em] text-ink-2 uppercase">{t("Vista del detalle")}</legend>
          {HOME_VIEWS.map((v) => (
            <label key={v} className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", v === view ? "bg-accent-soft" : "hover:bg-ink/5")}>
              <input type="radio" name={`home-view-${uid}`} value={v} checked={v === view} onChange={() => choose(v)} className="sr-only" />
              <ViewThumb view={v} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{VIEW_NAME()[v]}</span>
                <span className="block text-xs text-ink-2">{VIEW_DESC()[v]}</span>
              </span>
              {v === view && <Check size={16} className="shrink-0 text-accent" aria-hidden />}
            </label>
          ))}
        </fieldset>
      </div>
    </>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-ink/5 p-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={cx("focus-ring min-h-10 rounded-md px-3 text-sm font-medium", v === value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>{l}</button>
      ))}
    </div>
  );
}

// ── Detalle ─────────────────────────────────────────────────────────
function studyDays(trend: Day[], studyTrend: { study_id: string; day: string; n: number }[], id: string): Day[] {
  return trend.map((d) => ({ day: d.day, n: studyTrend.find((x) => x.study_id === id && x.day === d.day)?.n ?? 0 }));
}

function DailyChart({ days }: { days: Day[] }) {
  const total = days.reduce((n, d) => n + d.n, 0);
  if (!total) return <p className="rounded-lg bg-paper px-3 py-3 text-sm text-ink-2">{t("Todavía no se registran respuestas diarias para este estudio.")}</p>;
  const this7 = days.slice(-7).reduce((n, d) => n + d.n, 0);
  return <TrendBars days={days} height={56} summary={t("{a} respuestas en 14 días; {b} esta semana.", { a: fmtNum(total), b: fmtNum(this7) })} />;
}

const ResultsLink = ({ s }: { s: LiveStudy }) => (
  <Link to={`/studies/${s.id}/results`} className="press focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent/90">
    {t("Ver resultados")} <ArrowRight size={16} aria-hidden />
  </Link>
);

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-ink-2">{k}</dt>
          <dd className={cx("mt-0.5 font-display font-bold tabular-nums [overflow-wrap:anywhere]", typeof v === "string" && v.length > 6 ? "text-base leading-snug" : "text-xl")}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const lastLabel = (s: LiveStudy) => (s.last_response_at ? relTime(s.last_response_at) : "—");

function DetailHead({ s }: { s: LiveStudy }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-ink-2">{s.project_name} · {methodName(s.method)}</p>
      <h3 className="mt-0.5 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{s.title}</h3>
    </div>
  );
}

function Snapshot({ s, days }: { s: LiveStudy; days: Day[] }) {
  const rate = completion(s.responses, s.started);
  return (
    <div className="space-y-5">
      <DetailHead s={s} />
      <div className="flex items-center gap-5">
        <Ring rate={rate} />
        <div className="min-w-0 flex-1">
          <Facts items={[[t("Iniciaron"), fmtNum(s.started)], [t("Terminaron"), fmtNum(s.responses)], [t("No terminaron"), fmtNum(s.started - s.responses)], [t("Última respuesta"), lastLabel(s)]]} />
        </div>
      </div>
      <div><h4 className="mb-2 text-sm font-semibold">{t("Respuestas · últimos 14 días")}</h4><DailyChart days={days} /></div>
      <ResultsLink s={s} />
    </div>
  );
}

function Funnel({ s, days }: { s: LiveStudy; days: Day[] }) {
  const rate = completion(s.responses, s.started);
  const low = isLowCompletion(rate);
  const missing = s.started - s.responses;
  const advice = rate === null
    ? t("Nadie ha entrado todavía. Comparte el link del estudio para empezar a recibir respuestas.")
    : low
      ? t("El completado está por debajo de {a}. Revisa en qué bloque abandonan y si el estudio es demasiado largo.", { a: fmtPct(COMPLETION_THRESHOLD) })
      : t("El completado está por encima de {a}. Puedes seguir recolectando o pasar al análisis.", { a: fmtPct(COMPLETION_THRESHOLD) });
  return (
    <div className="space-y-5">
      <DetailHead s={s} />
      <p className="text-sm text-ink-2">
        <span className="font-display text-2xl font-bold text-ink tabular-nums">{fmtNum(missing)}</span>{" "}
        {plural(s.started, { one: "de {n} persona no terminó", other: "de {n} personas no terminaron" })}
      </p>
      <div className="space-y-2" role="img" aria-label={t("Embudo: iniciaron {a}, terminaron {b}. {c}", { a: fmtNum(s.started), b: fmtNum(s.responses), c: completionSr(rate) })}>
        {[[t("Iniciaron"), s.started, 1], [t("Terminaron"), s.responses, rate ?? 0]].map(([label, n, w], i) => (
          <div key={i} aria-hidden>
            <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{fmtNum(n as number)}</span></div>
            <div className="h-6 rounded-md bg-ink/10">
              <div className={cx("h-full rounded-md", i === 0 ? "bg-accent/40" : low ? "bg-caution" : "bg-accent")} style={{ width: `${Math.max((w as number) * 100, n ? 2 : 0)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className={cx("flex gap-2 rounded-lg p-3 text-sm", low ? "bg-caution-soft text-caution-ink" : "bg-accent-soft text-accent-ink")}>{advice}</p>
      <div><h4 className="mb-2 text-sm font-semibold">{t("Respuestas · últimos 14 días")}</h4><DailyChart days={days} /></div>
      <ResultsLink s={s} />
    </div>
  );
}

function InlineDetail({ s, days }: { s: LiveStudy; days: Day[] }) {
  const rate = completion(s.responses, s.started);
  return (
    <div className="anim-expand grid gap-5 border-t border-line bg-paper px-4 py-4 @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:px-5">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-4">
          {([[t("Iniciaron"), fmtNum(s.started)], [t("Terminaron"), fmtNum(s.responses)], [t("No terminaron"), fmtNum(s.started - s.responses)], [t("Completado"), rate === null ? "—" : fmtPct(rate)]] as const).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-xs text-ink-2">{k}</dt><dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        <ResultsLink s={s} />
      </div>
      <div><h4 className="mb-2 text-sm font-semibold">{t("Respuestas · últimos 14 días")}</h4><DailyChart days={days} /></div>
    </div>
  );
}

// ── Tabla ───────────────────────────────────────────────────────────
/**
 * Celdas de una fila. Angosto (<560px de contenedor): 2 líneas, [estudio | última respuesta] y [completado | tipo].
 * Ancho: 4 columnas en orden Estudio, Tipo, Completado, Última respuesta.
 */
const ROW_GRID = cx("grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left sm:px-5",
  "@min-[560px]:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)]");

function RowCells({ s }: { s: LiveStudy }) {
  const rate = completion(s.responses, s.started);
  return (
    <>
      <span className="order-1 min-w-0">
        <span className="block truncate text-sm font-semibold" title={s.title}>{s.title}</span>
        <span className="block truncate text-xs text-ink-2">{s.project_name}</span>
      </span>
      <span className="order-2 justify-self-end text-xs whitespace-nowrap text-ink-2 tabular-nums @min-[560px]:order-4 @min-[560px]:justify-self-start @min-[560px]:text-sm">
        <span className="sr-only">{t("Última respuesta")}: </span>{lastLabel(s)}
      </span>
      <span className="order-3 min-w-0">
        <span className="flex items-center gap-2">
          <span className="w-full max-w-40"><CompletionBar rate={rate} /></span>
          {isLowCompletion(rate) && <LowChip />}
        </span>
        <span className="mt-1 block text-xs text-ink-2 tabular-nums" aria-hidden>{fmtNum(s.responses)}/{fmtNum(s.started)}</span>
        <span className="sr-only">{completionSr(rate)}. {t("{a} de {b} terminaron", { a: s.responses, b: s.started })}.</span>
      </span>
      <span className="order-4 min-w-0 max-w-[9rem] justify-self-end @min-[560px]:order-2 @min-[560px]:max-w-full @min-[560px]:justify-self-start">
        <Chip color={familyColor(familyOf(s.method))} className="max-w-full">{methodName(s.method)}</Chip>
      </span>
    </>
  );
}

function Row({ s, selected, expanded, inline, onClick }: { s: LiveStudy; selected: boolean; expanded: boolean; inline: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={selected ? "true" : undefined} aria-expanded={inline ? expanded : undefined}
      className={cx("focus-ring", ROW_GRID, selected ? "bg-accent-soft/70 shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-ink/[0.03]")}>
      <RowCells s={s} />
    </button>
  );
}

export function LiveStudies({ live, trend, studyTrend, load, view, onViewChange, limit = 6 }: {
  live: LiveStudy[]; trend: Day[]; studyTrend: { study_id: string; day: string; n: number }[]; load: Load;
  view: HomeView; onViewChange: (v: HomeView) => void; limit?: number;
}) {
  const [sort, setSort] = useState<LiveSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [animateView, setAnimateView] = useState(false);
  const sorted = sortLive(live, sort);
  const shown = sorted.slice(0, limit);
  const selected = shown.find((s) => s.id === selectedId) ?? shown[0];
  const inline = view === "inline";

  const changeView = (v: HomeView) => { if (v !== view) { setAnimateView(true); onViewChange(v); } };
  const click = (id: string) => {
    if (inline) setOpenId((cur) => (cur === id ? null : id));
    setSelectedId(id);
  };

  const table = (
    <div className="@container">
      <div aria-hidden className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-x-4 border-b border-line px-5 py-2 text-xs font-semibold text-ink-2 @min-[560px]:grid">
        <span>{t("Estudio")}</span><span>{t("Tipo")}</span><span>{t("Completado")}</span><span>{t("Última respuesta")}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((s) => (
          <li key={s.id}>
            <Row s={s} inline={inline} selected={inline ? openId === s.id : selected?.id === s.id} expanded={openId === s.id} onClick={() => click(s.id)} />
            {inline && openId === s.id && <InlineDetail s={s} days={studyDays(trend, studyTrend, s.id)} />}
          </li>
        ))}
      </ul>
      {live.length > 0 && (
        <div className="border-t border-line px-4 py-2 sm:px-5">
          <Link to="/studies?status=live" className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-accent-ink hover:underline">
            {plural(live.length, { one: "Ver el estudio activo", other: "Ver los {n} estudios activos" })} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );

  const days = selected ? studyDays(trend, studyTrend, selected.id) : [];
  return (
    <div className={cx("grid items-start gap-4", !inline && "lg:grid-cols-[minmax(0,1fr)_minmax(0,22.5rem)]")}>
      <Section id="live-studies" title={t("Estudios activos")}
        actions={!load.loading && !load.error && live.length > 0 && (
          <>
            <Segmented label={t("Ordenar estudios")} value={sort} onChange={setSort} options={[["recent", t("Más reciente")], ["lowest", t("Menor completado")]]} />
            <ViewPicker view={view} onChange={changeView} />
          </>
        )}>
        <SectionState load={load} skeleton={4} empty={live.length === 0 ? {
          title: t("Todavía no hay estudios activos"),
          text: t("Publica un estudio para ver aquí quién lo inicia y quién lo termina."),
          action: <Link to="/projects" className="press focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent">{t("Crear estudio")}</Link>,
        } : null}>
          <div key={inline ? "inline" : "table"} className={cx(animateView && inline && "anim-view")} onAnimationEnd={() => setAnimateView(false)}>{table}</div>
        </SectionState>
      </Section>

      {!inline && !load.loading && !load.error && selected && (
        <aside aria-label={t("Detalle del estudio")} className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-4">
          <div key={view} className={cx(animateView && "anim-view")} onAnimationEnd={() => setAnimateView(false)} aria-live="polite">
            {view === "funnel" ? <Funnel s={selected} days={days} /> : <Snapshot s={selected} days={days} />}
          </div>
        </aside>
      )}
    </div>
  );
}

/** Tabla simple para la lista completa de estudios activos (sin detalle). */
export function LiveStudiesList({ live, load }: { live: LiveStudy[]; load: Load }) {
  const [sort, setSort] = useState<LiveSort>("recent");
  return (
    <Section id="all-live" title={plural(live.length, { one: "{n} estudio activo", other: "{n} estudios activos" })}
      actions={live.length > 1 && <Segmented label={t("Ordenar estudios")} value={sort} onChange={setSort} options={[["recent", t("Más reciente")], ["lowest", t("Menor completado")]]} />}>
      <SectionState load={load} empty={live.length === 0 ? {
        title: t("Todavía no hay estudios activos"),
        action: <Link to="/projects" className="press focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent">{t("Crear estudio")}</Link>,
      } : null}>
        <div className="@container">
          <ul className="divide-y divide-line">
            {sortLive(live, sort).map((s) => (
              <li key={s.id}>
                <Link to={`/studies/${s.id}/results`} className={cx("focus-ring hover:bg-ink/[0.03]", ROW_GRID)}><RowCells s={s} /></Link>
              </li>
            ))}
          </ul>
        </div>
      </SectionState>
    </Section>
  );
}
