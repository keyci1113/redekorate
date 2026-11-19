import { getLang, t } from "./i18n";
import { downFromResponse, setDown } from "./maintenance";
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// El encabezado X-Requested-With es parte de la protección CSRF del servidor.
const BASE_HEADERS = () => ({ "x-requested-with": "redekorate", "x-lang": getLang() });

async function handle<T>(res: Response): Promise<T> {
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const down = downFromResponse(res.status, data, isJson);
    if (down) setDown(down);
    throw new ApiError(res.status, data.error ?? t("Error {a}", { a: res.status }));
  }
  return data as T;
}

/** fetch that reports an unreachable server (it is restarting during a deploy) instead of failing silently. */
async function send(input: string, init: RequestInit): Promise<Response> {
  try { return await fetch(input, init); } catch (e) {
    // Offline or a cancelled request is not the server being down. MaintenanceScreen double-checks with /api/health.
    if ((e as Error).name !== "AbortError" && (typeof navigator === "undefined" || navigator.onLine)) setDown({ kind: "deploy" });
    throw e;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await send(`/api${url}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { ...BASE_HEADERS(), "content-type": "application/json" } : BASE_HEADERS(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
  async upload(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await send("/api/uploads", { method: "POST", credentials: "same-origin", headers: BASE_HEADERS(), body: fd });
    return (await handle<{ url: string }>(res)).url;
  },
  /** Prototipo HTML (p. ej. descargado de Claude): el servidor le agrega el script de seguimiento. */
  /** Adds a file to a project's Documents tab and returns the refreshed list. */
  async uploadProjectFile<T>(projectId: string, file: File): Promise<T> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${projectId}/files`, { method: "POST", credentials: "same-origin", headers: BASE_HEADERS(), body: fd });
    return handle<T>(res);
  },
  async uploadPrototype(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await send("/api/uploads/prototype", { method: "POST", credentials: "same-origin", headers: BASE_HEADERS(), body: fd });
    return (await handle<{ url: string }>(res)).url;
  },
};
