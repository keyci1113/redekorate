// The password policy, in one place: the server enforces it (security.ts passwordProblem) and the web app
// imports this same file to list the requirements and check them as people type. Keep it free of imports,
// so both the Node build and the browser bundle can use it as is.

export const PASSWORD_MIN_LENGTH = 10;

/** Each requirement a password must meet, in the order they are shown and checked. */
export const PASSWORD_RULES = [
  { id: "length", test: (pw: string) => pw.length >= PASSWORD_MIN_LENGTH },
  { id: "letters_and_digits", test: (pw: string) => /[A-Za-zÀ-ÿ]/.test(pw) && /\d/.test(pw) },
  // A single character repeated ("aaaaaaaaaa"). Letters and digits already rule it out; kept as its own guard.
  { id: "not_one_repeated_char", test: (pw: string) => !/^(.)\1+$/.test(pw) },
] as const;

export type PasswordRuleId = (typeof PASSWORD_RULES)[number]["id"];

/** The first rule the password breaks, or null when it meets them all. */
export const brokenPasswordRule = (pw: string): PasswordRuleId | null => PASSWORD_RULES.find((r) => !r.test(pw))?.id ?? null;
