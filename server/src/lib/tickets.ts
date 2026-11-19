// Pure ticket helpers: no database, no HTTP, so they can be tested on their own.

export const TICKET_TYPES = ["task", "bug", "research_request", "design_change"] as const;
export const TICKET_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;
export const TICKET_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * People mentioned in a comment as "@Full Name". Longer names are matched first so
 * "@Ana Ríos" does not also count as a mention of someone called "Ana".
 */
export function mentionedIds(body: string, people: { id: string; name: string }[]): string[] {
  let text = fold(body);
  const found: string[] = [];
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const needle = "@" + fold(p.name.trim());
    if (needle.length < 2) continue;
    let at = text.indexOf(needle), hit = false;
    while (at !== -1) {
      const next = text[at + needle.length];
      if (next === undefined || !/[\p{L}\p{N}]/u.test(next)) { hit = true; text = text.slice(0, at) + " ".repeat(needle.length) + text.slice(at + needle.length); }
      at = text.indexOf(needle, at + needle.length);
    }
    if (hit) found.push(p.id);
  }
  return found;
}

/** Normalized labels: trimmed, no duplicates (case-insensitive), at most `max`. */
export function cleanLabels(labels: string[], max = 20): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of labels) {
    const l = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!l || seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase()); out.push(l);
    if (out.length === max) break;
  }
  return out;
}

/** What changed between two sets of ids or labels. */
export function setDiff<T>(prev: T[], next: T[]): { added: T[]; removed: T[] } {
  const a = new Set(prev), b = new Set(next);
  return { added: next.filter((x) => !a.has(x)), removed: prev.filter((x) => !b.has(x)) };
}

/** New order of a board column after `moved` is dropped before `before` (null = at the end). */
export function reorder<T>(order: T[], moved: T, before: T | null): T[] {
  const rest = order.filter((x) => x !== moved);
  const at = before === null ? -1 : rest.indexOf(before);
  if (at === -1) return [...rest, moved];
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

const STOP = new Set(["the", "and", "for", "with", "que", "con", "los", "las", "del", "por", "una", "uno", "cuando", "hay", "when", "not", "does"]);
// Words are compared by their first five letters, a crude stem that makes "total" match "totales" and "coincide" match "coinciden".
const words = (s: string) => new Set(fold(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)));

/** Share of meaningful title words two tickets have in common (0–1, Jaccard). */
export function titleSimilarity(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** The other ticket whose title looks most like this one, when it is similar enough to suggest a merge. */
export function mostSimilar<T extends { id: string; title: string }>(ticket: { id: string; title: string }, others: T[], min = 0.4): T | null {
  let best: T | null = null, score = min;
  for (const o of others) {
    if (o.id === ticket.id) continue;
    const s = titleSimilarity(ticket.title, o.title);
    if (s >= score) { best = o; score = s; }
  }
  return best;
}

/** The severity an insight made from a ticket starts with: the ticket's priority, with urgent meaning critical. */
export const severityFromPriority = (p: TicketPriority): "critical" | "high" | "medium" | "low" =>
  ({ urgent: "critical", high: "high", medium: "medium", low: "low" } as const)[p] ?? "medium";
