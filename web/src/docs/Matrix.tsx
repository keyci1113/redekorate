import type { Matrix, Section } from "./types";
import { SectionBody, useDoc } from "./Sections";

const vertical = "[writing-mode:vertical-rl] rotate-180";

/**
 * A template's 2×2 grid with labelled axes (the stakeholder map's power / interest). Each cell is still its own
 * notes section, so the stored data, exports and the API are the same as without the grid. Below `sm` the axes
 * are hidden and the cells stack, each named by its section's full title ("High power · Low interest — …").
 */
export function MatrixView({ matrix, sections, value, set }: {
  matrix: Matrix; sections: Section[]; value: (id: string) => unknown; set: (id: string) => (v: unknown) => void;
}) {
  const { T } = useDoc();
  const byId = new Map(sections.map((s) => [s.id, s]));
  const axis = "text-[15px] font-bold text-ink";
  const level = "text-sm font-semibold text-ink-2";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 break-inside-avoid sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_1fr] sm:grid-rows-[1fr_auto_auto] sm:gap-x-3">
        <p className={`${axis} ${vertical} hidden self-center sm:block`}>{T(matrix.y)}</p>
        <div className="hidden grid-rows-2 sm:grid" aria-hidden>
          <p className={`${level} ${vertical} self-center`}>{T("Alto")}</p>
          <p className={`${level} ${vertical} self-center`}>{T("Bajo")}</p>
        </div>
        {/* The axes: a line up the left and along the bottom, each ending in an arrowhead. */}
        <div className="relative sm:border-b sm:border-l sm:border-ink-3 sm:pb-4 sm:pl-4">
          <span aria-hidden className="absolute -top-1 -left-[5px] hidden h-2.5 w-2.5 rotate-45 border-t border-l border-ink-3 sm:block" />
          <span aria-hidden className="absolute -right-1 -bottom-[5px] hidden h-2.5 w-2.5 rotate-45 border-t border-r border-ink-3 sm:block" />
          <div className="grid overflow-hidden rounded-xl bg-good-soft sm:grid-cols-2">
            {matrix.cells.map((c, i) => {
              const s = byId.get(c.id);
              if (!s) return null;
              return (
                <section key={c.id} aria-label={s.title ? T(s.title) : T(c.label)}
                  className={["flex min-h-48 flex-col p-4 sm:min-h-64 sm:p-5", i > 0 && "max-sm:border-t", i % 2 === 1 && "sm:border-l", i > 1 && "sm:border-t", "border-good/15"].filter(Boolean).join(" ")}>
                  <h3 className="text-[15px] font-semibold text-ink">
                    <span className="sm:hidden">{s.title ? T(s.title) : T(c.label)}</span>
                    <span className="max-sm:hidden">{T(c.label)}</span>
                  </h3>
                  {s.prompt && <p className="mt-1 text-[12px] leading-snug text-ink-2 italic">{T(s.prompt)}</p>}
                  <div className="mt-3 flex-1"><SectionBody section={s} value={value(s.id)} set={set(s.id)} /></div>
                </section>
              );
            })}
          </div>
        </div>
        <div className="col-start-3 hidden grid-cols-2 pt-3 text-center sm:grid" aria-hidden>
          <p className={level}>{T("Bajo")}</p>
          <p className={level}>{T("Alto")}</p>
        </div>
        <p className={`${axis} col-start-3 hidden pt-2 text-center sm:block`}>{T(matrix.x)}</p>
      </div>
    </div>
  );
}
