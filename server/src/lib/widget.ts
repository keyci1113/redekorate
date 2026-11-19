// Feedback widget: settings and the pure rules around them (allowed domains, identity proof, ticket titles).
import crypto from "node:crypto";
import { z } from "zod";
import { TICKET_TYPES } from "./tickets.js";

export const KINDS = ["broken", "idea", "question"] as const;
export type Kind = (typeof KINDS)[number];
export const POSITIONS = ["bottom-right", "bottom-left", "edge-right", "hidden"] as const;

const Type = z.enum(TICKET_TYPES);
/** Everything a project can configure. Every field has a default, so a stored `{}` is a complete widget. */
export const Settings = z.object({
  assignee_id: z.string().uuid().nullable().default(null),
  types: z.object({ broken: Type.default("bug"), idea: Type.default("design_change"), question: Type.default("task") }).default({ broken: "bug", idea: "design_change", question: "task" }),
  allow: z.object({
    screenshot: z.boolean().default(true), recording: z.boolean().default(true), files: z.boolean().default(true),
    details: z.boolean().default(true), console: z.boolean().default(false),
  }).default({ screenshot: true, recording: true, files: true, details: true, console: false }),
  privacy: z.object({ hide_private: z.boolean().default(true), ask_email: z.boolean().default(true) }).default({ hide_private: true, ask_email: true }),
  look: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5B21B6"),
    position: z.enum(POSITIONS).default("bottom-right"),
    label: z.string().trim().max(24).default(""),          // empty = the widget's own word for "Feedback" in the page language
    language: z.enum(["auto", "en", "es"]).default("auto"),
    greeting: z.string().trim().max(80).default(""),       // empty = the default greeting; {name} is the signed-in user's first name
  }).default({ accent: "#5B21B6", position: "bottom-right", label: "", language: "auto", greeting: "" }),
});
export type WidgetSettings = z.infer<typeof Settings>;
export const normalizeSettings = (raw: unknown): WidgetSettings => Settings.parse(raw ?? {});

/** What the script on the other site receives: how to look and what to offer. Never who gets the tickets, nor any key. */
export const publicConfig = (s: WidgetSettings) => ({ allow: s.allow, privacy: s.privacy, look: s.look });

/**
 * A domain as typed by a person, in the form it is compared in: lowercase host (with port when given),
 * without scheme, path or trailing dot. "*.acme.com" is kept as a wildcard. null when it is not a host.
 */
export function cleanDomain(input: string): string | null {
  let d = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  const wild = d.startsWith("*.");
  if (wild) d = d.slice(2);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/.test(d)) return null;
  return wild ? `*.${d}` : d;
}

/** Whether a request's Origin header belongs to one of the allowed domains. No origin, or an empty list, is never allowed. */
export function domainAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  let host: string;
  try { const u = new URL(origin); if (u.protocol !== "https:" && u.protocol !== "http:") return false; host = u.host.toLowerCase(); } catch { return false; }
  const bare = host.replace(/:\d+$/, "");
  return allowed.some((a) => {
    if (a.startsWith("*.")) { const base = a.slice(2); return (a.includes(":") ? host : bare).endsWith(`.${base}`); }
    return a === host || (!a.includes(":") && a === bare);
  });
}

/** The proof a host's server computes for a signed-in user: HMAC-SHA256 of the user id with the widget's secret, in hex. */
export const identitySignature = (secret: string, userId: string) => crypto.createHmac("sha256", secret).update(userId).digest("hex");
/** true only when the id comes with its matching proof. Without one the user is recorded but never shown as verified. */
export function identityVerified(secret: string, userId: string | undefined | null, hash: string | undefined | null): boolean {
  if (!userId || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return false;
  return crypto.timingSafeEqual(Buffer.from(identitySignature(secret, userId), "hex"), Buffer.from(hash.toLowerCase(), "hex"));
}

/** A ticket title from the message: its first sentence or line, cut at a word when it is long. */
export function titleFrom(message: string, max = 90): string {
  const first = message.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s/)[0] ?? "";
  if (!first) return "Feedback";
  if (first.length <= max) return first.replace(/[.…]+$/, "") || first;
  const cut = first.slice(0, max), at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

export const newPublicKey = () => `rk_pub_${crypto.randomBytes(9).toString("base64url")}`;
export const newSecret = () => `rk_sec_${crypto.randomBytes(24).toString("base64url")}`;
