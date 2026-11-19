import { describe, expect, it } from "vitest";
import { addRound, compare, defaultLists, duration, emptyTimeStudy, logTable, nextRow, normalize, roundInUse, roundOf, summarize, today, type TimeStudyData, type TSRow } from "./timeStudyModel";

const row = (p: Partial<TSRow>): TSRow => ({ id: Math.random().toString(36), person: "a", date: "2026-11-02", start: "", end: "", bucket: "", tool: "", other: "", ref: "", notes: "", ...p });

const study = (rows: TSRow[]): TimeStudyData => ({
  people: [{ id: "a", name: "Ana" }, { id: "b", name: "Luis" }],
  workdays: 5, keyLabel: "Product",
  buckets: [{ id: "call", name: "On a call", what: "" }, { id: "mail", name: "Email", what: "" }],
  tools: [{ id: "app", name: "Our app", key: true }, { id: "gm", name: "Gmail", key: false }],
  schedule: [], rows, rounds: [],
});

describe("duration", () => {
  it("is the minutes between start and end", () => {
    expect(duration({ start: "09:00", end: "09:08" })).toBe(8);
    expect(duration({ start: "9:30", end: "11:00" })).toBe(90);
  });
  it("is empty until both times are there and the end is after the start", () => {
    expect(duration({ start: "09:00", end: "" })).toBeNull();
    expect(duration({ start: "", end: "09:00" })).toBeNull();
    expect(duration({ start: "10:00", end: "09:00" })).toBeNull();
    expect(duration({ start: "10:00", end: "10:00" })).toBeNull();
  });
});

describe("summarize", () => {
  const d = study([
    // Ana, two days
    row({ person: "a", date: "2026-11-02", start: "09:00", end: "10:00", bucket: "call", tool: "app" }),
    row({ person: "a", date: "2026-11-02", start: "10:00", end: "10:30", bucket: "mail", tool: "gm" }),
    row({ person: "a", date: "2026-11-03", start: "09:00", end: "09:30", bucket: "mail", tool: "app" }),
    // Luis, one day, one row without a bucket
    row({ person: "b", date: "2026-11-04", start: "09:00", end: "11:00", bucket: "call", tool: "gm" }),
    row({ person: "b", date: "2026-11-04", start: "11:00", end: "11:15", bucket: "", tool: "" }),
    // not counted: no end time, no person
    row({ person: "a", date: "2026-11-03", start: "10:00", end: "" }),
    row({ person: "", date: "2026-11-03", start: "10:00", end: "11:00" }),
  ]);
  const s = summarize(d);

  it("counts days observed, hours logged and the average per day per person", () => {
    expect(s.people.map((p) => [p.person.name, p.days, p.hours, p.perDay])).toEqual([["Ana", 2, 2, 1], ["Luis", 1, 2.25, 2.25]]);
    expect(s.total.days).toBe(3);
    expect(s.total.hours).toBe(4.25);
    expect(s.rowsCounted).toBe(5);
    expect(s.rowsSkipped).toBe(2);
  });

  it("adds up key-tool hours from the main tool only, and scales them to a work week", () => {
    const ana = s.people[0];
    expect(ana.keyHours).toBe(1.5);
    expect(ana.keyPerWeek).toBe(3.75);            // 1.5 h over 2 days × 5 workdays
    expect(s.people[1].keyHours).toBe(0);
  });

  it("splits time by bucket with the share of logged time and a weekly estimate, plus a line for rows with no bucket", () => {
    const call = s.byBucket.find((l) => l.id === "call")!;
    expect(call.cells[0]).toEqual({ hours: 1, share: 0.5, perWeek: 2.5 });
    expect(call.cells[1]).toEqual({ hours: 2, share: 2 / 2.25, perWeek: 10 });
    const none = s.byBucket.at(-1)!;
    expect(none.id).toBe("");
    expect(none.cells[1].hours).toBe(0.25);
    // every logged minute lands in exactly one bucket line
    for (const [i, p] of s.people.entries()) expect(s.byBucket.reduce((a, l) => a + l.cells[i].hours, 0)).toBeCloseTo(p.hours);
  });

  it("splits time by main tool and marks the key tools", () => {
    expect(s.byTool.find((l) => l.id === "app")).toMatchObject({ key: true, total: { hours: 1.5 } });
    for (const [i, p] of s.people.entries()) expect(s.byTool.reduce((a, l) => a + l.cells[i].hours, 0)).toBeCloseTo(p.hours);
  });

  it("rescales weekly estimates with workdays per week", () => {
    expect(summarize({ ...d, workdays: 4 }).people[0].keyPerWeek).toBe(3);
  });

  it("never divides by zero on an empty study", () => {
    const e = summarize(emptyTimeStudy("en"));
    expect(e.people.every((p) => p.hours === 0 && p.perDay === 0 && p.keyPerWeek === 0)).toBe(true);
    expect(e.byBucket.every((l) => l.cells.every((c) => c.share === 0 && c.perWeek === 0))).toBe(true);
    expect(summarize(undefined).people).toEqual([]);
  });
});

