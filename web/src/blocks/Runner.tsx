import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, CornerDownLeft, GripVertical, Maximize2, Plus, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import type {
  Block, CardSortBlock, CardSortValue, ChoiceBlock, ChoiceValue, FirstClickBlock, FirstClickValue, FiveSecondBlock,
  MatrixBlock, Option, PreferenceBlock, PreferenceValue, RankingBlock, TreeNode, TreeTestBlock, TreeTestValue,
} from "./types";
import { parseTree } from "./types";
import { SUS_ITEMS } from "./registry";
import { cx } from "../components/ui";
import { uid } from "../lib/hooks";
import { PrototypeTaskView } from "./PrototypeRunner";
import { KanoRunner, kanoAnswered } from "./KanoViews";
import type { KanoValue } from "./kano";
import type { PrototypeTaskValue } from "./prototype";
import type { StudySettings } from "../lib/settings";

import { t } from "../lib/i18n";
export interface BlockViewProps {
  block: Block; value: unknown; onChange: (v: unknown) => void;
  /** avanza automáticamente (five second, first click) con el valor dado */
  onAdvance?: (v: unknown) => void;
  preview?: boolean;
  settings?: StudySettings;
}

const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function isAnswered(block: Block, value: unknown): boolean {
  switch (block.type) {
    case "open_question": return typeof value === "string" && value.trim().length > 0;
    case "choice": {
      const v = value as ChoiceValue | undefined;
      if (!v) return false;
      return v.selected.length > 0 && (v.selected.includes("__other") ? !!v.other?.trim() : true);
    }
    case "yes_no": return value === "yes" || value === "no";
    case "scale": case "nps": return typeof value === "number";
    case "sus": return Array.isArray(value) && value.length === 10 && value.every((x) => typeof x === "number");
    case "ranking": return Array.isArray(value) && value.length === block.items.length;
    case "matrix": return !!value && block.rows.every((r) => (value as Record<string, string>)[r.id]);
    case "card_sort": {
      const v = value as CardSortValue | undefined;
      if (!v) return false;
      const placed = v.groups.reduce((n, g) => n + g.cardIds.length, 0);
      const named = v.groups.every((g) => !g.cardIds.length || g.name.trim());
      return named && (block.requireAll ? placed === block.cards.length : placed > 0);
    }
    case "tree_test": return !!(value as TreeTestValue | undefined)?.selected;
    case "preference": {
      const v = value as PreferenceValue | undefined;
      return !!v?.choice && (!block.askWhy || !block.required || !!v.why?.trim());
    }
    case "five_second": return !!(value as { seen?: boolean } | undefined)?.seen;
    case "first_click": return !!value;
    case "prototype_task": return !!(value as PrototypeTaskValue | undefined)?.outcome;
    case "kano": return kanoAnswered(block, value as KanoValue | undefined);
    default: return true;
  }
}

/** Bloques que ocupan más ancho en pantalla */
export const isWide = (b: Block) => ["sus", "card_sort", "preference", "matrix", "first_click", "five_second", "prototype_task", "kano"].includes(b.type);

