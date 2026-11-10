// Organizations: a workspace (personal or a company) with a logo, a color and people.
// owner: everything, including deleting it · admin: settings, people and invitations · member: comments on every project.
import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { sendMail } from "../lib/mail.js";
import { accessJoins, accessWhere, roleSql } from "../lib/access.js";

export const orgs = Router();
orgs.use(requireAuth);

export type OrgRole = "owner" | "admin" | "member";
const ORG_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };
const orgAtLeast = (role: OrgRole | null | undefined, min: OrgRole) => !!role && ORG_RANK[role] >= ORG_RANK[min];

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const email = z.string().trim().toLowerCase().email().max(254);
const OrgInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // The logo must be a file uploaded to this instance, never an external URL (same rule as profile photos).
  logo: z.string().regex(/^\/uploads\/[a-z0-9]+\.(png|jpg|gif|webp)$/).nullable().optional(),
});
const MemberRole = z.enum(["owner", "admin", "member"]);
const InviteRole = z.enum(["admin", "member"]);

/** The organization as the client sees it: the caller's role plus counts. */
const ORG_SQL = (u: string) => `
  select o.id, o.name, o.logo, o.color, o.created_at, om.role,
    (select count(*)::int from organization_members x where x.organization_id = o.id) as member_count,
    (select count(*)::int from projects p where p.organization_id = o.id and not p.archived) as project_count
  from organizations o join organization_members om on om.organization_id = o.id and om.user_id = ${u}`;

/** The organization with the caller's role. 404 without membership, 403 when the role is too low. */
async function requireOrg(orgId: string, userId: string, min: OrgRole = "member") {
  const o = await one<{ id: string; name: string; logo: string | null; color: string; role: OrgRole }>(`${ORG_SQL("$2")} where o.id = $1`, [orgId, userId]);
  if (!o) throw notFound("Organización");
  if (!orgAtLeast(o.role, min)) throw new HttpError(403, min === "owner" ? "Solo quien es dueño de la organización puede hacer esto" : "Solo administradores de la organización pueden hacer esto");
  return o;
}

const MEMBERS_SQL = `select u.id as user_id, u.name, u.email, u.avatar, om.role, om.created_at
  from organization_members om join users u on u.id = om.user_id where om.organization_id = $1
  order by array_position(array['owner','admin','member'], om.role), om.created_at`;
const members = (orgId: string) => query(MEMBERS_SQL, [orgId]);
const owners = async (orgId: string) => (await one<{ n: number }>("select count(*)::int as n from organization_members where organization_id = $1 and role = 'owner'", [orgId]))!.n;

orgs.get("/", async (req, res) => {
  res.json({ organizations: await query(`${ORG_SQL("$1")} order by o.name`, [req.user!.id]) });
});

/** Anyone can create an organization and becomes its owner. */
orgs.post("/", async (req, res) => {
  const b = parse(OrgInput, req.body);
  const o = await one<{ id: string }>(
    "insert into organizations(name, color, logo, created_by) values ($1, coalesce($2,'#5902A1'), $3, $4) returning id",
    [b.name, b.color ?? null, b.logo ?? null, req.user!.id]);
  await query("insert into organization_members(organization_id, user_id, role) values ($1,$2,'owner')", [o!.id, req.user!.id]);
  res.status(201).json({ organization: await requireOrg(o!.id, req.user!.id) });
});

orgs.get("/:id", async (req, res) => {
  res.json({ organization: await requireOrg(req.params.id, req.user!.id) });
});

orgs.patch("/:id", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(OrgInput.partial(), req.body);
  await query(
    `update organizations set name = coalesce($2, name), color = coalesce($3, color),
       logo = case when $4::boolean then $5 else logo end, updated_at = now() where id = $1`,
    [req.params.id, b.name ?? null, b.color ?? null, b.logo !== undefined, b.logo ?? null]);
  res.json({ organization: await requireOrg(req.params.id, req.user!.id) });
});

/** Deleting an organization keeps its projects: they become personal projects of their owners again. */
orgs.delete("/:id", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id, "owner");
  await query("delete from organizations where id = $1", [req.params.id]);
  res.json({ ok: true });
});

/** The organization's projects with the caller's role in each. */
orgs.get("/:id/projects", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id);
  const rows = await query(
    `select p.id, p.name, p.description, p.color, p.archived, p.updated_at, u.name as owner_name, ${roleSql("$2")} as role,
       (select count(*)::int from studies s where s.project_id = p.id) as study_count
     ${accessJoins("$2")} join users u on u.id = p.owner_id
     where p.organization_id = $1 and ${accessWhere("$2")} order by p.updated_at desc`, [req.params.id, req.user!.id]);
  res.json({ projects: rows });
});

