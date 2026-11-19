// Feedback widget of a project: where its messages go, how to install it, what people can send, privacy and looks,
// next to a live preview drawn by the very script other sites load.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Copy, Pause, Play, RotateCw, Send, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { copy, useLoad } from "../lib/hooks";
import { canEdit as roleCanEdit } from "../lib/roles";
import { plural, relTime, t } from "../lib/i18n";
import type { ProjectRole } from "../lib/types";
import { BackLink, Button, ErrorNote, PageSkeleton, cx } from "../components/ui";
import { TYPES, type TicketType } from "../tickets/model";
import { typeLabel } from "../tickets/parts";
import { AccessNotice } from "../components/AccessNotice";

type Kind = "broken" | "idea" | "question";
interface Settings {
  assignee_id: string | null; types: Record<Kind, TicketType>;
  allow: { screenshot: boolean; recording: boolean; files: boolean; details: boolean; console: boolean };
  privacy: { hide_private: boolean; ask_email: boolean };
  look: { accent: string; position: "bottom-right" | "bottom-left" | "edge-right" | "hidden"; label: string; language: "auto" | "en" | "es"; greeting: string };
}
interface Widget { public_key: string; secret: string | null; paused: boolean; allowed_domains: string[]; settings: Settings; stats: { week: number; last_at: string | null; last_host: string | null }; people: { id: string; name: string }[] }
interface Loaded { widget: Widget; role: ProjectRole; project: { id: string; name: string } }
interface Preview { setConfig: (c: unknown) => void; setUser: (u: unknown) => void; destroy: () => void }
declare global { interface Window { Redekorate?: { preview: (el: HTMLElement, config: unknown, user?: unknown) => Preview } } }

const ACCENTS: [string, string][] = [["#5B21B6", "Violeta"], ["#0F766E", "Verde azulado"], ["#1D4ED8", "Azul"], ["#1A1523", "Tinta"]];
const input = "field min-h-11 rounded-[10px] border-line-2 text-sm";
const Section = ({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-6 py-5">
    <div><h2 className="text-base font-bold">{title}</h2>{sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}</div>{children}
  </section>
);
function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="text-[13px] text-ink-3">{hint}</p></div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("focus-ring relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50", checked ? "bg-accent" : "bg-line-2")}>
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}
const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">{label}{children}{hint && <span className="text-xs font-normal text-ink-3">{hint}</span>}</label>
);

/** The snippet a site pastes once. The user line is optional; without it the widget asks visitors for their email. */
export function snippet(origin: string, key: string, how: "script" | "gtm"): string {
  const user = `<!-- ${t("Opcional: dile al widget quién inició sesión")} -->\n<script>\n  window.RedekorateUser = { id: "u_1842", name: "Mike Jones", email: "mike@acme.com", meta: { plan: "Pro" } };\n</script>`;
  const tag = `<script src="${origin}/widget.js" data-key="${key}" async></script>`;
  return how === "script" ? `${user}\n<!-- ${t("Antes de </body>")} -->\n${tag}` : `<!-- ${t("Google Tag Manager → Etiqueta nueva → HTML personalizado → Activador: All Pages")} -->\n${tag}`;
}

