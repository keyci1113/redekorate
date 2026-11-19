import { Link } from "react-router-dom";
import { FileText, FolderTree, Palette, Shapes } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";

interface SharedDoc {
  id: string; kind: string; title: string; updated_at: string; role: "viewer" | "commenter" | "editor";
  project_name: string; project_color: string; shared_by: string | null;
}
const ROLE: Record<SharedDoc["role"], string> = { viewer: "Puede ver", commenter: "Puede comentar", editor: "Puede editar" };

/** Documents other people shared with me by email. Shows nothing until there is one. */
export function SharedWithMe() {
  const { data } = useLoad(() => api.get<{ documents: SharedDoc[] }>("/documents/shared"), []);
  const docs = data?.documents ?? [];
  if (!docs.length) return null;
  return (
    <section className="mt-10" aria-labelledby="shared-with-me">
      <h2 id="shared-with-me" className="text-[20px] font-bold">{t("Compartidos conmigo")}</h2>
      <p className="mt-1 text-sm text-ink-2">{t("Documentos que otras personas compartieron contigo. Solo ves ese documento, no el resto de su proyecto.")}</p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {docs.map((d) => {
          const Icon = d.kind === "sitemap" ? FolderTree : d.kind === "diagram" ? Shapes : d.kind === "moodboard" ? Palette : FileText;
          return (
            <li key={d.id}>
              <Link to={`/docs/${d.id}`} className="focus-ring flex h-full items-start gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-line-2 hover:bg-ink/5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden><Icon size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-ink-2">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.project_color }} aria-hidden />
                    <span className="truncate">{d.project_name}{d.shared_by ? ` · ${t("Compartido por {a}", { a: d.shared_by })}` : ""}</span>
                  </span>
                  <span className="mt-1 block text-[12px] text-ink-3">{t(ROLE[d.role])} · {t("Editado {a}", { a: timeAgo(d.updated_at) })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
