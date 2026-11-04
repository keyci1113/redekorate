import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { FolderKanban, Home, LogOut, Settings } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import type { Project } from "../lib/types";
import { Logo } from "./Logo";
import { cx } from "./ui";
import { LangSwitch } from "../lib/i18n";

import { t } from "../lib/i18n";
export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { data } = useLoad(() => api.get<{ projects: Project[] }>("/projects"), [pathname]);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-paper px-3 py-4 md:flex">
        <Link to="/" className="focus-ring mb-6 rounded-md px-2"><Logo /></Link>
        {([["/", t("Inicio"), Home], ["/projects", t("Proyectos"), FolderKanban], ["/account", t("Mi cuenta"), Settings]] as const).map(([to, l, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cx("focus-ring mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium", isActive ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-ink/5")}>
            <Icon size={16} /> {l}
          </NavLink>
        ))}
        <p className="label mt-6 mb-2 px-2.5">{t("Recientes")}</p>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {data?.projects.filter((p) => !p.archived).slice(0, 12).map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => cx("focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]", isActive ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-ink/5")}>
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-3 flex items-center justify-between px-2.5"><span className="text-xs text-ink-3">{t("Idioma")}</span><LangSwitch /></div>
        <div className="mt-3 flex items-center gap-2.5 border-t border-line px-1.5 pt-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#A855F7] to-[#6D28D9] text-[13px] font-semibold text-white">{user?.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user?.name}</p>
            <p className="truncate text-xs text-ink-3">{user?.email}</p>
          </div>
          <button onClick={logout} title={t("Cerrar sesión")} className="focus-ring rounded-md p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink"><LogOut size={15} /></button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <Link to="/"><Logo /></Link>
          <span className="flex items-center gap-3"><LangSwitch /><button onClick={logout} className="text-ink-3"><LogOut size={16} /></button></span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
