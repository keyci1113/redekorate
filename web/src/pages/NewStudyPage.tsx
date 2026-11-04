import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Plus, Search, Sparkles, Users } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Project, Study } from "../lib/types";
import { BLANK, CATEGORIES, TEMPLATES, type Category, type Template } from "../templates/catalog";
import { CATEGORY_ICON } from "../templates/icons";
import { blockDef } from "../blocks/registry";
import { Button, ErrorNote, Field, Modal, cx } from "../components/ui";
import { Segmented } from "../components/editing";
import { getLang, setContentLang, type Lang } from "../lib/i18n";

import { t } from "../lib/i18n";
// "¿Qué quieres averiguar?" → métodos recomendados
const GOALS = (): { label: string; keys: string[] }[] => [
  { label: t("¿Las personas pueden usar mi diseño?"), keys: ["prototype_test", "usability_unmoderated", "first_click", "sus"] },
  { label: t("Quiero probar mi prototipo de Figma"), keys: ["prototype_test", "usability_unmoderated"] },
  { label: t("Quiero organizar la navegación o el contenido"), keys: ["card_sort_open", "card_sort_hybrid", "tree_test"] },
  { label: t("Quiero comparar propuestas de diseño"), keys: ["preference_test", "five_second"] },
  { label: t("¿Se entiende el mensaje de mi pantalla?"), keys: ["five_second", "first_click"] },
  { label: t("Quiero medir satisfacción o lealtad"), keys: ["nps", "sus", "csat_ces"] },
  { label: t("Quiero conocer a mis usuarios y priorizar"), keys: ["survey", "prioritization", "screener"] },
];

