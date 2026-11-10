import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  AlertTriangle, BarChart3, Check, CircleAlert, Copy, CopyPlus, Eye, GitBranch, GripVertical, Lightbulb, Link2,
  Monitor, Palette, PanelLeft, PanelRight, Plus, Rocket, Search, Smartphone, Square, Trash2, X,
} from "lucide-react";
import { api } from "../lib/api";
import { copy, uid, useLoad, usePaneWidth, usePref } from "../lib/hooks";
import type { Project, Study } from "../lib/types";
import type { Block } from "../blocks/types";
import { BLOCKS, BLOCK_GROUPS, blockDef, isStructural } from "../blocks/registry";
import { BlockEditor } from "../blocks/Editor";
import { LogicEditor } from "../blocks/LogicEditor";
import { BlockView, isWide } from "../blocks/Runner";
import { validateStudy, type Issue } from "../blocks/validate";
import { Button, ErrorNote, Field, Modal, Spinner, StatusBadge, cx } from "../components/ui";
import { ImageDrop, PaneHandle, Segmented, Toggle, useSortable } from "../components/editing";
import { BRAND_COLORS, defaultConsent, brandStyle, type StudySettings } from "../lib/settings";
import { templateByKey } from "../templates/catalog";
import { getLang, setContentLang } from "../lib/i18n";
import { PrototypeEditor, newPrototype } from "../components/PrototypeEditor";
import { rememberStudy } from "../lib/recent";
import { canEdit } from "../lib/roles";
import type { ProtoCtx } from "../blocks/PrototypeTaskEditor";

import { t } from "../lib/i18n";
export const studyUrl = (slug: string) => `${window.location.origin}/s/${slug}`;

