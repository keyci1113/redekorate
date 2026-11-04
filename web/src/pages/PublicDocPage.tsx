import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import { ErrorNote, Spinner } from "../components/ui";
import { ExportMenu } from "../components/ExportMenu";
import { Logo } from "../components/Logo";
import { DocumentView } from "../docs/DocumentView";
import { docTemplate } from "../docs/templates";
import type { DocData } from "../docs/types";
import type { Lang } from "../lib/i18n";

interface PublicDoc { title: string; kind: string; language: Lang; data: DocData; project_name: string; project_color: string; updated_at: string }

export function PublicDocPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<{ document: PublicDoc }>(`/public/docs/${token}`), [token]);
  if (loading) return <Spinner />;
  const doc = data?.document;
  const tpl = doc && docTemplate(doc.kind);
  if (error || !doc || !tpl) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este documento no existe o el link fue revocado.")}</ErrorNote></div>;
  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <span className="flex items-center gap-3 text-sm text-ink-2">
            <span className="hidden items-center gap-1.5 sm:flex"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: doc.project_color }} />{doc.project_name}</span>
            <ExportMenu tpl={tpl} title={doc.title} data={doc.data} lang={doc.language} projectName={doc.project_name} />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 print:p-0">
        <DocumentView tpl={tpl} title={doc.title} data={doc.data} lang={doc.language} readOnly showGuide={false} />
        <p className="mt-12 text-center text-xs text-ink-3 print:hidden">{t("Documento compartido con redekorate · solo lectura")}</p>
      </main>
    </div>
  );
}
