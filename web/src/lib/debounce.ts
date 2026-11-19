// Waits for a pause before acting: a search box updates the URL once the person stops typing, not on every key.

export interface Debounced<A extends unknown[]> { (...args: A): void; flush: () => void; cancel: () => void }

/** `fn` runs `ms` after the last call, with that call's arguments. `flush` runs a pending call now; `cancel` drops it. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;
  const run = () => { timer = null; const a = last; last = null; if (a) fn(...a); };
  const d = ((...args: A) => { last = args; if (timer) clearTimeout(timer); timer = setTimeout(run, ms); }) as Debounced<A>;
  d.flush = () => { if (timer) clearTimeout(timer); run(); };
  d.cancel = () => { if (timer) clearTimeout(timer); timer = null; last = null; };
  return d;
}
