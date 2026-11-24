import type { ReactNode } from "react";
import type { Lang } from "../lib/i18n";

/** A cell of a template's 2×2 grid: the section drawn there and the short name shown on it (the axes say the rest). */
export interface MatrixCell { id: string; label: string }
/** y runs low → high upward and x low → high rightward; cells are top-left, top-right, bottom-left, bottom-right. */
export interface Matrix { y: string; x: string; cells: [MatrixCell, MatrixCell, MatrixCell, MatrixCell] }

export type NoteColor = "yellow" | "orange" | "blue" | "pink" | "green" | "purple";

interface S { id: string; title?: string; prompt?: string; span?: 3 | 4 | 5 | 6 | 7 | 8 | 12 }
export type Section =
  | (S & { type: "text"; placeholder?: string; rows?: number })
  | (S & { type: "list"; placeholder?: string; numbered?: boolean })
  | (S & { type: "notes"; color: NoteColor; placeholder?: string })
  | (S & { type: "fields"; fields: { id: string; label: string; placeholder?: string; date?: "one" | "many" }[]; cols?: 1 | 2 | 3 })
  | (S & { type: "chips"; placeholder?: string })
  | (S & { type: "bars"; placeholder?: string })
  | (S & { type: "image"; round?: boolean })
  | (S & { type: "gallery" })
  | (S & { type: "rowgroups"; addGroups?: boolean })        // grupos de filas: AEIOU, fases de observación
  | (S & { type: "entries"; nameLabel: string; bodyLabel: string; addLabel: string })
  | (S & { type: "custom"; component: "journey" | "affinity" | "usability" | "heuristic" | "blueprint" | "timestudy" });

export interface Note { id: string; text: string }
export interface Bar { id: string; label: string; value: number }
export interface Row { id: string; label: string; kind: "text" | "yesno"; answer?: string; yes?: boolean | null }
export interface RowGroup { id: string; title: string; letter?: string; rows: Row[] }
export interface Entry { id: string; name: string; body: string }

export type DocCategory = "Planeación" | "Personas" | "Mapas y síntesis" | "Campo y entrevistas" | "Evaluación";
export type DocData = Record<string, unknown>;

export interface DocTemplate {
  kind: string;
  name: string;              // claves en español; se traducen con el idioma del documento
  category: DocCategory;
  icon: ReactNode;
  description: string;
  purpose: string;
  question: string;
  instructions: string[];
  credit?: string;
  sections: Section[];
  /** Draw four of the sections as a 2×2 grid with labelled axes (the stakeholder map's power / interest) instead of in the normal grid. */
  matrix?: Matrix;
  init?:(lang: Lang) => DocData;      // estructura inicial vacía (filas, etapas, tareas…): nunca trae texto llenado
  example?: (lang: Lang) => DocData;   // valores de ejemplo: solo se muestran como texto guía (placeholder), no se guardan
}

export interface DocRecord {
  id: string; project_id: string; kind: string; title: string; language: Lang;
  data: DocData; share_token: string | null; created_at: string; updated_at: string;
}
