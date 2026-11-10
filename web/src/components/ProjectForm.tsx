import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, cx } from "./ui";
import { OrgLogo } from "./OrgLogo";
import type { Organization } from "../lib/types";

import { t } from "../lib/i18n";
export const PROJECT_COLORS = ["#7C3AED", "#A855F7", "#C026D3", "#DB2777", "#4F46E5", "#0E7490", "#2F8F5B", "#B7791F"];

export interface ProjectValues { name: string; description: string; color: string; organization_id: string | null }

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
  const [v, setV] = useState<ProjectValues>({ name: "", description: "", color: PROJECT_COLORS[0], organization_id: null, ...initial });
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
      {orgs && orgs.length > 0 && (
        <Field group label={t("Espacio")} hint={t("En una organización, todas sus personas ven el proyecto y pueden comentar; tú sigues siendo dueño/a.")}>
          <div className="grid grid-cols-2 gap-2">
            {choice(null, t("Personal"), <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink/10 text-[11px] font-semibold" aria-hidden>{t("Yo")}</span>)}
            {orgs.map((o) => choice(o.id, o.name, <OrgLogo name={o.name} logo={o.logo} color={o.color} size={20} />))}
          </div>
        </Field>
      )}
      <Field group label={t("Color")}>
        <div className="flex gap-2">
          {PROJECT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setV({ ...v, color: c })} aria-label={c}
              className={cx("focus-ring h-7 w-7 rounded-lg transition", v.color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />
          ))}
        </div>
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end pt-2"><Button variant="primary" disabled={busy}>{submitLabel}</Button></div>
    </form>
  );
}
