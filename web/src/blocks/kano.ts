// Modelo Kano: tabla de evaluación funcional × disfuncional
// Respuestas: 1 Me agrada · 2 Lo espero así · 3 Me da igual · 4 Puedo tolerarlo · 5 Me disgusta
export type KanoCat = "A" | "O" | "M" | "I" | "R" | "Q";
export interface KanoAnswer { f: number; d: number; imp?: number }
export type KanoValue = Record<string, KanoAnswer>;

const TABLE: KanoCat[][] = [
  ["Q", "A", "A", "A", "O"],
  ["R", "I", "I", "I", "M"],
  ["R", "I", "I", "I", "M"],
  ["R", "I", "I", "I", "M"],
  ["R", "R", "R", "R", "Q"],
];
export const classify = (f: number, d: number): KanoCat => TABLE[f - 1][d - 1];

export const KANO_ANSWERS = ["Me agrada", "Lo espero así", "Me da igual", "Puedo tolerarlo", "Me disgusta"];
export const KANO_NAMES: Record<KanoCat, string> = {
  A: "Atractiva", O: "Unidimensional", M: "Obligatoria", I: "Indiferente", R: "Inversa", Q: "Cuestionable",
};
export const KANO_HELP: Record<KanoCat, string> = {
  A: "Sorprende y deleita; su ausencia no molesta.",
  O: "Más es mejor: satisface si está y molesta si falta.",
  M: "Se da por hecho: si falta, genera mucha insatisfacción.",
  I: "No cambia la satisfacción; no vale la pena priorizarla.",
  R: "Una parte de los usuarios preferiría que no existiera.",
  Q: "Respuestas contradictorias; revisa la redacción.",
};
export const KANO_COLOR: Record<KanoCat, string> = { A: "#16A34A", O: "#7C3AED", M: "#DC2626", I: "#64748B", R: "#EA580C", Q: "#A3A3A3" };

export function kanoSummary(featureIds: string[], values: KanoValue[]) {
  return featureIds.map((id) => {
    const c: Record<KanoCat, number> = { A: 0, O: 0, M: 0, I: 0, R: 0, Q: 0 };
    const imp: number[] = [];
    for (const v of values) { const a = v?.[id]; if (!a?.f || !a?.d) continue; c[classify(a.f, a.d)]++; if (a.imp) imp.push(a.imp); }
    const base = c.A + c.O + c.M + c.I;
    const n = Object.values(c).reduce((x, y) => x + y, 0);
    const cat = (Object.keys(c) as KanoCat[]).reduce((best, k) => (c[k] > c[best] ? k : best), "I" as KanoCat);
    return {
      id, counts: c, n, category: n ? cat : null,
      better: base ? (c.A + c.O) / base : 0,          // coeficiente de satisfacción
      worse: base ? -(c.O + c.M) / base : 0,          // coeficiente de insatisfacción
      importance: imp.length ? imp.reduce((x, y) => x + y, 0) / imp.length : null,
    };
  });
}
