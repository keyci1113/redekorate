/**
 * Seed de datos de prueba para desarrollo local.
 *
 *   python scripts/seed/make_images.py <img_dir>
 *   npx tsx --tsconfig web/tsconfig.json scripts/seed/seed-test.mts <img_dir> [email]   (o: npm run seed:test)
 *
 * Crea proyectos "[Test] …" para el usuario (por defecto el primero de la tabla users) con estudios de
 * todos los métodos, respuestas simuladas, insights, panel de participantes, reportes compartidos
 * y los 20 tipos de documento llenos. Es idempotente: borra los proyectos "[Test] …" y los archivos
 * "seed-*" antes de volver a crearlos.
 */
import pg from "pg";
import { readFileSync, copyFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

// Los módulos del front leen localStorage al cargarse
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).window ??= globalThis;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMG_DIR = process.argv[2];
const EMAIL = process.argv[3];
if (!IMG_DIR) { console.error("Uso: seed-test.mts <img_dir> [email]   (o: npm run seed:test)"); process.exit(1); }
const UPLOAD_DIR = path.join(ROOT, "server", "uploads");
const layout = JSON.parse(readFileSync(path.join(IMG_DIR, "layout.json"), "utf8"));

const { DOC_TEMPLATES } = await import(pathToFileURL(path.join(ROOT, "web/src/docs/templates.tsx")).href);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://redekorate:redekorate@localhost:5432/redekorate" });
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

// ── Aleatoriedad reproducible ────────────────────────────────────────
let seed = 20261107;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const pickW = <T,>(a: T[], w: number[]) => { let r = rnd() * w.reduce((x, y) => x + y, 0); for (let i = 0; i < a.length; i++) { r -= w[i]; if (r < 0) return a[i]; } return a[a.length - 1]; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const around = (mean: number, sd: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(mean + gauss() * sd)));
const shuffle = <T,>(a: T[]) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
const ABC = "abcdefghijklmnopqrstuvwxyz0123456789";
const uid = () => Array.from({ length: 8 }, () => ABC[Math.floor(rnd() * ABC.length)]).join("");
const token = (n = 21) => randomBytes(n).toString("base64url").slice(0, n);
const opts = (...labels: string[]) => labels.map((label) => ({ id: uid(), label }));

// ── Bloques ─────────────────────────────────────────────────────────
type B = Record<string, any> & { id: string; type: string; title: string };
type Gen = (ctx: Ctx) => unknown;
interface Ctx { i: number; n: number; device: string; answers: Map<string, unknown> }
const gens = new Map<string, Gen>();
const blk = (type: string, title: string, patch: Record<string, any> = {}, gen?: Gen): B => {
  const b = { id: uid(), type, title, required: true, ...patch } as B;
  if (gen) gens.set(b.id, gen);
  return b;
};
const welcome = (description = "Este estudio toma unos 5 minutos. No hay respuestas correctas o incorrectas: estamos evaluando el diseño, no a ti.", title = "¡Gracias por participar!") =>
  blk("welcome", title, { description, buttonLabel: "Comenzar", required: undefined });
const thanks = () => blk("thank_you", "¡Listo, muchas gracias!", { description: "Tus respuestas nos ayudan a diseñar una mejor experiencia.", required: undefined });
const open = (title: string, pool: string[], required = true, skip = 0.15) =>
  blk("open_question", title, { multiline: true, placeholder: "Escribe tu respuesta…", required }, () => (!required && chance(skip) ? undefined : pick(pool)));
const scale = (title: string, min: number, max: number, minLabel: string, maxLabel: string, mean: number, sd = 1, style = "numbers") =>
  blk("scale", title, { min, max, minLabel, maxLabel, style }, () => around(mean, sd, style === "emoji" ? 1 : min, style === "emoji" ? 5 : max));
const choice = (title: string, labels: string[], weights: number[], extra: Record<string, any> = {}, others: string[] = []) => {
  const options = opts(...labels);
  return blk("choice", title, { multiple: false, allowOther: false, randomize: false, options, ...extra }, () => {
    if (extra.multiple) {
      const sel = options.filter((_, k) => chance(weights[k]));
      const v: any = { selected: sel.length ? sel.map((o) => o.id) : [options[0].id] };
      if (extra.allowOther && others.length && chance(0.15)) v.other = pick(others);
      return v;
    }
    return { selected: [pickW(options, weights).id] };
  });
};
const yesNo = (title: string, pYes: number) => blk("yes_no", title, { yesLabel: "Sí", noLabel: "No" }, () => (chance(pYes) ? "yes" : "no"));
const susBlock = (product: string, target: number) => blk("sus", "Cuéntanos tu experiencia", { description: "Indica qué tan de acuerdo estás con cada afirmación.", product }, () => {
  // target ≈ puntaje SUS medio; cada participante varía
  const p = Math.max(0.05, Math.min(0.95, target / 100 + gauss() * 0.12));
  return Array.from({ length: 10 }, (_, k) => (k % 2 === 0 ? around(1 + p * 4, 0.7, 1, 5) : around(5 - p * 4, 0.7, 1, 5)));
});

// ── Sesiones y respuestas ────────────────────────────────────────────
const DAY = 864e5;
const NOW = Date.now();
async function simulate(studyId: string, blocks: B[], n: number, opt: { days?: number; incomplete?: number; mobile?: number; flow?: (ctx: Ctx, b: B, v: unknown) => string | null } = {}) {
  const { days = 30, incomplete = 0.1, mobile = 0.55 } = opt;
  let first = NOW;
  for (let i = 0; i < n; i++) {
    const start = NOW - Math.pow(rnd(), 1.3) * days * DAY;  // más respuestas recientes
    first = Math.min(first, start);
    const device = pickW(["mobile", "desktop", "tablet"], [mobile, 1 - mobile - 0.08, 0.08]);
    const participant = chance(0.4) ? { source: pick(["email", "whatsapp", "linkedin", "intercom"]) } : {};
    const [se] = await q("insert into sessions(study_id, participant, device, started_at) values ($1,$2,$3,$4) returning id",
      [studyId, JSON.stringify(participant), device, new Date(start)]);
    const ctx: Ctx = { i, n, device, answers: new Map() };
    const quits = chance(incomplete);
    const asking = blocks.filter((b) => gens.has(b.id));
    const stopAt = quits ? int(0, Math.max(0, asking.length - 1)) : Infinity;
    let t = start + int(5, 20) * 1000, answered = 0, k = 0;
    while (k < blocks.length) {
      const b = blocks[k];
      let next: string | null = null;
      if (gens.has(b.id)) {
        if (answered >= stopAt) break;
        const v = gens.get(b.id)!(ctx);
        if (v !== undefined) {
          const ms = b.type === "prototype_task" ? (v as any).ms : int(3, 45) * 1000;
          ctx.answers.set(b.id, v);
          await q("insert into answers(session_id, study_id, block_id, value, duration_ms, created_at) values ($1,$2,$3,$4,$5,$6)",
            [se.id, studyId, b.id, JSON.stringify(v), ms, new Date(t)]);
          t += ms;
        }
        answered++;
        next = opt.flow?.(ctx, b, v) ?? null;
      }
      if (next === "end") break;
      k = next ? blocks.findIndex((x) => x.id === next) : k + 1;
    }
    if (!quits) await q("update sessions set completed_at = $2 where id = $1", [se.id, new Date(Math.min(t + 4000, NOW))]);
  }
  return new Date(first - DAY);
}