describe("helpers", () => {
  it("starts with generic, editable lists in the document's language and one key tool", () => {
    const en = defaultLists("en"), es = defaultLists("es");
    expect(en.buckets.length).toBe(es.buckets.length);
    expect(en.buckets[0].name).not.toBe(es.buckets[0].name);
    expect(en.tools.filter((t) => t.key)).toHaveLength(1);
  });
  it("fills in missing fields of an older document", () => {
    expect(normalize({ rows: [] })).toMatchObject({ people: [], workdays: 5, buckets: [], tools: [], schedule: [] });
  });
  it("continues the day: a new row starts when the last one ended", () => {
    const d = study([row({ person: "b", date: "2026-11-04", start: "09:00", end: "09:20" })]);
    expect(nextRow(d)).toMatchObject({ person: "b", date: "2026-11-04", start: "09:20", end: "" });
    expect(nextRow(study([]))).toMatchObject({ person: "a", start: "" });
  });
  it("uses the local date, not UTC", () => {
    expect(today(new Date(2026, 10, 2, 23, 30))).toBe("2026-11-02");
  });
  it("exports the log with names, sorted by date and time", () => {
    const d = study([row({ date: "2026-11-03", start: "09:00", end: "09:30", bucket: "mail", tool: "gm", notes: "late" }), row({ date: "2026-11-02", start: "10:00", end: "10:05", bucket: "call", tool: "app" })]);
    expect(logTable(d)).toEqual([
      ["Ana", "2026-11-02", "10:00", "10:05", "5", "On a call", "Our app", "", "", ""],
      ["Ana", "2026-11-03", "09:00", "09:30", "30", "Email", "Gmail", "", "", "late"],
    ]);
  });
});

describe("rounds (before and after)", () => {
  const names = { first: "Before", next: "After" };
  const base = study([
    row({ person: "a", date: "2026-11-02", start: "09:00", end: "11:00", bucket: "mail", tool: "gm" }),
    row({ person: "a", date: "2026-11-02", start: "11:00", end: "12:00", bucket: "call", tool: "app" }),
  ]);

  it("the first new round keeps everything logged so far as the baseline", () => {
    const { data, round } = addRound(base, names);
    expect(data.rounds.map((r) => r.name)).toEqual(["Before", "After"]);
    expect(round).toBe(data.rounds[1].id);
    expect(data.rows.every((r) => roundOf(data, r) === data.rounds[0].id)).toBe(true);
    expect(roundInUse(data, data.rounds[0].id)).toBe(true);
    expect(roundInUse(data, round)).toBe(false);
    // a third round only appends
    const third = addRound(data, { first: "x", next: "Round 3" });
    expect(third.data.rounds.map((r) => r.name)).toEqual(["Before", "After", "Round 3"]);
  });

  it("rows with no round, or a removed one, count in the first round", () => {
    const { data } = addRound(base, names);
    const stray = { ...data, rows: [...data.rows, row({ start: "13:00", end: "14:00", round: "gone" })] };
    expect(roundOf(stray, stray.rows[2])).toBe(data.rounds[0].id);
    expect(roundOf(base, base.rows[0])).toBe("");
  });

  it("a summary can be limited to one round, and new rows follow the round being logged", () => {
    const { data, round } = addRound(base, names);
    const after = { ...data, rows: [...data.rows, row({ person: "a", date: "2026-12-01", start: "09:00", end: "10:00", bucket: "mail", tool: "app", round })] };
    expect(summarize(after, data.rounds[0].id).total.hours).toBe(3);
    expect(summarize(after, round).total.hours).toBe(1);
    expect(summarize(after).total.hours).toBe(4);
    expect(nextRow(after, round)).toMatchObject({ round, date: "2026-12-01", start: "10:00" });
    expect(nextRow(after, data.rounds[0].id)).toMatchObject({ round: data.rounds[0].id, start: "12:00" });
  });

  it("compares hours per person per week, so rounds of different lengths line up", () => {
    const { data, round } = addRound(base, names);
    // After: two days observed, an hour of email each day and two hours in the app
    const after = { ...data, rows: [...data.rows,
      row({ person: "a", date: "2026-12-01", start: "09:00", end: "10:00", bucket: "mail", tool: "gm", round }),
      row({ person: "a", date: "2026-12-01", start: "10:00", end: "12:00", bucket: "call", tool: "app", round }),
      row({ person: "a", date: "2026-12-02", start: "09:00", end: "10:00", bucket: "mail", tool: "gm", round }),
      row({ person: "a", date: "2026-12-02", start: "10:00", end: "12:00", bucket: "call", tool: "app", round }),
    ] };
    const c = compare(after, data.rounds[0].id, round);
    const mail = c.byBucket.find((l) => l.id === "mail")!.delta;
    // before: 2 h on one day = 10 h/week; after: 1 h a day = 5 h/week
    expect(mail).toMatchObject({ before: 10, after: 5, change: -5, ratio: -0.5 });
    expect(c.keyPerWeek).toMatchObject({ before: 5, after: 10, change: 5, ratio: 1 });
    expect(c.perDay.change).toBe(0);
    expect(c.biggest?.id).toMatch(/mail|call/);
    expect(c.people).toEqual([{ person: { id: "a", name: "Ana" }, before: 5, after: 10 }]);
  });

  it("a bucket that starts from zero has no percentage change", () => {
    const { data, round } = addRound(base, names);
    const after = { ...data, rows: [...data.rows, row({ person: "a", date: "2026-12-01", start: "09:00", end: "10:00", bucket: "", tool: "app", round })] };
    const none = compare(after, data.rounds[0].id, round).byBucket.find((l) => l.id === "")!;
    expect(none.delta.before).toBe(0);
    expect(none.delta.ratio).toBeNull();
  });

  it("the log gets a round column only once there are two rounds", () => {
    expect(logTable(base)[0]).toHaveLength(10);
    const { data } = addRound(base, names);
    expect(logTable(data)[0]).toHaveLength(11);
    expect(logTable(data)[0][10]).toBe("Before");
  });
});
