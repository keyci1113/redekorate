import type { Section } from "./types";
import { SectionBody, useDoc } from "./Sections";

/**
 * A section drawn as one row of a lettered technique (SCAMPER): the letter on a tile with the section's title under
 * it, the prompt as the guiding question, then the section's own body. The data is the section's as usual, so
 * exports and the API don't change. Below `sm` the three parts stack.
 */
export function LetterRow({ section, value, set }: { section: Section; value: unknown; set: (v: unknown) => void }) {
  const { T } = useDoc();
  // The section's placeholder is the hint above its body ("Write three proposals:"), not inside the first input.
  const hint = "placeholder" in section ? section.placeholder : undefined;
  return (
    <section aria-label={section.title ? T(section.title) : section.letter}
      className="grid gap-3 rounded-2xl border border-line bg-surface p-3 break-inside-avoid sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex items-center gap-3 rounded-xl bg-good px-4 py-3 text-surface sm:flex-col sm:justify-center sm:gap-1 sm:py-5">
        <span aria-hidden className="text-4xl leading-none font-bold sm:text-5xl">{section.letter}</span>
        {section.title && <h3 className="text-[13px] font-semibold">{T(section.title)}</h3>}
      </div>
      {section.prompt && (
        <p className="flex items-center justify-center rounded-xl bg-good-soft px-4 py-3 text-center text-[15px] leading-snug font-medium text-ink text-balance">
          {T(section.prompt)}
        </p>
      )}
      <div className="min-w-0 rounded-xl bg-paper/70 px-2 py-2.5 print:bg-white">
        {hint && <p className="px-1.5 text-[12px] font-bold text-ink-2">{T(hint)}</p>}
        <div className="mt-1"><SectionBody section={hint ? ({ ...section, placeholder: undefined } as Section) : section} value={value} set={set} /></div>
      </div>
    </section>
  );
}
