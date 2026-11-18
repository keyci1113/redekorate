// Security scan of every uploaded file, run before its bytes are written to disk.
//
//   1. Built-in checks, always on: the real type (magic bytes) must match the declared one, PDFs may not carry
//      active content, Office files may not carry macros, and text files may not be HTML/SVG pages with scripts.
//   2. Optional antivirus: when CLAMAV_HOST is set, the bytes go to clamd (INSTREAM over TCP) and a match is refused.
//      If clamd is configured but cannot answer, the upload is refused too (fail closed) unless CLAMAV_FAIL_OPEN=true.
//
// No dependencies: node:net talks to clamd and node:zlib opens compressed PDF object streams.
import net from "node:net";
import { inflateSync } from "node:zlib";
import { HttpError } from "./http.js";

/** Why a file was refused. `unavailable` means the antivirus could not answer (a temporary problem). */
export type ScanReason = "mismatch" | "pdf_active" | "macros" | "script" | "malware" | "unavailable";

/** User-facing messages (Spanish keys, translated in lib/i18n.ts). */
export const SCAN_MESSAGES: Record<ScanReason, string> = {
  mismatch: "El contenido del archivo no coincide con su tipo. Sube el archivo original, sin cambiarle la extensión.",
  pdf_active: "Este PDF contiene contenido activo (JavaScript, acciones automáticas o archivos incrustados) y no se puede subir. Guárdalo de nuevo sin ese contenido, por ejemplo con «Imprimir como PDF».",
  macros: "Este documento de Office contiene macros y no se puede subir. Guárdalo sin macros (.docx, .xlsx o .pptx) e inténtalo de nuevo.",
  script: "Este archivo contiene una página HTML o SVG con scripts y no se puede subir.",
  malware: "El análisis antivirus detectó una amenaza en este archivo. No se guardó.",
  unavailable: "No se pudo revisar el archivo en este momento. Inténtalo de nuevo en unos minutos.",
};

/** A refused upload: 422 for something wrong with the file, 503 when the antivirus could not be reached. */
export class FileRejected extends HttpError {
  constructor(public reason: ScanReason, public detail: string) {
    super(reason === "unavailable" ? 503 : 422, SCAN_MESSAGES[reason]);
  }
}

export interface Finding { reason: ScanReason; detail: string }

// ── Real type from the first bytes ─────────────────────────────
export type Magic = "png" | "jpg" | "gif" | "webp" | "pdf" | "zip" | "ole" | "webm" | "mp4" | "exe" | "elf" | "macho" | "text" | "unknown";

const starts = (buf: Buffer, bytes: number[], at = 0) => buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf: Buffer, from: number, to: number) => buf.toString("latin1", from, to);
/**
 * Text in any 8-bit encoding (UTF-8, Latin-1, Windows-1252: older HTML exports often are not UTF-8).
 * Binaries are caught by their magic bytes above or by the null bytes they almost always contain.
 */
function isText(buf: Buffer) {
  return !buf.includes(0);
}

