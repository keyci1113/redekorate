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
/**
 * A round of observation: the baseline, then the same people watched again after a change (an AI rollout, a new
 * tool). Rounds share the buckets and tools, so their summaries line up and can be compared.
 */
export interface TSRound { id: string; name: string }
export interface TSDay { id: string; person: string; date: string; observer: string; notes: string }
export interface TSRow {
  id: string; person: string; date: string;
  start: string; end: string;          // "HH:MM"
  bucket: string; tool: string;        // ids
  other: string; ref: string; notes: string;
  round?: string;                      // id; missing or unknown = the first round
}
export interface TimeStudyData {
  people: TSPerson[];
  workdays: number;                    // per week, for the weekly estimates
  keyLabel: string;                    // the name of the key tools group, e.g. the product being measured
  buckets: TSBucket[];
  tools: TSTool[];
  schedule: TSDay[];
  rows: TSRow[];
  /** Empty or one round = a single observation; two or more turn on the before-and-after comparison. */
  rounds: TSRound[];
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
  return { people: [1, 2].map(() => ({ id: uid(), name: "" })), workdays: DEFAULT_WORKDAYS, keyLabel: "", ...defaultLists(lang), schedule: [], rows: [], rounds: [] };
}

/** Fills in whatever an older or partial document is missing, so every reader can trust the shape. */
export function normalize(d: Partial<TimeStudyData> | undefined): TimeStudyData {
  return {
    people: d?.people ?? [], workdays: d?.workdays && d.workdays > 0 ? d.workdays : DEFAULT_WORKDAYS, keyLabel: d?.keyLabel ?? "",
    buckets: d?.buckets ?? [], tools: d?.tools ?? [], schedule: d?.schedule ?? [], rows: d?.rows ?? [], rounds: d?.rounds ?? [],
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
export function summarize(raw: Partial<TimeStudyData> | undefined, round?: string): TSSummary {
  const d = normalize(raw);
  const inScope = round === undefined ? d.rows : d.rows.filter((r) => roundOf(d, r) === round);
  const counted = inScope.map((r) => ({ r, min: duration(r) })).filter((x) => x.r.person && x.r.date && x.min !== null) as { r: TSRow; min: number }[];
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

  return { people, total, byBucket, byTool, rowsCounted: mine.length, rowsSkipped: inScope.length - mine.length };
}

/** The log as a table, oldest first, with names instead of ids: for CSV, Word and Markdown exports. */
export function logTable(raw: Partial<TimeStudyData> | undefined) {
  const d = normalize(raw);
  const name = <T extends { id: string; name: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)?.name ?? "";
  const rows = [...d.rows].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  const rounds = d.rounds.length > 1;
  return rows.map((r) => [name(d.people, r.person), r.date, r.start, r.end, duration(r)?.toString() ?? "", name(d.buckets, r.bucket), name(d.tools, r.tool), r.other, r.ref, r.notes, ...(rounds ? [name(d.rounds, roundOf(d, r))] : [])]);
}

/** The next row starts where the last one ended, for the same person and day: logging a day is one long chain. */
export function nextRow(d: TimeStudyData, round?: string): TSRow {
  const mine = round === undefined ? d.rows : d.rows.filter((r) => roundOf(d, r) === round);
  const last = mine[mine.length - 1];
  return {
    id: uid(), person: last?.person ?? d.people[0]?.id ?? "", date: last?.date ?? today(), start: last?.end ?? "", end: "", bucket: "", tool: "", other: "", ref: "", notes: "",
    ...(round ? { round } : {}),
  };
}

/** Today in the observer's own time zone (toISOString would give tomorrow's date in the evening west of UTC). */
export function today(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ---------- rounds: before and after ----------

/** The round a row belongs to: its own when it still exists, otherwise the first one (rows logged before rounds existed). */
export function roundOf(d: TimeStudyData, r: Pick<TSRow, "round">): string {
  return r.round && d.rounds.some((x) => x.id === r.round) ? r.round : d.rounds[0]?.id ?? "";
}

/**
 * Adds a round to observe again. The first time, everything logged so far becomes the first round (`first`), so
 * nothing is lost, and the new round (`next`) follows it.
 */
export function addRound(d: TimeStudyData, names: { first: string; next: string }): { data: TimeStudyData; round: string } {
  const id = uid();
  if (d.rounds.length === 0) {
    const base = uid();
    return { data: { ...d, rounds: [{ id: base, name: names.first }, { id, name: names.next }], rows: d.rows.map((r) => ({ ...r, round: base })) }, round: id };
  }
  return { data: { ...d, rounds: [...d.rounds, { id, name: names.next }] }, round: id };
}

/** A round can go only while no row is logged in it, so removing one never deletes observation work. */
export function roundInUse(d: TimeStudyData, id: string): boolean {
  return d.rows.some((r) => roundOf(d, r) === id);
}

export interface TSDelta { before: number; after: number; change: number; ratio: number | null }
export interface TSCompareLine { id: string; name: string; key?: boolean; delta: TSDelta }
export interface TSComparison {
  before: TSSummary; after: TSSummary;
  /** Per person in either round: their key-tool hours per week before and after (null where not observed). */
  people: { person: TSPerson; before: number | null; after: number | null }[];
  perDay: TSDelta; keyPerWeek: TSDelta;
  byBucket: TSCompareLine[]; byTool: TSCompareLine[];
  /** The activity whose hours per week moved most, either way; null while nothing moved. */
  biggest: TSCompareLine | null;
}

const delta = (before: number, after: number): TSDelta => ({ before, after, change: after - before, ratio: before ? (after - before) / before : null });

/**
 * Before and after on the same scale: hours per person per week (hours ÷ days observed × workdays), so rounds
 * with different numbers of days or people still compare. Buckets and tools match by id, as rounds share them.
 */
export function compare(raw: Partial<TimeStudyData> | undefined, beforeId: string, afterId: string): TSComparison {
  const d = normalize(raw);
  const before = summarize(d, beforeId), after = summarize(d, afterId);
  const lines = (a: TSLine[], b: TSLine[]): TSCompareLine[] => {
    const ids = [...new Set([...a.map((l) => l.id), ...b.map((l) => l.id)])];
    return ids.map((id) => {
      const x = a.find((l) => l.id === id), y = b.find((l) => l.id === id);
      return { id, name: (y ?? x)!.name, key: (y ?? x)!.key, delta: delta(x?.total.perWeek ?? 0, y?.total.perWeek ?? 0) };
    });
  };
  const byBucket = lines(before.byBucket, after.byBucket);
  const people = d.people.map((p, i) => {
    const x = before.people[i], y = after.people[i];
    return { person: p, before: x.days ? x.keyPerWeek : null, after: y.days ? y.keyPerWeek : null };
  }).filter((p) => p.before !== null || p.after !== null);
  const moved = byBucket.filter((l) => Math.abs(l.delta.change) >= 0.05).sort((a, b) => Math.abs(b.delta.change) - Math.abs(a.delta.change));
  return {
    before, after, people,
    perDay: delta(before.total.perDay, after.total.perDay), keyPerWeek: delta(before.total.keyPerWeek, after.total.keyPerWeek),
    byBucket, byTool: lines(before.byTool, after.byTool), biggest: moved[0] ?? null,
  };
}
