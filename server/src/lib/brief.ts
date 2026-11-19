// Daily brief: the date rules, kept apart from the queries so they can be tested without a database.

export type DueBucket = "overdue" | "today" | "week";
const DAY = 86_400_000;
/** How far back "What's new" ever looks, and the window on a first open. */
export const SINCE_CAP_MS = 7 * DAY;
export const FIRST_OPEN_MS = DAY;
/** At most this many tickets in "My day"; the rest are counted and left to My work. */
export const MY_DAY_LIMIT = 8;

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => toDay(new Date(toDate(day).getTime() + n * DAY));

/** The Sunday that closes the calendar week (Monday start) holding `today`. YYYY-MM-DD in, YYYY-MM-DD out. */
export function weekEnd(today: string): string {
  const dow = toDate(today).getUTCDay();   // 0 = Sunday
  return addDays(today, dow === 0 ? 0 : 7 - dow);
}

/** Where a due date falls for "My day": before today, today, later this week, or outside the brief (null). */
export function dueBucket(due: string | null | undefined, today: string): DueBucket | null {
  if (!due) return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  return due <= weekEnd(today) ? "week" : null;
}

/**
 * Where "What's new" starts. `asked` is the start the panel already used (a refresh keeps it); otherwise the last
 * time the person opened the brief, or the last 24 hours on a first open. Never more than 7 days back nor in the future.
 */
export function briefSince(seenAt: Date | null, now: Date, asked?: Date | null): Date {
  const floor = now.getTime() - SINCE_CAP_MS;
  const from = asked ?? seenAt ?? new Date(now.getTime() - FIRST_OPEN_MS);
  return new Date(Math.min(now.getTime(), Math.max(floor, from.getTime())));
}

/** A time zone name the runtime knows ("Europe/Madrid"), or UTC. */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}
