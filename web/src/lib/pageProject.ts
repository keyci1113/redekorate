import { createContext, useContext, useEffect } from "react";

/**
 * The project a page belongs to when its address doesn't say so (a study's results live at /studies/:id/results).
 * The page reports it, and the header then highlights Projects and shows that project in the switcher,
 * the same as on the project's own pages.
 */
export const PageProjectCtx = createContext<(id: string | null) => void>(() => {});

/** Tells the app frame which project this page is about; cleared when the page goes away. */
export function usePageProject(id: string | null | undefined) {
  const set = useContext(PageProjectCtx);
  useEffect(() => {
    set(id ?? null);
    return () => set(null);
  }, [id, set]);
}
