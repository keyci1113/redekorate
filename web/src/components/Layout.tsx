import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { Building2, ChevronDown, CircleHelp, LogOut, Plus, Settings, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Project } from "../lib/types";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { cx } from "./ui";
import { LangSwitch } from "../lib/i18n";
import { ThemeSwitch } from "../lib/theme";

import { t } from "../lib/i18n";

/** Botón con panel desplegable: se cierra con Escape, al hacer clic afuera o al cambiar de página. */
function Disclosure({ button, buttonClass, label, align = "left", children }: { button: ReactNode; buttonClass: string; label?: string; align?: "left" | "right"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pathname, search } = useLocation();
  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button ref={trigger} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label} className={buttonClass}>{button}</button>
      {open && (
        <div className={cx("absolute top-full z-40 mt-1.5 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-lift)", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

const menuItem = "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-ink/5 hover:text-ink";

const primaryAction = "focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 text-sm font-medium text-on-accent transition hover:bg-accent/90 sm:px-3.5";

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { data } = useLoad(() => api.get<{ projects: Project[] }>("/projects"), [pathname]);
  const projects = data?.projects.filter((p) => !p.archived) ?? [];
  const current = useMatch("/projects/:id/*")?.params.id;
  const currentProject = projects.find((p) => p.id === current);
  const navClass = ({ isActive }: { isActive: boolean }) => cx("focus-ring rounded-lg px-2.5 py-1.5 text-sm font-medium transition", isActive ? "bg-ink/5 text-ink" : "text-ink-3 hover:text-ink");
  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-(--page-gutter) py-3 sm:gap-x-4">
          <Link to="/" className="focus-ring order-1 rounded-md"><Logo /></Link>
          <nav className="order-3 flex w-full items-center gap-1 sm:order-2 sm:ml-2 sm:w-auto" aria-label={t("Navegación principal")}>
            <NavLink to="/" end className={navClass}>{t("Inicio")}</NavLink>
            <NavLink to="/projects" end className={navClass}>{t("Proyectos")}</NavLink>
            <div className="ml-1">
              <Disclosure
                buttonClass="focus-ring flex max-w-52 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-ink-2 transition hover:border-line-2 hover:text-ink"
                button={<>
                  <span className="truncate" title={currentProject?.name}>{currentProject?.name ?? t("Cambiar de proyecto")}</span>
                  <ChevronDown size={14} className="shrink-0" />
                </>}
              >
                <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{t("Recientes")}</p>
                <div className="max-h-80 overflow-y-auto">
                  {projects.length === 0 && <p className="px-2.5 py-2 text-sm text-ink-3">{t("Aún no tienes proyectos.")}</p>}
                  {projects.slice(0, 12).map((p) => (
                    <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => cx(menuItem, isActive && "bg-ink/5 font-medium text-ink")}>
                      <span className="truncate" title={p.name}>{p.name}</span>
                    </NavLink>
                  ))}
                </div>
                <div className="mt-1 border-t border-line pt-1"><Link to="/projects" className={menuItem}>{t("Ver todos los proyectos")}</Link></div>
              </Disclosure>
            </div>
          </nav>
          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:gap-3">
            {current || !data ? (
              // Dentro de un proyecto va directo. Si la lista aún no carga (o falló), Proyectos siempre sirve.
              <Link to={current ? `/projects/${current}/new` : "/projects"} aria-label={t("Nuevo estudio")} className={primaryAction}>
                <Plus size={16} /><span className="hidden sm:inline">{t("Nuevo estudio")}</span>
              </Link>
            ) : projects.length === 0 ? (
              <Link to="/projects?crear=1" aria-label={t("Nuevo proyecto")} className={primaryAction}>
                <Plus size={16} /><span className="hidden sm:inline">{t("Nuevo proyecto")}</span>
              </Link>
            ) : (
              <Disclosure align="right" label={t("Nuevo estudio")} buttonClass={primaryAction} button={<><Plus size={16} /><span className="hidden sm:inline">{t("Nuevo estudio")}</span></>}>
                <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{t("¿En qué proyecto?")}</p>
                <div className="max-h-80 overflow-y-auto">
                  {projects.slice(0, 12).map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}/new`} className={menuItem}>
                      <span className="truncate" title={p.name}>{p.name}</span>
                    </Link>
                  ))}
                </div>
                <div className="mt-1 border-t border-line pt-1">
                  <Link to="/projects" className={menuItem}>{t("Ver todos los proyectos")}</Link>
                  <Link to="/projects?crear=1" className={menuItem}><Plus size={15} /> {t("Nuevo proyecto")}</Link>
                </div>
              </Disclosure>
            )}
            <Disclosure
              align="right"
              label={t("Menú de la cuenta")}
              buttonClass="focus-ring flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-90"
              button={<Avatar name={user?.name ?? ""} avatar={user?.avatar} size={36} />}
            >
              <div className="px-2.5 py-1.5">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-ink-3">{user?.email}</p>
              </div>
              <div className="mt-1 border-t border-line pt-1">
                <Link to="/account" className={menuItem}><Settings size={15} /> {t("Mi cuenta")}</Link>
                <Link to="/orgs" className={menuItem}><Building2 size={15} /> {t("Organizaciones")}</Link>
                <Link to="/help" className={menuItem}><CircleHelp size={15} /> {t("Ayuda y conceptos")}</Link>
                {user?.role === "admin" && <Link to="/admin/users" className={menuItem}><Users size={15} /> {t("Usuarios")}</Link>}
                <div className="flex items-center justify-between px-2.5 py-1.5 text-sm text-ink-2">{t("Idioma")}<LangSwitch /></div>
                <div className="flex items-center justify-between px-2.5 py-1.5 text-sm text-ink-2">{t("Tema")}<ThemeSwitch /></div>
              </div>
              <div className="mt-1 border-t border-line pt-1">
                <button type="button" onClick={logout} className={menuItem}><LogOut size={15} /> {t("Cerrar sesión")}</button>
              </div>
            </Disclosure>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1 bg-paper-2">
        <Outlet />
      </main>
    </div>
  );
}