// ── Entidades ────────────────────────────────────────────────────────
let OWNER = "";
async function project(name: string, description: string, color: string, daysAgo: number) {
  const [p] = await q("insert into projects(owner_id, name, description, color, created_at, updated_at) values ($1,$2,$3,$4,$5,now()) returning id",
    [OWNER, name, description, color, new Date(NOW - daysAgo * DAY)]);
  return p.id as string;
}
async function study(projectId: string, title: string, method: string, blocks: B[], status: "draft" | "live" | "closed", n: number,
  settings: Record<string, any> = {}, sim: Parameters<typeof simulate>[3] = {}) {
  const [s] = await q(`insert into studies(project_id, owner_id, title, method, status, blocks, settings, public_slug, created_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [projectId, OWNER, title, method, status, JSON.stringify(blocks), JSON.stringify({ language: "es", ...settings }), token(10).toLowerCase().replace(/[-_]/g, "x"), new Date(NOW - 40 * DAY)]);
  if (n) {
    const published = await simulate(s.id, blocks, n, sim);
    await q("update studies set published_at = $2, created_at = $3, updated_at = now() where id = $1", [s.id, published, new Date(published.getTime() - 2 * DAY)]);
  } else if (status !== "draft") {
    await q("update studies set published_at = now() - interval '1 day' where id = $1", [s.id]);
  }
  console.log(`  · ${title} (${method}, ${status}, ${n} respuestas)`);
  return s.id as string;
}
async function insight(projectId: string, studyId: string | null, title: string, body: string, tags: string[], severity: string, confidence: string, evidence: string[] = []) {
  await q("insert into insights(project_id, study_id, created_by, title, body, tags, severity, confidence, evidence, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' days')::interval)",
    [projectId, studyId, OWNER, title, body, tags, severity, confidence, JSON.stringify(evidence.map((text) => ({ id: uid(), text }))), String(int(0, 12))]);
}
async function upload(file: string) {
  const name = `seed-${token(16)}${path.extname(file)}`;
  copyFileSync(path.join(IMG_DIR, file), path.join(UPLOAD_DIR, name));
  await q("insert into uploads(owner_id, filename, mime, size) values ($1,$2,'image/png',$3)", [OWNER, name, statSync(path.join(UPLOAD_DIR, name)).size]);
  return `/uploads/${name}`;
}
async function panel(projectId: string, studyIds: string[], people: [string, string, string[]][]) {
  for (const [name, email, tags] of people) {
    const consent = chance(0.85);
    const [p] = await q(`insert into participants(project_id, owner_id, name, email, phone, tags, notes, consent, consent_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [projectId, OWNER, name, email, chance(0.6) ? `+52 55 ${int(1000, 9999)} ${int(1000, 9999)}` : "", tags,
        chance(0.4) ? pick(["Prefiere sesiones por la tarde.", "Usa la app a diario para su negocio.", "Llegó por el screener de octubre.", "Muy articulado/a, buen candidato para entrevistas."]) : "",
        consent, consent ? new Date(NOW - int(1, 30) * DAY) : null]);
    for (const sid of studyIds) if (chance(0.6))
      await q("insert into participant_studies(participant_id, study_id, status) values ($1,$2,$3)", [p.id, sid, pickW(["completed", "invited", "no_show", "declined"], [6, 2, 1, 1])]);
  }
}

// ── Main ─────────────────────────────────────────────────────────────
const [user] = EMAIL ? await q("select id, email from users where email = $1", [EMAIL]) : await q("select id, email from users order by created_at limit 1");
if (!user) { console.error("No existe el usuario. Crea tu cuenta primero."); process.exit(1); }
OWNER = user.id;
console.log(`Usuario: ${user.email}`);

// Limpieza (idempotente)
const del = await q("delete from projects where owner_id = $1 and name like '[Test]%' returning id", [OWNER]);
await q("delete from uploads where owner_id = $1 and filename like 'seed-%'", [OWNER]);
mkdirSync(UPLOAD_DIR, { recursive: true });
for (const f of readdirSync(UPLOAD_DIR)) if (f.startsWith("seed-")) unlinkSync(path.join(UPLOAD_DIR, f));
if (del.length) console.log(`Borrados ${del.length} proyectos [Test] anteriores`);

