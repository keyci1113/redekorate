import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, Code2, FileCode2, ImagePlus, Loader2, Monitor, MousePointer2, Play, Plus, RotateCw, Smartphone, SquareDashedMousePointer, Trash2, Upload, X,
} from "lucide-react";
import { api } from "../lib/api";
import { uid } from "../lib/hooks";
import type { Hotspot, Prototype, Screen } from "../blocks/prototype";
import { HTML_SANDBOX, asTrackerMsg, htmlScreenId, isHtml, naturalSort } from "../blocks/prototype";
import { Button, cx } from "./ui";
import { Toggle, useSortable } from "./editing";

import { t } from "../lib/i18n";
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

export const newPrototype = (n: number): Prototype => ({ id: uid(), name: t("Prototipo {a}", { a: n }), device: "mobile", showHints: true, screens: [] });

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { res({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Editor a pantalla completa: pantallas + zonas clicables + modo probar. */
export function PrototypeEditor({ prototypes, onChange, initialId, onClose }: {
  prototypes: Prototype[]; onChange: (p: Prototype[]) => void; initialId?: string; onClose: () => void;
}) {
  const [protoId, setProtoId] = useState(initialId || prototypes[0]?.id || "");
  const proto = prototypes.find((p) => p.id === protoId) ?? prototypes[0];
  const [screenId, setScreenId] = useState(proto?.screens[0]?.id ?? "");
  const screen = proto?.screens.find((s) => s.id === screenId) ?? proto?.screens[0];
  const [hotId, setHotId] = useState<string | null>(null);
  const [play, setPlay] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const htmlInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !hotId) onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose, hotId]);

  if (!proto) {
    return (
      <Shell onClose={onClose}>
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Smartphone size={26} /></span>
            <h2 className="text-xl font-semibold">{t("Crea tu primer prototipo")}</h2>
            <p className="mt-2 text-sm text-ink-2">{t("Sube las pantallas de tu diseño y conecta las zonas clicables. Los participantes navegarán el prototipo y registraremos cada clic.")}</p>
            <Button variant="primary" className="mt-6" icon={<Plus size={16} />} onClick={() => { const p = newPrototype(1); onChange([p]); setProtoId(p.id); }}>{t("Nuevo prototipo")}</Button>
          </div>
        </div>
      </Shell>
    );
  }

  const setProto = (p: Partial<Prototype>) => onChange(prototypes.map((x) => (x.id === proto.id ? { ...x, ...p } : x)));
  const setScreens = (screens: Screen[]) => setProto({ screens });
  const setScreen = (id: string, p: Partial<Screen>) => setScreens(proto.screens.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removeScreen = (id: string) => {
    if (!confirm(t("¿Eliminar esta pantalla? Las zonas que llevaban a ella quedarán sin destino."))) return;
    const rest = proto.screens.filter((s) => s.id !== id);
    setScreens(rest); if (screenId === id) setScreenId(rest[0]?.id ?? "");
  };

  async function addFiles(list: FileList | File[]) {
    const files = [...list].filter((f) => ACCEPT.includes(f.type)).sort((a, b) => naturalSort(a.name, b.name));
    if (!files.length) { setErr(t("Usa imágenes PNG, JPG, GIF o WEBP.")); return; }
    setErr(null); setUploading({ done: 0, total: files.length });
    const added: Screen[] = [];
    for (const f of files) {
      try {
        const [url, size] = await Promise.all([api.upload(f), imageSize(f)]);
        added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || t("Pantalla"), image: url, ...size, hotspots: [] });
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
      setUploading((u) => u && { ...u, done: u.done + 1 });
    }
    setUploading(null);
    if (added.length) { setScreens([...proto.screens, ...added]); if (!screen) setScreenId(added[0].id); }
  }

  async function addHtml(f: File | undefined) {
    if (!f) return;
    if (!/\.html?$/i.test(f.name) && f.type !== "text/html") { setErr(t("Usa un archivo .html.")); return; }
    setErr(null); setUploading({ done: 0, total: 1 });
    try {
      const url = await api.uploadPrototype(f);
      const keep = proto.kind === "html";   // al reemplazar el archivo se conservan las pantallas detectadas
      setProto({ kind: "html", html: { url, file: f.name }, screens: keep ? proto.screens : [] });
      setPlay(false); setHotId(null);
    } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
    setUploading(null);
  }
  const html = isHtml(proto);

  const hot = screen?.hotspots.find((h) => h.id === hotId) ?? null;
  const setHot = (id: string, p: Partial<Hotspot>) => screen && setScreen(screen.id, { hotspots: screen.hotspots.map((h) => (h.id === id ? { ...h, ...p } : h)) });
  const removeHot = (id: string) => { if (!screen) return; setScreen(screen.id, { hotspots: screen.hotspots.filter((h) => h.id !== id) }); setHotId(null); };

  return (
    <Shell onClose={onClose}>
      {/* Barra superior */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <span className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} className="text-accent" /> {t("Prototipos")}</span>
        <select className="field h-8 w-48 py-0" value={proto.id} onChange={(e) => { setProtoId(e.target.value); const p = prototypes.find((x) => x.id === e.target.value); setScreenId(p?.screens[0]?.id ?? ""); setHotId(null); }}>
          {prototypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="field h-8 w-48 py-0" value={proto.name} onChange={(e) => setProto({ name: e.target.value })} aria-label={t("Nombre del prototipo")} />
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => { const p = newPrototype(prototypes.length + 1); onChange([...prototypes, p]); setProtoId(p.id); setScreenId(""); }}>{t("Nuevo")}</Button>
        <div className="ml-2 flex rounded-lg bg-paper p-0.5">
          {([["mobile", Smartphone, t("Móvil")], ["desktop", Monitor, t("Escritorio")]] as const).map(([d, Icon, l]) => (
            <button key={d} onClick={() => setProto({ device: d })} className={cx("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", proto.device === d ? "bg-surface shadow-sm" : "text-ink-3")}><Icon size={13} />{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!html && <Button size="sm" variant={play ? "primary" : "secondary"} icon={play ? <SquareDashedMousePointer size={14} /> : <Play size={14} />} onClick={() => { setPlay(!play); setHotId(null); }} disabled={!proto.screens.length}>
            {play ? t("Volver a editar") : t("Probar")}
          </Button>}
          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={onClose}>{t("Listo")}</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Pantallas */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-paper">
          <input ref={htmlInput} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { addHtml(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          {html ? (
            <HtmlFilePanel proto={proto} uploading={!!uploading} err={err} onReplace={() => htmlInput.current?.click()}
              onRemoveScreen={(id) => setScreens(proto.screens.filter((s) => s.id !== id))} />
          ) : !proto.screens.length ? (
            <p className="m-3 rounded-lg bg-surface p-3 text-xs text-ink-2">{t("Elige en el centro cómo quieres armar este prototipo.")}</p>
          ) : <>
          <div className="p-3">
            <button onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line-2 bg-surface px-3 py-4 text-center transition hover:border-accent hover:bg-accent-soft/40">
              {uploading ? <Loader2 size={18} className="animate-spin text-accent" /> : <Upload size={18} className="text-accent" />}
              <span className="text-[13px] font-medium">{uploading ? t("Subiendo {a}/{b}…", { a: uploading.done, b: uploading.total }) : t("Subir pantallas")}</span>
              <span className="text-[11px] text-ink-3">{t("Arrastra varias a la vez · el nombre del archivo será el de la pantalla")}</span>
            </button>
            {err && <p className="mt-2 text-xs text-bad">{err}</p>}
          </div>
          <p className="label px-4 pb-2">{t("Pantallas ·")} {proto.screens.length}</p>
          <ScreenList proto={proto} selected={screen?.id} onSelect={(id) => { setScreenId(id); setHotId(null); }} onReorder={setScreens} onRename={(id, name) => setScreen(id, { name })} onRemove={removeScreen} />
          </>}
        </aside>

        {/* Lienzo */}
        <section className="min-w-0 flex-1 overflow-auto bg-[radial-gradient(#E7E2F0_1px,transparent_1px)] [background-size:18px_18px] p-8">
          {html ? (
            <HtmlCanvas proto={proto} onScreen={(name) => {
              const id = htmlScreenId(name);
              if (!proto.screens.some((s) => s.id === id)) setScreens([...proto.screens, { id, name, image: "", hotspots: [] }]);
            }} />
          ) : !screen ? (
            <div className="mx-auto mt-10 max-w-3xl">
              <h2 className="text-center text-xl font-semibold">{t("¿Cómo quieres armar tu prototipo?")}</h2>
              <p className="mt-1 text-center text-sm text-ink-2">{t("Elige una de las dos opciones. Ambas registran rutas, clics y tiempos.")}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <OptionCard icon={<ImagePlus size={20} />} title={t("Pantallas exportadas")} tag={t("Figma, Sketch, XD…")}
                  onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                  steps={[t("En Figma, selecciona los frames del flujo y usa Export → PNG 2x."), t("Sube todas las imágenes a la vez."), t("Dibuja zonas clicables y elige a dónde lleva cada una.")]}
                  action={<Button variant="primary" className="w-full" disabled={!!uploading} icon={uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} onClick={() => fileInput.current?.click()}>
                    {uploading ? t("Subiendo {a}/{b}…", { a: uploading.done, b: uploading.total }) : t("Subir pantallas")}</Button>}
                  foot={t("También puedes arrastrar las imágenes aquí.")} />
                <OptionCard icon={<Code2 size={20} />} title={t("HTML de Claude")} tag={t("Prototipo interactivo")}
                  steps={[t("Pídele a Claude el prototipo como un solo archivo .html y descárgalo."), t("Súbelo aquí. No hay zonas que dibujar."), t("Navégalo para detectar las pantallas y elegir la meta.")]}
                  action={<Button variant="primary" className="w-full" disabled={!!uploading} icon={uploading ? <Loader2 size={15} className="animate-spin" /> : <FileCode2 size={15} />} onClick={() => htmlInput.current?.click()}>{t("Subir HTML")}</Button>}
                  foot={t("Con un link de Claude no se puede: claude.ai no deja mostrarlo en otros sitios.")} />
              </div>
              {err && <p className="mt-3 text-center text-sm text-bad">{err}</p>}
            </div>
          ) : play ? (
            <PlayMode proto={proto} startId={screen.id} />
          ) : (
            <div className="mx-auto" style={{ maxWidth: proto.device === "mobile" ? 400 : 1000 }}>
              <p className="mb-3 flex items-center justify-center gap-2 text-xs text-ink-3"><MousePointer2 size={13} /> {t("Arrastra sobre la imagen para crear una zona clicable · clic en una zona para editarla")}</p>
              <HotspotCanvas screen={screen} proto={proto} selected={hotId} onSelect={setHotId}
                onCreate={(h) => { setScreen(screen.id, { hotspots: [...screen.hotspots, h] }); setHotId(h.id); }}
                onUpdate={(id, p) => setHot(id, p)} />
            </div>
          )}
        </section>

        {/* Propiedades */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-5">
          {html ? (
            <HtmlHelp proto={proto} />
          ) : play ? (
            <div className="space-y-3 text-sm text-ink-2">
              <p className="font-semibold text-ink">{t("Modo probar")}</p>
              <p>{t("Navega como lo haría un participante. Si haces clic fuera de una zona,")} {proto.showHints ? t("se resaltarán las zonas clicables") : t("no pasará nada")}.</p>
              <Toggle label={t("Resaltar zonas al hacer clic fuera")} hint={t("Ayuda a no quedar atrapado, como en Figma")} checked={proto.showHints} onChange={(v) => setProto({ showHints: v })} />
            </div>
          ) : !screen ? (
            <p className="text-sm text-ink-3">{t("Sube pantallas para empezar.")}</p>
          ) : hot ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{t("Zona clicable")}</p>
                <button onClick={() => setHotId(null)} className="text-ink-3 hover:text-ink" aria-label={t("Cerrar")}><X size={16} /></button>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-2">{t("Al hacer clic, ir a…")}</p>
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
                  <button onClick={() => setHot(hot.id, { target: "back" })} className={cx("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm", hot.target === "back" ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
                    <ArrowLeft size={14} /> {t("Pantalla anterior (atrás)")}
                  </button>
                  {proto.screens.filter((s) => s.id !== screen.id).map((s) => (
                    <button key={s.id} onClick={() => setHot(hot.id, { target: s.id })}
                      className={cx("flex w-full items-center gap-3 rounded-lg border p-1.5 pr-3 text-left text-sm", hot.target === s.id ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
                      <img src={s.image} alt="" className="h-10 w-8 rounded border border-line bg-paper object-cover object-top" />
                      <span className="flex-1 truncate">{s.name}</span>
                      {hot.target === s.id && <Check size={14} className="text-accent" />}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={14} />} onClick={() => removeHot(hot.id)}>{t("Eliminar zona")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="label mb-1.5">{t("Pantalla")}</p>
                <input className="field font-medium" value={screen.name} onChange={(e) => setScreen(screen.id, { name: e.target.value })} />
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink-2">{t("Zonas clicables ·")} {screen.hotspots.length}</p>
                {screen.hotspots.length === 0 ? (
                  <p className="rounded-lg bg-paper p-3 text-xs text-ink-2">{t("Arrastra sobre la imagen para crear la primera zona (un botón, un ícono, un elemento de menú…).")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {screen.hotspots.map((h, i) => {
                      const dest = proto.screens.find((s) => s.id === h.target);
                      return (
                        <li key={h.id}>
                          <button onClick={() => setHotId(h.id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:border-accent">
                            <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[11px] font-semibold text-on-accent">{i + 1}</span>
                            <span className="flex-1 truncate">→ {h.target === "back" ? t("Atrás") : dest?.name ?? <span className="text-bad">{t("Sin destino")}</span>}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Toggle label={t("Resaltar zonas al hacer clic fuera")} checked={proto.showHints} onChange={(v) => setProto({ showHints: v })} />
              <div className="border-t border-line pt-3">
                <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" icon={<Trash2 size={14} />} onClick={() => {
                  if (!confirm(t("¿Eliminar el prototipo \"{a}\" completo?", { a: proto.name }))) return;
                  const rest = prototypes.filter((p) => p.id !== proto.id); onChange(rest); setProtoId(rest[0]?.id ?? ""); setScreenId(rest[0]?.screens[0]?.id ?? "");
                }}>{t("Eliminar prototipo")}</Button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label={t("Editor de prototipos")}>
      <button onClick={onClose} className="sr-only">{t("Cerrar")}</button>
      {children}
    </div>
  );
}

function ScreenList({ proto, selected, onSelect, onReorder, onRename, onRemove }: {
  proto: Prototype; selected?: string; onSelect: (id: string) => void; onReorder: (s: Screen[]) => void; onRename: (id: string, n: string) => void; onRemove: (id: string) => void;
}) {
  const { props, drag, over } = useSortable(proto.screens, onReorder);
  return (
    <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
      {proto.screens.map((s, i) => (
        <li key={s.id} {...props(i)} className={cx(drag === i && "opacity-40", over === i && drag !== i && "rounded-xl ring-2 ring-accent/40")}>
          <div onClick={() => onSelect(s.id)} className={cx("group flex cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition", selected === s.id ? "bg-surface shadow-sm ring-1 ring-accent/40" : "hover:bg-ink/[0.04]")}>
            <span className="w-4 text-right text-[11px] text-ink-3 tabular-nums">{i + 1}</span>
            <img src={s.image} alt="" className="h-14 w-11 shrink-0 rounded-md border border-line bg-surface object-cover object-top" />
            <span className="min-w-0 flex-1">
              <input value={s.name} onChange={(e) => onRename(s.id, e.target.value)} onClick={(e) => e.stopPropagation()}
                className="w-full truncate rounded border border-transparent bg-transparent px-1 text-[13px] font-medium outline-none focus:border-accent focus:bg-surface" />
              <span className="block px-1 text-[11px] text-ink-3">{s.hotspots.length} {s.hotspots.length === 1 ? "zona" : "zonas"}</span>
            </span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(s.id); }} className="rounded p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad" aria-label={t("Eliminar pantalla")}><Trash2 size={13} /></button>
          </div>
        </li>
      ))}
    </ol>
  );
}

type Rect = { x: number; y: number; w: number; h: number };
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Lienzo para dibujar, mover y redimensionar zonas clicables (coordenadas relativas 0–1). */
function HotspotCanvas({ screen, proto, selected, onSelect, onCreate, onUpdate }: {
  screen: Screen; proto: Prototype; selected: string | null; onSelect: (id: string | null) => void;
  onCreate: (h: Hotspot) => void; onUpdate: (id: string, p: Partial<Hotspot>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [op, setOp] = useState<null | { kind: "draw" | "move" | "resize"; id?: string; x0: number; y0: number; orig?: Rect; cur: Rect }>(null);
  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const down = (e: React.PointerEvent, kind: "draw" | "move" | "resize", h?: Hotspot) => {
    e.stopPropagation(); e.preventDefault();
    box.current!.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (h) onSelect(h.id);
    setOp({ kind, id: h?.id, x0: p.x, y0: p.y, orig: h && { x: h.x, y: h.y, w: h.w, h: h.h }, cur: h ? { x: h.x, y: h.y, w: h.w, h: h.h } : { x: p.x, y: p.y, w: 0, h: 0 } });
  };
  const move = (e: React.PointerEvent) => {
    if (!op) return;
    const p = pos(e), dx = p.x - op.x0, dy = p.y - op.y0;
    let cur: Rect;
    if (op.kind === "draw") cur = { x: Math.min(op.x0, p.x), y: Math.min(op.y0, p.y), w: Math.abs(dx), h: Math.abs(dy) };
    else if (op.kind === "move") cur = { ...op.orig!, x: clamp(Math.min(op.orig!.x + dx, 1 - op.orig!.w)), y: clamp(Math.min(op.orig!.y + dy, 1 - op.orig!.h)) };
    else cur = { ...op.orig!, w: Math.max(0.02, Math.min(op.orig!.w + dx, 1 - op.orig!.x)), h: Math.max(0.01, Math.min(op.orig!.h + dy, 1 - op.orig!.y)) };
    setOp({ ...op, cur });
  };
  const up = () => {
    if (!op) return;
    if (op.kind === "draw") {
      if (op.cur.w > 0.015 && op.cur.h > 0.006) {
        const fallback = proto.screens[proto.screens.findIndex((s) => s.id === screen.id) + 1]?.id ?? proto.screens.find((s) => s.id !== screen.id)?.id ?? "back";
        onCreate({ id: uid(), ...op.cur, target: fallback });
      } else onSelect(null);
    } else if (op.id) onUpdate(op.id, op.cur);
    setOp(null);
  };
  const rects = screen.hotspots.map((h) => (op?.id === h.id ? { ...h, ...op.cur } : h));
  const nameOf = (id: string) => (id === "back" ? t("← Atrás") : proto.screens.find((s) => s.id === id)?.name ?? t("Sin destino"));

  return (
    <div ref={box} onPointerDown={(e) => down(e, "draw")} onPointerMove={move} onPointerUp={up}
      className="relative cursor-crosshair touch-none overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-ink/5 select-none">
      <img src={screen.image} alt={screen.name} draggable={false} className="pointer-events-none block w-full" />
      {rects.map((h, i) => {
        const on = selected === h.id;
        const broken = h.target !== "back" && !proto.screens.some((s) => s.id === h.target);
        return (
          <div key={h.id} onPointerDown={(e) => down(e, "move", h)}
            className={cx("group absolute cursor-move rounded-md border-2 transition-colors", on ? "border-accent bg-accent/25" : broken ? "border-bad bg-bad/15" : "border-accent/80 bg-accent/12 hover:bg-accent/20")}
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}>
            <span className={cx("pointer-events-none absolute -top-6 left-0 max-w-[220px] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-on-accent shadow", broken ? "bg-bad" : "bg-accent")}>
              {i + 1} → {nameOf(h.target)}
            </span>
            {on && <span onPointerDown={(e) => down(e, "resize", h)} className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-se-resize rounded-sm border-2 border-white bg-accent shadow" />}
          </div>
        );
      })}
      {op?.kind === "draw" && op.cur.w > 0 && (
        <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-accent bg-accent/15"
          style={{ left: `${op.cur.x * 100}%`, top: `${op.cur.y * 100}%`, width: `${op.cur.w * 100}%`, height: `${op.cur.h * 100}%` }} />
      )}
    </div>
  );
}

function PlayMode({ proto, startId }: { proto: Prototype; startId: string }) {
  const [hist, setHist] = useState([startId]);
  const [flash, setFlash] = useState(false);
  const cur = proto.screens.find((s) => s.id === hist[hist.length - 1]);
  if (!cur) return null;
  return (
    <div className="mx-auto" style={{ maxWidth: proto.device === "mobile" ? 400 : 1000 }}>
      <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
        <span>{cur.name}</span>
        <button onClick={() => setHist([startId])} className="font-medium text-accent">{t("Reiniciar")}</button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-xl" onClick={() => { if (proto.showHints) { setFlash(true); setTimeout(() => setFlash(false), 600); } }}>
        <img src={cur.image} alt="" className="block w-full" draggable={false} />
        {cur.hotspots.map((h) => (
          <button key={h.id} onClick={(e) => { e.stopPropagation(); setHist(h.target === "back" ? (hist.length > 1 ? hist.slice(0, -1) : hist) : [...hist, h.target]); }}
            className={cx("absolute rounded-md transition", flash ? "bg-accent/30 ring-2 ring-accent" : "")}
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }} aria-label={t("Zona clicable")} />
        ))}
      </div>
    </div>
  );
}

/** Prototipo HTML: archivo actual y pantallas detectadas al navegarlo. */
function HtmlFilePanel({ proto, uploading, err, onReplace, onRemoveScreen }: {
  proto: Prototype; uploading: boolean; err: string | null; onReplace: () => void; onRemoveScreen: (id: string) => void;
}) {
  return <>
    <div className="p-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium"><FileCode2 size={15} className="shrink-0 text-accent" /><span className="truncate" title={proto.html?.file}>{proto.html?.file}</span></p>
        <Button size="sm" variant="ghost" className="mt-2 w-full" icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} disabled={uploading} onClick={onReplace}>{t("Reemplazar archivo")}</Button>
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </div>
    <p className="label px-4 pb-2">{t("Pantallas detectadas ·")} {proto.screens.length}</p>
    {proto.screens.length === 0 ? (
      <p className="mx-3 rounded-lg bg-surface p-3 text-xs text-ink-2">{t("Navega el prototipo en el centro: cada pantalla que visites aparecerá aquí para que puedas elegirla como meta de una tarea.")}</p>
    ) : (
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {proto.screens.map((s, i) => (
          <li key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink/[0.04]">
            <span className="w-4 text-right text-[11px] text-ink-3 tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={s.name}>{s.name}</span>
            <button onClick={() => onRemoveScreen(s.id)} className="rounded p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad" aria-label={t("Quitar pantalla")}><Trash2 size={13} /></button>
          </li>
        ))}
      </ol>
    )}
  </>;
}

/** El HTML corre en un iframe aislado; el script inyectado nos dice en qué pantalla está. */
function HtmlCanvas({ proto, onScreen }: { proto: Prototype; onScreen: (name: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);
  const [cur, setCur] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef(onScreen); cb.current = onScreen;
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = asTrackerMsg(e.data); if (!m) return;
      if (m.type === "ready") setReady(true);
      if (m.type === "screen" && typeof m.name === "string" && m.name) { const n = m.name.slice(0, 80); setCur(n); cb.current(n); }
    };
    window.addEventListener("message", h); return () => window.removeEventListener("message", h);
  }, []);
  const mobile = proto.device === "mobile";
  return (
    <div className="mx-auto" style={{ maxWidth: mobile ? 400 : 1100 }}>
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-ink-3">
        <span className="truncate">{cur ? <>{t("Pantalla actual:")} <b className="text-ink">{cur}</b></> : t("Cargando prototipo…")}</span>
        <button onClick={() => { setKey((k) => k + 1); setCur(null); setReady(false); }} className="flex shrink-0 items-center gap-1 font-medium text-accent"><RotateCw size={12} /> {t("Reiniciar")}</button>
      </div>
      <div className={cx("overflow-hidden bg-white shadow-xl", mobile ? "mx-auto rounded-[2rem] ring-8 ring-black" : "rounded-xl border border-line")}
        style={mobile ? { width: 390, height: 844, maxWidth: "100%" } : { aspectRatio: "16 / 10" }}>
        {proto.html && <iframe key={key} ref={frame} src={proto.html.url} sandbox={HTML_SANDBOX} title={proto.name} className="block h-full w-full border-0" referrerPolicy="no-referrer" />}
      </div>
      {!ready && cur === null && <p className="mt-3 text-center text-xs text-ink-3">{t("Si el prototipo no carga, revisa que sea un archivo HTML completo (no un componente .jsx).")}</p>}
    </div>
  );
}

const CLAUDE_PROMPT = "Agrega el atributo data-screen=\"Nombre de la pantalla\" al contenedor principal de cada pantalla o vista de este prototipo (por ejemplo data-screen=\"Carrito\"), con nombres cortos y únicos. Entrégamelo como un solo archivo .html que funcione sin servidor.";

function HtmlHelp({ proto }: { proto: Prototype }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 text-sm text-ink-2">
      <p className="font-semibold text-ink">{t("Prototipo HTML")}</p>
      <p>{t("Navégalo en el centro como lo haría un participante. No hace falta dibujar zonas: se registra cada clic y si cayó en un elemento interactivo.")}</p>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink">{t("Cómo se detectan las pantallas")}</p>
        <ol className="list-decimal space-y-1 pl-5 text-[13px]">
          <li>{t("El atributo")} <code className="rounded bg-paper px-1 text-[12px]">data-screen</code> {t("(lo más preciso).")}</li>
          <li>{t("El # de la URL, si el prototipo lo usa.")}</li>
          <li>{t("El título")} <code className="rounded bg-paper px-1 text-[12px]">&lt;h1&gt;</code> {t("visible.")}</li>
        </ol>
      </div>
      <div className="rounded-xl bg-paper p-3">
        <p className="text-[13px] font-medium text-ink">{t("¿Los nombres no son claros?")}</p>
        <p className="mt-1 text-[12px]">{t("Pídele esto a Claude y vuelve a subir el archivo:")}</p>
        <p className="mt-2 rounded-lg bg-surface p-2 text-[12px] leading-relaxed ring-1 ring-line">{t(CLAUDE_PROMPT)}</p>
        <Button size="sm" variant="ghost" className="mt-2" icon={copied ? <Check size={14} /> : undefined}
          onClick={() => { navigator.clipboard?.writeText(t(CLAUDE_PROMPT)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {}); }}>
          {copied ? t("Copiado") : t("Copiar instrucción")}
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">{t("Cada pantalla que visites aparece a la izquierda. Después, en la tarea, eliges cuál es la meta. Si no eliges ninguna, el participante indicará cuándo terminó.")}</p>
    </div>
  );
}

function OptionCard({ icon, title, tag, steps, action, foot, onDrop }: {
  icon: React.ReactNode; title: string; tag: string; steps: string[]; action: React.ReactNode; foot: string; onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div onDragOver={onDrop && ((e) => e.preventDefault())} onDrop={onDrop}
      className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-ink-3">{tag}</p>
        </div>
      </div>
      <ol className="mt-4 flex-1 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
        {steps.map((x) => <li key={x}>{x}</li>)}
      </ol>
      <div className="mt-5">{action}</div>
      <p className="mt-2 min-h-[2.2rem] text-center text-[11px] text-ink-3">{foot}</p>
    </div>
  );
}
