import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, KeyRound, Link2, LogOut, Plug, ShieldCheck, Trash2, Unlink, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Identity, User } from "../lib/types";
import { Button, Card, ErrorNote, Field } from "../components/ui";
import { PasswordStrength, passwordOk } from "../components/PasswordStrength";
import { AvatarField } from "../components/AvatarField";
import { OutsideAccessSummary } from "../components/OutsideAccess";
import { Toggle } from "../components/editing";
import { ProviderIcon, SsoButtons, ssoErrorMessage, type SsoProviderInfo } from "../components/SsoButtons";

import { t } from "../lib/i18n";
function Section({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[240px_1fr]">
      <div>
        <p className="flex items-center gap-2 font-semibold">{icon}{title}</p>
        {text && <p className="mt-1 text-sm text-ink-3">{text}</p>}
      </div>
      <div className="max-w-md">{children}</div>
    </Card>
  );
}

function useForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string | void>) => async (e?: FormEvent) => {
    e?.preventDefault(); setBusy(true); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ ok: true, text: t }); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); } finally { setBusy(false); }
  };
  const note = msg && (msg.ok ? <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>);
  return { run, busy, note };
}

type NoticeKind = "assigned" | "tagged" | "status" | "comment";
/** The notification kinds the server sends (server/src/lib/notify.ts NOTIFY_KINDS), each with what it means here. */
const NOTICE_KINDS = (): [NoticeKind, string][] => [
  ["assigned", t("Me asignan un ticket")],
  ["tagged", t("Me mencionan o me etiquetan en un ticket")],
  ["status", t("Se mueve un ticket en el que estoy")],
  ["comment", t("Comentan un ticket en el que estoy")],
];

interface SignIn { identities: Identity[]; has_password: boolean; providers: SsoProviderInfo[] }

