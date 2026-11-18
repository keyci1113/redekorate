import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { StudyStatus } from "../lib/types";
import type { LiveStudy } from "../components/home/types";
import { StudiesList } from "../components/home/LiveStudies";
import { STUDY_FILTERS, type StudyFilter } from "../lib/home";

/** Every study across projects, in any status (Todos by default; Home's "Ver los N estudios activos" opens it on Activos). */
export function LiveStudiesPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<{ studies: (LiveStudy & { status: StudyStatus })[] }>("/dashboard/studies"), []);
  const [params, setParams] = useSearchParams();
  const q = params.get("status") as StudyFilter | null;
  const filter: StudyFilter = q && STUDY_FILTERS.includes(q) ? q : "all";
  const onFilter = (f: StudyFilter) => setParams(f === "all" ? {} : { status: f }, { replace: true });
  return (
    <div className="page space-y-6">
      <div>
        <Link to="/" className="focus-ring rounded text-sm text-ink-2 hover:text-ink">{t("← Inicio")}</Link>
        <h1 className="page-title mt-2">{t("Estudios")}</h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] text-ink-2">{t("Un estudio es una prueba o encuesta que envías a participantes: pruebas de prototipo, encuestas, card sorting…")}</p>
      </div>
      <StudiesList studies={data?.studies ?? []} filter={filter} onFilter={onFilter} load={{ loading: loading && !data, error: data ? null : error, reload }} />
    </div>
  );
}
