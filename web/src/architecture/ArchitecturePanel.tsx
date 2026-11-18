import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FolderTree as Sitemap, GitFork, Link2, Network, Palette, Plus, Shapes, Workflow } from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/hooks";
import { getLang, t, tr, type Lang } from "../lib/i18n";
import { Button, Empty, ErrorNote, Field, Modal, cx } from "../components/ui";
import { Segmented } from "../components/editing";
import type { DocRecord } from "../docs/types";
import { starter, type StarterId } from "./model";

const STARTERS: { id: StarterId; name: string; text: string; icon: ReactNode }[] = [
  { id: "blank", name: "Lienzo en blanco", text: "Figuras, notas adhesivas, texto y flechas, como en una pizarra.", icon: <Shapes size={18} /> },
  { id: "moodboard", name: "Mood board", text: "Imágenes, colores, notas y enlaces de una dirección visual. Compara direcciones con participantes en una prueba de preferencia.", icon: <Palette size={18} /> },
  { id: "sitemap", name: "Mapa del sitio", text: "Arquitectura de información: escribe las páginas como un esquema y se dibuja el árbol.", icon: <Sitemap size={18} /> },
  { id: "user_flow", name: "Flujo de usuario", text: "Las pantallas y decisiones por las que pasa una persona para lograr algo.", icon: <Workflow size={18} /> },
  { id: "flowchart", name: "Diagrama de flujo", text: "Pasos y decisiones de un proceso, de inicio a fin.", icon: <GitFork size={18} /> },
  { id: "system", name: "Arquitectura del sistema", text: "Las partes de un producto (apps, servicios, bases de datos) y cómo se conectan.", icon: <Network size={18} /> },
];
const kindLabel = (kind: string) => (kind === "sitemap" ? t("Mapa del sitio") : kind === "moodboard" ? t("Mood board") : t("Diagrama"));

export function ArchitecturePanel({ projectId, diagrams, onChange, canEdit = true }: { projectId: string; diagrams: DocRecord[]; onChange: () => void; canEdit?: boolean }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">{t("Diagramas, flujos, mapas del sitio y mood boards: dibuja con figuras y flechas, escribe un esquema y el mapa se arma solo, o junta imágenes y colores.")}</p>
        {canEdit && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Nuevo diagrama")}</Button>}
      </div>
      {diagrams.length === 0 ? (
        <Empty icon={<Network size={20} />} title={t("Aún no hay diagramas")}
          text={t("Mapas del sitio, flujos de usuario, diagramas de flujo y de arquitectura del sistema.")}
          action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("Crear el primero")}</Button> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {diagrams.map((d) => (
            <button key={d.id} onClick={() => nav(`/docs/${d.id}`)} className="focus-ring flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-accent/10">
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">{d.kind === "sitemap" ? <Sitemap size={18} /> : d.kind === "moodboard" ? <Palette size={18} /> : <Shapes size={18} />}</span>
                {d.share_token && <span title={t("Compartido")} className="text-good"><Link2 size={14} /></span>}
              </div>
              <p className="mt-3 font-semibold leading-snug">{d.title}</p>
              <p className="mt-0.5 text-xs text-ink-3">{kindLabel(d.kind)} · {t("editado {a}", { a: timeAgo(d.updated_at) })}</p>
            </button>
          ))}
        </div>
      )}
      <NewDiagramModal open={open} onClose={() => setOpen(false)} projectId={projectId} onCreated={(id) => { onChange(); nav(`/docs/${id}`); }} />
    </div>
  );
}

function NewDiagramModal({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: (id: string) => void }) {
  const [pick, setPick] = useState<StarterId>("blank");
  const [lang, setLang] = useState<Lang>(getLang());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chosen = STARTERS.find((s) => s.id === pick)!;

  async function create() {
    setBusy(true); setErr(null);
    try {
      const s = starter(pick, lang);
      const { document } = await api.post<{ document: DocRecord }>("/documents", { project_id: projectId, kind: s.kind, language: lang, title: title.trim() || tr(chosen.name, lang), data: s.data });
      setTitle(""); setPick("blank"); setBusy(false);
      onCreated(document.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Nuevo diagrama")} wide>
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("Tipo de diagrama")}>
          {STARTERS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} onClick={() => setPick(s.id)}
              className={cx("focus-ring flex items-start gap-3 rounded-xl border p-3 text-left transition", pick === s.id ? "border-accent bg-accent-soft/50" : "border-line hover:border-accent")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{s.icon}</span>
              <span><span className="block text-sm font-semibold">{t(s.name)}</span><span className="block text-xs leading-snug text-ink-3">{t(s.text)}</span></span>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Nombre del diagrama")}><input className="field" placeholder={tr(chosen.name, lang)} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} /></Field>
          <Field group label={t("Idioma del ejemplo")}>
            <Segmented value={lang} onChange={setLang} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} />
          </Field>
        </div>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
          <Button variant="primary" disabled={busy} onClick={create} className={cx(busy && "opacity-60")}>{t("Crear diagrama")}</Button>
        </div>
      </div>
    </Modal>
  );
}
