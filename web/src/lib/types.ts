import type { Block } from "../blocks/types";

export interface User { id: string; email: string; name: string }

export interface Project {
  id: string; name: string; description: string; color: string; archived: boolean;
  created_at: string; updated_at: string;
  study_count?: number; live_count?: number; response_count?: number; insight_count?: number;
}

export type StudyStatus = "draft" | "live" | "closed";

export interface Study {
  id: string; project_id: string; title: string; method: string; status: StudyStatus;
  blocks: Block[]; settings: Record<string, unknown>; public_slug: string;
  published_at: string | null; created_at: string; updated_at: string;
  block_count?: number; response_count?: number;
}

export interface Session { id: string; participant?: Record<string, unknown>; device?: string | null; started_at: string; completed_at: string | null }
export interface Answer { session_id: string; block_id: string; value: unknown; duration_ms: number | null }

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";

export interface Insight {
  id: string; project_id?: string; study_id?: string | null; study_title?: string | null;
  title: string; body: string; tags: string[]; severity: Severity; confidence: Confidence;
  created_at: string;
}

export interface Share { id: string; token: string; created_at: string }
export interface ProjectShare { id: string; token: string; study_ids: string[]; study_titles: string[]; created_at: string }

export type ParticipantStudyStatus = "invited" | "completed" | "no_show" | "declined";
export interface ParticipantStudy { participant_id: string; study_id: string; study_title: string; status: ParticipantStudyStatus; note: string }
export interface Participant {
  id: string; project_id: string; name: string; email: string; phone: string; tags: string[]; notes: string;
  consent: boolean; consent_at: string | null; created_at: string; updated_at: string; studies: ParticipantStudy[];
}
