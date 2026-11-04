import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";
import { Button, Card, ErrorNote, Field } from "../components/ui";
import { PasswordStrength, passwordOk } from "../components/PasswordStrength";

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

export function AccountPage() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState("");
  const profile = useForm(), password = useForm(), sessions = useForm(), danger = useForm();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="display text-5xl">{t("Mi cuenta")}</h1>
      <p className="mt-2 text-sm text-ink-2">{t("Administra tu perfil, tu seguridad y tus datos.")}</p>
      <div className="mt-8 space-y-4">
        <Section icon={<UserRound size={16} />} title={t("Perfil")}>
          <form className="space-y-4" onSubmit={profile.run(async () => {
            const { user: u } = await api.patch<{ user: User }>("/auth/me", { name }); setUser(u); return t("Perfil actualizado");
          })}>
            <Field label={t("Nombre")}><input className="field" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t("Correo")} hint={t("El correo es tu usuario de acceso.")}><input className="field bg-paper" value={user?.email} disabled /></Field>
            {profile.note}
            <Button variant="primary" disabled={profile.busy}>{t("Guardar")}</Button>
          </form>
        </Section>

        <Section icon={<KeyRound size={16} />} title={t("Contraseña")} text={t("Al cambiarla, se cierran tus sesiones en otros dispositivos.")}>
          <form className="space-y-4" onSubmit={password.run(async () => {
            if (!passwordOk(pw.next)) throw new Error(t("La nueva contraseña no cumple los requisitos"));
            await api.post("/auth/password", pw); setPw({ current: "", next: "" }); return t("Contraseña actualizada");
          })}>
            <Field label={t("Contraseña actual")}><input className="field" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <div className="space-y-1.5">
              <Field label={t("Nueva contraseña")}><input className="field" type="password" autoComplete="new-password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
              <PasswordStrength value={pw.next} />
            </div>
            {password.note}
            <Button variant="primary" disabled={password.busy}>{t("Cambiar contraseña")}</Button>
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

        <Section icon={<Trash2 size={16} className="text-bad" />} title={t("Eliminar cuenta")} text={t("Se borran de forma permanente tus proyectos, estudios, respuestas de participantes, insights e imágenes.")}>
          <form className="space-y-3" onSubmit={danger.run(async () => {
            if (!confirm(t("¿Seguro? Esta acción no se puede deshacer."))) return;
            await api.del("/auth/me", { password: del }); setUser(null); nav("/login");
          })}>
            <Field label={t("Confirma con tu contraseña")}><input className="field" type="password" autoComplete="current-password" required value={del} onChange={(e) => setDel(e.target.value)} /></Field>
            {danger.note}
            <Button variant="danger" disabled={danger.busy || !del}>{t("Eliminar mi cuenta y todos mis datos")}</Button>
          </form>
        </Section>
      </div>
    </div>
  );
}
