import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashToken, newToken, pkceOk, redirectMatches, redirectUriOk, tokenHint } from "./apiAccess.js";

test("tokens are long, random, prefixed by kind, and stored only as a hash", () => {
  const a = newToken("pat"), b = newToken("pat");
  assert.match(a, /^rdk_pat_[0-9A-Za-z]{40}$/);
  assert.notEqual(a, b);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), hashToken(b));
  assert.equal(tokenHint(a), a.slice(-4));
});

test("PKCE S256 accepts only the verifier that made the challenge", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); // RFC 7636 appendix B
  assert.equal(pkceOk(verifier, challenge), true);
  assert.equal(pkceOk(verifier + "x", challenge), false);
  assert.equal(pkceOk("short", challenge), false);
  assert.equal(pkceOk(undefined, challenge), false);
});

test("redirect URIs: https, http on this computer, or an app scheme; never script-like or with a fragment", () => {
  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/oauth/callback", "http://127.0.0.1:33418/callback", "cursor://anysphere.cursor-retrieval/oauth/callback"])
    assert.equal(redirectUriOk(ok), true, ok);
  for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://ok.example/cb#frag", "not a url", 42])
    assert.equal(redirectUriOk(bad), false, String(bad));
});

test("a redirect URI must match a registered one; only loopback may change port", () => {
  const reg = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:5000/callback"];
  assert.equal(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback/x"), false);
  assert.equal(redirectMatches(reg, "http://127.0.0.1:61234/callback"), true);
  assert.equal(redirectMatches(reg, "http://127.0.0.1:61234/other"), false);
  assert.equal(redirectMatches(reg, "http://localhost:5000/callback"), false);
});
