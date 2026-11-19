// Which files the Documents tab of a project accepts, decided by the extension and confirmed by the content.
// Pure: no disk, no database.

export interface FileKind { ext: string; mime: string; inline: boolean }

const OOXML = (mime: string): Omit<FileKind, "ext"> => ({ mime, inline: false });
const KINDS: Record<string, Omit<FileKind, "ext">> = {
  pdf: { mime: "application/pdf", inline: true },
  md: { mime: "text/markdown; charset=utf-8", inline: true },
  markdown: { mime: "text/markdown; charset=utf-8", inline: true },
  txt: { mime: "text/plain; charset=utf-8", inline: true },
  csv: { mime: "text/csv; charset=utf-8", inline: false },
  docx: OOXML("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  xlsx: OOXML("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  pptx: OOXML("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
  doc: { mime: "application/msword", inline: false },
};
export const FILE_EXTENSIONS = Object.keys(KINDS);

const TEXT = new Set(["md", "markdown", "txt", "csv"]);
const ZIP = new Set(["docx", "xlsx", "pptx"]);
const startsWith = (buf: Buffer, bytes: number[]) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
function isText(buf: Buffer) {
  if (buf.includes(0)) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(buf); return true; } catch { return false; }
}

/** The kind of an accepted file, or null when the extension is not allowed or the content does not match it. */
export function fileKind(name: string, buf: Buffer): FileKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const kind = KINDS[ext];
  if (!kind || buf.length === 0) return null;
  const ok = ext === "pdf" ? startsWith(buf, [0x25, 0x50, 0x44, 0x46])                     // %PDF
    : ZIP.has(ext) ? startsWith(buf, [0x50, 0x4b, 0x03, 0x04])                             // zip container
    : ext === "doc" ? startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])    // legacy Office
    : TEXT.has(ext) ? isText(buf) : false;
  return ok ? { ext, ...kind } : null;
}

/** A display name that is safe to store and to put in a download header: no paths, no control characters, at most 160 characters. */
export function cleanName(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const safe = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (safe.length <= 160) return safe;
  const ext = /\.[a-z0-9]+$/i.exec(safe)?.[0] ?? "";
  return safe.slice(0, 160 - ext.length).trimEnd() + ext;
}

/** `Content-Disposition` for a download or an in-browser view, with the name encoded for any language. */
export const disposition = (name: string, inline: boolean) =>
  `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
