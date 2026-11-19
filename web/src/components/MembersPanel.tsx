import { useState, type FormEvent } from "react";
import { Crown, LogOut, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { OrgAccessMember, ProjectMember, ProjectRole } from "../lib/types";
import type { Area } from "../lib/access";
import { AccessPreview, AccessTags, ProfilePicker, ProfileSelect } from "./AccessEditor";
import { ASSIGNABLE_PROJECT_ROLES } from "../lib/roles";
import { Button, Card, ErrorNote, Field, Tag } from "./ui";
import { Avatar } from "./Avatar";
import { t } from "../lib/i18n";
import { NoAccessNote } from "./AccessNotice";

export const roleLabel = (r: ProjectRole) => (r === "owner" ? t("Dueño/a") : r === "editor" ? t("Editor") : r === "commenter" ? t("Comentarista") : t("Solo lectura"));
/** Etiqueta de un proyecto compartido: "Editor · Dueño/a: Ana". Misma forma en la lista y en la cabecera. */
export const sharedLabel = (r: ProjectRole, owner?: string | null) => owner ? `${roleLabel(r)} · ${t("Dueño/a: {a}", { a: owner })}` : roleLabel(r);

/** Quién tiene acceso al proyecto. El dueño agrega, cambia roles y quita; los demás pueden salirse. */
export function MembersPanel({ projectId, myRole, members, viaOrg = [], onChange }: { projectId: string; myRole: ProjectRole; members: ProjectMember[]; viaOrg?: OrgAccessMember[]; onChange: () => void }) {
  const { user: me } = useAuth();
  const owner = myRole === "owner";
  const [form, setForm] = useState<{ email: string; role: ProjectRole; areas: Area[] }>({ email: "", role: "editor", areas: ["research", "tickets"] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const add = (e: FormEvent) => { e.preventDefault(); return act(async () => { await api.post(`/projects/${projectId}/members`, form); setForm({ email: "", role: "editor", areas: ["research", "tickets"] }); }); };

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="font-semibold">{t("Colaboradores")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("Elige qué secciones abre cada persona y qué puede hacer en ellas. Editores crean y cambian, comentaristas ven y comentan, solo lectura ve sin cambiar nada. Solo quien es dueño agrega personas, archiva o elimina el proyecto.")}</p>
        {!owner && <NoAccessNote className="mt-3">{t("No tienes acceso para agregar personas ni cambiar roles: eso solo lo hace quien es dueño/a del proyecto.")}</NoAccessNote>}
        {owner && (
          <form className="mt-4 space-y-4" onSubmit={add}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1"><Field label={t("Correo de una cuenta existente")}><input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
              <Field label={t("Rol")}>
                <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ProjectRole })}>
                  {ASSIGNABLE_PROJECT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </Field>
              <Button variant="primary" icon={<UserPlus size={15} />} disabled={busy}>{t("Agregar")}</Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
              <div className="space-y-1.5"><p className="text-sm font-medium">{t("¿Qué secciones puede abrir?")}</p><ProfilePicker name="member-profile" value={form.areas} onChange={(areas) => setForm({ ...form, areas })} /></div>
              <div className="space-y-1.5"><p className="text-sm font-medium">{t("Así queda su acceso")}</p><AccessPreview areas={form.areas} /></div>
            </div>
          </form>
        )}
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </Card>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {members.map((m) => {
          const self = m.user_id === me?.id;
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Avatar name={m.name} avatar={m.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-3">({t("tú")})</span>}</p>
                <p className="truncate text-xs text-ink-3">{m.email}</p>
              </div>
              {m.role !== "owner" && (owner
                ? <ProfileSelect value={m.areas ?? ["research", "tickets"]} disabled={busy} label={t("Secciones de {a}", { a: m.name })} onChange={(areas) => act(() => api.patch(`/projects/${projectId}/members/${m.user_id}`, { areas }))} />
                : <AccessTags areas={m.areas ?? ["research", "tickets"]} />)}
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
      {viaOrg.length > 0 && (
        <div>
          <p className="text-sm font-semibold">{t("Con acceso por la organización")}</p>
          <p className="mt-0.5 mb-2 text-xs text-ink-3">{t("Llegan a este proyecto por su rol en la organización. Su acceso se cambia en Personas, dentro de la organización.")}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {viaOrg.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Avatar name={m.name} avatar={m.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name}{m.user_id === me?.id && <span className="ml-1.5 text-xs font-normal text-ink-3">({t("tú")})</span>}</p>
                  <p className="truncate text-xs text-ink-3">{m.email}</p>
                </div>
                {m.org_role === "member" ? <AccessTags areas={m.areas} level={m.role} /> : <Tag>{m.org_role === "owner" ? t("Dueño/a de la organización") : t("Admin de la organización")}</Tag>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
