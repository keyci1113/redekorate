import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { Bell, Building2, ChevronDown, CircleHelp, LogOut, Plug, Plus, Settings, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { timeAgo, useLoad } from "../lib/hooks";
import type { Project } from "../lib/types";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { cx, Spinner } from "./ui";
import { ErrorBoundary } from "./ErrorBoundary";
import { LangSwitch } from "../lib/i18n";
import { ThemeSwitch } from "../lib/theme";

import { t } from "../lib/i18n";
import { MaintenanceBanner } from "./MaintenanceScreen";
import { pickerProjects } from "../lib/projectPicker";

/** Botón con panel desplegable: se cierra con Escape, al hacer clic afuera o al cambiar de página. */
function Disclosure({ button, buttonClass, label, align = "left", wide, onOpen, children }: { button: ReactNode; buttonClass: string; label?: string; align?: "left" | "right"; wide?: boolean; onOpen?: () => void; children: ReactNode }) {
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
    <div ref={root} className="relative min-w-0 max-w-full">
      <button ref={trigger} type="button" onClick={() => { if (!open) onOpen?.(); setOpen((o) => !o); }} aria-expanded={open} aria-label={label} className={buttonClass}>{button}</button>
      {open && (
        <div className={cx("absolute top-full z-40 mt-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-(--shadow-lift)", align === "right" ? "right-0" : "left-0",
          // The wide panel would run off a phone's left edge, so there it spans the screen instead.
          wide ? "w-96 max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:w-auto" : "w-72")}>
          {children}
        </div>
      )}
    </div>
  );
}

const menuItem = "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 hover:bg-ink/5 hover:text-ink";

interface Notice { id: string; text: string; title: string; number: number; project_id: string; project_name: string; actor_name: string | null; actor_avatar: string | null; read_at: string | null; created_at: string }

