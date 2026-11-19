import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, FlaskConical, Link2, MessageSquare, Save, Shapes, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useNamedTitle } from "../lib/pageTitle";
import { timeAgo } from "../lib/hooks";
import { t } from "../lib/i18n";
import type { Project } from "../lib/types";
import { canEdit } from "../lib/roles";
import { BackLink, Button, Modal } from "../components/ui";
import { CommentsPanel } from "../components/CommentsPanel";
import { SaveAsModal, ShareModal, isTeam } from "../docs/DocModals";
import type { DocData, DocRecord } from "../docs/types";
import { DiagramCanvas, type CanvasHandle } from "./DiagramCanvas";
import { BoardTestModal } from "./BoardTestModal";
import { layoutSitemap, normalizeDiagram, outlineStats, parseOutline, sitemapToDiagram, type DiagramData } from "./model";
import { AccessNotice } from "../components/AccessNotice";

/** A diagram or sitemap document: the same header as other documents, with the canvas filling the rest of the screen. */
export function DiagramPage({ doc, project, onDoc }: { doc: DocRecord; project: Project; onDoc: (d: DocRecord) => void }) {
  const nav = useNavigate();
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState<DocData>(doc.data);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [shareOpen, setShareOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const canvas = useRef<CanvasHandle>(null);
  const board = doc.kind === "moodboard";
  const first = useRef(true);
  const readOnly = !canEdit(project.role);
  // Sharing, copying and deleting stay with the project team; someone the diagram was shared with only works on it.
  const team = isTeam(project);
  useNamedTitle(title);
  const back = team ? `/projects/${project.id}?tab=architecture` : "/projects";

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (readOnly) return;
    setSaving("saving");
    const timer = setTimeout(async () => {
      try { const { document } = await api.patch<{ document: DocRecord }>(`/documents/${doc.id}`, { title: title.trim() || (board ? t("Tablero sin título") : t("Diagrama sin título")), data: content }); onDoc(document); setSaving("saved"); }
      catch { setSaving("error"); }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  async function openAsDiagram() {
    const { document } = await api.post<{ document: DocRecord }>("/documents", {
      project_id: doc.project_id, kind: "diagram", language: doc.language, title: t("{a} (diagrama)", { a: title }),
      data: sitemapToDiagram(String(content.outline ?? ""), doc.language),
    });
    nav(`/docs/${document.id}`);
  }

  return (
    <div className="rk-page-in flex h-dvh flex-col bg-paper">
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-(--page-gutter)">
        <BackLink compact to={back} color={project.color} label={project.name} section={t("Arquitectura")} />
        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={readOnly} aria-label={board ? t("Título del tablero") : t("Título del diagrama")} title={title}
          className="focus-ring min-w-[7rem] flex-1 truncate rounded-md bg-transparent px-1.5 py-1 font-semibold hover:bg-paper" />
        {/* Like the study editor (QA-01): the title truncates, the status never wraps and only shows from xl, and below xl the
            secondary buttons keep just their icon, so at ~1040px the bar fits without clipping Share or scrolling sideways. */}
        <span className="hidden shrink-0 text-xs whitespace-nowrap text-ink-3 xl:block">
          {saving === "saving" ? t("Guardando…") : saving === "saved" ? <span className="flex items-center gap-1"><Check size={12} />{t("Guardado")}</span> : saving === "error" ? <span className="text-bad">{t("Error al guardar")}</span> : t("Editado {a}", { a: timeAgo(doc.updated_at) })}
        </span>
        {board && team && !readOnly && <Button size="sm" variant="ghost" className="shrink-0" icon={<FlaskConical size={15} />} onClick={() => setTestOpen(true)} aria-label={t("Probar con participantes")} title={t("Probar con participantes")}><span className="hidden xl:inline">{t("Probar con participantes")}</span></Button>}
        {doc.kind === "sitemap" && team && <Button size="sm" variant="ghost" icon={<Shapes size={15} />} onClick={openAsDiagram} className="shrink-0 max-sm:hidden" aria-label={t("Abrir como diagrama")} title={t("Abrir como diagrama")}><span className="hidden xl:inline">{t("Abrir como diagrama")}</span></Button>}
        {team && <Button size="sm" variant="ghost" icon={<Save size={15} />} onClick={() => setSaveAsOpen(true)} className="shrink-0 max-sm:hidden" aria-label={t("Guardar como…")} title={t("Guardar como…")}><span className="hidden xl:inline">{t("Guardar como…")}</span></Button>}
        <Button size="sm" variant="ghost" className="shrink-0" icon={<MessageSquare size={15} />} onClick={() => setCommentsOpen(true)} aria-label={t("Comentarios")} title={t("Comentarios")}><span className="hidden xl:inline">{t("Comentarios")}</span></Button>
        {team && <Button size="sm" className="shrink-0" icon={<Link2 size={15} />} onClick={() => setShareOpen(true)} aria-label={t("Compartir")}><span className="max-sm:hidden">{t("Compartir")}</span></Button>}
        {team && <>
          <button type="button" title={t("Duplicar")} aria-label={t("Duplicar")} className="focus-ring hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink sm:flex"
            onClick={async () => { const { document } = await api.post<{ document: DocRecord }>(`/documents/${doc.id}/duplicate`); nav(`/docs/${document.id}`); }}><Copy size={15} /></button>
          <button type="button" title={t("Eliminar")} aria-label={t("Eliminar")} className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-bad-soft hover:text-bad"
            onClick={async () => { if (!confirm(board ? t("¿Eliminar este tablero?") : t("¿Eliminar este diagrama?"))) return; await api.del(`/documents/${doc.id}`); nav(back); }}><Trash2 size={15} /></button>
        </>}
      </header>

      {readOnly && <AccessNotice role={project.role} className="mx-3 mt-2 shrink-0" />}
      <div className="min-h-0 flex-1">
        {doc.kind === "sitemap"
          ? <SitemapEditor outline={String(content.outline ?? "")} lang={doc.language} title={title} readOnly={readOnly} onChange={(outline) => setContent({ ...content, outline })} />
          : <DiagramCanvas data={normalizeDiagram(doc.data)} title={title} readOnly={readOnly} board={board} handle={canvas} onChange={(d) => setContent(d as unknown as DocData)} />}
      </div>

      {board && <BoardTestModal open={testOpen} onClose={() => setTestOpen(false)} board={normalizeDiagram(content)} canvas={canvas}
        projectId={project.id} title={title} lang={doc.language} />}
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} doc={doc} onDoc={onDoc} />
      <Modal open={commentsOpen} onClose={() => setCommentsOpen(false)} title={t("Comentarios")} wide>
        <CommentsPanel projectId={project.id} documentId={doc.id} role={project.role} />
      </Modal>
      <SaveAsModal open={saveAsOpen} onClose={() => setSaveAsOpen(false)} docId={doc.id} title={title} projectId={project.id} onSaved={(id) => { setSaveAsOpen(false); nav(`/docs/${id}`); }} />
    </div>
  );
}

/** A sitemap: write the pages as an indented outline on the left, see the tree drawn on the right. */
export function SitemapEditor({ outline, lang, title, readOnly, onChange }: { outline: string; lang: DocRecord["language"]; title: string; readOnly: boolean; onChange?: (o: string) => void }) {
  const roots = useMemo(() => parseOutline(outline), [outline]);
  const diagram: DiagramData = useMemo(() => layoutSitemap(roots, lang), [roots, lang]);
  const stats = outlineStats(roots);
  // Refit only when the shape of the tree changes, not on every letter typed into a page name.
  const fitKey = useMemo(() => outline.split("\n").map((l) => (l.trim() ? l.length - l.trimStart().length : "")).join(","), [outline]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget, v = el.value, s = el.selectionStart, end = el.selectionEnd;
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // A new line starts at the same level as the one it comes from, like any outliner.
      e.preventDefault();
      const indent = /^ */.exec(v.slice(v.lastIndexOf("\n", s - 1) + 1))![0];
      onChange?.(`${v.slice(0, s)}\n${indent}${v.slice(end)}`);
      caret.current = [s + 1 + indent.length, s + 1 + indent.length];
      return;
    }
    if (e.key !== "Tab") return;
    // Tab and Shift+Tab move the current lines one level in or out, instead of leaving the field.
    e.preventDefault();
    const from = v.lastIndexOf("\n", s - 1) + 1, toNl = v.indexOf("\n", end), to = toNl === -1 ? v.length : toNl;
    const lines = v.slice(from, to).split("\n");
    const next = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,2}/, "") : `  ${l}`));
    const block = next.join("\n");
    onChange?.(v.slice(0, from) + block + v.slice(to));
    const firstShift = next[0].length - lines[0].length;
    caret.current = [Math.max(from, s + firstShift), end + (block.length - (to - from))];
  };
  // Put the caret back right after the new text renders, before the next key is handled (a frame later is too late for fast typing).
  const box = useRef<HTMLTextAreaElement>(null), caret = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    if (caret.current && box.current) { box.current.setSelectionRange(caret.current[0], caret.current[1]); caret.current = null; }
  }, [outline]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex max-h-[45%] shrink-0 flex-col border-b border-line bg-surface md:max-h-none md:w-80 md:border-r md:border-b-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">{t("Esquema del sitio")}</p>
          <p className="mt-0.5 text-xs leading-snug text-ink-3">{t("Una página por línea. Usa Tab (o dos espacios) para poner una página dentro de la de arriba, y Shift+Tab para sacarla. Enter sigue en el mismo nivel.")}</p>
        </div>
        <textarea ref={box} value={outline} readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)} onKeyDown={readOnly ? undefined : onKeyDown} spellCheck={false}
          aria-label={t("Esquema del sitio")} placeholder={t("Inicio\n  Productos\n    Detalle\n  Contacto")}
          className="min-h-40 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 outline-none placeholder:text-ink-3" />
        <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{t("{a} páginas · {b} niveles", { a: stats.pages, b: stats.depth })}</p>
      </aside>
      <div className="min-h-0 flex-1">
        <DiagramCanvas data={diagram} readOnly title={title} fitKey={fitKey} />
      </div>
    </div>
  );
}
