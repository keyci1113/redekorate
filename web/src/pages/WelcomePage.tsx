import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Check, Compass, FolderPlus, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getLang, setContentLang, t, useLang, type Lang } from "../lib/i18n";
import { nextStep, progress, steps, type OnboardingCtx, type Step } from "../lib/onboarding";
import type { Organization, Project, Study, User } from "../lib/types";
import { TEMPLATES, templateByKey } from "../templates/catalog";
import { CATEGORY_ICON } from "../templates/icons";
import { Button, ErrorNote, Field, Spinner, cx } from "../components/ui";
import { ImageDrop, Segmented } from "../components/editing";
import { Avatar } from "../components/Avatar";
import { OrgLogo } from "../components/OrgLogo";
import { OrgForm } from "../components/OrgForm";
import { PROJECT_COLORS } from "../components/ProjectForm";
import { AuthShell } from "./LoginPage";

/** Methods offered on the last step: one per common first question. */
const FIRST_METHODS = ["survey", "card_sort_open", "prototype_test", "usability_unmoderated"];

const STEP_LABEL = (): Record<Step, string> => ({ profile: t("Tu perfil"), workspace: t("Tu espacio"), project: t("Primer proyecto"), method: t("Primer estudio") });

/**
 * First-run wizard. Every step can be skipped and "Finish later" leaves at any point; both mark the account as
 * onboarded on the server so it never shows again on any device. Steps adapt: someone invited to an organization
 * skips the workspace step, someone invited to a project skips project and method.
 */
