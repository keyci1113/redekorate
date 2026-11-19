// The daily brief: a sun button in the header and a panel on the right. From lg up the panel pushes the page
// (Layout leaves room for it beside the content); below lg it is a sheet over the page with a backdrop.
// Like the ticket drawer, it slides in from the right edge and closes with X or Escape.
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AtSign, BarChart3, Flag, Inbox, Lightbulb, MessageSquare, RefreshCw, Sun, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtNum, locale, plural, t } from "../lib/i18n";
import { briefIsEmpty, firstName, greeting, groupMyDay, localTimeZone, longDate, type Brief, type DueBucket } from "../lib/brief";
import { fmtDay } from "../tickets/parts";
import { ErrorNote, cx } from "./ui";

export const BRIEF_WIDTH = 400;
const LG = "(min-width: 1024px)";
export const isWide = () => typeof window !== "undefined" && window.matchMedia(LG).matches;

/** Whether something is new since the brief was last opened. Checks on load, every 5 minutes and when the tab comes back. */
export function useBriefDot() {
  const [dot, setDot] = useState(false);
  const check = useCallback(() => api.get<{ has_new: boolean }>("/brief/status").then((r) => setDot(r.has_new)).catch(() => {}), []);
  useEffect(() => {
    void check();
    const again = () => { if (document.visibilityState === "visible") void check(); };
    const timer = window.setInterval(again, 5 * 60_000);
    window.addEventListener("focus", again);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", again); };
  }, [check]);
  return [dot, setDot] as const;
}

export const BriefButton = forwardRef<HTMLButtonElement, { open: boolean; dot: boolean; onClick: () => void }>(function BriefButton({ open, dot, onClick }, ref) {
  const label = dot ? t("Resumen del día: hay novedades") : t("Resumen del día|brief");
  return (
    <button ref={ref} type="button" onClick={onClick} aria-expanded={open} aria-controls="daily-brief" aria-label={label} title={t("Resumen del día|brief")}
      className={cx("focus-ring relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink", open && "bg-ink/5 text-ink")}>
      <Sun size={18} aria-hidden />
      {dot && <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />}
    </button>
  );
});

const row = "focus-ring flex min-h-11 items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink/5";
const dueLabel = (bucket: DueBucket, due: string) =>
  bucket === "overdue" ? t("{a} · vencido", { a: fmtDay(due) }) : bucket === "today" ? t("Hoy") : fmtDay(due);
const bucketLabel = (b: DueBucket) => ({ overdue: t("Vencidos"), today: t("Vencen hoy"), week: t("Más adelante esta semana") })[b];
const sinceLabel = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-3 py-4">
      <h3 className="px-2 text-[13px] font-semibold text-ink">{title}{sub && <span className="font-normal text-ink-3"> · {sub}</span>}</h3>
      <div className="mt-1.5 flex flex-col">{children}</div>
    </section>
  );
}
function More({ shown, total }: { shown: number; total: number }) {
  return total > shown ? <p className="px-2 pt-0.5 text-xs text-ink-3">{t("y {n} más", { n: fmtNum(total - shown) })}</p> : null;
}
function NewsRow({ to, icon, text, sub }: { to: string; icon: ReactNode; text: ReactNode; sub?: ReactNode }) {
  return (
    <Link to={to} className={row}>
      <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">{text}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </Link>
  );
}

