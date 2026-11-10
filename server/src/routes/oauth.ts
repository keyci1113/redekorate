import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { readUser, requireAuth, shortCookieOpts, signSession, signShort, verifyShort, type Role } from "../lib/auth.js";
import { HttpError, parse } from "../lib/http.js";
import { authLimiter } from "../lib/security.js";
import { authorizeUrl, displayName, exchangeCode, pkce, provider, providers, safeNext, verifiedEmail, verifyIdToken, type Provider } from "../lib/oauth.js";
import { pendingInvite } from "./auth.js";

/**
 * Inicio de sesión con Google y Microsoft.
 *   GET /providers                 → qué botones mostrar
 *   GET /:provider/start           → redirige al proveedor (estado + PKCE en una cookie firmada de 10 min)
 *   GET /:provider/callback        → entra, vincula o crea la cuenta y redirige a la app
 *   GET /identities                → métodos de acceso de la cuenta actual
 *   DELETE /identities/:provider   → desvincular
 */
export const oauth = Router();

const STATE_COOKIE = "rk_oauth";
const STATE_SECONDS = 600;
const PATH = "/api/auth/oauth";
interface State { p: Provider; state: string; nonce: string; verifier: string; invite?: string; next?: string; link?: string }

const baseUrl = (req: Request) => (process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const redirectUri = (req: Request, p: Provider) => `${baseUrl(req)}${PATH}/${p}/callback`;
const providerParam = z.enum(["google", "microsoft"]);

/** Vuelve a la app con un código de error que el login traduce. */
function fail(res: Response, code: string, to = "/login") {
  res.clearCookie(STATE_COOKIE, shortCookieOpts(PATH, 0));
  const u = new URL(to, "http://x");
  u.searchParams.set("error", `oauth_${code}`);
  res.redirect(303, u.pathname + u.search);
}

oauth.get("/providers", (_req, res) => {
  res.json({ providers: providers().map((p) => ({ id: p.id, name: p.name })) });
});

oauth.get("/:provider/start", authLimiter, async (req, res) => {
  const id = parse(providerParam, req.params.provider);
  const p = provider(id);
  if (!p) return fail(res, "config");
  const q = parse(z.object({ invite: z.string().min(20).max(200).optional(), next: z.string().max(500).optional(), link: z.literal("1").optional() }), req.query);
  let link: string | undefined;
  if (q.link) {
    const me = await readUser(req);
    if (!me) return fail(res, "state");
    link = me.id;
  }
  const state = crypto.randomBytes(16).toString("base64url"), nonce = crypto.randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkce();
  const payload: State = { p: id, state, nonce, verifier, invite: q.invite, next: safeNext(q.next, link ? "/account" : "/"), link };
  res.cookie(STATE_COOKIE, signShort(payload, STATE_SECONDS), shortCookieOpts(PATH, STATE_SECONDS));
  try {
    res.redirect(302, await authorizeUrl(p, redirectUri(req, id), state, nonce, challenge));
  } catch (e) {
    console.error(`oauth ${id}: discovery falló`, e);
    fail(res, "failed");
  }
});

oauth.get("/:provider/callback", authLimiter, async (req, res) => {
  const id = parse(providerParam, req.params.provider);
  const p = provider(id);
  const st = verifyShort<State>(req.cookies?.[STATE_COOKIE]);
  const q = req.query as Record<string, string | undefined>;
  const back = st?.link ? "/account" : "/login";
  if (!p) return fail(res, "config");
  if (q.error) return fail(res, q.error === "access_denied" || q.error === "consent_required" ? "denied" : "failed", back);
  if (!st || st.p !== id || !q.state || !q.code || st.state !== q.state) return fail(res, "state", back);
  res.clearCookie(STATE_COOKIE, shortCookieOpts(PATH, 0));

  let email: string | null, sub: string, name: string;
  try {
    const claims = await verifyIdToken(p, await exchangeCode(p, q.code, redirectUri(req, id), st.verifier), st.nonce);
    sub = claims.sub; email = verifiedEmail(id, claims); name = displayName(claims, email ?? "");
  } catch (e) {
    console.error(`oauth ${id}: callback falló`, e);
    return fail(res, "failed", back);
  }

  type U = { id: string; email: string; name: string; role: Role; avatar: string | null; token_version: number; disabled_at: string | null };
  const COLS = "u.id, u.email, u.name, u.role, u.avatar, u.token_version, u.disabled_at";
  const byIdentity = await one<U>(`select ${COLS} from user_identities i join users u on u.id = i.user_id where i.provider = $1 and i.subject = $2`, [id, sub]);

  // Vincular a la cuenta con la que ya se inició sesión (desde Mi cuenta).
  if (st.link) {
    if (byIdentity && byIdentity.id !== st.link) return fail(res, "taken", "/account");
    if (!byIdentity) await query("insert into user_identities(provider, subject, user_id, email, last_login_at) values ($1,$2,$3,$4,now())", [id, sub, st.link, email]);
    return res.redirect(303, safeNext(st.next, "/account"));
  }

  let user = byIdentity;
  if (!user) {
    if (!email) return fail(res, "email");
    // Misma dirección verificada → es la misma persona: se vincula a la cuenta existente.
    user = await one<U>(`select ${COLS} from users u where u.email = $1`, [email]);
    if (!user) {
      const anyUser = !!(await one("select 1 from users limit 1"));
      let role: Role = anyUser ? "member" : "admin";
      let inviteId: string | null = null;
      if (st.invite) {
        const inv = await pendingInvite(st.invite);
        if (!inv) return fail(res, "invite");
        if (inv.email !== email) return fail(res, "invite_email");
        role = inv.role; inviteId = inv.id;
      } else if (process.env.ALLOW_REGISTRATION === "false" && anyUser) {
        return fail(res, "closed");
      }
      user = await one<U>(
        "insert into users(name, email, password_hash, role, last_login_at) values ($1,$2,null,$3,now()) returning id, email, name, role, avatar, token_version, disabled_at",
        [name, email, role]);
      if (inviteId) await query("update invites set accepted_at = now() where id = $1", [inviteId]);
    }
    if (user!.disabled_at) return fail(res, "disabled");
    await query("insert into user_identities(provider, subject, user_id, email, last_login_at) values ($1,$2,$3,$4,now())", [id, sub, user!.id, email]);
  } else {
    if (user.disabled_at) return fail(res, "disabled");
    await query("update user_identities set last_login_at = now(), email = coalesce($3, email) where provider = $1 and subject = $2", [id, sub, email]);
  }
  await query("update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1", [user!.id]);
  signSession(res, { id: user!.id, email: user!.email, name: user!.name, role: user!.role, avatar: user!.avatar }, user!.token_version);
  res.redirect(303, safeNext(st.next));
});

// ── Métodos de acceso de la cuenta ────────────────────────────────
oauth.get("/identities", requireAuth, async (req, res) => {
  const rows = await query<{ provider: Provider; email: string | null; created_at: string; last_login_at: string | null }>(
    "select provider, email, created_at, last_login_at from user_identities where user_id = $1 order by created_at", [req.user!.id]);
  const u = await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [req.user!.id]);
  res.json({ identities: rows, has_password: !!u?.password_hash, providers: providers().map((p) => ({ id: p.id, name: p.name })) });
});

oauth.delete("/identities/:provider", requireAuth, async (req, res) => {
  const id = parse(providerParam, req.params.provider);
  const u = (await one<{ password_hash: string | null; n: number }>(
    "select u.password_hash, (select count(*)::int from user_identities where user_id = u.id) as n from users u where u.id = $1", [req.user!.id]))!;
  // Nunca dejar una cuenta sin forma de entrar.
  if (!u.password_hash && u.n <= 1) throw new HttpError(400, "Define una contraseña antes de desvincular tu único método de acceso.");
  await query("delete from user_identities where user_id = $1 and provider = $2", [req.user!.id, id]);
  res.json({ ok: true });
});
