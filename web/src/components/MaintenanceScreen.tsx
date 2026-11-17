// Full-screen notice while the app is being deployed or is in maintenance mode, and the banner admins see
// while maintenance mode is on (they keep working). It polls /api/health and reloads once the app is back.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Wrench } from "lucide-react";
import { getDown, onDown, setDown, type Down } from "../lib/maintenance";
import { useAuth } from "../lib/auth";
import { LogoMark } from "./Logo";
import { t } from "../lib/i18n";

type Health = { ok: boolean; maintenance: { message: string; since: string | null } | null };
async function health(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return null;
    return (await res.json()) as Health;
  } catch { return null; }
}

const POLL_MS = 4000;

export function MaintenanceScreen() {
  const [shown, setShown] = useState<Down | null>(null);

  useEffect(() => onDown(async (d) => {
    if (!d) { setShown(null); return; }
    if (d.kind === "maintenance") { setShown(d); return; }
    // A failed request alone is not proof: show the screen only if the health check fails too.
    const h = await health();
    if (!h) setShown(d);
    else if (h.maintenance) setShown({ kind: "maintenance", message: h.maintenance.message });
    else setDown(null);
  }), []);

  useEffect(() => {
    if (!shown) return;
    const id = setInterval(async () => {
      const h = await health();
      if (!h) return;
      if (h.maintenance) { if (shown.kind !== "maintenance" || shown.message !== h.maintenance.message) setShown({ kind: "maintenance", message: h.maintenance.message }); return; }
      window.location.reload();   // back: reload so the page runs the new build and refetches its data
    }, POLL_MS);
    return () => clearInterval(id);
  }, [shown]);

  if (!shown) return null;
  const deploy = shown.kind === "deploy";
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="rk-down-title" aria-describedby="rk-down-text"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md text-center">
        <LogoMark size={44} className="mx-auto" />
        <h1 id="rk-down-title" className="mt-6 text-2xl font-semibold">{deploy ? t("Estamos actualizando redekorate") : t("redekorate está en mantenimiento")}</h1>
        <p id="rk-down-text" className="mt-3 text-[15px] text-ink-2">
          {deploy
            ? t("Tarda alrededor de un minuto. Lo que ya se guardó está a salvo, y esta página se recarga sola cuando terminemos.")
            : t("Estamos haciendo mejoras. Lo que ya se guardó está a salvo, y esta página se recarga sola cuando terminemos.")}
        </p>
        {!deploy && shown.message && <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-[15px] whitespace-pre-line">{shown.message}</p>}
        <p className="mt-6 flex items-center justify-center gap-2 text-[13px] text-ink-3" aria-live="polite">
          <Loader2 size={14} className="animate-spin" aria-hidden /> {t("Revisando cada pocos segundos…")}
        </p>
      </div>
    </div>
  );
}

/** For admins, who keep working during maintenance: a reminder that everyone else is locked out. */
export function MaintenanceBanner() {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (user?.role !== "admin") return;
    let alive = true;
    const check = async () => { const h = await health(); if (alive && h) setOn(!!h.maintenance); };
    void check();
    const id = setInterval(check, 30_000);
    window.addEventListener("rk-maintenance-changed", check);
    return () => { alive = false; clearInterval(id); window.removeEventListener("rk-maintenance-changed", check); };
  }, [user?.role]);
  if (!on || getDown()) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warn-soft px-4 py-2 text-center text-[13px] font-medium text-warn">
      <Wrench size={14} aria-hidden />
      {t("Modo mantenimiento activo: solo las personas administradoras pueden usar la app.")}
      <Link to="/admin/users#maintenance" className="underline underline-offset-2">{t("Desactivar")}</Link>
    </div>
  );
}