// ════ 1. Usabilidad (prototipos + pruebas visuales) ═════════════════
{
  console.log("\n[Test] App de delivery · Usabilidad");
  const P = await project("[Test] App de delivery · Usabilidad", "Validación del flujo de seguimiento de pedidos y pagos de la app comida·ya antes del release de diciembre.", "#5902A1", 45);

  // Prototipo
  const sid: Record<string, string> = {};
  for (const s of layout.proto) sid[s.key] = uid();
  const links: Record<string, [string, string][]> = {
    home: [["banner", "order_detail"], ["tab_pedidos", "orders"], ["tab_cuenta", "account"]],
    orders: [["order_active", "order_detail"], ["tab_inicio", "home"], ["tab_cuenta", "account"]],
    order_detail: [["back", "back"]],
    account: [["payments", "payments"], ["tab_inicio", "home"], ["tab_pedidos", "orders"]],
    payments: [["back", "back"], ["methods", "methods"]],
    methods: [["back", "back"], ["make_default", "methods_ok"]],
    methods_ok: [["back", "back"]],
  };
  const hs: Record<string, Record<string, string>> = {};  // pantalla → zona → id del hotspot
  const screens = [];
  for (const s of layout.proto) {
    hs[s.key] = {};
    const hotspots = (links[s.key] ?? []).map(([zone, to]) => {
      const id = uid(); hs[s.key][zone] = id;
      return { id, ...s.zones[zone], target: to === "back" ? "back" : sid[to] };
    });
    screens.push({ id: sid[s.key], name: s.name, image: await upload(s.file), width: s.width, height: s.height, hotspots });
  }
  const zoneOf = (screen: string, zone: string) => layout.proto.find((s: any) => s.key === screen).zones[zone];
  const proto = { id: uid(), name: "comida·ya · móvil", device: "mobile", showHints: false, screens };

  /** Simula navegar: steps = [pantalla, zona tocada para salir] */
  const run = (steps: [string, string | null][], outcome: "success" | "gave_up") => {
    let t = 0; const path: any[] = [], clicks: any[] = [];
    for (const [screen, zone] of steps) {
      path.push({ s: sid[screen], t });
      t += int(1500, 6000);
      for (let m = 0; m < (chance(0.3) ? int(1, 3) : 0); m++) { // clics fuera de zona
        clicks.push({ s: sid[screen], x: +rnd().toFixed(4), y: +(0.15 + rnd() * 0.75).toFixed(4), t, h: null }); t += int(600, 2500);
      }
      if (zone) {
        const z = zoneOf(screen, zone);
        clicks.push({ s: sid[screen], x: +(z.x + rnd() * z.w).toFixed(4), y: +(z.y + rnd() * z.h).toFixed(4), t, h: hs[screen][zone] });
        t += int(300, 900);
      }
    }
    return { outcome, path, clicks, ms: t + int(500, 2000) };
  };
  const task1 = blk("prototype_task", "Encuentra el estado de tu último pedido", {
    description: "Navega el prototipo como lo harías en la app real. Cuando creas que terminaste, avanzará solo.",
    prototypeId: proto.id, startScreen: sid.home, goalScreens: [sid.order_detail], expectedPath: [sid.home, sid.orders, sid.order_detail], allowGiveUp: true,
  }, () => pickW([
    () => run([["home", "tab_pedidos"], ["orders", "order_active"], ["order_detail", null]], "success"),
    () => run([["home", "banner"], ["order_detail", null]], "success"),
    () => run([["home", "tab_cuenta"], ["account", "tab_pedidos"], ["orders", "order_active"], ["order_detail", null]], "success"),
    () => run([["home", "tab_cuenta"], ["account", "payments"], ["payments", "back"], ["account", null]], "gave_up"),
  ], [55, 22, 13, 10])());
  const task2 = blk("prototype_task", "Cambia tu método de pago predeterminado", {
    description: "Haz que la Mastercard sea tu tarjeta principal.",
    prototypeId: proto.id, startScreen: sid.home, goalScreens: [sid.methods_ok], expectedPath: [sid.home, sid.account, sid.payments, sid.methods, sid.methods_ok], allowGiveUp: true,
  }, () => pickW([
    () => run([["home", "tab_cuenta"], ["account", "payments"], ["payments", "methods"], ["methods", "make_default"], ["methods_ok", null]], "success"),
    () => run([["home", "tab_pedidos"], ["orders", "tab_cuenta"], ["account", "payments"], ["payments", "methods"], ["methods", "make_default"], ["methods_ok", null]], "success"),
    () => run([["home", "tab_cuenta"], ["account", "payments"], ["payments", "back"], ["account", "payments"], ["payments", "methods"], ["methods", "make_default"], ["methods_ok", null]], "success"),
    () => run([["home", "tab_pedidos"], ["orders", "order_active"], ["order_detail", "back"], ["orders", null]], "gave_up"),
    () => run([["home", "tab_cuenta"], ["account", "payments"], ["payments", "methods"], ["methods", null]], "gave_up"),
  ], [42, 18, 14, 14, 12])());
  const seq = (mean: number) => scale("En general, ¿qué tan difícil o fácil fue completar esta tarea?", 1, 7, "Muy difícil", "Muy fácil", mean, 1.2);
  const confusing = ["El banner de arriba me llevó directo, no sabía que existía la pestaña Pedidos.", "No encontré dónde estaban las tarjetas, pensé que estaría en Pedidos.",
    "Todo bien, fue rápido.", "El botón de hacer predeterminada debería estar en la tarjeta misma.", "La sección Pagos tiene un nombre muy genérico.", "Me perdí un poco entre Cuenta y Pagos.",
    "Esperaba poder cambiar la tarjeta desde el checkout.", "Nada confuso.", "No sabía si se había guardado el cambio hasta ver el mensaje verde."];

  const s1 = await study(P, "Prototype test · Seguimiento y pagos", "prototype_test", [
    welcome("Vas a probar un prototipo. Algunas partes pueden no funcionar: es normal. Recuerda que evaluamos el diseño, no a ti."),
    task1, seq(5.8), task2, seq(4.1), open("¿Hubo algo confuso o que esperabas encontrar de otra forma?", confusing, false), thanks(),
  ], "live", 42, { prototypes: [proto] }, { mobile: 0.8 });

  // Usabilidad no moderada: mismas tareas, otro estudio (bloques nuevos)
  const t1b = { ...task1, id: uid() }; gens.set(t1b.id, gens.get(task1.id)!);
  const t2b = { ...task2, id: uid() }; gens.set(t2b.id, gens.get(task2.id)!);
  const s2 = await study(P, "Usabilidad no moderada · Release 2.4", "usability_unmoderated", [
    welcome("Vas a completar algunas tareas en un prototipo y luego responder unas preguntas cortas. Toma unos 10 minutos."),
    t1b, scale("¿Qué tan fácil fue completar esta tarea?", 1, 7, "Muy difícil", "Muy fácil", 5.9), t2b, scale("¿Qué tan fácil fue completar esta tarea?", 1, 7, "Muy difícil", "Muy fácil", 4.3),
    susBlock("la app", 71), open("¿Qué cambiarías primero?", ["La ubicación de los métodos de pago.", "Que el seguimiento del pedido esté siempre visible.", "Nada, me gustó.", "Poner Pagos como pestaña principal.", "Hacer más grande el botón de ayuda."], false), thanks(),
  ], "closed", 30, { prototypes: [proto], brand: { color: "#0E7490" } }, { mobile: 0.75, days: 25 });

  // First click
  const fc = layout.first_click;
  const fcUrl = await upload(fc.file);
  const area = fc.zones["Mis pedidos"];
  const clickIn = (z: any) => ({ x: +(z.x + rnd() * z.w).toFixed(4), y: +(z.y + rnd() * z.h).toFixed(4) });
  const s3 = await study(P, "First click · Encontrar mis pedidos (web)", "first_click", [
    welcome("Verás algunas pantallas. En cada una, haz clic donde lo harías primero para completar la tarea. Confía en tu primer instinto."),
    blk("first_click", "¿Dónde harías clic para ver el estado de tu pedido?", { image: { url: fcUrl, alt: "Home web" }, area }, () => ({
      ...pickW([() => clickIn(area), () => clickIn(fc.zones.avatar), () => clickIn(fc.zones.cta), () => ({ x: +rnd().toFixed(4), y: +rnd().toFixed(4) })], [64, 16, 11, 9])(),
      ms: int(1800, 14000),
    })),
    scale("¿Qué tan seguro/a estás de tu respuesta?", 1, 5, "Nada seguro", "Muy seguro", 3.8, 1),
    thanks(),
  ], "live", 55, {}, { mobile: 0.1 });

  // Five second
  const fsUrl = await upload(layout.five_second.file);
  const s4 = await study(P, "Five second · Landing de envío gratis", "five_second", [
    welcome("Te mostraremos una pantalla solo por unos segundos. Luego te haremos preguntas sobre lo que recuerdas."),
    blk("five_second", "Observa la siguiente pantalla", { description: "Se mostrará solo por unos segundos.", seconds: 5, image: { url: fsUrl } }, () => ({ seen: true })),
    open("¿De qué trata la página que viste?", ["Una app de comida con envío gratis.", "Era de pedir comida a domicilio.", "Una promoción de envío gratis.", "Algo de restaurantes, no estoy seguro.", "Delivery de comida, ofertas.", "Una página de ofertas."]),
    open("¿Qué elementos recuerdas?", ["El botón morado.", "El título grande de envío gratis.", "El menú de arriba y un botón.", "No recuerdo mucho.", "El logo comida·ya.", "Unas tarjetas a la derecha."], false),
    scale("¿Qué tan confiable te pareció?", 1, 5, "Nada confiable", "Muy confiable", 3.6, 0.9, "stars"),
    thanks(),
  ], "closed", 38, {}, { days: 28 });

  // Preference
  const prefA = await upload(layout.pref_a.file), prefB = await upload(layout.pref_b.file);
  const po = [{ id: uid(), label: "Diseño A", image: prefA }, { id: uid(), label: "Diseño B", image: prefB }];
  const whyA = ["Se lee más claro.", "Me gusta que la búsqueda esté primero.", "Se siente más limpio y profesional.", "El fondo blanco cansa menos.", "Parece más confiable."];
  const whyB = ["Se ve más moderno.", "El modo oscuro me gusta más.", "Las promos llaman la atención.", "Tiene más personalidad.", "Combina con mi celular en modo oscuro."];
  const s5 = await study(P, "Preference test · Home clara vs oscura", "preference_test", [
    welcome("Te mostraremos dos propuestas de diseño. Elige la que prefieras y cuéntanos por qué."),
    blk("preference", "¿Cuál de estos diseños te transmite más confianza para pedir?", { askWhy: true, randomize: true, options: po }, () => {
      const a = chance(0.61);
      return { choice: a ? po[0].id : po[1].id, why: chance(0.9) ? pick(a ? whyA : whyB) : "" };
    }),
    thanks(),
  ], "live", 64);

  await insight(P, s1, "Cambiar el método de pago es difícil de encontrar", "Solo el 42% llegó por la ruta esperada (Cuenta → Pagos → Métodos de pago). Varios participantes buscaron primero en Pedidos.", ["pagos", "navegación"], "high", "high", ["\"No encontré dónde estaban las tarjetas, pensé que estaría en Pedidos.\""]);
  await insight(P, s1, "El banner de pedido activo es un atajo muy usado", "1 de cada 5 personas llegó al detalle desde el banner de Inicio. Conviene mantenerlo visible.", ["seguimiento", "home"], "low", "medium");
  await insight(P, s3, "\"Mis pedidos\" compite con el avatar", "16% hizo clic en el avatar esperando ver sus pedidos en el menú de la cuenta.", ["navegación", "web"], "medium", "medium");
  await insight(P, s5, "Preferencia por el diseño claro", "61% eligió el diseño A por claridad y confianza; quienes eligieron B mencionan modernidad.", ["visual", "marca"], "low", "high");
  await insight(P, null, "Confirmación del cambio poco visible", "Algunos no estaban seguros de que el cambio se guardó hasta ver el mensaje verde.", ["feedback"], "critical", "low");

  await panel(P, [s1, s2], [
    ["María Fernanda López", "mafer.lopez@example.com", ["usuaria frecuente", "CDMX"]], ["Jorge Ramírez", "jorge.r@example.com", ["nuevo"]],
    ["Ana Sofía Torres", "anasofia@example.com", ["usuaria frecuente", "iOS"]], ["Luis Hernández", "luis.h@example.com", ["Android"]],
    ["Daniela Cruz", "dani.cruz@example.com", ["GDL"]], ["Ricardo Méndez", "rmendez@example.com", ["nuevo", "Android"]],
    ["Valeria Gómez", "vale.gomez@example.com", ["usuaria frecuente"]], ["Pablo Ortiz", "pablo.ortiz@example.com", ["MTY", "iOS"]],
  ]);
  await q("insert into report_shares(study_id, token) values ($1,$2)", [s1, token()]);
  await q("insert into report_shares(project_id, study_ids, token) values ($1,$2,$3)", [P, [s1, s3, s5], token()]);
}

