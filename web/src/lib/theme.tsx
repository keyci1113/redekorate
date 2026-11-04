import { createContext, useContext, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
const KEY = "rk_theme";

function initial(): Theme {
  try { const s = localStorage.getItem(KEY); if (s === "light" || s === "dark") return s; } catch { /* sin storage */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", theme);
}

let current: Theme = initial();
apply(current);
export const getTheme = () => current;

interface Ctx { theme: Theme; setTheme: (t: Theme) => void }
const ThemeCtx = createContext<Ctx>({ theme: current, setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setState] = useState<Theme>(current);
  const setTheme = (t: Theme) => {
    current = t; apply(t);
    try { localStorage.setItem(KEY, t); } catch { /* sin storage */ }
    setState(t);
  };
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className={`inline-flex rounded-lg bg-ink/5 p-0.5 ${className}`} role="group" aria-label="Tema / Theme">
      {(["light", "dark"] as const).map((v) => (
        <button key={v} type="button" onClick={() => setTheme(v)} aria-pressed={theme === v} aria-label={v === "light" ? "Claro" : "Oscuro"}
          className={`rounded-md p-1.5 transition ${theme === v ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>
          {v === "light" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      ))}
    </div>
  );
}
