// Text helpers for My work, kept apart from the page so the plural forms can be tested.
import { getLang, tr, type Lang, type PluralForms } from "./i18n";

const numberLocale = (lang: Lang) => (lang === "en" ? "en-US" : "es");

/** plural() for an explicit language (plural() itself always uses the interface language). */
function pluralIn(lang: Lang, n: number, forms: PluralForms) {
  const rule = new Intl.PluralRules(numberLocale(lang)).select(n);
  return tr(forms[rule] ?? forms.other, lang, { n: new Intl.NumberFormat(numberLocale(lang)).format(n) });
}

/** "1 ticket abierto asignado a ti en 1 proyecto" / "3 tickets abiertos asignados a ti en 2 proyectos". */
export function assignedSummary(open: number, projects: number, lang: Lang = getLang()) {
  return tr("{a} en {b}", lang, {
    a: pluralIn(lang, open, { one: "{n} ticket abierto asignado a ti", other: "{n} tickets abiertos asignados a ti" }),
    b: pluralIn(lang, projects, { one: "{n} proyecto", other: "{n} proyectos" }),
  });
}
