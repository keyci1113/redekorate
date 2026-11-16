/**
 * Search-engine rules. Everything about what crawlers may see lives here, so the server,
 * robots.txt, the sitemap and the HTML tags can never disagree.
 *
 * Only the public entry page is indexable. Everything else is either behind a login or
 * reached through a private link (study runner, shared reports, shared docs, invites,
 * password resets), and those links must never show up in search results.
 */

/** Paths a search engine may index. Both show the sign-in screen to a visitor without a session. */
export const INDEXABLE_PATHS = ["/", "/login"] as const;

/** Where the canonical URL of every indexable path points (one page, one URL). */
const CANONICAL_PATH = "/";

/** Paths that are never useful to crawl (JSON API, uploaded participant files). */
const DISALLOWED_PREFIXES = ["/api/", "/uploads/"] as const;

/** SEO_INDEXING=off turns indexing off entirely, for private installs that should not appear in search. */
export function indexingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !["off", "false", "0", "no"].includes((env.SEO_INDEXING ?? "").trim().toLowerCase());
}

export function isIndexable(pathname: string, enabled = indexingEnabled()): boolean {
  if (!enabled) return false;
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (INDEXABLE_PATHS as readonly string[]).includes(p);
}

/** Value for the X-Robots-Tag header and the robots meta tag. */
export function robotsDirective(pathname: string, enabled = indexingEnabled()): string {
  return isIndexable(pathname, enabled) ? "index, follow, max-image-preview:large" : "noindex, nofollow";
}

export function robotsTxt(baseUrl: string, enabled = indexingEnabled()): string {
  if (!enabled) return "User-agent: *\nDisallow: /\n";
  // Private-link pages are NOT disallowed on purpose: a crawler has to fetch them to see the
  // noindex header. A Disallow would let a leaked link be indexed as a bare URL.
  return [
    "User-agent: *",
    ...DISALLOWED_PREFIXES.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(baseUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${escapeXml(baseUrl + CANONICAL_PATH)}</loc></url>`,
    "</urlset>",
    "",
  ].join("\n");
}

/** Placeholder in web/index.html for the absolute origin (Open Graph and JSON-LD need absolute URLs). */
export const BASE_URL_TOKEN = "__APP_URL__";

/**
 * Turn the built index.html into the page for one request: fill in the absolute origin and
 * add the robots meta tag, plus the canonical link when the page is indexable.
 */
export function renderIndexHtml(html: string, baseUrl: string, pathname: string, enabled = indexingEnabled()): string {
  const tags = [`<meta name="robots" content="${robotsDirective(pathname, enabled)}" />`];
  if (isIndexable(pathname, enabled)) tags.push(`<link rel="canonical" href="${escapeXml(baseUrl + CANONICAL_PATH)}" />`);
  return html
    .replaceAll(BASE_URL_TOKEN, escapeXml(baseUrl))
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

/** The public origin without a trailing slash: APP_URL when set, else the request's own host. */
export function publicBaseUrl(appUrl: string | undefined, protocol: string, host: string | undefined): string {
  return (appUrl || `${protocol}://${host}`).replace(/\/+$/, "");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
