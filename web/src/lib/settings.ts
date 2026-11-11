import { tc } from "./i18n";
import type { Prototype } from "../blocks/prototype";

import type { Lang } from "./i18n";

export interface StudySettings {
  language?: Lang;          // idioma que verán los participantes
  prototypes?: Prototype[];
  brand?: { color?: string; logo?: string | null };
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

/** Sobrescribe las variables de color del tema con el color de marca del estudio. */
export function brandStyle(s: StudySettings): Record<string, string> {
  const c = s.brand?.color;
  if (!c || !/^#[0-9a-fA-F]{6}$/.test(c)) return {};
  return {
    "--color-accent": c,
    "--color-on-accent": "#FFFFFF",
    "--color-accent-soft": `color-mix(in srgb, ${c} 11%, white)`,
    "--color-accent-ink": `color-mix(in srgb, ${c} 75%, black)`,
  };
}