export function BlockView({ block, value, onChange, onAdvance, preview, settings }: BlockViewProps) {
  const big = block.type === "welcome" || block.type === "thank_you";
  const ownImage = block.type === "first_click" || block.type === "five_second" || block.type === "prototype_task";
  return (
    <div className="w-full">
      {big ? (
        <div className="text-center">
          {block.image?.url && <img src={block.image.url} alt={block.image.alt ?? ""} className="mx-auto mb-8 max-h-56 rounded-xl object-contain" />}
          <h1 className="display text-4xl leading-tight sm:text-5xl">{block.title}</h1>
          {block.description && <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{block.description}</p>}
        </div>
      ) : (
        <div className="mb-7">
          <h2 className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
            {block.title}{block.required && block.type !== "context" && block.type !== "five_second" && <span className="ml-1 text-accent">*</span>}
          </h2>
          {block.description && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{block.description}</p>}
          {block.image?.url && !ownImage && <img src={block.image.url} alt={block.image.alt ?? ""} className="mt-5 max-h-96 w-full rounded-xl border border-line bg-surface object-contain" />}
        </div>
      )}

      {block.type === "open_question" && (block.multiline
        ? <textarea autoFocus className="field min-h-36 text-[15px]" placeholder={block.placeholder} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={5000} />
        : <input autoFocus className="field h-12 text-[15px]" placeholder={block.placeholder} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={500} />)}
      {block.type === "choice" && <ChoiceView block={block} value={value as ChoiceValue | undefined} onChange={onChange} />}
      {block.type === "yes_no" && (
        <div className="grid grid-cols-2 gap-3">
          {(["yes", "no"] as const).map((k) => (
            <button key={k} type="button" onClick={() => onChange(k)}
              className={cx("focus-ring flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border text-[15px] font-medium transition",
                value === k ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface hover:border-line-2")}>
              {k === "yes" ? <ThumbsUp size={26} className={value === k ? "text-accent" : "text-ink-3"} /> : <ThumbsDown size={26} className={value === k ? "text-accent" : "text-ink-3"} />}
              {k === "yes" ? block.yesLabel : block.noLabel}
            </button>
          ))}
        </div>
      )}
      {block.type === "scale" && <ScaleView min={block.style === "emoji" ? 1 : block.min} max={block.style === "emoji" ? 5 : block.max} minLabel={block.minLabel} maxLabel={block.maxLabel} style={block.style} value={value as number | undefined} onChange={onChange} />}
      {block.type === "nps" && <ScaleView min={0} max={10} minLabel={t("Nada probable")} maxLabel={t("Muy probable")} style="numbers" value={value as number | undefined} onChange={onChange} />}
      {block.type === "sus" && <SusView product={block.product} value={(value as (number | null)[]) ?? []} onChange={onChange} />}
      {block.type === "ranking" && <RankingView block={block} value={value as string[] | undefined} onChange={onChange} />}
      {block.type === "matrix" && <MatrixView block={block} value={(value as Record<string, string>) ?? {}} onChange={onChange} />}
      {block.type === "card_sort" && <CardSortView block={block} value={value as CardSortValue | undefined} onChange={onChange} />}
      {block.type === "tree_test" && <TreeView block={block} value={value as TreeTestValue | undefined} onChange={onChange} />}
      {block.type === "preference" && <PreferenceView block={block} value={value as PreferenceValue | undefined} onChange={onChange} />}
      {block.type === "five_second" && <FiveSecondView block={block} preview={preview} onDone={() => { onChange({ seen: true }); onAdvance?.({ seen: true }); }} />}
      {block.type === "kano" && <KanoRunner block={block} value={value as KanoValue | undefined} onChange={onChange} />}
      {block.type === "prototype_task" && <PrototypeTaskView block={block} proto={settings?.prototypes?.find((p) => p.id === block.prototypeId)}
        value={value as PrototypeTaskValue | undefined} onChange={onChange} onAdvance={onAdvance} preview={preview} />}
      {block.type === "first_click" && <FirstClickView block={block} value={value as FirstClickValue | undefined} preview={preview}
        onClick={(v) => { onChange(v); if (!preview) setTimeout(() => onAdvance?.(v), 650); }} />}
    </div>
  );
}

// ── Opción múltiple ─────────────────────────────────────────────
function ChoiceView({ block, value, onChange }: { block: ChoiceBlock; value?: ChoiceValue; onChange: (v: unknown) => void }) {
  const selected = value?.selected ?? [];
  const options = useMemo(() => {
    const list = block.randomize ? shuffle(block.options) : [...block.options];
    if (block.allowOther) list.push({ id: "__other", label: t("Otro") });
    return list;
  }, [block.options, block.randomize, block.allowOther]);
  const toggle = (id: string) => {
    const next = block.multiple ? (selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]) : [id];
    onChange({ selected: next, other: value?.other });
  };
  return (
    <div className="space-y-2">
      {block.multiple && <p className="label mb-3">{t("Puedes elegir varias")}</p>}
      {options.map((o, i) => {
        const on = selected.includes(o.id);
        return (
          <div key={o.id}>
            <button type="button" onClick={() => toggle(o.id)}
              className={cx("focus-ring flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition",
                on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface hover:border-line-2")}>
              <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center border transition", block.multiple ? "rounded-md" : "rounded-full",
                on ? "border-accent bg-accent text-white" : "border-line-2")}>{on && <Check size={13} strokeWidth={3} />}</span>
              <span className="flex-1">{o.label || t("Opción {a}", { a: i + 1 })}</span>
            </button>
            {o.id === "__other" && on && <input autoFocus className="field mt-2" placeholder={t("Especifica…")} maxLength={300} value={value?.other ?? ""} onChange={(e) => onChange({ selected, other: e.target.value })} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Escala ──────────────────────────────────────────────────────
const EMOJI = ["😞", "🙁", "😐", "🙂", "😄"];
function ScaleView({ min, max, minLabel, maxLabel, style, value, onChange }: {
  min: number; max: number; minLabel: string; maxLabel: string; style: "numbers" | "stars" | "emoji"; value?: number; onChange: (v: number) => void;
}) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className={cx("flex", style === "numbers" ? "gap-1.5" : "justify-center gap-2")}>
        {nums.map((n) => style === "stars" ? (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n}`} className="focus-ring rounded-md p-1 transition hover:scale-110">
            <Star size={38} strokeWidth={1.5} className={cx(value !== undefined && n <= value ? "fill-warn text-warn" : "text-line-2")} />
          </button>
        ) : style === "emoji" ? (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n}`}
            className={cx("focus-ring flex h-16 w-16 items-center justify-center rounded-2xl text-4xl transition hover:scale-110", value === n ? "bg-accent-soft ring-2 ring-accent" : value !== undefined ? "opacity-40 grayscale" : "")}>
            {EMOJI[n - 1]}
          </button>
        ) : (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={cx("focus-ring h-12 min-w-0 flex-1 rounded-lg border text-[15px] font-medium tabular-nums transition",
              value === n ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-line-2")}>{n}</button>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between text-[13px] text-ink-3"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}

// ── SUS ─────────────────────────────────────────────────────────
const SUS_LABELS = () => [t("Totalmente en desacuerdo"), t("En desacuerdo"), t("Neutral"), t("De acuerdo"), t("Totalmente de acuerdo")];
function SusView({ product, value, onChange }: { product: string; value: (number | null)[]; onChange: (v: unknown) => void }) {
  const set = (i: number, n: number) => { const next = Array.from({ length: 10 }, (_, k) => value[k] ?? null); next[i] = n; onChange(next); };
  return (
    <div className="space-y-3">
      {SUS_ITEMS.map((item, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-3 text-[15px]"><span className="mr-2 text-ink-3 tabular-nums">{i + 1}.</span>{t(item).replace("{p}", product)}</p>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => set(i, n)} title={SUS_LABELS()[n - 1]}
                className={cx("focus-ring h-10 rounded-lg border text-sm font-medium transition", value[i] === n ? "border-accent bg-accent text-white" : "border-line hover:border-line-2")}>{n}</button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-ink-3"><span>{SUS_LABELS()[0]}</span><span>{SUS_LABELS()[4]}</span></div>
        </div>
      ))}
    </div>
  );
}

// ── Ranking ─────────────────────────────────────────────────────
function RankingView({ block, value, onChange }: { block: RankingBlock; value?: string[]; onChange: (v: unknown) => void }) {
  const initial = useMemo(() => (block.randomize ? shuffle(block.items) : block.items).map((i) => i.id), [block.items, block.randomize]);
  const order = value && value.length === block.items.length ? value : initial;
  useEffect(() => { if (!value || value.length !== block.items.length) onChange(initial); /* eslint-disable-next-line */ }, [initial]);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => { if (to < 0 || to >= order.length) return; const n = [...order]; const [m] = n.splice(from, 1); n.splice(to, 0, m); onChange(n); };
  const label = (id: string) => block.items.find((i) => i.id === id)?.label ?? "";
  return (
    <div>
      <p className="label mb-3">{t("Arrastra o usa las flechas · 1 = más importante")}</p>
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }} onDragEnd={() => setDrag(null)}
            className={cx("flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition", drag === i && "border-accent shadow-lg")}>
            <GripVertical size={16} className="cursor-grab text-ink-3" />
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-semibold text-accent-ink tabular-nums">{i + 1}</span>
            <span className="flex-1 text-[15px]">{label(id)}</span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="focus-ring rounded-md p-1.5 text-ink-3 hover:bg-ink/5 disabled:opacity-30" aria-label={t("Subir")}><ArrowUp size={15} /></button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="focus-ring rounded-md p-1.5 text-ink-3 hover:bg-ink/5 disabled:opacity-30" aria-label={t("Bajar")}><ArrowDown size={15} /></button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Matriz ──────────────────────────────────────────────────────
function MatrixView({ block, value, onChange }: { block: MatrixBlock; value: Record<string, string>; onChange: (v: unknown) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="p-3" />
            {block.columns.map((c) => <th key={c.id} className="p-2 text-center text-xs font-medium text-ink-2">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={r.id} className={cx(i > 0 && "border-t border-line", value[r.id] && "bg-accent-soft/30")}>
              <td className="min-w-40 p-3 text-[15px]">{r.label}</td>
              {block.columns.map((c) => (
                <td key={c.id} className="p-2 text-center">
                  <button type="button" onClick={() => onChange({ ...value, [r.id]: c.id })} aria-label={`${r.label}: ${c.label}`}
                    className={cx("focus-ring mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 transition", value[r.id] === c.id ? "border-accent bg-accent" : "border-line-2 hover:border-accent")}>
                    {value[r.id] === c.id && <span className="h-2 w-2 rounded-full bg-white" />}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Card sorting ────────────────────────────────────────────────
function CardSortView({ block, value, onChange }: { block: CardSortBlock; value?: CardSortValue; onChange: (v: unknown) => void }) {
  const deck = useMemo(() => (block.randomize ? shuffle(block.cards) : block.cards), [block.cards, block.randomize]);
  const groups = value?.groups ?? (block.mode === "open" ? [] : block.categories.map((c) => ({ id: c.id, name: c.label, cardIds: [], custom: false })));
  const placed = new Set(groups.flatMap((g) => g.cardIds));
  const pool = deck.filter((c) => !placed.has(c.id));
  const [picked, setPicked] = useState<string | null>(null);   // selección por toque (móvil)
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const canCreate = block.mode !== "closed";
  const card = (id: string) => block.cards.find((c) => c.id === id);

  const commit = (gs: typeof groups) => onChange({ groups: gs });
  const place = (cardId: string, groupId: string | null) => {
    let gs = groups.map((g) => ({ ...g, cardIds: g.cardIds.filter((c) => c !== cardId) }));
    if (groupId === "__new") { gs = [...gs, { id: uid(), name: "", cardIds: [cardId], custom: true }]; }
    else if (groupId) gs = gs.map((g) => (g.id === groupId ? { ...g, cardIds: [...g.cardIds, cardId] } : g));
    // Los grupos creados por el participante que quedan vacíos se eliminan
    commit(gs.filter((g) => !g.custom || g.cardIds.length));
    setPicked(null);
  };
  const drop = (groupId: string | null) => (e: React.DragEvent) => { e.preventDefault(); setOverGroup(null); const id = e.dataTransfer.getData("text/card"); if (id) place(id, groupId); };
  const over = (gid: string) => (e: React.DragEvent) => { e.preventDefault(); setOverGroup(gid); };

  const Card = ({ o, inGroup }: { o: Option; inGroup?: boolean }) => (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/card", o.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => setPicked(picked === o.id ? null : o.id)}
      className={cx("group flex cursor-grab items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-[14px] shadow-sm transition select-none active:cursor-grabbing",
        picked === o.id ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-2 hover:shadow")}>
      <GripVertical size={13} className="shrink-0 text-ink-3/60" />
      <span className="flex-1">{o.label}</span>
      {inGroup && <button type="button" onClick={(e) => { e.stopPropagation(); place(o.id, null); }} className="rounded p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad" aria-label={t("Quitar")}><X size={13} /></button>}
    </div>
  );

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(200px,260px)_1fr]">
      <div onDragOver={over("__pool")} onDrop={drop(null)}
        className={cx("rounded-2xl border border-dashed p-3 transition md:sticky md:top-4 md:self-start", overGroup === "__pool" ? "border-accent bg-accent-soft/40" : "border-line-2 bg-paper/60")}>
        <p className="mb-2 text-xs text-ink-3">{t("Arrastra una tarjeta a un grupo, o tócala y luego toca el grupo.")}</p>
        <p className="label mb-2 flex justify-between"><span>{t("Tarjetas")}</span><span className="tabular-nums">{pool.length} / {block.cards.length}</span></p>
        <div className="space-y-1.5">
          {pool.map((o) => <Card key={o.id} o={o} />)}
          {pool.length === 0 && <p className="py-6 text-center text-sm text-good">{t("¡Ordenaste todas las tarjetas! ✓")}</p>}
        </div>
        {picked && <p className="mt-3 text-xs text-accent-ink">{t("Ahora toca un grupo para colocar la tarjeta.")}</p>}
      </div>

      <div className="grid content-start gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} onDragOver={over(g.id)} onDragLeave={() => setOverGroup(null)} onDrop={drop(g.id)} onClick={() => picked && place(picked, g.id)}
            className={cx("min-h-32 rounded-2xl border p-3 transition", overGroup === g.id ? "border-accent bg-accent-soft/50" : "border-line bg-surface", picked && "cursor-pointer hover:border-accent")}>
            {g.custom ? (
              <input autoFocus={!g.name} className="mb-2 w-full rounded-md border border-transparent bg-paper px-2 py-1 text-[13px] font-semibold outline-none focus:border-accent"
                placeholder={t("Nombra este grupo…")} value={g.name} maxLength={80} onClick={(e) => e.stopPropagation()}
                onChange={(e) => commit(groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} />
            ) : <p className="mb-2 px-1 text-[13px] font-semibold">{g.name}</p>}
            <div className="space-y-1.5">{g.cardIds.map((id) => card(id) && <Card key={id} o={card(id)!} inGroup />)}</div>
            {g.cardIds.length === 0 && <p className="py-4 text-center text-xs text-ink-3">{picked ? t("Toca para colocar aquí") : t("Suelta tarjetas aquí")}</p>}
          </div>
        ))}
        {canCreate && (
          <div onDragOver={over("__new")} onDragLeave={() => setOverGroup(null)} onDrop={drop("__new")} onClick={() => picked && place(picked, "__new")}
            className={cx("flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-3 text-center transition",
              overGroup === "__new" ? "border-accent bg-accent-soft/50" : "border-line-2", picked && "cursor-pointer hover:border-accent")}>
            <Plus size={18} className="text-accent" />
            <p className="text-[13px] font-medium text-ink-2">{t("Crear grupo nuevo")}</p>
            <p className="text-xs text-ink-3">{picked ? t("Toca para crear un grupo") : t("Suelta una tarjeta aquí")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree test ───────────────────────────────────────────────────
function TreeView({ block, value, onChange }: { block: TreeTestBlock; value?: TreeTestValue; onChange: (v: unknown) => void }) {
  const tree = useMemo(() => parseTree(block.treeText), [block.treeText]);
  const [open, setOpen] = useState<string[]>([]);
  const [path, setPath] = useState<string[]>(value?.path ?? []);
  const [backs, setBacks] = useState(value?.backtracks ?? 0);
  const [focus, setFocus] = useState<string | null>(value?.selected ?? null);

  const visit = (n: TreeNode) => {
    const last = path[path.length - 1];
    if (last && !n.id.startsWith(last + "/") && n.id !== last) setBacks((b) => b + 1);
    setPath((p) => [...p, n.id]);
    setFocus(n.id);
    if (n.children.length) setOpen((o) => (o.includes(n.id) ? o.filter((x) => x !== n.id && !x.startsWith(n.id + "/")) : [...o, n.id]));
  };
  const choose = (id: string) => onChange({ selected: id, path: [...path], backtracks: backs });

  const render = (nodes: TreeNode[], depth: number): React.ReactNode => (
    <ul>
      {nodes.map((n) => {
        const isOpen = open.includes(n.id), chosen = value?.selected === n.id;
        return (
          <li key={n.id}>
            <div className={cx("flex items-center gap-2 rounded-lg pr-2 transition", chosen ? "bg-accent-soft" : focus === n.id ? "bg-ink/[0.04]" : "hover:bg-ink/[0.03]")} style={{ paddingLeft: depth * 20 }}>
              <button type="button" onClick={() => visit(n)} className="focus-ring flex flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[15px]">
                {n.children.length ? <ChevronRight size={16} className={cx("shrink-0 text-ink-3 transition", isOpen && "rotate-90")} /> : <span className="w-4" />}
                <span className={cx(chosen && "font-semibold")}>{n.label}</span>
              </button>
              {focus === n.id && !chosen && (
                <button type="button" onClick={() => choose(n.id)} className="focus-ring flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">
                  {t("Lo encontraría aquí")} <CornerDownLeft size={12} />
                </button>
              )}
              {chosen && <span className="flex items-center gap-1 text-xs font-medium text-accent-ink"><Check size={13} /> {t("Elegido")}</span>}
            </div>
            {isOpen && n.children.length > 0 && render(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div>
      <p className="label mb-3">{t("Navega el menú y elige dónde lo buscarías")}</p>
      <div className="rounded-2xl border border-line bg-surface p-2">{render(tree, 0)}</div>
    </div>
  );
}

// ── Preference test ─────────────────────────────────────────────
function PreferenceView({ block, value, onChange }: { block: PreferenceBlock; value?: PreferenceValue; onChange: (v: unknown) => void }) {
  const options = useMemo(() => (block.randomize ? shuffle(block.options) : block.options), [block.options, block.randomize]);
  const [zoom, setZoom] = useState<Option | null>(null);
  return (
    <div>
      <div className={cx("grid gap-4", options.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {options.map((o, i) => {
          const on = value?.choice === o.id;
          return (
            <div key={o.id} className={cx("overflow-hidden rounded-2xl border-2 bg-surface transition", on ? "border-accent shadow-lg shadow-accent/10" : "border-line hover:border-line-2")}>
              <button type="button" onClick={() => onChange({ choice: o.id, why: value?.why })} className="focus-ring block w-full">
                {o.image ? <img src={o.image} alt={o.label} className="aspect-[4/3] w-full bg-paper object-contain" />
                  : <div className="flex aspect-[4/3] items-center justify-center bg-paper text-sm text-ink-3">{t("Sin imagen")}</div>}
              </button>
              <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
                <button type="button" onClick={() => onChange({ choice: o.id, why: value?.why })} className="flex items-center gap-2 text-[14px] font-medium">
                  <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border-2", on ? "border-accent bg-accent text-white" : "border-line-2")}>{on && <Check size={11} strokeWidth={3} />}</span>
                  {o.label || t("Opción {a}", { a: i + 1 })}
                </button>
                {o.image && <button type="button" onClick={() => setZoom(o)} className="rounded-md p-1 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label={t("Ver en grande")}><Maximize2 size={15} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {block.askWhy && value?.choice && (
        <div className="mt-6">
          <label className="mb-2 block text-[15px] font-medium">{t("¿Por qué elegiste esta opción?")}</label>
          <textarea autoFocus className="field min-h-24 text-[15px]" maxLength={2000} value={value.why ?? ""} onChange={(e) => onChange({ ...value, why: e.target.value })} />
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6" onClick={() => setZoom(null)}>
          <img src={zoom.image} alt={zoom.label} className="max-h-full max-w-full rounded-lg bg-white object-contain" />
          <button className="absolute top-4 right-4 rounded-full bg-white/90 p-2" aria-label={t("Cerrar")}><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

// ── Five second test ────────────────────────────────────────────
function FiveSecondView({ block, onDone, preview }: { block: FiveSecondBlock; onDone: () => void; preview?: boolean }) {
  const [phase, setPhase] = useState<"ready" | "showing" | "done">("ready");
  const [left, setLeft] = useState(block.seconds);
  useEffect(() => {
    if (phase !== "showing") return;
    if (left <= 0) { setPhase("done"); onDone(); return; }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left]);
  if (!block.image?.url) return <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn">{t("Este bloque necesita una imagen.")}</p>;
  if (phase === "showing") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink p-4">
        <img src={block.image.url} alt="" className="max-h-full max-w-full object-contain" />
        <span className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-semibold tabular-nums shadow-lg">{left}</span>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-8 text-center">
      {phase === "ready" ? <>
        <p className="text-5xl font-semibold tabular-nums text-accent">{block.seconds}s</p>
        <p className="mt-2 text-sm text-ink-2">{t("La imagen aparecerá en pantalla completa y desaparecerá sola.")}</p>
        <button type="button" onClick={() => { setLeft(block.seconds); setPhase("showing"); }} className="focus-ring mt-6 rounded-lg bg-accent px-5 py-2.5 text-[15px] font-medium text-white">
          {t("Estoy listo/a, mostrar imagen")}
        </button>
        {preview && <p className="mt-3 text-xs text-ink-3">{t("Vista previa")}</p>}
      </> : <p className="text-sm text-ink-2">{t("Listo ✓")}</p>}
    </div>
  );
}

// ── First click ─────────────────────────────────────────────────
function FirstClickView({ block, value, onClick, preview }: { block: FirstClickBlock; value?: FirstClickValue; onClick: (v: FirstClickValue) => void; preview?: boolean }) {
  const start = useRef(Date.now());
  const ref = useRef<HTMLDivElement>(null);
  if (!block.image?.url) return <p className="rounded-xl bg-warn-soft p-4 text-sm text-warn">{t("Este bloque necesita una imagen.")}</p>;
  return (
    <div>
      <p className="label mb-3">{t("Haz un solo clic donde harías clic primero")}</p>
      <div ref={ref} className={cx("relative overflow-hidden rounded-xl border border-line", !value && "cursor-crosshair")}
        onClick={(e) => {
          if (value && !preview) return;
          const r = ref.current!.getBoundingClientRect();
          onClick({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, ms: Date.now() - start.current });
        }}>
        <img src={block.image.url} alt="" className="w-full select-none" draggable={false} />
        {value && <span className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-accent shadow-lg" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />}
      </div>
    </div>
  );
}
