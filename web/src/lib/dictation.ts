import type { Lang } from "./i18n";

/**
 * Voice answers: the participant speaks and the browser's speech recognition writes the text.
 * Pure helpers live here so they can be tested; the React glue is in components/Dictation.tsx.
 */

/** Minimal shape of the Web Speech API we use (not in TypeScript's DOM lib). */
export interface SpeechResultList { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
export interface SpeechRecognizer {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => SpeechRecognizer;

/** The browser's recognizer constructor, or null where dictation is not available (e.g. Firefox). */
export function recognizerCtor(w: unknown = typeof window === "undefined" ? undefined : window): RecognizerCtor | null {
  const g = w as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor } | undefined;
  return g?.SpeechRecognition ?? g?.webkitSpeechRecognition ?? null;
}

/**
 * Locale to recognize in: the study language decides, and the browser's own regional variant is used
 * when it is the same language (an "es-CO" phone answering a Spanish study is recognized as es-CO).
 */
export function speechLocale(lang: Lang, browserLang?: string | null): string {
  if (browserLang && browserLang.toLowerCase().split("-")[0] === lang && browserLang.includes("-")) return browserLang;
  return lang === "es" ? "es-MX" : "en-US";
}

/** Everything recognized in this listening session, final and interim pieces in order. */
export function sessionTranscript(results: SpeechResultList): string {
  let out = "";
  for (let i = 0; i < results.length; i++) out += results[i][0].transcript;
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Text already in the field + what was just spoken. The spoken part starts with a capital when it
 * opens the answer or follows the end of a sentence, and the result never exceeds the field's limit.
 */
export function joinDictation(base: string, spoken: string, max: number): string {
  const said = spoken.replace(/\s+/g, " ").trim();
  if (!said) return base.slice(0, max);
  const head = base.replace(/[ \t]+$/, "");
  const startsSentence = !head || /[.!?…\n]$/.test(head);
  const text = startsSentence ? said.charAt(0).toUpperCase() + said.slice(1) : said;
  const glue = !head || head.endsWith("\n") ? "" : " ";
  return (head + glue + text).slice(0, max);
}

/** Recognition errors worth telling the participant about; the rest (silence, a manual stop) are not errors to them. */
export type DictationProblem = "denied" | "no-mic" | "network" | null;
export function dictationProblem(error: string): DictationProblem {
  if (error === "not-allowed" || error === "service-not-allowed") return "denied";
  if (error === "audio-capture") return "no-mic";
  if (error === "network") return "network";
  return null;
}