export function WelcomePage() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const [ctx, setCtx] = useState<OnboardingCtx | null>(null);
  const [step, setStep] = useState<Step>("profile");
  const [org, setOrg] = useState<Organization | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.get<{ organizations: Organization[] }>("/orgs"), api.get<{ projects: Project[] }>("/projects")])
      .then(([o, p]) => setCtx({ inOrg: o.organizations.length > 0, hasProjects: p.projects.length > 0 }))
      .catch(() => setCtx({ inOrg: false, hasProjects: false }));
  }, []);

  async function finish(to: string) {
    setBusy(true); setError(null);
    try { const { user: u } = await api.post<{ user: User }>("/auth/onboarded"); setUser(u); nav(to, { replace: true }); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const advance = () => { const n = nextStep(step, ctx!); if (n) setStep(n); else void finish("/"); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); advance(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };

  if (!ctx || !user) return <AuthShell><Spinner /></AuthShell>;
  const { index, total } = progress(step, ctx);
  const list = steps(ctx);

  return (
    <AuthShell>
      <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-3" aria-label={t("Pasos")}>
        {list.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cx("flex items-center gap-1.5", s === step && "text-accent", i < index - 1 && "text-ink-2")} aria-current={s === step ? "step" : undefined}>
              <span className={cx("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", s === step ? "bg-accent text-on-accent" : i < index - 1 ? "bg-good-soft text-good" : "bg-line")}>{i < index - 1 ? <Check size={11} /> : i + 1}</span>
              {STEP_LABEL()[s]}
            </span>
            {i < list.length - 1 && <span className="h-px w-5 bg-line-2" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === "profile" && <ProfileStep user={user} onUser={setUser} busy={busy} onNext={(name) => run(async () => { if (name !== user.name) { const { user: u } = await api.patch<{ user: User }>("/auth/me", { name }); setUser(u); } })} />}
      {step === "workspace" && <WorkspaceStep busy={busy} onSolo={() => advance()} onOrg={(o) => { setOrg(o); advance(); }} />}
      {step === "project" && <ProjectStep org={org} busy={busy} onCreate={(v) => run(async () => { const { project: p } = await api.post<{ project: Project }>("/projects", { ...v, organization_id: org?.id ?? null }); setProject(p); })} />}
      {step === "method" && <MethodStep busy={busy} project={project} org={org} onExplore={() => finish(project ? `/projects/${project.id}` : "/")} onPick={async (key, lang) => {
        if (!project) return finish("/");
        setBusy(true); setError(null);
        try {
          const tpl = templateByKey(key)!;
          setContentLang(lang); const blocks = tpl.build?.() ?? []; setContentLang(getLang());
          const brand = org ? { color: org.color, logo: org.logo ?? undefined } : undefined;
          const { study } = await api.post<{ study: Study }>("/studies", { project_id: project.id, title: tpl.name, method: key, blocks, settings: { language: lang, ...(brand ? { brand } : {}) } });
          await finish(`/studies/${study.id}/edit`);
        } catch (e) { setError((e as Error).message); setBusy(false); }
      }} />}

      {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
      <div className="mt-8 flex items-center justify-between text-sm">
        <span className="text-ink-3 tabular-nums">{t("Paso {a} de {b}", { a: index, b: total })}</span>
        <button type="button" disabled={busy} onClick={() => finish("/")} className="focus-ring rounded font-medium text-ink-3 hover:text-ink">{t("Terminar después")}</button>
      </div>
    </AuthShell>
  );
}

function ProfileStep({ user, onUser, busy, onNext }: { user: User; onUser: (u: User) => void; busy: boolean; onNext: (name: string) => void }) {
  const [name, setName] = useState(user.name);
  const { lang, setLang } = useLang();
  return (
    <form className="mt-8" onSubmit={(e) => { e.preventDefault(); onNext(name.trim() || user.name); }}>
      <h1 className="display text-4xl sm:text-5xl">{t("Hola, {a}", { a: user.name.split(" ")[0] })}</h1>
      <p className="mt-3 text-base text-ink-2">{t("Empecemos por cómo te verán las personas con las que colabores.")}</p>
      <div className="mt-8 space-y-5">
        <Field group label={t("Foto de perfil")} hint={t("Opcional. Cuadrada funciona mejor.")}>
          <div className="flex items-center gap-4">
            <Avatar name={name || user.name} avatar={user.avatar} size={64} />
            <div className="w-40"><ImageDrop compact cover value={user.avatar} label={t("Subir foto")} onChange={async (url) => { const { user: u } = await api.patch<{ user: User }>("/auth/me", { avatar: url }); onUser(u); }} /></div>
          </div>
        </Field>
        <Field label={t("Nombre")}><input className="field h-12 text-base" required value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} /></Field>
        <Field group label={t("Idioma de la interfaz")} hint={t("Cada estudio y documento tiene su propio idioma, independiente de este.")}>
          <Segmented value={lang} onChange={(l) => setLang(l as Lang)} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} />
        </Field>
      </div>
      <Button variant="primary" size="lg" className="mt-8 w-full" icon={<ArrowRight size={16} />} disabled={busy}>{t("Continuar")}</Button>
    </form>
  );
}

function WorkspaceStep({ busy, onSolo, onOrg }: { busy: boolean; onSolo: () => void; onOrg: (o: Organization) => void }) {
  const [creating, setCreating] = useState(false);
  const card = "focus-ring flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition";
  return (
    <div className="mt-8">
      <h1 className="display text-4xl sm:text-5xl">{t("¿Dónde vivirán tus proyectos?")}</h1>
      <p className="mt-3 text-base text-ink-2">{t("Puedes cambiarlo después, y mover proyectos entre espacios cuando quieras.")}</p>
      <div className="mt-8 space-y-3">
        <button type="button" disabled={busy} onClick={onSolo} className={cx(card, "border-line bg-surface hover:border-accent")}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><UserRound size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t("Solo yo, por ahora")}</span>
            <span className="mt-0.5 block text-sm text-ink-2">{t("Proyectos personales. Puedes invitar colaboradores a cada proyecto.")}</span>
          </span>
          <ArrowRight size={18} className="mt-3 shrink-0 text-ink-3" />
        </button>
        <div className={cx(card, "flex-col items-stretch", creating ? "border-accent bg-surface" : "border-line bg-surface")}>
          <button type="button" disabled={busy} onClick={() => setCreating((c) => !c)} aria-expanded={creating} className="focus-ring flex w-full items-start gap-4 rounded-lg text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><Building2 size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t("Crear una organización")}</span>
              <span className="mt-0.5 block text-sm text-ink-2">{t("Para tu empresa, tu equipo o un cliente: con logo, y todas sus personas ven y comentan los proyectos.")}</span>
            </span>
            <ArrowRight size={18} className={cx("mt-3 shrink-0 text-ink-3 transition", creating && "rotate-90")} />
          </button>
          {creating && <div className="mt-5 border-t border-line pt-5"><OrgForm compact submitLabel={t("Crear y continuar")} onSubmit={async (v) => { const { organization } = await api.post<{ organization: Organization }>("/orgs", v); onOrg(organization); }} /></div>}
        </div>
      </div>
    </div>
  );
}

