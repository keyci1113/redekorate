/**
 * Who a service call acts for. Services never see an HTTP request: the web routes, the public REST API (/api/v1)
 * and anything else in process build an Actor and pass plain input.
 */
import type { Request } from "express";
import type { PoolClient } from "pg";
import { pool } from "../lib/db.js";
import { fromAssistant } from "../lib/contentCheck.js";

export interface Actor {
  id: string;
  name: string;
  /** The language of anything the call writes for people (copy suffixes, notification texts, built-in column names). */
  lang: "es" | "en";
  /**
   * The call comes from outside the web app (the REST API, or an AI app through MCP). Content it sends is checked,
   * emptying existing content is refused, and what it replaces is saved as a version. The web app saves as people
   * type, so its own edits are neither checked nor versioned.
   */
  outside: boolean;
  /** The app's public address, for links in emails sent after the call. */
  appUrl: string;
}

export const appUrlOf = (req: Request) => (process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

/** The actor of a web app request (signed in with the session cookie). The MCP server's own calls say so in a header. */
export const actorOf = (req: Request): Actor => ({
  id: req.user!.id, name: req.user!.name,
  lang: req.get("x-lang") === "en" ? "en" : "es",
  outside: fromAssistant(req),
  appUrl: appUrlOf(req),
});

export type Db = Pick<PoolClient, "query">;

/** Runs `fn` in a transaction and returns its result. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
