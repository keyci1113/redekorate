import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Dash } from "../components/home/types";
import { LiveStudiesList } from "../components/home/LiveStudies";

/** Lista completa de estudios activos (destino de "Ver los N estudios activos"). */
export function LiveStudiesPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Dash>("/dashboard"), []);
  return (
    <div className="page space-y-6">
      <div>
        <Link to="/" className="focus-ring rounded text-sm text-ink-2 hover:text-ink">{t("← Inicio")}</Link>
        <h1 className="page-title mt-2">{t("Estudios activos")}</h1>
      </div>
      <LiveStudiesList live={data?.live ?? []} load={{ loading: loading && !data, error: data ? null : error, reload }} />
    </div>
  );
}
