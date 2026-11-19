import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT, NONE, NO_FILTERS, allLabels, applyMention, boardColumns, filterCount, filterTickets, matchesDue, mentionOptions, mentionQuery,
  moveTicket, moveItem, columnOf, columnsProblem, looksLikeReviewAsDone, isStockColumnName, neighbours, placeOf, severityFromPriority, readView, selectAllState, sortTickets, splitMentions, toggleAll, toggleSort, writeView, type Column, type Person, type Ticket,
} from "./model";

const ana = { id: "ana", name: "Ana Ríos", avatar: null }, luis = { id: "luis", name: "Luis Mejía", avatar: null };
const base: Ticket = {
  id: "", number: 0, title: "", type: "task", status: "todo", priority: "medium", due_date: null, milestone_id: null, milestone: null,
  position: 0, source: "manual", created_at: "", updated_at: "", assignees: [], labels: [], from_insight: false, widget_ref: null,
};
const tk = (number: number, over: Partial<Ticket> = {}): Ticket => ({ ...base, id: `t${number}`, number, title: `Ticket ${number}`, position: number * 1024, ...over });
const TODAY = "2026-11-11";
const list = [
  tk(24, { title: "El total del cierre no coincide", type: "bug", priority: "high", due_date: "2026-11-18", assignees: [luis], labels: ["feedback"], widget_ref: "FB-1842", milestone_id: "m1", milestone: "Cierre de caja v2" }),
  tk(13, { title: "Totales del cierre", type: "bug", status: "in_progress", priority: "urgent", due_date: "2026-11-14", assignees: [luis], labels: ["POS"], milestone_id: "m1", milestone: "Cierre de caja v2" }),
  tk(12, { title: "Rediseñar el flujo de cierre", type: "design_change", status: "in_progress", priority: "high", due_date: "2026-11-20", assignees: [ana], labels: ["cierre de caja"], from_insight: true }),
  tk(9, { title: "Definir métricas", status: "done", due_date: "2026-11-06", labels: ["métricas"] }),
  tk(17, { title: "Revisar textos", priority: "low", due_date: null, assignees: [ana, luis], labels: ["copy"], milestone_id: "m2", milestone: "Onboarding" }),
];
const numbers = (ts: Ticket[]) => ts.map((t) => t.number);
const filter = (f: Partial<typeof NO_FILTERS>) => numbers(filterTickets(list, { ...NO_FILTERS, ...f }, TODAY)).sort((a, b) => a - b);

describe("filters", () => {
  it("no filters keeps everything", () => {
    expect(filter({})).toEqual([9, 12, 13, 17, 24]);
    expect(filterCount(NO_FILTERS)).toBe(0);
  });
  it("search matches title, number, label, assignee and widget reference without accents or case", () => {
    expect(filter({ q: "metricas" })).toEqual([9]);
    expect(filter({ q: "#13" })).toEqual([13]);
    expect(filter({ q: "LUIS" })).toEqual([13, 17, 24]);
    expect(filter({ q: "fb-1842" })).toEqual([24]);
    expect(filter({ q: "nada de esto" })).toEqual([]);
  });
  it("assignee matches any of the chosen people, and 'none' means unassigned", () => {
    expect(filter({ assignee: ["ana"] })).toEqual([12, 17]);
    expect(filter({ assignee: [NONE] })).toEqual([9]);
    expect(filter({ assignee: ["ana", NONE] })).toEqual([9, 12, 17]);
  });
  it("type, priority and label combine with AND between filters and OR inside one", () => {
    expect(filter({ type: ["bug"] })).toEqual([13, 24]);
    expect(filter({ type: ["bug"], priority: ["urgent"] })).toEqual([13]);
    expect(filter({ priority: ["urgent", "low"] })).toEqual([13, 17]);
    expect(filter({ label: ["POS", "copy"] })).toEqual([13, 17]);
  });
  it("due date buckets are relative to today", () => {
    expect(filter({ due: "overdue" })).toEqual([9]);
    expect(filter({ due: "week" })).toEqual([13, 24]);
    expect(filter({ due: "month" })).toEqual([12, 13, 24]);
    expect(filter({ due: "none" })).toEqual([17]);
    expect(matchesDue("2026-11-11", "week", TODAY)).toBe(true);
    expect(matchesDue("2026-11-18", "week", TODAY)).toBe(true);
    expect(matchesDue("2026-11-19", "week", TODAY)).toBe(false);
  });
  it("milestone filters by id, and 'none' means no milestone", () => {
    expect(filter({ milestone: "m1" })).toEqual([13, 24]);
    expect(filter({ milestone: NONE })).toEqual([9, 12]);
  });
  it("counts each chosen value", () => {
    expect(filterCount({ ...NO_FILTERS, q: " x ", type: ["bug", "task"], due: "week" })).toBe(4);
  });
});

