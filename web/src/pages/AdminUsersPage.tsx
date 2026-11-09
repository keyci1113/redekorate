import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Check, Copy, Mail, ShieldCheck, UserRoundX, UsersRound, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AdminUser, Invite, Role } from "../lib/types";
import { Button, Card, ErrorNote, Field, Spinner, Tag, cx } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { getLang, t } from "../lib/i18n";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(getLang() === "en" ? "en-US" : "es", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Administración de la instancia: quién tiene cuenta, con qué rol, e invitaciones pendientes. */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ email: string; role: Role }>({ email: "", role: "member" });
  const [sent, setSent] = useState<{ link: string; mailed: boolean; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([api.get<{ users: AdminUser[] }>("/admin/users"), api.get<{ invites: Invite[] }>("/admin/invites")])
    .then(([u, i]) => { setUsers(u.users); setInvites(i.invites); }).catch((e) => setError((e as Error).message));
  useEffect(() => { if (me?.role === "admin") void load(); }, [me?.role]);

  if (me && me.role !== "admin") return <Navigate to="/" replace />;

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(null); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const patch = (id: string, body: { role?: Role; disabled?: boolean }) => act(() => api.patch(`/admin/users/${id}`, body));
  const invite = (e: FormEvent) => { e.preventDefault(); return act(async () => {
    const r = await api.post<{ link: string; mailed: boolean }>("/admin/invites", form);
    setSent({ ...r, email: form.email }); setForm({ email: "", role: "member" });
  }); };
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});

  return (
    <div className="page">
      <h1 className="page-title">{t("Usuarios")}</h1>
      <p className="mt-2 text-sm text-ink-2">{t("Quién puede entrar a esta instancia y con qué rol. Las personas administradoras gestionan usuarios e invitaciones; el resto trabaja en sus propios proyectos.")}</p>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-8 space-y-4">
        <Card className="p-6">
          <p className="flex items-center gap-2 font-semibold"><Mail size={16} /> {t("Invitar a alguien")}</p>
          <p className="mt-1 text-sm text-ink-3">{t("La invitación llega por correo, vale 7 días y permite crear la cuenta aunque el registro esté cerrado.")}</p>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={invite}>
            <div className="flex-1"><Field label={t("Correo")}><input className="field" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
            <Field label={t("Rol")}>
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="member">{t("Miembro")}</option>
                <option value="admin">{t("Admin")}</option>
              </select>
            </Field>
            <Button variant="primary" disabled={busy}>{t("Invitar")}</Button>
          </form>
          {sent && (
            <div className="mt-4 rounded-lg bg-good-soft p-3 text-sm text-good">
              <p>{sent.mailed ? t("Invitación enviada a {a}.", { a: sent.email }) : t("Sin correo configurado: comparte este enlace con {a}.", { a: sent.email })}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-[12px] text-ink">{sent.link}</code>
                <Button size="sm" variant="ghost" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => copy(sent.link)}>{copied ? t("Copiado") : t("Copiar")}</Button>
              </div>
            </div>
          )}
          {invites.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  <Tag>{i.role === "admin" ? t("Admin") : t("Miembro")}</Tag>
                  <span className="hidden text-xs text-ink-3 sm:inline">{t("vence")} {fmt(i.expires_at)}</span>
                  <button onClick={() => act(() => api.del(`/admin/invites/${i.id}`))} className="rounded p-1 text-ink-3 hover:text-bad" aria-label={t("Revocar invitación")}><X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <p className="flex items-center gap-2 font-semibold"><UsersRound size={16} /> {t("Cuentas")} {users && <span className="text-ink-3">· {users.length}</span>}</p>
          {!users ? <div className="py-8"><Spinner /></div> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                  <tr><th scope="col" className="py-2 pr-3">{t("Persona")}</th><th scope="col" className="py-2 pr-3">{t("Rol")}</th><th scope="col" className="py-2 pr-3">{t("Estado")}</th><th scope="col" className="py-2 pr-3">{t("Último acceso")}</th><th scope="col" className="py-2 pr-3">{t("Proyectos")}</th><th scope="col"><span className="sr-only">{t("Acciones")}</span></th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((u) => {
                    const self = u.id === me?.id, off = !!u.disabled_at;
                    return (
                      <tr key={u.id} className={cx(off && "text-ink-3")}>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} avatar={u.avatar} size={32} className={cx(off && "opacity-50")} />
                            <div className="min-w-0">
                              <p className="font-medium text-ink">{u.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-3">({t("tú")})</span>}</p>
                              <p className="truncate text-xs text-ink-3">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <select className="field h-8 w-32 py-0 text-[13px]" value={u.role} disabled={self || busy} aria-label={t("Rol de {a}", { a: u.name })} onChange={(e) => patch(u.id, { role: e.target.value as Role })}>
                            <option value="member">{t("Miembro")}</option>
                            <option value="admin">{t("Admin")}</option>
                          </select>
                        </td>
                        <td className="py-2.5 pr-3">{off ? <Tag>{t("Desactivada")}</Tag> : <span className="flex items-center gap-1 text-good"><ShieldCheck size={13} /> {t("Activa")}</span>}</td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{fmt(u.last_login_at)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{u.project_count}</td>
                        <td className="py-2.5 text-right">
                          {!self && (off
                            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch(u.id, { disabled: false })}>{t("Reactivar")}</Button>
                            : <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<UserRoundX size={14} />} disabled={busy} onClick={() => { if (confirm(t("¿Desactivar la cuenta de {a}? Se cerrarán sus sesiones y no podrá entrar hasta que la reactives.", { a: u.name }))) patch(u.id, { disabled: true }); }}>{t("Desactivar")}</Button>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
