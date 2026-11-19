import { afterEach, describe, expect, it, vi } from "vitest";
import { briefIsEmpty, daysUntil, firstName, greeting, groupMyDay, longDate, readBriefOpen, writeBriefOpen, type Brief } from "./brief";

describe("daily brief helpers", () => {
  it("greets by the time of day", () => {
    expect(greeting(6)).toBe("Buenos días, {a}");
    expect(greeting(11)).toBe("Buenos días, {a}");
    expect(greeting(12)).toBe("Buenas tardes, {a}");
    expect(greeting(18)).toBe("Buenas tardes, {a}");
    expect(greeting(19)).toBe("Buenas noches, {a}");
    expect(greeting(0)).toBe("Buenos días, {a}");
  });

  it("takes the first name", () => {
    expect(firstName("Mara Díaz López")).toBe("Mara");
    expect(firstName("  Ana ")).toBe("Ana");
    expect(firstName(null)).toBe("");
  });

  it("writes today's date in the app language", () => {
    const d = new Date(2026, 10, 19, 9);
    expect(longDate(d, "es")).toBe("jueves, 19 de noviembre");
    expect(longDate(d, "en-US")).toBe("Thursday, November 19");
  });

  it("groups My day as overdue, today, this week and drops empty groups", () => {
    const t = (n: number, bucket: "overdue" | "today" | "week") => ({ n, bucket });
    expect(groupMyDay([t(1, "week"), t(2, "overdue"), t(3, "week"), t(4, "overdue")])).toEqual([
      { bucket: "overdue", items: [t(2, "overdue"), t(4, "overdue")] },
      { bucket: "week", items: [t(1, "week"), t(3, "week")] },
    ]);
    expect(groupMyDay([])).toEqual([]);
  });

  it("counts days to a due date", () => {
    expect(daysUntil("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysUntil("2026-11-22", "2026-11-19")).toBe(3);
    expect(daysUntil("2026-11-16", "2026-11-19")).toBe(-3);
    expect(daysUntil("2026-03-30", "2026-03-28")).toBe(2);   // across a DST change
  });

  it("knows when there is nothing at all", () => {
    const empty: Brief = {
      today: "2026-11-19", week_end: "2026-11-22", since: "", time_zone: "UTC", has_new: false,
      my_day: { tickets: [], total: 0, counts: { overdue: 0, today: 0, week: 0 } },
      news: { responses: [], insights: { items: [], total: 0 }, widget: { items: [], total: 0 }, assigned: { items: [], total: 0 }, mentions: { items: [], total: 0 } },
      live_studies: [], milestones: [],
    };
    expect(briefIsEmpty(empty)).toBe(true);
    expect(briefIsEmpty({ ...empty, news: { ...empty.news, mentions: { items: [], total: 1 } } })).toBe(false);
    expect(briefIsEmpty({ ...empty, live_studies: [{ id: "s", title: "S", project_id: "p", project_name: "P", responses: 0, today: 0 }] })).toBe(false);
  });

  describe("remembers open or closed", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("round-trips", () => {
      const store = new Map<string, string>();
      vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
      expect(readBriefOpen()).toBe(false);
      writeBriefOpen(true);
      expect(readBriefOpen()).toBe(true);
      writeBriefOpen(false);
      expect(readBriefOpen()).toBe(false);
    });
    it("survives blocked storage", () => {
      const blocked = () => { throw new Error("blocked"); };
      vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
      expect(() => writeBriefOpen(true)).not.toThrow();
      expect(readBriefOpen()).toBe(false);
    });
  });
});
