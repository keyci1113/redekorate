import { t, tc } from "../lib/i18n";
import type { ReactNode } from "react";
import {
  DoorOpen, Info, MessageSquareText, ListChecks, SlidersHorizontal, Gauge, ClipboardCheck, PartyPopper,
  ThumbsUp, ListOrdered, Grid3x3, LayoutGrid, Network, Images, Timer, MousePointerClick, Smartphone, Scale,
} from "lucide-react";
import type { Block, BlockType } from "./types";
import { uid } from "../lib/hooks";

export type BlockGroup = "Estructura" | "Preguntas" | "Métricas" | "Arquitectura de información" | "Pruebas visuales" | "Prototipos";

export interface BlockDef {
  type: BlockType;
  label: string;
  description: string;
  icon: ReactNode;
  group: BlockGroup;
  collectsAnswer: boolean;
  /** tipos de condición que admite su lógica */
  logic: ("choice" | "number" | "success")[];
  create: () => Block;
}

export const SUS_ITEMS = [
  "Creo que me gustaría usar {p} con frecuencia.",
  "Encontré {p} innecesariamente complejo.",
  "Pensé que {p} era fácil de usar.",
  "Creo que necesitaría el apoyo de una persona técnica para poder usar {p}.",
  "Encontré que las distintas funciones de {p} estaban bien integradas.",
  "Pensé que había demasiada inconsistencia en {p}.",
  "Imagino que la mayoría de las personas aprendería a usar {p} muy rápido.",
  "Encontré {p} muy engorroso de usar.",
  "Me sentí muy seguro/a usando {p}.",
  "Necesité aprender muchas cosas antes de poder empezar a usar {p}.",
];

const opts = (...l: string[]) => l.map((label) => ({ id: uid(), label }));

