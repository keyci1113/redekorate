import { useState, type FormEvent } from "react";
import { Crown, LogOut, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ProjectMember, ProjectRole } from "../lib/types";
import { ASSIGNABLE_PROJECT_ROLES } from "../lib/roles";
import { Button, Card, ErrorNote, Field, Tag } from "./ui";
import { Avatar } from "./Avatar";
import { t } from "../lib/i18n";

export const roleLabel = (r: ProjectRole) => (r === "owner" ? t("Dueño/a") : r === "editor" ? t("Editor") : r === "commenter" ? t("Comentarista") : t("Solo lectura"));
/** Etiqueta de un proyecto compartido: "Editor · Dueño/a: Ana". Misma forma en la lista y en la cabecera. */
export const sharedLabel = (r: ProjectRole, owner?: string | null) => owner ? `${roleLabel(r)} · ${t("Dueño/a: {a}", { a: owner })}` : roleLabel(r);

/** Quién tiene acceso al proyecto. El dueño agrega, cambia roles y quita; los demás pueden salirse. */
export function MembersPanel({ projectId, myRole, members, onChange }: { projectId: string; myRole: ProjectRole; members: ProjectMember[]; onChange: () => void }) {
  const { user: me } = useAuth();
  const owner = myRole === "owner";
  const [form, setForm] = useState<{ email: string; role: ProjectRole }>({ email: "", role: "editor" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const add = (e: FormEvent) => { e.preventDefault(); return act(async () => { await api.post(`/projects/${projectId}/members`, form); setForm({ email: "", role: "editor" }); }); };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="font-semibold">{t("Colaboradores")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("Editores crean y modifican estudios, documentos, insights y participantes. Comentaristas ven todo y dejan comentarios. Solo lectura ve resultados y documentos sin cambiar nada. Solo quien es dueño agrega personas, archiva o elimina el proyecto.")}</p>
        {owner && (
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={add}>
            <div className="flex-1"><Field label={t("Correo de una cuenta existente")}><input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
            <Field label={t("Rol")}>
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ProjectRole })}>
                {ASSIGNABLE_PROJECT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </Field>
            <Button variant="primary" icon={<UserPlus size={15} />} disabled={busy}>{t("Agregar")}</Button>
          </form>
        )}
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </Card>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {members.map((m) => {
          const self = m.user_id === me?.id;
          return (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Avatar name={m.name} avatar={m.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-3">({t("tú")})</span>}</p>
                <p className="truncate text-xs text-ink-3">{m.email}</p>
              </div>
              {m.role === "owner" ? <Tag><span className="flex items-center gap-1"><Crown size={11} /> {roleLabel(m.role)}</span></Tag>
                : owner ? (
                  <select className="field h-8 w-36 py-0 text-[13px]" value={m.role} disabled={busy} aria-label={t("Rol de {a}", { a: m.name })} onChange={(e) => act(() => api.patch(`/projects/${projectId}/members/${m.user_id}`, { role: e.target.value }))}>
                    {ASSIGNABLE_PROJECT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                ) : <Tag>{roleLabel(m.role)}</Tag>}
              {m.role !== "owner" && (owner || self) && (
                <button disabled={busy} title={self ? t("Salir del proyecto") : t("Quitar")} aria-label={self ? t("Salir del proyecto") : t("Quitar")}
                  onClick={() => { if (confirm(self ? t("¿Salir de este proyecto? Dejarás de verlo.") : t("¿Quitar a {a} del proyecto?", { a: m.name }))) void act(() => api.del(`/projects/${projectId}/members/${m.user_id}`)); }}
                  className="rounded p-1.5 text-ink-3 hover:text-bad">{self ? <LogOut size={15} /> : <X size={15} />}</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
