import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flag, Play, RotateCcw, Target } from "lucide-react";
import type { PrototypeTaskBlock } from "./types";
import type { Prototype, ProtoClick, ProtoStep, PrototypeTaskValue } from "./prototype";
import { HTML_SANDBOX, asTrackerMsg, htmlScreenId, isHtml } from "./prototype";
import { cx } from "../components/ui";

import { t } from "../lib/i18n";
export function PrototypeTaskView({ block, proto, value, onChange, onAdvance, preview }: {
  block: PrototypeTaskBlock; proto?: Prototype; value?: PrototypeTaskValue;
  onChange: (v: unknown) => void; onAdvance?: (v: unknown) => void; preview?: boolean;
}) {
  const [phase, setPhase] = useState<"intro" | "running" | "done">(value ? "done" : "intro");
  const [hist, setHist] = useState<string[]>([]);
  const [flash, setFlash] = useState(false);
  const [showTask, setShowTask] = useState(true);
  const start = useRef(0);
  const path = useRef<ProtoStep[]>([]);
  const clicks = useRef<ProtoClick[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [run, setRun] = useState(0);   // cambia en cada intento para recargar el HTML desde cero
  const html = isHtml(proto);
  const [avail, setAvail] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setAvail({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(area.current); return () => ro.disconnect();
  }, [phase]);

  // Precarga de todas las pantallas para que la navegación sea instantánea
  useEffect(() => { if (!html) proto?.screens.forEach((s) => { const i = new Image(); i.src = s.image; }); }, [proto, html]);

  // Prototipo HTML: el script inyectado nos avisa de cada pantalla y cada clic
  useEffect(() => {
    if (!html || phase !== "running") return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const m = asTrackerMsg(e.data); if (!m) return;
      const t = Math.round(performance.now() - start.current);
      if (m.type === "screen" && typeof m.name === "string" && m.name) {
        const id = htmlScreenId(m.name.slice(0, 80));
        if (path.current[path.current.length - 1]?.s === id) return;
        path.current.push({ s: id, t: path.current.length ? t : 0 });
        if (block.goalScreens.includes(id)) finishRef.current("success");
      } else if (m.type === "click" && clicks.current.length < 2000) {
        const s = m.screen ? htmlScreenId(String(m.screen).slice(0, 80)) : path.current[path.current.length - 1]?.s ?? "";
        const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? +Math.min(1, Math.max(0, v)).toFixed(4) : 0);
        clicks.current.push({ s, x: n(m.x), y: n(m.y), t, h: m.hit ? "el" : null, l: String(m.label ?? "").slice(0, 80) });
      }
    };
    window.addEventListener("message", onMsg); return () => window.removeEventListener("message", onMsg);
  }, [html, phase, block.goalScreens]);
  const finishRef = useRef<(o: PrototypeTaskValue["outcome"]) => void>(() => {});

  if (!proto || (html ? !proto.html?.url : !proto.screens.length || !proto.screens.some((s) => s.id === block.startScreen))) {
    return <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn">{preview ? t("Configura el prototipo y la pantalla inicial de esta tarea en el panel derecho.") : t("Esta tarea no está disponible.")}</p>;
  }
  const cur = proto.screens.find((s) => s.id === hist[hist.length - 1]);
  const mobile = proto.device === "mobile";
  // El marco se ajusta al espacio disponible: el teléfono (390×844) o la pantalla de escritorio (16:10)
  // siempre caben completos; las pantallas más largas se desplazan dentro del marco.
  const bare = mobile && avail.w < 440;   // en un teléfono real: pantalla completa, sin marco
  const frame = bare ? { width: avail.w, height: avail.h } : mobile
    ? (() => { const w = Math.min(390, avail.w, (avail.h - 16) * 390 / 844); return { width: w, height: w * 844 / 390 }; })()
    : (() => { const w = Math.min(1280, avail.w, avail.h * 1.6); return { width: w, height: Math.min(avail.h, w / 1.6) }; })();

  const begin = () => {
    start.current = performance.now(); clicks.current = [];
    path.current = html ? [] : [{ s: block.startScreen, t: 0 }];
    setHist(html ? [] : [block.startScreen]); setRun((r) => r + 1); setPhase("running"); setShowTask(false);
  };
  const finish = (outcome: PrototypeTaskValue["outcome"]) => {
    const v: PrototypeTaskValue = { outcome, path: path.current, clicks: clicks.current, ms: Math.round(performance.now() - start.current) };
    onChange(v); setPhase("done");
    if (!preview) setTimeout(() => onAdvance?.(v), outcome === "success" ? 1100 : 300);
  };
  finishRef.current = finish;
  // En HTML sin pantalla meta, el participante indica cuándo terminó
  const selfReport = html && block.goalScreens.length === 0;
  const now = () => Math.round(performance.now() - start.current);
  const rel = (e: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: +((e.clientX - r.left) / r.width).toFixed(4), y: +((e.clientY - r.top) / r.height).toFixed(4) };
  };
  const go = (target: string) => {
    let next: string[];
    if (target === "back") { if (hist.length < 2) return; next = hist.slice(0, -1); }
    else next = [...hist, target];
    const s = next[next.length - 1];
    path.current.push({ s, t: now() });
    setHist(next); scroller.current?.scrollTo({ top: 0 });
    if (block.goalScreens.includes(s)) finish("success");
  };

  if (phase === "intro") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent"><Target size={22} /></span>
        <p className="mt-4 text-sm text-ink-2">{t("Lee la tarea con calma. Cuando estés listo/a, abre el prototipo y navégalo como si fuera la app real.")}</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-[13px] text-ink-2">
          <li>{t("• Toca los elementos como lo harías normalmente.")}</li>
          <li>{t("• Si la pantalla es larga, puedes desplazarte.")}</li>
          {selfReport && <li>{t("• Cuando creas que lo lograste, toca")} <b>{t("\"Terminé la tarea\"")}</b>.</li>}
          {block.allowGiveUp && <li>{t("• Si no encuentras cómo hacerlo, usa")} <b>{t("\"No puedo completarla\"")}</b>{t(". También nos sirve.")}</li>}
        </ul>
        <button type="button" onClick={begin} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[15px] font-medium text-on-accent">
          <Play size={16} /> {t("Empezar la tarea")}
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const ok = value?.outcome === "success";
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        {ok ? <CheckCircle2 size={40} className="mx-auto text-good" /> : <Flag size={36} className="mx-auto text-ink-3" />}
        <p className="mt-3 text-lg font-semibold">{ok ? t("¡Tarea completada!") : t("Gracias, registramos que no pudiste completarla.")}</p>
        <p className="mt-1 text-sm text-ink-2">{preview ? t("Vista previa: así terminará la tarea.") : t("Continuamos en un momento…")}</p>
        {preview && <button onClick={() => { onChange(undefined); setPhase("intro"); }} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent"><RotateCcw size={14} /> {t("Repetir")}</button>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#1a1528]">
      {/* Barra de la tarea */}
      <div className="flex shrink-0 items-center gap-3 bg-surface px-4 py-2.5 shadow">
        <button onClick={() => setShowTask(!showTask)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Target size={16} className="shrink-0 text-accent" />
          <span className={cx("text-sm font-medium", !showTask && "truncate")}>{block.title}</span>
        </button>
        {preview && <button onClick={() => setPhase("intro")} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-3 hover:text-ink">{t("Salir de la vista previa")}</button>}
        {selfReport && (
          <button onClick={() => finish("success")} className="focus-ring shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent">
            {t("Terminé la tarea")}
          </button>
        )}
        {block.allowGiveUp && (
          <button onClick={() => finish("gave_up")} className="focus-ring shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-bad hover:text-bad">
            {t("No puedo completarla")}
          </button>
        )}
      </div>
      {showTask && block.description && <div className="bg-surface px-4 pb-3 text-[13px] text-ink-2">{block.description}</div>}

      {/* Prototipo */}
      <div ref={area} className={cx("flex min-h-0 flex-1 items-center justify-center", bare ? "p-0" : "p-3 sm:p-6")}>
        <div ref={scroller}
          className={cx("relative overscroll-contain bg-white shadow-2xl", html ? "overflow-hidden" : "overflow-y-auto", bare ? "" : mobile ? "rounded-[2rem] ring-8 ring-black" : "rounded-lg")}
          style={frame}>
          {html && proto.html && (
            <iframe key={run} ref={frameRef} src={proto.html.url} sandbox={HTML_SANDBOX} title={proto.name}
              className="block h-full w-full border-0 bg-white" referrerPolicy="no-referrer" />
          )}
          {!html && cur && (
            <div className="relative" onClick={(e) => {
              clicks.current.push({ s: cur.id, ...rel(e), t: now(), h: null });
              if (proto.showHints) { setFlash(true); setTimeout(() => setFlash(false), 650); }
            }}>
              <img ref={imgRef} src={cur.image} alt="" draggable={false} className="block w-full select-none" />
              {cur.hotspots.map((h) => (
                <button key={h.id} type="button" aria-label={t("Elemento interactivo")}
                  onClick={(e) => { e.stopPropagation(); clicks.current.push({ s: cur.id, ...rel(e), t: now(), h: h.id }); go(h.target); }}
                  className={cx("absolute cursor-pointer rounded-md transition-all duration-200", flash ? "bg-accent/30 ring-2 ring-accent" : "")}
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }} />
              ))}
            </div>
          )}
        </div>
      </div>
      {preview && <p className="pb-2 text-center text-xs text-white/80">{t("Vista previa · las interacciones no se guardan")}</p>}
    </div>
  );
}
