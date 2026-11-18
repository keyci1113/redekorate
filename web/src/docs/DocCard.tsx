import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Copy, ExternalLink, Link2, MoreHorizontal, Pencil, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import { t } from "../lib/i18n";
import { Button, ErrorNote, Field, Modal, cx } from "../components/ui";
import { Menu, MenuItem } from "../components/Menu";
import { SaveAsModal, ShareModal } from "./DocModals";
import type { DocRecord } from "./types";

/**
 * The ⋯ menu on a document in a project's list (card or table row): open in a new tab, rename, share, duplicate,
 * save a copy elsewhere or delete it, without opening it first. Only for people who can edit.
 */
export function DocActions({ doc, onChange, onError, className }: { doc: DocRecord; onChange: () => void; onError: (message: string | null) => void; className?: string }) {
  const [modal, setModal] = useState<null | "rename" | "share" | "saveAs">(null);
  const href = `/docs/${doc.id}`;
  async function act(run: () => Promise<unknown>) {
    onError(null);
    try { await run(); onChange(); } catch (e) { onError((e as Error).message); }
  }
  return (<>
    <Menu label={t("Opciones de {a}", { a: doc.title })} width={210} button={(p) => (
      <button {...p} type="button" aria-label={t("Opciones de {a}", { a: doc.title })} title={t("Más")}
        className={cx("focus-ring relative z-10 flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink", className)}>
        <MoreHorizontal size={16} />
      </button>
    )}>
      {(close) => <>
        <MenuItem onSelect={() => { close(); window.open(href, "_blank", "noopener"); }}><ExternalLink size={15} />{t("Abrir en otra pestaña")}</MenuItem>
        <MenuItem onSelect={() => { close(); setModal("rename"); }}><Pencil size={15} />{t("Cambiar nombre")}</MenuItem>
        <MenuItem onSelect={() => { close(); setModal("share"); }}><Link2 size={15} />{t("Compartir")}</MenuItem>
        <MenuItem onSelect={() => { close(); act(() => api.post(`/documents/${doc.id}/duplicate`)); }}><Copy size={15} />{t("Duplicar")}</MenuItem>
        <MenuItem onSelect={() => { close(); setModal("saveAs"); }}><Save size={15} />{t("Guardar como…")}</MenuItem>
        <MenuItem danger onSelect={() => {
          close();
          if (confirm(t("¿Eliminar \"{a}\"? Esta acción no se puede deshacer.", { a: doc.title }))) act(() => api.del(`/documents/${doc.id}`));
        }}><Trash2 size={15} />{t("Eliminar")}</MenuItem>
      </>}
    </Menu>
    {modal === "rename" && <RenameModal doc={doc} onClose={() => setModal(null)} onDone={() => { setModal(null); onChange(); }} />}
    <ShareModal open={modal === "share"} onClose={() => setModal(null)} doc={doc} onDoc={() => onChange()} />
    <SaveAsModal open={modal === "saveAs"} onClose={() => setModal(null)} docId={doc.id} title={doc.title} projectId={doc.project_id}
      onSaved={() => { setModal(null); onChange(); }} />
  </>);
}

/** A document or diagram as a card: the whole card opens it; editors get the ⋯ menu. */
export function DocCard({ doc, icon, kind, badge, canEdit, onChange }: {
  doc: DocRecord; icon: ReactNode; kind: string; badge?: ReactNode; canEdit: boolean; onChange: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  // No transform on the card, ever: the menu and dialogs are position: fixed, and a transformed parent would carry them off.
  return (
    <div className="group relative flex flex-col rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:shadow-lg hover:shadow-accent/10 focus-within:border-accent">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
        <span className="flex items-center gap-1.5">
          {doc.share_token && <span title={t("Compartido")} className="text-good"><Link2 size={14} /></span>}
          {badge}
          {canEdit && <DocActions doc={doc} onChange={onChange} onError={setErr} className="-my-1.5 -mr-1.5" />}
        </span>
      </div>
      {/* The link covers the card, so the card opens it; the menu button sits above it. */}
      <Link to={`/docs/${doc.id}`} className="mt-3 rounded font-semibold leading-snug text-ink outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent">
        {doc.title}
      </Link>
      <p className="mt-0.5 text-xs text-ink-3">{kind} · {t("editado {a}", { a: timeAgo(doc.updated_at) })}</p>
      {err && <div className="relative z-10 mt-2"><ErrorNote>{err}</ErrorNote></div>}
    </div>
  );
}

function RenameModal({ doc, onClose, onDone }: { doc: DocRecord; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(doc.title);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    const title = name.trim();
    if (!title || title === doc.title) return onClose();
    setBusy(true); setErr(null);
    try { await api.patch(`/documents/${doc.id}`, { title }); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={t("Cambiar nombre")}>
      <div className="space-y-4">
        <Field label={t("Nombre")}><input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
          <Button variant="primary" disabled={busy} onClick={save}>{t("Guardar")}</Button>
        </div>
      </div>
    </Modal>
  );
}
