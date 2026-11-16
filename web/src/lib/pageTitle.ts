import { tr, type Lang } from "./i18n";

export const SITE_NAME = "redekorate";
/** Same title as web/index.html, so the first paint and the hydrated page agree. */
export const HOME_TITLE = `${SITE_NAME} · UX Research Platform`;

// First match wins. Keys are Spanish like every UI string; en.ts translates them.
const ROUTES: [RegExp, string][] = [
  [/^\/login$/, "Iniciar sesión"],
  [/^\/forgot$/, "Recuperar contraseña"],
  [/^\/reset$/, "Nueva contraseña"],
  [/^\/invite$/, "Invitación"],
  [/^\/authorize$/, "Permitir acceso"],
  [/^\/welcome$/, "Bienvenida"],
  [/^\/docs\/[^/]+$/, "Documento"],
  [/^\/projects$/, "Proyectos"],
  [/^\/projects\/[^/]+\/new$/, "Nuevo estudio"],
  [/^\/projects\/[^/]+$/, "Proyecto"],
  [/^\/studies$/, "Estudios activos"],
  [/^\/studies\/[^/]+\/results$/, "Resultados"],
  [/^\/studies\/[^/]+\/edit$/, "Estudio"],
  [/^\/account$/, "Mi cuenta"],
  [/^\/orgs$/, "Organizaciones"],
  [/^\/orgs\/[^/]+$/, "Organización"],
  [/^\/help$/, "Ayuda"],
  [/^\/admin\/users$/, "Usuarios"],
];

/** Every title key, so a test can check each one has an English translation. */
export const TITLE_KEYS = [...new Set(ROUTES.map(([, key]) => key))];

/**
 * Shared links (study, report, doc) get their real name from the server, the same one their
 * link preview shows, so the app leaves that title alone.
 */
export const isSharedLink = (pathname: string) => /^\/(s|r|pr|d)\/[^/]+\/?$/.test(pathname);

/** The browser-tab title for a path: "<Page> · redekorate", or the home title for "/" and unknown paths. */
export function pageTitle(pathname: string, lang: Lang): string {
  const hit = ROUTES.find(([re]) => re.test(pathname));
  return hit ? `${tr(hit[1], lang)} · ${SITE_NAME}` : HOME_TITLE;
}
