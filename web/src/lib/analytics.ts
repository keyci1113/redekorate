import { t } from "./i18n";
import type { Block, CardSortValue, ChoiceBlock, ChoiceValue } from "../blocks/types";
import type { Answer, Session } from "./types";

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function overview(sessions: Session[]) {
  const completed = sessions.filter((s) => s.completed_at);
  const durations = completed.map((s) => new Date(s.completed_at!).getTime() - new Date(s.started_at).getTime());
  return {
    started: sessions.length,
    completed: completed.length,
    completionRate: sessions.length ? completed.length / sessions.length : 0,
    medianMs: median(durations),
  };
}

/** Agrupa respuestas por bloque (solo de sesiones completadas, si includePartial=false). */
export function answersByBlock(answers: Answer[], sessions: Session[], includePartial = false) {
  const ok = new Set(sessions.filter((s) => includePartial || s.completed_at).map((s) => s.id));
  const map = new Map<string, Answer[]>();
  for (const a of answers) {
    if (!ok.has(a.session_id)) continue;
    (map.get(a.block_id) ?? map.set(a.block_id, []).get(a.block_id)!).push(a);
  }
  return map;
}

// ── SUS ────────────────────────────────────────────────────────
export function susScore(v: number[]) {
  let sum = 0;
  v.forEach((x, i) => (sum += i % 2 === 0 ? x - 1 : 5 - x));
  return sum * 2.5;
}
export function susGrade(score: number) {
  // Escala de Sauro-Lewis (curved grading scale)
  if (score >= 84.1) return { grade: "A+", adjective: t("Excelente") };
  if (score >= 80.8) return { grade: "A", adjective: t("Excelente") };
  if (score >= 78.9) return { grade: "A-", adjective: t("Muy buena") };
  if (score >= 77.2) return { grade: "B+", adjective: t("Buena") };
  if (score >= 74.1) return { grade: "B", adjective: t("Buena") };
  if (score >= 72.6) return { grade: "B-", adjective: t("Buena") };
  if (score >= 71.1) return { grade: "C+", adjective: t("Aceptable") };
  if (score >= 65) return { grade: "C", adjective: t("Aceptable") };
  if (score >= 62.7) return { grade: "C-", adjective: t("Aceptable") };
  if (score >= 51.7) return { grade: "D", adjective: t("Pobre") };
  return { grade: "F", adjective: t("Inaceptable") };
}

// ── NPS ────────────────────────────────────────────────────────
export function nps(values: number[]) {
  const n = values.length;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const passives = n - promoters - detractors;
  return { n, promoters, passives, detractors, score: n ? Math.round(((promoters - detractors) / n) * 100) : 0 };
}

// ── Opción múltiple ───────────────────────────────────────────
export function choiceCounts(block: ChoiceBlock, values: ChoiceValue[]) {
  const counts = new Map<string, number>();
  const others: string[] = [];
  for (const v of values) {
    for (const id of v.selected ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (v.selected?.includes("__other") && v.other) others.push(v.other);
  }
  const options = [...block.options, ...(block.allowOther ? [{ id: "__other", label: t("Otro") }] : [])];
  return { rows: options.map((o) => ({ ...o, count: counts.get(o.id) ?? 0 })).sort((a, b) => b.count - a.count), others, n: values.length };
}

// ── Escala ─────────────────────────────────────────────────────
export function distribution(min: number, max: number, values: number[]) {
  return Array.from({ length: max - min + 1 }, (_, i) => {
    const n = min + i;
    return { value: n, count: values.filter((v) => v === n).length };
  });
}

export const answeredBlocks = (blocks: Block[]) => blocks.filter((b) => !["welcome", "context", "thank_you"].includes(b.type));

// ── Ranking: posición promedio (1 = primero) ───────────────────
export function rankingSummary(items: { id: string; label: string }[], values: string[][]) {
  return items.map((it) => {
    const pos = values.map((v) => v.indexOf(it.id)).filter((p) => p >= 0).map((p) => p + 1);
    const firsts = pos.filter((p) => p === 1).length;
    return { ...it, avg: mean(pos), firsts };
  }).sort((a, b) => a.avg - b.avg);
}

// ── Card sorting ───────────────────────────────────────────────
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function cardSortSummary(cards: { id: string; label: string }[], values: CardSortValue[]) {
  const n = values.length;
  // Por tarjeta: en qué categoría (por nombre normalizado) la pusieron
  const perCard = cards.map((c) => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const v of values) {
      const g = v.groups.find((g) => g.cardIds.includes(c.id));
      if (!g) continue;
      const k = norm(g.name || t("(sin nombre)"));
      const cur = counts.get(k) ?? { name: g.name || t("(sin nombre)"), count: 0 };
      cur.count++; counts.set(k, cur);
    }
    const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
    return { ...c, top: ranked[0], all: ranked, agreement: n && ranked[0] ? ranked[0].count / n : 0 };
  });
  // Matriz de similitud: % de participantes que pusieron ambas tarjetas en el mismo grupo
  const idx = new Map(cards.map((c, i) => [c.id, i]));
  const m = cards.map(() => cards.map(() => 0));
  for (const v of values) for (const g of v.groups) {
    for (const a of g.cardIds) for (const b of g.cardIds) {
      const i = idx.get(a), j = idx.get(b);
      if (i !== undefined && j !== undefined && i !== j) m[i][j]++;
    }
  }
  const sim = m.map((row) => row.map((x) => (n ? x / n : 0)));
  // Orden por clustering simple (vecino más cercano) para que los grupos se vean juntos
  const order: number[] = [];
  const left = new Set(cards.map((_, i) => i));
  let cur = perCard.reduce((best, c, i) => (c.agreement > perCard[best].agreement ? i : best), 0);
  while (left.size) {
    order.push(cur); left.delete(cur);
    let nxt = -1, bestS = -1;
    for (const j of left) if (sim[cur][j] > bestS) { bestS = sim[cur][j]; nxt = j; }
    if (nxt < 0) break; cur = nxt;
  }
  // Categorías creadas/usadas (con cuántas personas)
  const cats = new Map<string, { name: string; people: number }>();
  for (const v of values) {
    const seen = new Set<string>();
    for (const g of v.groups) { if (!g.cardIds.length) continue; const k = norm(g.name || t("(sin nombre)")); if (seen.has(k)) continue; seen.add(k);
      const c = cats.get(k) ?? { name: g.name || t("(sin nombre)"), people: 0 }; c.people++; cats.set(k, c); }
  }
  const avgGroups = mean(values.map((v) => v.groups.filter((g) => g.cardIds.length).length));
  return { perCard: perCard.sort((a, b) => b.agreement - a.agreement), sim, order, categories: [...cats.values()].sort((a, b) => b.people - a.people), avgGroups, n };
}