// ════ 2. Arquitectura de información ════════════════════════════════
{
  console.log("\n[Test] Tienda online · Arquitectura de información");
  const P = await project("[Test] Tienda online · Arquitectura de información", "Rediseño del menú de cuenta de la tienda: card sorting para descubrir grupos y tree testing para validarlos.", "#2563EB", 35);
  const labels = ["Historial de pedidos", "Seguimiento de envío", "Devoluciones", "Facturas", "Métodos de pago", "Cupones", "Tarjetas de regalo", "Direcciones guardadas", "Datos personales", "Notificaciones", "Preguntas frecuentes", "Chat con soporte"];
  // grupo "real" de cada tarjeta y alternativas plausibles
  const truth: Record<string, string[]> = {
    "Historial de pedidos": ["pedidos"], "Seguimiento de envío": ["pedidos", "ayuda"], "Devoluciones": ["pedidos", "ayuda"], "Facturas": ["pagos", "pedidos"],
    "Métodos de pago": ["pagos", "cuenta"], "Cupones": ["pagos", "promos"], "Tarjetas de regalo": ["pagos", "promos"], "Direcciones guardadas": ["cuenta", "pedidos"],
    "Datos personales": ["cuenta"], "Notificaciones": ["cuenta", "ayuda"], "Preguntas frecuentes": ["ayuda"], "Chat con soporte": ["ayuda"],
  };
  const openNames: Record<string, string[]> = { pedidos: ["Pedidos", "Mis pedidos", "Compras", "Mis compras"], pagos: ["Pagos", "Pagos y facturación", "Billetera"], cuenta: ["Mi cuenta", "Perfil", "Cuenta"], ayuda: ["Ayuda", "Soporte", "Atención al cliente"], promos: ["Promociones", "Descuentos"] };
  const placeCard = (card: string) => { const g = truth[card]; return chance(0.72) ? g[0] : pick(g.length > 1 ? g.slice(1) : Object.keys(openNames)); };

  const sortOpen = (cards: { id: string; label: string }[]) => () => {
    const names: Record<string, string> = {}; const groups: Record<string, string[]> = {};
    for (const c of cards) { const g = placeCard(c.label); names[g] ??= pick(openNames[g]); (groups[g] ??= []).push(c.id); }
    return { groups: Object.entries(groups).map(([g, ids]) => ({ id: uid(), name: names[g], cardIds: ids, custom: true })) };
  };
  const catLabels = ["Mi cuenta", "Compras", "Pagos", "Soporte"];
  const toCat: Record<string, string> = { cuenta: "Mi cuenta", pedidos: "Compras", pagos: "Pagos", ayuda: "Soporte", promos: "Compras" };
  const sortClosed = (cards: { id: string; label: string }[], cats: { id: string; label: string }[], hybrid = false) => () => {
    const groups = new Map<string, { id: string; name: string; cardIds: string[]; custom: boolean }>();
    const promoName = pick(["Promociones", "Descuentos y regalos"]);
    for (const c of cards) {
      const g = placeCard(c.label);
      if (hybrid && g === "promos" && chance(0.7)) {
        const k = "custom-promos"; if (!groups.has(k)) groups.set(k, { id: uid(), name: promoName, cardIds: [], custom: true }); groups.get(k)!.cardIds.push(c.id); continue;
      }
      const cat = cats.find((x) => x.label === toCat[g])!;
      if (!groups.has(cat.id)) groups.set(cat.id, { id: cat.id, name: cat.label, cardIds: [], custom: false });
      groups.get(cat.id)!.cardIds.push(c.id);
    }
    return { groups: [...groups.values()] };
  };
  const hard = ["Cupones, no sabía si va en pagos o en promociones.", "Devoluciones, puede ser pedidos o ayuda.", "Notificaciones no encaja en ningún lado.", "Ninguna, fue fácil.", "Facturas, la puse en pagos pero también es de pedidos.", "Tarjetas de regalo."];
  const cs = (mode: string) => blk("card_sort", "Organiza las tarjetas en los grupos que tengan más sentido para ti", { description: "Agrupa las tarjetas como te parezca más lógico. No hay respuestas correctas.", mode, randomize: true, requireAll: true, cards: opts(...labels), categories: opts(...catLabels) });

  const c1 = cs("open"); gens.set(c1.id, sortOpen(c1.cards));
  const st1 = await study(P, "Card sorting abierto · Menú de cuenta", "card_sort_open", [welcome("Verás una lista de tarjetas. Organízalas en grupos que tengan sentido para ti."), c1, open("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?", hard, false), thanks()], "closed", 24, {}, { days: 34, mobile: 0.2 });
  const c2 = cs("closed"); gens.set(c2.id, sortClosed(c2.cards, c2.categories));
  const st2 = await study(P, "Card sorting cerrado · Validar 4 categorías", "card_sort_closed", [welcome("Verás una lista de tarjetas. Colócalas en la categoría que te parezca correcta."), c2, open("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?", hard, false), thanks()], "live", 31, {}, { mobile: 0.2 });
  const c3 = cs("hybrid"); gens.set(c3.id, sortClosed(c3.cards, c3.categories, true));
  const st3 = await study(P, "Card sorting híbrido · Categorías + nuevas", "card_sort_hybrid", [welcome("Organiza las tarjetas en las categorías existentes o crea las tuyas."), c3, open("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?", hard, false), thanks()], "live", 18, {}, { mobile: 0.2, days: 12 });

  const tree = "Inicio\n  Ofertas\n  Categorías\nMi cuenta\n  Perfil\n  Pagos\n    Métodos de pago\n    Facturas\n  Direcciones\nPedidos\n  Activos\n  Historial\n  Devoluciones\nAyuda\n  Preguntas frecuentes\n  Contacto";
  const leaves = ["Inicio/Ofertas", "Inicio/Categorías", "Mi cuenta/Perfil", "Mi cuenta/Pagos/Métodos de pago", "Mi cuenta/Pagos/Facturas", "Mi cuenta/Direcciones", "Pedidos/Activos", "Pedidos/Historial", "Pedidos/Devoluciones", "Ayuda/Preguntas frecuentes", "Ayuda/Contacto"];
  const prefixes = (id: string) => id.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));
  const tt = (title: string, correct: string[], pDirect: number, pIndirect: number, wrong: string[]) =>
    blk("tree_test", title, { treeText: tree, correct }, () => {
      const r = rnd();
      if (r < pDirect) { const sel = pick(correct); return { selected: sel, path: prefixes(sel), backtracks: 0 }; }
      if (r < pDirect + pIndirect) { const detour = pick(wrong); const sel = pick(correct); return { selected: sel, path: [...prefixes(detour), ...prefixes(sel)], backtracks: 1 + (chance(0.3) ? 1 : 0) }; }
      const sel = chance(0.75) ? pick(wrong) : pick(leaves.filter((l) => !correct.includes(l)));
      return { selected: sel, path: prefixes(sel), backtracks: chance(0.4) ? 1 : 0 };
    });
  const st4 = await study(P, "Tree test · Menú propuesto v2", "tree_test", [
    welcome("Te daremos algunas tareas. Para cada una, navega el menú y elige dónde buscarías."),
    tt("¿Dónde buscarías para cambiar tu método de pago?", ["Mi cuenta/Pagos/Métodos de pago"], 0.58, 0.2, ["Pedidos/Historial", "Mi cuenta/Perfil"]),
    tt("Quieres ver si tu pedido de ayer ya salió. ¿Dónde lo buscarías?", ["Pedidos/Activos"], 0.71, 0.14, ["Pedidos/Historial", "Ayuda/Contacto"]),
    tt("Necesitas una factura de una compra del mes pasado. ¿Dónde la buscarías?", ["Mi cuenta/Pagos/Facturas", "Pedidos/Historial"], 0.47, 0.21, ["Ayuda/Preguntas frecuentes", "Pedidos/Devoluciones"]),
    tt("Llegó un producto dañado y quieres regresarlo. ¿Dónde irías?", ["Pedidos/Devoluciones"], 0.39, 0.18, ["Ayuda/Contacto", "Ayuda/Preguntas frecuentes"]),
    scale("En general, ¿qué tan fácil fue encontrar las cosas?", 1, 7, "Muy difícil", "Muy fácil", 4.9, 1.3),
    thanks(),
  ], "live", 45, {}, { mobile: 0.35 });

  await insight(P, st1, "\"Pagos\" emerge como grupo propio", "En el card sorting abierto, 7 de cada 10 participantes separaron Pagos de Mi cuenta.", ["IA", "pagos"], "medium", "high");
  await insight(P, st3, "Promociones aparece como categoría nueva", "En el híbrido, la mayoría creó un grupo de Promociones para Cupones y Tarjetas de regalo.", ["IA", "promos"], "medium", "medium");
  await insight(P, st4, "Devoluciones tiene la tasa de éxito más baja", "Menos del 40% llegó directo; muchos lo buscaron en Ayuda/Contacto.", ["IA", "devoluciones"], "high", "high", ["Tarea 4 · tree test"]);
  await q("insert into report_shares(project_id, study_ids, token) values ($1,$2,$3)", [P, [st1, st2, st3, st4], token()]);
}

