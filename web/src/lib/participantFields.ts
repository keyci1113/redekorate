// URL parameters saved with a session (?pid=…&email=…), shown as labeled fields with contact data masked.
import { t } from "./i18n";

export interface ParticipantField { key: string; label: string; value: string; masked: string; sensitive: boolean }

const EMAIL_KEY = /e-?mail|correo/i;
const PHONE_KEY = /phone|tel|cel|movil|móvil|whatsapp|mobile/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "ana@example.com" → "a•••@example.com". */
export function maskEmail(v: string): string {
  const at = v.lastIndexOf("@");
  if (at < 1) return "••••";
  return `${v[0]}•••${v.slice(at)}`;
}

/** "+1 555 0100" → "•••• 0100": only the last four digits stay. */
export function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

const LABELS = (): Record<string, string> => ({
  pid: t("ID de participante"), id: t("ID de participante"), participant: t("ID de participante"),
  name: t("Nombre"), nombre: t("Nombre"),
  email: t("Correo"), correo: t("Correo"),
  phone: t("Teléfono"), tel: t("Teléfono"), telefono: t("Teléfono"), "teléfono": t("Teléfono"),
  source: t("Origen"), utm_source: t("Origen"), origen: t("Origen"),
  consent: t("Consentimiento"),
});

/** The session's parameters as labeled fields, preview flag left out. Email and phone values come masked. */
export function participantFields(params: Record<string, string> | null | undefined): ParticipantField[] {
  return Object.entries(params ?? {}).filter(([k]) => k !== "preview").map(([key, value]) => {
    const email = EMAIL_KEY.test(key) || EMAIL_VALUE.test(value);
    const phone = !email && PHONE_KEY.test(key);
    const label = LABELS()[key.toLowerCase()] ?? key;
    const shown = key === "consent" && value === "aceptado" ? t("Aceptado") : value;
    return { key, label, value: shown, masked: email ? maskEmail(value) : phone ? maskPhone(value) : shown, sensitive: email || phone };
  });
}
