import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, GitBranch, LayoutGrid, MousePointerClick, ShieldCheck, ListChecks, Smile, SplitSquareHorizontal, TrendingUp } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button, ErrorNote, Field } from "../components/ui";
import { Logo } from "../components/Logo";
import { LangSwitch } from "../lib/i18n";
import { ThemeSwitch } from "../lib/theme";
import { PasswordStrength, passwordOk } from "../components/PasswordStrength";
import { Bubble } from "../components/Bubble";

import { t } from "../lib/i18n";
// Tarjetas de ejemplo que caen en el panel del login, como un vistazo a los insights que genera cada método.
const INSIGHT_CARDS = (): { icon: ReactNode; title: string; body: ReactNode }[] => [
  { icon: <LayoutGrid size={14} />, title: t("Card sorting"), body: (
    <div className="mt-3 grid grid-cols-2 gap-2">{[t("Pagos"), t("Pedidos"), t("Perfil"), t("Ayuda")].map((c) => <span key={c} className="rounded-md border border-[#DDE0E6] px-2 py-1.5 text-[11px] text-[#454C58]">{c}</span>)}</div>
  ) },
  { icon: <MousePointerClick size={14} />, title: t("First click · 82% éxito"), body: <div className="mt-3 h-2 rounded-full bg-[#F3E9FD]"><div className="h-2 w-[82%] rounded-full bg-[#5902A1]" /></div> },
  { icon: <ListChecks size={14} />, title: t("SUS · 78.5"), body: <p className="mt-1 text-[11px] text-[#5B6270]">{t("B+ · por encima del promedio")}</p> },
  { icon: <TrendingUp size={14} />, title: t("NPS · +42"), body: <p className="mt-1 text-[11px] text-[#5B6270]">{t("Excelente · 68% promotores")}</p> },
  { icon: <Eye size={14} />, title: t("Five Second · 91% recuerda"), body: <p className="mt-1 text-[11px] text-[#5B6270]">{t("El mensaje se entiende")}</p> },
  { icon: <GitBranch size={14} />, title: t("Tree Testing · 76% directo"), body: <div className="mt-3 h-2 rounded-full bg-[#F3E9FD]"><div className="h-2 w-[76%] rounded-full bg-[#5902A1]" /></div> },
  { icon: <SplitSquareHorizontal size={14} />, title: t("Preference Test"), body: <p className="mt-1 text-[11px] text-[#5B6270]">{t("Variante B · 64% prefiere")}</p> },
  { icon: <Smile size={14} />, title: t("CSAT · 4.6 / 5"), body: <p className="mt-1 text-[11px] text-[#5B6270]">{t("92% satisfechos")}</p> },
];

