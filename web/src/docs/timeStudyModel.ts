// Time study (observation log): an observer writes down every activity a person does during a workday,
// one row per activity, and the summary adds the time up by person, activity bucket and main tool.
// Pure functions only, so the editor, the export and the tests share one calculation.
import type { Lang } from "../lib/i18n";
import { uid } from "../lib/hooks";

export interface TSPerson { id: string; name: string }
/** An activity bucket: what the observer picks for each row, with what counts in it. */
export interface TSBucket { id: string; name: string; what: string }
/** A tool. `key` marks the tools whose time the study is measuring (the "key tools" group). */
export interface TSTool { id: string; name: string; key: boolean }
export interface TSDay { id: string; person: string; date: string; observer: string; notes: string }
export interface TSRow {
  id: string; person: string; date: string;
  start: string; end: string;          // "HH:MM"
  bucket: string; tool: string;        // ids
  other: string; ref: string; notes: string;
}
export interface TimeStudyData {
  people: TSPerson[];
  workdays: number;                    // per week, for the weekly estimates
  keyLabel: string;                    // the name of the key tools group, e.g. the product being measured
  buckets: TSBucket[];
  tools: TSTool[];
  schedule: TSDay[];
  rows: TSRow[];
}

export const DEFAULT_WORKDAYS = 5;

const L = (lang: Lang, es: string, en: string) => (lang === "en" ? en : es);

/** Neutral starting lists: the team renames, adds and removes them for its own study. */
export function defaultLists(lang: Lang): Pick<TimeStudyData, "buckets" | "tools"> {
  const buckets: [string, string, string, string][] = [
    ["Preparación", "Prep", "Revisar archivos, notas o historial antes de una llamada, reunión o tarea", "Reviewing files, notes or history before a call, meeting or task"],
    ["En una llamada", "On a call", "Llamadas con clientes, proveedores u otras personas, incluidos mensajes de voz", "Calls with clients, vendors or others, including voicemails"],
    ["Revisión de documentos", "Doc review", "Leer documentos, borradores o trabajo de otras personas", "Reading documents, drafts or other people's work"],
    ["Leer y enviar correos", "Reading/sending emails", "Correo que no encaja en otra categoría", "Email that doesn't fit another bucket"],
    ["Redacción / trabajo", "Drafting/work product", "Escribir cartas, reportes y otros entregables", "Writing letters, reports and other work product"],
    ["Delegar", "Delegating", "Explicar lo que se necesita a otra persona o corregir su trabajo", "Explaining what's needed to someone else or correcting their work"],
    ["Solicitudes y seguimiento", "Requests and follow-ups", "Pedir o perseguir información, archivos o trabajo de otros equipos", "Asking for or chasing information, files or work from other teams"],
    ["Revisar y anotar en el sistema", "Reviewing and adding notes", "Revisar pendientes o registros y dejar notas", "Going through pending items or records and leaving notes"],
    ["Reunión interna", "Internal meeting", "Reuniones de equipo o de la empresa", "Team or company meetings"],
    ["Descanso / comida", "Break/lunch", "", ""],
    ["Otro", "Other", "Cualquier otra cosa; descríbela en las notas", "Anything else; describe it in the notes"],
  ];
  const tools: [string, string][] = [
    ["Sistema principal", "Main system"], ["Correo / calendario", "Email/calendar"], ["Teléfono", "Phone"], ["Chat", "Chat"],
    ["Word / PDF", "Word/PDF"], ["IA", "AI assistant"], ["Otra", "Other"],
  ];
  return {
    buckets: buckets.map(([es, en, wes, wen]) => ({ id: uid(), name: L(lang, es, en), what: L(lang, wes, wen) })),
    tools: tools.map(([es, en], i) => ({ id: uid(), name: L(lang, es, en), key: i === 0 })),
  };
}

export function emptyTimeStudy(lang: Lang): TimeStudyData {
  return { people: [1, 2].map(() => ({ id: uid(), name: "" })), workdays: DEFAULT_WORKDAYS, keyLabel: "", ...defaultLists(lang), schedule: [], rows: [] };
}

/** Fills in whatever an older or partial document is missing, so every reader can trust the shape. */
export function normalize(d: Partial<TimeStudyData> | undefined): TimeStudyData {
  return {
    people: d?.people ?? [], workdays: d?.workdays && d.workdays > 0 ? d.workdays : DEFAULT_WORKDAYS, keyLabel: d?.keyLabel ?? "",
    buckets: d?.buckets ?? [], tools: d?.tools ?? [], schedule: d?.schedule ?? [], rows: d?.rows ?? [],
  };
}

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes between start and end, or null while either is missing or the end is not after the start. */
export function duration(r: Pick<TSRow, "start" | "end">): number | null {
  const a = toMin(r.start), b = toMin(r.end);
  return a === null || b === null || b <= a ? null : b - a;
}

