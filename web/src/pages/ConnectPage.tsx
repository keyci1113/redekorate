import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpenText, Eye, KeyRound, Pencil, Plug, ShieldCheck, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { t } from "../lib/i18n";
import { guides, type GuideId } from "../lib/connect";
import { Card, ErrorNote, Spinner, Tabs } from "../components/ui";
import { AccessTokens, ConnectedApps, CopyField, type Access } from "../components/OutsideAccess";

interface ToolInfo { name: string; title: string; description: string; writes: boolean; params: string[] }

function Section({ id, icon, title, text, children }: { id: string; icon: ReactNode; title: string; text?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 id={id} className="flex items-center gap-2 text-[17px] font-semibold">{icon}{title}</h2>
      {text && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">{text}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const ERRORS: [string, string][] = [
  ["400", "La entrada no es válida; la respuesta trae issues con lo que falta o sobra."],
  ["401", "El token no existe, venció o fue revocado."],
  ["403", "El token es de solo lectura y la llamada escribe, o tu rol en el proyecto no lo permite."],
  ["404", "No existe, o no tienes acceso a ello."],
  ["409", "Cambió desde que lo leíste: vuelve a leerlo y envía tu cambio sobre esa versión."],
  ["429", "Demasiadas solicitudes: más de 240 por minuto. Espera un momento."],
];

/**
 * Connect AI apps: what the MCP server and the AI operations over HTTP are, how to connect each kind of app, the person's tokens
 * and connected apps, what the tools can do and the rules they follow. The setup commands carry this install's
 * real addresses, and a token while it is on screen.
 */
export function ConnectPage() {
  const access = useLoad(() => api.get<Access>("/connect/access"), []);
  const tools = useLoad(() => api.get<{ tools: ToolInfo[] }>("/connect/tools"), []);
  const [created, setCreated] = useState<string | null>(null);
  const [guide, setGuide] = useState<GuideId>("claude");
  const d = access.data;

  if (!d) return <div className="page">{access.error ? <ErrorNote>{access.error}</ErrorNote> : <Spinner />}</div>;
  const list = guides(d.mcp_url, d.openapi_url, created);
  const g = list.find((x) => x.id === guide) ?? list[0];
  const reads = tools.data?.tools.filter((x) => !x.writes) ?? [];
  const writes = tools.data?.tools.filter((x) => x.writes) ?? [];

  const authLabel = { oauth: t("Entras con tu cuenta"), token: t("Con un token"), both: t("Con token o con tu cuenta") }[g.auth];

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">{t("Conectar apps de IA")}</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-2">{t("Claude, ChatGPT, Cursor y otras apps pueden trabajar en tus proyectos: listar proyectos y estudios, leer resultados, crear y editar estudios, y escribir insights y documentos. También pueden lanzar, cerrar y publicar estudios, y eso lo ven los participantes al momento. Lo hacen como tú, con tus mismos permisos, y nunca pueden borrar nada. Cuando reemplazan el contenido de un estudio o un documento, la versión anterior queda guardada y se puede restaurar.")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="flex items-center gap-2 font-semibold"><Plug size={16} className="text-accent" /> {t("Servidor MCP")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{t("MCP es un estándar abierto para que los asistentes de IA usen herramientas de otras apps. Agregas redekorate como conector y el asistente ve sus herramientas y las usa cuando le pides algo.")}</p>
          <div className="mt-3"><CopyField value={d.mcp_url} label={t("Copiar dirección")} /></div>
          <p className="mt-2 text-xs text-ink-3">{t("Para Claude, ChatGPT, Claude Code, Cursor y cualquier cliente MCP.")}</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 font-semibold"><BookOpenText size={16} className="text-accent" /> {t("API REST (OpenAPI)")}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{t("Las mismas herramientas como llamadas HTTP normales, descritas en un documento OpenAPI: una llamada POST por herramienta, con su entrada en JSON. Es para apps que no hablan MCP.")}</p>
          <div className="mt-3"><CopyField value={d.openapi_url} label={t("Copiar dirección de la API")} /></div>
          <p className="mt-2 text-xs text-ink-3">{t("Para acciones de un GPT, Gemini, n8n, Zapier o tus propios scripts y agentes.")}</p>
        </Card>
      </div>

      <Section id="setup" icon={<Wrench size={17} className="text-accent" />} title={t("Cómo conectar una app")}
        text={t("Hay dos formas de entrar. Con tu cuenta (OAuth): la app te manda a redekorate, entras y apruebas; no copias nada. Con un token: lo creas abajo y lo pegas en la app; sirve para herramientas sin navegador.")}>
        <Tabs value={guide} onChange={setGuide} items={list.map((x) => ({ id: x.id, label: x.name }))} />
        <div className="mt-4 space-y-4">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-0.5 text-[12px] font-medium text-ink-2">{g.auth === "oauth" ? <ShieldCheck size={13} /> : <KeyRound size={13} />} {authLabel}</p>
          <ol className="space-y-2">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/5 text-[11px] font-semibold text-ink">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
          {g.snippet && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-3">{g.snippet.label}</p>
              <CopyField value={g.snippet.text} label={t("Copiar")} multiline={g.snippet.text.includes("\n") || g.snippet.text.length > 90} />
              {g.auth !== "oauth" && !created && <p className="text-xs text-ink-3">{t("Crea un token abajo y el comando se llena con él.")}</p>}
            </div>
          )}
          {g.note && <p className="rounded-lg border border-accent/15 bg-accent-soft/60 px-3 py-2 text-[13px] leading-relaxed text-accent-ink">{g.note}</p>}
        </div>
      </Section>

      <Section id="tokens" icon={<KeyRound size={17} className="text-accent" />} title={t("Tokens de acceso")}
        text={t("Para Claude Code, Cursor, acciones de un GPT y scripts. Un token se muestra una sola vez; guardamos solo una huella, así que si lo pierdes, revócalo y crea otro. Uno de solo lectura únicamente recibe las herramientas que leen.")}>
        <AccessTokens tokens={d.tokens} reload={access.reload} created={created} onCreated={setCreated} />
      </Section>

      <Section id="apps" icon={<Plug size={17} className="text-accent" />} title={t("Apps conectadas")}
        text={t("Las apps que entraron con tu cuenta. Su acceso dura una hora y se renueva solo hasta por 60 días mientras la uses; quitarlo lo corta en el momento.")}>
        <ConnectedApps apps={d.apps} reload={access.reload} />
      </Section>

      <Section id="tools" icon={<Wrench size={17} className="text-accent" />} title={t("Lo que pueden hacer")}
        text={t("Estas son las herramientas que recibe una app conectada, tal como las describe el servidor (en inglés, que es como las leen las apps). Ninguna borra.")}>
        {tools.error ? <ErrorNote>{tools.error}</ErrorNote> : !tools.data ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {([[reads, t("Leen"), <Eye key="r" size={15} />], [writes, t("Crean y editan (no con solo lectura)"), <Pencil key="w" size={15} />]] as const).map(([items, title, icon]) => (
              <div key={title}>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-2">{icon} {title} <span className="text-ink-3 tabular-nums">{items.length}</span></p>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {items.map((x) => (
                    <li key={x.name} className="px-4 py-3">
                      <p className="text-sm"><span className="font-medium">{x.title}</span> <code className="ml-1 rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-2">{x.name}</code></p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{x.description}</p>
                      {x.params.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{x.params.map((p) => <code key={p} className="rounded border border-line px-1 text-[11px] text-ink-3">{p}</code>)}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="rules" icon={<ShieldCheck size={17} className="text-accent" />} title={t("Reglas y seguridad")}>
        <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          <li>{t("Actúan como tú: solo ven y cambian los proyectos a los que tienes acceso, con tu mismo rol en cada uno.")}</li>
          <li>{t("Nunca pueden borrar nada: no hay herramientas para eso.")}</li>
          <li>{t("Los resultados llegan sin los datos personales de los participantes, ni los correos o teléfonos que escribieron en sus respuestas.")}</li>
          <li>{t("Con solo lectura, la app solo recibe las herramientas que leen; en la API, una llamada que escribe responde 403.")}</li>
          <li>{t("Los tokens solo abren el servidor MCP y la API para apps, nunca el resto de redekorate. Cerrar sesión no los corta: revoca aquí un token o quita el acceso de una app cuando ya no la uses.")}</li>
        </ul>
        <p className="mt-5 text-sm font-semibold">{t("Respuestas de error de la API")}</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {ERRORS.map(([code, what]) => (
                <tr key={code} className="border-t border-line first:border-t-0"><td className="w-16 p-2.5 font-mono text-[13px] font-semibold">{code}</td><td className="p-2.5 text-ink-2">{t(what)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">{t("Los errores llegan como JSON: { \"error\": \"…\" }.")}</p>
      </Section>

      <p className="text-sm text-ink-3">{t("Más ayuda en")} <Link to="/help" className="font-medium text-accent">{t("Ayuda y conceptos")}</Link>.</p>
    </div>
  );
}