function ProjectStep({ org, busy, onCreate }: { org: Organization | null; busy: boolean; onCreate: (v: { name: string; color: string; description: string }) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  return (
    <form className="mt-8" onSubmit={(e) => { e.preventDefault(); onCreate({ name: name.trim() || t("Mi primer proyecto"), color, description: "" }); }}>
      <h1 className="display text-4xl sm:text-5xl">{t("Tu primer proyecto")}</h1>
      <p className="mt-3 text-base text-ink-2">{t("Un proyecto agrupa los estudios, documentos e insights de un producto o un cliente.")}</p>
      <div className="mt-8 space-y-5">
        <Field label={t("Nombre del proyecto")}><input autoFocus className="field h-12 text-base" placeholder={t("p. ej. Rediseño app de Rutas")} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field group label={t("Color")}>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} className={cx("focus-ring h-8 w-8 rounded-lg transition", color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />)}
          </div>
        </Field>
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <FolderPlus size={15} className="text-ink-3" />
          {org ? <>{t("Se creará en")} <OrgLogo name={org.name} logo={org.logo} color={org.color} size={18} /> <b>{org.name}</b></> : t("Se creará como proyecto personal.")}
        </p>
      </div>
      <Button variant="primary" size="lg" className="mt-8 w-full" icon={<ArrowRight size={16} />} disabled={busy}>{t("Crear proyecto y continuar")}</Button>
    </form>
  );
}

function MethodStep({ busy, project, org, onPick, onExplore }: { busy: boolean; project: Project | null; org: Organization | null; onPick: (key: string, lang: Lang) => void; onExplore: () => void }) {
  const [lang, setLang] = useState<Lang>(getLang());
  const picks = useMemo(() => FIRST_METHODS.map((k) => TEMPLATES.find((x) => x.key === k)!).filter(Boolean), []);
  return (
    <div className="mt-8">
      <h1 className="display text-4xl sm:text-5xl">{t("¿Qué quieres averiguar primero?")}</h1>
      <p className="mt-3 text-base text-ink-2">{project ? t("Creamos un estudio en {a} con bloques listos para editar.", { a: project.name }) : t("Elige un método para empezar.")}{org ? ` ${t("Llevará el logo y el color de la organización.")}` : ""}</p>
      <div className="mt-6 max-w-xs"><Field group label={t("Idioma para participantes")}><Segmented value={lang} onChange={setLang} options={[{ id: "es", label: "Español" }, { id: "en", label: "English" }]} /></Field></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {picks.map((tpl) => (
          <button key={tpl.key} type="button" disabled={busy} onClick={() => onPick(tpl.key, lang)}
            className="focus-ring flex flex-col rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-accent/10 motion-reduce:transform-none">
            <span className="flex items-center gap-2 text-accent">{CATEGORY_ICON[tpl.category]}<span className="font-semibold text-ink">{tpl.name}</span></span>
            <span className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{tpl.when}</span>
            <span className="mt-3 text-xs text-ink-3">{tpl.duration} · {tpl.participants} {t("participantes")}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={busy} onClick={onExplore} className="focus-ring mt-6 flex items-center gap-2 rounded text-sm font-medium text-accent">
        <Compass size={15} /> {t("Prefiero explorar por mi cuenta")}
      </button>
    </div>
  );
}