export interface TSCell { hours: number; share: number; perWeek: number }
export interface TSPersonStats { person: TSPerson; days: number; hours: number; perDay: number; keyHours: number; keyPerWeek: number }
export interface TSLine { id: string; name: string; key?: boolean; cells: TSCell[]; total: TSCell }
export interface TSSummary {
  people: TSPersonStats[];
  total: Omit<TSPersonStats, "person">;
  byBucket: TSLine[];                  // includes a "no bucket" line when some rows have none
  byTool: TSLine[];
  rowsCounted: number;
  rowsSkipped: number;                 // rows without a person, date or a valid start and end
}

export const UNSET = "";

/**
 * The Summary tab of the spreadsheet: days observed, hours logged, average per day, hours with a key tool as the
 * main tool and its weekly estimate, then hours, share of logged time and weekly estimate per bucket and per tool.
 * Weekly estimates are hours / days observed × workdays per week, per person.
 */
export function summarize(raw: Partial<TimeStudyData> | undefined): TSSummary {
  const d = normalize(raw);
  const counted = d.rows.map((r) => ({ r, min: duration(r) })).filter((x) => x.r.person && x.r.date && x.min !== null) as { r: TSRow; min: number }[];
  const keyTools = new Set(d.tools.filter((t) => t.key).map((t) => t.id));
  const peopleIds = new Set(d.people.map((p) => p.id));

  const stats = (rows: { r: TSRow; min: number }[]) => {
    const days = new Set(rows.map((x) => `${x.r.person}|${x.r.date}`)).size;
    const hours = rows.reduce((a, x) => a + x.min, 0) / 60;
    const keyHours = rows.filter((x) => keyTools.has(x.r.tool)).reduce((a, x) => a + x.min, 0) / 60;
    return { days, hours, perDay: days ? hours / days : 0, keyHours, keyPerWeek: days ? (keyHours / days) * d.workdays : 0 };
  };
  const people = d.people.map((p) => ({ person: p, ...stats(counted.filter((x) => x.r.person === p.id)) }));
  const mine = counted.filter((x) => peopleIds.has(x.r.person));
  const total = stats(mine);

  const cell = (rows: { r: TSRow; min: number }[], base: { hours: number; days: number }): TSCell => {
    const hours = rows.reduce((a, x) => a + x.min, 0) / 60;
    return { hours, share: base.hours ? hours / base.hours : 0, perWeek: base.days ? (hours / base.days) * d.workdays : 0 };
  };
  const line = (id: string, name: string, match: (r: TSRow) => boolean, key?: boolean): TSLine => ({
    id, name, key,
    cells: people.map((p) => cell(mine.filter((x) => x.r.person === p.person.id && match(x.r)), p)),
    total: cell(mine.filter((x) => match(x.r)), total),
  });
  const bucketIds = new Set(d.buckets.map((b) => b.id));
  const toolIds = new Set(d.tools.map((t) => t.id));
  const byBucket = d.buckets.map((b) => line(b.id, b.name, (r) => r.bucket === b.id));
  if (mine.some((x) => !bucketIds.has(x.r.bucket))) byBucket.push(line(UNSET, "", (r) => !bucketIds.has(r.bucket)));
  const byTool = d.tools.map((t) => line(t.id, t.name, (r) => r.tool === t.id, t.key));
  if (mine.some((x) => !toolIds.has(x.r.tool))) byTool.push(line(UNSET, "", (r) => !toolIds.has(r.tool)));

  return { people, total, byBucket, byTool, rowsCounted: mine.length, rowsSkipped: d.rows.length - mine.length };
}

/** The log as a table, oldest first, with names instead of ids: for CSV, Word and Markdown exports. */
export function logTable(raw: Partial<TimeStudyData> | undefined) {
  const d = normalize(raw);
  const name = <T extends { id: string; name: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)?.name ?? "";
  const rows = [...d.rows].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  return rows.map((r) => [name(d.people, r.person), r.date, r.start, r.end, duration(r)?.toString() ?? "", name(d.buckets, r.bucket), name(d.tools, r.tool), r.other, r.ref, r.notes]);
}

/** The next row starts where the last one ended, for the same person and day: logging a day is one long chain. */
export function nextRow(d: TimeStudyData): TSRow {
  const last = d.rows[d.rows.length - 1];
  return { id: uid(), person: last?.person ?? d.people[0]?.id ?? "", date: last?.date ?? today(), start: last?.end ?? "", end: "", bucket: "", tool: "", other: "", ref: "", notes: "" };
}

/** Today in the observer's own time zone (toISOString would give tomorrow's date in the evening west of UTC). */
export function today(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
