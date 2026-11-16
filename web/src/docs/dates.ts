// Days picked on a document's date field. They are kept as ISO days ("2026-10-01"), sorted and unique,
// and shown as runs: consecutive days collapse into a range, so "Oct 1 – 3, Oct 8, 2026".

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };

/** The stored list ("2026-10-01,2026-10-02") as clean ISO days. Anything that is not a day is dropped. */
export const parseDays = (s: string | undefined): string[] => [...new Set((s ?? "").split(",").map((x) => x.trim()).filter((x) => ISO.test(x)))].sort();
export const joinDays = (days: string[]) => [...new Set(days)].sort().join(",");

/** Adds the day, or takes it out if it was already there. */
export const toggleDay = (days: string[], iso: string) => days.includes(iso) ? days.filter((d) => d !== iso) : [...days, iso].sort();

/** Every day from a to b (either order) added to the selection. */
export function addRange(days: string[], a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out = new Set(days);
  for (let d = from; d <= to; d = addDays(d, 1)) out.add(d);
  return [...out].sort();
}

/** Consecutive days grouped as [first, last]. */
export function runs(days: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const d of parseDays(days.join(","))) {
    const last = out[out.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d; else out.push([d, d]);
  }
  return out;
}

/** "Oct 1 – 3, Oct 8, 2026" in the document's language; the year is written once when all days share it. */
export function formatDays(days: string[], locale: string): string {
  const rs = runs(days);
  if (!rs.length) return "";
  const oneYear = rs[0][0].slice(0, 4) === rs[rs.length - 1][1].slice(0, 4);
  return rs.map(([a, b], i) => {
    const withYear = !oneYear || i === rs.length - 1;
    const f = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
    return a === b ? f.format(toDate(a)) : f.formatRange(toDate(a), toDate(b));
  }).join(", ");
}

/** The weeks of a month as ISO days (null outside the month), starting on Monday or Sunday. */
export function monthGrid(year: number, month: number, weekStartsMonday: boolean): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + (weekStartsMonday ? 6 : 0)) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => isoOf(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}
