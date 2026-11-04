import type { ReactNode } from "react";
import { BarChart3, Boxes, Compass, LayoutGrid, Map, MousePointerClick, ClipboardList } from "lucide-react";
import type { Category } from "./catalog";

export const CATEGORY_ICON: Record<Category, ReactNode> = {
  "Usabilidad": <MousePointerClick size={16} />,
  "Arquitectura de información": <LayoutGrid size={16} />,
  "Generativa": <Compass size={16} />,
  "Síntesis y mapeo": <Map size={16} />,
  "Métricas": <BarChart3 size={16} />,
  "Organización": <ClipboardList size={16} />,
};
export const FallbackIcon = <Boxes size={16} />;
