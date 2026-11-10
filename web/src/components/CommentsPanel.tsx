import { useState, type FormEvent } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo, useLoad } from "../lib/hooks";
import { canComment, isOwner } from "../lib/roles";
import type { Comment, ProjectRole } from "../lib/types";
import { Avatar } from "./Avatar";
import { Button, Empty, ErrorNote, Spinner } from "./ui";
import { t } from "../lib/i18n";

/** Comments on a project, a study or a document. Commenters and up write; authors and the project owner delete. */
export function CommentsPanel({ projectId, studyId, documentId, role }: { projectId: string; studyId?: string; documentId?: string; role: ProjectRole | null | undefined }) {
  const { user: me } = useAuth();
  const qs = studyId ? `?study_id=${studyId}` : documentId ? `?document_id=${documentId}` : "";
  const { data, error, loading, setData } = useLoad(() => api.get<{ comments: Comment[] }>(`/projects/${projectId}/comments${qs}`), [projectId, qs]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = data?.comments ?? [];

  const act = async (fn: () => Promise<{ comments: Comment[] }>) => {
    setBusy(true); setErr(null);
    try { setData(await fn()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    void act(async () => { const r = await api.post<{ comments: Comment[] }>(`/projects/${projectId}/comments`, { body, study_id: studyId, document_id: documentId }); setBody(""); return r; });
  };

  return (
    <div className="space-y-4">
      {loading && !data ? <Spinner /> : error ? <ErrorNote>{error}</ErrorNote> : list.length === 0 ? (
        <Empty icon={<MessageSquare size={20} />} title={t("Aún no hay comentarios")} text={canComment(role) ? t("Deja el primero: una duda, una observación o una decisión que quieras dejar por escrito.") : t("Tu rol en este proyecto es de solo lectura.")} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {list.map((c) => {
            const mine = c.user_id === me?.id;
            return (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <Avatar name={c.name ?? "?"} avatar={c.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{c.name ?? t("Cuenta eliminada")}</span>
                    <span className="text-xs text-ink-3">{timeAgo(c.created_at)}</span>
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-line text-ink-2">{c.body}</p>
                </div>
                {(mine || isOwner(role)) && (
                  <button type="button" disabled={busy} aria-label={t("Eliminar comentario")} title={t("Eliminar comentario")}
                    onClick={() => { if (confirm(t("¿Eliminar este comentario?"))) void act(() => api.del(`/projects/${projectId}/comments/${c.id}`)); }}
                    className="focus-ring h-fit rounded p-1.5 text-ink-3 hover:text-bad"><Trash2 size={14} /></button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canComment(role) && (
        <form onSubmit={send} className="flex items-start gap-3">
          <Avatar name={me?.name ?? ""} avatar={me?.avatar} size={32} />
          <div className="flex-1 space-y-2">
            <textarea className="field min-h-20" placeholder={t("Escribe un comentario…")} value={body} maxLength={4000} aria-label={t("Nuevo comentario")}
              onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(e); }} />
            {err && <ErrorNote>{err}</ErrorNote>}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-3">{t("⌘/Ctrl + Enter para enviar")}</span>
              <Button variant="primary" size="sm" icon={<Send size={14} />} disabled={busy || !body.trim()}>{t("Comentar")}</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
