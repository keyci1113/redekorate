import { t } from "../lib/i18n";
import { Check } from "lucide-react";
import { cx } from "./ui";
// The same rules the server enforces (one file for both), so what this lists is exactly what sign-up checks.
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES, brokenPasswordRule, type PasswordRuleId } from "../../../server/src/lib/passwordRules";

export const passwordOk = (pw: string) => brokenPasswordRule(pw) === null;

/** What each required rule says on screen. A rule without a label is covered by another one and is not listed. */
const RULE_LABEL: Record<PasswordRuleId, (() => string) | null> = {
  length: () => t("{n}+ caracteres", { n: PASSWORD_MIN_LENGTH }),
  letters_and_digits: () => t("Letras y números"),
  not_one_repeated_char: null,
};

/** The requirements, shown before anything is typed and checked off while typing, plus a strength bar once there is a value. */
export function PasswordStrength({ value }: { value: string }) {
  const rules = [
    ...PASSWORD_RULES.flatMap((r) => { const label = RULE_LABEL[r.id]; return label ? [{ ok: r.test(value), label: label() }] : []; }),
    { ok: /[A-Z]/.test(value) && /[a-z]/.test(value) || /[^A-Za-z0-9]/.test(value), label: t("Mayúscula o símbolo (recomendado)") },
  ];
  const score = rules.filter((r) => r.ok).length + (value.length >= 14 ? 1 : 0);
  return (
    <div className="space-y-1.5">
      {value && <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => <span key={i} className={cx("h-1 flex-1 rounded-full transition", i < score ? (score <= 1 ? "bg-bad" : score === 2 ? "bg-warn" : "bg-good") : "bg-line")} />)}
      </div>}
      <p className="sr-only">{t("Requisitos de la contraseña")}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {rules.map((r) => (
          <li key={r.label} className={cx("flex items-center gap-1 text-[11px]", r.ok ? "text-good" : "text-ink-3")}>
            <Check size={11} className={r.ok ? "" : "opacity-30"} aria-hidden />{r.label}<span className="sr-only">{r.ok ? ` (${t("cumplido")})` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
