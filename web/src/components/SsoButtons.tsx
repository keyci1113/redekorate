import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cx } from "./ui";
import { t } from "../lib/i18n";

export type SsoProvider = "google" | "microsoft";
export interface SsoProviderInfo { id: SsoProvider; name: string }

/** Proveedores configurados en el servidor; [] mientras carga o si no hay ninguno. */
export function useSsoProviders() {
  const [list, setList] = useState<SsoProviderInfo[]>([]);
  useEffect(() => { api.get<{ providers: SsoProviderInfo[] }>("/auth/oauth/providers").then((r) => setList(r.providers)).catch(() => {}); }, []);
  return list;
}

/** Mensajes para los códigos ?error=oauth_* con los que vuelve el servidor. */
export function ssoErrorMessage(code: string | null): string | null {
  if (!code?.startsWith("oauth_")) return null;
  switch (code.slice(6)) {
    case "denied": return t("Cancelaste el inicio de sesión. Puedes intentarlo de nuevo.");
    case "state": return t("El inicio de sesión expiró o no coincide. Inténtalo de nuevo.");
    case "email": return t("El proveedor no compartió un correo verificado. Usa otra cuenta o regístrate con tu correo.");
    case "closed": return t("El registro está cerrado. Pide una invitación a la administradora.");
    case "disabled": return t("Esta cuenta está desactivada.");
    case "invite": return t("La invitación no es válida o ya venció.");
    case "invite_email": return t("Entra con la cuenta del correo al que se envió la invitación.");
    case "taken": return t("Esa cuenta ya está vinculada a otro usuario.");
    case "config": return t("Ese proveedor no está configurado en esta instancia.");
    default: return t("No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
  }
}

export function ProviderIcon({ id, size = 18 }: { id: SsoProvider; size?: number }) {
  if (id === "google") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
        <path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" /><rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" /><rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

/**
 * Botones "Continuar con Google / Microsoft". Son enlaces: el inicio es una navegación completa al servidor,
 * que redirige al proveedor. `query` lleva la invitación, el destino o el modo vincular.
 */
export function SsoButtons({ providers, query = {}, label = t("Continuar con {a}"), compact }: {
  providers: SsoProviderInfo[]; query?: Record<string, string | undefined>; label?: string; compact?: boolean;
}) {
  if (!providers.length) return null;
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className={cx("grid gap-3", providers.length > 1 && compact && "sm:grid-cols-2")}>
      {providers.map((p) => (
        <a key={p.id} href={`/api/auth/oauth/${p.id}/start${qs ? `?${qs}` : ""}`}
          className={cx("focus-ring flex items-center justify-center gap-3 rounded-lg border border-line bg-surface font-medium transition hover:border-line-2 hover:bg-paper", compact ? "h-11 text-sm" : "h-13 text-base")}>
          <ProviderIcon id={p.id} /> {label.replace("{a}", p.name)}
        </a>
      ))}
    </div>
  );
}

/** Separador "o con tu correo" entre los botones externos y el formulario. */
export function SsoDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-3" role="separator">
      <span className="h-px flex-1 bg-line" />{children}<span className="h-px flex-1 bg-line" />
    </div>
  );
}
