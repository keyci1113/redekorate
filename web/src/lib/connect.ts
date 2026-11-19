// Setup guides for the Connect AI apps page: one per kind of app, with this install's real addresses (and a
// token just created, while it is on screen) filled into every command. Pure, so the commands are tested.
import { t } from "./i18n";

export type GuideId = "claude" | "chatgpt" | "gpt" | "claude_code" | "cursor" | "agents" | "rest";
export interface Guide {
  id: GuideId;
  name: string;
  /** "oauth": the app asks you to sign in and approve, nothing to copy. "token": paste a token from this page. */
  auth: "oauth" | "token" | "both";
  steps: string[];
  /** Something to paste, already filled in. */
  snippet?: { label: string; text: string };
  note?: string;
}

/** Stand-in shown in commands until a token is created on the page. */
export const TOKEN_PLACEHOLDER = "rdk_pat_…";

/** The operations' base (`…/api/v1/tools`) is where their OpenAPI document lives. */
export const restBase = (openapiUrl: string) => openapiUrl.replace(/\/openapi\.json$/, "");

/** `restUrl` is the public REST API's base (`…/api/v1`); its OpenAPI document is `${restUrl}/openapi.json`. */
export function guides(mcpUrl: string, openapiUrl: string, token: string | null, restUrl = openapiUrl.replace(/\/tools\/openapi\.json$/, "")): Guide[] {
  const tk = token ?? TOKEN_PLACEHOLDER;
  const base = restBase(openapiUrl);
  return [
    { id: "claude", name: t("Claude (web, escritorio y celular)"), auth: "oauth", steps: [
      t("En Claude, abre Configuración → Conectores y pulsa Agregar conector personalizado."),
      t("Ponle de nombre redekorate y pega la dirección del servidor MCP."),
      t("Pulsa Conectar: se abre redekorate, entras con tu cuenta y apruebas el acceso."),
      t("En un chat, activa redekorate en el menú de herramientas y pídele, por ejemplo, «resume los insights de mi proyecto»."),
    ], snippet: { label: t("Dirección del servidor MCP"), text: mcpUrl },
    note: t("El conector queda en tu cuenta de Claude, así que también funciona en Claude Desktop y en el celular.") },

    { id: "chatgpt", name: t("ChatGPT (conector)"), auth: "oauth", steps: [
      t("En ChatGPT, abre Configuración → Apps y conectores → Avanzado y activa el modo desarrollador."),
      t("Pulsa Crear, ponle de nombre redekorate, pega la dirección del servidor MCP y elige autenticación OAuth."),
      t("Entra con tu cuenta de redekorate y aprueba el acceso."),
      t("En un chat nuevo, elige redekorate en el menú de herramientas."),
    ], snippet: { label: t("Dirección del servidor MCP"), text: mcpUrl },
    note: t("Los conectores personalizados dependen del plan de ChatGPT. Si tu plan no los tiene, usa un GPT con acciones.") },

    { id: "gpt", name: t("ChatGPT (acciones de un GPT)"), auth: "token", steps: [
      t("Crea un token de lectura y edición (o solo lectura) en Tokens de acceso, más abajo."),
      t("En ChatGPT, crea un GPT y abre Configurar → Acciones → Crear nueva acción."),
      t("Pulsa Importar desde URL y pega la dirección de la API (OpenAPI)."),
      t("En Autenticación elige Clave de API, tipo Bearer, y pega el token."),
    ], snippet: { label: t("Dirección de la API (OpenAPI)"), text: openapiUrl },
    note: t("Las acciones que cambian algo están marcadas como importantes, así que el GPT te pregunta antes de hacerlas; las que solo leen se ejecutan sin preguntar.") },

    { id: "claude_code", name: "Claude Code", auth: "both", steps: [
      t("Crea un token en Tokens de acceso, más abajo; el comando se llena con él."),
      t("Pega el comando en la terminal. Después, /mcp en Claude Code muestra redekorate conectado."),
      t("Sin token también funciona: quita la parte --header y entra con tu cuenta desde /mcp."),
    ], snippet: { label: t("Comando"), text: `claude mcp add --transport http redekorate ${mcpUrl} --header "Authorization: Bearer ${tk}"` } },

    { id: "cursor", name: "Cursor", auth: "token", steps: [
      t("Crea un token en Tokens de acceso, más abajo."),
      t("Abre ~/.cursor/mcp.json, el archivo de tu usuario, y agrega este servidor."),
      t("Reinicia Cursor; en Configuración → MCP debe aparecer redekorate en verde."),
    ], snippet: { label: "mcp.json", text: JSON.stringify({ mcpServers: { redekorate: { url: mcpUrl, headers: { Authorization: `Bearer ${tk}` } } } }, null, 2) },
    note: t("No lo pongas en el .cursor/mcp.json de un proyecto: ese archivo suele subirse al repositorio y tu token quedaría a la vista de cualquiera con acceso. Sirve igual para otros clientes MCP que aceptan una dirección y encabezados.") },

    { id: "agents", name: t("Otras apps de IA (HTTP)"), auth: "token", steps: [
      t("Crea un token en Tokens de acceso, más abajo."),
      t("Cada herramienta es una llamada POST a la API con su entrada en JSON. Esta pregunta quién eres."),
      t("Gemini, n8n o tus propios agentes pueden importar la dirección de las operaciones de IA (OpenAPI) para ver todas las herramientas."),
    ], snippet: { label: "curl", text: `curl -X POST ${base}/whoami \\\n  -H "Authorization: Bearer ${tk}" \\\n  -H "Content-Type: application/json" \\\n  -d '{}'` } },

    { id: "rest", name: t("Scripts y otras apps (REST)"), auth: "token", steps: [
      t("Crea un token en Tokens de acceso, más abajo. Para leer basta uno de solo lectura."),
      t("La API REST tiene recursos normales: GET lee, POST crea y PATCH edita. Proyectos, estudios y resultados, insights, documentos, tickets y milestones. No hay DELETE."),
      t("Un PATCH solo cambia los campos que envías, y un campo que no existe responde 400. Para reemplazar bloques, contenido o la descripción de un ticket, envía base_updated_at con el updated_at que leíste: si cambió desde entonces responde 409 y no pisa nada."),
      t("Importa la descripción OpenAPI en n8n, Zapier, Postman o tu generador de clientes para ver todas las operaciones."),
    ], snippet: { label: "curl", text: `curl ${restUrl}/me \\\n  -H "Authorization: Bearer ${tk}"\n\ncurl -X PATCH ${restUrl}/projects/<project_id>/tickets/12 \\\n  -H "Authorization: Bearer ${tk}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"priority": "high", "labels": ["checkout"]}'` },
    note: t("Las respuestas no traen datos de participantes ni de quien envió feedback por el widget, ni los enlaces públicos. Los errores llegan en inglés, como JSON. Descripción OpenAPI:") + ` ${restUrl}/openapi.json` },
  ];
}
