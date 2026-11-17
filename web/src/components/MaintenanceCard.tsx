// Admin switch for maintenance mode (Users page). While on, everyone but admins sees the maintenance screen.
import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { api } from "../lib/api";
import { Button, Card, ErrorNote, Field } from "./ui";
import { getLang, t } from "../lib/i18n";

interface Maintenance { on: boolean; message: string; since: string | null }

export function MaintenanceCard() {
  const [m, setM] = useState<Maintenance | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ maintenance: Maintenance }>("/admin/maintenance").then((r) => { setM(r.maintenance); setMessage(r.maintenance.message); }, (e) => setError((e as Error).message));
  }, []);

  async function save(on: boolean) {
    if (on && !m?.on && !confirm(t("Todas las personas que no son administradoras verán la pantalla de mantenimiento hasta que lo desactives, también participantes de estudios. ¿Activarlo?"))) return;
    setBusy(true); setError(null);
    try {
      const r = await api.put<{ maintenance: Maintenance }>("/admin/maintenance", { on, message });
      setM(r.maintenance);
      window.dispatchEvent(new Event("rk-maintenance-changed"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const since = m?.since ? new Date(m.since).toLocaleString(getLang() === "en" ? "en-US" : "es", { dateStyle: "medium", timeStyle: "short" }) : "";
  return (
    <div id="maintenance" className="scroll-mt-6"><Card className="p-6">
      <p className="flex items-center gap-2 font-semibold"><Wrench size={16} /> {t("Modo mantenimiento")}</p>
      <p className="mt-1 text-sm text-ink-3">{t("Mientras trabajas en la instancia, todas las personas que no son administradoras ven una pantalla de mantenimiento que se recarga sola al terminar. Durante cada deploy la pantalla aparece sola, sin activar nada.")}</p>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {m && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium" role="status">{m.on ? t("Activo desde {a}", { a: since }) : t("Desactivado")}</p>
          <Field label={t("Mensaje (opcional)")} hint={t("Se muestra en la pantalla, por ejemplo cuándo vuelve.")}>
            <textarea className="field min-h-20" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Volvemos a las 3 p. m.")} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {m.on ? <>
              <Button variant="primary" disabled={busy} onClick={() => void save(false)}>{t("Desactivar")}</Button>
              <Button disabled={busy || message === m.message} onClick={() => void save(true)}>{t("Actualizar mensaje")}</Button>
            </> : <Button variant="danger" disabled={busy} onClick={() => void save(true)}>{t("Activar modo mantenimiento")}</Button>}
          </div>
        </div>
      )}
    </Card></div>
  );
}
