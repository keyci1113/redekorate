import { useEffect } from "react";
import { tr, useLang, type Lang } from "./i18n";

export const SITE_NAME = "redekorate";
/** Same title as web/index.html, so the first paint and the hydrated page agree. */
export const HOME_TITLE = `${SITE_NAME} · UX Research Platform`;

// First match wins. Keys are Spanish like every UI string; en.ts translates them.
const ROUTES: [RegExp, string][] = [
  [/^\/login$/, "Iniciar sesión"],
  [/^\/register$/, "Crear cuenta"],
  [/^\/forgot$/, "Recuperar contraseña"],
  [/^\/reset$/, "Nueva contraseña"],
  [/^\/invite$/, "Invitación"],
  [/^\/authorize$/, "Permitir acceso"],
  [/^\/welcome$/, "Bienvenida"],
  [/^\/rm\/[^/]+$/, "Hoja de ruta"],
  [/^\/docs\/[^/]+$/, "Documento"],
  [/^\/my-work$/, "Mi trabajo"],
  [/^\/projects$/, "Proyectos"],
  [/^\/projects\/[^/]+\/tickets\/[^/]+$/, "Ticket"],
  [/^\/projects\/[^/]+\/new$/, "Nuevo estudio"],
  [/^\/projects\/[^/]+$/, "Proyecto"],
  [/^\/studies$/, "Estudios"],
  [/^\/studies\/[^/]+\/results$/, "Resultados"],
  [/^\/studies\/[^/]+\/edit$/, "Estudio"],
  [/^\/account$/, "Mi cuenta"],
  [/^\/orgs$/, "Organizaciones"],
  [/^\/orgs\/[^/]+\/roadmap$/, "Hoja de ruta"],
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

/** The tab title for something with its own name (a document, a diagram): "<name> · redekorate". */
export const namedTitle = (name: string) => (name.trim() ? `${name.trim()} · ${SITE_NAME}` : null);

/**
 * Puts an item's own name in the browser tab instead of the route's generic one ("Document").
 * It reruns when the language changes, after App's route title, so the name wins; leaving the page restores the route title.
 */
export function useNamedTitle(name: string) {
  const { lang } = useLang();
  useEffect(() => { const title = namedTitle(name); if (title) document.title = title; }, [name, lang]);
}
