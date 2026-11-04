import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ user: User | null }>("/auth/me").then((r) => setUser(r.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const value: AuthCtx = {
    user, loading, setUser,
    async login(email, password) { setUser((await api.post<{ user: User }>("/auth/login", { email, password })).user); },
    async register(name, email, password) { setUser((await api.post<{ user: User }>("/auth/register", { name, email, password })).user); },
    async logout() { await api.post("/auth/logout").catch(() => {}); setUser(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
