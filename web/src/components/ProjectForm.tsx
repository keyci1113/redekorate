import { useState, type FormEvent } from "react";
import { Pipette } from "lucide-react";
import { Button, ErrorNote, Field, cx } from "./ui";
import { OrgLogo } from "./OrgLogo";
import type { Organization } from "../lib/types";
import { DEFAULT_CATEGORY, PROJECT_CATEGORIES, categoryLabel, type ProjectCategory } from "../lib/projectCategories";

import { t } from "../lib/i18n";
/** Project colors, around the color wheel. Each one reaches 4.5:1 with white text on it (the project's reports use it as a
 *  fill) and stays visible as a dot on the dark theme's surface. The first is the default. */
export const PROJECT_COLORS = [
  "#7C3AED", "#9333EA", "#C026D3", "#DB2777", "#BE123C", "#B91C1C", "#C2410C", "#B45309", "#A16207",
  "#4D7C0F", "#15803D", "#047857", "#0F766E", "#0E7490", "#0369A1", "#1D4ED8", "#4F46E5", "#475569",
];

/** Relative luminance of a #rrggbb color (WCAG), to pick a readable mark on top of it. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The palette plus a last swatch that opens the system color picker for any other color. */
export function ProjectColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const current = value.toUpperCase();
  const custom = !PROJECT_COLORS.includes(current);
  const selected = "ring-2 ring-ink ring-offset-2 ring-offset-surface";
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c} aria-pressed={current === c} title={c}
          className={cx("focus-ring h-8 w-8 rounded-lg transition hover:scale-105 motion-reduce:hover:scale-100", current === c && selected)} style={{ background: c }} />
      ))}
      <label title={custom ? `${t("Color personalizado")} · ${current}` : t("Color personalizado")}
        className={cx("relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition focus-within:ring-2 focus-within:ring-accent",
          custom ? selected : "border border-dashed border-line-2 text-ink-3 hover:border-ink-3 hover:text-ink")}
        // On a chosen color the icon turns dark or white, whichever reads on it.
        style={custom ? { background: current, color: luminance(current) > 0.4 ? "#16191F" : "#FFFFFF" } : undefined}>
        <Pipette size={15} aria-hidden />
        <input type="color" value={custom ? current.toLowerCase() : "#7c3aed"} onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={t("Color personalizado")} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

export interface ProjectValues { name: string; description: string; color: string; organization_id: string | null; category: ProjectCategory }

/**
 * Name, description, color and workspace of a project. The workspace selector appears when `orgs` is given
 * (personal, or any organization the person belongs to); only the owner can move a project, so edit forms
 * for collaborators omit `orgs`.
 */
export function ProjectForm({ initial, orgs, onSubmit, submitLabel }: {
  initial?: Partial<ProjectValues>;
  orgs?: Organization[];
  onSubmit: (v: ProjectValues) => Promise<void>;
  submitLabel: string;
}) {
  const [v, setV] = useState<ProjectValues>({ name: "", description: "", color: PROJECT_COLORS[0], organization_id: null, category: DEFAULT_CATEGORY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await onSubmit(v); } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  const choice = (id: string | null, label: string, icon: React.ReactNode) => (
    <button key={id ?? "personal"} type="button" onClick={() => setV({ ...v, organization_id: id })} aria-pressed={v.organization_id === id}
      className={cx("focus-ring flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] font-medium transition", v.organization_id === id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-2")}>
      {icon}<span className="truncate">{label}</span>
    </button>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("Nombre del proyecto")}><input autoFocus required className="field" placeholder={t("p. ej. Rediseño app de Rutas")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label={t("Descripción")}><textarea className="field min-h-20" placeholder={t("Objetivo, cliente, contexto…")} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <Field label={t("Tipo de proyecto")} hint={t("Investigación UX, desarrollo de software, IA, automatizaciones, TI… Sirve para filtrar tus proyectos.")}>
        <select className="field" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ProjectCategory })}>
          {PROJECT_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
      </Field>
      {orgs && orgs.length > 0 && (
        <Field group label={t("Espacio")} hint={t("En una organización, todas sus personas ven el proyecto y pueden comentar; tú sigues siendo dueño/a.")}>
          <div className="grid grid-cols-2 gap-2">
            {choice(null, t("Personal"), <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink/10 text-[11px] font-semibold" aria-hidden>{t("Yo")}</span>)}
            {orgs.map((o) => choice(o.id, o.name, <OrgLogo name={o.name} logo={o.logo} color={o.color} size={20} />))}
          </div>
        </Field>
      )}
      <Field group label={t("Color")}>
        <ProjectColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end pt-2"><Button variant="primary" disabled={busy}>{submitLabel}</Button></div>
    </form>
  );
}
