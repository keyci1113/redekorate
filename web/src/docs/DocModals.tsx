import { useEffect, useState } from "react";
import { Check, Copy, Link2, Save } from "lucide-react";
import { api } from "../lib/api";
import { copy, useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Project } from "../lib/types";
import { Button, ErrorNote, Field, Modal } from "../components/ui";
import type { DocRecord } from "./types";

/** Sharing and "Save as…", used by every document page, diagrams and sitemaps included. */
export function ShareModal({ open, onClose, doc, onDoc }: { open: boolean; onClose: () => void; doc: DocRecord; onDoc: (d: DocRecord) => void }) {
  const [done, setDone] = useState(false);
  const url = doc.share_token ? `${window.location.origin}/d/${doc.share_token}` : "";
  return (
    <Modal open={open} onClose={onClose} title={t("Compartir documento")}>
      <p className="text-sm text-ink-2">{t("Cualquier persona con el link podrá ver el documento en modo lectura, sin cuenta. Puedes revocarlo cuando quieras.")}</p>
      {doc.share_token ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input readOnly className="field font-mono text-[13px]" value={url} onFocus={(e) => e.target.select()} />
            <Button variant="primary" icon={done ? <Check size={15} /> : <Copy size={15} />} onClick={async () => { if (await copy(url)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>{done ? t("Copiado") : t("Copiar")}</Button>
          </div>
          <button className="text-sm font-medium text-bad" onClick={async () => { await api.del(`/documents/${doc.id}/share`); onDoc({ ...doc, share_token: null }); }}>{t("Revocar link")}</button>
        </div>
      ) : (
        <Button variant="primary" className="mt-4" icon={<Link2 size={15} />} onClick={async () => { const { token } = await api.post<{ token: string }>(`/documents/${doc.id}/share`); onDoc({ ...doc, share_token: token }); }}>{t("Crear link de lectura")}</Button>
      )}
    </Modal>
  );
}

/** "Guardar como…": guarda una copia con otro nombre en este u otro proyecto */
export function SaveAsModal({ open, onClose, docId, title, projectId, onSaved }: { open: boolean; onClose: () => void; docId: string; title: string; projectId: string; onSaved: (id: string) => void }) {
  const projects = useLoad(() => (open ? api.get<{ projects: Project[] }>("/projects") : Promise.resolve({ projects: [] as Project[] })), [open]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(projectId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(`${title} (${t("copia")})`); setTarget(projectId); setErr(null); } }, [open, title, projectId]);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const { document } = await api.post<{ document: DocRecord }>(`/documents/${docId}/duplicate`, { project_id: target, title: name.trim() || title });
      onSaved(document.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Guardar como…")}>
      <p className="text-sm text-ink-2">{t("Guarda una copia de este documento, con todo lo que llenaste, en este u otro proyecto. El original no cambia.")}</p>
      <div className="mt-4 space-y-4">
        <Field label={t("Nombre del documento")}><input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <Field label={t("Proyecto")}>
          <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            {(projects.data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === projectId ? ` · ${t("actual")}` : ""}</option>)}
          </select>
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
          <Button variant="primary" icon={<Save size={15} />} disabled={busy || !target} onClick={save}>{t("Guardar copia")}</Button>
        </div>
      </div>
    </Modal>
  );
}
