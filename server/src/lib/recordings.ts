// Session recordings: limits, the checks on what a participant's browser sends, and clean-up.
import { gunzipSync, gzipSync } from "node:zlib";
import { query } from "./db.js";

/** A recording stops being accepted past these: a study session is minutes long, not hours. */
export const MAX_CHUNKS = 400;
export const MAX_BYTES = 20 * 1024 * 1024;       // compressed, per session
export const MAX_EVENTS_PER_CHUNK = 5000;
/** A participant's last events may arrive just after the session was marked complete. */
export const GRACE_MS = 2 * 60 * 1000;

/** Recording is off unless the study turned it on. */
export const recordingOn = (settings: unknown) => (settings as { recording?: unknown } | null)?.recording === true;

export interface RecordedEvent { type: number; timestamp: number; data?: unknown }
/** The recorder's events are objects with a numeric type and a time; anything else is rejected whole. */
export function validEvents(events: unknown): events is RecordedEvent[] {
  return Array.isArray(events) && events.length > 0 && events.length <= MAX_EVENTS_PER_CHUNK
    && events.every((e) => !!e && typeof e === "object" && Number.isInteger((e as RecordedEvent).type) && Number.isFinite((e as RecordedEvent).timestamp));
}

export function span(events: RecordedEvent[]) {
  let first = Infinity, last = -Infinity;
  for (const e of events) { if (e.timestamp < first) first = e.timestamp; if (e.timestamp > last) last = e.timestamp; }
  return { first, last };
}

export const pack = (events: RecordedEvent[]) => gzipSync(JSON.stringify(events));
/** The events of a chunk as JSON text without the surrounding brackets, so chunks can be joined without parsing them. */
export const unpackInner = (data: Buffer) => gunzipSync(data).toString("utf8").slice(1, -1);

/** Recordings are kept for a limited time (90 days unless RECORDING_RETENTION_DAYS says otherwise; 0 keeps them forever). */
export const retentionDays = () => { const n = Number(process.env.RECORDING_RETENTION_DAYS ?? 90); return Number.isFinite(n) && n >= 0 ? n : 90; };
export async function purgeOldRecordings(days = retentionDays()) {
  if (!days) return 0;
  const rows = await query("delete from session_recordings where created_at < now() - ($1 || ' days')::interval returning session_id", [String(days)]);
  return rows.length;
}
