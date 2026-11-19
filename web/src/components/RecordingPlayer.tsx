// Replays a session recording: the page is rebuilt from the recorded events, with play, seek and speed.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Replayer } from "rrweb";
import "rrweb/dist/style.css";
import { api } from "../lib/api";
import { ErrorNote, Spinner, cx } from "./ui";
import { t } from "../lib/i18n";

const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const SPEEDS = [1, 2, 4, 8];

export default function RecordingPlayer({ studyId, sessionId }: { studyId: string; sessionId: string }) {
  const stage = useRef<HTMLDivElement | null>(null);
  const player = useRef<Replayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [total, setTotal] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState(true);
  const [box, setBox] = useState({ w: 0, h: 0, scale: 1 });

  useEffect(() => {
    let gone = false, r: Replayer | null = null, raf = 0;
    const fit = (w: number, h: number) => {
      const el = stage.current; if (!el || !w || !h) return;
      const scale = Math.min(el.clientWidth / w, (window.innerHeight * 0.62) / h, 1);
      setBox({ w, h, scale });
    };
    api.get<{ events: { type: number; timestamp: number }[] }>(`/studies/${studyId}/recordings/${sessionId}`).then(({ events }) => {
      if (gone || !stage.current) return;
      // A replay needs the full picture of the page (type 2) and at least one more event.
      if (events.length < 2 || !events.some((e) => e.type === 2)) { setError(t("Esta grabación está incompleta y no se puede reproducir.")); return; }
      r = new Replayer(events as never, { root: stage.current, skipInactive: true, speed: 1, mouseTail: { strokeStyle: "#5902A1" }, showWarning: false });
      player.current = r;
      setTotal(r.getMetaData().totalTime);
      r.on("resize", (d) => { const s = d as { width: number; height: number }; fit(s.width, s.height); });
      r.on("finish", () => setPlaying(false));
      const tick = () => { if (r) setTime(Math.min(r.getCurrentTime(), r.getMetaData().totalTime)); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      r.pause(0);
      setReady(true);
    }).catch((e) => { if (!gone) setError((e as Error).message); });
    const onResize = () => { const f = player.current?.iframe; if (f) fit(Number(f.getAttribute("width")), Number(f.getAttribute("height"))); };
    window.addEventListener("resize", onResize);
    return () => { gone = true; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); r?.destroy(); player.current = null; };
  }, [studyId, sessionId]);

  const toggle = () => {
    const r = player.current; if (!r) return;
    if (playing) { r.pause(); setPlaying(false); } else { r.play(time >= total ? 0 : time); setPlaying(true); }
  };
  const seek = (ms: number) => { const r = player.current; if (!r) return; setTime(ms); if (playing) r.play(ms); else r.pause(ms); };
  const config = (next: { speed?: number; skipInactive?: boolean }) => player.current?.setConfig(next);

  return (
    <div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!error && !ready && <div className="py-10"><Spinner /></div>}
      {/* The recorded page keeps its real size and is scaled down to fit; it cannot be clicked. */}
      <div ref={stage} className={cx("rk-replay flex justify-center overflow-hidden rounded-lg border border-line bg-paper", !ready && "h-0 border-0")} style={ready ? { height: box.h * box.scale || undefined } : undefined}>
        <style>{`.rk-replay .replayer-wrapper{transform:scale(${box.scale});transform-origin:top center;flex:none;width:${box.w}px;height:${box.h}px}.rk-replay iframe{border:0;pointer-events:none;background:#fff}`}</style>
      </div>
      {ready && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" onClick={toggle} aria-label={playing ? t("Pausar") : time >= total ? t("Reproducir de nuevo") : t("Reproducir")}
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent/90">
            {playing ? <Pause size={18} aria-hidden /> : time >= total && total > 0 ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </button>
          <span className="w-24 shrink-0 text-[13px] tabular-nums text-ink-2">{clock(time)} / {clock(total)}</span>
          <input type="range" min={0} max={Math.max(total, 1)} step={100} value={Math.min(time, total)} onChange={(e) => seek(Number(e.target.value))}
            aria-label={t("Posición en la grabación")} aria-valuetext={`${clock(time)} / ${clock(total)}`} className="h-9 min-w-40 flex-1 accent-[var(--color-accent)]" />
          <label className="flex items-center gap-2 text-[13px] text-ink-3">{t("Velocidad")}
            <select value={speed} onChange={(e) => { const v = Number(e.target.value); setSpeed(v); config({ speed: v }); }} className="field !min-h-9 !w-auto !py-1 !pr-8 text-[13px]">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={skip} onChange={(e) => { setSkip(e.target.checked); config({ skipInactive: e.target.checked }); }} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t("Saltar pausas")}
          </label>
        </div>
      )}
    </div>
  );
}
