import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { t } from "../lib/i18n";
import { isStaleChunkError, reloadOnce } from "../lib/staleChunk";
import { Button, Spinner } from "./ui";

type Props = {
  children: ReactNode;
  /** When this changes (the route), a shown error is cleared so the next page gets its chance. */
  resetKey?: string;
  /** "page" sits inside the app frame, so the menu keeps working; "screen" is the last resort around everything. */
  variant?: "page" | "screen";
};
type State = { error: unknown; reloading: boolean };

/**
 * Without this, one error while rendering (or a page file that no longer exists after a deploy) unmounts
 * the whole app and leaves a blank white page. Stale page files reload the page once; anything else
 * shows a short message with a way out.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunkError(error) && reloadOnce()) { this.setState({ reloading: true }); return; }
    console.error("Page crashed", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, reloading: false });
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) return <Spinner label={t("Cargando la versión nueva…")} />;
    const stale = isStaleChunkError(error);
    const screen = this.props.variant === "screen";
    return (
      <div role="alert" className={screen ? "grid min-h-screen place-items-center bg-paper-2 p-4" : "p-4 sm:p-8"}>
        <div className="mx-auto max-w-md rounded-xl border border-line bg-paper p-6 text-center">
          <h1 className="text-base font-semibold text-ink">{stale ? t("Hay una versión nueva de redekorate") : t("Esta página no se pudo mostrar")}</h1>
          <p className="mt-2 text-sm text-ink-2">
            {stale ? t("Recarga para seguir donde estabas.") : t("Algo falló al mostrarla. Recarga, o vuelve al inicio; si se repite, avísanos.")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {/* Plain reloads, not router links: the router state may be what broke. */}
            <Button variant="primary" icon={<RefreshCw size={14} />} onClick={() => window.location.reload()}>{t("Recargar")}</Button>
            <Button onClick={() => window.location.assign("/")}>{t("Ir al inicio")}</Button>
          </div>
        </div>
      </div>
    );
  }
}
