import { lazy, Suspense, useEffect, useRef, useState } from "react";
// The canvas (React Flow) is only downloaded when a diagram or sitemap is opened.
const DiagramPage = lazy(() => import("../architecture/DiagramPage").then((m) => ({ default: m.DiagramPage })));
import { useNavigate, useParams } from "react-router-dom";
import { Check, Copy, Gauge, Link2, MessageSquare, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { copy, timeAgo, uid, useLoad } from "../lib/hooks";
import { useNamedTitle } from "../lib/pageTitle";
import { t, type Lang } from "../lib/i18n";
import type { Project } from "../lib/types";
import { BackLink, Button, ErrorNote, Field, Modal, Spinner, cx } from "../components/ui";
import { ExportMenu } from "../components/ExportMenu";
import { DocumentView } from "../docs/DocumentView";
import { docTemplate } from "../docs/templates";
import type { DocData, DocRecord, Entry } from "../docs/types";
import { canEdit } from "../lib/roles";
import { CommentsPanel } from "../components/CommentsPanel";
import { SaveAsModal, ShareModal, isTeam } from "../docs/DocModals";
import { isDiagramKind } from "../architecture/model";
import { AccessNotice } from "../components/AccessNotice";

export function DocumentPage() {
  const { id } = useParams();
  const { data, error, loading, setData } = useLoad(() => api.get<{ document: DocRecord; project: Project }>(`/documents/${id}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="p-10"><ErrorNote>{error}</ErrorNote></div>;
  const onDoc = (d: DocRecord) => setData({ ...data, document: d });
  // Diagrams and sitemaps (the Architecture section) are documents too, drawn on a canvas instead of in template sections.
  if (isDiagramKind(data.document.kind)) return <Suspense fallback={<Spinner />}><DiagramPage key={data.document.id} doc={data.document} project={data.project} onDoc={onDoc} /></Suspense>;
  return <Editor key={data.document.id} doc={data.document} project={data.project} onDoc={onDoc} />;
}

function Editor({ doc, project, onDoc }: { doc: DocRecord; project: Project; onDoc: (d: DocRecord) => void }) {
  const nav = useNavigate();
  const tpl = docTemplate(doc.kind);
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState<DocData>(doc.data);
  const [lang, setLangDoc] = useState<Lang>(doc.language);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareOpen, setShareOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [guide, setGuide] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const first = useRef(true);
  const readOnly = !canEdit(project.role);
  // Sharing, copying and deleting stay with the project team; someone the document was shared with only works on it.
  useNamedTitle(title);
  const team = isTeam(project);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (readOnly) return;
    setSaving("saving");
    const timer = setTimeout(async () => {
      try { const { document } = await api.patch<{ document: DocRecord }>(`/documents/${doc.id}`, { title: title.trim() || t("Documento sin título"), data: content, language: lang }); onDoc(document); setSaving("saved"); }
      catch { setSaving("error"); }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, lang]);

  if (!tpl) return <div className="p-10"><ErrorNote>{t("Tipo de documento desconocido")}</ErrorNote></div>;

  async function resultsFromScript() {
    const tasks = ((content.tasks as Entry[]) ?? []).filter((e) => e.name.trim());
    const res = docTemplate("usability_results")!;
    const base = res.init!(lang) as { matrix: { tasks: unknown[]; users: unknown[]; results: object } };
    base.matrix.tasks = tasks.map((e) => ({ id: uid(), name: e.name, success: e.body }));
    const meta = content.meta as Record<string, string> | undefined;
    const { document } = await api.post<{ document: DocRecord }>("/documents", {
      project_id: doc.project_id, kind: "usability_results", language: lang,
      title: t("Resultados · {a}", { a: title }), data: { ...base, meta: { project: meta?.product ?? "", dates: meta?.date ?? "", moderator: meta?.moderator ?? "" } },
    });
    nav(`/docs/${document.id}`);
  }

  return (
    <div className="rk-page-in min-h-full bg-paper-2">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-(--page-gutter) backdrop-blur print:hidden">
        <BackLink compact to={team ? `/projects/${project.id}?tab=docs` : "/projects"} color={project.color} label={project.name} section={t("Documentos")} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={readOnly} aria-label={t("Título del documento")} title={title}
          className="focus-ring min-w-[7rem] flex-1 truncate rounded-md bg-transparent px-1.5 py-1 font-semibold hover:bg-paper" />
        {/* Like the study editor (QA-01): the title truncates, the status never wraps and only shows from xl, and below xl the
            secondary buttons keep just their icon, so at ~1040px the bar fits without clipping Share or scrolling sideways. */}
        <span className="hidden shrink-0 text-xs whitespace-nowrap text-ink-3 xl:block">
          {saving === "saving" ? t("Guardando…") : saving === "saved" ? <span className="flex items-center gap-1"><Check size={12} />{t("Guardado")}</span> : saving === "error" ? <span className="text-bad">{t("Error al guardar")}</span> : t("Editado {a}", { a: timeAgo(doc.updated_at) })}
        </span>
        <div className={cx("flex shrink-0 rounded-lg bg-ink/5 p-0.5 text-xs font-semibold", readOnly && "hidden")} title={t("Idioma del documento")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLangDoc(l)} className={cx("rounded-md px-2 py-1 uppercase", lang === l ? "bg-surface shadow-sm" : "text-ink-3")}>{l}</button>
          ))}
        </div>
        {doc.kind === "usability_script" && team && <Button size="sm" variant="ghost" icon={<Gauge size={15} />} onClick={resultsFromScript} className="shrink-0 max-sm:hidden" aria-label={t("Crear matriz de resultados")} title={t("Crear matriz de resultados")}><span className="hidden xl:inline">{t("Crear matriz de resultados")}</span></Button>}
        {team && <Button size="sm" variant="ghost" icon={<Save size={15} />} onClick={() => setSaveAsOpen(true)} className="shrink-0 max-sm:hidden" aria-label={t("Guardar como…")} title={t("Guardar como…")}><span className="hidden xl:inline">{t("Guardar como…")}</span></Button>}
        <span className="shrink-0"><ExportMenu tpl={tpl} title={title} data={content} lang={lang} projectName={project.name} /></span>
        <Button size="sm" variant="ghost" className="shrink-0" icon={<MessageSquare size={15} />} onClick={() => setCommentsOpen(true)} aria-label={t("Comentarios")} title={t("Comentarios")}><span className="hidden xl:inline">{t("Comentarios")}</span></Button>
        {team && <Button size="sm" className="shrink-0" icon={<Link2 size={15} />} onClick={() => setShareOpen(true)} aria-label={t("Compartir")}><span className="max-sm:hidden">{t("Compartir")}</span></Button>}
      </header>

      <main className="page print:p-0">
        <div className="mb-4 flex justify-end print:hidden">
          <button onClick={() => setGuide(!guide)} className="text-xs font-medium text-accent">{guide ? t("Ocultar instrucciones") : t("Mostrar instrucciones")}</button>
        </div>
        {readOnly && <AccessNotice role={project.role} className="mb-4 print:hidden" />}
        <DocumentView readOnly={readOnly} tpl={tpl} title={title} data={content} lang={lang} onChange={setContent} showGuide={guide} />
        {team && <div className="mt-10 flex justify-between border-t border-line pt-4 print:hidden">
          <Button variant="ghost" icon={<Copy size={14} />} onClick={async () => { const { document } = await api.post<{ document: DocRecord }>(`/documents/${doc.id}/duplicate`); nav(`/docs/${document.id}`); }}>{t("Duplicar")}</Button>
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={14} />} onClick={async () => {
            if (!confirm(t("¿Eliminar este documento?"))) return;
            await api.del(`/documents/${doc.id}`); nav(`/projects/${project.id}?tab=docs`);
          }}>{t("Eliminar documento")}</Button>
        </div>}
      </main>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} doc={doc} onDoc={onDoc} />
      <Modal open={commentsOpen} onClose={() => setCommentsOpen(false)} title={t("Comentarios")} wide>
        <CommentsPanel projectId={project.id} documentId={doc.id} role={project.role} />
      </Modal>
      <SaveAsModal open={saveAsOpen} onClose={() => setSaveAsOpen(false)} docId={doc.id} title={title} projectId={project.id} onSaved={(id) => { setSaveAsOpen(false); nav(`/docs/${id}`); }} />
    </div>
  );
}
