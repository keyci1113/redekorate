import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceBlocks, OFF, type Maintenance } from "./maintenance.js";

const ON: Maintenance = { on: true, message: "", since: "2026-11-17T00:00:00Z" };

test("maintenance off never blocks", () => {
  assert.equal(maintenanceBlocks(OFF, "/api/projects", false), false);
});

test("maintenance on blocks the API and MCP for everyone but admins", () => {
  for (const p of ["/api/projects", "/api/public/studies/x", "/api/widget/feedback", "/api/v1/list_projects", "/mcp", "/api/admin/users"])
    assert.equal(maintenanceBlocks(ON, p, false), true, p);
  assert.equal(maintenanceBlocks(ON, "/api/projects", true), false);
});

test("the health check, signing in and the pages themselves stay open", () => {
  for (const p of ["/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/oauth/google/callback", "/", "/projects/1", "/assets/index.js"])
    assert.equal(maintenanceBlocks(ON, p, false), false, p);
  // only those auth routes: changing a password or registering waits
  assert.equal(maintenanceBlocks(ON, "/api/auth/register", false), true);
});