// ════ 3. Métricas ═════════════════════════════════════════════════
{
  console.log("\n[Test] SaaS de facturación · Métricas");
  const P = await project("[Test] SaaS de facturación · Métricas", "Medición trimestral de satisfacción, esfuerzo y usabilidad del producto de facturación electrónica.", "#059669", 90);

  const m1 = await study(P, "SUS · Q4 2026", "sus", [
    welcome("Son 10 afirmaciones cortas sobre tu experiencia. Toma menos de 3 minutos.", "Evaluación de usabilidad"),
    susBlock("el sistema de facturación", 68), open("¿Algo más que quieras contarnos?", ["Timbrar facturas es rápido, pero los reportes son lentos.", "Me gustaría importar clientes desde Excel.", "Todo bien.", "La búsqueda de productos no encuentra por clave SAT.", "Muy buena app."], false), thanks(),
  ], "live", 52, {}, { mobile: 0.15 });

  const nps = blk("nps", "¿Qué tan probable es que recomiendes Factura·Fácil a un amigo o colega?", {}, () => pickW([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 1, 1, 2, 2, 4, 5, 9, 13, 16, 14]));
  const det = open("¿Qué es lo que más deberíamos mejorar?", ["El soporte tarda mucho en responder.", "El precio subió demasiado.", "Faltan reportes de impuestos.", "Se cae al timbrar en fin de mes.", "La app móvil es muy limitada.", "Cancelar una factura es muy complicado."]);
  const pro = open("¡Genial! ¿Qué es lo que más te gusta?", ["Es rapidísimo timbrar.", "El soporte por chat.", "Que todo está en un solo lugar.", "La conciliación automática con el banco.", "Es muy fácil de usar."]);
  nps.logic = { rules: [{ id: uid(), op: "lt", value: 7, goTo: det.id }, { id: uid(), op: "gt", value: 8, goTo: pro.id }], otherwise: det.id };
  det.logic = { rules: [], otherwise: "end" };
  const m2 = await study(P, "NPS · Clientes activos noviembre", "nps", [nps, det, pro, thanks()], "live", 120, {}, {
    incomplete: 0.05, flow: (_c, b, v) => (b.id === nps.id ? ((v as number) >= 9 ? pro.id : det.id) : b.id === det.id ? "end" : null),
  });

  const m3 = await study(P, "CSAT / CES · Soporte por chat", "csat_ces", [
    scale("¿Qué tan satisfecho/a estás con tu experiencia de hoy?", 1, 5, "Muy insatisfecho", "Muy satisfecho", 4.1, 0.9, "stars"),
    scale("La empresa me facilitó resolver lo que necesitaba.", 1, 7, "Totalmente en desacuerdo", "Totalmente de acuerdo", 5.3, 1.4),
    open("¿Qué podríamos hacer mejor?", ["Responder más rápido.", "El agente fue muy amable.", "Tuve que explicar mi problema dos veces.", "Nada, excelente servicio."], false), thanks(),
  ], "closed", 80, {}, { days: 60, incomplete: 0.04 });

  const m4 = await study(P, "SEQ · Timbrar primera factura", "seq", [
    blk("context", "Tarea", { description: "Acabas de crear y timbrar tu primera factura en el sistema.", required: undefined }),
    scale("En general, ¿qué tan difícil o fácil fue completar esta tarea?", 1, 7, "Muy difícil", "Muy fácil", 5.4, 1.3), thanks(),
  ], "live", 35);

  const m5 = await study(P, "UMUX-Lite · App móvil", "umux_lite", [
    scale("Las funciones de este sistema cumplen con mis necesidades.", 1, 7, "Totalmente en desacuerdo", "Totalmente de acuerdo", 5.1, 1.2),
    scale("Este sistema es fácil de usar.", 1, 7, "Totalmente en desacuerdo", "Totalmente de acuerdo", 5.7, 1.1), thanks(),
  ], "live", 40, {}, { mobile: 0.9 });

  const feats = opts("Modo sin conexión", "Recordatorios de pago a clientes", "Modo oscuro", "Facturación recurrente", "Chat con contador");
  const profile = ["A", "O", "I", "M", "A"];
  const pair: Record<string, [number, number][]> = { A: [[1, 3], [1, 4], [2, 3]], O: [[1, 5], [1, 5], [2, 5]], M: [[2, 5], [3, 5], [3, 4]], I: [[3, 3], [3, 4], [2, 3]] };
  const kano = blk("kano", "Cuéntanos cómo te sentirías con estas funcionalidades", {
    description: "Para cada una responderás dos preguntas: si la tuviera y si no la tuviera.", askImportance: true, features: feats,
    funcQ: "Si el producto tuviera «{f}», ¿cómo te sentirías?", dysQ: "Si el producto NO tuviera «{f}», ¿cómo te sentirías?",
  }, () => Object.fromEntries(feats.map((f, k) => {
    const cat = chance(0.65) ? profile[k] : pick(["A", "O", "M", "I"]);
    const [fv, dv] = chance(0.05) ? [5, 1] : pick(pair[cat]);
    return [f.id, { f: fv, d: dv, imp: around(cat === "M" || cat === "O" ? 4.2 : cat === "A" ? 3.4 : 2.2, 0.8, 1, 5) }];
  })));
  const m6 = await study(P, "Kano · Roadmap 2027", "kano", [
    welcome("Te mostraremos algunas funcionalidades. Para cada una te preguntaremos cómo te sentirías si el producto la tuviera y si no la tuviera."),
    kano, open("¿Hay alguna funcionalidad que eches de menos?", ["Integración con mi banco.", "Notas de crédito más fáciles.", "App para iPad.", "Multiusuario con permisos."], false), thanks(),
  ], "closed", 33, {}, { days: 45 });

  await insight(P, m1, "SUS en el promedio de la industria (≈68)", "El puntaje está en el percentil 50. Los comentarios señalan lentitud en reportes.", ["SUS", "rendimiento"], "medium", "high");
  await insight(P, m2, "Detractores mencionan caídas en fin de mes", "Un tercio de los detractores menciona errores al timbrar en cierres de mes.", ["NPS", "estabilidad"], "critical", "medium", ["\"Se cae al timbrar en fin de mes.\""]);
  await insight(P, m6, "Facturación recurrente es obligatoria", "Kano la clasifica como Obligatoria: su ausencia genera mucha insatisfacción.", ["kano", "roadmap"], "high", "medium");
  await q("insert into report_shares(study_id, token) values ($1,$2)", [m2, token()]);
  await q("insert into report_shares(project_id, study_ids, token) values ($1,$2,$3)", [P, [m1, m2, m3, m4, m5, m6], token()]);
  const [rev] = await q("insert into report_shares(study_id, token) values ($1,$2) returning id", [m3, token()]);
  await q("update report_shares set revoked_at = now() - interval '3 days' where id = $1", [rev.id]);
}

