import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fast typing produces one call with the whole word", () => {
    const fn = vi.fn();
    const d = debounce(fn, 250);
    for (const v of ["p", "pa", "pag", "pago"]) { d(v); vi.advanceTimersByTime(40); }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("pago");
  });

  it("flush runs the pending call at once, cancel drops it", () => {
    const fn = vi.fn();
    const d = debounce(fn, 250);
    d("a"); d.flush();
    expect(fn).toHaveBeenCalledWith("a");
    d("b"); d.cancel(); vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
