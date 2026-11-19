// Records what a participant does on screen during a study session and sends it in small pieces.
// It records the page (structure, clicks, scrolling), not video, and never what is typed: inputs are masked.
import type { eventWithTime } from "rrweb";

const FLUSH_MS = 4000;
const MAX_MINUTES = 20;
const MAX_CHUNK_CHARS = 900_000;   // the server takes 2 MB per request

export interface Recorder { flush: () => Promise<void>; stop: () => Promise<void> }

/** Splits events into pieces small enough to send. An event too big to send alone is dropped. */
export function chunks<T>(events: T[], size = (e: T) => JSON.stringify(e).length, max = MAX_CHUNK_CHARS): T[][] {
  const out: T[][] = []; let cur: T[] = [], n = 0;
  for (const e of events) {
    const s = size(e);
    if (s > max * 2) continue;
    if (cur.length && n + s > max) { out.push(cur); cur = []; n = 0; }
    cur.push(e); n += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

export async function startRecording(sessionId: string): Promise<Recorder> {
  const { record } = await import("rrweb");
  let buffer: eventWithTime[] = [], seq = 0, sending: Promise<void> = Promise.resolve(), dead = false;
  const send = (events: eventWithTime[], keepalive = false) => fetch(`/api/public/sessions/${sessionId}/recording`, {
    method: "POST", keepalive, headers: { "content-type": "application/json", "x-requested-with": "redekorate" }, body: JSON.stringify({ seq: seq++, events }),
  }).then((r) => { if (r.status === 403 || r.status === 409 || r.status === 413) dead = true; }).catch(() => { /* a lost piece must never interrupt the study */ });

  const flush = () => {
    if (dead || !buffer.length) return sending;
    const batch = buffer; buffer = [];
    for (const c of chunks(batch)) sending = sending.then(() => send(c));
    return sending;
  };
  const stopRecord = record({
    emit: (e) => { if (!dead) buffer.push(e); },
    maskAllInputs: true,
    blockSelector: "[data-rk-private]",
    sampling: { mousemove: 50, scroll: 150, input: "last" },
    inlineStylesheet: true,
  });
  const timer = window.setInterval(flush, FLUSH_MS);
  const limit = window.setTimeout(() => void stop(), MAX_MINUTES * 60_000);
  // Closing the tab: send what is left in a request the browser finishes on its own (those are limited to 64 KB).
  const onHide = () => { if (dead || !buffer.length) return; const batch = buffer; buffer = []; if (JSON.stringify(batch).length < 60_000) void send(batch, true); };
  window.addEventListener("pagehide", onHide);

  async function stop() {
    window.clearInterval(timer); window.clearTimeout(limit); window.removeEventListener("pagehide", onHide);
    stopRecord?.();
    await flush();
    dead = true;
  }
  return { flush: () => flush(), stop };
}
