import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Loader2, Pause, Play, RotateCcw, Trash2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import type { Section, Sketch } from "./types";
import { AutoText, useDoc } from "./Sections";
import { FRAMES, FRAME_MS, MAX_POINTS, VIEW, addPoint, clock, pointCount, timerAt, toPath, validStroke, type Pt } from "./sketchModel";
import { api } from "../lib/api";
import { optimizeImage } from "../lib/image";
import { cx } from "../components/ui";

/**
 * Crazy 8s: a template's sketch sections drawn together as one portrait sheet folded into eight panels (two across,
 * four down; one column on phones). Each panel is still its own section, so data, exports and the API see eight
 * ordinary values. A timer gives each panel one minute and rings the panel being drawn; it lives only in this page.
 */
export function SketchSheet({ sections, value, set }: {
  sections: Section[]; value: (id: string) => unknown; set: (id: string) => (v: unknown) => void;
}) {
  const { T, readOnly } = useDoc();
  const timer = useTimer(sections.length);
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 break-inside-avoid sm:p-5">
      {!readOnly && <TimerBar timer={timer} total={sections.length} />}
      {/* The sheet: white paper whatever the theme, panels split by dashed fold lines. */}
      <div className="mx-auto grid max-w-3xl overflow-hidden rounded-md border border-neutral-300 bg-white text-neutral-900 shadow-sm sm:grid-cols-2">
        {sections.map((s, i) => (
          <SketchPanel key={s.id} n={i + 1} section={s} value={value(s.id) as Sketch | undefined} set={set(s.id)}
            active={timer.running && !timer.done && timer.frame === i}
            fold={cx(i > 0 && "max-sm:border-t", i % 2 === 1 && "sm:border-l", i > 1 && "sm:border-t", "border-dashed border-neutral-300")} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{timer.running ? (timer.done ? T("¡Tiempo!") : T("Boceto {n} de {total}", { n: timer.frame + 1, total: sections.length })) : ""}</p>
      {timer.done && !readOnly && <p className="mt-3 text-center text-[13px] font-medium text-good">{T("¡Tiempo! Elige las ideas que vale la pena llevar adelante.")}</p>}
    </div>
  );
}

type Timer = ReturnType<typeof useTimer>;

/** One minute per panel; pausing keeps the time already spent. The panel change beeps unless sound is off. */
function useTimer(frames: number) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const running = startedAt !== null;
  const elapsed = spent + (running ? now - startedAt : 0);
  const at = timerAt(elapsed, frames || FRAMES, FRAME_MS);
  const started = running || spent > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const lastFrame = useRef(-1);
  useEffect(() => {
    if (!running) { lastFrame.current = -1; return; }
    const key = at.done ? frames : at.frame;
    if (lastFrame.current !== -1 && key !== lastFrame.current && sound) beep(at.done ? 2 : 1);
    lastFrame.current = key;
    if (at.done) { setSpent(frames * FRAME_MS); setStartedAt(null); }
  }, [running, at.frame, at.done, frames, sound]);

  return {
    ...at, running, started, sound, elapsed,
    start: () => { const t = Date.now(); setNow(t); setStartedAt(t); },
    pause: () => { setSpent(elapsed); setStartedAt(null); },
    reset: () => { setSpent(0); setStartedAt(null); },
    toggleSound: () => setSound((x) => !x),
  };
}

/** A short tone through Web Audio; silently does nothing where audio is unavailable. */
function beep(times: number) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t = ctx.currentTime + i * 0.25;
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.2);
    }
    setTimeout(() => void ctx.close(), times * 250 + 300);
  } catch { /* no audio */ }
}

function TimerBar({ timer, total }: { timer: Timer; total: number }) {
  const { T } = useDoc();
  const btn = "focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition";
  const finished = timer.done && !timer.running && timer.started;
  return (
    <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
      <p className="text-[13px] text-ink-2 tabular-nums">
        {finished ? T("¡Tiempo!")
          : timer.started ? <><span className="font-semibold text-ink">{T("Boceto {n} de {total}", { n: timer.frame + 1, total })}</span> · {clock(timer.left)}</>
          : T("Un minuto por boceto: {m} minutos en total", { m: total })}
      </p>
      <div className="flex items-center gap-1.5">
        {timer.running
          ? <button type="button" onClick={timer.pause} className={cx(btn, "bg-paper text-ink hover:bg-line/60")}><Pause size={14} aria-hidden />{T("Pausar")}</button>
          : !finished && <button type="button" onClick={timer.start} className={cx(btn, "bg-accent text-white hover:opacity-90")}><Play size={14} aria-hidden />{timer.started ? T("Continuar") : T("Iniciar {m} minutos", { m: total })}</button>}
        {timer.started && <button type="button" onClick={timer.reset} className={cx(btn, "text-ink-2 hover:bg-paper")}><RotateCcw size={14} aria-hidden />{T("Reiniciar")}</button>}
        <button type="button" onClick={timer.toggleSound} aria-pressed={timer.sound} title={T("Sonido al cambiar de boceto")} aria-label={T("Sonido al cambiar de boceto")}
          className="focus-ring rounded-lg p-2 text-ink-2 hover:bg-paper">{timer.sound ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}</button>
      </div>
    </div>
  );
}

