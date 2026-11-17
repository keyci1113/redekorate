// When the app is unreachable: during a deploy (the server restarts, the proxy answers 502/503/504 or the request
// fails) or while an admin has maintenance mode on (the API answers 503 with { maintenance: true }).
// api.ts reports what it sees here; MaintenanceScreen shows it and reloads once the app is back.

export type Down = { kind: "deploy" } | { kind: "maintenance"; message: string };
type Listener = (d: Down | null) => void;

let state: Down | null = null;
const listeners = new Set<Listener>();

export function getDown() { return state; }
export function setDown(d: Down | null) {
  // An explicit maintenance message wins over a generic "updating".
  if (d?.kind === "deploy" && state?.kind === "maintenance") return;
  state = d;
  listeners.forEach((l) => l(state));
}
export function onDown(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Pure: what a failed API response says about the app being down, or null for an ordinary error. */
export function downFromResponse(status: number, body: unknown, isJson: boolean): Down | null {
  const b = body as { maintenance?: boolean; message?: string } | null;
  if (status === 503 && b?.maintenance) return { kind: "maintenance", message: String(b.message ?? "") };
  // Our server always answers JSON; an HTML 502/503/504 comes from the proxy while the server restarts.
  if ((status === 502 || status === 503 || status === 504) && !isJson) return { kind: "deploy" };
  return null;
}
