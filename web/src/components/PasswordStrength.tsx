import { t } from "../lib/i18n";
import { Check } from "lucide-react";
import { cx } from "./ui";

/** Debe coincidir con passwordProblem() del servidor. */
export function passwordOk(pw: string) {
  return pw.length >= 10 && /[A-Za-zÀ-ÿ]/.test(pw) && /\d/.test(pw) && !/^(.)\1+$/.test(pw);
}

export function PasswordStrength({ value }: { value: string }) {
  const rules = [
    { ok: value.length >= 10, label: t("10+ caracteres") },
    { ok: /[A-Za-zÀ-ÿ]/.test(value) && /\d/.test(value), label: t("Letras y números") },
    { ok: /[A-Z]/.test(value) && /[a-z]/.test(value) || /[^A-Za-z0-9]/.test(value), label: t("Mayúscula o símbolo (recomendado)") },
  ];
  const score = rules.filter((r) => r.ok).length + (value.length >= 14 ? 1 : 0);
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => <span key={i} className={cx("h-1 flex-1 rounded-full transition", i < score ? (score <= 1 ? "bg-bad" : score === 2 ? "bg-warn" : "bg-good") : "bg-line")} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {rules.map((r) => <span key={r.label} className={cx("flex items-center gap-1 text-[11px]", r.ok ? "text-good" : "text-ink-3")}><Check size={11} className={r.ok ? "" : "opacity-30"} />{r.label}</span>)}
      </div>
    </div>
  );
}