// ════ 4. Investigación generativa ═══════════════════════════════════
{
  console.log("\n[Test] Fintech · Investigación generativa");
  const P = await project("[Test] Fintech · Investigación generativa", "Descubrimiento con pequeños negocios: hábitos de cobro, herramientas y prioridades para la nueva app de pagos.", "#EA580C", 20);

  const g1 = await study(P, "Encuesta · Hábitos de cobro", "survey", [
    welcome(),
    choice("¿Con qué frecuencia cobras con tarjeta?", ["Diario", "Varias veces por semana", "Una vez por semana", "Menos de una vez por semana"], [38, 31, 18, 13]),
    choice("¿Qué métodos de cobro aceptas?", ["Efectivo", "Tarjeta", "Transferencia", "Link de pago", "QR"], [0.9, 0.7, 0.75, 0.3, 0.25], { multiple: true, allowOther: true, required: false }, ["Vales de despensa", "Crédito de la casa"]),
    scale("En general, ¿qué tan satisfecho/a estás con tu terminal actual?", 1, 5, "Nada satisfecho", "Muy satisfecho", 3.1, 1.1, "stars"),
    scale("¿Cómo te sientes al cerrar caja al final del día?", 1, 5, "Muy mal", "Muy bien", 3, 1.1, "emoji"),
    open("Si pudieras cambiar una sola cosa, ¿qué sería?", ["Que el dinero llegue el mismo día.", "Comisiones más bajas.", "Que la terminal no se desconecte.", "Ver todas mis ventas en un solo lugar.", "Poder cobrar desde el celular.", "Mejores reportes para mi contador."]),
    thanks(),
  ], "live", 90, {}, { mobile: 0.85 });

  const g2 = await study(P, "Screener · Entrevistas de diciembre", "screener", [
    welcome("Responde estas preguntas rápidas para saber si encajas en nuestro próximo estudio.", "Buscamos participantes"),
    choice("¿Cuál describe mejor tu rol?", ["Dueño/a del negocio", "Encargado/a", "Cajero/a", "Contador/a", "Otro"], [45, 20, 15, 10, 10]),
    choice("¿Qué herramientas usas en tu trabajo?", ["Punto de venta", "Sistema de inventario", "Hojas de cálculo", "App móvil"], [0.6, 0.35, 0.55, 0.7], { multiple: true, allowOther: true }, ["Libreta", "WhatsApp Business"]),
    yesNo("¿Estarías disponible para una sesión de 45 minutos por videollamada?", 0.7),
    blk("open_question", "Correo o WhatsApp para contactarte", { multiline: false, placeholder: "tu@correo.com" }, (c) => `participante${c.i + 1}@example.com`),
    blk("thank_you", "¡Gracias!", { description: "Si tu perfil encaja, te contactaremos pronto.", required: undefined }),
  ], "live", 26, {}, { mobile: 0.9, days: 10 });

  const items = opts("Depósito el mismo día", "Cobro con QR", "Reportes para el contador", "Inventario básico", "Links de pago por WhatsApp");
  const weight = [5, 2.5, 3.5, 1.5, 3];
  const rows = opts("Depósito el mismo día", "Cobro con QR", "Reportes para el contador", "Inventario básico");
  const cols = opts("Nada útil", "Poco útil", "Útil", "Muy útil", "Indispensable");
  const g3 = await study(P, "Priorización · Funciones app de cobro", "prioritization", [
    welcome(),
    blk("ranking", "Ordena estas funciones de la más a la menos importante para ti", { randomize: true, items }, () =>
      items.map((it, k) => ({ id: it.id, s: weight[k] + gauss() * 1.4 })).sort((a, b) => b.s - a.s).map((x) => x.id)),
    blk("matrix", "¿Qué tan útil sería cada funcionalidad para ti?", { rows, columns: cols }, () =>
      Object.fromEntries(rows.map((r, k) => [r.id, cols[around([4.2, 2.6, 3.4, 2][k], 0.9, 1, 5) - 1].id]))),
    open("¿Falta alguna funcionalidad que necesites?", ["Préstamos para mi negocio.", "Facturación automática.", "Control de propinas.", "Programa de lealtad."], false),
    thanks(),
  ], "closed", 40, {}, { days: 18 });

  // Estudio en blanco con todos los tipos de pregunta
  const mx = { rows: opts("La app es fácil de usar", "Confío en que mi dinero está seguro", "Las comisiones son claras"), columns: opts("Muy en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Muy de acuerdo") };
  const g4 = await study(P, "Estudio mixto · Todos los bloques de pregunta", "blank", [
    welcome(),
    blk("context", "Antes de continuar", { description: "Imagina que acabas de cobrar tu primera venta con la app.", required: undefined }),
    yesNo("¿Has usado antes una app para cobrar?", 0.55),
    choice("¿Qué tan grande es tu negocio?", ["Solo yo", "2–5 personas", "6–20 personas", "Más de 20"], [40, 35, 18, 7]),
    scale("¿Qué tan fácil fue cobrar?", 1, 10, "Muy difícil", "Muy fácil", 7.4, 1.6),
    scale("Califica la apariencia de la app", 1, 5, "Mala", "Excelente", 4, 0.8, "stars"),
    blk("matrix", "¿Qué tan de acuerdo estás con cada afirmación?", mx, () => Object.fromEntries(mx.rows.map((r, k) => [r.id, mx.columns[around([4, 3.6, 2.8][k], 0.9, 1, 5) - 1].id]))),
    blk("nps", "¿Qué tan probable es que recomiendes la app a otro negocio?", {}, () => around(7.6, 2, 0, 10)),
    open("¿Qué fue lo más difícil?", ["Configurar mi cuenta bancaria.", "Nada.", "Entender las comisiones.", "Encontrar el botón de cobrar."]),
    thanks(),
  ], "live", 22);

  await study(P, "Borrador · Encuesta de onboarding", "survey", [welcome(), choice("¿Cómo te enteraste de nosotros?", ["Redes sociales", "Recomendación", "Búsqueda en Google"], [1, 1, 1]), thanks()], "draft", 0);
  await study(P, "Encuesta piloto · 1 respuesta", "survey", [welcome(), scale("¿Qué tan útil te parece la app?", 1, 5, "Nada útil", "Muy útil", 4, 0.5), thanks()], "live", 1, {}, { incomplete: 0, days: 2 });
  await study(P, "Encuesta publicada sin respuestas", "survey", [welcome(), yesNo("¿Usas transferencias SPEI para cobrar?", 0.5), thanks()], "live", 0);

  await insight(P, g1, "La liquidez es el dolor principal", "\"Que el dinero llegue el mismo día\" es la respuesta abierta más repetida y la #1 en priorización.", ["cobro", "dinero"], "high", "high");
  await insight(P, g3, "Inventario no es prioridad", "Inventario básico queda último en ranking y en utilidad percibida.", ["roadmap"], "low", "medium");
  await insight(P, null, "Cierre de caja genera ansiedad", "La escala de emojis muestra sentimientos neutros o negativos al cerrar caja.", ["emociones", "cierre"], "medium", "low");
  await panel(P, [g1, g2, g3], [
    ["Rosa Martínez · Abarrotes La Esperanza", "rosa.abarrotes@example.com", ["dueña", "abarrotes"]], ["Héctor Silva · Taller Silva", "taller.silva@example.com", ["dueño", "servicios"]],
    ["Patricia Núñez", "paty.nunez@example.com", ["contadora"]], ["Fernando Ruiz · Café Raíz", "cafe.raiz@example.com", ["dueño", "cafetería"]],
    ["Claudia Morales", "claudia.m@example.com", ["encargada"]], ["Miguel Ángel Díaz", "miguel.diaz@example.com", ["cajero"]],
    ["Sandra Pineda · Estética Sandy", "estetica.sandy@example.com", ["dueña", "belleza"]], ["Tomás Aguilar", "tomas.aguilar@example.com", ["dueño", "ferretería"]],
    ["Lucía Vargas", "lucia.vargas@example.com", ["contadora", "freelance"]], ["Andrés Castillo", "andres.c@example.com", ["encargado"]],
  ]);
}

