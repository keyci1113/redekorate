// A small note that tells people what their role does not let them do, so missing buttons never look like a bug.
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { editLimit } from "../lib/roles";
import type { ProjectRole } from "../lib/types";
import { t } from "../lib/i18n";

/** The note itself: any text about missing access. */
export function NoAccessNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p role="note" className={`flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink-2 ${className}`}>
      <Lock size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Explains a project role that cannot edit; renders nothing for editors and owners. */
export function AccessNotice({ role, owner, className }: { role: ProjectRole | null | undefined; owner?: string | null; className?: string }) {
  const limit = editLimit(role);
  if (!limit) return null;
  const what = limit === "commenter"
    ? t("No tienes acceso para editar: como comentarista puedes ver y comentar, pero no crear ni cambiar nada.")
    : t("No tienes acceso para editar: con solo lectura puedes ver, pero no crear, cambiar ni comentar.");
  const ask = owner ? t("Pide acceso de editor a {a}.", { a: owner }) : t("Pide acceso de editor a quien es dueño/a del proyecto.");
  return <NoAccessNote className={className}>{what} {ask}</NoAccessNote>;
}
