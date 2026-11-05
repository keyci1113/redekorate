import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileCode2, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { PdfPreview } from "./PdfPreview";
import { t, type Lang } from "../lib/i18n";
import { Button } from "./ui";
import { docBlocks, download, fileName, toCSV, toDocx, toMarkdown } from "../docs/export";
import type { DocData, DocTemplate } from "../docs/types";

/** Menú "Exportar": Word (.docx), PDF (con vista previa), Markdown y CSV. */
export function ExportMenu({ tpl, title, data, lang, projectName, size = "sm" }: {
  tpl: DocTemplate; title: string; data: DocData; lang: Lang; projectName?: string; size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const name = fileName(title);
  const blocks = () => docBlocks(tpl, title, data, lang, projectName);
  const run = async (fn: () => void | Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); setOpen(false); } };

  const items = [
    { id: "docx", icon: <FileText size={15} />, label: t("Word (.docx)"), go: async () => download(`${name}.docx`, await toDocx(blocks())) },
    { id: "pdf", icon: <Printer size={15} />, label: t("PDF"), hint: t("Vista previa antes de descargar"), go: () => setPreview(true) },
    { id: "md", icon: <FileCode2 size={15} />, label: t("Markdown (.md)"), go: () => download(`${name}.md`, toMarkdown(blocks()), "text/markdown") },
    { id: "csv", icon: <FileSpreadsheet size={15} />, label: t("CSV (.csv)"), hint: t("Para Excel o Google Sheets"), go: () => download(`${name}.csv`, toCSV(blocks(), lang), "text/csv") },
  ];

  return (
    <div ref={ref} className="relative print:hidden">
      <Button size={size} variant="ghost" icon={<Download size={15} />} onClick={() => setOpen(!open)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? t("Exportando…") : t("Exportar")} <ChevronDown size={13} className="-mr-1" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-xl shadow-ink/10">
          {items.map((it) => (
            <button key={it.id} role="menuitem" type="button" onClick={() => run(it.go)}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-soft/60 focus:bg-accent-soft/60 focus:outline-none">
              <span className="mt-0.5 text-accent">{it.icon}</span>
              <span><span className="block font-medium">{it.label}</span>{it.hint && <span className="block text-xs text-ink-3">{it.hint}</span>}</span>
            </button>
          ))}
        </div>
      )}
      {preview && <PdfPreview tpl={tpl} title={title} data={data} lang={lang} projectName={projectName} onClose={() => setPreview(false)} />}
    </div>
  );
}
