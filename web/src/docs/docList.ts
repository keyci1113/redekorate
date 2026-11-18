// The UX documents list: filtering and sorting, shared by the card view and the table view.
import type { DocCategory, DocRecord } from "./types";

export interface DocFilters {
  query: string;
  /** Template kind, or "" for every kind. */
  kind: string;
  /** Template category, or "" for every category. */
  category: DocCategory | "";
  language: "" | "es" | "en";
  shared: "" | "yes" | "no";
}
export const NO_FILTERS: DocFilters = { query: "", kind: "", category: "", language: "", shared: "" };

export type DocSortKey = "title" | "type" | "category" | "language" | "updated";
export interface DocSort { key: DocSortKey; dir: "asc" | "desc" }
/** Newest first, as the list has always been. */
export const DEFAULT_SORT: DocSort = { key: "updated", dir: "desc" };

/** What a row shows for its template; the caller supplies it so this file needs no React. */
export interface DocMeta { type: string; category: string }

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const activeFilters = (f: DocFilters) => (Object.keys(NO_FILTERS) as (keyof DocFilters)[]).filter((k) => f[k].trim() !== "").length;

/**
 * The documents that pass every filter, in the chosen order. The search matches the title or the type name,
 * ignoring case and accents. Ties fall back to the newest edit, so the order never jumps around.
 */
export function filterAndSort(docs: DocRecord[], f: DocFilters, sort: DocSort, meta: (d: DocRecord) => DocMeta & { categoryId: string }): DocRecord[] {
  const q = fold(f.query.trim());
  const rows = docs.filter((d) => {
    const m = meta(d);
    if (f.kind && d.kind !== f.kind) return false;
    if (f.category && m.categoryId !== f.category) return false;
    if (f.language && d.language !== f.language) return false;
    if (f.shared === "yes" && !d.share_token) return false;
    if (f.shared === "no" && d.share_token) return false;
    return !q || fold(d.title).includes(q) || fold(m.type).includes(q);
  });
  const value = (d: DocRecord): string => {
    switch (sort.key) {
      case "title": return d.title;
      case "type": return meta(d).type;
      case "category": return meta(d).category;
      case "language": return d.language;
      case "updated": return d.updated_at;
    }
  };
  const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * cmp(value(a), value(b)) || cmp(b.updated_at, a.updated_at));
}

/** Clicking a column: the same one flips the direction, a new one starts ascending (dates start newest first). */
export const toggleSort = (s: DocSort, key: DocSortKey): DocSort =>
  s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "updated" ? "desc" : "asc" };
