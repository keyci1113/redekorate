// Pure helpers for the Documents tab of a project (uploaded files).
export interface ProjectFile { id: string; name: string; mime: string; size: number; created_at: string; uploaded_by: string | null; uploaded_by_name: string | null }

export type FileGroup = "pdf" | "word" | "sheet" | "slides" | "text";
const GROUP: Record<string, FileGroup> = { pdf: "pdf", doc: "word", docx: "word", xlsx: "sheet", csv: "sheet", pptx: "slides", md: "text", markdown: "text", txt: "text" };

export const extension = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
export const fileGroup = (name: string): FileGroup => GROUP[extension(name)] ?? "text";
/** PDFs and text open in the browser; the rest only download. */
export const canView = (name: string) => ["pdf", "md", "markdown", "txt"].includes(extension(name));
/** The name without its extension: what a rename edits. */
export const baseName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "");

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a file cannot be sent, before trying: wrong type or too big. Null when it can. */
export function uploadProblem(file: { name: string; size: number }, extensions: readonly string[], maxMb: number): "type" | "size" | "empty" | null {
  if (!extensions.includes(extension(file.name))) return "type";
  if (file.size === 0) return "empty";
  return file.size > maxMb * 1024 * 1024 ? "size" : null;
}

export const matches = (f: ProjectFile, q: string) => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase());
