// Exportación de documentos a Markdown, CSV y Word (.docx).
// Todo se genera en el navegador a partir de la plantilla + los datos: nada sale del equipo.
import type { DocData, DocTemplate, Entry, Note, RowGroup, Bar } from "./types";
import { tr, type Lang } from "../lib/i18n";
import type { JourneyData } from "./Journey";
import type { AffinityData } from "./Affinity";
import { taskRate, type UsabilityData } from "./UsabilityMatrix";
import type { HeuristicData } from "./Heuristic";
import type { BlueprintData } from "./Blueprint";
import { heuristicCategories } from "./heuristics";
import { compare, logTable, normalize, summarize, type TimeStudyData } from "./timeStudyModel";

type Block =
  | { t: "h"; level: 1 | 2 | 3; text: string }
  | { t: "p"; text: string; muted?: boolean }
  | { t: "list"; ordered?: boolean; items: string[] }
  | { t: "kv"; pairs: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][] };

const EMO_KEYS = ["Frustración", "Molestia", "Neutral", "Contento", "Satisfacción"];
const STATUS: Record<string, string> = { pass: "Pasa", partial: "Parcial", fail: "Falla", na: "N/A" };
const NOTE_TYPE: Record<string, string> = { obs: "Observación", judgment: "Juicio", value: "Valor" };
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

/** Convierte un documento en bloques neutros (títulos, párrafos, listas, tablas). */
export function docBlocks(tpl: DocTemplate, title: string, data: DocData, lang: Lang, projectName?: string): Block[] {
  const T = (k: string, v?: Record<string, string | number>) => tr(k, lang, v);
  const out: Block[] = [{ t: "h", level: 1, text: title }];
  out.push({ t: "p", muted: true, text: [title.trim() === T(tpl.name) ? "" : T(tpl.name), projectName].filter(Boolean).join(" · ") });

  for (const s of tpl.sections) {
    const v = data[s.id];
    // Los campos sin título (moderador, producto, fecha…) van bajo "Datos generales"
    const heading = s.title ? T(s.title) : s.type === "fields" ? T("Datos generales") : "";
    const blocks: Block[] = [];

    switch (s.type) {
      case "text": if (typeof v === "string" && v.trim()) blocks.push({ t: "p", text: v.trim() }); break;
      case "list": { const items = ((v as string[]) ?? []).filter((x) => x.trim()); if (items.length) blocks.push({ t: "list", ordered: s.numbered, items }); break; }
      case "notes": { const items = ((v as Note[]) ?? []).map((n) => n.text.trim()).filter(Boolean); if (items.length) blocks.push({ t: "list", items }); break; }
      case "fields": { const o = (v as Record<string, string>) ?? {}; const pairs = s.fields.filter((f) => o[f.id]?.trim()).map((f) => [T(f.label), o[f.id].trim()] as [string, string]); if (pairs.length) blocks.push({ t: "kv", pairs }); break; }
      case "chips": { const c = (v as string[]) ?? []; if (c.length) blocks.push({ t: "p", text: c.join(", ") }); break; }
      case "bars": { const b = ((v as Bar[]) ?? []).filter((x) => x.label.trim()); if (b.length) blocks.push({ t: "kv", pairs: b.map((x) => [x.label, `${x.value}%`]) }); break; }
      case "gallery": { const g = ((v as { caption: string }[]) ?? []).map((x) => x.caption).filter(Boolean); if (g.length) blocks.push({ t: "list", items: g }); break; }
      case "image": break;
      case "rowgroups":
        for (const g of (v as RowGroup[]) ?? []) {
          const rows = g.rows.filter((r) => r.label.trim() || r.answer?.trim() || r.yes != null).map((r) => [
            r.label, [r.kind === "yesno" && r.yes != null ? T(r.yes ? "Sí" : "No") : "", r.answer?.trim() ?? ""].filter(Boolean).join(" · "),
          ]);
          if (!rows.some((r) => r[1])) continue;
          blocks.push({ t: "h", level: 3, text: [g.letter, g.title].filter(Boolean).join(" · ") });
          blocks.push({ t: "table", head: [T("¿Qué observar?"), T("Anotaciones")], rows: rows.map((r) => [r[0], r[1] || "—"]) });
        }
        break;
      case "entries":
        ((v as Entry[]) ?? []).filter((e) => e.name.trim() || e.body.trim()).forEach((e, i) => {
          blocks.push({ t: "h", level: 3, text: `${i + 1}. ${e.name.trim() || "—"}` });
          if (e.body.trim()) blocks.push({ t: "p", text: e.body.trim() });
        });
        break;
      case "custom":
        if (s.component === "journey") blocks.push(...journeyBlocks((v as JourneyData) ?? { stages: [] }, T));
        if (s.component === "affinity") blocks.push(...affinityBlocks((v as AffinityData) ?? { participants: [], notes: [], groups: [] }, T));
        if (s.component === "usability") blocks.push(...usabilityBlocks((v as UsabilityData) ?? { tasks: [], users: [], results: {} }, T));
        if (s.component === "heuristic") blocks.push(...heuristicBlocks(v as HeuristicData | undefined, T, lang));
        if (s.component === "blueprint") blocks.push(...blueprintBlocks((v as BlueprintData) ?? { stages: [] }, T));
        if (s.component === "timestudy") blocks.push(...timeStudyBlocks(v as TimeStudyData | undefined, T));
        break;
    }
    if (!blocks.length) continue;
    if (heading) out.push({ t: "h", level: 2, text: heading });
    out.push(...blocks);
  }
  return out;
}

