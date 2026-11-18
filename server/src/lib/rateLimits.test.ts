import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { perAccount } from "./security.js";

const get = (url: string, token?: string) => fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then((r) => r.status);

test("valid tokens count per account; made-up tokens count against the address", async () => {
  // Two real tokens of Ana, one of Ben; anything else is not a valid token.
  const owner: Record<string, string> = { rdk_pat_ana1: "ana", rdk_pat_ana2: "ana", rdk_pat_ben: "ben" };
  const app = express();
  app.use(perAccount(2, async (raw) => owner[raw] ?? null));
  app.get("/", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // A second token of the same person shares the first one's allowance.
    assert.deepEqual([await get(base, "rdk_pat_ana1"), await get(base, "rdk_pat_ana2"), await get(base, "rdk_pat_ana1")], [200, 200, 429]);
    // Same address, another person: untouched.
    assert.deepEqual([await get(base, "rdk_pat_ben"), await get(base, "rdk_pat_ben")], [200, 200]);
    // Made-up tokens share the address's allowance, like calls without a token.
    assert.deepEqual([await get(base, "rdk_pat_fakeA"), await get(base, "rdk_pat_fakeB"), await get(base, "rdk_pat_fakeC"), await get(base)], [200, 200, 429, 429]);
  } finally { server.close(); }
});