// ── People ──────────────────────────────────────────────────────
orgs.get("/:id/members", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id);
  res.json({ members: await members(req.params.id) });
});

/** Adds (or changes the role of) a person who already has an account. Only owners hand out the owner role. */
orgs.post("/:id/members", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(z.object({ email, role: MemberRole }), req.body);
  if (b.role === "owner" && o.role !== "owner") throw new HttpError(403, "Solo quien es dueño de la organización puede hacer esto");
  const u = await one<{ id: string }>("select id from users where email = $1 and disabled_at is null", [b.email]);
  if (!u) throw new HttpError(404, "No hay una cuenta activa con ese correo. Invítala desde esta misma pestaña.");
  await query(
    `insert into organization_members(organization_id, user_id, role) values ($1,$2,$3)
     on conflict (organization_id, user_id) do update set role = excluded.role`, [req.params.id, u.id, b.role]);
  res.status(201).json({ members: await members(req.params.id) });
});

orgs.patch("/:id/members/:userId", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(z.object({ role: MemberRole }), req.body);
  const cur = await one<{ role: OrgRole }>("select role from organization_members where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  if (!cur) throw notFound("Miembro");
  if ((b.role === "owner" || cur.role === "owner") && o.role !== "owner") throw new HttpError(403, "Solo quien es dueño de la organización puede hacer esto");
  if (cur.role === "owner" && b.role !== "owner" && (await owners(req.params.id)) <= 1) throw new HttpError(400, "Debe quedar al menos una persona dueña de la organización.");
  await query("update organization_members set role = $3 where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId, b.role]);
  res.json({ members: await members(req.params.id) });
});

/** Admins remove people (owners only by owners); anyone can leave, except the last owner. */
orgs.delete("/:id/members/:userId", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id);
  const self = req.params.userId === req.user!.id;
  const cur = await one<{ role: OrgRole }>("select role from organization_members where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  if (!cur) throw notFound("Miembro");
  if (!self && !orgAtLeast(o.role, "admin")) throw new HttpError(403, "Solo administradores de la organización pueden hacer esto");
  if (!self && cur.role === "owner" && o.role !== "owner") throw new HttpError(403, "Solo quien es dueño de la organización puede hacer esto");
  if (cur.role === "owner" && (await owners(req.params.id)) <= 1) throw new HttpError(400, "Debe quedar al menos una persona dueña de la organización.");
  await query("delete from organization_members where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  res.json({ members: await members(req.params.id) });
});

// ── Invitations (people without an account yet) ─────────────────
const INVITES_SQL = `select i.id, i.email, i.org_role as role, i.created_at, i.expires_at, u.name as invited_by
  from invites i left join users u on u.id = i.invited_by
  where i.organization_id = $1 and i.accepted_at is null and i.expires_at > now() order by i.created_at desc`;

orgs.get("/:id/invites", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id, "admin");
  res.json({ invites: await query(INVITES_SQL, [req.params.id]) });
});

orgs.post("/:id/invites", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(z.object({ email, role: InviteRole.default("member") }), req.body);
  if (await one("select 1 from users where email = $1", [b.email])) throw new HttpError(409, "Esa persona ya tiene cuenta: agrégala como miembro con su correo.");
  await query("update invites set expires_at = now() where email = $1 and organization_id = $2 and accepted_at is null and expires_at > now()", [b.email, req.params.id]);
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    "insert into invites(email, role, token_hash, invited_by, expires_at, organization_id, org_role) values ($1,'member',$2,$3, now() + interval '7 days', $4, $5)",
    [b.email, sha256(token), req.user!.id, req.params.id, b.role]);
  const base = process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
  const link = `${base}/invite?token=${token}`;
  await sendMail(b.email, `Te invitaron a ${o.name} en Redekorate`,
    `Hola,\n\n${req.user!.name} te invitó a la organización ${o.name} en Redekorate. Crea tu cuenta con este enlace (válido por 7 días):\n${link}\n\nSi no esperabas esta invitación, ignora este correo.`);
  res.status(201).json({ invites: await query(INVITES_SQL, [req.params.id]), link, mailed: !!process.env.SMTP_HOST });
});

orgs.delete("/:id/invites/:inviteId", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id, "admin");
  await query("update invites set expires_at = now() where id = $1 and organization_id = $2 and accepted_at is null", [req.params.inviteId, req.params.id]);
  res.json({ invites: await query(INVITES_SQL, [req.params.id]) });
});