type TF = (k: string, v?: Record<string, string | number>) => string;

function journeyBlocks(d: JourneyData, T: TF): Block[] {
  const out: Block[] = [];
  d.stages.forEach((s, i) => {
    const acts = s.actions.filter((a) => a.text.trim()).map((a) => `${a.text.trim()} — ${T(EMO_KEYS[a.emotion + 2])}`);
    const pairs = ([["Valor", s.value], ["Barreras", s.barriers], ["Oportunidades", s.opportunities]] as const).filter(([, x]) => x?.trim()).map(([k, x]) => [T(k), x.trim()] as [string, string]);
    if (!s.name.trim() && !acts.length && !pairs.length) return;
    out.push({ t: "h", level: 2, text: `${i + 1}. ${s.name.trim() || T("Etapa")}` });
    if (acts.length) { out.push({ t: "p", text: T("Acciones y actividades") }); out.push({ t: "list", items: acts }); }
    if (pairs.length) out.push({ t: "kv", pairs });
  });
  return out;
}

/** The time study as the spreadsheet had it: summary, time by activity and by tool, the log, then the lists. */
function timeStudyBlocks(raw: TimeStudyData | undefined, T: TF): Block[] {
  const d = normalize(raw);
  if (!d.people.length && !d.rows.length) return [];
  const key = d.keyLabel.trim() || T("herramientas clave");
  const n = (x: number) => x.toFixed(1), pc = (x: number) => `${Math.round(x * 100)}%`;
  const out: Block[] = [];
  const multi = d.rounds.length > 1;
  if (multi) {
    // Before and after first: the first round against the last, as the comparison opens on screen.
    const [a, b] = [d.rounds[0], d.rounds.at(-1)!];
    const c = compare(d, a.id, b.id);
    const sg = (x: number) => (Math.abs(x) < 0.05 ? "0.0" : `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`);
    const sp = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.round(Math.abs(x) * 100)}%`);
    const head = (first: string) => [first, a.name, b.name, T("Cambio"), T("Cambio %")];
    const row = (label: string, x: { before: number; after: number; change: number; ratio: number | null }) => [label, n(x.before), n(x.after), sg(x.change), sp(x.ratio)];
    out.push({ t: "h", level: 2, text: `${T("Antes y después")}: ${a.name} → ${b.name}` },
      { t: "table", head: head(T("Métrica")), rows: [
        [T("Días observados"), String(c.before.total.days), String(c.after.total.days), "", ""],
        row(T("Promedio de horas registradas por día"), c.perDay),
        row(T("{a}, horas por persona por semana (est.)", { a: key }), c.keyPerWeek),
      ] },
      { t: "h", level: 3, text: T("Horas por persona por semana, por actividad") },
      { t: "table", head: head(T("Actividad")), rows: c.byBucket.map((l) => row(l.id ? l.name : T("Sin categoría"), l.delta)) },
      { t: "h", level: 3, text: T("Horas por persona por semana, por herramienta principal") },
      { t: "table", head: head(T("Herramienta")), rows: c.byTool.map((l) => row(l.id ? l.name : T("Sin herramienta"), l.delta)) });
  }
  /** One round's summary (or the whole log when there are no rounds), as the Summary tab shows it. */
  function summaryBlocks(round: string | undefined, title: string) {
    const s = summarize(d, round);
    const who = s.people.map((p, i) => p.person.name || `${T("Persona")} ${i + 1}`);
    out.push({ t: "h", level: 2, text: title }, {
      t: "table", head: [T("Métrica"), ...who],
      rows: [
        [T("Días observados"), ...s.people.map((p) => String(p.days))],
        [T("Horas registradas"), ...s.people.map((p) => n(p.hours))],
        [T("Promedio de horas registradas por día"), ...s.people.map((p) => n(p.perDay))],
        [T("Horas con {a} como herramienta principal", { a: key }), ...s.people.map((p) => n(p.keyHours))],
        [T("{a}, horas estimadas por semana", { a: key }), ...s.people.map((p) => n(p.keyPerWeek))],
      ],
    });
    const head = (first: string) => [first, ...who.flatMap((w) => [`${w} (${T("Horas")})`, `${w} (${T("% del registro")})`, `${w} (${T("Horas/semana (est.)")})`])];
    const lines = (ls: ReturnType<typeof summarize>["byBucket"], none: string) => ls.map((l) => [l.id ? l.name : none, ...l.cells.flatMap((c) => [n(c.hours), pc(c.share), n(c.perWeek)])]);
    out.push({ t: "h", level: 3, text: T("Tiempo por actividad") }, { t: "table", head: head(T("Actividad")), rows: lines(s.byBucket, T("Sin categoría")) });
    out.push({ t: "h", level: 3, text: T("Tiempo por herramienta principal") }, { t: "table", head: head(T("Herramienta")), rows: lines(s.byTool, T("Sin herramienta")) });
  }
  for (const r of multi ? d.rounds : [undefined]) summaryBlocks(r?.id, r ? `${T("Resumen")}: ${r.name}` : T("Resumen"));
  const log = logTable(d);
  if (log.length) out.push({ t: "h", level: 2, text: T("Registro de tiempo") }, {
    t: "table", rows: log,
    head: [T("Persona"), T("Fecha"), T("Hora de inicio"), T("Hora de fin"), T("Duración (min)"), T("Categoría de actividad"), T("Herramienta principal"), T("Otras herramientas"), T("Asunto / referencia"), T("Notas del observador"), ...(multi ? [T("Ronda")] : [])],
  });
  if (d.schedule.length) out.push({ t: "h", level: 2, text: T("Calendario") }, {
    t: "table", head: [T("Día"), T("Persona"), T("Fecha"), T("Observador(a)"), T("Notas")],
    rows: d.schedule.map((x, i) => [String(i + 1), d.people.find((p) => p.id === x.person)?.name ?? "", x.date, x.observer, x.notes]),
  });
  out.push({ t: "h", level: 2, text: T("Categorías y herramientas") },
    { t: "table", head: [T("Categoría de actividad"), T("Qué cuenta")], rows: d.buckets.map((b) => [b.name, b.what]) },
    { t: "table", head: [T("Herramienta"), T("Cuenta como {a}", { a: key })], rows: d.tools.map((t) => [t.name, t.key ? T("Sí") : T("No")]) });
  return out;
}

const BP_LANES = [["evidence", "Evidencia física"], ["customer", "Acciones del cliente"], ["frontstage", "Frontstage (visible)"], ["backstage", "Backstage (no visible)"], ["support", "Procesos de soporte"]] as const;

function blueprintBlocks(d: BlueprintData, T: TF): Block[] {
  const out: Block[] = [];
  d.stages.forEach((s, i) => {
    const pairs = BP_LANES.filter(([k]) => s[k]?.trim()).map(([k, label]) => [T(label), s[k].trim()] as [string, string]);
    if (!s.name.trim() && !pairs.length) return;
    out.push({ t: "h", level: 2, text: `${i + 1}. ${s.name.trim() || T("Etapa")}` });
    if (pairs.length) out.push({ t: "kv", pairs });
  });
  return out;
}

function affinityBlocks(d: AffinityData, T: TF): Block[] {
  const name = (id: string) => { const i = d.participants.findIndex((p) => p.id === id); return i < 0 ? "" : d.participants[i].name || `${T("Participante")} ${i + 1}`; };
  const line = (n: AffinityData["notes"][number]) => `${n.text} (${[name(n.participantId), T(NOTE_TYPE[n.type])].filter(Boolean).join(" · ")})`;
  const out: Block[] = [];
  const cols: [string, string | null][] = [...d.groups.map((g) => [g.name || T("Sin nombre"), g.id] as [string, string | null]), [T("Sin agrupar"), null]];
  for (const [title, id] of cols) {
    const notes = d.notes.filter((n) => n.groupId === id && n.text.trim());
    const conclusion = d.groups.find((g) => g.id === id)?.conclusion?.trim();
    if (!notes.length && !conclusion) continue;
    out.push({ t: "h", level: 2, text: title });
    if (notes.length) out.push({ t: "list", items: notes.map(line) });
    if (conclusion) out.push({ t: "p", text: `${T("Conclusión")}: ${conclusion}` });
  }
  if (d.conclusion?.trim()) out.push({ t: "h", level: 2, text: T("Conclusión general") }, { t: "p", text: d.conclusion.trim() });
  return out;
}

function usabilityBlocks(d: UsabilityData, T: TF): Block[] {
  if (!d.tasks.length) return [];
  const users = d.users.map((u, k) => u.name || `${T("Participante")} ${k + 1}`);
  // Solo tareas con nombre o con algún resultado marcado
  const tasks = d.tasks.filter((tk) => tk.name.trim() || tk.success.trim() || d.users.some((u) => { const r = d.results[`${tk.id}:${u.id}`]; return r?.status || r?.note; }));
  if (!tasks.length) return [];
  const rates = tasks.map((tk) => taskRate(d, tk.id).rate);
  const rows = tasks.map((tk, i) => [
    tk.name || `${T("Tarea")} ${i + 1}`, tk.success || "—",
    ...d.users.map((u) => { const r = d.results[`${tk.id}:${u.id}`]; return r?.status ? [T(STATUS[r.status]), r.note].filter(Boolean).join(": ") : (r?.note || "—"); }),
    pct(rates[i]),
  ]);
  const valid = rates.filter((r): r is number => r !== null);
  return [
    { t: "h", level: 2, text: T("Resultados") },
    { t: "table", head: [T("Tarea"), T("Descripción de éxito"), ...users, T("Tasa de éxito")], rows },
    { t: "kv", pairs: [[T("Tasa total de tareas completadas"), pct(valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null)]] },
  ];
}

function heuristicBlocks(d: HeuristicData | undefined, T: TF, lang: Lang): Block[] {
  if (!d) return [];
  const cats = heuristicCategories(d.framework ?? "weinschenk", lang);
  const evs = d.evaluators.map((e, i) => e.name || `${T("Evaluador")} ${i + 1}`);
  const out: Block[] = [];
  const summary: string[][] = [];
  for (const c of cats) {
    let pass = 0, fail = 0;
    const rows: string[][] = [];
    for (const it of c.items) {
      const cells = d.evaluators.map((ev) => {
        const a = d.answers[`${it.id}:${ev.id}`];
        if (!a?.r) return "";
        if (a.r === "pass") pass++;
        if (a.r === "fail") fail++;
        return [T(STATUS[a.r]), a.r === "fail" && a.s !== null ? `${T("sev.")} ${a.s}` : "", a.n].filter(Boolean).join(" · ");
      });
      if (cells.some(Boolean)) rows.push([it.text, ...cells.map((x) => x || "—")]);
    }
    if (!rows.length) continue;
    summary.push([c.name, String(pass), String(fail), pct(pass + fail ? pass / (pass + fail) : null)]);
    out.push({ t: "h", level: 3, text: c.name }, { t: "table", head: [T("Heurística"), ...evs], rows });
  }
  if (!out.length) return [];
  return [
    { t: "h", level: 2, text: T("Resultados globales") },
    { t: "table", head: [T("Heurística"), T("Pasa"), T("Falla"), T("Cumplimiento")], rows: summary },
    { t: "h", level: 2, text: T("Detalle por evaluador") },
    ...out,
  ];
}

// ───────────────────────────── Formatos

const mdEsc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function toMarkdown(blocks: Block[]): string {
  return blocks.map((b) => {
    switch (b.t) {
      case "h": return `${"#".repeat(b.level)} ${b.text}`;
      case "p": return b.muted ? `_${b.text}_` : b.text;
      case "list": return b.items.map((x, i) => `${b.ordered ? `${i + 1}.` : "-"} ${x.replace(/\n/g, " ")}`).join("\n");
      case "kv": return b.pairs.map(([k, v]) => `- **${k}:** ${v.replace(/\n/g, " ")}`).join("\n");
      case "table": return [`| ${b.head.map(mdEsc).join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.map(mdEsc).join(" | ")} |`)].join("\n");
    }
  }).join("\n\n") + "\n";
}

/** CSV en formato largo (Sección, Subsección, Elemento, Valor): fácil de filtrar en Excel o Sheets. */
export function toCSV(blocks: Block[], lang: Lang): string {
  const T = (k: string) => tr(k, lang);
  const rows: string[][] = [[T("Sección"), T("Subsección"), T("Elemento"), T("Valor")]];
  let sec = "", sub = "";
  for (const b of blocks) {
    if (b.t === "h") { if (b.level === 1) continue; if (b.level === 2) { sec = b.text; sub = ""; } else sub = b.text; continue; }
    if (b.t === "p") { if (!b.muted) rows.push([sec, sub, "", b.text]); }
    if (b.t === "list") b.items.forEach((x, i) => rows.push([sec, sub, String(i + 1), x]));
    if (b.t === "kv") b.pairs.forEach(([k, v]) => rows.push([sec, sub, k, v]));
    if (b.t === "table") b.rows.forEach((r) => r.slice(1).forEach((cell, c) => rows.push([sec, sub, `${r[0]} · ${b.head[c + 1]}`, cell])));
  }
  // Evita inyección de fórmulas al abrir en Excel
  const cell = (s: string) => { const v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export async function toDocx(blocks: Block[]): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } = d;
  const ACCENT = "7C3AED";
  const runs = (text: string, opts: Record<string, unknown> = {}) => text.split("\n").map((line, i) => new TextRun({ text: line, break: i ? 1 : 0, ...opts }));
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D3E8" };
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const b of blocks) {
    if (b.t === "h") children.push(new Paragraph({ heading: [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level], children: runs(b.text, { color: b.level === 1 ? ACCENT : undefined }), spacing: { before: b.level === 1 ? 0 : 240, after: 120 } }));
    if (b.t === "p") children.push(new Paragraph({ children: runs(b.text, b.muted ? { color: "6B6480", italics: true } : {}), spacing: { after: 120 } }));
    if (b.t === "list") b.items.forEach((x, i) => children.push(b.ordered
      ? new Paragraph({ children: runs(`${i + 1}. ${x}`), indent: { left: 360 }, spacing: { after: 60 } })
      : new Paragraph({ children: runs(x), bullet: { level: 0 }, spacing: { after: 60 } })));
    if (b.t === "kv") b.pairs.forEach(([k, v]) => children.push(new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), ...runs(v)], spacing: { after: 60 } })));
    if (b.t === "table") {
      const mk = (cells: string[], head: boolean) => new TableRow({
        tableHeader: head,
        children: cells.map((c) => new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: ACCENT } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: runs(c, head ? { bold: true, color: "FFFFFF" } : {}) })],
        })),
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(b.head, true), ...b.rows.map((r) => mk(r, false))] }));
      children.push(new Paragraph({ text: "" }));
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBlob(doc);
}

export function download(name: string, content: Blob | string, type = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Nombre de archivo seguro a partir del título */
export const fileName = (title: string) => (title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "documento");
