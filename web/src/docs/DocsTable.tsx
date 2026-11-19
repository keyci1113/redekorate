import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, LayoutGrid, Link2, Search, Table2, X } from "lucide-react";
import { timeAgo } from "../lib/hooks";
import { t } from "../lib/i18n";
import { ErrorNote, cx } from "../components/ui";
import { DOC_CATEGORIES } from "./templates";
import { DocActions } from "./DocCard";
import { NO_FILTERS, activeFilters, type DocFilters, type DocSort, type DocSortKey } from "./docList";
import type { DocRecord } from "./types";

/** What a list row needs to know about its template. */
export interface RowInfo { icon: ReactNode; type: string; category: string; categoryId: string }

export type DocsView = "cards" | "table";

/** Cards or table, remembered per viewer in this browser under `key` (each list keeps its own choice). */
export function useDocsView(key: string): [DocsView, (v: DocsView) => void] {
  const [view, setView] = useState<DocsView>(() => { try { return localStorage.getItem(key) === "table" ? "table" : "cards"; } catch { return "cards"; } });
  return [view, (v) => { setView(v); try { localStorage.setItem(key, v); } catch { /* no storage */ } }];
}

/** The cards / table switch above a list of documents. */
export function DocsViewToggle({ view, onChange }: { view: DocsView; onChange: (v: DocsView) => void }) {
  const btn = (v: DocsView, icon: ReactNode, label: string) => (
    <button type="button" aria-pressed={view === v} title={label} onClick={() => onChange(v)}
      className={cx("focus-ring flex h-9 w-9 items-center justify-center rounded-md transition", view === v ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}>
      {icon}<span className="sr-only">{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label={t("Vista")} className="flex rounded-lg bg-ink/5 p-0.5">
      {btn("cards", <LayoutGrid size={16} />, t("Tarjetas"))}
      {btn("table", <Table2 size={16} />, t("Tabla"))}
    </div>
  );
}

const select = "field !h-10 !min-h-10 !w-auto !py-0 pr-8 text-[13px]";

/** Search and filters above the documents, for both the cards and the table. Only kinds that are in the list are offered. */
export function DocFilterBar({ docs, filters, onChange, info, shown }: {
  docs: DocRecord[]; filters: DocFilters; onChange: (f: DocFilters) => void; info: (d: DocRecord) => RowInfo; shown: number;
}) {
  const set = (p: Partial<DocFilters>) => onChange({ ...filters, ...p });
  const kinds = [...new Map(docs.map((d) => [d.kind, info(d).type])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cats = DOC_CATEGORIES.filter((c) => docs.some((d) => info(d).categoryId === c.id));
  const langs = [...new Set(docs.map((d) => d.language))].sort();
  const active = activeFilters(filters);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label={t("Filtrar documentos")}>
      <label className="relative min-w-[min(100%,16rem)] flex-1 sm:max-w-xs">
        <span className="sr-only">{t("Buscar documentos")}</span>
        <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input type="search" value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder={t("Buscar por nombre o tipo")} className="field !h-10 !min-h-10 pl-9 text-[13px]" />
      </label>
      <label>
        <select aria-label={t("Tipo")} className={select} value={filters.kind} onChange={(e) => set({ kind: e.target.value })}>
          <option value="">{t("Todos los tipos")}</option>
          {kinds.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
      </label>
      {cats.length > 1 && (
        <label>
          <select aria-label={t("Categoría")} className={select} value={filters.category} onChange={(e) => set({ category: e.target.value as DocFilters["category"] })}>
            <option value="">{t("Todas las categorías")}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{t(c.id)}</option>)}
          </select>
        </label>
      )}
      {langs.length > 1 && (
        <label>
          <select aria-label={t("Idioma")} className={select} value={filters.language} onChange={(e) => set({ language: e.target.value as DocFilters["language"] })}>
            <option value="">{t("Todos los idiomas")}</option>
            {langs.map((l) => <option key={l} value={l}>{l === "en" ? "English" : "Español"}</option>)}
          </select>
        </label>
      )}
      <label>
        <select aria-label={t("Compartido")} className={select} value={filters.shared} onChange={(e) => set({ shared: e.target.value as DocFilters["shared"] })}>
          <option value="">{t("Compartidos y privados")}</option>
          <option value="yes">{t("Con link de lectura")}</option>
          <option value="no">{t("Sin link de lectura")}</option>
        </select>
      </label>
      {active > 0 && (
        <>
          <button type="button" onClick={() => onChange(NO_FILTERS)} className="focus-ring inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-accent hover:bg-accent-soft">
            <X size={14} aria-hidden />{t("Quitar filtros")}
          </button>
          <span className="text-[13px] text-ink-3 tabular-nums" aria-live="polite">{t("{a} de {b}", { a: shown, b: docs.length })}</span>
        </>
      )}
    </div>
  );
}

const COLS = (): [DocSortKey, string][] => [["title", t("Nombre")], ["type", t("Tipo")], ["category", t("Categoría")], ["language", t("Idioma")], ["updated", t("Editado")]];

/**
 * The documents as a sortable table; the name opens the document, editors get the ⋯ menu on each row.
 * `caption` names the table for screen readers; `noCategory` drops the Category column for lists whose items have none (Architecture).
 */
export function DocsTable({ rows, sort, onSort, info, canEdit, onChange, caption = t("Documentos UX"), noCategory = false }: {
  rows: DocRecord[]; sort: DocSort; onSort: (k: DocSortKey) => void; info: (d: DocRecord) => RowInfo; canEdit: boolean; onChange: () => void; caption?: string; noCategory?: boolean;
}) {
  const cols = COLS().filter(([key]) => !(noCategory && key === "category"));
  const [err, setErr] = useState<string | null>(null);
  const cell = "border-b border-line/60 px-3 py-2.5";
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {err && <div className="p-3"><ErrorNote>{err}</ErrorNote></div>}
      {/* relative: screen-reader-only labels are absolutely positioned and would otherwise escape the scroll box and widen the page. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {cols.map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cx("border-b border-line px-3 py-1 text-left text-xs font-semibold text-ink-3", key === "language" && "w-24")}>
                  <button type="button" onClick={() => onSort(key)} className={cx("focus-ring inline-flex min-h-10 items-center gap-1 rounded whitespace-nowrap", sort.key === key && "text-ink")}>
                    {label}{sort.key === key && (sort.dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
                  </button>
                </th>
              ))}
              <th scope="col" className="w-14 border-b border-line"><span className="sr-only">{t("Acciones")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const m = info(d);
              return (
                <tr key={d.id} className="hover:bg-paper">
                  <td className={cx(cell, "min-w-[280px]")}>
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent [&_svg]:h-4 [&_svg]:w-4">{m.icon}</span>
                      <Link to={`/docs/${d.id}`} className="focus-ring rounded font-semibold text-ink hover:underline">{d.title}</Link>
                      {d.share_token && <span title={t("Compartido")} className="shrink-0 text-good"><Link2 size={14} aria-label={t("Compartido")} /></span>}
                    </span>
                  </td>
                  <td className={cx(cell, "text-[13px] whitespace-nowrap")}>{m.type}</td>
                  {!noCategory && <td className={cx(cell, "text-[13px] whitespace-nowrap text-ink-2")}>{m.category || <span className="text-ink-3">—</span>}</td>}
                  <td className={cell}><span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold text-ink-2 uppercase">{d.language}</span></td>
                  <td className={cx(cell, "text-[13px] whitespace-nowrap text-ink-2")} title={new Date(d.updated_at).toLocaleString()}>{timeAgo(d.updated_at)}</td>
                  <td className={cx(cell, "py-1 text-right")}>{canEdit && <DocActions doc={d} onChange={onChange} onError={setErr} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
