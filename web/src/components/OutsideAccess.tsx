import { useState } from "react";
import { Check, Copy, KeyRound, Plug, Unplug } from "lucide-react";
import { api } from "../lib/api";
import { copy, timeAgo, useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import { Button, ErrorNote, Field } from "./ui";

interface TokenRow { id: string; name: string; hint: string; created_at: string; last_used_at: string | null; expires_at: string | null }
interface AppRow { id: string; name: string; created_at: string; last_used_at: string | null }
interface Access { tokens: TokenRow[]; apps: AppRow[]; mcp_url: string }

function CopyField({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2 text-xs">{value}</code>
      <Button size="sm" aria-label={label} icon={ok ? <Check size={14} /> : <Copy size={14} />}
        onClick={async () => { if (await copy(value)) { setOk(true); setTimeout(() => setOk(false), 1500); } }}>{ok ? t("Copiado") : t("Copiar")}</Button>
    </div>
  );
}

const EXPIRY = [{ v: 30, l: "30 días" }, { v: 90, l: "90 días" }, { v: 365, l: "1 año" }, { v: null, l: "Sin vencimiento" }] as const;

/** Account page: the MCP server address, apps connected with OAuth, and personal access tokens. */
export function OutsideAccess() {
  const access = useLoad(() => api.get<Access>("/connect/access"), []);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState<number | null>(90);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = access.data;

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true); setError(null);
    try { await fn(); access.reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!d) return access.error ? <ErrorNote>{access.error}</ErrorNote> : null;
  const line = "flex items-center gap-3 px-4 py-3";
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Field label={t("Dirección del servidor MCP")} hint={t("En Claude.ai o ChatGPT: agrega un conector personalizado con esta dirección y entra con tu cuenta. En Claude Code, Claude Desktop o Cursor también puedes usar un token.")}>
          <CopyField value={d.mcp_url} label={t("Copiar dirección")} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Apps conectadas")}</p>
        {d.apps.length === 0 ? <p className="text-sm text-ink-3">{t("Ninguna app tiene acceso todavía.")}</p> : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {d.apps.map((a) => (
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
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("Tokens de acceso")}</p>
        {d.tokens.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {d.tokens.map((k) => (
              <li key={k.id} className={line}>
                <KeyRound size={16} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{k.name} <span className="font-mono text-xs text-ink-3">…{k.hint}</span></p>
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
            <p className="text-xs text-ink-3">{t("Para Claude Code:")}</p>
            <CopyField value={`claude mcp add --transport http redekorate ${d.mcp_url} --header "Authorization: Bearer ${created}"`} label={t("Copiar comando")} />
            <Button size="sm" onClick={() => setCreated(null)}>{t("Ya lo copié")}</Button>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
            const r = await api.post<{ token: string }>("/connect/tokens", { name, expires_days: expires });
            setCreated(r.token); setName("");
          })(); }}>
            <label className="min-w-40 flex-1"><span className="mb-1 block text-xs text-ink-3">{t("Nombre")}</span>
              <input className="field" required maxLength={80} placeholder={t("Ej.: Claude Code en mi laptop")} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label><span className="mb-1 block text-xs text-ink-3">{t("Vence en")}</span>
              <select className="field" value={expires ?? ""} onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : null)}>
                {EXPIRY.map((x) => <option key={x.l} value={x.v ?? ""}>{t(x.l)}</option>)}
              </select></label>
            <Button variant="primary" disabled={busy || !name.trim()}>{t("Crear token")}</Button>
          </form>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </div>
  );
}
