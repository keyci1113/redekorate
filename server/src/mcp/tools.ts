/**
 * The MCP tools. Each one calls the app's own REST API as the token's user, so project roles, validation
 * and side effects are exactly what the app does. What outside apps may do is this list and nothing more:
 * read, create and edit. The API client below has no DELETE, and participant details never leave this layer.
 */
import { z } from "zod";
import { BLOCK_REFERENCE, BLOCK_TYPES, DIAGRAM_REFERENCE, DIAGRAM_SHAPES, METHODS } from "./reference.js";
import { PROJECT_CATEGORIES } from "../lib/projectCategories.js";

/** The REST API as the token's user. No delete on purpose. */
export interface Api {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
}
export interface Ctx { api: Api; baseUrl: string }

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /** false = only reads. Shown to the client as readOnlyHint. */
  writes: boolean;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>, ctx: Ctx) => Promise<unknown>;
}
const tool = <S extends z.ZodRawShape>(t: ToolDef<S>) => t as unknown as ToolDef;

const id = (what: string) => z.string().uuid().describe(`The ${what} id`);
const Category = z.enum(PROJECT_CATEGORIES).describe("What kind of work the project holds: UX research, software development, AI, automation, IT in general, design or other");
const Block = z.object({ id: z.string().min(1), type: z.enum(BLOCK_TYPES), title: z.string() }).passthrough();
const Severity = z.enum(["low", "medium", "high", "critical"]);
const Confidence = z.enum(["low", "medium", "high"]);
const Lang = z.enum(["es", "en"]);

/** Most answers are small; a cap keeps one giant study from flooding the assistant's context. */
export const ANSWERS_PER_BLOCK = 500;

interface Session { id: string; participant?: unknown; device: string | null; started_at: string; completed_at: string | null }
interface Answer { session_id: string; block_id: string; value: unknown; duration_ms: number | null }
interface StudyBlock { id: string; type: string; title?: string }

/**
 * Results as an assistant can use them: answers grouped by block, sessions without the participant record
 * (URL parameters such as name or email that a link may carry).
 */
export function shapeResults(r: { study: { id: string; title: string; status: string; blocks: StudyBlock[] }; sessions: Session[]; answers: Answer[]; insights: unknown[] }) {
  const byBlock = new Map<string, Answer[]>();
  for (const a of r.answers) byBlock.set(a.block_id, [...(byBlock.get(a.block_id) ?? []), a]);
  return {
    study: { id: r.study.id, title: r.study.title, status: r.study.status },
    sessions: {
      started: r.sessions.length,
      completed: r.sessions.filter((s) => s.completed_at).length,
      list: r.sessions.map((s) => ({ id: s.id, device: s.device, started_at: s.started_at, completed_at: s.completed_at })),
    },
    blocks: r.study.blocks.map((b) => {
      const all = byBlock.get(b.id) ?? [];
      return {
        id: b.id, type: b.type, title: b.title ?? "", answer_count: all.length,
        ...(all.length > ANSWERS_PER_BLOCK ? { note: `Showing the first ${ANSWERS_PER_BLOCK} of ${all.length} answers.` } : {}),
        answers: all.slice(0, ANSWERS_PER_BLOCK).map((a) => ({ session_id: a.session_id, value: a.value, duration_ms: a.duration_ms })),
      };
    }),
    insights: r.insights,
  };
}

const studyLinks = (baseUrl: string, s: { id: string; public_slug: string }) => ({
  participant_link: `${baseUrl}/s/${s.public_slug}`,
  edit_in_app: `${baseUrl}/studies/${s.id}/edit`,
  results_in_app: `${baseUrl}/studies/${s.id}/results`,
});

