/**
 * Personal data people type into free text (study answers): removed before it reaches an AI app.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 7+ digits with the usual separators, optionally with a leading +: phone numbers, not scores or years. */
const PHONE = /(?<![\w.])\+?\d(?:[\s().-]{0,2}\d){6,}(?![\w.])/g;
/** Dates and decimal numbers look like phone numbers to PHONE; they stay. */
const NOT_A_PHONE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d+\.\d+)$/;

/** Emails and phone numbers people wrote into free text, replaced: they are personal data the team did not ask for. */
export function redactContacts<T>(v: T): T {
  if (typeof v === "string") return v.replace(EMAIL, "[email removed]").replace(PHONE, (m) => NOT_A_PHONE.test(m) ? m : "[phone removed]") as T;
  if (Array.isArray(v)) return v.map(redactContacts) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactContacts(x)])) as T;
  return v;
}