/** The bell: what happened on the tickets you are assigned to or tagged on. Checks again every minute and when you come back to the tab. */
function NotificationsBell() {
  const { data, setData, reload } = useLoad(() => api.get<{ notifications: Notice[]; unread: number }>("/notifications"), []);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") void reload(); };
    const timer = window.setInterval(again, 60_000);
    window.addEventListener("focus", again);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", again); };
  }, [reload]);
  const unread = data?.unread ?? 0, list = data?.notifications ?? [];
  const markRead = (ids?: string[]) => {
    const now = new Date().toISOString();
    setData((d) => d && { unread: ids ? Math.max(0, d.unread - d.notifications.filter((n) => ids.includes(n.id) && !n.read_at).length) : 0,
      notifications: d.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)) });
    void api.post("/notifications/read", ids ? { ids } : {}).catch(() => reload());
  };
  const label = unread ? t("Notificaciones: {n} sin leer", { n: unread }) : t("Notificaciones");
  return (
    <Disclosure align="right" wide label={label} onOpen={() => void reload()}
      buttonClass="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink"
      button={<>
        <Bell size={18} aria-hidden />
        {unread > 0 && <span aria-hidden className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-on-accent">{unread > 9 ? "9+" : unread}</span>}
      </>}>
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
        <p className="text-sm font-medium">{t("Notificaciones")}</p>
        {unread > 0 && <button type="button" onClick={() => markRead()} className="focus-ring rounded-md text-xs font-medium text-accent hover:underline">{t("Marcar todas como leídas")}</button>}
      </div>
      {list.length === 0 ? (
        <p className="px-2.5 pt-1 pb-3 text-sm text-ink-3">{t("Aquí verás cuando te asignen un ticket, te mencionen, o se mueva o comente un ticket tuyo.")}</p>
      ) : (
        <ul className="max-h-[min(26rem,70vh)] overflow-y-auto">
          {list.map((n) => (
            <li key={n.id}>
              <Link to={`/projects/${n.project_id}/tickets/${n.number}`} onClick={() => { if (!n.read_at) markRead([n.id]); }}
                className="focus-ring flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-ink/5">
                <Avatar name={n.actor_name ?? "?"} avatar={n.actor_avatar} size={28} />
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-sm", n.read_at ? "text-ink-2" : "font-medium text-ink")}>{n.text}</span>
                  <span className="block truncate text-xs text-ink-2" title={n.title}>{n.title}</span>
                  <span className="block text-[11px] text-ink-3">{n.project_name} · {timeAgo(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"><span className="sr-only">{t("Sin leer")}</span></span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 border-t border-line pt-1">
        <Link to="/account#notificaciones" className={menuItem}><Settings size={15} /> {t("Avisos por correo")}</Link>
      </div>
    </Disclosure>
  );
}


const primaryAction = "focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 text-sm font-medium text-on-accent transition hover:bg-accent/90 sm:px-3.5";

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { data } = useLoad(() => api.get<{ projects: Project[] }>("/projects"), [pathname]);
  const projects = data?.projects.filter((p) => !p.archived) ?? [];
  const current = useMatch("/projects/:id/*")?.params.id;
  const currentProject = projects.find((p) => p.id === current);
  const navClass = ({ isActive }: { isActive: boolean }) => cx("focus-ring shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium transition", isActive ? "bg-ink/5 text-ink" : "text-ink-3 hover:text-ink");
  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print">
        {/* One row from sm up: the project switcher truncates and "Nuevo estudio" turns icon-only below lg. */}
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-(--page-gutter) py-3 sm:flex-nowrap sm:gap-x-4">
          <Link to="/" className="focus-ring order-1 shrink-0 rounded-md"><Logo /></Link>
          <nav className="order-3 flex w-full min-w-0 items-center gap-1 sm:order-2 sm:ml-2 sm:w-auto" aria-label={t("Navegación principal")}>
            <NavLink to="/" end className={navClass}>{t("Inicio")}</NavLink>
            {/* Not `end`: a project and its sub-pages still count as Projects. */}
            <NavLink to="/projects" className={navClass}>{t("Proyectos")}</NavLink>
            <NavLink to="/my-work" className={navClass}>{t("Mi trabajo")}</NavLink>
            <div className="ml-1 min-w-0 max-w-52">
              <Disclosure
                buttonClass="focus-ring flex max-w-full items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-ink-2 transition hover:border-line-2 hover:text-ink"
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
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:gap-3">
            {!data ? (
              // While the list loads (or if it failed), Projects always works.
              <Link to="/projects" aria-label={t("Nuevo estudio")} className={primaryAction}>
                <Plus size={16} /><span className="hidden lg:inline">{t("Nuevo estudio")}</span>
              </Link>
            ) : projects.length === 0 ? (
              <Link to="/projects?crear=1" aria-label={t("Nuevo proyecto")} className={primaryAction}>
                <Plus size={16} /><span className="hidden lg:inline">{t("Nuevo proyecto")}</span>
              </Link>
            ) : (
              // The same project picker on every page; inside a project, that project comes first.
              <Disclosure align="right" label={t("Nuevo estudio")} buttonClass={primaryAction} button={<><Plus size={16} /><span className="hidden lg:inline">{t("Nuevo estudio")}</span></>}>
                <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">{t("¿En qué proyecto?")}</p>
                <div className="max-h-80 overflow-y-auto">
                  {pickerProjects(projects, current).map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}/new`} className={cx(menuItem, p.id === current && "bg-ink/5 font-medium text-ink")}>
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
            <NotificationsBell />
            <NavLink to="/help" aria-label={t("Ayuda y conceptos")} title={t("Ayuda y conceptos")}
              className={({ isActive }) => cx("focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2 transition hover:border-line-2 hover:text-ink", isActive && "bg-ink/5 text-ink")}>
              <CircleHelp size={18} aria-hidden />
            </NavLink>
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
                <Link to="/connect" className={menuItem}><Plug size={15} /> {t("Conectar apps de IA")}</Link>
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
        <MaintenanceBanner />
        {/* Errors and loading stay inside the frame: the menu keeps working while a page loads or if one breaks. */}
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<Spinner />}>
            {/* Keyed by the path only: a new page fades in, while a tab or filter change (?tab=…) keeps the page as it is. */}
            <div key={pathname} className="rk-page-in">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
