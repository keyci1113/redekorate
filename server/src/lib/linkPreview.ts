/**
 * Link previews for shared links: when a study, report or doc link is pasted into WhatsApp,
 * Slack, Teams, LinkedIn or X, the card shows that study's own name and logo instead of the
 * generic redekorate card. Only what the link already reveals to whoever opens it is used
 * (titles, project and organization names, the brand logo). Never answers or participant data.
 */
import { one } from "./db.js";

export type Lang = "es" | "en";

export interface LinkPreview {
  title: string;
  description: string;
  /** Absolute path on this host (e.g. /uploads/abc.png), or null for the default share card. */
  image: string | null;
  /** Brand color, used as theme-color (Discord and some chat apps tint the card with it). */
  color: string | null;
  lang: Lang;
}

const COPY = {
  es: {
    study: "Te invitaron a participar en un estudio. Solo toma unos minutos.",
    studyClosed: "Este estudio ya no recibe respuestas.",
    report: (project: string) => `Reporte de investigación de ${project}.`,
    reportLabel: "Reporte",
    projectReport: (n: number) => `Reporte de investigación con ${n} ${n === 1 ? "estudio" : "estudios"}.`,
    doc: (project: string) => `Documento de investigación de ${project}.`,
  },
  en: {
    study: "You're invited to take part in a study. It only takes a few minutes.",
    studyClosed: "This study is no longer accepting responses.",
    report: (project: string) => `Research report from ${project}.`,
    reportLabel: "Report",
    projectReport: (n: number) => `Research report with ${n} ${n === 1 ? "study" : "studies"}.`,
    doc: (project: string) => `Research document from ${project}.`,
  },
} as const;

const lang = (v: unknown): Lang => (v === "en" ? "en" : "es");

/**
 * Chat apps reliably render PNG, JPEG and GIF previews; WebP and SVG are hit and miss
 * (LinkedIn and Teams drop them), so those fall back to the default card.
 */
export function previewImage(...candidates: (string | null | undefined)[]): string | null {
  return candidates.find((u) => typeof u === "string" && /^\/uploads\/[\w.-]+\.(png|jpe?g|gif)$/i.test(u)) ?? null;
}

const color = (c: unknown) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface StudyRow { title: string; status: string; settings: any; org_logo: string | null; org_color: string | null }
export function studyPreview(s: StudyRow): LinkPreview {
  const l = lang(s.settings?.language);
  return {
    title: clip(s.title, 90),
    description: s.status === "live" ? COPY[l].study : COPY[l].studyClosed,
    image: previewImage(s.settings?.brand?.logo, s.org_logo),
    color: color(s.settings?.brand?.color) ?? color(s.org_color),
    lang: l,
  };
}

export interface ReportRow { title: string; settings: any; project_name: string; project_color: string | null; org_name: string | null; org_logo: string | null }
export function reportPreview(r: ReportRow): LinkPreview {
  const l = lang(r.settings?.language);
  return {
    title: clip(`${COPY[l].reportLabel}: ${r.title}`, 90),
    description: COPY[l].report(r.org_name ? `${r.project_name} · ${r.org_name}` : r.project_name),
    image: previewImage(r.org_logo, r.settings?.brand?.logo),
    color: color(r.settings?.brand?.color) ?? color(r.project_color),
    lang: l,
  };
}

export interface ProjectReportRow { name: string; color: string | null; org_name: string | null; org_logo: string | null; studies: number; language: unknown }
export function projectReportPreview(p: ProjectReportRow): LinkPreview {
  const l = lang(p.language);
  return {
    title: clip(p.org_name ? `${p.name} · ${p.org_name}` : p.name, 90),
    description: COPY[l].projectReport(p.studies),
    image: previewImage(p.org_logo),
    color: color(p.color),
    lang: l,
  };
}

export interface DocRow { title: string; language: string; project_name: string; project_color: string | null; org_logo: string | null }
export function docPreview(d: DocRow): LinkPreview {
  const l = lang(d.language);
  return {
    title: clip(d.title, 90),
    description: COPY[l].doc(d.project_name),
    image: previewImage(d.org_logo),
    color: color(d.project_color),
    lang: l,
  };
}

/** Look up the preview for a shared-link path. Null for every other path, or a link that does not exist. */
export async function linkPreview(pathname: string): Promise<LinkPreview | null> {
  const m = pathname.match(/^\/(s|r|pr|d)\/([A-Za-z0-9_-]{1,64})\/?$/);
  if (!m) return null;
  const [, kind, token] = m;
  if (kind === "s") {
    const s = await one<StudyRow>(
      `select s.title, s.status, coalesce(s.published_settings, s.settings) as settings, o.logo as org_logo, o.color as org_color
       from studies s join projects p on p.id = s.project_id left join organizations o on o.id = p.organization_id
       where s.public_slug = $1`, [token]);
    return s && studyPreview(s);
  }
  if (kind === "r") {
    const r = await one<ReportRow>(
      `select s.title, coalesce(s.published_settings, s.settings) as settings, p.name as project_name, p.color as project_color,
         o.name as org_name, o.logo as org_logo
       from report_shares rs join studies s on s.id = rs.study_id join projects p on p.id = s.project_id
       left join organizations o on o.id = p.organization_id
       where rs.token = $1 and rs.revoked_at is null`, [token]);
    return r && reportPreview(r);
  }
  if (kind === "pr") {
    const p = await one<ProjectReportRow>(
      `select p.name, p.color, o.name as org_name, o.logo as org_logo, coalesce(array_length(rs.study_ids, 1), 0)::int as studies,
         (select coalesce(s.published_settings, s.settings)->>'language' from studies s where s.id = rs.study_ids[1]) as language
       from report_shares rs join projects p on p.id = rs.project_id left join organizations o on o.id = p.organization_id
       where rs.token = $1 and rs.revoked_at is null and rs.project_id is not null`, [token]);
    return p && projectReportPreview(p);
  }
  if (!/^[A-Za-z0-9]{24}$/.test(token)) return null;
  const d = await one<DocRow>(
    `select d.title, d.language, p.name as project_name, p.color as project_color, o.logo as org_logo
     from documents d join projects p on p.id = d.project_id left join organizations o on o.id = p.organization_id
     where d.share_token = $1`, [token]);
  return d && docPreview(d);
}
