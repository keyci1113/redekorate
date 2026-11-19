import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDomain, domainAllowed, identitySignature, identityVerified, newPublicKey, normalizeSettings, publicConfig, titleFrom } from "./widget.js";

test("an empty stored object is a complete widget, and partial settings keep the other defaults", () => {
  const s = normalizeSettings({});
  assert.deepEqual(s.types, { broken: "bug", idea: "design_change", question: "task" });
  assert.deepEqual([s.allow.screenshot, s.allow.console, s.privacy.ask_email, s.look.position, s.assignee_id], [true, false, true, "bottom-right", null]);
  const partial = normalizeSettings({ allow: { console: true }, look: { accent: "#0D9488" } });
  assert.deepEqual([partial.allow.console, partial.allow.files, partial.look.accent, partial.look.language], [true, true, "#0D9488", "auto"]);
  assert.throws(() => normalizeSettings({ look: { accent: "purple" } }));
  assert.throws(() => normalizeSettings({ types: { broken: "epic" } }));
});

test("the script never receives who gets the tickets", () => {
  const cfg = publicConfig(normalizeSettings({ assignee_id: "7b0e7d6e-0f6b-4f0a-9d1b-1f1f1f1f1f1f" })) as Record<string, unknown>;
  assert.deepEqual(Object.keys(cfg).sort(), ["allow", "look", "privacy"]);
});

test("domains are stored as bare hosts", () => {
  assert.equal(cleanDomain(" https://App.Acme.com/caja?x=1 "), "app.acme.com");
  assert.equal(cleanDomain("*.acme.com"), "*.acme.com");
  assert.equal(cleanDomain("localhost:8090"), "localhost:8090");
  assert.equal(cleanDomain("acme"), "acme");
  for (const bad of ["", "*", "acme .com", "http://", "a..b", "-acme.com", "acme.com:port"]) assert.equal(cleanDomain(bad), null, bad);
});

test("only requests from an allowed domain pass", () => {
  const allowed = ["app.acme.com", "*.staging.acme.com", "localhost:8090"];
  assert.ok(domainAllowed("https://app.acme.com", allowed));
  assert.ok(domainAllowed("https://app.acme.com:8443", allowed), "a domain without a port allows any port");
  assert.ok(domainAllowed("https://pr-12.staging.acme.com", allowed));
  assert.ok(domainAllowed("http://localhost:8090", allowed));
  assert.ok(!domainAllowed("http://localhost:3000", allowed), "a domain with a port allows only that port");
  assert.ok(!domainAllowed("https://staging.acme.com", allowed), "the wildcard covers subdomains, not the base");
  assert.ok(!domainAllowed("https://evilapp.acme.com.attacker.io", allowed));
  assert.ok(!domainAllowed("https://notapp.acme.com", allowed));
  assert.ok(!domainAllowed("https://xstaging.acme.com", allowed));
  assert.ok(!domainAllowed(undefined, allowed));
  assert.ok(!domainAllowed("null", allowed));
  assert.ok(!domainAllowed("file:///etc", allowed));
  assert.ok(!domainAllowed("https://app.acme.com", []));
});

test("a user is verified only with the matching signature", () => {
  const secret = "rk_sec_test", sig = identitySignature(secret, "u_1842");
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.ok(identityVerified(secret, "u_1842", sig));
  assert.ok(identityVerified(secret, "u_1842", sig.toUpperCase()));
  assert.ok(!identityVerified(secret, "u_1843", sig), "a signature is for one user id");
  assert.ok(!identityVerified("other", "u_1842", sig));
  assert.ok(!identityVerified(secret, "u_1842", "abc"));
  assert.ok(!identityVerified(secret, "u_1842", undefined));
  assert.ok(!identityVerified(secret, undefined, sig));
});

test("the ticket title is the first sentence of the message", () => {
  assert.equal(titleFrom("El total del cierre no coincide con el POS cuando hay devoluciones. Me da 120 de diferencia."), "El total del cierre no coincide con el POS cuando hay devoluciones");
  assert.equal(titleFrom("  ¿Cómo exporto\n el cierre?  "), "¿Cómo exporto el cierre?");
  assert.equal(titleFrom(""), "Feedback");
  const long = titleFrom("palabra ".repeat(40));
  assert.ok(long.length <= 91 && long.endsWith("…") && !long.includes("  "));
});

test("public keys are prefixed and unique", () => {
  assert.match(newPublicKey(), /^rk_pub_[A-Za-z0-9_-]{12}$/);
  assert.notEqual(newPublicKey(), newPublicKey());
});
