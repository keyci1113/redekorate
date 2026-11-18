import { useEffect, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { api } from "../lib/api";
import { getLang, setContentLang, t, tr, type Lang } from "../lib/i18n";
import { Button, ErrorNote, Field, Modal, cx } from "../components/ui";
import { templateByKey } from "../templates/catalog";
import type { Block, PreferenceBlock } from "../blocks/types";
import type { Study } from "../lib/types";
import { uid } from "../lib/hooks";
import type { CanvasHandle } from "./DiagramCanvas";
import { boardDirections, type DiagramData } from "./model";

/** Neutral option names (A, B, C…), so the frame's own title never steers the choice. */
export const optionLetter = (i: number) => String.fromCharCode(65 + (i % 26));

/** The preference test's blocks for these pictures, written in the study's language. */
export function preferenceBlocks(lang: Lang, question: string, images: string[]): Block[] {
  setContentLang(lang);
  try {
    const blocks = templateByKey("preference_test")!.build!();
    return blocks.map((b) => b.type !== "preference" ? b : {
      ...b, title: question.trim() || b.title,
      options: images.map((image, i) => ({ id: uid(), label: `${tr("Opción", lang)} ${optionLetter(i)}`, image })),
    } as PreferenceBlock);
  } finally { setContentLang(getLang()); }
}

/**
 * Turns a mood board into a draft preference test: each section with something in it is one direction, pictured
 * as it looks on the board, and participants pick the one that fits best and say why.
 */
export function BoardTestModal({ open, onClose, board, canvas, projectId, title, lang }: {
  open: boolean; onClose: () => void; board: DiagramData; canvas: RefObject<CanvasHandle | null>; projectId: string; title: string; lang: Lang;
}) {
  const nav = useNavigate();
  const directions = boardDirections(board);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ids = directions.map((d) => d.id).join(",");
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(directions.map((d) => d.id)));
    setQuestion(tr("¿Cuál de estas propuestas se siente más adecuada para la marca?", lang));
    setName(`${tr("Prueba de preferencia", lang)}: ${title}`);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ids, lang]);
  const chosen = directions.filter((d) => picked.has(d.id));

  async function create() {
    setErr(null);
    try {
      const images: string[] = [];
      for (const [i, d] of chosen.entries()) {
        setBusy(t("Preparando la opción {a} de {b}…", { a: i + 1, b: chosen.length }));
        const blob = await canvas.current?.exportFrame(d.id);
        if (!blob) throw new Error(t("No se pudo tomar la imagen de la sección «{a}».", { a: d.text || optionLetter(i) }));
        images.push(await api.upload(new File([blob], `option-${optionLetter(i).toLowerCase()}.png`, { type: "image/png" })));
      }
      setBusy(t("Creando el estudio…"));
      const { study } = await api.post<{ study: Study }>("/studies", {
        project_id: projectId, title: name.trim() || title, method: "preference_test",
        blocks: preferenceBlocks(lang, question, images), settings: { language: lang },
      });
      nav(`/studies/${study.id}/edit`);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={t("Probar con participantes")} wide>
      {directions.length < 2 ? (
        <div className="space-y-4 text-sm text-ink-2">
          <p>{t("Para comparar direcciones, pon cada una en su propia sección (la herramienta Sección) con al menos una imagen, color, nota o enlace dentro. Se necesitan dos o más.")}</p>
          <p>{t("Cada sección se convierte en una opción de una prueba de preferencia, tal como se ve en el tablero.")}</p>
          <div className="flex justify-end"><Button onClick={onClose}>{t("Entendido")}</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-2">{t("Se crea un borrador de prueba de preferencia: cada sección elegida es una opción con su imagen, con nombres neutros (Opción A, B…) y en orden aleatorio. Podrás revisarlo antes de publicarlo.")}</p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("Direcciones a comparar")}</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {directions.map((d) => {
                const i = chosen.findIndex((c) => c.id === d.id);
                return (
                  <li key={d.id}>
                    <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition", picked.has(d.id) ? "border-accent bg-accent-soft/50" : "border-line hover:border-accent")}>
                      <input type="checkbox" checked={picked.has(d.id)} disabled={!!busy}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} />
                      <span className="min-w-0 flex-1 truncate font-medium">{d.text.replace(/[*_~\\]/g, "") || t("Sección sin nombre")}</span>
                      {i >= 0 && <span className="shrink-0 text-xs text-ink-3">{tr("Opción", lang)} {optionLetter(i)}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Pregunta para participantes")}><input className="field" value={question} disabled={!!busy} onChange={(e) => setQuestion(e.target.value)} /></Field>
            <Field label={t("Nombre del estudio")}><input className="field" value={name} disabled={!!busy} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          {chosen.length < 2 && <p className="text-sm text-bad">{t("Elige al menos dos direcciones.")}</p>}
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex items-center justify-end gap-3">
            {busy && <span role="status" className="text-sm text-ink-3">{busy}</span>}
            <Button variant="ghost" onClick={onClose} disabled={!!busy}>{t("Cancelar")}</Button>
            <Button variant="primary" icon={<FlaskConical size={16} />} disabled={!!busy || chosen.length < 2} onClick={create}>{t("Crear prueba de preferencia")}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
