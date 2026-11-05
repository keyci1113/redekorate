import type { LucideIcon } from "lucide-react";
import {
  AlignLeft, ArrowRight, Ban, BarChart3, Camera, CircleUserRound, Frown, GitBranch, Heart, Images, Lightbulb, List, ListChecks,
  MapPin, Megaphone, MessageCircle, NotebookPen, Package, Search, Settings2, SlidersHorizontal, Smartphone, Smile, Sparkles,
  StickyNote, Table2, Tags, Target, UsersRound,
} from "lucide-react";
import type { Section } from "./types";

// Las claves son los títulos en español de las plantillas, así que el ícono no cambia con el idioma. El orden importa.
const BY_TITLE: [RegExp, LucideIcon][] = [
  [/foto|boceto|evidencia/i, Camera],
  [/no debe/i, Ban],
  [/poder ·/i, UsersRound],
  [/problema|dolor|frustra|vacíos|ansiedad/i, Frown],
  [/objetivo|job statement/i, Target],
  [/necesidad|ganancia|atracción|\bvalor\b|ideal/i, Sparkles],
  [/comportamiento|\bhace\b|hábito|actividad|tarea|debe hacer/i, ListChecks],
  [/personalidad/i, Smile],
  [/experiencia|conocimiento|compatibilidad/i, SlidersHorizontal],
  [/tecnolog/i, Smartphone],
  [/frase|\bdice\b|diálogo|pregunta|prompt|entrevista/i, MessageCircle],
  [/piensa|hipótesis|concepto|temas/i, Lightbulb],
  [/siente/i, Heart],
  [/hallazgo|patrones/i, Search],
  [/contexto|escenario|segmento/i, MapPin],
  [/canales/i, Megaphone],
  [/futuro|empuje|salidas|siguientes|señales/i, ArrowRight],
  [/flujo|decisión|relaciones/i, GitBranch],
  [/entregable/i, Package],
  [/bitácora|registr/i, NotebookPen],
  [/quién|nombre|bio\b|datos generales/i, CircleUserRound],
  [/hechos|datos|métrica/i, BarChart3],
  [/configuraci|sesión|introducción|antes de/i, Settings2],
];

const BY_TYPE: Partial<Record<Section["type"], LucideIcon>> = {
  notes: StickyNote, list: List, text: AlignLeft, fields: CircleUserRound, chips: Tags, bars: BarChart3,
  gallery: Images, image: Camera, entries: NotebookPen, rowgroups: Table2,
};

export function sectionIcon(section: Section): LucideIcon | undefined {
  const title = section.title ?? "";
  return BY_TITLE.find(([re]) => re.test(title))?.[1] ?? BY_TYPE[section.type];
}