function FallingCards() {
  const cards = INSIGHT_CARDS();
  const [instances] = useState(() => Array.from({ length: 9 }, (_, i) => ({
    card: cards[i % cards.length],
    left: 4 + Math.random() * 78,
    rotate: -6 + Math.random() * 12,
    duration: 16 + Math.random() * 10,
    delay: -Math.random() * 24,
  })));
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {instances.map((it, i) => (
        <div key={i} className="absolute w-56 animate-[fall_linear_infinite] rounded-2xl bg-white/95 p-4 shadow-2xl"
          style={{ left: `${it.left}%`, transform: `rotate(${it.rotate}deg)`, animationDuration: `${it.duration}s`, animationDelay: `${it.delay}s` } as CSSProperties}>
          <p className="flex items-center gap-2 text-xs font-semibold text-[#5902A1]">{it.card.icon} {it.card.title}</p>
          {it.card.body}
        </div>
      ))}
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between"><Link to="/"><Logo /></Link><span className="flex items-center gap-2"><LangSwitch /><ThemeSwitch /></span></div>
        <div className="flex flex-1 items-center"><div className="mx-auto w-full max-w-xl py-10 [&_label>span]:text-sm">{children}</div></div>
        <p className="flex items-center gap-1.5 text-xs text-ink-3"><ShieldCheck size={13} /> {t("Conexión cifrada · contraseñas protegidas con bcrypt")}</p>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#201429] via-[#5902A1] to-[#BF7DF5] lg:block">
        <Bubble className="h-full w-full" size={34} colorA={[0.9137, 0.8353, 1]} colorB={[1, 1, 1]} tint={[0.91, 0.84, 1]} tintStrength={0.15}>
          <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
          <FallingCards />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#201429] via-[#201429]/90 to-transparent p-16 pt-28 text-white">
            <p className="display text-5xl leading-[1.05]">{t("Cada estudio,")}<br /><span className="text-[#D0D4DD]">{t("una decisión mejor informada.")}</span></p>
            <p className="mt-5 max-w-md text-[15px] text-white/90">{t("Encuestas, card sorting, tree testing, pruebas de preferencia y first click — organizado por proyecto y listo para compartir.")}</p>
          </div>
        </Bubble>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input className="field h-13 pr-12 text-base" type={show ? "text" : "password"} required value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label={show ? t("Ocultar contraseña") : t("Mostrar contraseña")}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "register" && !passwordOk(form.password)) { setError(t("Tu contraseña aún no cumple los requisitos.")); return; }
    setBusy(true); setError(null);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <AuthShell>
      <h1 className="display text-4xl sm:text-5xl">{mode === "login" ? t("Bienvenida de vuelta") : t("Crea tu cuenta")}</h1>
      <p className="mt-3 text-base text-ink-2">{mode === "login" ? t("Entra para ver tus proyectos e investigaciones.") : t("Organiza toda tu investigación de UX en un solo lugar.")}</p>
      <form onSubmit={submit} className="mt-10 space-y-5">
        {mode === "register" && <Field label={t("Nombre")}><input className="field h-13 text-base" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>}
        <Field label={t("Correo")}><input className="field h-13 text-base" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink-2">{t("Contraseña")}</span>
            {mode === "login" && <Link to="/forgot" className="text-sm font-medium text-accent">{t("¿La olvidaste?")}</Link>}
          </div>
          <PasswordInput value={form.password} onChange={(password) => setForm({ ...form, password })} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {mode === "register" && <PasswordStrength value={form.password} />}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button variant="primary" size="lg" className="!h-14 w-full !text-base" disabled={busy}>{busy ? t("Un momento…") : mode === "login" ? t("Entrar") : t("Crear cuenta")}</Button>
      </form>
      <p className="mt-7 text-base text-ink-3">
        {mode === "login" ? t("¿No tienes cuenta?") : t("¿Ya tienes cuenta?")}{" "}
        <button className="font-medium text-accent" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>{mode === "login" ? t("Regístrate") : t("Inicia sesión")}</button>
      </p>
    </AuthShell>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthShell>
      <h1 className="display text-4xl sm:text-5xl">{t("Recupera tu acceso")}</h1>
      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl bg-good-soft p-4 text-sm text-good">{t("Si existe una cuenta con")} <b>{email}</b>{t(", te enviamos un enlace para crear una nueva contraseña. Revisa también tu carpeta de spam. El enlace vence en 1 hora.")}</p>
          <Link to="/login" className="text-sm font-medium text-accent">{t("← Volver a iniciar sesión")}</Link>
        </div>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          try { await api.post("/auth/forgot", { email }); setSent(true); } catch (err) { setError((err as Error).message); }
        }}>
          <p className="text-base text-ink-2">{t("Escribe el correo de tu cuenta y te enviaremos un enlace seguro.")}</p>
          <Field label={t("Correo")}><input className="field h-13 text-base" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="primary" size="lg" className="!h-14 w-full !text-base">{t("Enviar enlace")}</Button>
          <Link to="/login" className="block text-center text-sm text-ink-3 hover:text-ink">{t("Volver")}</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const token = params.get("token") ?? "";
  return (
    <AuthShell>
      <h1 className="display text-4xl sm:text-5xl">{t("Nueva contraseña")}</h1>
      {done ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-xl bg-good-soft p-4 text-sm text-good">{t("Listo. Tu contraseña fue actualizada y cerramos las sesiones abiertas en otros dispositivos.")}</p>
          <Button variant="primary" onClick={() => nav("/login")}>{t("Iniciar sesión")}</Button>
        </div>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={async (e) => {
          e.preventDefault(); setError(null);
          if (!passwordOk(pw)) { setError(t("La contraseña aún no cumple los requisitos.")); return; }
          try { await api.post("/auth/reset", { token, password: pw }); setDone(true); } catch (err) { setError((err as Error).message); }
        }}>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-ink-2">{t("Nueva contraseña")}</span>
            <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
            <PasswordStrength value={pw} />
          </div>
          {!token && <ErrorNote>{t("El enlace no tiene token. Ábrelo directamente desde el correo.")}</ErrorNote>}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button variant="primary" size="lg" className="!h-14 w-full !text-base" disabled={!token}>{t("Guardar contraseña")}</Button>
        </form>
      )}
    </AuthShell>
  );
}
