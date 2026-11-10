import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, issuerMatches, providers, safeNext, verifiedEmail, type IdClaims } from "./oauth.js";

const base: IdClaims = { iss: "x", sub: "123", aud: "a", exp: 0 };

test("providers appear only with both client id and secret", () => {
  assert.deepEqual(providers({}).map((p) => p.id), []);
  assert.deepEqual(providers({ GOOGLE_CLIENT_ID: "id" }).map((p) => p.id), []);
  assert.deepEqual(providers({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).map((p) => p.id), ["google"]);
  const ms = providers({ MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_TENANT: "contoso.onmicrosoft.com" })[0];
  assert.equal(ms.id, "microsoft");
  assert.match(ms.discovery, /\/contoso\.onmicrosoft\.com\/v2\.0\//);
  assert.match(providers({ MICROSOFT_CLIENT_ID: "id", MICROSOFT_CLIENT_SECRET: "s" })[0].discovery, /\/common\/v2\.0\//);
});

test("google email counts only when verified", () => {
  assert.equal(verifiedEmail("google", { ...base, email: "KC@Example.com", email_verified: true }), "kc@example.com");
  assert.equal(verifiedEmail("google", { ...base, email: "kc@example.com", email_verified: "true" }), "kc@example.com");
  assert.equal(verifiedEmail("google", { ...base, email: "kc@example.com", email_verified: false }), null);
  assert.equal(verifiedEmail("google", { ...base, email: "kc@example.com" }), null);
});

test("microsoft falls back to preferred_username when it is an email", () => {
  assert.equal(verifiedEmail("microsoft", { ...base, email: "kc@contoso.com" }), "kc@contoso.com");
  assert.equal(verifiedEmail("microsoft", { ...base, preferred_username: "KC@contoso.com" }), "kc@contoso.com");
  assert.equal(verifiedEmail("microsoft", { ...base, preferred_username: "kc" }), null);
  assert.equal(verifiedEmail("microsoft", { ...base, email: "not an email" }), null);
});

test("display name prefers the provider's name, then given+family, then the mailbox", () => {
  assert.equal(displayName({ ...base, name: " Keyci P. " }, "kc@x.com"), "Keyci P.");
  assert.equal(displayName({ ...base, given_name: "Keyci", family_name: "Padilla" }, "kc@x.com"), "Keyci Padilla");
  assert.equal(displayName(base, "kc.padilla@x.com"), "kc.padilla");
  assert.equal(displayName({ ...base, name: "x".repeat(200) }, "a@b.c").length, 120);
});

test("issuer must match, with Microsoft's {tenantid} placeholder filled from tid", () => {
  assert.equal(issuerMatches("https://accounts.google.com", { ...base, iss: "https://accounts.google.com" }), true);
  assert.equal(issuerMatches("https://accounts.google.com", { ...base, iss: "https://evil.example" }), false);
  const ms = "https://login.microsoftonline.com/{tenantid}/v2.0";
  assert.equal(issuerMatches(ms, { ...base, iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0", tid: "9188040d-6c67-4c5b-b112-36a304b66dad" }), true);
  assert.equal(issuerMatches(ms, { ...base, iss: "https://login.microsoftonline.com/other/v2.0", tid: "9188040d-6c67-4c5b-b112-36a304b66dad" }), false);
  assert.equal(issuerMatches(ms, { ...base, iss: "https://login.microsoftonline.com/x/v2.0" }), false);
});

test("safeNext only allows internal relative paths", () => {
  assert.equal(safeNext("/projects/1"), "/projects/1");
  assert.equal(safeNext("/account?linked=google"), "/account?linked=google");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("/a\nb"), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext("", "/account"), "/account");
});