export function WidgetSettingsPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const load = useLoad(() => api.get<Loaded>(`/projects/${id}/widget`), [id]);
  const [draft, setDraft] = useState<{ settings: Settings; domains: string[] } | null>(null);
  const [domain, setDomain] = useState("");
  const [how, setHow] = useState<"script" | "gtm">("script");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<ReactNode>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const previewEl = useRef<HTMLDivElement | null>(null);
  const preview = useRef<Preview | null>(null);
  const w = load.data?.widget;
  useEffect(() => { if (w) setDraft({ settings: w.settings, domains: w.allowed_domains }); }, [w]);

  // Live preview: the real widget script, asked to draw its form here without ever sending.
  const settings = draft?.settings;
  useEffect(() => {
    if (!settings || !previewEl.current) return;
    const el = previewEl.current, who = { name: me?.name, email: me?.email };   // a signed-in visitor, as most sites will show it
    const draw = () => { if (preview.current) preview.current.setConfig(settings); else if (window.Redekorate) preview.current = window.Redekorate.preview(el, settings, who); };
    if (window.Redekorate) { draw(); return; }
    let tag = document.querySelector<HTMLScriptElement>("script[data-rk-preview]");
    if (!tag) { tag = document.createElement("script"); tag.src = "/widget.js"; tag.async = true; tag.dataset.rkPreview = "1"; document.head.appendChild(tag); }
    tag.addEventListener("load", draw);
    return () => tag?.removeEventListener("load", draw);
  }, [settings, me?.name, me?.email]);
  useEffect(() => () => { preview.current?.destroy(); preview.current = null; }, []);

  if (load.loading && !load.data) return <PageSkeleton />;
  if (load.error || !load.data || !w || !draft) return <div className="p-10"><ErrorNote>{load.error ?? ""}</ErrorNote></div>;
  const { project, role } = load.data, canEdit = roleCanEdit(role), s = draft.settings, base = `/projects/${project.id}/widget`;
  const dirty = JSON.stringify(s) !== JSON.stringify(w.settings) || JSON.stringify(draft.domains) !== JSON.stringify(w.allowed_domains);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]> | Settings[K]) => setDraft({ ...draft, settings: { ...s, [k]: typeof v === "object" && v !== null ? { ...(s[k] as object), ...v } : v } as Settings });
  const run = async (fn: () => Promise<{ widget: Widget } | void>, done?: ReactNode) => {
    setBusy(true); setError(null); setNote(null);
    try { const r = await fn(); if (r) load.setData({ ...load.data!, widget: r.widget }); if (done) setNote(done); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => run(() => api.put<{ widget: Widget }>(base, { settings: s, allowed_domains: draft.domains }), t("Cambios guardados. Se aplican en los sitios donde está instalado, sin reinstalar."));
  const addDomain = () => { const d = domain.trim(); if (d && !draft.domains.includes(d)) setDraft({ ...draft, domains: [...draft.domains, d] }); setDomain(""); };
  const doCopy = async (what: string, text: string) => { await copy(text); setCopied(what); setTimeout(() => setCopied(null), 1600); };
  const code = snippet(location.origin, w.public_key, how);
  const kinds: [Kind, string][] = [["broken", t("Algo no funciona")], ["idea", t("Idea")], ["question", t("Pregunta")]];
  const tab = (v: "script" | "gtm", label: string) => <button type="button" role="tab" aria-selected={how === v} onClick={() => setHow(v)} className={cx("focus-ring min-h-9 rounded-lg px-3.5 text-[13px]", how === v ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-2")}>{label}</button>;

  return (
    <div className="page">
      <BackLink to={`/projects/${project.id}?tab=tickets`} label={project.name} section={t("Tickets")} />
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div>
            <h1 className="page-title">{t("Widget de feedback")}</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{t("Agrega un botón de feedback a cualquier sitio o app. Lo que la gente envía llega aquí como tickets, con capturas y los datos de la página.")}</p>
            <AccessNotice role={role} className="mt-3 max-w-2xl" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-6 py-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold"><span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", w.paused ? "bg-warn" : draft.domains.length ? "bg-good" : "bg-line-2")} />
                {w.paused ? t("En pausa") : w.allowed_domains.length ? t("Recibiendo feedback") : t("Aún sin instalar")}</p>
              <p className="mt-0.5 text-[13px] text-ink-3 tabular-nums">{w.stats.last_at
                ? `${plural(w.stats.week, { one: "{n} esta semana", other: "{n} esta semana" })} · ${t("el último {a}", { a: relTime(w.stats.last_at) })}${w.stats.last_host ? ` ${t("desde {a}", { a: w.stats.last_host })}` : ""}`
                : w.allowed_domains.length ? t("Todavía no llega ningún mensaje.") : t("Agrega un dominio permitido y pega el código en tu sitio.")}</p>
            </div>
            {canEdit && <div className="flex flex-wrap gap-2">
              <Button size="lg" icon={<Send size={15} />} disabled={busy} onClick={() => run(async () => { const r = await api.post<{ number: number; ref: string }>(`${base}/test`); await load.reload(); setNote(<>{t("Feedback de prueba enviado ({a}).", { a: r.ref })} <Link to={`/projects/${project.id}/tickets/${r.number}`} className="font-semibold underline">{t("Abrir el ticket #{n}", { n: r.number })}</Link></>); })}>{t("Enviar feedback de prueba")}</Button>
              <Button size="lg" icon={w.paused ? <Play size={15} /> : <Pause size={15} />} disabled={busy} onClick={() => run(() => api.put<{ widget: Widget }>(base, { paused: !w.paused }))}>{w.paused ? t("Reanudar widget") : t("Pausar widget")}</Button>
            </div>}
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          {note && <p role="status" className="rounded-xl bg-good-soft px-4 py-2.5 text-sm text-good">{note}</p>}

          <Section title={t("A dónde va el feedback")} sub={t("Cada mensaje se convierte en un ticket del proyecto {a}.", { a: project.name })}>
            {/* Four fields on one grid, so the section uses its whole width: who gets the tickets, then the type for each kind. */}
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <Field label={t("Asignar los tickets nuevos a")}>
                <select className={input} disabled={!canEdit} value={s.assignee_id ?? ""} onChange={(e) => set("assignee_id", e.target.value || null)}><option value="">{t("Sin asignar")}</option>{w.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </Field>
              {kinds.map(([k, name]) => (
                <Field key={k} label={t("Tipo de ticket para “{a}”", { a: name })}>
                  <select className={input} disabled={!canEdit} value={s.types[k]} onChange={(e) => set("types", { [k]: e.target.value as TicketType })}>{TYPES.map((x) => <option key={x} value={x}>{typeLabel(x)}</option>)}</select>
                </Field>
              ))}
            </div>
            <p className="text-[13px] text-ink-3">{t("Los tickets nuevos empiezan en Por hacer con la etiqueta feedback, para que puedas filtrarlos en el tablero.")}</p>
          </Section>

          <Section title={t("Instalar")} sub={t("Pega esto una vez en el otro sistema. Los cambios que hagas aquí se aplican sin reinstalar.")}>
            <div role="tablist" aria-label={t("Método de instalación")} className="flex w-fit gap-1 rounded-[10px] bg-ink/5 p-1">{tab("script", t("Etiqueta script"))}{tab("gtm", "Google Tag Manager")}</div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-xl bg-[#1A1523] p-4 pr-24 text-[12.5px] leading-relaxed text-[#EDE9F5]"><code>{code}</code></pre>
              <Button className="absolute top-3 right-3" size="sm" icon={<Copy size={13} />} onClick={() => doCopy("code", code)}>{copied === "code" ? t("Copiado") : t("Copiar")}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
              <span className="font-semibold">{t("Clave pública")}</span><code className="rounded bg-ink/5 px-2 py-1 text-[12.5px]">{w.public_key}</code>
              <span className="text-ink-3">· {t("puede ir en tu sitio. Solo funciona en los dominios de abajo.")}</span>
              {canEdit && <Button size="sm" icon={<RotateCw size={13} />} disabled={busy} onClick={() => { if (confirm(t("La clave actual deja de funcionar de inmediato y habrá que actualizar el código en cada sitio. ¿Rotar la clave?"))) void run(() => api.post<{ widget: Widget }>(`${base}/rotate-key`), t("Clave rotada. Actualiza el código en tus sitios.")); }}>{t("Rotar clave")}</Button>}
            </div>
            <p className="text-[13px] text-ink-3">{t("Sin los datos del usuario, el widget le pide su correo a quien escribe. En una app de una sola página puedes llamar a")} <code className="text-[12.5px]">Redekorate.identify(&#123;…&#125;)</code> {t("cuando alguien inicia sesión.")} <Link to="/help#widget" className="focus-ring rounded font-semibold text-accent-ink hover:underline">{t("Leer la guía del widget")}</Link></p>
            {w.secret && (
              <details className="rounded-xl border border-line px-4 py-3 text-[13px]">
                <summary className="focus-ring cursor-pointer rounded font-semibold">{t("Usuarios verificados (opcional)")}</summary>
                <p className="mt-2 text-ink-2">{t("Cualquiera puede escribir un nombre en el navegador. Para que un ticket diga “usuario verificado”, tu servidor firma el id del usuario con esta clave secreta (HMAC-SHA256, en hexadecimal) y lo envía como hash junto a id, name y email. La clave secreta nunca va en el navegador.")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-ink/5 px-2 py-1 text-[12.5px]">{showSecret ? w.secret : "rk_sec_••••••••••••••••"}</code>
                  <Button size="sm" onClick={() => setShowSecret(!showSecret)}>{showSecret ? t("Ocultar") : t("Mostrar")}</Button>
                  <Button size="sm" icon={<Copy size={13} />} onClick={() => doCopy("secret", w.secret!)}>{copied === "secret" ? t("Copiado") : t("Copiar")}</Button>
                </div>
              </details>
            )}
          </Section>

          <Section title={t("Dominios permitidos")} sub={t("El feedback enviado desde cualquier otro sitio se rechaza.")}>
            <ul className="flex flex-wrap gap-2">
              {draft.domains.map((d) => (
                <li key={d} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-paper py-0.5 pr-1 pl-3 text-[13px] font-medium">{d}
                  {canEdit && <button type="button" onClick={() => setDraft({ ...draft, domains: draft.domains.filter((x) => x !== d) })} aria-label={t("Quitar {a}", { a: d })} className="focus-ring relative rounded-full p-1 text-ink-3 before:absolute before:-inset-2 hover:text-ink"><X size={13} /></button>}
                </li>
              ))}
              {draft.domains.length === 0 && <li className="text-[13px] text-ink-3">{t("Ninguno todavía: el widget no aparecerá en ningún sitio.")}</li>}
            </ul>
            {canEdit && <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); addDomain(); }}>
              <Field label={t("Agregar un dominio")}><input className={cx(input, "w-72 max-w-full")} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("p. ej. app.acme.com o *.acme.com")} /></Field>
              <Button type="submit" size="lg" disabled={!domain.trim()}>{t("Agregar")}</Button>
            </form>}
          </Section>

          <Section title={t("Qué puede enviar la gente")}>
            <Switch disabled={!canEdit} label={t("Capturas de pantalla con marcas")} hint={t("Captura la página actual; la gente puede resaltar y ocultar áreas.")} checked={s.allow.screenshot} onChange={(v) => set("allow", { screenshot: v })} />
            <Switch disabled={!canEdit} label={t("Grabaciones de pantalla")} hint={t("Hasta 2 minutos. El navegador pide permiso antes.")} checked={s.allow.recording} onChange={(v) => set("allow", { recording: v })} />
            <Switch disabled={!canEdit} label={t("Archivos adjuntos")} hint={t("Imágenes, PDF y video de hasta 10 MB.")} checked={s.allow.files} onChange={(v) => set("allow", { files: v })} />
            <Switch disabled={!canEdit} label={t("Datos de la página y del navegador")} hint={t("URL, navegador, sistema, tamaño de pantalla y los datos que tu app envía del usuario.")} checked={s.allow.details} onChange={(v) => set("allow", { details: v })} />
            <Switch disabled={!canEdit} label={t("Errores de la consola")} hint={t("Los últimos 20 errores de la página. Apagado de fábrica.")} checked={s.allow.console} onChange={(v) => set("allow", { console: v })} />
          </Section>

          <Section title={t("Privacidad")}>
            <Switch disabled={!canEdit} label={t("Ocultar campos privados automáticamente")} hint={t("Lo que marques con data-rk-private se tapa en capturas y grabaciones.")} checked={s.privacy.hide_private} onChange={(v) => set("privacy", { hide_private: v })} />
            <Switch disabled={!canEdit} label={t("Pedir correo a visitantes anónimos")} hint={t("Pueden enviar sin escribirlo; solo no podrás responderles.")} checked={s.privacy.ask_email} onChange={(v) => set("privacy", { ask_email: v })} />
            <p className="text-[13px] text-ink-3">{t("El feedback se guarda en tu servidor de Redekorate. Los datos de quien reportó se eliminan desde su ticket.")}</p>
          </Section>

          <Section title={t("Apariencia")}>
            <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
              <legend className="mb-2 text-[13px] font-semibold">{t("Color de acento")}</legend>
              <div className="flex flex-wrap items-center gap-2.5">
                {ACCENTS.map(([hex, name]) => (
                  <label key={hex} className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full has-focus-visible:ring-2 has-focus-visible:ring-accent has-focus-visible:ring-offset-2">
                    <input type="radio" name="rk-accent" className="sr-only" aria-label={t(name)} checked={s.look.accent.toLowerCase() === hex.toLowerCase()} onChange={() => set("look", { accent: hex })} />
                    <span aria-hidden className={cx("h-8 w-8 rounded-full ring-offset-2 ring-offset-surface", s.look.accent.toLowerCase() === hex.toLowerCase() && "ring-2 ring-ink")} style={{ background: hex }} />
                  </label>
                ))}
                <label className="flex items-center gap-2 text-[13px] text-ink-3">{t("o un hex")}
                  <input className={cx(input, "w-28 tabular-nums")} value={s.look.accent} maxLength={7} onChange={(e) => set("look", { accent: e.target.value })} aria-invalid={!/^#[0-9a-fA-F]{6}$/.test(s.look.accent)} /></label>
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Posición")}>
                <select className={input} disabled={!canEdit} value={s.look.position} onChange={(e) => set("look", { position: e.target.value as Settings["look"]["position"] })}>
                  <option value="bottom-right">{t("Abajo a la derecha")}</option><option value="bottom-left">{t("Abajo a la izquierda")}</option><option value="edge-right">{t("Pestaña en el borde derecho")}</option><option value="hidden">{t("Oculto (se abre desde tu propio botón)")}</option>
                </select>
              </Field>
              <Field label={t("Texto del botón")}><input className={input} disabled={!canEdit} maxLength={24} value={s.look.label} placeholder={t("Feedback / Comentarios")} onChange={(e) => set("look", { label: e.target.value })} /></Field>
              <Field label={t("Idioma")}>
                <select className={input} disabled={!canEdit} value={s.look.language} onChange={(e) => set("look", { language: e.target.value as Settings["look"]["language"] })}>
                  <option value="auto">{t("El de la página (inglés o español)")}</option><option value="en">{t("Inglés")}</option><option value="es">{t("Español")}</option>
                </select>
              </Field>
              <Field label={t("Saludo")} hint={t("Usa {name} para el nombre de quien inició sesión. Vacío = el saludo de fábrica.")}><input className={input} disabled={!canEdit} maxLength={80} value={s.look.greeting} placeholder="Hi {name}, how can we help?" onChange={(e) => set("look", { greeting: e.target.value })} /></Field>
            </div>
            {s.look.position === "hidden" && <p className="text-[13px] text-ink-3">{t("Con el botón oculto, abre el widget desde tu app con")} <code className="text-[12.5px]">Redekorate.open()</code>.</p>}
          </Section>

          {canEdit && (
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-surface px-5 py-3 shadow-(--shadow-lift)">
              <span className="mr-auto text-[13px] text-ink-3" role="status">{dirty ? t("Tienes cambios sin guardar.") : t("Todo guardado.")}</span>
              <Button size="lg" disabled={!dirty || busy} onClick={() => { setDraft({ settings: w.settings, domains: w.allowed_domains }); setError(null); }}>{t("Descartar cambios")}</Button>
              <Button size="lg" variant="primary" disabled={!dirty || busy || !/^#[0-9a-fA-F]{6}$/.test(s.look.accent)} onClick={() => void save()}>{t("Guardar cambios")}</Button>
            </div>
          )}
        </div>
        <aside aria-label={t("Vista previa|widget")} className="flex w-full flex-[1_1_380px] flex-col gap-3 lg:sticky lg:top-4 lg:max-w-[420px]">
          <p className="text-[13px] font-semibold text-ink-2">{t("Vista previa|widget")}</p>
          <div className="rounded-2xl border border-dashed border-line-2 bg-paper-2 p-4"><div ref={previewEl} /></div>
          <p className="text-xs text-ink-3">{t("La dibuja el mismo script que cargan tus sitios. Aquí no captura ni envía nada.")}</p>
        </aside>
      </div>
    </div>
  );
}
