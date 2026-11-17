import { lazy, Suspense } from "react";
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
import { isDiagramKind, normalizeDiagram } from "../architecture/model";
// The canvas (React Flow) is only downloaded when the shared document is a diagram or sitemap.
const DiagramCanvas = lazy(() => import("../architecture/DiagramCanvas").then((m) => ({ default: m.DiagramCanvas })));
const SitemapEditor = lazy(() => import("../architecture/DiagramPage").then((m) => ({ default: m.SitemapEditor })));

interface PublicDoc { title: string; kind: string; language: Lang; data: DocData; project_name: string; project_color: string; updated_at: string }

export function PublicDocPage() {
  const { token } = useParams();
  const { data, error, loading } = useLoad(() => api.get<{ document: PublicDoc }>(`/public/docs/${token}`), [token]);
  if (loading) return <Spinner />;
  const doc = data?.document;
  const tpl = doc && docTemplate(doc.kind);
  if (doc && !error && isDiagramKind(doc.kind)) return <PublicDiagram doc={doc} />;
  if (error || !doc || !tpl) return <div className="mx-auto max-w-lg p-10"><ErrorNote>{t("Este documento no existe o el link fue revocado.")}</ErrorNote></div>;
  return (
    <div className="min-h-full bg-paper-2">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="flex items-center justify-between px-(--page-gutter) py-3">
          <Logo />
          <span className="flex items-center gap-3 text-sm text-ink-2">
            <span className="hidden items-center gap-1.5 sm:flex"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: doc.project_color }} />{doc.project_name}</span>
            <ExportMenu tpl={tpl} title={doc.title} data={doc.data} lang={doc.language} projectName={doc.project_name} />
          </span>
        </div>
      </header>
      <main className="page print:p-0">
        <DocumentView tpl={tpl} title={doc.title} data={doc.data} lang={doc.language} readOnly showGuide={false} />
        <p className="mt-12 text-center text-xs text-ink-3 print:hidden">{t("Documento compartido con redekorate · solo lectura")}</p>
      </main>
    </div>
  );
}

/** A shared diagram or sitemap: the canvas fills the page, read-only, and can still be exported. */
function PublicDiagram({ doc }: { doc: PublicDoc }) {
  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-(--page-gutter) py-3">
        <Logo />
        <span className="min-w-0 truncate font-semibold">{doc.title}</span>
        <span className="hidden items-center gap-1.5 text-sm text-ink-2 sm:flex"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: doc.project_color }} />{doc.project_name}</span>
      </header>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<Spinner />}>
        {doc.kind === "sitemap"
          ? <SitemapEditor outline={String(doc.data.outline ?? "")} lang={doc.language} title={doc.title} readOnly />
          : <DiagramCanvas data={normalizeDiagram(doc.data)} readOnly title={doc.title} />}
        </Suspense>
      </div>
    </div>
  );
}
