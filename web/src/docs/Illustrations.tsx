// Ilustraciones propias (vectores): ninguna representa a una persona real.

const SKIN = ["#F6D3B3", "#E8B48E", "#C98D62", "#A06B45", "#7A4E31", "#5A3824"];
type Hair = "short" | "long" | "bun" | "curly" | "beard" | "scarf";

const FRINGE = "M38 50c0-18 10-26 22-26s22 8 22 26c-4-8-10-12-22-12s-18 4-22 12z";

function hairParts(kind: Hair, color: string): { back: string; front: string } {
  const fill = (d: string) => `<path d="${d}" fill="${color}"/>`;
  switch (kind) {
    case "long": return { back: fill("M34 52c0-20 12-30 26-30s26 10 26 30v28c-6 4-12 4-16 2V50H50v32c-4 2-10 2-16-2z"), front: fill(FRINGE) };
    case "bun": return { back: `<circle cx="60" cy="21" r="9" fill="${color}"/>`, front: fill(FRINGE) };
    case "curly": return { back: "", front: [[42, 38], [50, 30], [60, 27], [70, 30], [78, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${color}"/>`).join("") };
    case "beard": return { back: "", front: fill(FRINGE) + fill("M38 54c1 16 10 24 22 24s21-8 22-24c-4 6-9 8-22 8s-18-2-22-8z") };
    case "scarf": return { back: fill("M32 58c0-22 12-35 28-35s28 13 28 35c0 14-6 26-14 31H46c-8-5-14-17-14-31z"), front: "" };
    default: return { back: "", front: fill(FRINGE) };
  }
}

function avatar(bg: string, skin: string, kind: Hair, hair: string, top: string) {
  const { back, front } = hairParts(kind, hair);
  const r = kind === "scarf" ? 18 : 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${bg}"/>${back}<path d="M24 120c0-24 16-38 36-38s36 14 36 38z" fill="${top}"/><rect x="52" y="66" width="16" height="20" rx="7" fill="${skin}"/><circle cx="60" cy="52" r="${r}" fill="${skin}"/>${front}<circle cx="52" cy="52" r="2" fill="#16191F"/><circle cx="68" cy="52" r="2" fill="#16191F"/><path d="M53 60c3 3 11 3 14 0" fill="none" stroke="#16191F" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Retratos ilustrados que se pueden elegir como imagen de una persona. */
export const AVATARS = [
  avatar("#E3D0FC", SKIN[1], "long", "#16191F", "#5902A1"),
  avatar("#C4E2FB", SKIN[3], "beard", "#16191F", "#454C58"),
  avatar("#FFF1A8", SKIN[0], "bun", "#8A4B1F", "#BF7DF5"),
  avatar("#C9F0C6", SKIN[4], "curly", "#16191F", "#FFFFFF"),
  avatar("#FFCCE0", SKIN[2], "scarf", "#454C58", "#16191F"),
  avatar("#FFD6AC", SKIN[5], "short", "#16191F", "#5902A1"),
];

/** Boceto de ejemplo: pared de notas de una sesión. */
export function ExampleWall() {
  const notes: [number, number, string][] = [[14, 16, "#FFF1A8"], [48, 12, "#C4E2FB"], [82, 18, "#FFCCE0"], [118, 13, "#C9F0C6"], [20, 56, "#FFD6AC"], [56, 60, "#FFF1A8"], [92, 58, "#E3D0FC"], [126, 62, "#FFF1A8"]];
  return (
    <svg viewBox="0 0 160 120" aria-hidden className="aspect-[4/3] w-full rounded-lg border border-dashed border-line-2 bg-surface">
      {notes.map(([x, y, c], i) => (
        <g key={i} transform={`rotate(${i % 2 ? 3 : -3} ${x + 12} ${y + 14})`}>
          <rect x={x} y={y} width="26" height="28" rx="2" fill={c} />
          <path d={`M${x + 5} ${y + 9}h16M${x + 5} ${y + 15}h11`} stroke="#16191F" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/** Boceto de ejemplo: pantalla dibujada a mano. */
export function ExampleSketch() {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className="aspect-[4/3] w-full rounded-lg border border-dashed border-line-2 bg-surface text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="56" y="10" width="48" height="100" rx="7" />
      <path d="M64 24h32M64 34h20" />
      <rect x="64" y="44" width="32" height="24" rx="2" />
      <path d="M64 44l32 24M96 44L64 68M64 78h32M64 87h24" />
      <rect x="72" y="95" width="16" height="7" rx="3" />
      <path d="M112 50c10-6 20-6 30-1M136 44l6 5-7 4M48 74c-10 6-20 6-30 1M24 80l-6-5 7-4" />
    </svg>
  );
}
