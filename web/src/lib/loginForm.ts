// Pure parts of the sign-in page, kept out of the component so they can be tested.
import { t } from "./i18n";
import { passwordOk } from "../components/PasswordStrength";

/** The sign-in and sign-up checks, in the app language rather than the browser's native bubbles. */
export function authFormError(mode: "login" | "register", form: { name: string; email: string; password: string }): string | null {
  if (mode === "register" && !form.name.trim()) return t("Escribe tu nombre.");
  if (!form.email.trim()) return t("Escribe tu correo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t("Escribe un correo válido, como nombre@empresa.com.");
  if (!form.password) return t("Escribe tu contraseña.");
  if (mode === "register" && !passwordOk(form.password)) return t("Tu contraseña aún no cumple los requisitos.");
  return null;
}

// Three lanes, three cards each. Cards in a lane share one speed and are spaced a third of a cycle apart,
// so none of them overlaps or overtakes another (random positions used to pile cards on top of each other).
export const LANES = [3, 36, 69];
const PER_LANE = 3;
export function fallingLayout(laneCount = LANES.length, perLane = PER_LANE) {
  return Array.from({ length: laneCount * perLane }, (_, i) => {
    const lane = i % laneCount, slot = Math.floor(i / laneCount);
    const duration = 24 + lane * 3;
    // Lanes start at different heights, and the cards of one lane sit `duration / perLane` seconds apart.
    return { index: i, lane, duration, delay: -((slot / perLane) + lane / (laneCount * perLane)) * duration, rotate: [-3, 2, -2][lane] };
  });
}