export const BLOCKS: BlockDef[] = [
  // ── Estructura
  { type: "welcome", get label() { return t("Bienvenida"); }, group: "Estructura", collectsAnswer: false, logic: [], icon: <DoorOpen size={16} />,
    get description() { return t("Pantalla inicial con el contexto"); },
    create: () => ({ id: uid(), type: "welcome", title: tc("¡Gracias por participar!"), description: tc("Este estudio toma unos 5 minutos. No hay respuestas correctas o incorrectas: estamos evaluando el diseño, no a ti."), buttonLabel: tc("Comenzar") }) },
  { type: "context", get label() { return t("Instrucciones"); }, group: "Estructura", collectsAnswer: false, logic: [], icon: <Info size={16} />,
    get description() { return t("Texto o imagen entre secciones"); },
    create: () => ({ id: uid(), type: "context", title: tc("Antes de continuar"), description: tc("Imagina que…") }) },
  { type: "thank_you", get label() { return t("Agradecimiento"); }, group: "Estructura", collectsAnswer: false, logic: [], icon: <PartyPopper size={16} />,
    get description() { return t("Pantalla final"); },
    create: () => ({ id: uid(), type: "thank_you", title: tc("¡Listo, muchas gracias!"), description: tc("Tus respuestas nos ayudan a diseñar una mejor experiencia.") }) },

  // ── Preguntas
  { type: "open_question", get label() { return t("Pregunta abierta"); }, group: "Preguntas", collectsAnswer: true, logic: [], icon: <MessageSquareText size={16} />,
    get description() { return t("Respuesta libre en texto"); },
    create: () => ({ id: uid(), type: "open_question", title: tc("¿Qué fue lo más difícil?"), required: true, multiline: true, placeholder: tc("Escribe tu respuesta…") }) },
  { type: "choice", get label() { return t("Opción múltiple"); }, group: "Preguntas", collectsAnswer: true, logic: ["choice"], icon: <ListChecks size={16} />,
    get description() { return t("Una o varias opciones"); },
    create: () => ({ id: uid(), type: "choice", title: tc("Selecciona una opción"), required: true, multiple: false, allowOther: false, randomize: false, options: opts(tc("Opción 1"), tc("Opción 2"), tc("Opción 3")) }) },
  { type: "yes_no", get label() { return t("Sí / No"); }, group: "Preguntas", collectsAnswer: true, logic: ["choice"], icon: <ThumbsUp size={16} />,
    get description() { return t("Pregunta binaria rápida"); },
    create: () => ({ id: uid(), type: "yes_no", title: tc("¿Pudiste completar la tarea?"), required: true, yesLabel: tc("Sí"), noLabel: tc("No") }) },
  { type: "scale", get label() { return t("Escala / Likert"); }, group: "Preguntas", collectsAnswer: true, logic: ["number"], icon: <SlidersHorizontal size={16} />,
    get description() { return t("Números, estrellas o emojis"); },
    create: () => ({ id: uid(), type: "scale", title: tc("¿Qué tan fácil fue completar la tarea?"), required: true, min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil"), style: "numbers" }) },
  { type: "ranking", get label() { return t("Ranking"); }, group: "Preguntas", collectsAnswer: true, logic: [], icon: <ListOrdered size={16} />,
    get description() { return t("Ordenar por prioridad arrastrando"); },
    create: () => ({ id: uid(), type: "ranking", title: tc("Ordena estas funciones de la más a la menos importante para ti"), required: true, randomize: true, items: opts(tc("Función A"), tc("Función B"), tc("Función C"), tc("Función D")) }) },
  { type: "matrix", get label() { return t("Matriz"); }, group: "Preguntas", collectsAnswer: true, logic: [], icon: <Grid3x3 size={16} />,
    get description() { return t("Varias afirmaciones con la misma escala"); },
    create: () => ({ id: uid(), type: "matrix", title: tc("¿Qué tan de acuerdo estás con cada afirmación?"), required: true,
      rows: opts(tc("Es fácil de usar"), tc("Se ve confiable"), tc("Encuentro lo que busco")),
      columns: opts(tc("Muy en desacuerdo"), tc("En desacuerdo"), tc("Neutral"), tc("De acuerdo"), tc("Muy de acuerdo")) }) },

  // ── Métricas
  { type: "nps", get label() { return t("NPS"); }, group: "Métricas", collectsAnswer: true, logic: ["number"], icon: <Gauge size={16} />,
    get description() { return t("Net Promoter Score (0–10)"); },
    create: () => ({ id: uid(), type: "nps", title: tc("¿Qué tan probable es que recomiendes este producto a un amigo o colega?"), required: true }) },
  { type: "sus", get label() { return t("Cuestionario SUS"); }, group: "Métricas", collectsAnswer: true, logic: [], icon: <ClipboardCheck size={16} />,
    get description() { return t("System Usability Scale · 10 ítems"); },
    create: () => ({ id: uid(), type: "sus", title: tc("Cuéntanos tu experiencia"), description: tc("Indica qué tan de acuerdo estás con cada afirmación."), required: true, product: tc("este sistema") }) },

  { type: "kano", get label() { return t("Análisis Kano"); }, group: "Métricas", collectsAnswer: true, logic: [], icon: <Scale size={16} />,
    get description() { return t("Clasifica funcionalidades: obligatorias, atractivas…"); },
    create: () => ({ id: uid(), type: "kano", title: tc("Cuéntanos cómo te sentirías con estas funcionalidades"), description: tc("Para cada una responderás dos preguntas: si la tuviera y si no la tuviera."),
      required: true, askImportance: true, funcQ: tc("Si el producto tuviera «{f}», ¿cómo te sentirías?"), dysQ: tc("Si el producto NO tuviera «{f}», ¿cómo te sentirías?"),
      features: opts(tc("Modo sin conexión"), tc("Notificaciones de entrega"), tc("Modo oscuro")) }) },

  // ── Arquitectura de información
  { type: "card_sort", get label() { return t("Card Sorting"); }, group: "Arquitectura de información", collectsAnswer: true, logic: [], icon: <LayoutGrid size={16} />,
    get description() { return t("Agrupar tarjetas en categorías"); },
    create: () => ({ id: uid(), type: "card_sort", title: tc("Organiza las tarjetas en los grupos que tengan más sentido para ti"), required: true,
      description: tc("Agrupa las tarjetas como te parezca más lógico. No hay respuestas correctas."),
      mode: "open", randomize: true, requireAll: true,
      cards: opts(tc("Historial de pedidos"), tc("Métodos de pago"), tc("Direcciones guardadas"), tc("Cupones"), tc("Notificaciones"), tc("Ayuda"), tc("Seguimiento de envío"), tc("Facturas")),
      categories: opts(tc("Mi cuenta"), tc("Compras"), tc("Soporte")) }) },
  { type: "tree_test", get label() { return t("Tree Test"); }, group: "Arquitectura de información", collectsAnswer: true, logic: ["success"], icon: <Network size={16} />,
    get description() { return t("¿Encuentran dónde está cada cosa?"); },
    create: () => ({ id: uid(), type: "tree_test", title: tc("¿Dónde buscarías para cambiar tu método de pago?"), required: true, correct: [tc("Mi cuenta/Pagos/Métodos de pago")],
      treeText: tc("Inicio\n  Ofertas\n  Categorías\nMi cuenta\n  Perfil\n  Pagos\n    Métodos de pago\n    Facturas\n  Direcciones\nPedidos\n  Activos\n  Historial\nAyuda\n  Preguntas frecuentes\n  Contacto") }) },

  // ── Pruebas visuales
  { type: "preference", get label() { return t("Preference Test"); }, group: "Pruebas visuales", collectsAnswer: true, logic: ["choice"], icon: <Images size={16} />,
    get description() { return t("Elegir entre 2+ diseños"); },
    create: () => ({ id: uid(), type: "preference", title: tc("¿Cuál de estos diseños prefieres?"), required: true, askWhy: true, randomize: true, options: [{ id: uid(), label: tc("Diseño A") }, { id: uid(), label: tc("Diseño B") }] }) },
  { type: "five_second", get label() { return t("Five Second Test"); }, group: "Pruebas visuales", collectsAnswer: true, logic: [], icon: <Timer size={16} />,
    get description() { return t("Mostrar una imagen por pocos segundos"); },
    create: () => ({ id: uid(), type: "five_second", title: tc("Observa la siguiente pantalla"), description: tc("Se mostrará solo por unos segundos. Después te haremos algunas preguntas."), seconds: 5, required: true }) },
  { type: "first_click", get label() { return t("First Click"); }, group: "Pruebas visuales", collectsAnswer: true, logic: ["success"], icon: <MousePointerClick size={16} />,
    get description() { return t("¿Dónde harían clic primero?"); },
    create: () => ({ id: uid(), type: "first_click", title: tc("¿Dónde harías clic para ver tus pedidos?"), required: true, area: null }) },

  // ── Prototipos
  { type: "prototype_task", get label() { return t("Tarea en prototipo"); }, group: "Prototipos", collectsAnswer: true, logic: ["success"], icon: <Smartphone size={16} />,
    get description() { return t("Completar una tarea navegando tu prototipo"); },
    create: () => ({ id: uid(), type: "prototype_task", title: tc("Encuentra el estado de tu último pedido"), description: tc("Navega el prototipo como lo harías en la app real. Cuando creas que terminaste, avanzará solo."),
      required: true, prototypeId: "", startScreen: "", goalScreens: [], expectedPath: [], allowGiveUp: true }) },
];

export const BLOCK_GROUPS: BlockGroup[] = ["Estructura", "Preguntas", "Métricas", "Prototipos", "Arquitectura de información", "Pruebas visuales"];
export const blockDef = (type: string) => BLOCKS.find((b) => b.type === type);
export const isStructural = (b: Block) => b.type === "welcome" || b.type === "context" || b.type === "thank_you";
