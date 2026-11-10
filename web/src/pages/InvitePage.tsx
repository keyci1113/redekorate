import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { Button, ErrorNote, Field, Spinner } from "../components/ui";
import { PasswordStrength, passwordOk } from "../components/PasswordStrength";
import { AuthShell, PasswordInput } from "./LoginPage";
import { t } from "../lib/i18n";

/** Crear cuenta a partir de una invitación: funciona aunque el registro esté cerrado. */
export function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, register } = useAuth();
  const [inv, setInv] = useState<{ email: string; role: Role; invited_by: string | null; organization?: string | null } | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", password: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<{ invite: typeof inv }>(`/auth/invite/${encodeURIComponent(token)}`)
      .then((r) => setInv(r.invite)).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, [token]);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!inv) return;
    if (!passwordOk(form.password)) { setError(t("Tu contraseña aún no cumple los requisitos.")); return; }
    setBusy(true); setError(null);
    try { await register(form.name, inv.email, form.password, token); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <AuthShell>
      <h1 className="display text-4xl sm:text-5xl">{t("Te invitaron a Redekorate")}</h1>
      {loading ? <div className="mt-10"><Spinner /></div> : !inv ? (
        <div className="mt-6 space-y-4">
          <ErrorNote>{error ?? t("El enlace no tiene token. Ábrelo directamente desde el correo.")}</ErrorNote>
          <Link to="/login" className="text-sm font-medium text-accent">{t("← Volver a iniciar sesión")}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5">
          <p className="text-base text-ink-2">
            {inv.invited_by ? t("{a} te invitó", { a: inv.invited_by }) : t("Tienes una invitación")}{inv.organization ? ` ${t("a la organización")} ${inv.organization}` : ""}{inv.role === "admin" ? ` · ${t("como administradora")}` : ""}. {t("Crea tu contraseña para entrar.")}
          </p>
          <Field label={t("Correo")}><input className="field h-13 bg-paper text-base" value={inv.email} disabled /></Field>
          <Field label={t("Nombre")}><input className="field h-13 text-base" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-ink-2">{t("Contraseña")}</span>
            <PasswordInput value={form.password} onChange={(password) => setForm({ ...form, password })} autoComplete="new-password" />
            <PasswordStrength value={form.password} />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="primary" size="lg" className="!h-14 w-full !text-base" disabled={busy}>{busy ? t("Un momento…") : t("Crear cuenta")}</Button>
        </form>
      )}
    </AuthShell>
  );
}
