import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, NO_FILTERS, activeFilters, filterAndSort, toggleSort } from "./docList";
import type { DocRecord } from "./types";

const doc = (id: string, kind: string, title: string, updated: string, extra: Partial<DocRecord> = {}): DocRecord =>
  ({ id, project_id: "p", kind, title, language: "en", data: {}, share_token: null, created_at: updated, updated_at: updated, ...extra });
const META: Record<string, { type: string; category: string; categoryId: string }> = {
  proto_persona: { type: "Proto-persona", category: "Personas", categoryId: "Personas" },
  journey_map: { type: "User Journey Map", category: "Maps and synthesis", categoryId: "Mapas y síntesis" },
  interview_guide: { type: "Interview guide", category: "Field and interviews", categoryId: "Campo y entrevistas" },
};
const meta = (d: DocRecord) => META[d.kind] ?? { type: d.kind, category: "", categoryId: "" };

const docs = [
  doc("a", "proto_persona", "Proto-persona: Martín", "2026-11-18T10:00:00Z"),
  doc("b", "journey_map", "Journey: payment round", "2026-11-18T12:00:00Z", { share_token: "tok" }),
  doc("c", "interview_guide", "Interview guide", "2026-11-17T09:00:00Z", { language: "es" }),
  doc("d", "research_plan", "UX Research Plan", "2026-11-16T09:00:00Z"),
];
const ids = (xs: DocRecord[]) => xs.map((d) => d.id);

describe("documents list", () => {
  it("shows everything newest first by default", () => {
    expect(ids(filterAndSort(docs, NO_FILTERS, DEFAULT_SORT, meta))).toEqual(["b", "a", "c", "d"]);
  });

  it("searches titles and type names, ignoring case and accents", () => {
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, query: "martin" }, DEFAULT_SORT, meta))).toEqual(["a"]);
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, query: "JOURNEY MAP" }, DEFAULT_SORT, meta))).toEqual(["b"]);
  });

  it("filters by kind, category, language and sharing, all together", () => {
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, kind: "proto_persona" }, DEFAULT_SORT, meta))).toEqual(["a"]);
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, category: "Mapas y síntesis" }, DEFAULT_SORT, meta))).toEqual(["b"]);
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, language: "es" }, DEFAULT_SORT, meta))).toEqual(["c"]);
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, shared: "yes" }, DEFAULT_SORT, meta))).toEqual(["b"]);
    expect(ids(filterAndSort(docs, { ...NO_FILTERS, shared: "no", language: "en" }, DEFAULT_SORT, meta))).toEqual(["a", "d"]);
    expect(activeFilters({ ...NO_FILTERS, shared: "no", language: "en", query: "  " })).toBe(2);
  });

  it("sorts by any column; ties keep the newest first", () => {
    expect(ids(filterAndSort(docs, NO_FILTERS, { key: "title", dir: "asc" }, meta))).toEqual(["c", "b", "a", "d"]);
    expect(ids(filterAndSort(docs, NO_FILTERS, { key: "language", dir: "asc" }, meta))).toEqual(["b", "a", "d", "c"]);
    expect(toggleSort(DEFAULT_SORT, "updated")).toEqual({ key: "updated", dir: "asc" });
    expect(toggleSort(DEFAULT_SORT, "title")).toEqual({ key: "title", dir: "asc" });
  });
});