// ════ 5. Documentos (los 20 tipos, llenos con los datos de ejemplo) ══
{
  console.log("\n[Test] Documentos de investigación");
  const P = await project("[Test] Documentos de investigación", "Un documento de cada plantilla, lleno con datos de ejemplo, para revisar vistas y exportaciones.", "#DB2777", 15);
  let k = 0;
  for (const d of DOC_TEMPLATES) {
    const data = { ...(d.init?.("es") ?? {}), ...(d.example?.("es") ?? {}) };
    await q("insert into documents(project_id, owner_id, kind, title, language, data, share_token, updated_at) values ($1,$2,$3,$4,'es',$5,$6, now() - ($7 || ' hours')::interval)",
      [P, OWNER, d.kind, `${d.name} · ejemplo`, JSON.stringify(data), k % 4 === 0 ? token() : null, String(k * 7)]);
    k++;
  }
  // uno en inglés y uno vacío
  const persona = DOC_TEMPLATES.find((d: any) => d.kind === "persona_profile");
  await q("insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,'persona_profile','User persona (EN)','en',$3)", [P, OWNER, JSON.stringify(persona.example?.("en") ?? {})]);
  await q("insert into documents(project_id, owner_id, kind, title, language, data) values ($1,$2,'journey_map','Journey map vacío','es',$3)", [P, OWNER, JSON.stringify(DOC_TEMPLATES.find((d: any) => d.kind === "journey_map").init?.("es") ?? {})]);
  console.log(`  · ${k + 2} documentos`);
}

// ════ 6. Proyecto vacío y archivado ═════════════════════════════════
{
  await project("[Test] Proyecto vacío", "Sin estudios ni documentos, para revisar los estados vacíos.", "#4F46E5", 1);
  const A = await project("[Test] Proyecto archivado", "Proyecto viejo archivado.", "#1F1633", 200);
  await q("update projects set archived = true where id = $1", [A]);
  console.log("\n[Test] Proyecto vacío · [Test] Proyecto archivado");
}

const [c] = await q(`select (select count(*) from projects where owner_id=$1 and name like '[Test]%') p, (select count(*) from studies s join projects p on p.id=s.project_id where p.owner_id=$1 and p.name like '[Test]%') s,
  (select count(*) from sessions se join studies s on s.id=se.study_id join projects p on p.id=s.project_id where p.owner_id=$1 and p.name like '[Test]%') se`, [OWNER]);
console.log(`\nListo: ${c.p} proyectos, ${c.s} estudios, ${c.se} sesiones.`);
await pool.end();