export const TOOLS: ToolDef[] = [
  // ---------- read ----------
  tool({
    name: "whoami", title: "Who am I", writes: false, input: {},
    description: "The redekorate account this connection acts as.",
    run: async (_a, { api }) => (await api.get("/auth/me")).user,
  }),
  tool({
    name: "list_projects", title: "List projects", writes: false, input: { category: Category.optional().describe("Only projects of this category") },
    description: "Projects the user can open (own, shared with them, or in their organizations), with their category, role and counts of studies, responses, insights and documents.",
    run: async ({ category }, { api }) => {
      const { projects } = await api.get<{ projects: any[] }>(category ? `/projects?category=${category}` : "/projects");
      return projects.map((p) => ({
        id: p.id, name: p.name, description: p.description, category: p.category, role: p.role, archived: p.archived,
        organization: p.org_name ?? null, studies: p.study_count, live_studies: p.live_count,
        responses: p.response_count, insights: p.insight_count, documents: p.document_count, updated_at: p.updated_at,
      }));
    },
  }),
  tool({
    name: "get_project", title: "Get project", writes: false, input: { project_id: id("project") },
    description: "One project with its studies (status, responses) and documents.",
    run: async ({ project_id }, { api, baseUrl }) => {
      // Someone with access to only part of a project (e.g. tickets) still gets the parts they can open.
      const part = <T,>(p: Promise<T>) => p.catch((e: Error) => ({ unavailable: e.message }));
      const [{ project }, studies, documents] = await Promise.all([
        api.get(`/projects/${project_id}`), part(api.get(`/projects/${project_id}/studies`)), part(api.get(`/documents?project_id=${project_id}`)),
      ]);
      return {
        project: { id: project.id, name: project.name, description: project.description, category: project.category, color: project.color, archived: project.archived, role: project.role },
        studies: "unavailable" in studies ? studies : studies.studies.map((s: any) => ({ id: s.id, title: s.title, method: s.method, status: s.status, blocks: s.block_count, responses: s.response_count, started: s.started_count, updated_at: s.updated_at, ...studyLinks(baseUrl, s) })),
        documents: "unavailable" in documents ? documents : documents.documents.map((d: any) => ({ id: d.id, kind: d.kind, title: d.title, language: d.language, updated_at: d.updated_at })),
        open_in_app: `${baseUrl}/projects/${project.id}`,
      };
    },
  }),
  tool({
    name: "get_study", title: "Get study", writes: false, input: { study_id: id("study") },
    description: "A study's blocks and settings (the draft), its status, and whether the draft has changes participants don't see yet.",
    run: async ({ study_id }, { api, baseUrl }) => {
      const { study: s, project } = await api.get(`/studies/${study_id}`);
      return {
        id: s.id, title: s.title, method: s.method, status: s.status, has_unpublished_changes: s.has_unpublished,
        blocks: s.blocks, settings: s.settings, project: { id: project.id, name: project.name, role: project.role },
        ...studyLinks(baseUrl, s),
      };
    },
  }),
  tool({
    name: "get_study_results", title: "Get study results", writes: false, input: { study_id: id("study") },
    description: `A study's responses grouped by block (up to ${ANSWERS_PER_BLOCK} answers per block), session counts and the study's insights. Participant details are never included.`,
    run: async ({ study_id }, { api }) => shapeResults(await api.get(`/studies/${study_id}/results`)),
  }),
  tool({
    name: "list_insights", title: "List insights", writes: false, input: { project_id: id("project") },
    description: "Insights in a project, newest first, with severity, confidence, tags and the study each came from.",
    run: async ({ project_id }, { api }) => (await api.get(`/projects/${project_id}/insights`)).insights,
  }),
  tool({
    name: "get_document", title: "Get document", writes: false, input: { document_id: id("document") },
    description: "A research document (personas, journey maps, plans, scripts…) or an Architecture diagram or sitemap: its kind, language and content.",
    run: async ({ document_id }, { api }) => {
      const { document: d } = await api.get(`/documents/${document_id}`);
      return { id: d.id, project_id: d.project_id, kind: d.kind, title: d.title, language: d.language, data: d.data, updated_at: d.updated_at };
    },
  }),
  tool({
    name: "study_block_reference", title: "Study block reference", writes: false, input: {},
    description: "How study blocks are shaped. Read this before create_study or update_study.",
    run: async () => ({ methods: METHODS, reference: BLOCK_REFERENCE }),
  }),
  tool({
    name: "diagram_reference", title: "Diagram reference", writes: false, input: {},
    description: "How diagrams, sitemaps and mood boards (the Architecture section) are shaped. Read this before creating or editing one.",
    run: async () => ({ kinds: ["diagram", "sitemap", "moodboard"], shapes: DIAGRAM_SHAPES, reference: DIAGRAM_REFERENCE }),
  }),

  // ---------- write (never delete) ----------
  tool({
    name: "create_project", title: "Create project", writes: true,
    input: {
      name: z.string().trim().min(1).max(160), description: z.string().max(4000).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), category: Category.optional().describe("Defaults to ux_research"),
      organization_id: z.string().uuid().optional().describe("Put it in an organization the user belongs to; omit for a personal project"),
    },
    description: "Create a project owned by the user.",
    run: async (a, { api }) => (await api.post("/projects", a)).project,
  }),
  tool({
    name: "update_project", title: "Update project", writes: true,
    input: { project_id: id("project"), name: z.string().trim().min(1).max(160).optional(), description: z.string().max(4000).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), category: Category.optional() },
    description: "Rename a project or change its description, color or category (editor role or higher).",
    run: async ({ project_id, ...b }, { api }) => (await api.patch(`/projects/${project_id}`, b)).project,
  }),
  tool({
    name: "create_study", title: "Create study", writes: true,
    input: {
      project_id: id("project"), title: z.string().trim().min(1).max(200),
      method: z.enum(METHODS).describe("The research method (template key); use \"blank\" when none fits"),
      blocks: z.array(Block).default([]).describe("See study_block_reference"),
      language: Lang.default("es").describe("The language participants see"),
    },
    description: "Create a draft study in a project. It gets a participant link but takes no responses until set_study_status makes it live.",
    run: async ({ language, ...b }, { api, baseUrl }) => {
      const { study } = await api.post("/studies", { ...b, settings: { language } });
      return { id: study.id, title: study.title, status: study.status, ...studyLinks(baseUrl, study) };
    },
  }),
  tool({
    name: "update_study", title: "Update study", writes: true,
    input: {
      study_id: id("study"), title: z.string().trim().min(1).max(200).optional(),
      blocks: z.array(Block).optional().describe("The full block list; it replaces the current one. Read get_study first."),
      settings: z.record(z.string(), z.unknown()).optional().describe("The full settings object; it replaces the current one"),
    },
    description: "Edit a study's draft. On a live study participants keep the published version until publish_study_changes.",
    run: async ({ study_id, ...b }, { api }) => {
      const { study: s } = await api.patch(`/studies/${study_id}`, b);
      return { id: s.id, title: s.title, status: s.status, has_unpublished_changes: s.has_unpublished, blocks: s.blocks.length };
    },
  }),
  tool({
    name: "set_study_status", title: "Launch or close a study", writes: true,
    input: { study_id: id("study"), status: z.enum(["draft", "live", "closed"]).describe("live = taking responses, closed = stopped, draft = back to editing") },
    description: "Launch a study (live), stop taking responses (closed) or take it back to draft. Going live publishes the current draft.",
    run: async ({ study_id, status }, { api, baseUrl }) => {
      const { study: s } = await api.post(`/studies/${study_id}/status`, { status });
      return { id: s.id, status: s.status, ...studyLinks(baseUrl, s) };
    },
  }),
  tool({
    name: "publish_study_changes", title: "Publish study changes", writes: true, input: { study_id: id("study") },
    description: "On a live study, make the edited draft the version new participants see.",
    run: async ({ study_id }, { api }) => {
      const { study: s } = await api.post(`/studies/${study_id}/publish`);
      return { id: s.id, status: s.status, published_version: s.published_version };
    },
  }),
  tool({
    name: "create_insight", title: "Create insight", writes: true,
    input: {
      project_id: id("project"), study_id: z.string().uuid().optional().describe("The study it came from, if any"),
      title: z.string().trim().min(1).max(300), body: z.string().max(20000).optional(),
      tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(), severity: Severity.optional(), confidence: Confidence.optional(),
    },
    description: "Record a research insight in a project.",
    run: async (a, { api }) => (await api.post("/insights", a)).insight,
  }),
  tool({
    name: "update_insight", title: "Update insight", writes: true,
    input: {
      insight_id: id("insight"), title: z.string().trim().min(1).max(300).optional(), body: z.string().max(20000).optional(),
      tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(), severity: Severity.optional(), confidence: Confidence.optional(),
      reviewed: z.boolean().optional().describe("Mark as reviewed (true) or not reviewed (false)"),
    },
    description: "Edit an insight or mark it reviewed.",
    run: async ({ insight_id, ...b }, { api }) => (await api.patch(`/insights/${insight_id}`, b)).insight,
  }),
  tool({
    name: "create_document", title: "Create document", writes: true,
    input: {
      project_id: id("project"), kind: z.string().min(1).max(60).describe("Template kind, e.g. proto_persona, journey_map, interview_guide, research_plan; read a document of the same kind with get_document to copy its data shape. \"diagram\", \"sitemap\" and \"moodboard\" are the Architecture section: read diagram_reference first"),
      title: z.string().trim().min(1).max(200), language: Lang, data: z.record(z.string(), z.unknown()).optional(),
    },
    description: "Create a research document in a project.",
    run: async (a, { api, baseUrl }) => {
      const { document: d } = await api.post("/documents", a);
      return { id: d.id, kind: d.kind, title: d.title, open_in_app: `${baseUrl}/docs/${d.id}` };
    },
  }),
  tool({
    name: "update_document", title: "Update document", writes: true,
    input: {
      document_id: id("document"), title: z.string().trim().min(1).max(200).optional(), language: Lang.optional(),
      data: z.record(z.string(), z.unknown()).optional().describe("The full content; it replaces the current one. Read get_document first."),
    },
    description: "Edit a document's title, language or content.",
    run: async ({ document_id, ...b }, { api }) => {
      const { document: d } = await api.patch(`/documents/${document_id}`, b);
      return { id: d.id, title: d.title, language: d.language, updated_at: d.updated_at };
    },
  }),
];
