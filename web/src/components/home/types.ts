import type { Severity } from "../../lib/types";
import type { ActivityRow, Day } from "../../lib/home";

export interface LiveStudy {
  id: string; project_id: string; title: string; method: string; project_name: string; project_color: string;
  responses: number; started: number; last_response_at: string | null;
}
export interface Draft { id: string; title: string; method: string; updated_at: string; project_name: string; project_color: string }
export interface RecentOpen { id: string; title: string; method: string; status: string; project_id: string; project_name: string; project_color: string; opened_at: string; where: "edit" | "results" }
export interface HomeInsight {
  id: string; title: string; severity: Severity; created_at: string; reviewed_at: string | null;
  project_id: string; study_id: string | null; project_name: string; method: string | null;
}
export interface Dash {
  totals: { projects: number; studies: number; live: number; projects_live: number; responses: number; responses_week: number; insights: number; published: number; shares: number };
  recent?: RecentOpen | null;   // último estudio abierto por esta persona
  trend: Day[];
  study_trend: { study_id: string; day: string; n: number }[];
  live: LiveStudy[];
  drafts: Draft[];
  activity: ActivityRow[];
  insights: HomeInsight[];
  insight_counts: { total: number; critical: number; high: number; critical_pending: number; pending: number };
}

/** Lo que cada sección recibe: datos, o el estado de la carga. */
export interface Load { loading: boolean; error: string | null; reload: () => void }
