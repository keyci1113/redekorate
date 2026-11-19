import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Link2, Mail, Save, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { copy, useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Project } from "../lib/types";
import { Button, ErrorNote, Field, Modal } from "../components/ui";
import { Avatar } from "../components/Avatar";
import type { DocRecord } from "./types";
import { Link } from "react-router-dom";
import { isDocTeam } from "../lib/roles";

/** The project team (editors and up) shares, copies and deletes a document; someone it was shared with by email only works on it. */
export const isTeam = isDocTeam;

/** The breadcrumb at the top of a document: its project, or "Shared with you" when the person only has this document. */
export function DocCrumb({ project, to }: { project: Project; to: string }) {
  const shared = project.project_role === null;
  return (
    <Link to={to} className="focus-ring flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-3 hover:text-ink" title={shared ? t("Compartido contigo desde {a}", { a: project.name }) : undefined}>
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} />
      <span className="hidden max-w-40 truncate sm:inline">{shared ? t("Compartido contigo") : project.name}</span>
    </Link>
  );
}

/** Sharing and "Save as…", used by every document page, diagrams and sitemaps included. */
type ShareRole = "viewer" | "commenter" | "editor";
const SHARE_ROLES: [ShareRole, string][] = [["viewer", "Puede ver"], ["commenter", "Puede comentar"], ["editor", "Puede editar"]];
interface SharePerson { user_id: string; role: ShareRole; name: string; email: string; avatar: string | null }
interface ShareInvite { id: string; email: string; role: ShareRole; expires_at: string }
interface People { people: SharePerson[]; invites: ShareInvite[] }

function RoleSelect({ value, onChange, label }: { value: ShareRole; onChange: (r: ShareRole) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as ShareRole)} className="field h-9 w-auto shrink-0 py-0 text-[13px]">
      {SHARE_ROLES.map(([id, l]) => <option key={id} value={id}>{t(l)}</option>)}
    </select>
  );
}

/** People invited to this document only, by email: view, comment or edit, never the rest of the project. */
function SharePeople({ doc }: { doc: DocRecord }) {
  const { data, setData, error } = useLoad(() => api.get<People>(`/documents/${doc.id}/people`), [doc.id]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("commenter");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; link?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await api.post<People & { added: "user" | "invite"; link?: string; mailed: boolean }>(`/documents/${doc.id}/people`, { email: email.trim(), role });
      setData({ people: r.people, invites: r.invites });
      setNote(r.added === "user"
        ? { text: r.mailed ? t("Listo: ya tiene acceso y le avisamos por correo.") : t("Listo: ya tiene acceso. Lo encuentra en Compartidos conmigo.") }
        : r.mailed ? { text: t("Aún no tiene cuenta: le enviamos una invitación válida por 7 días.") }
        : { text: t("Aún no tiene cuenta y no hay correo configurado: copia el link de invitación y envíaselo (válido por 7 días)."), link: r.link });
      setEmail("");
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  const run = (p: Promise<People>) => p.then(setData).catch((x) => setErr((x as Error).message));

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t("Personas con acceso")}</h3>
      <p className="text-[13px] text-ink-2">{t("Invita por correo a ver, comentar o editar solo este documento. No ven el resto del proyecto y no pueden borrarlo ni compartirlo.")}</p>
      <form onSubmit={invite} className="flex flex-wrap gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("correo@empresa.com")} aria-label={t("Correo")} className="field h-9 min-w-48 flex-1 text-[13px]" />
        <RoleSelect value={role} onChange={setRole} label={t("Permiso")} />
        <Button variant="primary" size="sm" disabled={busy} icon={<UserPlus size={15} />}>{busy ? t("Un momento…") : t("Invitar")}</Button>
      </form>
      {(err || error) && <ErrorNote>{err ?? error}</ErrorNote>}
      {note && (
        <div className="space-y-2 rounded-lg bg-accent-soft/50 p-3 text-[13px]" role="status">
          <p>{note.text}</p>
          {note.link && (
            <div className="flex gap-2">
              <input readOnly className="field h-9 font-mono text-[12px]" value={note.link} onFocus={(e) => e.target.select()} aria-label={t("Link de invitación")} />
              <Button size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={async () => { if (await copy(note.link!)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>{copied ? t("Copiado") : t("Copiar")}</Button>
            </div>
          )}
        </div>
      )}
      {data && (data.people.length > 0 || data.invites.length > 0) && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.people.map((p) => (
            <li key={p.user_id} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={p.name} avatar={p.avatar} size={28} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.name}</span><span className="block truncate text-[12px] text-ink-3">{p.email}</span></span>
              <RoleSelect value={p.role} label={t("Permiso de {a}", { a: p.name })} onChange={(r) => run(api.patch<People>(`/documents/${doc.id}/people/${p.user_id}`, { role: r }))} />
              <button type="button" className="focus-ring rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Quitar a {a}", { a: p.name })}
                onClick={() => run(api.del<People>(`/documents/${doc.id}/people/${p.user_id}`))}><X size={15} /></button>
            </li>
          ))}
          {data.invites.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-3" aria-hidden><Mail size={14} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{i.email}</span><span className="block text-[12px] text-ink-3">{t("Invitación pendiente")}</span></span>
              <RoleSelect value={i.role} label={t("Permiso de {a}", { a: i.email })} onChange={(r) => run(api.patch<People>(`/documents/${doc.id}/invites/${i.id}`, { role: r }))} />
              <button type="button" className="focus-ring rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Cancelar la invitación de {a}", { a: i.email })}
                onClick={() => run(api.del<People>(`/documents/${doc.id}/invites/${i.id}`))}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ShareModal({ open, onClose, doc, onDoc }: { open: boolean; onClose: () => void; doc: DocRecord; onDoc: (d: DocRecord) => void }) {
  const [done, setDone] = useState(false);
  const url = doc.share_token ? `${window.location.origin}/d/${doc.share_token}` : "";
  return (
    <Modal open={open} onClose={onClose} title={t("Compartir documento")} wide>
      {open && <SharePeople doc={doc} />}
      <h3 className="mt-6 border-t border-line pt-5 text-sm font-semibold">{t("Link de lectura")}</h3>
      <p className="mt-1 text-sm text-ink-2">{t("Cualquier persona con el link podrá ver el documento en modo lectura, sin cuenta. Puedes revocarlo cuando quieras.")}</p>
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