/** What the bytes really are, whatever the file is called. */
export function magicType(buf: Buffer): Magic {
  if (starts(buf, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (starts(buf, [0xff, 0xd8, 0xff])) return "jpg";
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") return "gif";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  if (ascii(buf, 0, 5) === "%PDF-") return "pdf";
  if (starts(buf, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (starts(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  if (starts(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (ascii(buf, 4, 8) === "ftyp") return "mp4";
  if (ascii(buf, 0, 2) === "MZ") return "exe";
  if (starts(buf, [0x7f, 0x45, 0x4c, 0x46])) return "elf";
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]].some((m) => starts(buf, m))) return "macho";
  if (buf.length > 0 && isText(buf)) return "text";
  return "unknown";
}

/** The type each accepted extension must really be. */
const EXPECTED: Record<string, Magic> = {
  png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", webp: "webp", pdf: "pdf", webm: "webm", mp4: "mp4",
  docx: "zip", xlsx: "zip", pptx: "zip", doc: "ole",
  md: "text", markdown: "text", txt: "text", csv: "text", html: "text", htm: "text",
};
/** The folder inside an Office Open XML package that proves which application it belongs to. */
const OOXML_PART: Record<string, string> = { docx: "word/", xlsx: "xl/", pptx: "ppt/" };

// ── PDF ────────────────────────────────────────────────────────
/** PDF names that run code, open other programs or carry files. /OpenAction alone just opens a page; an OpenAction that runs JS has /JS. */
const PDF_ACTIVE = new Set(["JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "XFA", "AA"]);
const PDF_NAME = /\/((?:[^\s/[\]()<>{}%#]|#[0-9a-fA-F]{2})+)/g;
const decodeName = (n: string) => n.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
function activeNames(text: string, found: Set<string>) {
  for (const m of text.matchAll(PDF_NAME)) { const n = decodeName(m[1]); if (PDF_ACTIVE.has(n)) found.add(n); }
}
const MAX_INFLATED = 32 * 1024 * 1024;

/**
 * The active-content names a PDF uses. Stream bodies are skipped (compressed images would give false matches),
 * except object streams (/ObjStm), which hold dictionaries and are opened when Flate-compressed.
 */
export function pdfActiveContent(buf: Buffer): string[] {
  const src = buf.toString("latin1");
  const found = new Set<string>();
  const outside: string[] = [];
  let pos = 0, inflated = 0;
  const STREAM = /stream\r?\n/g;
  for (let m = STREAM.exec(src); m; m = STREAM.exec(src)) {
    if (m.index > 0 && /[a-z]/i.test(src[m.index - 1])) continue;   // "endstream", not a stream start
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    outside.push(src.slice(pos, m.index));
    const dict = src.slice(Math.max(pos, src.lastIndexOf("obj", m.index)), m.index);
    if (/\/Type\s*\/ObjStm/.test(dict) && /\/FlateDecode/.test(dict) && inflated < MAX_INFLATED) {
      try {
        const body = inflateSync(Buffer.from(src.slice(start, end).replace(/\r?\n$/, ""), "latin1"), { maxOutputLength: MAX_INFLATED - inflated });
        inflated += body.length;
        activeNames(body.toString("latin1"), found);
      } catch { /* damaged or truncated stream: nothing readable to inspect */ }
    }
    pos = end + "endstream".length;
    STREAM.lastIndex = pos;
  }
  outside.push(src.slice(pos));
  activeNames(outside.join("\n"), found);
  return [...found].sort();
}

// ── Office ─────────────────────────────────────────────────────
const utf16 = (s: string) => Buffer.from(s, "utf16le");

/** Problems of an Office Open XML package (a zip): not really that kind of document, or macros inside. */
function ooxmlFinding(buf: Buffer, ext: string): Finding | null {
  const names = buf.toString("latin1");   // zip entry names are stored uncompressed in the local and central headers
  if (!names.includes("[Content_Types].xml") || !names.includes(OOXML_PART[ext])) return { reason: "mismatch", detail: `a zip that is not a ${ext} document` };
  if (/vbaProject\.bin/i.test(names)) return { reason: "macros", detail: "vbaProject.bin" };
  if (/xl\/macrosheets\//i.test(names)) return { reason: "macros", detail: "Excel 4.0 macro sheet" };
  return null;
}
/** Legacy Office (OLE) files keep macros in a "Macros" or "_VBA_PROJECT" storage, whose names are UTF-16. */
function oleFinding(buf: Buffer): Finding | null {
  if (buf.includes(utf16("_VBA_PROJECT")) || buf.includes(utf16("Macros"))) return { reason: "macros", detail: "VBA project" };
  return null;
}

// ── Text ───────────────────────────────────────────────────────
/** A text file that is really an HTML or SVG page with scripts (it could run if a browser ever renders it). */
export function scriptedMarkup(text: string): boolean {
  const head = text.replace(/^﻿/, "").trimStart().slice(0, 1024).toLowerCase();
  const markup = /^(<!doctype html|<html|<head|<body|<script|<svg|<\?xml[^>]*>\s*(<!doctype svg[^>]*>\s*)?<svg|<iframe|<object|<embed)/.test(head);
  return markup && /<script\b|\son[a-z]+\s*=|javascript:/i.test(text);
}

/**
 * The built-in checks for a file of the given extension (lower case, without the dot).
 * `allowScripts` is for HTML prototypes, which are meant to run (sandboxed) and only need the type check.
 */
export function inspect(buf: Buffer, ext: string, opts: { allowScripts?: boolean } = {}): Finding | null {
  const expected = EXPECTED[ext];
  const real = magicType(buf);
  if (!expected) return { reason: "mismatch", detail: `.${ext} is not an accepted type` };
  if (real !== expected) return { reason: "mismatch", detail: `.${ext} file whose content is ${real}` };
  if (real === "pdf") {
    const names = pdfActiveContent(buf);
    if (names.length) return { reason: "pdf_active", detail: names.map((n) => `/${n}`).join(" ") };
  }
  if (real === "zip" && OOXML_PART[ext]) return ooxmlFinding(buf, ext);
  if (real === "ole") return oleFinding(buf);
  if (real === "text" && !opts.allowScripts && scriptedMarkup(buf.toString("utf8"))) return { reason: "script", detail: "HTML/SVG with script" };
  return null;
}

// ── Antivirus (clamd) ──────────────────────────────────────────
export interface ClamConfig { host: string; port: number; timeoutMs: number; failOpen: boolean }

/** The clamd settings from the environment, or null when no antivirus is configured. */
export function clamConfig(env: NodeJS.ProcessEnv = process.env): ClamConfig | null {
  const host = env.CLAMAV_HOST?.trim();
  if (!host) return null;
  return {
    host,
    port: Number(env.CLAMAV_PORT) || 3310,
    timeoutMs: Number(env.CLAMAV_TIMEOUT_MS) || 30_000,
    failOpen: env.CLAMAV_FAIL_OPEN === "true",
  };
}

export type ClamResult = { status: "clean" } | { status: "found"; signature: string } | { status: "error"; detail: string };
const CHUNK = 64 * 1024;

/** Streams the bytes to clamd with the INSTREAM command and reads its verdict. Never throws. */
export function clamScan(buf: Buffer, cfg: Pick<ClamConfig, "host" | "port" | "timeoutMs">): Promise<ClamResult> {
  return new Promise((resolve) => {
    let reply = "", done = false;
    const finish = (r: ClamResult) => { if (done) return; done = true; socket.destroy(); resolve(r); };
    const verdict = () => {
      const line = reply.replace(/\0/g, "").trim();
      if (/^stream: OK$/.test(line)) return finish({ status: "clean" });
      const found = /^stream: (.+) FOUND$/.exec(line);
      if (found) return finish({ status: "found", signature: found[1] });
      finish({ status: "error", detail: line || "no answer from clamd" });
    };
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    socket.setTimeout(cfg.timeoutMs, () => finish({ status: "error", detail: `clamd did not answer within ${cfg.timeoutMs} ms` }));
    socket.on("error", (e) => { if (reply) verdict(); else finish({ status: "error", detail: e.message }); });
    socket.on("data", (d) => { reply += d.toString("latin1"); if (reply.includes("\0")) verdict(); });
    socket.on("end", verdict);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += CHUNK) {
        const part = buf.subarray(i, i + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));   // a zero-length chunk ends the stream
    });
  });
}

/**
 * The one scan step every upload goes through before it is kept. Throws FileRejected (422, or 503 when the
 * antivirus is down and fail-closed) and logs the reason; returns when the file may be stored.
 * `where` names the upload path in the log.
 */
export async function scanUpload(buf: Buffer, ext: string, where: string, opts: { allowScripts?: boolean; clam?: ClamConfig | null } = {}): Promise<void> {
  const reject = (reason: ScanReason, detail: string): never => {
    console.warn(`[fileScan] rejected upload (${where}, .${ext}, ${buf.length} bytes): ${reason}: ${detail}`);
    throw new FileRejected(reason, detail);
  };
  const finding = inspect(buf, ext.toLowerCase(), opts);
  if (finding) reject(finding.reason, finding.detail);
  const clam = opts.clam === undefined ? clamConfig() : opts.clam;
  if (!clam) return;
  const r = await clamScan(buf, clam);
  if (r.status === "found") reject("malware", r.signature);
  if (r.status === "error") {
    if (clam.failOpen) { console.warn(`[fileScan] antivirus unavailable, upload accepted without it (${where}, CLAMAV_FAIL_OPEN=true): ${r.detail}`); return; }
    reject("unavailable", r.detail);
  }
}
