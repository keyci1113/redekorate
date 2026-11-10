import crypto from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Inicio de sesión con Google y Microsoft (OpenID Connect, código de autorización + PKCE).
 * Sin dependencias nuevas: descubrimiento con fetch y verificación del id_token con las JWKS del proveedor.
 */
export type Provider = "google" | "microsoft";
export const PROVIDERS: Provider[] = ["google", "microsoft"];

interface ProviderConfig { id: Provider; name: string; clientId: string; clientSecret: string; discovery: string }

/** Proveedores con credenciales en el entorno. Sin credenciales, el botón no aparece. */
export function providers(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const out: ProviderConfig[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    out.push({ id: "google", name: "Google", clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, discovery: "https://accounts.google.com/.well-known/openid-configuration" });
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET)
    out.push({ id: "microsoft", name: "Microsoft", clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET,
      discovery: `https://login.microsoftonline.com/${encodeURIComponent(env.MICROSOFT_TENANT || "common")}/v2.0/.well-known/openid-configuration` });
  return out;
}
export const provider = (id: string, env?: NodeJS.ProcessEnv) => providers(env).find((p) => p.id === id);

// ── Helpers puros (con pruebas) ───────────────────────────────────
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IdClaims {
  iss: string; sub: string; aud: string | string[]; exp: number; nonce?: string;
  email?: string; email_verified?: boolean | string; preferred_username?: string; tid?: string;
  name?: string; given_name?: string; family_name?: string; picture?: string;
}

/**
 * Correo verificado que reporta el proveedor, o null.
 * Google marca email_verified. Microsoft (v2) no lo marca: el correo de una cuenta de trabajo lo controla
 * el dominio de la organización y el de una cuenta personal lo verifica Microsoft, así que se acepta
 * `email` y, si falta, `preferred_username` cuando tiene forma de correo.
 */
export function verifiedEmail(p: Provider, c: IdClaims): string | null {
  const norm = (e?: string) => (e && EMAIL.test(e.trim()) ? e.trim().toLowerCase() : null);
  if (p === "google") return c.email_verified === true || c.email_verified === "true" ? norm(c.email) : null;
  return norm(c.email) ?? norm(c.preferred_username);
}

/** Nombre para la cuenta nueva: el del proveedor, o la parte local del correo. */
export function displayName(c: IdClaims, email: string) {
  const full = (c.name ?? [c.given_name, c.family_name].filter(Boolean).join(" ")).trim();
  return (full || email.split("@")[0]).slice(0, 120);
}

/** El emisor del token debe ser el del descubrimiento; Microsoft lo publica con {tenantid} y hay que sustituirlo. */
export function issuerMatches(expected: string, c: IdClaims) {
  if (!c.tid) return expected === c.iss;
  return expected.replace("{tenantid}", c.tid) === c.iss;
}

/** Solo rutas internas relativas: evita redirecciones abiertas después del callback. */
export function safeNext(next: string | undefined | null, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next.length > 500 ? fallback : next;
}

export const pkce = () => {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

// ── Descubrimiento y JWKS (caché en memoria) ──────────────────────
interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
const discoveryCache = new Map<string, { at: number; doc: Discovery }>();
const jwksCache = new Map<string, { at: number; keys: Record<string, string> }>();   // kid → PEM
const HOUR = 3_600_000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function discover(p: ProviderConfig): Promise<Discovery> {
  const hit = discoveryCache.get(p.discovery);
  if (hit && Date.now() - hit.at < 24 * HOUR) return hit.doc;
  const doc = await getJson<Discovery>(p.discovery);
  discoveryCache.set(p.discovery, { at: Date.now(), doc });
  return doc;
}

async function jwks(uri: string, force = false) {
  const hit = jwksCache.get(uri);
  if (hit && !force && Date.now() - hit.at < HOUR) return hit.keys;
  const { keys } = await getJson<{ keys: (crypto.webcrypto.JsonWebKey & { kid?: string })[] }>(uri);
  const out: Record<string, string> = {};
  for (const k of keys) if (k.kid) out[k.kid] = crypto.createPublicKey({ key: k, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
  jwksCache.set(uri, { at: Date.now(), keys: out });
  return out;
}

/** Verifica firma, emisor, audiencia, vigencia y nonce del id_token y devuelve sus claims. */
export async function verifyIdToken(p: ProviderConfig, idToken: string, nonce: string): Promise<IdClaims> {
  const doc = await discover(p);
  const header = jwt.decode(idToken, { complete: true })?.header;
  if (!header?.kid) throw new Error("id_token sin kid");
  let keys = await jwks(doc.jwks_uri);
  if (!keys[header.kid]) keys = await jwks(doc.jwks_uri, true);   // rotación de llaves
  const pem = keys[header.kid];
  if (!pem) throw new Error("llave desconocida");
  const claims = jwt.verify(idToken, pem, { algorithms: ["RS256"], audience: p.clientId, nonce }) as IdClaims;
  if (!issuerMatches(doc.issuer, claims)) throw new Error(`emisor inesperado: ${claims.iss}`);
  if (!claims.sub) throw new Error("id_token sin sub");
  return claims;
}

/** Intercambia el código por tokens; devuelve el id_token. */
export async function exchangeCode(p: ProviderConfig, code: string, redirectUri: string, verifier: string) {
  const doc = await discover(p);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: p.clientId, client_secret: p.clientSecret, code_verifier: verifier });
  const tok = await getJson<{ id_token?: string }>(doc.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  if (!tok.id_token) throw new Error("el proveedor no devolvió id_token");
  return tok.id_token;
}

export async function authorizeUrl(p: ProviderConfig, redirectUri: string, state: string, nonce: string, challenge: string) {
  const doc = await discover(p);
  const u = new URL(doc.authorization_endpoint);
  const params: Record<string, string> = {
    client_id: p.clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
    state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
