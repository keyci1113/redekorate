/**
 * After a deploy the old build's page files are gone. A tab that was open before it still asks for them
 * when the user moves to a page it has not loaded yet, the request fails, and the page cannot render.
 * Reloading picks up the new build, so that is what we do, once, before showing an error.
 */
const KEY = "rk-stale-reload";
const WINDOW_MS = 30_000;

/** True for the errors browsers and Vite raise when a page file (a lazily loaded chunk) cannot be loaded. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk \S+ failed/i.test(msg);
}

/**
 * Reloads the page unless it already did so in the last 30 seconds (then the file is really missing,
 * and reloading again would loop). Returns whether it reloaded.
 */
type Store = Pick<Storage, "getItem" | "setItem">;
export function reloadOnce(now = Date.now(), reload = () => window.location.reload(), store?: Store): boolean {
  let last = 0;
  try { last = Number((store ?? sessionStorage).getItem(KEY) ?? 0); } catch { /* storage blocked */ }
  if (now - last < WINDOW_MS) return false;
  try { (store ?? sessionStorage).setItem(KEY, String(now)); } catch { /* storage blocked: still reload; worst case one extra reload */ }
  reload();
  return true;
}

/** Vite fires vite:preloadError when a page file or its CSS fails to load: reload instead of breaking. */
export function listenForStaleChunks() {
  window.addEventListener("vite:preloadError", (e) => { if (reloadOnce()) e.preventDefault(); });
}