export function BuilderPage() {
  const { id } = useParams();
  const { data, error, loading, setData } = useLoad(() => api.get<{ study: Study; project: Project }>(`/studies/${id}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <div className="p-10"><ErrorNote>{error}</ErrorNote></div>;
  if (!canEdit(data.project.role)) return <Navigate to={`/studies/${id}/results`} replace />;   // commenter and viewer: no builder
  return <Builder initial={data.study} project={data.project} onStudy={(s) => setData({ ...data, study: s })} />;
}

function Builder({ initial, project, onStudy }: { initial: Study; project: Project; onStudy: (s: Study) => void }) {
  const [title, setTitle] = useState(initial.title);
  const [blocks, setBlocks] = useState<Block[]>(initial.blocks);
  const [settings, setSettings] = useState<StudySettings>(initial.settings as StudySettings);
  const [selected, setSelected] = useState<string | null>(initial.blocks.find((b) => !isStructural(b))?.id ?? initial.blocks[0]?.id ?? null);
  const [panel, setPanel] = useState<"content" | "logic">("content");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [adding, setAdding] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [previewValue, setPreviewValue] = useState<Record<string, unknown>>({});
  const first = useRef(true);
  const study = initial;
  useEffect(() => { rememberStudy({ id: study.id, title: study.title, method: study.method, project_id: project.id, project_name: project.name, where: "edit" }); }, [study.id, study.title, study.method, project.id, project.name]);
  const template = templateByKey(study.method);
  setContentLang(settings.language ?? getLang());   // los bloques nuevos se crean en el idioma del estudio
  const issues = useMemo(() => validateStudy(blocks, settings), [blocks, settings]);
  const [protoEditor, setProtoEditor] = useState<{ id?: string } | null>(null);
  const leftPane = usePaneWidth("builder-left", 288, 220, 520, "left");
  const rightPane = usePaneWidth("builder-right", 340, 280, 720, "right");
  const [showLeft, setShowLeft] = usePref("builder-show-left", true);
  const [showRight, setShowRight] = usePref("builder-show-right", true);
  const prototypes = settings.prototypes ?? [];
  const protoCtx: ProtoCtx = {
    prototypes,
    openEditor: (id) => setProtoEditor({ id }),
    create: () => { const p = newPrototype(prototypes.length + 1); setSettings((s) => ({ ...s, prototypes: [...(s.prototypes ?? []), p] })); return p.id; },
  };
  const issuesFor = (id: string) => issues.filter((i) => i.blockId === id);

  // Autoguardado con debounce
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaving("saving");
    const timer = setTimeout(async () => {
      try {
        const { study: s } = await api.patch<{ study: Study }>(`/studies/${study.id}`, { title: title.trim() || t("Estudio sin título"), blocks, settings });
        onStudy(s); setSaving("saved");
      } catch { setSaving("error"); }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, blocks, settings]);

  const current = blocks.find((b) => b.id === selected) ?? null;
  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const remove = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    setSelected(next[Math.min(i, next.length - 1)]?.id ?? null);
  };
  const insert = (nb: Block) => {
    if (nb.type === "prototype_task" && prototypes.length === 1) nb = { ...nb, prototypeId: prototypes[0].id, startScreen: prototypes[0].screens[0]?.id ?? "" };
    setBlocks((bs) => {
      const at = selected ? bs.findIndex((b) => b.id === selected) + 1 : bs.length;
      const end = bs[bs.length - 1]?.type === "thank_you" ? bs.length - 1 : bs.length;
      const n = [...bs]; n.splice(Math.min(at, end), 0, nb); return n;
    });
    setSelected(nb.id); setAdding(false); setPanel("content");
  };
  const duplicate = (b: Block) => insert({ ...structuredClone(b), id: uid(), logic: undefined, title: `${b.title} (copia)` });
  const sortable = useSortable(blocks, setBlocks);

  async function publishChanges() {
    const { study: s } = await api.post<{ study: Study }>(`/studies/${study.id}/publish`);
    onStudy(s);
  }
  async function setStatus(status: Study["status"]) {
    const { study: s } = await api.post<{ study: Study }>(`/studies/${study.id}/status`, { status });
    onStudy(s);
    if (status === "live") { setCheckOpen(false); setShareOpen(true); }
  }

  const errorsCount = issues.filter((i) => i.level === "error").length;

  return (
    <div className="flex h-screen flex-col">
      {/* Barra superior */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
        <Link to={`/projects/${project.id}`} className="focus-ring flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-3 hover:text-ink">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: project.color }} />
          <span className="hidden max-w-40 truncate sm:inline">{project.name}</span>
        </Link>
        <span className="text-line-2">/</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("Título del estudio")} className="focus-ring min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 font-semibold hover:bg-paper" />
        <span className="hidden text-xs text-ink-3 md:block">
          {saving === "saving" ? t("Guardando…") : saving === "saved" ? <span className="flex items-center gap-1"><Check size={12} /> {t("Guardado")}</span> : saving === "error" ? <span className="text-bad">{t("Error al guardar")}</span> : ""}
        </span>
        <StatusBadge status={study.status} />
        <div className="hidden rounded-lg bg-paper p-0.5 lg:flex">
          <button onClick={() => setShowLeft(!showLeft)} aria-pressed={showLeft} title={showLeft ? t("Ocultar lista de bloques") : t("Mostrar lista de bloques")} aria-label={t("Lista de bloques")}
            className={cx("focus-ring rounded-md p-1.5", showLeft ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}><PanelLeft size={14} /></button>
          <button onClick={() => setShowRight(!showRight)} aria-pressed={showRight} title={showRight ? t("Ocultar panel de propiedades") : t("Mostrar panel de propiedades")} aria-label={t("Panel de propiedades")}
            className={cx("focus-ring rounded-md p-1.5", showRight ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}><PanelRight size={14} /></button>
        </div>
        <Button size="sm" variant="ghost" icon={<Smartphone size={15} />} onClick={() => setProtoEditor({})}>{t("Prototipos")}{prototypes.length ? ` · ${prototypes.length}` : ""}</Button>
        <Button size="sm" variant="ghost" icon={<Palette size={15} />} onClick={() => setDesignOpen(true)}>{t("Diseño")}</Button>
        <Button size="sm" variant="ghost" icon={<Eye size={15} />} onClick={() => window.open(`/s/${study.public_slug}?preview=1`, "_blank", "noopener")}>{t("Probar")}</Button>
        <Link to={`/studies/${study.id}/results`} className="hidden lg:block"><Button size="sm" variant="ghost" icon={<BarChart3 size={15} />}>{t("Resultados")}</Button></Link>
        {study.status === "draft" && <Button size="sm" variant="primary" icon={<Rocket size={15} />} onClick={() => setCheckOpen(true)}>{t("Publicar")}</Button>}
        {study.status === "live" && <>
          {study.has_unpublished && <Button size="sm" variant="primary" icon={<Rocket size={15} />} onClick={() => setCheckOpen(true)}>{t("Publicar cambios")}</Button>}
          <Button size="sm" icon={<Link2 size={15} />} onClick={() => setShareOpen(true)}>{t("Compartir")}</Button>
          <Button size="sm" variant="ghost" icon={<Square size={13} />} onClick={() => setStatus("closed")}>{t("Cerrar")}</Button>
        </>}
        {study.status === "closed" && <Button size="sm" icon={<Rocket size={15} />} onClick={() => setStatus("live")}>{t("Reabrir")}</Button>}
      </header>

      {study.status === "live" && (
        <div className="border-b border-warn/20 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
          {study.has_unpublished
            ? <>{t("Tienes cambios sin publicar. Los participantes siguen viendo la versión publicada; quien esté a medio flujo no se interrumpe.")} <button type="button" onClick={() => setCheckOpen(true)} className="font-semibold underline underline-offset-2">{t("Publicar cambios")}</button></>
            : t("Este estudio está recibiendo respuestas. Lo que edites se guarda como borrador hasta que publiques los cambios.")}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Lista de bloques ── */}
        {showLeft && <aside className="flex shrink-0 flex-col border-r border-line bg-paper" style={{ width: leftPane.width }}>
          {template?.guide && guideOpen && (
            <div className="m-3 mb-1 rounded-xl border border-accent/15 bg-accent-soft/70 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink"><Lightbulb size={14} /> {t("Cómo armar tu")} {template.name}</p>
                <button onClick={() => setGuideOpen(false)} className="text-accent-ink hover:opacity-70" aria-label={t("Ocultar guía")}><X size={14} /></button>
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-accent-ink">{template.guide.map((g) => <li key={g}>{g}</li>)}</ol>
            </div>
          )}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="label">{t("Bloques ·")} {blocks.length}</p>
            {!guideOpen && template?.guide && <button onClick={() => setGuideOpen(true)} className="flex items-center gap-1 text-[11px] font-medium text-accent"><Lightbulb size={12} /> {t("Guía")}</button>}
          </div>
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
            {blocks.map((b, i) => {
              const def = blockDef(b.type);
              const on = b.id === selected;
              const bi = issuesFor(b.id);
              return (
                <li key={b.id} {...sortable.props(i)} className={cx(sortable.drag === i && "opacity-40", sortable.over === i && sortable.drag !== i && "rounded-lg ring-2 ring-accent/40")}>
                  <div onClick={() => setSelected(b.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(b.id)}
                    className={cx("focus-ring group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition", on ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-ink/[0.04]")}>
                    <GripVertical size={13} className="shrink-0 cursor-grab text-ink-3/50 group-hover:text-ink-3" />
                    <span className="w-4 text-right text-[11px] text-ink-3 tabular-nums">{i + 1}</span>
                    <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", on ? "bg-accent text-on-accent" : "bg-surface text-ink-2 ring-1 ring-line")}>{def?.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{b.title || def?.label}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        {def?.label}
                        {b.logic && <GitBranch size={11} className="text-accent" aria-label={t("Tiene lógica")} />}
                        {bi.some((x) => x.level === "error") ? <CircleAlert size={11} className="text-bad" /> : bi.length ? <AlertTriangle size={11} className="text-warn" /> : null}
                      </span>
                    </span>
                    <span className="hidden gap-0.5 group-hover:flex">
                      <button onClick={(e) => { e.stopPropagation(); duplicate(b); }} className="rounded p-0.5 text-ink-3 hover:text-ink" title={t("Duplicar")}><CopyPlus size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); remove(b.id); }} className="rounded p-0.5 text-ink-3 hover:text-bad" title={t("Eliminar")}><Trash2 size={13} /></button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="border-t border-line p-3">
            <Button variant="primary" className="w-full" icon={<Plus size={16} />} aria-expanded={adding} onClick={() => setAdding(!adding)}>{t("Agregar bloque")}</Button>
          </div>
        </aside>}
        {showLeft && <PaneHandle {...leftPane.handleProps} label={t("Ancho de la lista de bloques")} />}

        {/* ── Vista previa ── */}
        <section className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(var(--color-line-2)_1px,transparent_1px)] [background-size:18px_18px]">
          <div className="flex items-center justify-center gap-1 pt-4">
            <span className="label mr-2">{t("Vista del participante")}</span>
            {([["desktop", Monitor], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
              <button key={d} onClick={() => setDevice(d)} title={d === "desktop" ? t("Escritorio") : t("Móvil")}
                className={cx("focus-ring rounded-md p-1.5 transition", device === d ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink")}><Icon size={15} /></button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
            {current ? (
              <div className={cx("mx-auto transition-all", device === "mobile" ? "max-w-[390px]" : isWide(current) ? "max-w-4xl" : "max-w-2xl")}>
                <div style={brandStyle(settings) as CSSProperties}
                  className={cx("border border-line bg-paper shadow-xl shadow-ink/5", device === "mobile" ? "rounded-[2rem] px-5 py-10" : "rounded-2xl px-6 py-12 sm:px-12")}>
                  {settings.brand?.logo && <img src={settings.brand.logo} alt="" className="mx-auto mb-8 h-8 object-contain" />}
                  <BlockView key={current.id + device} block={current} preview settings={settings} value={previewValue[current.id]} onChange={(v) => setPreviewValue((s) => ({ ...s, [current.id]: v }))} />
                  <div className={cx("mt-8 flex", current.type === "welcome" ? "justify-center" : "justify-end")}>
                    {current.type !== "thank_you" && current.type !== "prototype_task" && <span className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-[15px] font-medium text-on-accent">{current.type === "welcome" ? current.buttonLabel : t("Siguiente")}</span>}
                  </div>
                </div>
                {issuesFor(current.id).length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {issuesFor(current.id).map((x) => (
                      <p key={x.message} className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]", x.level === "error" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
                        {x.level === "error" ? <CircleAlert size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}{x.message.replace(/^Bloque \d+ \([^)]+\): /, "")}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto mt-20 max-w-sm text-center">
                <p className="font-medium">{t("Tu estudio está vacío")}</p>
                <p className="mt-1 text-sm text-ink-3">{t("Agrega bloques para construir la experiencia del participante.")}</p>
                <Button className="mt-4" icon={<Plus size={15} />} onClick={() => setAdding(true)}>{t("Agregar bloque")}</Button>
              </div>
            )}
          </div>
        </section>
        {showRight && <PaneHandle {...rightPane.handleProps} className="hidden lg:block" label={t("Ancho del panel de propiedades")} />}

        {/* ── Propiedades ── */}
        {showRight && <aside className="hidden shrink-0 flex-col border-l border-line bg-surface lg:flex" style={{ width: rightPane.width }}>
          {current ? (
            <>
              <div className="flex shrink-0 border-b border-line px-2">
                {([["content", t("Contenido")], ["logic", t("Lógica")]] as const).map(([id, l]) => (
                  <button key={id} onClick={() => setPanel(id)} disabled={id === "logic" && current.type === "thank_you"}
                    className={cx("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition disabled:opacity-30",
                      panel === id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}>
                    {id === "logic" && <GitBranch size={13} />}{l}{id === "logic" && current.logic && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <p className="label mb-4 flex items-center gap-1.5">{blockDef(current.type)?.icon} {blockDef(current.type)?.label}</p>
                {panel === "content" || current.type === "thank_you"
                  ? <BlockEditor key={current.id} block={current} ctx={protoCtx} onChange={(p) => patch(current.id, p)} />
                  : <LogicEditor key={current.id} block={current} blocks={blocks} onChange={(logic) => patch(current.id, { logic })} />}
              </div>
            </>
          ) : <p className="p-5 text-sm text-ink-3">{t("Selecciona un bloque para editarlo.")}</p>}
        </aside>}
      </div>

      <AddBlockPanel open={adding} onClose={() => setAdding(false)} onPick={(t) => insert(blockDef(t)!.create())} />
      {protoEditor && (
        <PrototypeEditor prototypes={prototypes} initialId={protoEditor.id} onClose={() => setProtoEditor(null)}
          onChange={(ps) => setSettings((s) => ({ ...s, prototypes: ps }))} />
      )}
      <DesignModal open={designOpen} onClose={() => setDesignOpen(false)} settings={settings} onChange={setSettings} />
      <ChecklistModal open={checkOpen} onClose={() => setCheckOpen(false)} issues={issues} blocks={blocks}
        onGo={(id) => { setSelected(id); setPanel("content"); setCheckOpen(false); }} onPublish={() => (study.status === "live" ? publishChanges() : setStatus("live"))} errors={errorsCount} />
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={t("Tu estudio está activo 🎉")}>
        <ShareLink url={studyUrl(study.public_slug)} />
        <p className="mt-3 text-sm text-ink-3">{t("Envía este link a tus participantes, no necesitan crear cuenta. Tip: agrega parámetros para identificar el origen, por ejemplo")} <code className="rounded bg-paper px-1">{t("?source=linkedin")}</code>.</p>
      </Modal>
    </div>
  );
}

/** Panel anclado sobre el botón "Agregar bloque". No bloquea la página: lista, vista previa y propiedades siguen disponibles. */
function AddBlockPanel({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (type: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  const list = BLOCKS.filter((d) => !q || `${d.label} ${d.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div role="dialog" aria-label={t("Agregar bloque")} className="fixed bottom-14 left-3 z-40 flex max-h-[min(70vh,640px)] w-[min(420px,calc(100vw-1.5rem))] flex-col rounded-xl border border-line bg-surface shadow-(--shadow-lift)">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold">{t("Agregar bloque")}</h2>
        <button type="button" onClick={onClose} className="focus-ring rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={t("Cerrar")}><X size={18} /></button>
      </div>
      <div className="relative shrink-0 px-4 pt-3">
        <Search size={15} className="absolute top-1/2 left-7 mt-1.5 -translate-y-1/2 text-ink-3" />
        <input autoFocus className="field pl-9" placeholder={t("Buscar: escala, card sorting, imagen…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {BLOCK_GROUPS.map((g) => {
          const items = list.filter((d) => d.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <p className="label mb-2">{t(g)}</p>
              <div className="grid gap-2">
                {items.map((d) => (
                  <button key={d.type} onClick={() => { onPick(d.type); setQ(""); }} className="focus-ring flex items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{d.icon}</span>
                    <span><span className="block text-sm font-medium">{d.label}</span><span className="block text-xs text-ink-3">{d.description}</span></span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!list.length && <p className="py-6 text-center text-sm text-ink-3">{t("Ningún bloque coincide.")}</p>}
      </div>
    </div>
  );
}

function DesignModal({ open, onClose, settings, onChange }: { open: boolean; onClose: () => void; settings: StudySettings; onChange: (s: StudySettings) => void }) {
  const s = settings;
  const brand = s.brand ?? {};
  return (
    <Modal open={open} onClose={onClose} title={t("Diseño y experiencia del participante")} wide>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-5">
          <Field group label={t("Idioma del estudio")} hint={t("Idioma de los botones e instrucciones que ven los participantes, y de los bloques nuevos.")}>
            <Segmented value={s.language ?? getLang()} onChange={(language) => onChange({ ...s, language })} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} />
          </Field>
          <Field group label={t("Color de marca")} hint={t("Se aplica a botones, selección y barra de progreso.")}>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => onChange({ ...s, brand: { ...brand, color: c } })} aria-label={c}
                  className={cx("h-7 w-7 rounded-lg transition", (brand.color ?? "#5902A1") === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />
              ))}
              <input type="color" value={brand.color ?? "#5902A1"} onChange={(e) => onChange({ ...s, brand: { ...brand, color: e.target.value } })} className="h-7 w-9 cursor-pointer rounded border border-line" title={t("Color personalizado")} />
            </div>
          </Field>
          <Field group label={t("Logo")} hint={t("Aparece arriba en cada pantalla. PNG con fondo transparente funciona mejor.")}>
            <ImageDrop compact value={brand.logo} onChange={(logo) => onChange({ ...s, brand: { ...brand, logo } })} label={t("Subir logo")} />
          </Field>
        </div>
        <div className="space-y-1">
          <Toggle label={t("Mostrar barra de progreso")} checked={s.showProgress !== false} onChange={(v) => onChange({ ...s, showProgress: v })} />
          <Toggle label={t("Permitir botón \"Atrás\"")} hint={t("Desactívalo si no quieres que cambien respuestas")} checked={s.allowBack !== false} onChange={(v) => onChange({ ...s, allowBack: v })} />
          <Toggle label={t("Ocultar créditos de redekorate")} checked={!!s.hideCredit} onChange={(v) => onChange({ ...s, hideCredit: v })} />
          <div className="border-t border-line pt-2">
            <Toggle label={t("Pedir consentimiento informado")} hint={t("Recomendado si recolectas datos personales")} checked={!!s.consent?.enabled}
              onChange={(v) => onChange({ ...s, consent: { enabled: v, text: s.consent?.text || defaultConsent() } })} />
            {s.consent?.enabled && (
              <textarea className="field mt-2 min-h-36 text-[13px]" value={s.consent.text} onChange={(e) => onChange({ ...s, consent: { enabled: true, text: e.target.value } })} />
            )}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end"><Button variant="primary" onClick={onClose}>{t("Listo")}</Button></div>
    </Modal>
  );
}

function ChecklistModal({ open, onClose, issues, blocks, onGo, onPublish, errors }: {
  open: boolean; onClose: () => void; issues: Issue[]; blocks: Block[]; onGo: (id: string) => void; onPublish: () => void; errors: number;
}) {
  const questions = blocks.filter((b) => !isStructural(b)).length;
  const minutes = Math.max(1, Math.round(blocks.reduce((t, b) => t + ({ card_sort: 240, sus: 90, tree_test: 45, preference: 40, matrix: 40, ranking: 30 } as Record<string, number>)[b.type] || (isStructural(b) ? 8 : 20), 0) / 60));
  return (
    <Modal open={open} onClose={onClose} title={t("Revisión antes de publicar")} wide>
      <div className="mb-5 grid grid-cols-3 gap-3 text-center">
        {[[t("Bloques"), blocks.length], [t("Preguntas / tareas"), questions], [t("Duración estimada"), `~${minutes} min`]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-paper p-3"><p className="text-xl font-semibold tabular-nums">{v}</p><p className="text-xs text-ink-3">{l}</p></div>
        ))}
      </div>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-good-soft p-4 text-sm text-good"><Check size={16} /> {t("Todo se ve bien. Tu estudio está listo para recibir participantes.")}</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {issues.map((x, i) => (
            <li key={i} className={cx("flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-[13px]", x.level === "error" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
              <span className="flex items-start gap-2">{x.level === "error" ? <CircleAlert size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}{x.message}</span>
              {x.blockId && <button onClick={() => onGo(x.blockId!)} className="shrink-0 font-medium underline underline-offset-2">{t("Ir")}</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-3">{t("Consejo: usa")} <b>{t("Probar")}</b> {t("para recorrer el estudio como participante antes de enviarlo.")}</p>
      <div className="mt-5 flex items-center justify-end gap-2">
        {errors > 0 && <span className="mr-auto text-[13px] text-bad">{t("Corrige")} {errors} {errors === 1 ? t("error") : t("errores")} {t("para publicar")}</span>}
        <Button variant="ghost" onClick={onClose}>{t("Seguir editando")}</Button>
        <Button variant="primary" icon={<Rocket size={15} />} disabled={errors > 0} onClick={onPublish}>{issues.length ? t("Publicar de todas formas") : t("Publicar")}</Button>
      </div>
    </Modal>
  );
}

export function ShareLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly className="field font-mono text-[13px]" value={url} onFocus={(e) => e.target.select()} />
      <Button variant="primary" icon={done ? <Check size={15} /> : <Copy size={15} />} onClick={async () => { if (await copy(url)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
        {done ? t("Copiado") : t("Copiar")}
      </Button>
    </div>
  );
}