export function NewStudyPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const project = useLoad(() => api.get<{ project: Project }>(`/projects/${id}`), [id]);
  const [cat, setCat] = useState<Category | "all">("all");
  const [goal, setGoal] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Template | null>(null);
  const ready = TEMPLATES.filter((tpl) => tpl.build || tpl.doc || tpl.tab).length;
  const firstTime = params.get("nuevo") === "1";

  const filtered = useMemo(() => TEMPLATES.filter((tpl) =>
    (cat === "all" || tpl.category === cat) &&
    (goal === null || GOALS()[goal].keys.includes(tpl.key)) &&
    (!q || `${tpl.name} ${tpl.description} ${tpl.when}`.toLowerCase().includes(q.toLowerCase()))), [cat, goal, q]);
  const shown = CATEGORIES.filter((c) => filtered.some((tpl) => tpl.category === c.id));

  return (
    <div className="mx-auto max-w-[1800px] px-8 py-10">
      <Link to={`/projects/${id}`} className="text-sm text-ink-3 hover:text-ink">← {project.data?.project.name ?? t("Proyecto")}</Link>

      {firstTime && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-good/20 bg-good-soft px-4 py-3 text-sm text-good">
          <CheckCircle2 size={18} /> {t("Proyecto")} <b>{project.data?.project.name}</b> {t("creado. Ahora elige qué tipo de investigación quieres hacer.")}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2 text-xs font-medium text-ink-3">
        <span className="flex items-center gap-1.5 text-accent"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-white">1</span>{t("Elige el método")}</span>
        <span className="h-px w-6 bg-line-2" />
        <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-line text-[11px]">2</span>{t("Configura")}</span>
        <span className="h-px w-6 bg-line-2" />
        <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-line text-[11px]">3</span>{t("Publica y comparte")}</span>
      </div>
      <h1 className="display mt-3 text-5xl">{t("¿Qué vas a investigar?")}</h1>
      <p className="mt-2 text-[15px] text-ink-2">{TEMPLATES.length} {t("métodos ·")} {ready} {t("listos para usar. Cada uno trae su template, su guía y su análisis automático.")}</p>

      {/* Ayuda para elegir */}
      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-accent" /> {t("¿No sabes cuál elegir? Empieza por tu pregunta")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GOALS().map((g, i) => (
            <button key={g.label} onClick={() => { setGoal(goal === i ? null : i); setCat("all"); }}
              className={cx("focus-ring rounded-full border px-3 py-1.5 text-[13px] transition", goal === i ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:border-accent hover:text-accent-ink")}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-8 mt-6 flex flex-wrap items-center gap-2 bg-paper/90 px-8 py-3 backdrop-blur">
        <div className="relative w-56">
          <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field h-8 py-1 pl-8 text-[13px]" placeholder={t("Buscar método…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {(["all", ...CATEGORIES.map((c) => c.id)] as const).map((c) => (
          <button key={c} onClick={() => { setCat(c); setGoal(null); }}
            className={cx("focus-ring shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition", cat === c && goal === null ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-2 hover:border-line-2")}>
            {c === "all" ? t("Todos") : t(c)}
          </button>
        ))}
      </div>

      {cat === "all" && goal === null && !q && (
        <button onClick={() => setPick(BLANK)} className="focus-ring group mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed border-line-2 bg-surface/50 p-5 text-left transition hover:border-accent hover:bg-surface">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white"><Plus size={18} /></span>
          <span className="flex-1"><span className="block font-semibold">{BLANK.name}</span><span className="text-sm text-ink-3">{BLANK.description} {t("Combina cualquier tipo de bloque: preguntas, card sorting, imágenes…")}</span></span>
          <ArrowRight size={18} className="text-ink-3 transition group-hover:translate-x-1 group-hover:text-accent" />
        </button>
      )}

      {shown.map((c) => (
        <section key={c.id} className="mt-10">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">{CATEGORY_ICON[c.id]} {t(c.id)}</h2>
            <p className="text-sm text-ink-3">{c.blurb}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.filter((tpl) => tpl.category === c.id).sort((a, b) => Number(!!(b.build || b.doc || b.tab)) - Number(!!(a.build || a.doc || a.tab))).map((tpl) => <TemplateCard key={tpl.key} tpl={tpl} onPick={() => (tpl.doc ? nav(`/projects/${id}?tab=docs&new=${tpl.doc}`) : tpl.tab ? nav(`/projects/${id}?tab=${tpl.tab}`) : setPick(tpl))} />)}
          </div>
        </section>
      ))}
      {shown.length === 0 && <p className="mt-10 text-center text-sm text-ink-3">{t("Ningún método coincide con tu búsqueda.")}</p>}

      <TemplateModal tpl={pick} projectId={id!} onClose={() => setPick(null)} onCreated={(sid) => nav(`/studies/${sid}/edit`)} />
    </div>
  );
}

function TemplateCard({ tpl, onPick }: { tpl: Template; onPick: () => void }) {
  const usable = !!tpl.build || !!tpl.doc || !!tpl.tab, included = !usable && tpl.phase === 1;
  return (
    <button disabled={!usable} onClick={onPick}
      className={cx("focus-ring flex flex-col rounded-xl border p-4 text-left transition",
        usable ? "border-line bg-surface hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-accent/10" : "cursor-default border-line/70 bg-surface/40")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={cx("leading-snug font-semibold", !usable && "text-ink-2")}>{tpl.name}</h3>
        {tpl.doc ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">{t("Documento")}</span>
          : usable ? <span className="shrink-0 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">{t("Listo")}</span>
          : included ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">{t("Incluido")}</span>
          : <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-3">{t("Próximamente")}</span>}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{tpl.description}</p>
      {tpl.when && <p className="mt-3 text-[13px] text-ink-2"><span className="font-medium">{t("Úsalo para:")}</span> {tpl.when}</p>}
      {tpl.duration !== "—" && (
        <div className="mt-auto flex gap-4 pt-4 text-xs text-ink-3">
          <span className="flex items-center gap-1"><Clock size={12} /> {tpl.duration}</span>
          <span className="flex items-center gap-1"><Users size={12} /> {tpl.participants}</span>
        </div>
      )}
    </button>
  );
}

function TemplateModal({ tpl, projectId, onClose, onCreated }: { tpl: Template | null; projectId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLangChoice] = useState<Lang>(getLang());
  const blocks = useMemo(() => { setContentLang(lang); const b = tpl?.build?.() ?? []; setContentLang(getLang()); return b; }, [tpl, lang]);
  if (!tpl) return null;
  async function create() {
    setBusy(true); setError(null);
    try {
      const { study } = await api.post<{ study: Study }>("/studies", { project_id: projectId, title: title.trim() || (tpl!.key === "blank" ? t("Estudio sin título") : tpl!.name), method: tpl!.key, blocks, settings: { language: lang } });
      onCreated(study.id);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <Modal open onClose={() => { onClose(); setTitle(""); }} title={tpl.name} wide>
      <p className="text-sm text-ink-2">{tpl.description}</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label mb-2">{t("Incluye estos bloques")}</p>
          <ol className="space-y-1.5">
            {blocks.map((b, i) => (
              <li key={b.id} className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-[13px]">
                <span className="w-4 text-right text-[11px] text-ink-3">{i + 1}</span>
                <span className="text-accent">{blockDef(b.type)?.icon}</span>
                <span className="truncate">{b.title}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-3">{t("Podrás editar, reordenar y agregar bloques después.")}</p>
        </div>
        <div className="space-y-4">
          {tpl.guide && (
            <div>
              <p className="label mb-2">{t("Pasos")}</p>
              <ol className="list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">{tpl.guide.map((g) => <li key={g}>{g}</li>)}</ol>
            </div>
          )}
          {tpl.duration !== "—" && <p className="flex gap-4 text-xs text-ink-3"><span className="flex items-center gap-1"><Clock size={12} /> {tpl.duration}</span><span className="flex items-center gap-1"><Users size={12} /> {tpl.participants} {t("participantes")}</span></p>}
          <Field group label={t("Idioma para participantes")} hint={t("Las preguntas del template y los botones se generan en este idioma.")}>
            <Segmented value={lang} onChange={setLangChoice} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} />
          </Field>
          <Field label={t("Nombre del estudio")}><input autoFocus className="field" placeholder={tpl.key === "blank" ? t("Estudio sin título") : tpl.name} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} /></Field>
        </div>
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t("Cancelar")}</Button>
        <Button variant="primary" icon={<ArrowRight size={15} />} disabled={busy} onClick={create}>{busy ? t("Creando…") : t("Usar este método")}</Button>
      </div>
    </Modal>
  );
}
