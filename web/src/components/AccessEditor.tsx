// What a person can open: which sections, how much they can do and, inside an organization, which projects.
// Used when adding or inviting someone and when changing their access later.
import { Check, FlaskConical, KanbanSquare, Layers, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { AREAS, PROFILES, areasOf, profileOf, type Area, type MemberAccess, type MemberLevel, type Profile } from "../lib/access";
import { ASSIGNABLE_PROJECT_ROLES } from "../lib/roles";
import { Tag, cx } from "./ui";
import { t } from "../lib/i18n";

export const profileLabel = (p: Profile) => (p === "full" ? t("Todo") : p === "research" ? t("Investigación UX") : t("Gestión de proyecto"));
const profileText = (p: Profile) =>
  p === "full" ? t("Investigación y tickets.")
  : p === "research" ? t("Estudios, documentos, insights y participantes. Sin tickets.")
  : t("Tickets, hitos y hoja de ruta. Sin estudios.");
const PROFILE_ICON: Record<Profile, ReactNode> = { full: <Layers size={16} aria-hidden />, research: <FlaskConical size={16} aria-hidden />, tickets: <KanbanSquare size={16} aria-hidden /> };

export const levelLabel = (r: MemberLevel) => (r === "editor" ? t("Editor") : r === "commenter" ? t("Comentarista") : t("Solo lectura"));
const levelText = (r: MemberLevel) =>
  r === "editor" ? t("Crea y cambia lo que hay en sus secciones.")
  : r === "commenter" ? t("Ve todo en sus secciones y deja comentarios.")
  : t("Ve todo en sus secciones sin cambiar nada.");

const areaTitle = (a: Area) => (a === "research" ? t("Investigación UX") : t("Gestión de proyecto"));
const areaItems = (a: Area) => (a === "research" ? t("Estudios · Documentos · Insights · Participantes · Reportes") : t("Tickets · Hitos · Hoja de ruta"));

/** The plain list of what is on and off: the check before saving. */
export function AccessPreview({ areas, level }: { areas: readonly Area[]; level?: MemberLevel }) {
  return (
    <ul className="space-y-1.5 rounded-lg border border-line bg-paper/60 p-3 text-[13px]">
      {AREAS.map((a) => {
        const on = areas.includes(a);
        return (
          <li key={a} className="flex items-start gap-2">
            <span className={cx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", on ? "bg-good-soft text-good" : "bg-ink/5 text-ink-3")}>{on ? <Check size={11} strokeWidth={3} aria-hidden /> : <Minus size={11} aria-hidden />}</span>
            <span className={on ? "" : "text-ink-3"}>
              <span className="font-medium">{areaTitle(a)}</span> <span className="sr-only">{on ? t("con acceso") : t("sin acceso")}</span>
              <span className="block text-xs text-ink-3">{on ? areaItems(a) : t("Sin acceso")}</span>
            </span>
          </li>
        );
      })}
      {level && <li className="border-t border-line pt-1.5 text-xs text-ink-2">{levelLabel(level)}: {levelText(level)}</li>}
    </ul>
  );
}

/** Three cards, one per profile. */
export function ProfilePicker({ value, onChange, name, disabled }: { value: readonly Area[]; onChange: (areas: Area[]) => void; name: string; disabled?: boolean }) {
  const current = profileOf(value);
  return (
    <div role="radiogroup" aria-label={t("Secciones")} className="grid gap-2 sm:grid-cols-3">
      {PROFILES.map((p) => (
        <label key={p} className={cx("focus-within:ring-accent/40 flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition focus-within:ring-2", current === p ? "border-accent bg-accent-soft" : "border-line hover:border-line-2", disabled && "cursor-default opacity-60")}>
          <input type="radio" className="sr-only" name={name} checked={current === p} disabled={disabled} onChange={() => onChange(areasOf(p))} />
          <span className="flex items-center gap-2 text-sm font-semibold">{PROFILE_ICON[p]}{profileLabel(p)}</span>
          <span className="text-xs text-ink-2">{profileText(p)}</span>
        </label>
      ))}
    </div>
  );
}

/** Compact version of the same choice, for a row in a list. */
export function ProfileSelect({ value, onChange, disabled, label }: { value: readonly Area[]; onChange: (areas: Area[]) => void; disabled?: boolean; label: string }) {
  return (
    <select className="field h-8 w-44 py-0 text-[13px]" value={profileOf(value)} disabled={disabled} aria-label={label} onChange={(e) => onChange(areasOf(e.target.value as Profile))}>
      {PROFILES.map((p) => <option key={p} value={p}>{profileLabel(p)}</option>)}
    </select>
  );
}

export function LevelSelect({ value, onChange, disabled, label, className }: { value: MemberLevel; onChange: (r: MemberLevel) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <select className={cx("field", className)} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value as MemberLevel)}>
      {ASSIGNABLE_PROJECT_ROLES.map((r) => <option key={r} value={r}>{levelLabel(r)}</option>)}
    </select>
  );
}

