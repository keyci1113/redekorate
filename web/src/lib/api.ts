import { getLang, t } from "./i18n";
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// El encabezado X-Requested-With es parte de la protección CSRF del servidor.
const BASE_HEADERS = () => ({ "x-requested-with": "redekorate", "x-lang": getLang() });

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? t("Error {a}", { a: res.status }));
  return data as T;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
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
    const res = await fetch("/api/uploads", { method: "POST", credentials: "same-origin", headers: BASE_HEADERS(), body: fd });
    return (await handle<{ url: string }>(res)).url;
  },
};
