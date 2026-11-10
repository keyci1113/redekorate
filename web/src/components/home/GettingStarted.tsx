import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CircleHelp, X } from "lucide-react";
import { START_TASKS, dismissStart, startComplete, startDismissed, startDone, startNext, type StartTask, type StartTotals } from "../../lib/onboarding";
import { Card, cx } from "../ui";
import { t } from "../../lib/i18n";

const TASKS = (): Record<StartTask, { label: string; hint: string; to: string }> => ({
  project: { label: t("Crea un proyecto"), hint: t("Agrupa estudios por producto o cliente."), to: "/projects?crear=1" },
  study: { label: t("Crea tu primer estudio"), hint: t("Elige un método; el template trae los bloques."), to: "/projects" },
  publish: { label: t("Publícalo y copia el link"), hint: t("Revisa el estudio en el builder y pulsa Publicar."), to: "/projects" },
  response: { label: t("Recibe la primera respuesta"), hint: t("Envía el link; los resultados se actualizan en vivo."), to: "/studies" },
  share: { label: t("Comparte un reporte"), hint: t("Desde Resultados → Compartir, un link de solo lectura."), to: "/studies" },
});

/** Five first steps, checked off from real data. Hidden once all are done, or when the person hides it (per browser). */
export function GettingStarted({ userId, totals }: { userId: string; totals: StartTotals }) {
  const [hidden, setHidden] = useState(() => startDismissed(userId));
  if (hidden || startComplete(totals)) return null;
  const done = startDone(totals), next = startNext(totals), tasks = TASKS();
  const n = Object.values(done).filter(Boolean).length;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{t("Primeros pasos")} <span className="ml-1 text-sm font-normal text-ink-3 tabular-nums">{n}/{START_TASKS.length}</span></p>
          <p className="mt-0.5 text-sm text-ink-2">{t("De la pregunta a la decisión, en cinco pasos.")} <Link to="/help" className="font-medium text-accent"><CircleHelp size={13} className="mr-0.5 inline" />{t("Ayuda y conceptos")}</Link></p>
        </div>
        <button type="button" onClick={() => { dismissStart(userId); setHidden(true); }} aria-label={t("Ocultar primeros pasos")} className="focus-ring rounded p-1 text-ink-3 hover:text-ink"><X size={16} /></button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {START_TASKS.map((k, i) => {
          const task = tasks[k], isDone = done[k], isNext = k === next;
          const body = (
            <>
              <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", isDone ? "bg-good-soft text-good" : isNext ? "bg-accent text-on-accent" : "bg-ink/5 text-ink-2")}>{isDone ? <Check size={13} /> : i + 1}</span>
              <span className="min-w-0">
                <span className={cx("block text-sm font-medium", isDone && "text-ink-3 line-through")}>{task.label}</span>
                {!isDone && <span className="mt-0.5 block text-xs text-ink-3">{task.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={k}>
              {isDone ? <div className="flex items-start gap-2.5 rounded-lg p-2">{body}</div>
                : <Link to={task.to} className={cx("focus-ring flex items-start gap-2.5 rounded-lg border p-2 transition hover:border-line-2", isNext ? "border-accent/40 bg-accent-soft/40" : "border-transparent")}>{body}</Link>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
