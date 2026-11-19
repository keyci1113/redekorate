import type { Area, MemberLevel } from "./access";
import type { Block } from "../blocks/types";
import type { ProjectCategory } from "./projectCategories";

export type Role = "admin" | "member";
export interface User { id: string; email: string; name: string; role: Role; avatar: string | null; onboarded_at: string | null }
export interface AdminUser extends User { created_at: string; last_login_at: string | null; disabled_at: string | null; project_count: number }
export interface Invite { id: string; email: string; role: Role; created_at: string; expires_at: string; invited_by: string | null }
/** Cuenta externa (Google/Microsoft) vinculada a un usuario. */
export interface Identity { provider: "google" | "microsoft"; email: string | null; created_at: string; last_login_at: string | null }

/** Project roles, lowest to highest. Commenter reads everything and can leave comments. */
export type ProjectRole = "owner" | "editor" | "commenter" | "viewer";
export interface ProjectMember { user_id: string; name: string; email: string; avatar: string | null; role: ProjectRole; areas?: Area[]; created_at: string }
/** Someone who reaches a project through its organization, without being a collaborator of it. */
export interface OrgAccessMember { user_id: string; name: string; email: string; avatar: string | null; org_role: OrgRole; role: ProjectRole; areas: Area[] }

/** Organization roles: owner (everything), admin (settings and people), member (commenter on every project). */
export type OrgRole = "owner" | "admin" | "member";
export interface Organization {
  id: string; name: string; logo: string | null; color: string; created_at: string;
  role: OrgRole; member_count: number; project_count: number;
}
export interface OrgMember {
  user_id: string; name: string; email: string; avatar: string | null; role: OrgRole; created_at: string;
  // For members (owners and admins have everything): every project or only the chosen ones, what they can do and which sections.
  all_projects: boolean; project_role: MemberLevel; areas: Area[];
  projects: { id: string; role: MemberLevel; areas: Area[] }[];   // the organization's projects they are a collaborator of
}
export interface OrgInvite { id: string; email: string; role: "admin" | "member"; created_at: string; expires_at: string; invited_by: string | null; all_projects: boolean; project_role: MemberLevel; areas: Area[]; project_ids: string[] }
/** The organization fields a project carries (null when personal). */
export interface OrgRef { organization_id?: string | null; org_name?: string | null; org_logo?: string | null; org_color?: string | null }

export interface Comment { id: string; body: string; created_at: string; user_id: string | null; name: string | null; avatar: string | null }

export interface Project extends OrgRef {
  id: string; name: string; description: string; color: string; archived: boolean;
  /** What kind of work the project holds; older answers may lack it (then it is UX research). */
  category?: ProjectCategory;
  role?: ProjectRole; areas?: Area[]; owner_name?: string;   // rol de quien consulta; owner_name para proyectos compartidos
  /** Next to a document: the person's project role, or null when the document was shared with them by email (role is then their role on it). */
  project_role?: ProjectRole | null;
  created_at: string; updated_at: string;
  study_count?: number; live_count?: number; response_count?: number; insight_count?: number;
  started_count?: number; document_count?: number; diagram_count?: number; participant_count?: number; share_count?: number;
}

export type StudyStatus = "draft" | "live" | "closed";

export interface Study {
  id: string; project_id: string; title: string; method: string; status: StudyStatus;
  blocks: Block[]; settings: Record<string, unknown>; public_slug: string;
  published_at: string | null; created_at: string; updated_at: string;
  has_unpublished?: boolean; published_version?: number;   // live: el borrador difiere de lo que ven los participantes
  block_count?: number; response_count?: number; started_count?: number;
}

export interface Session { id: string; participant?: Record<string, unknown>; device?: string | null; started_at: string; completed_at: string | null }
export interface Answer { session_id: string; block_id: string; value: unknown; duration_ms: number | null }

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";

export interface Insight {
  id: string; project_id?: string; study_id?: string | null; study_title?: string | null;
  title: string; body: string; tags: string[]; severity: Severity; confidence: Confidence;
  created_at: string;
  reviewed_at?: string | null;   // null = pendiente de revisar
  ticket_numbers?: number[];     // tickets created from or linked to this insight
  source_ticket?: { number: number; title: string } | null;   // the ticket this insight was converted from
}

export interface Share { id: string; token: string; created_at: string }
/** A report link: studies, documents and diagrams, and project-wide parts. */
export type ReportSection = "overview" | "insights" | "milestones";
export interface ProjectShare { id: string; token: string; study_ids: string[]; study_titles: string[]; document_ids: string[]; document_titles: string[]; sections: ReportSection[]; created_at: string }

export type ParticipantStudyStatus = "invited" | "completed" | "no_show" | "declined";
export interface ParticipantStudy { participant_id: string; study_id: string; study_title: string; status: ParticipantStudyStatus; note: string }
export interface Participant {
  id: string; project_id: string; name: string; email: string; phone: string; tags: string[]; notes: string;
  consent: boolean; consent_at: string | null; created_at: string; updated_at: string; studies: ParticipantStudy[];
}
