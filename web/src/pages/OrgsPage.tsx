import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Building2, Check, Copy, Crown, FolderOpen, LogOut, Mail, Plus, Settings, Trash2, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo, useLoad } from "../lib/hooks";
import { assignableOrgRoles, canManageOrg } from "../lib/roles";
import type { OrgInvite, OrgMember, OrgRole, Organization, Project } from "../lib/types";
import { Button, Card, Empty, ErrorNote, Field, Modal, Spinner, Tabs, Tag, cx } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { OrgLogo } from "../components/OrgLogo";
import { OrgForm } from "../components/OrgForm";
import { getLang, t } from "../lib/i18n";

export const orgRoleLabel = (r: OrgRole) => (r === "owner" ? t("Dueño/a") : r === "admin" ? t("Admin") : t("Miembro"));
const fmt = (d: string) => new Date(d).toLocaleDateString(getLang() === "en" ? "en-US" : "es", { day: "numeric", month: "short", year: "numeric" });

/** All the organizations the person belongs to, and the form to create a new one. */
export function OrgsPage() {
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.get<{ organizations: Organization[] }>("/orgs"), []);
  const [open, setOpen] = useState(false);
  const list = data?.organizations ?? [];
  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="page-title">{t("Organizaciones")}</h1>
          <p className="mt-2 text-[15px] text-ink-2">{t("Un espacio con logo para tu empresa, tu equipo o tus clientes. Quien pertenece a una organización ve todos sus proyectos y puede comentar en ellos.")}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nueva organización")}</Button>
      </div>
      <div className="mt-7">
        {loading ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : list.length === 0 ? (
          <Empty icon={<Building2 size={20} />} title={t("Aún no perteneces a ninguna organización")} text={t("Crea una para tu empresa o tu equipo, o pide que te agreguen a una existente.")}
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nueva organización")}</Button>} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((o) => (
              <li key={o.id}>
                <Link to={`/orgs/${o.id}`} className="focus-ring group flex h-full items-center gap-4 rounded-xl border border-line bg-surface p-5 transition hover:border-line-2 hover:shadow-(--shadow-lift)">
                  <OrgLogo name={o.name} logo={o.logo} color={o.color} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[19px] font-bold tracking-[-0.02em]">{o.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-2 tabular-nums">{t("{a} proyectos · {b} personas", { a: o.project_count, b: o.member_count })}</span>
                    <span className="mt-1.5 inline-block"><Tag>{orgRoleLabel(o.role)}</Tag></span>
                  </span>
                  <ArrowRight size={16} aria-hidden className="shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transform-none" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("Nueva organización")}>
        <OrgForm submitLabel={t("Crear organización")} onSubmit={async (v) => {
          const { organization } = await api.post<{ organization: Organization }>("/orgs", v);
          setOpen(false); reload(); nav(`/orgs/${organization.id}`);
        }} />
      </Modal>
    </div>
  );
}

/** One organization: its projects, its people, pending invitations and settings. */
export function OrgPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<"projects" | "people" | "settings">("projects");
  const org = useLoad(() => api.get<{ organization: Organization }>(`/orgs/${id}`), [id]);
  const projects = useLoad(() => api.get<{ projects: Project[] }>(`/orgs/${id}/projects`), [id]);
  const members = useLoad(() => api.get<{ members: OrgMember[] }>(`/orgs/${id}/members`), [id]);
  if (org.loading) return <Spinner />;
  if (org.error || !org.data) return <div className="p-10"><ErrorNote>{org.error}</ErrorNote></div>;
  const o = org.data.organization;
  const manage = canManageOrg(o.role);
  const list = projects.data?.projects ?? [];

  return (
    <div className="page">
      <Link to="/orgs" className="text-sm text-ink-3 hover:text-ink">{t("← Organizaciones")}</Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <OrgLogo name={o.name} logo={o.logo} color={o.color} size={64} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{o.name}</h1><Tag>{orgRoleLabel(o.role)}</Tag></div>
          <p className="mt-1 text-sm text-ink-2 tabular-nums">{t("{a} proyectos · {b} personas", { a: o.project_count, b: o.member_count })}</p>
        </div>
      </div>
      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} items={[
          { id: "projects", label: t("Proyectos"), count: list.length },
          { id: "people", label: t("Personas"), count: members.data?.members.length ?? 0 },
          ...(manage ? [{ id: "settings" as const, label: t("Ajustes") }] : []),
        ]} />
      </div>
      <div className="mt-6">
        {tab === "projects" && (projects.loading ? <Spinner /> : list.length === 0 ? (
          <Empty icon={<FolderOpen size={20} />} title={t("Esta organización aún no tiene proyectos")} text={t("Crea un proyecto y elige esta organización como su espacio, o mueve uno existente desde Editar proyecto.")}
            action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => nav(`/projects?crear=1&org=${o.id}`)}>{t("Nuevo proyecto")}</Button>} />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {list.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="focus-ring flex items-center gap-4 px-5 py-3.5 transition hover:bg-ink/5">
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}{p.archived && <span className="ml-2 text-xs font-normal text-ink-3">· {t("archivado")}</span>}</span>
                    <span className="block text-xs text-ink-3">{t("{a} estudios · dueño/a {b} · actualizado {c}", { a: p.study_count ?? 0, b: p.owner_name ?? "", c: timeAgo(p.updated_at) })}</span>
                  </span>
                  <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        ))}
        {tab === "people" && (members.loading ? <Spinner /> : <People org={o} members={members.data?.members ?? []} onChange={() => { members.reload(); org.reload(); }} />)}
        {tab === "settings" && manage && <OrgSettings org={o} onChange={org.reload} />}
      </div>
    </div>
  );
}

