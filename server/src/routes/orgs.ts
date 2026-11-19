// Organizations: a workspace (personal or a company) with a logo, a color and people.
// owner: everything, including deleting it · admin: settings, people and invitations · member: comments on every project.
import { Router } from "express";
import { orgRoadmap } from "./roadmap.js";
import crypto from "node:crypto";
import { z } from "zod";
import { one, query } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { sendMail } from "../lib/mail.js";
import { AREAS, accessJoins, accessWhere, areasSql, roleSql } from "../lib/access.js";

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
// What a member (not an owner or admin) can open: on every project or only the chosen ones, how much they can do, and which sections.
const Access = z.object({
  all_projects: z.boolean().optional(),
  project_role: z.enum(["viewer", "commenter", "editor"]).optional(),
  areas: z.array(z.enum(["research", "tickets"])).min(1).max(2).transform((v) => AREAS.filter((a) => v.includes(a))).optional(),
  project_ids: z.array(z.string().uuid()).max(500).optional(),
});
type AccessInput = z.infer<typeof Access>;

/** The organization's projects among `ids` (silently drops ids from elsewhere). */
const orgProjects = async (orgId: string, ids: string[]) =>
  (await query<{ id: string }>("select id from projects where organization_id = $1 and id = any($2)", [orgId, ids])).map((r) => r.id);

/** Saves a member's access. With chosen projects, the person becomes a collaborator of exactly those projects of the organization. */
async function applyAccess(orgId: string, userId: string, a: AccessInput, addedBy: string) {
  await query(
    `update organization_members set all_projects = coalesce($3, all_projects), project_role = coalesce($4, project_role), areas = coalesce($5::text[], areas)
     where organization_id = $1 and user_id = $2`, [orgId, userId, a.all_projects ?? null, a.project_role ?? null, a.areas ?? null]);
  if (!a.project_ids) return;
  const cur = (await one<{ project_role: string; areas: string[] }>("select project_role, areas from organization_members where organization_id = $1 and user_id = $2", [orgId, userId]))!;
  const ids = await orgProjects(orgId, a.project_ids);
  await query(
    `delete from project_members m using projects p where p.id = m.project_id and p.organization_id = $1 and m.user_id = $2 and not (m.project_id = any($3))`, [orgId, userId, ids]);
  await query(
    `insert into project_members(project_id, user_id, role, areas, added_by)
     select p.id, $1::uuid, $3, $4::text[], $5::uuid from projects p where p.id = any($2) and p.owner_id <> $1
     on conflict (project_id, user_id) do update set role = excluded.role, areas = excluded.areas`, [userId, ids, cur.project_role, cur.areas, addedBy]);
}

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

const MEMBERS_SQL = `select u.id as user_id, u.name, u.email, u.avatar, om.role, om.created_at, om.all_projects, om.project_role, om.areas,
    coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'role', m.role, 'areas', m.areas) order by lower(p.name))
              from project_members m join projects p on p.id = m.project_id
              where m.user_id = u.id and p.organization_id = om.organization_id), '[]'::jsonb) as projects
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
// Milestones of every project of the organization the person can open: the organization roadmap.
orgs.get("/:id/roadmap", async (req, res) => {
  const org = await requireOrg(req.params.id, req.user!.id);
  res.json({ organization: { id: org.id, name: org.name }, milestones: await orgRoadmap(req.params.id, req.user!.id) });
});

orgs.get("/:id/projects", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id);
  const rows = await query(
    `select p.id, p.name, p.description, p.color, p.archived, p.updated_at, p.owner_id, u.name as owner_name, ${roleSql("$2")} as role, ${areasSql("$2")} as areas,
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
  const b = parse(Access.extend({ email, role: MemberRole }), req.body);
  if (b.role === "owner" && o.role !== "owner") throw new HttpError(403, "Solo quien es dueño de la organización puede hacer esto");
  const u = await one<{ id: string }>("select id from users where email = $1 and disabled_at is null", [b.email]);
  if (!u) throw new HttpError(404, "No hay una cuenta activa con ese correo. Invítala desde esta misma pestaña.");
  await query(
    `insert into organization_members(organization_id, user_id, role) values ($1,$2,$3)
     on conflict (organization_id, user_id) do update set role = excluded.role`, [req.params.id, u.id, b.role]);
  await applyAccess(req.params.id, u.id, b, req.user!.id);
  res.status(201).json({ members: await members(req.params.id) });
});

orgs.patch("/:id/members/:userId", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(Access.extend({ role: MemberRole.optional() }), req.body);
  const cur = await one<{ role: OrgRole }>("select role from organization_members where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId]);
  if (!cur) throw notFound("Miembro");
  const role = b.role ?? cur.role;
  if ((role === "owner" || cur.role === "owner") && o.role !== "owner") throw new HttpError(403, "Solo quien es dueño de la organización puede hacer esto");
  if (cur.role === "owner" && role !== "owner" && (await owners(req.params.id)) <= 1) throw new HttpError(400, "Debe quedar al menos una persona dueña de la organización.");
  await query("update organization_members set role = $3 where organization_id = $1 and user_id = $2", [req.params.id, req.params.userId, role]);
  await applyAccess(req.params.id, req.params.userId, b, req.user!.id);
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
const INVITES_SQL = `select i.id, i.email, i.org_role as role, i.created_at, i.expires_at, u.name as invited_by,
    i.org_all_projects as all_projects, i.org_project_role as project_role, i.org_areas as areas, i.org_project_ids as project_ids
  from invites i left join users u on u.id = i.invited_by
  where i.organization_id = $1 and i.accepted_at is null and i.expires_at > now() order by i.created_at desc`;

orgs.get("/:id/invites", async (req, res) => {
  await requireOrg(req.params.id, req.user!.id, "admin");
  res.json({ invites: await query(INVITES_SQL, [req.params.id]) });
});

orgs.post("/:id/invites", async (req, res) => {
  const o = await requireOrg(req.params.id, req.user!.id, "admin");
  const b = parse(Access.extend({ email, role: InviteRole.default("member") }), req.body);
  const projectIds = b.all_projects === false ? await orgProjects(req.params.id, b.project_ids ?? []) : [];
  if (await one("select 1 from users where email = $1", [b.email])) throw new HttpError(409, "Esa persona ya tiene cuenta: agrégala como miembro con su correo.");
  await query("update invites set expires_at = now() where email = $1 and organization_id = $2 and accepted_at is null and expires_at > now()", [b.email, req.params.id]);
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    `insert into invites(email, role, token_hash, invited_by, expires_at, organization_id, org_role, org_all_projects, org_project_role, org_areas, org_project_ids)
     values ($1,'member',$2,$3, now() + interval '7 days', $4, $5, $6, coalesce($7, 'commenter'), coalesce($8::text[], '{research,tickets}'), $9)`,
    [b.email, sha256(token), req.user!.id, req.params.id, b.role, b.all_projects ?? true, b.project_role ?? null, b.areas ?? null, projectIds]);
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
