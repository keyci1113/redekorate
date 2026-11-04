import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, cx } from "./ui";

import { t } from "../lib/i18n";
export const PROJECT_COLORS = ["#7C3AED", "#A855F7", "#C026D3", "#DB2777", "#4F46E5", "#0E7490", "#2F8F5B", "#B7791F"];

export function ProjectForm({ initial, onSubmit, submitLabel }: {
  initial?: { name: string; description: string; color: string };
  onSubmit: (v: { name: string; description: string; color: string }) => Promise<void>;
  submitLabel: string;
}) {
  const [v, setV] = useState(initial ?? { name: "", description: "", color: PROJECT_COLORS[0] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await onSubmit(v); } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("Nombre del proyecto")}><input autoFocus required className="field" placeholder={t("p. ej. Rediseño app de Rutas")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label={t("Descripción")}><textarea className="field min-h-20" placeholder={t("Objetivo, cliente, contexto…")} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
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
