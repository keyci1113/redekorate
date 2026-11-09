// Validates a prototype link pasted by a study owner (Figma Make, a deployed site…) and reports
// whether browsers will let us show it inside an iframe. Only the response headers are read.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http.js";

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Loopback, link-local, RFC 1918, CGNAT and their IPv6 equivalents: never fetched (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return PRIVATE_V4.some((r) => r.test(ip));
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (/^f[cd]/.test(l) || l.startsWith("fe80")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  return true;
}

const hostMatches = (pattern: string, host: string) => (pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : pattern === host);

/** Do X-Frame-Options / CSP frame-ancestors allow `origin` to frame this response? */
export function framingAllowed(headers: Headers, origin: string): boolean {
  const xfo = (headers.get("x-frame-options") ?? "").trim().toLowerCase();
  if (xfo === "deny" || xfo === "sameorigin") return false;
  const csp = headers.get("content-security-policy") ?? "";
  const m = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp);
  if (!m) return true;
  const sources = m[1].trim().split(/\s+/).map((s) => s.replace(/^'|'$/g, "").toLowerCase());
  if (sources.includes("none")) return false;
  if (sources.includes("*") || sources.includes("https:")) return true;
  const o = new URL(origin);
  return sources.some((s) => {
    if (s === "self") return false;
    try { const u = new URL(s.includes("://") ? s : `https://${s}`); return hostMatches(u.hostname, o.hostname) && (u.port === "" || u.port === o.port); }
    catch { return s === o.host; }
  });
}

async function assertPublicHost(hostname: string) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || /\.(localhost|local|internal)$/.test(h)) throw new HttpError(400, "Ese link no es público.");
  if (isIP(h)) { if (isPrivateAddress(h)) throw new HttpError(400, "Ese link no es público."); return; }
  let addrs: { address: string }[];
  try { addrs = await lookup(h, { all: true }); } catch { throw new HttpError(400, "No se encontró el dominio del link."); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new HttpError(400, "Ese link no es público.");
}

export type LinkCheck = { url: string; host: string; embeddable: boolean; reason?: "frame-blocked" };

/** Follows up to 3 https redirects, re-validating the host at each hop, and inspects the final headers. */
export async function checkLink(raw: string, origin: string): Promise<LinkCheck> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new HttpError(400, "El link no es válido."); }
  if (url.protocol !== "https:") throw new HttpError(400, "El link debe empezar con https://");
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(url.hostname);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; Redekorate link check)", accept: "text/html,*/*;q=0.8" } });
    } catch { throw new HttpError(400, "No se pudo abrir el link. Revisa que sea público y esté en línea."); }
    finally { clearTimeout(timer); }
    try { await res.body?.cancel(); } catch { /* headers are all we need */ }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      if (url.protocol !== "https:") throw new HttpError(400, "El link redirige a una dirección que no es https.");
      continue;
    }
    if (!res.ok) throw new HttpError(400, "El link respondió con un error.");
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) throw new HttpError(400, "El link no es una página web (HTML).");
    const embeddable = framingAllowed(res.headers, origin);
    return { url: url.href, host: url.hostname, embeddable, ...(embeddable ? {} : { reason: "frame-blocked" as const }) };
  }
  throw new HttpError(400, "El link redirige demasiadas veces.");
}
