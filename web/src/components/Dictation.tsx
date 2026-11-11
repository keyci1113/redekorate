import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { cx } from "./ui";
import { getLang, t } from "../lib/i18n";
import { dictationProblem, joinDictation, recognizerCtor, sessionTranscript, speechLocale, type DictationProblem, type SpeechRecognizer } from "../lib/dictation";

interface Props {
  value: string; onChange: (v: string) => void; maxLength: number;
  multiline?: boolean; className?: string; placeholder?: string; autoFocus?: boolean; label?: string;
  /** false hides the microphone and leaves a plain field (study setting) */
  voice?: boolean;
}

const PROBLEM_TEXT = (): Record<Exclude<DictationProblem, null>, string> => ({
  denied: t("No tenemos permiso para usar el micrófono. Actívalo en tu navegador o escribe tu respuesta."),
  "no-mic": t("No encontramos un micrófono. Puedes escribir tu respuesta."),
  network: t("Este navegador no pudo transcribir tu voz. Escribe tu respuesta, o abre el estudio en Chrome, Safari o Edge para dictar."),
});

// Some Chromium browsers (Dia, Brave, Vivaldi…) expose speech recognition but have no transcription service
// behind it, and every attempt ends in a "network" error. Once that happens with nothing transcribed, the
// microphone is withdrawn for the rest of the visit so it is not offered again on the next question.
const DEAD_KEY = "rk_voice_unavailable";
const readDead = () => { try { return sessionStorage.getItem(DEAD_KEY) === "1"; } catch { return false; } };
const markDead = () => { try { sessionStorage.setItem(DEAD_KEY, "1"); } catch { /* no storage */ } };

/**
 * A text answer the participant can also dictate. Speech is transcribed by the browser as they talk
 * and lands in the same field, so they can correct it by hand; no audio is recorded or uploaded by us.
 * Where the browser has no speech recognition the field is shown without the microphone.
 */
export function DictationField({ value, onChange, maxLength, multiline, className, placeholder, autoFocus, label, voice = true }: Props) {
  const [dead, setDead] = useState(readDead);
  const Ctor = voice && !dead ? recognizerCtor() : null;
  const heard = useRef(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<DictationProblem>(null);
  const rec = useRef<SpeechRecognizer | null>(null);
  const base = useRef("");
  const change = useRef(onChange);
  change.current = onChange;

  const stop = () => { rec.current?.stop(); };
  useEffect(() => () => { rec.current?.abort(); }, []);

  const start = () => {
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = speechLocale(getLang(), navigator.language);
    // Android repeats earlier phrases in continuous mode; one phrase per tap is reliable there.
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.interimResults = true;
    base.current = value;
    r.onresult = (e) => { heard.current = true; change.current(joinDictation(base.current, sessionTranscript(e.results), maxLength)); };
    r.onerror = (e) => {
      const p = dictationProblem(e.error);
      setProblem(p);
      if (p === "network" && !heard.current) { markDead(); setDead(true); }
    };
    r.onend = () => { setListening(false); rec.current = null; };
    setProblem(null);
    try { r.start(); rec.current = r; setListening(true); } catch { setListening(false); }
  };

  // Typing while listening would be overwritten by the next recognized phrase, so typing ends the dictation.
  const typed = (v: string) => { if (listening) stop(); onChange(v); };
  const shared = { className, placeholder, autoFocus, maxLength, value, "aria-label": label };

  return (
    <div>
      {multiline
        ? <textarea {...shared} onChange={(e) => typed(e.target.value)} />
        : <input {...shared} onChange={(e) => typed(e.target.value)} />}
      {Ctor && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={listening ? stop : start} aria-pressed={listening}
            className={cx("focus-ring inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[14px] sm:h-9 sm:px-3.5 sm:text-[13px] font-medium transition",
              listening ? "border-accent bg-accent text-on-accent" : "border-line-2 bg-surface text-ink-2 hover:border-accent hover:text-ink")}>
            {listening ? <Square size={12} fill="currentColor" /> : <Mic size={15} />}
            {listening ? t("Detener") : value ? t("Seguir dictando") : t("Responder con voz")}
          </button>
          <span className="text-[13px] text-ink-3" role="status" aria-live="polite">
            {listening ? t("Escuchando… tu voz no se graba, solo se transcribe.") : problem ? "" : t("Habla y lo escribimos por ti. Tu voz no se graba ni se guarda: solo queda el texto, que puedes corregir.")}
          </span>
        </div>
      )}
      {problem && <p className="mt-2 text-[13px] text-ink-2" role="alert">{PROBLEM_TEXT()[problem]}</p>}
    </div>
  );
}