/** Short tags that say what someone has: "Investigación UX", "Editor". */
export function AccessTags({ areas, level }: { areas: readonly Area[]; level?: MemberLevel | "owner" }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Tag>{profileLabel(profileOf(areas))}</Tag>
      {level && level !== "owner" && <Tag>{levelLabel(level)}</Tag>}
    </span>
  );
}

/** The whole choice for an organization member: sections, level and projects. */
export function AccessEditor({ value, onChange, projects, name }: {
  value: MemberAccess; onChange: (v: MemberAccess) => void; name: string;
  projects: { id: string; name: string; color?: string; archived?: boolean }[];
}) {
  const toggle = (id: string) => onChange({ ...value, project_ids: value.project_ids.includes(id) ? value.project_ids.filter((x) => x !== id) : [...value.project_ids, id] });
  const scope = "focus-within:ring-accent/40 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition focus-within:ring-2";
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("¿Qué secciones puede abrir?")}</legend>
        <ProfilePicker name={`${name}-profile`} value={value.areas} onChange={(areas) => onChange({ ...value, areas })} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("¿Qué puede hacer ahí?")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ASSIGNABLE_PROJECT_ROLES.map((r) => (
            <label key={r} className={cx("focus-within:ring-accent/40 flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition focus-within:ring-2", value.project_role === r ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
              <input type="radio" className="sr-only" name={`${name}-level`} checked={value.project_role === r} onChange={() => onChange({ ...value, project_role: r })} />
              <span className="text-sm font-semibold">{levelLabel(r)}</span>
              <span className="text-xs text-ink-2">{levelText(r)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("¿En qué proyectos?")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={cx(scope, value.all_projects ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
            <input type="radio" className="mt-1" name={`${name}-scope`} checked={value.all_projects} onChange={() => onChange({ ...value, all_projects: true })} />
            <span><span className="block font-semibold">{t("Todos los proyectos")}</span><span className="text-xs text-ink-2">{t("Los de hoy y los que se creen después.")}</span></span>
          </label>
          <label className={cx(scope, !value.all_projects ? "border-accent bg-accent-soft" : "border-line hover:border-line-2")}>
            <input type="radio" className="mt-1" name={`${name}-scope`} checked={!value.all_projects} onChange={() => onChange({ ...value, all_projects: false })} />
            <span><span className="block font-semibold">{t("Solo los que elija")}</span><span className="text-xs text-ink-2">{t("No ve ningún otro proyecto de la organización.")}</span></span>
          </label>
        </div>
        {!value.all_projects && (
          projects.length === 0 ? <p className="text-sm text-ink-3">{t("Esta organización aún no tiene proyectos.")}</p> : (
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {projects.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-ink/5">
                    <input type="checkbox" checked={value.project_ids.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: p.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{p.name}{p.archived && <span className="ml-2 text-xs text-ink-3">· {t("archivado")}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          )
        )}
      </fieldset>
      <div>
        <p className="mb-2 text-sm font-medium">{t("Así queda su acceso")}</p>
        <AccessPreview areas={value.areas} level={value.project_role} />
      </div>
    </div>
  );
}
