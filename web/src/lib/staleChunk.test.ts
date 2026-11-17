import { describe, expect, it, vi } from "vitest";
import { isStaleChunkError, reloadOnce } from "./staleChunk";

describe("isStaleChunkError", () => {
  it("recognises each browser's failed page-file message", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/DashboardPage-abc.js"))).toBe(true);  // Chrome
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module: https://x/assets/a.js"))).toBe(true);  // Firefox
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);  // Safari
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/a.css"))).toBe(true);  // Vite
  });
  it("leaves real bugs alone", () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("reloadOnce", () => {
  it("reloads, then not again within 30 seconds, then again after", () => {
    const reload = vi.fn();
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(reloadOnce(1_000_000, reload, store)).toBe(true);
    expect(reloadOnce(1_010_000, reload, store)).toBe(false);
    expect(reloadOnce(1_040_001, reload, store)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
