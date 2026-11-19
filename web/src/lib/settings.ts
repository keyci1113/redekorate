import { tc } from "./i18n";
import type { Prototype } from "../blocks/prototype";

import type { Lang } from "./i18n";

export interface StudySettings {
  language?: Lang;          // idioma que verán los participantes
  prototypes?: Prototype[];
  // color drives selection and progress; button / buttonText override the main buttons only.
  brand?: { color?: string; logo?: string | null; logoSize?: number; button?: string; buttonText?: "auto" | "light" | "dark" };
  showProgress?: boolean;   // por defecto true
  allowBack?: boolean;      // por defecto true
  hideCredit?: boolean;
  voiceAnswers?: boolean;   // on by default: participants can dictate text answers
  consent?: { enabled: boolean; text: string };
}

/** Voice answers are on unless the study turned them off. */
export const voiceOn = (s?: StudySettings) => s?.voiceAnswers !== false;

export const defaultConsent = () =>
  tc("Te invitamos a participar en un estudio para mejorar un producto digital.\n\n") +
  tc("• Tu participación es voluntaria y puedes abandonarla en cualquier momento.\n") +
  "• Tus respuestas se usarán únicamente con fines de investigación y se analizarán de forma agregada.\n" +
  tc("• No compartiremos tus datos con terceros.");

export const BRAND_COLORS = ["#5902A1", "#9333EA", "#C026D3", "#DB2777", "#4F46E5", "#2563EB", "#0E7490", "#059669", "#EA580C", "#1F1633"];

/** Height of the study logo in pixels: what the study saved, kept within sensible limits. */
export const LOGO_SIZE = { min: 20, max: 120, default: 36 };
export const logoHeight = (s?: StudySettings) => {
  const v = Number(s?.brand?.logoSize);
  return Number.isFinite(v) && v > 0 ? Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, Math.round(v))) : LOGO_SIZE.default;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const LIGHT_TEXT = "#FFFFFF", DARK_TEXT = "#16191F";

/** White or near-black, whichever contrasts more with the color (WCAG relative luminance). */
export function readableOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(color.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0685 ? LIGHT_TEXT : DARK_TEXT;
}

/** Sobrescribe las variables de color del tema con el color de marca del estudio. */
export function brandStyle(s: StudySettings): Record<string, string> {
  const hex = (v?: string) => (v && HEX.test(v) ? v : undefined);
  const c = hex(s.brand?.color), button = hex(s.brand?.button), text = s.brand?.buttonText;
  const out: Record<string, string> = {};
  if (button) out["--rk-btn"] = button;
  if (text === "light" || text === "dark") out["--rk-on-btn"] = text === "light" ? LIGHT_TEXT : DARK_TEXT;
  else if (button) out["--rk-on-btn"] = readableOn(button);
  if (!c) return out;
  return {
    ...out,
    "--color-accent": c,
    "--color-on-accent": "#FFFFFF",
    // Mixed with the theme's own surface and ink, so the tint stays dark in dark mode and text on it stays readable.
    "--color-accent-soft": `color-mix(in srgb, ${c} 12%, var(--color-surface))`,
    "--color-accent-ink": `color-mix(in srgb, ${c} 75%, var(--color-ink))`,
  };
}