export function AccountPage() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState("");
  const profile = useForm(), password = useForm(), sessions = useForm(), danger = useForm(), linking = useForm();
  const signIn = useLoad(() => api.get<SignIn>("/auth/oauth/identities"), []);
  const notices = useLoad(() => api.get<{ email: boolean; email_off?: NoticeKind[] }>("/notifications"), []);
  const saveNotices = (patch: { email?: boolean; email_off?: NoticeKind[] }) => {
    notices.setData((d) => d && { ...d, ...patch });
    void api.put("/notifications/settings", patch).catch(() => notices.reload());
  };
  const emailOff = notices.data?.email_off ?? [];
  const hasPassword = signIn.data?.has_password ?? true;
  const ssoError = ssoErrorMessage(params.get("error"));

  return (
    <div className="page">
      <h1 className="page-title">{t("Mi cuenta")}</h1>
      <p className="mt-2 text-sm text-ink-2">{t("Administra tu perfil, tu seguridad y tus datos.")}</p>
      <div className="mt-8 max-w-4xl space-y-4">
        <Section icon={<UserRound size={16} />} title={t("Perfil")}>
          <form className="space-y-4" onSubmit={profile.run(async () => {
            const { user: u } = await api.patch<{ user: User }>("/auth/me", { name }); setUser(u); return t("Perfil actualizado");
          })}>
            <Field group label={t("Foto de perfil")} hint={t("Se ve en el menú, en Personas de tu organización y en los colaboradores de cada proyecto. Arrástrala y acércala para encuadrarla en el círculo.")}>
              <AvatarField name={user?.name ?? ""} avatar={user?.avatar} onSave={async (url) => {
                const { user: u } = await api.patch<{ user: User }>("/auth/me", { avatar: url }); setUser(u);
              }} />
            </Field>
            <Field label={t("Nombre")}><input className="field" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t("Correo")} hint={t("El correo es tu usuario de acceso.")}><input className="field bg-paper" value={user?.email} disabled /></Field>
            {profile.note}
            <Button variant="primary" disabled={profile.busy}>{t("Guardar")}</Button>
          </form>
        </Section>

        {signIn.data && (signIn.data.providers.length > 0 || signIn.data.identities.length > 0) && (
          <Section icon={<Link2 size={16} />} title={t("Cuentas vinculadas")} text={t("Entra con Google o Microsoft además de tu contraseña. Siempre debe quedarte al menos una forma de entrar.")}>
            <div className="space-y-4">
              {ssoError && <ErrorNote>{ssoError}</ErrorNote>}
              {signIn.data.identities.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {signIn.data.identities.map((i) => (
                    <li key={i.provider} className="flex items-center gap-3 px-4 py-3">
                      <ProviderIcon id={i.provider} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize">{i.provider}</p>
                        <p className="truncate text-xs text-ink-3">{i.email ?? "—"}{i.last_login_at ? ` · ${t("último acceso")} ${timeAgo(i.last_login_at)}` : ""}</p>
                      </div>
                      <Button size="sm" icon={<Unlink size={14} />} disabled={linking.busy || (!hasPassword && signIn.data!.identities.length <= 1)}
                        onClick={() => linking.run(async () => {
                          if (!confirm(t("¿Desvincular {a}? Podrás volver a vincularla cuando quieras.", { a: i.provider }))) return;
                          await api.del(`/auth/oauth/identities/${i.provider}`); signIn.reload();
                        })()}>{t("Desvincular")}</Button>
                    </li>
                  ))}
                </ul>
              )}
              {linking.note}
              {!hasPassword && signIn.data.identities.length <= 1 && <p className="text-xs text-ink-3">{t("Para desvincular tu única cuenta, primero crea una contraseña abajo.")}</p>}
              <SsoButtons compact providers={signIn.data.providers.filter((p) => !signIn.data!.identities.some((i) => i.provider === p.id))} query={{ link: "1", next: "/account" }} label={t("Vincular {a}")} />
            </div>
          </Section>
        )}

        <div id="notificaciones" className="scroll-mt-6">
          <Section icon={<Bell size={16} />} title={t("Notificaciones")} text={t("Te avisamos cuando te asignan un ticket, te mencionan, o cuando se mueve o se comenta un ticket en el que estás. Siempre lo ves en la campana de arriba.")}>
            <Toggle checked={notices.data?.email ?? true} onChange={(email) => saveNotices({ email })} label={t("Avisarme también por correo")}
              hint={t("Un correo a {a} por cada novedad. Lo que tú mismo haces nunca te genera avisos.", { a: user?.email ?? "" })} />
            {(notices.data?.email ?? true) && (
              <fieldset className="mt-4 space-y-2">
                <legend className="mb-1 text-[13px] font-medium text-ink-2">{t("Por correo, avisarme cuando:")}</legend>
                {NOTICE_KINDS().map(([kind, label]) => (
                  <label key={kind} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-accent" checked={!emailOff.includes(kind)} disabled={!notices.data}
                      onChange={(e) => saveNotices({ email_off: e.target.checked ? emailOff.filter((k) => k !== kind) : [...emailOff, kind] })} />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
          </Section>
        </div>

        <Section icon={<KeyRound size={16} />} title={hasPassword ? t("Contraseña") : t("Crear contraseña")}
          text={hasPassword ? t("Al cambiarla, se cierran tus sesiones en otros dispositivos.") : t("Tu cuenta entra con Google o Microsoft. Una contraseña te da una segunda forma de acceso.")}>
          <form className="space-y-4" onSubmit={password.run(async () => {
            if (!passwordOk(pw.next)) throw new Error(t("La nueva contraseña no cumple los requisitos"));
            await api.post("/auth/password", hasPassword ? pw : { next: pw.next }); setPw({ current: "", next: "" }); signIn.reload();
            return hasPassword ? t("Contraseña actualizada") : t("Contraseña creada");
          })}>
            {hasPassword && <Field label={t("Contraseña actual")}><input className="field" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>}
            <div className="space-y-1.5">
              <Field label={t("Nueva contraseña")}><input className="field" type="password" autoComplete="new-password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
              <PasswordStrength value={pw.next} />
            </div>
            {password.note}
            <Button variant="primary" disabled={password.busy}>{hasPassword ? t("Cambiar contraseña") : t("Crear contraseña")}</Button>
          </form>
        </Section>

        <Section icon={<ShieldCheck size={16} />} title={t("Sesiones")} text={t("¿Iniciaste sesión en una computadora compartida? Cierra todas las sesiones.")}>
          <div className="space-y-3">
            {sessions.note}
            <Button icon={<LogOut size={15} />} disabled={sessions.busy} onClick={() => sessions.run(async () => {
              await api.post("/auth/logout-all"); setUser(null); nav("/login");
            })()}>{t("Cerrar sesión en todos los dispositivos")}</Button>
          </div>
        </Section>

        <Section icon={<Plug size={16} />} title={t("Acceso externo (MCP)")}
          text={t("Conecta Claude, ChatGPT u otras apps para que trabajen en tus proyectos. Usan tus mismos permisos y nunca pueden borrar nada. También pueden lanzar, cerrar y publicar estudios, y eso lo ven los participantes al momento. Cuando reemplazan el contenido de un estudio o un documento, la versión anterior queda guardada y se puede restaurar.")}>
          <OutsideAccessSummary />
        </Section>

        <Section icon={<Trash2 size={16} className="text-bad" />} title={t("Eliminar cuenta")} text={t("Se borra de forma permanente y no se puede deshacer.")}>
          {/* What DELETE /api/auth/me really does: it deletes the user row and the database cascades (server/migrations). */}
          <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>{t("Los proyectos de los que eres dueño/a se borran con todo lo que tienen (estudios, respuestas, documentos, insights, tickets y archivos), también si están en una organización o compartidos: sus colaboradores dejan de verlos.")}</li>
            <li>{t("En proyectos de otras personas se borran los estudios, documentos, insights y participantes que creaste tú. Tus tickets y comentarios se quedan, sin autor.")}</li>
            <li>{t("Sales de tus organizaciones y de los proyectos compartidos contigo; esas organizaciones y los demás proyectos siguen igual.")}</li>
            <li>{t("Si quieres conservar un proyecto, pide a quien lo vaya a mantener que lo duplique o exporte antes.")}</li>
          </ul>
          <form className="space-y-3" onSubmit={danger.run(async () => {
            if (!confirm(t("¿Seguro? Esta acción no se puede deshacer."))) return;
            await api.del("/auth/me", hasPassword ? { password: del } : { confirm: del }); setUser(null); nav("/login");
          })}>
            {hasPassword
              ? <Field label={t("Confirma con tu contraseña")}><input className="field" type="password" autoComplete="current-password" required value={del} onChange={(e) => setDel(e.target.value)} /></Field>
              : <Field label={t("Confirma escribiendo tu correo")}><input className="field" type="email" autoComplete="off" required placeholder={user?.email} value={del} onChange={(e) => setDel(e.target.value)} /></Field>}
            {danger.note}
            <Button variant="danger" disabled={danger.busy || !del}>{t("Eliminar mi cuenta y todos mis datos")}</Button>
          </form>
        </Section>
      </div>
    </div>
  );
}
