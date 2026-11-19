import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, KeyRound, Plug, Unplug } from "lucide-react";
import { api } from "../lib/api";
import { copy, timeAgo, useLoad } from "../lib/hooks";
import { plural, t } from "../lib/i18n";
import { Button, ErrorNote } from "./ui";

export type Scope = "read" | "write";
export interface TokenRow { id: string; name: string; hint: string; scope: Scope; created_at: string; last_used_at: string | null; expires_at: string | null }
/** Apps that signed in with OAuth always read and edit (the only OAuth scope is mcp). */
export interface AppRow { id: string; name: string; created_at: string; last_used_at: string | null }
/** GET /api/connect/access: the person's tokens and connected apps, and this install's addresses. */
export interface Access { tokens: TokenRow[]; apps: AppRow[]; mcp_url: string; openapi_url: string; rest_url: string }

const ReadOnly = () => <span className="ml-1.5 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-2">{t("solo lectura")}</span>;

/** A value to paste somewhere else (an address, a token, a command), with a copy button. */
export function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-start gap-2">
      {multiline
        ? <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 text-xs leading-relaxed">{value}</pre>
        : <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2 text-xs">{value}</code>}
      <Button size="sm" aria-label={label} icon={ok ? <Check size={14} /> : <Copy size={14} />}
        onClick={async () => { if (await copy(value)) { setOk(true); setTimeout(() => setOk(false), 1500); } }}>{ok ? t("Copiado") : t("Copiar")}</Button>
    </div>
  );
}

/** Runs a change, then reloads the list; the error is shown next to the list. */
function useRun(reload: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true); setError(null);
    try { await fn(); reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { run, busy, error };
}

const line = "flex items-center gap-3 px-4 py-3";

/** My account: how many apps and tokens have access, and the way to the Connect AI apps page that manages them. */
export function OutsideAccessSummary() {
  const access = useLoad(() => api.get<Access>("/connect/access"), []);
  const d = access.data;
  return (
    <div className="space-y-3">
      {access.error ? <ErrorNote>{access.error}</ErrorNote> : d && (
        <p className="text-sm text-ink-2">
          {d.apps.length === 0 && d.tokens.length === 0 ? t("Ninguna app ni token tiene acceso todavía.")
            : t("{a} y {b}.", { a: plural(d.apps.length, { one: "{n} app conectada", other: "{n} apps conectadas" }), b: plural(d.tokens.length, { one: "{n} token activo", other: "{n} tokens activos" }) })}
        </p>
      )}
      <Link to="/connect" className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent">
        {t("Configurar y ver cómo funciona")} <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/** Apps that signed in with OAuth (Claude.ai, ChatGPT, Claude Desktop…), each with its own way out. */
export function ConnectedApps({ apps, reload }: { apps: AppRow[]; reload: () => void }) {
  const { run, busy, error } = useRun(reload);
  return (
    <div className="space-y-2">
      {apps.length === 0 ? <p className="text-sm text-ink-3">{t("Ninguna app tiene acceso todavía.")}</p> : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {apps.map((a) => (
            <li key={a.id} className={line}>
              <Plug size={16} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-ink-3">{t("Conectada {a}", { a: timeAgo(a.created_at) })}{a.last_used_at ? ` · ${t("último uso")} ${timeAgo(a.last_used_at)}` : ""}</p>
              </div>
              <Button size="sm" icon={<Unplug size={14} />} disabled={busy} onClick={run(async () => {
                if (!confirm(t("¿Quitar el acceso de {a}? Tendrá que volver a pedir permiso.", { a: a.name }))) return;
                await api.del(`/connect/apps/${a.id}`);
              })}>{t("Quitar acceso")}</Button>
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

const EXPIRY = [{ v: 30, l: "30 días" }, { v: 90, l: "90 días" }, { v: 365, l: "1 año" }, { v: null, l: "Sin vencimiento" }] as const;

/**
 * Personal access tokens: the list with revoke, and the form that creates one. A new token is shown once, by the
 * page (`created`), so the setup guides can fill it into their commands.
 */
export function AccessTokens({ tokens, reload, created, onCreated }: { tokens: TokenRow[]; reload: () => void; created: string | null; onCreated: (token: string | null) => void }) {
  const { run, busy, error } = useRun(reload);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState<number | null>(90);
  const [scope, setScope] = useState<Scope>("write");
  return (
    <div className="space-y-3">
      {tokens.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {tokens.map((k) => (
            <li key={k.id} className={line}>
              <KeyRound size={16} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{k.name} <span className="font-mono text-xs text-ink-3">…{k.hint}</span>{k.scope === "read" && <ReadOnly />}</p>
                <p className="text-xs text-ink-3">
                  {k.last_used_at ? `${t("último uso")} ${timeAgo(k.last_used_at)}` : t("Sin usar")}
                  {" · "}{k.expires_at ? t("vence {a}", { a: new Date(k.expires_at).toLocaleDateString() }) : t("sin vencimiento")}
                </p>
              </div>
              <Button size="sm" disabled={busy} onClick={run(async () => {
                if (!confirm(t("¿Revocar {a}? Lo que lo use dejará de funcionar.", { a: k.name }))) return;
                await api.del(`/connect/tokens/${k.id}`);
              })}>{t("Revocar")}</Button>
            </li>
          ))}
        </ul>
      )}
      {created ? (
        <div className="space-y-2 rounded-xl border border-accent bg-accent-soft/40 p-4">
          <p className="text-sm font-medium">{t("Copia tu token ahora. No lo volverás a ver.")}</p>
          <CopyField value={created} label={t("Copiar token")} />
          <p className="text-xs text-ink-3">{t("Las guías de conexión de esta página ya lo incluyen en sus comandos hasta que cierres este aviso.")}</p>
          <Button size="sm" onClick={() => onCreated(null)}>{t("Ya lo copié")}</Button>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
          const r = await api.post<{ token: string }>("/connect/tokens", { name, expires_days: expires, scope });
          onCreated(r.token); setName("");
        })(); }}>
          <label className="min-w-40 flex-1"><span className="mb-1 block text-xs text-ink-3">{t("Nombre")}</span>
            <input className="field" required maxLength={80} placeholder={t("Ej.: Claude Code en mi laptop")} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label><span className="mb-1 block text-xs text-ink-3">{t("Vence en")}</span>
            <select className="field" value={expires ?? ""} onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : null)}>
              {EXPIRY.map((x) => <option key={x.l} value={x.v ?? ""}>{t(x.l)}</option>)}
            </select></label>
          <label><span className="mb-1 block text-xs text-ink-3">{t("Permisos")}</span>
            <select className="field" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="write">{t("Leer y editar")}</option>
              <option value="read">{t("Solo lectura")}</option>
            </select></label>
          <Button variant="primary" disabled={busy || !name.trim()}>{t("Crear token")}</Button>
        </form>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
