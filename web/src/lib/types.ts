import type { Block } from "../blocks/types";

export type Role = "admin" | "member";
export interface User { id: string; email: string; name: string; role: Role; avatar: string | null }
export interface AdminUser extends User { created_at: string; last_login_at: string | null; disabled_at: string | null; project_count: number }
export interface Invite { id: string; email: string; role: Role; created_at: string; expires_at: string; invited_by: string | null }
/** Cuenta externa (Google/Microsoft) vinculada a un usuario. */
export interface Identity { provider: "google" | "microsoft"; email: string | null; created_at: string; last_login_at: string | null }

export type ProjectRole = "owner" | "editor" | "viewer";
export interface ProjectMember { user_id: string; name: string; email: string; avatar: string | null; role: ProjectRole; created_at: string }

export interface Project {
  id: string; name: string; description: string; color: string; archived: boolean;
  role?: ProjectRole; owner_name?: string;   // rol de quien consulta; owner_name para proyectos compartidos
  created_at: string; updated_at: string;
  study_count?: number; live_count?: number; response_count?: number; insight_count?: number;
  started_count?: number; document_count?: number; participant_count?: number; share_count?: number;
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
}

export interface Share { id: string; token: string; created_at: string }
export interface ProjectShare { id: string; token: string; study_ids: string[]; study_titles: string[]; created_at: string }

export type ParticipantStudyStatus = "invited" | "completed" | "no_show" | "declined";
export interface ParticipantStudy { participant_id: string; study_id: string; study_title: string; status: ParticipantStudyStatus; note: string }
export interface Participant {
  id: string; project_id: string; name: string; email: string; phone: string; tags: string[]; notes: string;
  consent: boolean; consent_at: string | null; created_at: string; updated_at: string; studies: ParticipantStudy[];
}