function People({ org, members, onChange }: { org: Organization; members: OrgMember[]; onChange: () => void }) {
  const { user: me } = useAuth();
  const manage = canManageOrg(org.role);
  const roles = assignableOrgRoles(org.role);
  const [form, setForm] = useState<{ email: string; role: OrgRole }>({ email: "", role: "member" });
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [sent, setSent] = useState<{ link: string; mailed: boolean; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (manage) api.get<{ invites: OrgInvite[] }>(`/orgs/${org.id}/invites`).then((r) => setInvites(r.invites)).catch(() => {}); }, [org.id, manage]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); onChange(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const add = (e: FormEvent) => { e.preventDefault(); return act(async () => { await api.post(`/orgs/${org.id}/members`, form); setForm({ email: "", role: "member" }); }); };
  const invite = () => act(async () => {
    const r = await api.post<{ invites: OrgInvite[]; link: string; mailed: boolean }>(`/orgs/${org.id}/invites`, { email: form.email, role: form.role === "owner" ? "admin" : form.role });
    setInvites(r.invites); setSent({ link: r.link, mailed: r.mailed, email: form.email }); setForm({ email: "", role: "member" });
  });
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="font-semibold">{t("Personas")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("Miembros ven todos los proyectos de la organización y pueden comentar. Admins además cambian ajustes y personas. Solo quien es dueño elimina la organización.")}</p>
        {manage && (
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={add}>
            <div className="flex-1"><Field label={t("Correo")}><input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
            <Field label={t("Rol")}>
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as OrgRole })}>
                {roles.map((r) => <option key={r} value={r}>{orgRoleLabel(r)}</option>)}
              </select>
            </Field>
            <Button variant="primary" icon={<UserPlus size={15} />} disabled={busy}>{t("Agregar")}</Button>
            <Button type="button" icon={<Mail size={15} />} disabled={busy || !form.email} onClick={invite} title={t("Para quien aún no tiene cuenta")}>{t("Invitar")}</Button>
          </form>
        )}
        {manage && <p className="mt-2 text-xs text-ink-3">{t("Agregar: una cuenta que ya existe. Invitar: envía un enlace de 7 días para crear la cuenta y entrar directo a la organización.")}</p>}
        {sent && (
          <div className="mt-3 rounded-lg bg-good-soft p-3 text-sm text-good">
            {sent.mailed ? t("Invitación enviada a {a}.", { a: sent.email }) : t("No hay correo configurado: copia el enlace y envíalo a {a}.", { a: sent.email })}
            <div className="mt-2 flex gap-2">
              <input readOnly className="field font-mono text-[12px]" value={sent.link} onFocus={(e) => e.target.select()} />
              <Button size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(sent.link)}>{copied ? t("Copiado") : t("Copiar")}</Button>
            </div>
          </div>
        )}
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </Card>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {members.map((m) => {
          const self = m.user_id === me?.id;
          const editable = manage && (org.role === "owner" || m.role !== "owner");
          return (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Avatar name={m.name} avatar={m.avatar} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-3">({t("tú")})</span>}</p>
                <p className="truncate text-xs text-ink-3">{m.email}</p>
              </div>
              {editable ? (
                <select className="field h-8 w-32 py-0 text-[13px]" value={m.role} disabled={busy} aria-label={t("Rol de {a}", { a: m.name })} onChange={(e) => act(() => api.patch(`/orgs/${org.id}/members/${m.user_id}`, { role: e.target.value }))}>
                  {roles.map((r) => <option key={r} value={r}>{orgRoleLabel(r)}</option>)}
                </select>
              ) : <Tag><span className="flex items-center gap-1">{m.role === "owner" && <Crown size={11} />} {orgRoleLabel(m.role)}</span></Tag>}
              {(editable || self) && (
                <button disabled={busy} title={self ? t("Salir de la organización") : t("Quitar")} aria-label={self ? t("Salir de la organización") : t("Quitar")}
                  onClick={() => { if (confirm(self ? t("¿Salir de esta organización? Dejarás de ver sus proyectos.") : t("¿Quitar a {a} de la organización?", { a: m.name }))) void act(() => api.del(`/orgs/${org.id}/members/${m.user_id}`)); }}
                  className="rounded p-1.5 text-ink-3 hover:text-bad">{self ? <LogOut size={15} /> : <X size={15} />}</button>
              )}
            </li>
          );
        })}
      </ul>
      {manage && invites.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Invitaciones pendientes")}</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Mail size={15} className="text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{i.email} <span className="text-xs text-ink-3">· {orgRoleLabel(i.role)} · {t("vence")} {fmt(i.expires_at)}</span></span>
                <button disabled={busy} aria-label={t("Revocar invitación")} title={t("Revocar invitación")} className="rounded p-1.5 text-ink-3 hover:text-bad"
                  onClick={() => act(async () => { const r = await api.del<{ invites: OrgInvite[] }>(`/orgs/${org.id}/invites/${i.id}`); setInvites(r.invites); })}><X size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[240px_1fr]">
      <div><p className="flex items-center gap-2 font-semibold">{icon}{title}</p>{text && <p className="mt-1 text-sm text-ink-3">{text}</p>}</div>
      <div className="max-w-md">{children}</div>
    </Card>
  );
}

