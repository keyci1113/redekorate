import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, Link2 } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import { getLang, t, tr, type Lang } from "../lib/i18n";
import { Button, Empty, ErrorNote, Field, Modal, cx } from "./ui";
import { Segmented } from "./editing";
import { DOC_CATEGORIES, DOC_TEMPLATES, docTemplate } from "../docs/templates";
import type { DocRecord, DocTemplate } from "../docs/types";

export function DocsPanel({ projectId, docs, onChange, preselect }: { projectId: string; docs: DocRecord[]; onChange: () => void; preselect?: string | null }) {
  const [open, setOpen] = useState(!!preselect);
  const nav = useNavigate();
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{t("Plantillas para planear, sintetizar y evaluar: se llenan aquí mismo, guiadas por instrucciones y ejemplos en cada campo.")}</p>
        <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => setOpen(true)}>{t("Nuevo documento")}</Button>
      </div>
      {docs.length === 0 ? (
        <Empty icon={<FilePlus2 size={20} />} title={t("Aún no hay documentos")}
          text={t("User personas, journey maps, diagramas de afinidad, guiones de prueba, evaluaciones heurísticas y más.")}
          action={<Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => setOpen(true)}>{t("Crear el primero")}</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => {
            const tpl = docTemplate(d.kind);
            return (
              <button key={d.id} onClick={() => nav(`/docs/${d.id}`)} className="focus-ring flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-accent/10">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">{tpl?.icon}</span>
                  <span className="flex items-center gap-1.5">
                    {d.share_token && <span title={t("Compartido")} className="text-good"><Link2 size={14} /></span>}
                    <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-bold text-ink-2 uppercase">{d.language}</span>
                  </span>
                </div>
                <p className="mt-3 font-semibold leading-snug">{d.title}</p>
                <p className="mt-0.5 text-xs text-ink-3">{tpl ? tpl.name && t(tpl.name) : d.kind} · {t("editado {a}", { a: timeAgo(d.updated_at) })}</p>
              </button>
            );
          })}
        </div>
      )}
      <NewDocModal open={open} onClose={() => setOpen(false)} projectId={projectId} preselect={preselect} onCreated={(id) => { onChange(); nav(`/docs/${id}`); }} />
    </div>
  );
}

function NewDocModal({ open, onClose, projectId, preselect, onCreated }: { open: boolean; onClose: () => void; projectId: string; preselect?: string | null; onCreated: (id: string) => void }) {
  const [pick, setPick] = useState<DocTemplate | null>(preselect ? docTemplate(preselect) ?? null : null);
  const [lang, setLang] = useState<Lang>(getLang());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open && preselect) setPick(docTemplate(preselect) ?? null); }, [open, preselect]);

  async function create() {
    if (!pick) return;
    setBusy(true); setErr(null);
    try {
      // La plantilla nace vacía; los ejemplos se ven como texto guía dentro de cada campo
      const data = pick.init?.(lang) ?? {};
      const { document } = await api.post<{ document: DocRecord }>("/documents", { project_id: projectId, kind: pick.kind, language: lang, title: title.trim() || tr(pick.name, lang), data });
      onCreated(document.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={() => { onClose(); setPick(null); }} title={pick ? t(pick.name) : t("Nuevo documento")} wide>
      {!pick ? (
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {DOC_CATEGORIES.map((c) => (
            <div key={c.id}>
              <p className="mb-2 flex items-baseline gap-2"><span className="text-sm font-semibold">{t(c.id)}</span><span className="text-xs text-ink-3">{t(c.blurb)}</span></p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DOC_TEMPLATES.filter((d) => d.category === c.id).map((d) => (
                  <button key={d.kind} onClick={() => setPick(d)} className="focus-ring flex items-start gap-3 rounded-xl border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{d.icon}</span>
                    <span><span className="block text-sm font-semibold">{t(d.name)}</span><span className="block text-xs leading-snug text-ink-3">{t(d.description)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl bg-paper p-4">
            <p className="text-sm text-ink-2">{t(pick.description)}</p>
            <p className="mt-2 text-sm font-medium text-good">{t(pick.question)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Nombre del documento")}><input autoFocus className="field" placeholder={tr(pick.name, lang)} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field group label={t("Idioma del documento")}>
              <Segmented value={lang} onChange={setLang} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} />
            </Field>
          </div>
          {err && <ErrorNote>{err}</ErrorNote>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setPick(null)} className="text-sm text-ink-3 hover:text-ink">← {t("Ver todas las plantillas")}</button>
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy} onClick={create} className={cx(busy && "opacity-60")}>{t("Crear documento")}</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