function SketchPanel({ n, section, value, set, active, fold }: {
  n: number; section: Section; value: Sketch | undefined; set: (v: unknown) => void; active: boolean; fold: string;
}) {
  const { T, readOnly } = useDoc();
  const v = value ?? {};
  const strokes = (v.strokes ?? []).filter(validStroke);
  const [drawing, setDrawing] = useState<Pt[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const full = pointCount(strokes) >= MAX_POINTS;
  const title = section.title ? T(section.title) : String(n);
  const update = (patch: Partial<Sketch>) => set({ ...v, ...patch });

  const at = (e: ReactPointerEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VIEW.w, ((e.clientY - r.top) / r.height) * VIEW.h];
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (readOnly || full || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(addPoint([], ...at(e)));
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => { if (drawing) setDrawing(addPoint(drawing, ...at(e))); };
  const up = () => {
    if (!drawing) return;
    // A tap is a dot: repeat the point so the path has a length and the round cap shows.
    const pts = drawing.length === 1 ? [drawing[0], drawing[0]] : drawing;
    setDrawing(null);
    update({ strokes: [...strokes, toPath(pts)] });
  };

  async function upload(f?: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") { setErr(T("Usa PNG, JPG, GIF o WEBP")); return; }
    setBusy(true); setErr(null);
    try { update({ image: await api.upload(await optimizeImage(f)) }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const tool = "focus-ring rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30";
  return (
    <section aria-label={title} className={cx("relative flex flex-col p-2.5 sm:p-3", fold, active && "z-10 bg-amber-50 outline-2 -outline-offset-2 outline-accent")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cx("flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold", active ? "bg-accent text-white" : "bg-neutral-100 text-neutral-600")}>{n}</span>
        {!readOnly && (
          <div className="flex items-center gap-0.5 print:hidden">
            {v.image
              ? <button type="button" onClick={() => update({ image: undefined })} className={tool} title={T("Quitar foto")} aria-label={`${T("Quitar foto")} · ${title}`}><X size={15} aria-hidden /></button>
              : <>
                <button type="button" disabled={!strokes.length} onClick={() => update({ strokes: strokes.slice(0, -1) })} className={tool} title={T("Deshacer trazo")} aria-label={`${T("Deshacer trazo")} · ${title}`}><Undo2 size={15} aria-hidden /></button>
                <button type="button" disabled={!strokes.length} onClick={() => update({ strokes: [] })} className={tool} title={T("Borrar dibujo")} aria-label={`${T("Borrar dibujo")} · ${title}`}><Trash2 size={15} aria-hidden /></button>
                <button type="button" disabled={busy} onClick={() => file.current?.click()} className={tool} title={T("Subir foto del boceto")} aria-label={`${T("Subir foto del boceto")} · ${title}`}>
                  {busy ? <Loader2 size={15} aria-hidden className="animate-spin" /> : <ImagePlus size={15} aria-hidden />}
                </button>
                <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
              </>}
          </div>
        )}
      </div>
      {v.image
        ? <img src={v.image} alt={v.idea?.trim() || title} className="mt-1.5 aspect-[3/2] w-full rounded object-contain" />
        : (
          <svg ref={svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={`${title}: ${readOnly ? (strokes.length ? T("dibujo") : T("vacío")) : T("Dibuja aquí con el mouse, el dedo o un lápiz")}`}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            className={cx("mt-1.5 aspect-[3/2] w-full touch-none select-none", !readOnly && !full && "cursor-crosshair")}>
            <g fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {strokes.map((d, i) => <path key={i} d={d} />)}
              {drawing && <path d={toPath(drawing.length === 1 ? [drawing[0], drawing[0]] : drawing)} />}
            </g>
          </svg>
        )}
      {full && !readOnly && !v.image && <p className="text-[11px] text-neutral-500">{T("Este boceto ya no admite más trazos")}</p>}
      {err && <p role="alert" className="text-[11px] text-bad">{err}</p>}
      <div className="mt-1 border-t border-neutral-200 pt-1">
        {readOnly
          ? <p className="px-2 py-1 text-[13px] font-medium">{v.idea?.trim() || <span className="text-neutral-400">—</span>}</p>
          : <AutoText value={v.idea ?? ""} onChange={(idea) => update({ idea })} placeholder={T("La idea en pocas palabras")} minRows={1}
            className="text-[13px] font-medium text-neutral-900 placeholder:text-neutral-400 focus:bg-white" />}
      </div>
    </section>
  );
}
