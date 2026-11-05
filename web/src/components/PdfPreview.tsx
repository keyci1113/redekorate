import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { t, type Lang } from "../lib/i18n";
import { Button, cx } from "./ui";
import { DocumentView } from "../docs/DocumentView";
import { fileName } from "../docs/export";
import type { DocData, DocTemplate } from "../docs/types";

type Orientation = "portrait" | "landscape";

// Márgenes de la hoja en mm: los usa @page al imprimir y el relleno de la hoja en pantalla.
const PAGE = { portrait: 210, landscape: 297 };
const MARGIN = { x: 14, top: 16, bottom: 18 };
const WIDE = new Set(["journey", "blueprint", "usability", "affinity"]);
const isWide = (tpl: DocTemplate) => tpl.sections.some((s) => s.type === "custom" && WIDE.has(s.component));

function pageCss(orientation: Orientation, footer: string) {
  const box = 'font-family: "Instrument Sans Variable", sans-serif; font-size: 8.5pt; color: #454C58;';
  return `
    @page {
      size: A4 ${orientation};
      margin: ${MARGIN.top}mm ${MARGIN.x}mm ${MARGIN.bottom}mm;
      @bottom-left { content: ${JSON.stringify(footer)}; ${box} }
      @bottom-right { content: counter(page) " / " counter(pages); ${box} }
    }
    html, body, #pdf-root { height: auto !important; }
    html, body { margin: 0; background: #fff !important; }
    html { overflow: hidden; }
    @media print { html { overflow: visible; } }
  `;
}

/**
 * Vista previa del PDF. El documento se dibuja en un iframe del ancho exacto del área imprimible:
 * así los media queries, el tema claro y los saltos responden igual en pantalla y en el PDF,
 * y al descargar se imprime ese mismo iframe.
 */
export function PdfPreview({ tpl, title, data, lang, projectName, onClose }: {
  tpl: DocTemplate; title: string; data: DocData; lang: Lang; projectName?: string; onClose: () => void;
}) {
  const [orientation, setOrientation] = useState<Orientation>(() => (isWide(tpl) ? "landscape" : "portrait"));
  const [guide, setGuide] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(600);
  const frame = useRef<HTMLIFrameElement>(null);
  const pageStyle = useRef<HTMLStyleElement | null>(null);
  const footer = `redekorate · ${title}`;

  const setup = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.add("pdf-frame");
    doc.documentElement.dataset.theme = "light";
    doc.documentElement.lang = lang;
    doc.title = fileName(title);
    document.querySelectorAll<HTMLElement>('head style, head link[rel="stylesheet"]').forEach((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      if (copy instanceof HTMLLinkElement) copy.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(copy);
    });
    const style = doc.createElement("style");
    doc.head.appendChild(style);
    pageStyle.current = style;
    const root = doc.createElement("div");
    root.id = "pdf-root";
    doc.body.appendChild(root);
    setMount(root);
  };

  useEffect(() => {
    if (pageStyle.current) pageStyle.current.textContent = pageCss(orientation, footer);
  }, [orientation, footer, mount]);

  // Las tablas anchas se reducen para caber en la página en vez de cortarse.
  const fit = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc || !mount) return;
    mount.style.removeProperty("zoom");
    const available = doc.documentElement.clientWidth;
    const needed = doc.documentElement.scrollWidth;
    if (needed > available + 1) mount.style.setProperty("zoom", String(available / needed));
    setHeight(Math.ceil(mount.getBoundingClientRect().height));
  }, [mount]);

  useEffect(() => {
    if (!mount) return;
    const win = frame.current?.contentWindow as (Window & typeof globalThis) | null;
    if (!win) return;
    const observer = new win.ResizeObserver(fit);
    observer.observe(mount);
    observer.observe(mount.ownerDocument.documentElement);
    fit();
    return () => observer.disconnect();
  }, [mount, fit, orientation]);

  const download = useCallback(async () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    await win.document.fonts.ready;
    win.focus();
    win.print();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); void download(); }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose, download]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("Vista previa del PDF")} className="fixed inset-0 z-50 flex flex-col bg-paper print:hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-(--page-gutter) py-3">
        <h2 className="mr-auto min-w-0 truncate text-[15px] font-semibold">{t("Vista previa del PDF")}</h2>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
          {t("Incluir instrucciones")}
        </label>
        <div role="group" aria-label={t("Orientación")} className="flex rounded-lg bg-ink/5 p-0.5 text-xs font-semibold">
          {(["portrait", "landscape"] as const).map((o) => (
            <button key={o} type="button" aria-pressed={orientation === o} onClick={() => setOrientation(o)}
              className={cx("focus-ring rounded-md px-2.5 py-1", orientation === o ? "bg-surface shadow-sm" : "text-ink-3")}>
              {o === "portrait" ? t("Vertical") : t("Horizontal")}
            </button>
          ))}
        </div>
        <Button autoFocus variant="primary" size="sm" icon={<Download size={15} />} disabled={!mount} onClick={download} title={t("Elige «Guardar como PDF» al imprimir")}>
          {t("Descargar PDF")}
        </Button>
        <button type="button" onClick={onClose} className="focus-ring rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={t("Cerrar")}><X size={18} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto w-max bg-white shadow-(--shadow-lift)" style={{ padding: `${MARGIN.top}mm ${MARGIN.x}mm ${MARGIN.bottom}mm` }}>
          <iframe ref={frame} title={t("Vista previa del PDF")} srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>" onLoad={setup}
            className="block border-0" style={{ width: `${PAGE[orientation] - MARGIN.x * 2}mm`, height }} />
        </div>
      </div>
      {mount && createPortal(<DocumentView tpl={tpl} title={title} data={data} lang={lang} readOnly showGuide={guide} variant="pdf" projectName={projectName} />, mount)}
    </div>,
    document.body,
  );
}
