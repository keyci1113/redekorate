/** Cuántas figuras dibujar. Redondear nunca debe ocultar a quien no terminó ni inventar abandonos. */
export function figureCounts(started: number, done: number, unit: number) {
  let total = Math.ceil(started / unit);
  let full = done >= started ? total : done > 0 ? Math.max(1, Math.round(done / unit)) : 0;
  if (done < started && full >= total) {
    if (total >= 2) full = total - 1;
    else total = 2;
  }
  return { total, full };
}

/** Fila de figuras: llena si la persona terminó, hueca si no. Unit = personas por figura. */
export function ParticipantFigures({ started, done, unit, color, label, height = 22 }: { started: number; done: number; unit: number; color: string; label: string; height?: number }) {
  const { total, full } = figureCounts(started, done, unit);
  return (
    <div role="img" aria-label={label} className="flex flex-wrap gap-0.5" style={{ color }}>
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width={height / 2} height={height} viewBox="0 0 15 30" aria-hidden className="block">
          <g fill={i < full ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
            <circle cx="7.5" cy="5" r="4.2" />
            <path d="M2 12h11v9h-2.5v8h-6v-8H2z" />
          </g>
        </svg>
      ))}
    </div>
  );
}