function Content({ b }: { b: Brief }) {
  const n = b.news, groups = groupMyDay(b.my_day.tickets);
  const anyNews = n.responses.length > 0 || n.insights.total + n.widget.total + n.assigned.total + n.mentions.total > 0;
  if (briefIsEmpty(b)) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span aria-hidden className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><Sun size={20} /></span>
        <p className="font-medium">{t("Nada pendiente hoy")}</p>
        <p className="mt-1 max-w-xs text-sm text-ink-3">{t("Aquí verás tus tickets de la semana, las novedades de tus proyectos, los estudios activos y los hitos próximos.")}</p>
      </div>
    );
  }
  return (
    <>
      {b.my_day.total > 0 && (
        <Section title={t("Para hoy")} sub={plural(b.my_day.total, { one: "{n} ticket", other: "{n} tickets" })}>
          {groups.map((g) => (
            <div key={g.bucket} className="mt-1 first:mt-0">
              <p className={cx("px-2 pt-1 text-xs font-semibold", g.bucket === "overdue" ? "text-bad" : "text-ink-3")}>{bucketLabel(g.bucket)} · {fmtNum(b.my_day.counts[g.bucket])}</p>
              {g.items.map((x) => (
                <Link key={x.id} to={`/projects/${x.project_id}/tickets/${x.number}`} className={row}>
                  <span className="mt-px shrink-0 text-xs text-ink-3 tabular-nums">#{x.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink" title={x.title}>{x.title}</span>
                    <span className="block truncate text-xs text-ink-3">{x.project_name}</span>
                  </span>
                  <span className={cx("mt-px shrink-0 text-xs tabular-nums", x.bucket === "overdue" ? "font-bold text-bad" : "text-ink-2")}>{dueLabel(x.bucket, x.due_date)}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link to="/my-work" className="focus-ring mt-1 inline-flex min-h-11 items-center self-start rounded-lg px-2 text-[13px] font-semibold text-accent-ink hover:underline">{t("Ver todo en Mi trabajo")}</Link>
        </Section>
      )}

      {anyNews && (
        <Section title={t("Novedades")} sub={t("desde {a}|since", { a: sinceLabel(b.since) })}>
          {n.responses.map((r) => (
            <NewsRow key={r.study_id} to={`/studies/${r.study_id}/results`} icon={<MessageSquare size={14} />}
              text={plural(r.count, { one: "{n} respuesta nueva · {a}", other: "{n} respuestas nuevas · {a}" }, { a: r.title })} sub={r.project_name} />
          ))}
          {n.insights.items.map((x) => <NewsRow key={x.id} to={`/projects/${x.project_id}?tab=insights`} icon={<Lightbulb size={14} />} text={t("Insight nuevo: {a}", { a: x.title })} sub={x.project_name} />)}
          <More shown={n.insights.items.length} total={n.insights.total} />
          {n.widget.items.map((x) => <NewsRow key={x.id} to={`/projects/${x.project_id}/tickets/${x.number}`} icon={<Inbox size={14} />} text={t("Del widget: #{n} {a}", { n: x.number, a: x.title })} sub={x.project_name} />)}
          <More shown={n.widget.items.length} total={n.widget.total} />
          {n.assigned.items.map((x) => (
            <NewsRow key={`a${x.project_id}${x.number}`} to={`/projects/${x.project_id}/tickets/${x.number}`} icon={<UserPlus size={14} />}
              text={x.actor_name ? t("{a} te asignó #{n}", { a: x.actor_name, n: x.number }) : t("Te asignaron #{n}", { n: x.number })} sub={`${x.title} · ${x.project_name}`} />
          ))}
          <More shown={n.assigned.items.length} total={n.assigned.total} />
          {n.mentions.items.map((x) => (
            <NewsRow key={`m${x.project_id}${x.number}${x.created_at}`} to={`/projects/${x.project_id}/tickets/${x.number}`} icon={<AtSign size={14} />}
              text={t("{a} te mencionó en #{n}", { a: x.actor_name ?? t("Alguien"), n: x.number })} sub={x.excerpt ?? x.title} />
          ))}
          <More shown={n.mentions.items.length} total={n.mentions.total} />
        </Section>
      )}

      {b.live_studies.length > 0 && (
        <Section title={t("Estudios activos")}>
          {b.live_studies.map((s) => (
            <Link key={s.id} to={`/studies/${s.id}/results`} className={row}>
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-good-soft text-good"><BarChart3 size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink" title={s.title}>{s.title}</span>
                <span className="block truncate text-xs text-ink-3">{s.project_name}</span>
              </span>
              <span className="mt-px shrink-0 text-right text-xs text-ink-2 tabular-nums">
                {plural(s.responses, { one: "{n} respuesta", other: "{n} respuestas" })}
                {s.today > 0 && <span className="block font-semibold text-good">{t("+{n} hoy", { n: fmtNum(s.today) })}</span>}
              </span>
            </Link>
          ))}
        </Section>
      )}

      {b.milestones.length > 0 && (
        <Section title={t("Hitos próximos")}>
          {b.milestones.map((m) => (
            <Link key={m.id} to={`/projects/${m.project_id}?tab=milestones`} className={row}>
              <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink"><Flag size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink" title={m.name}>{m.name}</span>
                <span className="block truncate text-xs text-ink-3">{m.project_name} · {fmtDay(m.due_date)}</span>
                <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-accent" style={{ width: `${m.progress}%` }} /></span>
              </span>
              <span className="mt-px shrink-0 text-xs font-semibold text-ink-2 tabular-nums">{t("{n} % hecho", { n: m.progress })}</span>
            </Link>
          ))}
        </Section>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-5" aria-hidden>
      {[60, 85, 70, 90, 50].map((w, i) => <span key={i} className="h-4 animate-pulse rounded bg-ink/5 motion-reduce:animate-none" style={{ width: `${w}%` }} />)}
    </div>
  );
}

/**
 * The panel. It loads when it opens and then marks the brief as seen (which clears the dot); "Refresh" asks again
 * from the same start, so what was new when it opened stays in the list.
 */
export function BriefPanel({ onClose, onSeen, focusOnOpen }: { onClose: () => void; onSeen: () => void; focusOnOpen: boolean }) {
  const { user } = useAuth();
  const aside = useRef<HTMLElement>(null);
  const since = useRef<string | null>(null);
  const [data, setData] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ tz: localTimeZone() });
    if (since.current) qs.set("since", since.current);
    try {
      const b = await api.get<Brief>(`/brief?${qs}`);
      setData(b); setError(null);
      if (!since.current) {
        since.current = b.since;
        void api.post("/brief/seen", {}).then(onSeen).catch(() => {});
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [onSeen]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focusOnOpen) aside.current?.focus(); }, [focusOnOpen]);

  // Wide screens: the panel starts under the header and reaches the top once the header scrolls away.
  useLayoutEffect(() => {
    const place = () => {
      const bottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      aside.current?.style.setProperty("--brief-top", `${Math.max(0, Math.round(bottom))}px`);
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
  const now = new Date();
  const icon = "focus-ring flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-2 hover:bg-ink/5 disabled:opacity-40";
  return (
    <>
      <div aria-hidden className="no-print fixed inset-0 z-50 bg-black/45 lg:hidden" onClick={onClose} />
      <aside id="daily-brief" ref={aside} tabIndex={-1} aria-labelledby="daily-brief-title" onKeyDown={onKey}
        className="tk-panel no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col overflow-y-auto overscroll-contain border-l border-line bg-surface shadow-[-8px_0_24px_rgb(26_21_35/0.12)] outline-none lg:top-(--brief-top) lg:z-30 lg:shadow-none">
        <div className="sticky top-0 z-[2] flex items-start justify-between gap-2 border-b border-line bg-surface py-3 pr-2 pl-5">
          <div className="min-w-0 pt-1">
            <h2 id="daily-brief-title" className="truncate text-base font-semibold">{t(greeting(now.getHours()), { a: firstName(user?.name) })}</h2>
            <p className="text-xs text-ink-3 first-letter:uppercase"><time dateTime={data?.today}>{longDate(now, locale())}</time></p>
          </div>
          <span className="flex shrink-0 items-center gap-0.5">
            <button type="button" className={icon} onClick={() => void load()} disabled={loading} aria-label={t("Actualizar")} title={t("Actualizar")}>
              <RefreshCw size={16} className={cx(loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
            </button>
            <button type="button" className={icon} onClick={onClose} aria-label={t("Cerrar resumen del día")} title={t("Cerrar")}><X size={16} aria-hidden /></button>
          </span>
        </div>
        <span role="status" className="sr-only">{loading ? t("Cargando…") : ""}</span>
        {error && <div className="px-5 pt-4"><ErrorNote>{error}</ErrorNote></div>}
        {!data ? (loading ? <Skeleton /> : null) : <div className="pb-6"><Content b={data} /></div>}
      </aside>
    </>
  );
}
