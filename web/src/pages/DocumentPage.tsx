import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Copy, Gauge, Link2, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { copy, timeAgo, uid, useLoad } from "../lib/hooks";
import { t, type Lang } from "../lib/i18n";
import type { Project } from "../lib/types";
import { Button, ErrorNote, Field, Modal, Spinner, cx } from "../components/ui";
import { ExportMenu } from "../components/ExportMenu";
import { DocumentView } from "../docs/DocumentView";
import { docTemplate } from "../docs/templates";
import type { DocData, DocRecord, Entry } from "../docs/types";

export function DocumentPage() {
  const { id } = useParams();
  const { data, error, loading, setData } = useLoad(() => api.get<{ document: DocRecord; project: Project }>(`/documents/${id}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="p-10"><ErrorNote>{error}</ErrorNote></div>;
  return <Editor key={data.document.id} doc={data.document} project={data.project} onDoc={(d) => setData({ ...data, document: d })} />;
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
  const first = useRef(true);
  const readOnly = project.role === "viewer";

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
    <div className="min-h-full bg-paper-2">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-(--page-gutter) backdrop-blur print:hidden">
        <Link to={`/projects/${project.id}?tab=docs`} className="focus-ring flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-3 hover:text-ink">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} /><span className="hidden max-w-40 truncate sm:inline">{project.name}</span>
        </Link>
        <span className="text-line-2">/</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("Título del documento")} className="focus-ring min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 font-semibold hover:bg-paper" />
        <span className="hidden text-xs text-ink-3 md:block">
          {saving === "saving" ? t("Guardando…") : saving === "saved" ? <span className="flex items-center gap-1"><Check size={12} />{t("Guardado")}</span> : saving === "error" ? <span className="text-bad">{t("Error al guardar")}</span> : t("Editado {a}", { a: timeAgo(doc.updated_at) })}
        </span>
        <div className="flex rounded-lg bg-ink/5 p-0.5 text-xs font-semibold" title={t("Idioma del documento")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLangDoc(l)} className={cx("rounded-md px-2 py-1 uppercase", lang === l ? "bg-surface shadow-sm" : "text-ink-3")}>{l}</button>
          ))}
        </div>
        {doc.kind === "usability_script" && <Button size="sm" variant="ghost" icon={<Gauge size={15} />} onClick={resultsFromScript}>{t("Crear matriz de resultados")}</Button>}
        <Button size="sm" variant="ghost" icon={<Save size={15} />} onClick={() => setSaveAsOpen(true)}>{t("Guardar como…")}</Button>
        <ExportMenu tpl={tpl} title={title} data={content} lang={lang} projectName={project.name} />
        <Button size="sm" icon={<Link2 size={15} />} onClick={() => setShareOpen(true)}>{t("Compartir")}</Button>
      </header>

      <main className="page print:p-0">
        <div className="mb-4 flex justify-end print:hidden">
          <button onClick={() => setGuide(!guide)} className="text-xs font-medium text-accent">{guide ? t("Ocultar instrucciones") : t("Mostrar instrucciones")}</button>
        </div>
        <DocumentView readOnly={readOnly} tpl={tpl} title={title} data={content} lang={lang} onChange={setContent} showGuide={guide} />
        <div className="mt-10 flex justify-between border-t border-line pt-4 print:hidden">
          <Button variant="ghost" icon={<Copy size={14} />} onClick={async () => { const { document } = await api.post<{ document: DocRecord }>(`/documents/${doc.id}/duplicate`); nav(`/docs/${document.id}`); }}>{t("Duplicar")}</Button>
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={14} />} onClick={async () => {
            if (!confirm(t("¿Eliminar este documento?"))) return;
            await api.del(`/documents/${doc.id}`); nav(`/projects/${project.id}?tab=docs`);
          }}>{t("Eliminar documento")}</Button>
        </div>
      </main>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} doc={doc} onDoc={onDoc} />
      <SaveAsModal open={saveAsOpen} onClose={() => setSaveAsOpen(false)} docId={doc.id} title={title} projectId={project.id} onSaved={(id) => { setSaveAsOpen(false); nav(`/docs/${id}`); }} />
    </div>
  );
}

function ShareModal({ open, onClose, doc, onDoc }: { open: boolean; onClose: () => void; doc: DocRecord; onDoc: (d: DocRecord) => void }) {
  const [done, setDone] = useState(false);
  const url = doc.share_token ? `${window.location.origin}/d/${doc.share_token}` : "";
  return (
    <Modal open={open} onClose={onClose} title={t("Compartir documento")}>
      <p className="text-sm text-ink-2">{t("Cualquier persona con el link podrá ver el documento en modo lectura, sin cuenta. Puedes revocarlo cuando quieras.")}</p>
      {doc.share_token ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input readOnly className="field font-mono text-[13px]" value={url} onFocus={(e) => e.target.select()} />
            <Button variant="primary" icon={done ? <Check size={15} /> : <Copy size={15} />} onClick={async () => { if (await copy(url)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>{done ? t("Copiado") : t("Copiar")}</Button>
          </div>
          <button className="text-sm font-medium text-bad" onClick={async () => { await api.del(`/documents/${doc.id}/share`); onDoc({ ...doc, share_token: null }); }}>{t("Revocar link")}</button>
        </div>
      ) : (
        <Button variant="primary" className="mt-4" icon={<Link2 size={15} />} onClick={async () => { const { token } = await api.post<{ token: string }>(`/documents/${doc.id}/share`); onDoc({ ...doc, share_token: token }); }}>{t("Crear link de lectura")}</Button>
      )}
    </Modal>
  );
}

/** "Guardar como…": guarda una copia con otro nombre en este u otro proyecto */
function SaveAsModal({ open, onClose, docId, title, projectId, onSaved }: { open: boolean; onClose: () => void; docId: string; title: string; projectId: string; onSaved: (id: string) => void }) {
  const projects = useLoad(() => (open ? api.get<{ projects: Project[] }>("/projects") : Promise.resolve({ projects: [] as Project[] })), [open]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(projectId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(`${title} (${t("copia")})`); setTarget(projectId); setErr(null); } }, [open, title, projectId]);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const { document } = await api.post<{ document: DocRecord }>(`/documents/${docId}/duplicate`, { project_id: target, title: name.trim() || title });
      onSaved(document.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Guardar como…")}>
      <p className="text-sm text-ink-2">{t("Guarda una copia de este documento, con todo lo que llenaste, en este u otro proyecto. El original no cambia.")}</p>
      <div className="mt-4 space-y-4">
        <Field label={t("Nombre del documento")}><input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <Field label={t("Proyecto")}>
          <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            {(projects.data?.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === projectId ? ` · ${t("actual")}` : ""}</option>)}
          </select>
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
          <Button variant="primary" icon={<Save size={15} />} disabled={busy || !target} onClick={save}>{t("Guardar copia")}</Button>
        </div>
      </div>
    </Modal>
  );
}