function OrgSettings({ org, onChange }: { org: Organization; onChange: () => void }) {
  const nav = useNavigate();
  const [saved, setSaved] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="max-w-4xl space-y-4">
      <Section icon={<Settings size={16} />} title={t("Perfil de la organización")} text={t("El logo y el color se proponen como marca en los estudios nuevos de sus proyectos y aparecen en los reportes públicos.")}>
        <OrgForm initial={{ name: org.name, color: org.color, logo: org.logo }} submitLabel={saved ? t("Guardado") : t("Guardar")} onSubmit={async (v) => {
          await api.patch(`/orgs/${org.id}`, v); setSaved(true); setTimeout(() => setSaved(false), 1500); onChange();
        }} />
      </Section>
      {org.role === "owner" && (
        <Section icon={<Trash2 size={16} className="text-bad" />} title={t("Eliminar organización")} text={t("Los proyectos no se borran: vuelven a ser proyectos personales de sus dueños. Las personas pierden el acceso que tenían por la organización.")}>
          <div className="space-y-3">
            <Field label={t("Escribe el nombre de la organización para confirmar")}><input className="field" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={org.name} /></Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="danger" icon={<Trash2 size={15} />} disabled={confirmName.trim() !== org.name} onClick={async () => {
              try { await api.del(`/orgs/${org.id}`); nav("/orgs"); } catch (e) { setError((e as Error).message); }
            }}>{t("Eliminar organización")}</Button>
          </div>
        </Section>
      )}
    </div>
  );
}

/** Small chip with the organization a project belongs to, for cards and headers. */
export function OrgChip({ id, name, logo, color, className }: { id: string; name: string; logo?: string | null; color?: string | null; className?: string }) {
  return (
    <Link to={`/orgs/${id}`} className={cx("focus-ring inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:border-line-2 hover:text-ink", className)} title={name}>
      <OrgLogo name={name} logo={logo} color={color} size={14} /><span className="truncate">{name}</span>
    </Link>
  );
}