describe("sorting", () => {
  const sorted = (key: Parameters<typeof toggleSort>[1], dir: "asc" | "desc" = "asc") => numbers(sortTickets(list, { key, dir }));
  it("defaults to due date, soonest first, with undated tickets last", () => {
    expect(numbers(sortTickets(list, DEFAULT_SORT))).toEqual([9, 13, 24, 12, 17]);
  });
  it("keeps undated tickets last when the direction flips", () => {
    expect(sorted("due", "desc")).toEqual([12, 24, 13, 9, 17]);
  });
  it("sorts priority from most to least urgent and status in board order", () => {
    expect(sorted("priority")).toEqual([13, 12, 24, 9, 17]);
    expect(sorted("status")).toEqual([17, 24, 12, 13, 9]);
  });
  it("sorts by number, title, assignee, milestone and labels", () => {
    expect(sorted("number", "desc")).toEqual([24, 17, 13, 12, 9]);
    expect(sorted("title")).toEqual([9, 24, 12, 17, 13]);
    expect(sorted("assignee")).toEqual([12, 17, 13, 24, 9]);
    expect(sorted("milestone")).toEqual([13, 24, 17, 9, 12]);
    expect(sorted("labels")).toEqual([12, 17, 24, 9, 13]);
  });
  it("does not change the original list", () => {
    const before = numbers(list);
    sortTickets(list, { key: "number", dir: "asc" });
    expect(numbers(list)).toEqual(before);
  });
  it("a header click flips the same column and starts another one ascending", () => {
    expect(toggleSort({ key: "due", dir: "asc" }, "due")).toEqual({ key: "due", dir: "desc" });
    expect(toggleSort({ key: "due", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
  });
});

describe("board", () => {
  it("groups by status in position order", () => {
    const cols = boardColumns(list);
    expect(numbers(cols.todo)).toEqual([17, 24]);
    expect(numbers(cols.in_progress)).toEqual([12, 13]);
    expect(numbers(cols.in_review)).toEqual([]);
  });
  it("a dropped card lands above the target and takes the column's status", () => {
    const moved = moveTicket(list, 24, "in_progress", 13);
    expect(numbers(boardColumns(moved).in_progress)).toEqual([12, 24, 13]);
    expect(numbers(boardColumns(moved).todo)).toEqual([17]);
    expect(moved.find((t) => t.number === 24)!.status).toBe("in_progress");
  });
  it("a card dropped on the column itself goes to the end, and an unknown card changes nothing", () => {
    expect(numbers(boardColumns(moveTicket(list, 12, "done", null)).done)).toEqual([9, 12]);
    expect(moveTicket(list, 999, "done", null)).toBe(list);
  });
  it("remembers where a card was so a move can be undone", () => {
    expect(placeOf(list, 12)).toEqual({ column: "in_progress", before: 13 });
    expect(placeOf(list, 24)).toEqual({ column: "todo", before: null });
    const moved = moveTicket(list, 12, "done", null);
    const back = placeOf(list, 12)!;
    expect(numbers(boardColumns(moveTicket(moved, 12, back.column, back.before)).in_progress)).toEqual([12, 13]);
    expect(placeOf(list, 999)).toBeNull();
  });
  it("recognizes the stock column names in both languages, and only for their own status", () => {
    expect(isStockColumnName("Por hacer", "todo")).toBe(true);
    expect(isStockColumnName("In review", "in_review")).toBe(true);
    expect(isStockColumnName(" hecho ", "done")).toBe(true);
    expect(isStockColumnName("Hecho", "in_review")).toBe(false);
    expect(isStockColumnName("QA", "in_review")).toBe(false);
  });
});

describe("URL state", () => {
  it("reads defaults from an empty query", () => {
    expect(readView(new URLSearchParams(""))).toEqual({ view: "board", filters: NO_FILTERS, sort: DEFAULT_SORT, ticket: null });
  });
  it("round-trips a full state and keeps foreign parameters", () => {
    const state = readView(new URLSearchParams("tab=tickets&view=list&q=cierre&assignee=ana,none&type=bug&priority=urgent,high&label=POS&due=week&milestone=m1&sort=priority&dir=desc&ticket=12"));
    expect(state.view).toBe("list");
    expect(state.filters).toEqual({ q: "cierre", assignee: ["ana", "none"], type: ["bug"], priority: ["urgent", "high"], label: ["POS"], due: "week", milestone: "m1" });
    expect(state.sort).toEqual({ key: "priority", dir: "desc" });
    expect(state.ticket).toBe(12);
    const back = writeView(new URLSearchParams("tab=tickets"), state);
    expect(back.get("tab")).toBe("tickets");
    expect(readView(back)).toEqual(state);
  });
  it("leaves defaults out of the query and ignores invalid values", () => {
    expect(writeView(new URLSearchParams("tab=tickets&view=list&ticket=3"), { view: "board", filters: NO_FILTERS, sort: DEFAULT_SORT, ticket: null }).toString()).toBe("tab=tickets");
    const s = readView(new URLSearchParams("type=bug,nope&due=someday&sort=color&ticket=abc"));
    expect([s.filters.type, s.filters.due, s.sort, s.ticket]).toEqual([["bug"], null, DEFAULT_SORT, null]);
  });
});

describe("selection", () => {
  it("reports none, some or all of the visible rows", () => {
    expect(selectAllState([1, 2, 3], new Set())).toBe("none");
    expect(selectAllState([1, 2, 3], new Set([2]))).toBe("some");
    expect(selectAllState([1, 2, 3], new Set([1, 2, 3, 9]))).toBe("all");
  });
  it("select all adds the visible rows and keeps hidden selections; a second click clears only the visible ones", () => {
    const all = toggleAll([1, 2], new Set([2, 9]));
    expect([...all].sort()).toEqual([1, 2, 9]);
    expect([...toggleAll([1, 2], all)]).toEqual([9]);
  });
});

describe("lookups", () => {
  it("lists every label once, sorted", () => {
    expect(allLabels(list)).toEqual(["cierre de caja", "copy", "feedback", "métricas", "POS"]);
  });
  it("finds the position and the neighbours of the open ticket", () => {
    expect(neighbours([24, 13, 12], 13)).toEqual({ index: 2, total: 3, prev: 24, next: 12 });
    expect(neighbours([24, 13, 12], 24)).toEqual({ index: 1, total: 3, prev: null, next: 13 });
    expect(neighbours([24, 13], 99)).toEqual({ index: 0, total: 2, prev: null, next: null });
  });
});

describe("mentions", () => {
  const people: Person[] = [{ ...ana, email: "", role: "editor" }, { ...luis, email: "", role: "editor" }, { id: "kp", name: "Keyci Padilla", avatar: null, email: "", role: "owner" }];
  it("detects the @text being typed at the caret", () => {
    expect(mentionQuery("Necesito las citas, @An", 23)).toEqual({ start: 20, query: "An" });
    expect(mentionQuery("@Ana Rí", 7)).toEqual({ start: 0, query: "Ana Rí" });
    expect(mentionQuery("correo ana@acme.com", 19)).toBeNull();
    expect(mentionQuery("@Ana Ríos ya lo vio", 19)).toBeNull();
  });
  it("offers people whose name matches, without accents", () => {
    expect(mentionOptions(people, "an").map((p) => p.id)).toEqual(["ana"]);
    expect(mentionOptions(people, "mejia").map((p) => p.id)).toEqual(["luis"]);
    expect(mentionOptions(people, "").length).toBe(3);
  });
  it("completes the mention with the full name and moves the caret after it", () => {
    expect(applyMention("Necesito las citas, @An", 23, "Ana Ríos")).toEqual({ body: "Necesito las citas, @Ana Ríos ", caret: 30 });
    expect(applyMention("sin mención", 5, "Ana Ríos")).toEqual({ body: "sin mención", caret: 5 });
  });
  it("splits a comment into text and mentions of known people", () => {
    expect(splitMentions("@Luis Mejía parece el de #13, @ana ríos.", people)).toEqual([
      { text: "@Luis Mejía", mention: true }, { text: " parece el de #13, ", mention: false }, { text: "@ana ríos", mention: true }, { text: ".", mention: false },
    ]);
    expect(splitMentions("@Desconocido hola", people)).toEqual([{ text: "@Desconocido hola", mention: false }]);
  });
});

describe("custom board columns", () => {
  const cols: Column[] = [
    { id: "a", name: "Backlog", status: "todo", custom: true }, { id: "b", name: "Blocked", status: "todo", custom: true },
    { id: "c", name: "Shipped", status: "done", custom: true },
  ];
  const tk = (number: number, column: string | undefined, status: Ticket["status"], position: number) => ({ number, column, status, position }) as Ticket;
  const list = [tk(1, "a", "todo", 1024), tk(2, "b", "todo", 1024), tk(3, "c", "done", 1024), tk(4, "gone", "done", 2048), tk(5, undefined, "in_progress", 10)];

  it("groups by column, and finds a home for tickets whose column is missing", () => {
    const board = boardColumns(list, cols);
    expect(board.a.map((t) => t.number)).toEqual([5, 1]);   // nothing counts as in progress: first column
    expect(board.b.map((t) => t.number)).toEqual([2]);
    expect(board.c.map((t) => t.number)).toEqual([3, 4]);   // unknown column, same status
    expect(columnOf(list[0], cols).name).toBe("Backlog");
  });
  it("moving to a column takes that column's status", () => {
    const moved = moveTicket(list, 1, "c", 3, cols).find((t) => t.number === 1)!;
    expect([moved.column, moved.status]).toEqual(["c", "done"]);
    expect(moveTicket(list, 1, "nope", null, cols)).toBe(list);
  });
  it("sorts by status in the board's order", () => {
    expect(sortTickets(list.slice(0, 3), { key: "status", dir: "desc" }, cols).map((t) => t.number)).toEqual([3, 2, 1]);
  });
  it("checks a draft of the board", () => {
    expect(columnsProblem(cols as { name: string; status: Ticket["status"] }[])).toBeNull();
    expect(columnsProblem([{ name: "Only", status: "todo" }])).toBe("count");
    expect(columnsProblem([{ name: "A", status: "todo" }, { name: "a", status: "done" }])).toBe("duplicate");
    expect(columnsProblem([{ name: "A", status: "todo" }, { name: "B", status: "in_review" }])).toBe("done");
    expect(columnsProblem([{ name: "A", status: "in_progress" }, { name: "B", status: "done" }])).toBe("todo");
    expect(columnsProblem([{ name: "", status: "todo" }, { name: "B", status: "done" }])).toBe("name");
  });
  it("keeps done columns at the end of the board", () => {
    // 30 tickets in QA must not count as finished: a QA column in front of Done cannot be done.
    expect(columnsProblem([{ name: "A", status: "todo" }, { name: "QA", status: "done" }, { name: "Live", status: "in_review" }])).toBe("done_last");
    expect(columnsProblem([{ name: "A", status: "todo" }, { name: "QA", status: "done" }, { name: "B", status: "in_progress" }, { name: "Done", status: "done" }])).toBe("done_last");
    expect(columnsProblem([{ name: "A", status: "todo" }, { name: "QA", status: "in_review" }, { name: "Verified", status: "done" }, { name: "Shipped", status: "done" }])).toBeNull();
  });
  it("warns when a review or testing column counts as done", () => {
    for (const name of ["QA", "Testing", "Pruebas", "En revisión", "Code review", "Verificación", "Staging"]) expect(looksLikeReviewAsDone({ name, status: "done" })).toBe(true);
    expect(looksLikeReviewAsDone({ name: "QA", status: "in_review" })).toBe(false);
    for (const name of ["Done", "Hecho", "Publicado", "Shipped", "Latest"]) expect(looksLikeReviewAsDone({ name, status: "done" })).toBe(false);
  });
  it("reorders a list", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    const same = ["a", "b"]; expect(moveItem(same, 0, -1)).toBe(same);
  });
});

describe("convert to insight", () => {
  it("takes the insight's severity from the ticket's priority", () => {
    expect(severityFromPriority("urgent")).toBe("critical");
    expect(severityFromPriority("high")).toBe("high");
    expect(severityFromPriority("medium")).toBe("medium");
    expect(severityFromPriority("low")).toBe("low");
  });
});
