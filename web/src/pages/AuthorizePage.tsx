import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Check, Eye, PencilLine, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { t } from "../lib/i18n";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";
import { Logo } from "../components/Logo";

interface Info { client?: { name: string }; redirect_host?: string; redirect?: string }

/**
 * OAuth consent: an outside app (Claude, ChatGPT, an MCP client) asks to act as this person through the MCP server.
 * The server's /oauth/authorize sends people here with the original query; signing in first comes back here.
 */
export function AuthorizePage() {
  const { user, loading, logout } = useAuth();
  const { search, pathname } = useLocation();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"allowed" | "denied" | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<Info>(`/connect/authorize${search}`).then((r) => {
      if (r.redirect) window.location.replace(r.redirect);   // the app gets the error (bad request), not the person
      else setInfo(r);
    }).catch((e) => setError((e as Error).message));
  }, [user, search]);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;

  async function answer(approve: boolean) {
    setBusy(true); setError(null);
    try {
      const q = Object.fromEntries(new URLSearchParams(search));
      const { redirect } = await api.post<{ redirect: string }>("/connect/authorize", { ...q, approve });
      setDone(approve ? "allowed" : "denied");
      window.location.href = redirect;
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const app = info?.client?.name ?? "";
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <Logo />
        {error ? (
          <div className="mt-6 space-y-4">
            <ErrorNote>{error}</ErrorNote>
            <Link to="/" className="text-sm text-accent underline">{t("Ir a mis proyectos")}</Link>
          </div>
        ) : !info ? <Spinner /> : done ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-2"><Check size={16} className="text-good" />
            {done === "allowed" ? t("Listo. Vuelve a {a} para continuar.", { a: app }) : t("Cancelaste el acceso. Puedes cerrar esta pestaña.")}</p>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">{t("{a} quiere acceder a tu cuenta de redekorate", { a: app })}</h1>
            <p className="mt-2 text-sm text-ink-3">{t("Conectado como {a}.", { a: user.email })}{" "}
              <button type="button" className="text-accent underline" onClick={() => void logout()}>{t("Usar otra cuenta")}</button></p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3"><Eye size={16} className="mt-0.5 shrink-0 text-accent" />{t("Ver tus proyectos, estudios, resultados, documentos e insights.")}</li>
              <li className="flex gap-3"><PencilLine size={16} className="mt-0.5 shrink-0 text-accent" />{t("Crear y editar proyectos, estudios, documentos e insights, y lanzar o cerrar estudios.")}</li>
              <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" />{t("Usa tus mismos permisos en cada proyecto. No puede borrar nada ni ver los datos personales de los participantes.")}</li>
            </ul>
            <p className="mt-6 text-xs text-ink-3">{t("Después te enviaremos de vuelta a {a}. Puedes quitar el acceso cuando quieras en Mi cuenta.", { a: info.redirect_host ?? "" })}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button icon={<X size={15} />} disabled={busy} onClick={() => void answer(false)}>{t("Cancelar")}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void answer(true)}>{t("Permitir acceso")}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
