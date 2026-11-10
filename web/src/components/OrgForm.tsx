import { useState, type FormEvent } from "react";
import { Button, ErrorNote, Field, cx } from "./ui";
import { ImageDrop } from "./editing";
import { OrgLogo } from "./OrgLogo";
import { BRAND_COLORS } from "../lib/settings";
import { t } from "../lib/i18n";

export interface OrgValues { name: string; color: string; logo: string | null }

/** Name, logo and color of an organization. Used to create one (organizations page, onboarding) and to edit it. */
export function OrgForm({ initial, onSubmit, submitLabel, compact }: {
  initial?: OrgValues; onSubmit: (v: OrgValues) => Promise<void>; submitLabel: string; compact?: boolean;
}) {
  const [v, setV] = useState<OrgValues>(initial ?? { name: "", color: BRAND_COLORS[0], logo: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await onSubmit(v); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t("Nombre de la organización")}><input autoFocus required className="field" placeholder={t("p. ej. Acme Research o Mi estudio")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field group label={t("Logo")} hint={compact ? undefined : t("PNG con fondo transparente funciona mejor. Se usa en proyectos, estudios y reportes de la organización.")}>
        <div className="flex items-center gap-4">
          <OrgLogo name={v.name || "?"} logo={v.logo} color={v.color} size={56} />
          <div className="w-40"><ImageDrop compact value={v.logo} label={t("Subir logo")} onChange={(logo) => setV({ ...v, logo })} /></div>
        </div>
      </Field>
      <Field group label={t("Color")}>
        <div className="flex flex-wrap items-center gap-2">
          {BRAND_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setV({ ...v, color: c })} aria-label={c}
              className={cx("focus-ring h-7 w-7 rounded-lg transition", v.color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />
          ))}
          <input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-line" title={t("Color personalizado")} aria-label={t("Color personalizado")} />
        </div>
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end pt-2"><Button variant="primary" disabled={busy || !v.name.trim()}>{submitLabel}</Button></div>
    </form>
  );
}
