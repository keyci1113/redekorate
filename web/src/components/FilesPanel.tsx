// The Documents tab of a project: files uploaded as they are (PDF, Word, Markdown…), like a small shared drive.
import { useRef, useState, type DragEvent } from "react";
import { Download, Eye, FileSpreadsheet, FileText, FileType2, Pencil, Presentation, Search, Trash2, Upload } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import { baseName, canView, extension, fileGroup, matches, sizeLabel, uploadProblem, type FileGroup, type ProjectFile } from "../lib/files";
import { Button, Empty, ErrorNote, Spinner, cx } from "./ui";
import { t } from "../lib/i18n";

interface Listing { files: ProjectFile[]; max_mb: number; extensions: string[] }

const ICON: Record<FileGroup, typeof FileText> = { pdf: FileType2, word: FileText, sheet: FileSpreadsheet, slides: Presentation, text: FileText };
const TONE: Record<FileGroup, string> = { pdf: "bg-bad-soft text-bad", word: "bg-accent-soft text-accent-ink", sheet: "bg-good-soft text-good", slides: "bg-warn-soft text-warn", text: "bg-ink/5 text-ink-2" };

export function FilesPanel({ projectId, canEdit, onCount }: { projectId: string; canEdit: boolean; onCount?: (n: number) => void }) {
  const load = useLoad(async () => { const r = await api.get<Listing>(`/projects/${projectId}/files`); onCount?.(r.files.length); return r; }, [projectId]);
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [q, setQ] = useState("");
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  if (load.loading) return <Spinner />;
  if (load.error || !load.data) return <ErrorNote>{load.error}</ErrorNote>;
  const { max_mb, extensions } = load.data;
  const list = files ?? load.data.files;
  const shown = list.filter((f) => matches(f, q));
  const href = (f: ProjectFile, view = false) => `/api/projects/${projectId}/files/${f.id}${view ? "?view=1" : ""}`;
  const use = (next: ProjectFile[]) => { setFiles(next); onCount?.(next.length); };

  async function send(picked: File[]) {
    if (!picked.length || sending) return;
    const errors: string[] = [];
    const ok = picked.filter((f) => {
      const p = uploadProblem(f, extensions, max_mb);
      if (p) errors.push(p === "type" ? t("{a}: ese tipo de archivo no se acepta.", { a: f.name }) : p === "empty" ? t("{a}: el archivo está vacío.", { a: f.name }) : t("{a}: pesa más de {b} MB.", { a: f.name, b: max_mb }));
      return !p;
    });
    setSending({ done: 0, total: ok.length });
    for (const [i, f] of ok.entries()) {
      try { use((await api.uploadProjectFile<Listing>(projectId, f)).files); }
      catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
      setSending({ done: i + 1, total: ok.length });
    }
    setSending(null); setProblems(errors);
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (canEdit) void send([...e.dataTransfer.files]); };
  const rename = async () => {
    if (!renaming) return;
    const { id, value } = renaming; setRenaming(null);
    if (!value.trim()) return;
    try { use((await api.patch<Listing>(`/projects/${projectId}/files/${id}`, { name: value })).files); } catch (e) { setProblems([(e as Error).message]); }
  };
  const remove = async (f: ProjectFile) => {
    if (!confirm(t("¿Eliminar \"{a}\"? No se puede deshacer.", { a: f.name }))) return;
    try { use((await api.del<Listing>(`/projects/${projectId}/files/${f.id}`)).files); } catch (e) { setProblems([(e as Error).message]); }
  };
  const types = t("PDF, Word, Excel, PowerPoint, Markdown, texto o CSV · hasta {a} MB cada uno", { a: max_mb });
  const action = "focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-ink/5 hover:text-ink";

  return (
    <div onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-2">{t("Archivos del proyecto, tal como son: briefs, contratos, presentaciones, notas. Todas las personas del proyecto pueden verlos y descargarlos.")}</p>
        {canEdit && <Button variant="primary" icon={<Upload size={16} />} disabled={!!sending} onClick={() => picker.current?.click()}>{sending ? t("Subiendo {a} de {b}…", { a: Math.min(sending.done + 1, sending.total), b: sending.total }) : t("Subir archivos")}</Button>}
        <input ref={picker} type="file" multiple hidden accept={extensions.map((e) => `.${e}`).join(",")} onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {problems.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          <ul className="space-y-1">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          <button type="button" className="mt-2 text-xs font-medium underline" onClick={() => setProblems([])}>{t("Entendido")}</button>
        </div>
      )}
      {canEdit && (
        <button type="button" onClick={() => picker.current?.click()} disabled={!!sending}
          className={cx("focus-ring mb-5 flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition", over ? "border-accent bg-accent-soft" : "border-line-2 hover:bg-ink/5")}>
          <Upload size={18} aria-hidden className="text-ink-3" />
          <span className="text-sm font-medium">{over ? t("Suelta para subir") : t("Arrastra archivos aquí o haz clic para elegirlos")}</span>
          <span className="text-xs text-ink-3">{types}</span>
        </button>
      )}
      {list.length === 0 ? (
        <Empty icon={<FileText size={20} />} title={t("Aún no hay archivos")} text={canEdit ? t("Sube el brief, un contrato o las notas de una reunión para tenerlos junto al proyecto.") : t("Cuando alguien suba archivos al proyecto, aparecerán aquí.")} />
      ) : (
        <>
          {list.length > 5 && (
            <label className="relative mb-3 block max-w-xs">
              <span className="sr-only">{t("Buscar archivos")}</span>
              <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input className="field pl-9" type="search" placeholder={t("Buscar archivos")} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          {shown.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">{t("Ningún archivo coincide con la búsqueda.")}</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {shown.map((f) => {
                const group = fileGroup(f.name), Icon = ICON[group];
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE[group])}><Icon size={17} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      {renaming?.id === f.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); void rename(); }} className="flex items-center gap-2">
                          <input autoFocus className="field h-9 py-0" aria-label={t("Nombre del archivo")} maxLength={150} value={renaming.value} onChange={(e) => setRenaming({ id: f.id, value: e.target.value })}
                            onBlur={() => void rename()} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }} />
                          <span className="text-sm text-ink-3">.{extension(f.name)}</span>
                        </form>
                      ) : (
                        <a href={href(f, canView(f.name))} target={canView(f.name) ? "_blank" : undefined} rel="noreferrer" className="focus-ring block truncate rounded font-medium hover:text-accent-ink">{f.name}</a>
                      )}
                      <p className="truncate text-xs text-ink-3">{sizeLabel(f.size)} · {f.uploaded_by_name ? t("subido por {a} {b}", { a: f.uploaded_by_name, b: timeAgo(f.created_at) }) : timeAgo(f.created_at)}</p>
                    </div>
                    {canView(f.name) && <a href={href(f, true)} target="_blank" rel="noreferrer" className={action} title={t("Ver")} aria-label={t("Ver {a}", { a: f.name })}><Eye size={16} /></a>}
                    <a href={href(f)} download={f.name} className={action} title={t("Descargar")} aria-label={t("Descargar {a}", { a: f.name })}><Download size={16} /></a>
                    {canEdit && <button type="button" className={action} title={t("Cambiar nombre")} aria-label={t("Cambiar nombre de {a}", { a: f.name })} onClick={() => setRenaming({ id: f.id, value: baseName(f.name) })}><Pencil size={15} /></button>}
                    {canEdit && <button type="button" className={cx(action, "hover:bg-bad-soft hover:text-bad")} title={t("Eliminar")} aria-label={t("Eliminar {a}", { a: f.name })} onClick={() => void remove(f)}><Trash2 size={15} /></button>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
