// The header's "Nuevo estudio" picker: the same list on every page.

/** The projects offered by "Nuevo estudio": the current one first, then the 12 most recent. */
export function pickerProjects<P extends { id: string }>(projects: P[], current?: string): P[] {
  const here = projects.find((p) => p.id === current);
  return here ? [here, ...projects.filter((p) => p !== here)].slice(0, 12) : projects.slice(0, 12);
}

