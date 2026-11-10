import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Flag, Hourglass, Play, RotateCcw, TimerOff } from "lucide-react";
import type { TimedTaskBlock, TimedTaskValue } from "./types";
import { clock } from "./timed";
import { cx } from "../components/ui";
import { t } from "../lib/i18n";

/** Tarea cronometrada: el participante la hace en el producto real (link) o fuera de la pantalla y reporta el resultado. */
export function TimedTaskView({ block, value, onChange, onAdvance, preview }: {
  block: TimedTaskBlock; value?: TimedTaskValue; onChange: (v: unknown) => void; onAdvance?: (v: unknown) => void; preview?: boolean;
}) {
  const [phase, setPhase] = useState<"intro" | "running" | "done">(value ? "done" : "intro");
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  const finished = useRef(false);
  const limit = block.limitSec ? block.limitSec * 1000 : null;

  const finish = (outcome: TimedTaskValue["outcome"]) => {
    if (finished.current) return;
    finished.current = true;
    const v: TimedTaskValue = { outcome, ms: Math.round(performance.now() - start.current) };
    onChange(v); setPhase("done");
    if (!preview) setTimeout(() => onAdvance?.(v), outcome === "success" ? 1100 : 400);
  };

  const begin = () => {
    if (block.url) window.open(block.url, "_blank", "noopener,noreferrer");
    finished.current = false; start.current = performance.now(); setElapsed(0); setPhase("running");
  };

  // Tick cada 250 ms; el valor guardado se calcula con performance.now(), no con el contador.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      const ms = performance.now() - start.current;
      setElapsed(ms);
      if (limit && ms >= limit) finish("timeout");
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, limit]);

  const host = (() => { try { return block.url ? new URL(block.url).host : ""; } catch { return block.url; } })();

  if (phase === "intro") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent"><Hourglass size={22} /></span>
        <p className="mt-4 text-sm text-ink-2">{t("Lee la tarea con calma. El tiempo empieza a correr cuando pulses el botón.")}</p>
        <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-[13px] text-ink-2">
          {host && <li>{t("• Se abrirá {a} en otra pestaña. Haz la tarea ahí y vuelve aquí al terminar.", { a: host })}</li>}
          <li>{t("• Hazla a tu ritmo normal, sin apurarte.")}</li>
          <li>{t("• Cuando la termines, pulsa")} <b>{t("\"Lo logré\"")}</b>.</li>
          {block.allowGiveUp && <li>{t("• Si no encuentras cómo hacerlo, usa")} <b>{t("\"No pude completarla\"")}</b>{t(". También nos sirve.")}</li>}
          {block.limitSec && <li>{t("• Tienes hasta {a}.", { a: clock(block.limitSec * 1000) })}</li>}
        </ul>
        <button type="button" onClick={begin} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[15px] font-medium text-on-accent">
          <Play size={16} /> {t("Empezar y cronometrar")}
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const o = value?.outcome;
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        {o === "success" ? <CheckCircle2 size={40} className="mx-auto text-good" /> : o === "timeout" ? <TimerOff size={36} className="mx-auto text-warn" /> : <Flag size={36} className="mx-auto text-ink-3" />}
        <p className="mt-3 text-lg font-semibold">
          {o === "success" ? t("¡Tarea completada en {a}!", { a: clock(value?.ms ?? 0) }) : o === "timeout" ? t("Se acabó el tiempo. No pasa nada: también nos sirve.") : t("Gracias, registramos que no pudiste completarla.")}
        </p>
        <p className="mt-1 text-sm text-ink-2">{preview ? t("Vista previa: así terminará la tarea.") : t("Continuamos en un momento…")}</p>
        {preview && <button onClick={() => { onChange(undefined); finished.current = false; setPhase("intro"); }} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent"><RotateCcw size={14} /> {t("Repetir")}</button>}
      </div>
    );
  }

  const left = limit ? Math.max(0, limit - elapsed) : null;
  const urgent = left !== null && left <= 15_000;
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
      {block.showTimer ? (
        <p className={cx("display text-6xl tabular-nums", urgent ? "text-warn" : "text-accent")} aria-live="off">{clock(left !== null && block.limitSec ? left : elapsed)}</p>
      ) : (
        <p className="flex items-center justify-center gap-2 text-sm text-ink-2"><Hourglass size={16} className="text-accent" /> {t("Cronometrando…")}</p>
      )}
      {left !== null && block.showTimer && <p className="mt-1 text-xs text-ink-3">{t("tiempo restante")}</p>}
      {limit && (
        <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-ink/[0.06]">
          <div className={cx("h-full rounded-full transition-[width] duration-300", urgent ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} />
        </div>
      )}
      {block.url && (
        <a href={block.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          <ExternalLink size={14} /> {t("Abrir {a} de nuevo", { a: host })}
        </a>
      )}
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => finish("success")} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-[15px] font-medium text-on-accent">
          <CheckCircle2 size={16} /> {t("Lo logré")}
        </button>
        {block.allowGiveUp && (
          <button type="button" onClick={() => finish("gave_up")} className="focus-ring rounded-lg border border-line px-4 py-2.5 text-[15px] font-medium text-ink-2 hover:border-bad hover:text-bad">
            {t("No pude completarla")}
          </button>
        )}
      </div>
      {preview && <p className="mt-4 text-xs text-ink-3">{t("Vista previa · las respuestas no se guardan")}</p>}
    </div>
  );
}
