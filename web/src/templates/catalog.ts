import { t, tc } from "../lib/i18n";
import type { Block } from "../blocks/types";
import { blockDef } from "../blocks/registry";
import { uid } from "../lib/hooks";

export type Category =
  | "Usabilidad"
  | "Arquitectura de información"
  | "Generativa"
  | "Síntesis y mapeo"
  | "Métricas"
  | "Organización";

export interface Template {
  key: string;
  name: string;
  category: Category;
  description: string;
  when: string;           // cuándo usarlo
  duration: string;       // tiempo estimado por participante
  participants: string;   // muestra recomendada
  phase: number;          // fase del roadmap en que se habilita
  build?: () => Block[];  // si existe, el template ya está disponible
  guide?: string[];       // pasos guiados que se muestran en el builder
  doc?: string;           // si es un documento (plantilla para llenar), su tipo
  tab?: string;           // si es una función del proyecto (no un estudio ni un documento), la pestaña a abrir
}

// Helpers para construir bloques a partir del registro
const b = <T extends Block["type"]>(type: T, patch: Partial<Extract<Block, { type: T }>> = {}) =>
  ({ ...blockDef(type)!.create(), ...patch }) as Block;
const opts = (...labels: string[]) => labels.map((label) => ({ id: uid(), label }));

export const CATEGORIES: { id: Category; blurb: string }[] = [
  { id: "Usabilidad", get blurb() { return t("Evalúa si las personas pueden usar tu diseño"); } },
  { id: "Arquitectura de información", get blurb() { return t("Organiza contenido como lo piensa el usuario"); } },
  { id: "Generativa", get blurb() { return t("Descubre necesidades, contexto y motivaciones"); } },
  { id: "Síntesis y mapeo", get blurb() { return t("Convierte datos en entendimiento compartido"); } },
  { id: "Métricas", get blurb() { return t("Cuestionarios estandarizados y comparables"); } },
  { id: "Organización", get blurb() { return t("Planifica, recluta y comunica la investigación"); } },
];

export const TEMPLATES: Template[] = [
  // ── Usabilidad ────────────────────────────────────────────────
  { key: "prototype_test", get name() { return t("Prototype Testing"); }, category: "Usabilidad", phase: 3,
    get description() { return t("Sube las pantallas de tu prototipo, conecta zonas clicables y mide éxito directo/indirecto, rutas, tiempo y mapas de calor por pantalla."); },
    get when() { return t("Validar flujos antes de desarrollar."); }, get duration() { return t("8–12 min"); }, get participants() { return t("15–30"); },
    get guide() { return ["En Figma selecciona tus frames → Export PNG 2x.", "Abre Prototipos (arriba) y arrastra todas las pantallas.", "Dibuja zonas clicables y elige a qué pantalla llevan; usa Probar.", "En cada tarea elige pantalla inicial, meta y ruta esperada.", "Redacta la tarea como un objetivo, sin decir dónde hacer clic."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Vas a probar un prototipo. Algunas partes pueden no funcionar: es normal. Piensa en voz alta si quieres, y recuerda que evaluamos el diseño, no a ti.") }),
      b("prototype_task"),
      b("scale", { title: tc("En general, ¿qué tan difícil o fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("prototype_task", { title: tc("Cambia tu método de pago predeterminado") } as Partial<Block>),
      b("scale", { title: tc("En general, ¿qué tan difícil o fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("open_question", { title: tc("¿Hubo algo confuso o que esperabas encontrar de otra forma?"), required: false }),
      b("thank_you"),
    ] },
  { key: "usability_moderated", doc: "usability_script", get name() { return t("Usability Test moderado"); }, category: "Usabilidad", phase: 5,
    get description() { return t("Guion de sesión, tareas, notas en vivo con timestamps y etiquetado de observaciones."); },
    get when() { return t("Entender el porqué detrás de los problemas."); }, get duration() { return t("45–60 min"); }, get participants() { return t("5–8"); } },
  { key: "usability_unmoderated", get name() { return t("Usability Test no moderado"); }, category: "Usabilidad", phase: 3,
    get description() { return t("Tareas en tu prototipo + SEQ por tarea + SUS al final. El test de usabilidad completo, sin moderador."); },
    get when() { return t("Escalar validación con más participantes."); }, get duration() { return t("10–15 min"); }, get participants() { return t("20–50"); },
    get guide() { return ["En Figma selecciona tus frames → Export PNG 2x.", "Abre Prototipos (arriba) y arrastra todas las pantallas.", "Dibuja zonas clicables y elige a qué pantalla llevan; usa Probar.", "En cada tarea elige pantalla inicial, meta y ruta esperada.", "Redacta la tarea como un objetivo, sin decir dónde hacer clic."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Vas a completar algunas tareas en un prototipo y luego responder unas preguntas cortas. Toma unos 10 minutos.") }),
      b("prototype_task"),
      b("scale", { title: tc("¿Qué tan fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("prototype_task", { title: tc("Cambia tu método de pago predeterminado") } as Partial<Block>),
      b("scale", { title: tc("¿Qué tan fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("sus", { product: tc("la app") }),
      b("open_question", { title: tc("¿Qué cambiarías primero?"), required: false }),
      b("thank_you"),
    ] },
  { key: "first_click", get name() { return t("First Click Test"); }, category: "Usabilidad", phase: 2,
    get description() { return t("Dónde hacen clic primero para completar una tarea. Resultado en mapa de clics y tasa de acierto."); },
    get when() { return t("Validar navegación y jerarquía visual."); }, get duration() { return t("3–5 min"); }, get participants() { return t("30+"); },
    get guide() { return ["Sube la captura de tu pantalla en cada tarea.", "Arrastra sobre la imagen para marcar el área correcta.", "Escribe la tarea como un objetivo: \"¿Dónde harías clic para…?\"", "Agrega una tarea por bloque; puedes duplicar el bloque."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Verás algunas pantallas. En cada una, haz clic donde lo harías primero para completar la tarea. Confía en tu primer instinto.") }),
      b("first_click", { title: tc("¿Dónde harías clic para ver el estado de tu pedido?") }),
      b("scale", { title: tc("¿Qué tan seguro/a estás de tu respuesta?"), min: 1, max: 5, minLabel: tc("Nada seguro"), maxLabel: tc("Muy seguro") }),
      b("thank_you"),
    ] },
  { key: "five_second", get name() { return t("Five Second Test"); }, category: "Usabilidad", phase: 2,
    get description() { return t("Muestra un diseño unos segundos y mide primera impresión y recordación."); },
    get when() { return t("Probar claridad del mensaje de una landing o pantalla."); }, get duration() { return t("2–3 min"); }, get participants() { return t("20–50"); },
    get guide() { return ["Sube la imagen del diseño en el bloque Five Second.", "Elige cuántos segundos se mostrará (5 es el estándar).", "Ajusta las preguntas de recordación que siguen.", "Evita preguntas que se respondan solo con el logo."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Te mostraremos una pantalla solo por unos segundos. Luego te haremos preguntas sobre lo que recuerdas.") }),
      b("five_second"),
      b("open_question", { title: tc("¿De qué trata la página que viste?") }),
      b("open_question", { title: tc("¿Qué elementos recuerdas?"), required: false }),
      b("scale", { title: tc("¿Qué tan confiable te pareció?"), min: 1, max: 5, minLabel: tc("Nada confiable"), maxLabel: tc("Muy confiable"), style: "stars" }),
      b("thank_you"),
    ] },
  { key: "preference_test", get name() { return t("Preference Test (A/B)"); }, category: "Usabilidad", phase: 2,
    get description() { return t("Compara 2+ variantes de diseño y pregunta por qué eligieron una."); },
    get when() { return t("Decidir entre opciones visuales."); }, get duration() { return t("3–5 min"); }, get participants() { return t("30+"); },
    get guide() { return ["Sube una imagen por cada variante de diseño.", "Nómbralas de forma neutral (Diseño A, B…) para no sesgar.", "Deja activo el orden aleatorio.", "Haz una pregunta específica: \"¿Cuál te transmite más confianza?\""].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Te mostraremos algunas propuestas de diseño. Elige la que prefieras y cuéntanos por qué.") }),
      b("preference"),
      b("thank_you"),
    ] },
  { key: "tree_test", get name() { return t("Tree Testing"); }, category: "Usabilidad", phase: 2,
    get description() { return t("Valida la arquitectura de información sin interfaz visual: ¿encuentran dónde está cada cosa?"); },
    get when() { return t("Después de un card sorting o antes de rediseñar un menú."); }, get duration() { return t("5–10 min"); }, get participants() { return t("30–50"); },
    get guide() { return ["Escribe tu menú con sangría (2 espacios por nivel).", "En cada tarea marca el/los destinos correctos.", "Redacta tareas sin usar las mismas palabras del menú.", "Usa entre 5 y 10 tareas; duplica el bloque para crear más."].map((x) => t(x)); },
    build: () => {
      const t1 = blockDef("tree_test")!.create();
      const t2 = { ...blockDef("tree_test")!.create(), title: tc("Quieres ver si tu pedido de ayer ya salió. ¿Dónde lo buscarías?"), correct: [tc("Pedidos/Activos")] } as Block;
      const t3 = { ...blockDef("tree_test")!.create(), title: tc("Necesitas una factura de una compra del mes pasado. ¿Dónde la buscarías?"), correct: [tc("Mi cuenta/Pagos/Facturas"), tc("Pedidos/Historial")] } as Block;
      (t2 as { treeText: string }).treeText = (t1 as { treeText: string }).treeText;
      (t3 as { treeText: string }).treeText = (t1 as { treeText: string }).treeText;
      return [
        b("welcome", { description: tc("Te daremos algunas tareas. Para cada una, navega el menú y elige dónde buscarías. No hay respuestas incorrectas: estamos evaluando el menú.") }),
        t1, t2, t3,
        b("scale", { title: tc("En general, ¿qué tan fácil fue encontrar las cosas?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
        b("thank_you"),
      ];
    } },
  { key: "time_study", get name() { return t("Estudio de tiempos (time on task)"); }, category: "Usabilidad", phase: 2,
    get description() { return t("Cronometra cuánto tarda cada persona en completar tareas reales, en tu producto o fuera de la pantalla. Éxito, mediana, tiempo por participante y comparación contra un tiempo de referencia."); },
    get when() { return t("Medir eficiencia y comparar versiones o procesos."); }, get duration() { return t("5–15 min"); }, get participants() { return t("10–30"); },
    get guide() { return ["Escribe cada tarea como un objetivo concreto con un final claro: \"Agrega un producto al carrito\".", "Pega el link del producto o del prototipo publicado: se abre en otra pestaña al empezar. Si la tarea es fuera de pantalla, déjalo vacío y explica dónde se hace.", "Mide tú el tiempo de referencia (o toma el de la versión actual) y anótalo en cada tarea.", "Deja un tiempo límite para que nadie se quede atascado.", "Conserva la escala de facilidad (SEQ) después de cada tarea: cruza tiempo con esfuerzo percibido."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Vas a completar algunas tareas mientras medimos cuánto tiempo toman. Hazlas a tu ritmo normal, sin apurarte: evaluamos el diseño, no a ti.") }),
      b("timed_task"),
      b("scale", { title: tc("En general, ¿qué tan difícil o fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("timed_task", { title: tc("Agrega un producto al carrito y llega hasta el pago"), description: tc("No necesitas pagar: detente cuando veas el resumen del pedido y vuelve aquí.") } as Partial<Block>),
      b("scale", { title: tc("En general, ¿qué tan difícil o fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("open_question", { title: tc("¿En qué tarea perdiste más tiempo? ¿Qué te detuvo?"), required: false }),
      b("thank_you"),
    ] },
  { key: "heuristic_eval", doc: "heuristic_eval", get name() { return t("Evaluación heurística (Nielsen)"); }, category: "Usabilidad", phase: 5,
    get description() { return t("Checklist de las 10 heurísticas con severidad por hallazgo."); },
    get when() { return t("Auditoría experta rápida."); }, get duration() { return t("1–2 h"); }, get participants() { return t("3–5 evaluadores"); } },

  // ── Arquitectura de información ──────────────────────────────
  { key: "card_sort_open", get name() { return t("Card Sorting abierto"); }, category: "Arquitectura de información", phase: 2,
    get description() { return t("Los participantes agrupan tarjetas y nombran sus propias categorías."); },
    get when() { return t("Descubrir modelos mentales al crear navegación."); }, get duration() { return t("10–15 min"); }, get participants() { return t("15–30"); },
    get guide() { return ["Escribe o pega tus tarjetas (una por línea con \"Pegar lista\").", "Usa entre 30 y 50 tarjetas con nombres claros y sin jerga.", "Revisa la vista previa como participante.", "En resultados, revisa la matriz de similitud para detectar grupos naturales."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Verás una lista de tarjetas. Organízalas en grupos que tengan sentido para ti. No hay respuestas correctas o incorrectas.") }),
      b("card_sort", { mode: "open" }),
      b("open_question", { title: tc("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?"), required: false }),
      b("thank_you"),
    ] },
  { key: "card_sort_closed", get name() { return t("Card Sorting cerrado"); }, category: "Arquitectura de información", phase: 2,
    get description() { return t("Agrupan tarjetas en categorías predefinidas."); },
    get when() { return t("Validar una estructura existente."); }, get duration() { return t("10–15 min"); }, get participants() { return t("15–30"); },
    get guide() { return ["Escribe o pega tus tarjetas (una por línea con \"Pegar lista\").", "Define tus categorías actuales.", "Usa entre 30 y 50 tarjetas con nombres claros y sin jerga.", "Revisa la vista previa como participante.", "En resultados, revisa la matriz de similitud para detectar grupos naturales."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Verás una lista de tarjetas. Organízalas en grupos que tengan sentido para ti. No hay respuestas correctas o incorrectas.") }),
      b("card_sort", { mode: "closed" }),
      b("open_question", { title: tc("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?"), required: false }),
      b("thank_you"),
    ] },
  { key: "card_sort_hybrid", get name() { return t("Card Sorting híbrido"); }, category: "Arquitectura de información", phase: 2,
    get description() { return t("Categorías predefinidas + posibilidad de crear nuevas. Matriz de similitud por tarjeta."); },
    get when() { return t("Refinar una estructura con apertura."); }, get duration() { return t("10–15 min"); }, get participants() { return t("15–30"); },
    get guide() { return ["Escribe o pega tus tarjetas (una por línea con \"Pegar lista\").", "Define tus categorías actuales.", "Usa entre 30 y 50 tarjetas con nombres claros y sin jerga.", "Revisa la vista previa como participante.", "En resultados, revisa la matriz de similitud para detectar grupos naturales."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Verás una lista de tarjetas. Organízalas en grupos que tengan sentido para ti. No hay respuestas correctas o incorrectas.") }),
      b("card_sort", { mode: "hybrid" }),
      b("open_question", { title: tc("¿Hubo alguna tarjeta difícil de ubicar? ¿Por qué?"), required: false }),
      b("thank_you"),
    ] },

  // ── Generativa ───────────────────────────────────────────────
  { key: "survey", get name() { return t("Encuesta"); }, category: "Generativa", phase: 1,
    get description() { return t("Preguntas abiertas, opción múltiple y escalas. Base para cualquier cuestionario."); },
    get when() { return t("Recolectar datos cuantitativos y cualitativos a escala."); }, get duration() { return t("5–8 min"); }, get participants() { return t("50+"); },
    get guide() { return ["Define 1 objetivo por encuesta y elimina preguntas que no lo respondan.", "Empieza con preguntas fáciles y deja las abiertas al final.", "Usa Lógica para saltar preguntas que no apliquen.", "Prueba la encuesta antes de enviarla."].map((x) => t(x)); },
    build: () => [
      b("welcome"),
      b("choice", { title: tc("¿Con qué frecuencia usas el producto?"), options: opts(tc("Diario"), tc("Varias veces por semana"), tc("Una vez por semana"), tc("Menos de una vez por semana")) }),
      b("choice", { title: tc("¿Para qué lo usas principalmente?"), multiple: true, allowOther: true, required: false, options: opts(tc("Opción A"), tc("Opción B"), tc("Opción C")) }),
      b("scale", { title: tc("En general, ¿qué tan satisfecho/a estás?"), min: 1, max: 5, minLabel: tc("Nada satisfecho"), maxLabel: tc("Muy satisfecho"), style: "stars" }),
      b("open_question", { title: tc("Si pudieras cambiar una sola cosa, ¿qué sería?") }),
      b("thank_you"),
    ] },
  { key: "prioritization", get name() { return t("Priorización de funcionalidades"); }, category: "Generativa", phase: 2,
    get description() { return t("Ranking de funcionalidades + matriz de valor para decidir qué construir primero."); },
    get when() { return t("Planificar el roadmap con evidencia de usuarios."); }, get duration() { return t("3–5 min"); }, get participants() { return t("30+"); },
    get guide() { return ["Escribe las funcionalidades en el ranking (máx. 7–8).", "Usa las mismas en las filas de la matriz.", "Activa el orden aleatorio para evitar sesgo."].map((x) => t(x)); },
    build: () => [
      b("welcome"),
      b("ranking"),
      b("matrix", { title: tc("¿Qué tan útil sería cada funcionalidad para ti?"), rows: opts(tc("Función A"), tc("Función B"), tc("Función C"), tc("Función D")), columns: opts(tc("Nada útil"), tc("Poco útil"), tc("Útil"), tc("Muy útil"), tc("Indispensable")) }),
      b("open_question", { title: tc("¿Falta alguna funcionalidad que necesites?"), required: false }),
      b("thank_you"),
    ] },
  { key: "interview", doc: "interview_guide", get name() { return t("Entrevistas de usuario"); }, category: "Generativa", phase: 5,
    get description() { return t("Guía de preguntas, notas por participante, transcripción y etiquetado de citas."); },
    get when() { return t("Explorar necesidades y motivaciones en profundidad."); }, get duration() { return t("30–60 min"); }, get participants() { return t("5–12"); } },
  { key: "aeiou", doc: "aeiou", get name() { return t("AEIOU (observación)"); }, category: "Generativa", phase: 5,
    get description() { return t("Plantilla de observación de campo: Activities, Environments, Interactions, Objects, Users."); },
    get when() { return t("Investigación contextual y etnográfica."); }, get duration() { return t("Variable"); }, get participants() { return t("Sesiones de campo"); } },
  { key: "diary_study", doc: "diary_study", get name() { return t("Diary Study"); }, category: "Generativa", phase: 5,
    get description() { return t("Entradas recurrentes del participante durante días o semanas."); },
    get when() { return t("Comportamientos que ocurren en el tiempo."); }, get duration() { return t("1–4 semanas"); }, get participants() { return t("8–15"); } },
  { key: "contextual_inquiry", doc: "observation", get name() { return t("Contextual Inquiry"); }, category: "Generativa", phase: 5,
    get description() { return t("Observación + entrevista en el entorno real del usuario (modelo maestro-aprendiz)."); },
    get when() { return t("Entender flujos de trabajo reales (p. ej. bodega, punto de venta)."); }, get duration() { return t("1–2 h"); }, get participants() { return t("4–8"); } },
  { key: "jtbd", doc: "jtbd", get name() { return t("Jobs To Be Done"); }, category: "Generativa", phase: 5,
    get description() { return t("Job statements, contexto de la contratación y fuerzas del progreso."); },
    get when() { return t("Entender por qué alguien 'contrata' tu producto."); }, get duration() { return t("45 min"); }, get participants() { return t("8–12"); } },
  { key: "screener", get name() { return t("Screener de reclutamiento"); }, category: "Generativa", phase: 1,
    get description() { return t("Cuestionario corto para filtrar y calificar participantes antes de un estudio."); },
    get when() { return t("Reclutar el perfil correcto."); }, get duration() { return t("2–3 min"); }, get participants() { return t("Todos los candidatos"); },
    build: () => [
      b("welcome", { title: tc("Buscamos participantes"), description: tc("Responde estas preguntas rápidas para saber si encajas en nuestro próximo estudio."), buttonLabel: tc("Empezar") }),
      b("choice", { title: tc("¿Cuál describe mejor tu rol?"), options: opts(tc("Operaciones"), tc("Ventas"), tc("Administración"), tc("Tecnología"), tc("Otro")) }),
      b("choice", { title: tc("¿Qué herramientas usas en tu trabajo?"), multiple: true, allowOther: true, options: opts(tc("Punto de venta"), tc("Sistema de inventario"), tc("Hojas de cálculo"), tc("App móvil")) }),
      b("choice", { title: tc("¿Estarías disponible para una sesión de 45 minutos por videollamada?"), options: opts(tc("Sí"), tc("No")) }),
      b("open_question", { title: tc("Correo o WhatsApp para contactarte"), multiline: false, placeholder: "tu@correo.com" }),
      b("thank_you", { title: tc("¡Gracias!"), description: tc("Si tu perfil encaja, te contactaremos pronto.") }),
    ] },

  // ── Síntesis y mapeo ─────────────────────────────────────────
  { key: "affinity_map", doc: "affinity", get name() { return t("Affinity Mapping"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Canvas de notas adhesivas para agrupar observaciones por tema."); }, get when() { return t("Después de entrevistas o tests."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "empathy_map", doc: "empathy_map", get name() { return t("Empathy Map"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Dice, Piensa, Hace, Siente + dolores y ganancias."); }, get when() { return t("Alinear al equipo sobre un segmento."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "persona", doc: "persona_profile", get name() { return t("User Personas"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Proto-persona o persona validada con evidencia ligada a insights."); }, get when() { return t("Comunicar segmentos."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "journey_map", doc: "journey_map", get name() { return t("Customer Journey Map"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Etapas, acciones, pensamientos, emociones, pain points y oportunidades."); }, get when() { return t("Visualizar la experiencia de punta a punta."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "service_blueprint", doc: "service_blueprint", get name() { return t("Service Blueprint"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Frontstage, backstage, procesos de soporte y evidencia física."); }, get when() { return t("Servicios con muchas partes (operaciones, logística)."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "cognitive_map", doc: "cognitive_map", get name() { return t("Cognitive Mapping"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Mapa de conceptos y relaciones de cómo el usuario entiende un sistema."); }, get when() { return t("Explorar modelos mentales complejos."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo o participantes"); } },
  { key: "user_flow", doc: "user_flow", get name() { return t("User / Task Flow"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Diagrama de pasos, decisiones y salidas de una tarea."); }, get when() { return t("Documentar flujos actuales o ideales."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },
  { key: "stakeholder_map", doc: "stakeholder_map", get name() { return t("Stakeholder Map"); }, category: "Síntesis y mapeo", phase: 5,
    get description() { return t("Actores, influencia e interés alrededor del producto."); }, get when() { return t("Al iniciar un proyecto."); }, get duration() { return t("Taller"); }, get participants() { return t("Equipo"); } },

  // ── Métricas ─────────────────────────────────────────────────
  { key: "sus", get name() { return t("SUS · System Usability Scale"); }, category: "Métricas", phase: 1,
    get description() { return t("10 ítems estandarizados. Calcula el puntaje (0–100), la calificación y lo compara con el promedio de 68."); },
    get when() { return t("Medir usabilidad percibida y comparar versiones."); }, get duration() { return t("2–3 min"); }, get participants() { return t("20+"); },
    get guide() { return ["Escribe el nombre del producto en el bloque SUS.", "Aplícalo justo después de que usen el producto.", "No cambies el texto de los 10 ítems: así el puntaje es comparable."].map((x) => t(x)); },
    build: () => [
      b("welcome", { title: tc("Evaluación de usabilidad"), description: tc("Son 10 afirmaciones cortas sobre tu experiencia. Toma menos de 3 minutos.") }),
      b("sus"),
      b("open_question", { title: tc("¿Algo más que quieras contarnos?"), required: false }),
      b("thank_you"),
    ] },
  { key: "nps", get name() { return t("NPS · Net Promoter Score"); }, category: "Métricas", phase: 1,
    get description() { return t("Probabilidad de recomendación 0–10 con promotores, pasivos y detractores. Incluye lógica: pregunta distinta según la nota."); },
    get when() { return t("Medir lealtad periódicamente."); }, get duration() { return t("1 min"); }, get participants() { return t("100+"); },
    get guide() { return ["Cambia el nombre del producto en la pregunta.", "Revisa la pestaña Lógica del bloque NPS: ya separa detractores y promotores.", "Ajusta las preguntas de seguimiento."].map((x) => t(x)); },
    build: () => {
      const nps = b("nps"), det = b("open_question", { title: tc("¿Qué es lo que más deberíamos mejorar?") }),
        pro = b("open_question", { title: tc("¡Genial! ¿Qué es lo que más te gusta?") }), end = b("thank_you");
      nps.logic = { rules: [{ id: uid(), op: "lt", value: 7, goTo: det.id }, { id: uid(), op: "gt", value: 8, goTo: pro.id }], otherwise: det.id };
      det.logic = { rules: [], otherwise: "end" };
      return [nps, det, pro, end];
    } },
  { key: "csat_ces", get name() { return t("CSAT / CES"); }, category: "Métricas", phase: 1,
    get description() { return t("Satisfacción (CSAT) y esfuerzo percibido (CES) después de una interacción."); },
    get when() { return t("Después de completar un flujo o contactar soporte."); }, get duration() { return t("1–2 min"); }, get participants() { return t("50+"); },
    build: () => [
      b("scale", { title: tc("¿Qué tan satisfecho/a estás con tu experiencia de hoy?"), min: 1, max: 5, minLabel: tc("Muy insatisfecho"), maxLabel: tc("Muy satisfecho"), style: "stars" }),
      b("scale", { title: tc("La empresa me facilitó resolver lo que necesitaba."), min: 1, max: 7, minLabel: tc("Totalmente en desacuerdo"), maxLabel: tc("Totalmente de acuerdo") }),
      b("open_question", { title: tc("¿Qué podríamos hacer mejor?"), required: false }),
      b("thank_you"),
    ] },
  { key: "seq", get name() { return t("SEQ · Single Ease Question"); }, category: "Métricas", phase: 1,
    get description() { return t("Una pregunta de facilidad (1–7) para usar después de cada tarea."); },
    get when() { return t("Comparar dificultad entre tareas."); }, get duration() { return t("<1 min"); }, get participants() { return t("Por tarea"); },
    build: () => [
      b("context", { title: tc("Tarea"), description: tc("Describe aquí la tarea que el participante acaba de realizar.") }),
      b("scale", { title: tc("En general, ¿qué tan difícil o fácil fue completar esta tarea?"), min: 1, max: 7, minLabel: tc("Muy difícil"), maxLabel: tc("Muy fácil") }),
      b("thank_you"),
    ] },
  { key: "umux_lite", get name() { return t("UMUX-Lite"); }, category: "Métricas", phase: 1,
    get description() { return t("Versión corta de 2 ítems correlacionada con SUS."); },
    get when() { return t("Cuando necesitas algo más corto que SUS."); }, get duration() { return t("<1 min"); }, get participants() { return t("20+"); },
    build: () => [
      b("scale", { title: tc("Las funciones de este sistema cumplen con mis necesidades."), min: 1, max: 7, minLabel: tc("Totalmente en desacuerdo"), maxLabel: tc("Totalmente de acuerdo") }),
      b("scale", { title: tc("Este sistema es fácil de usar."), min: 1, max: 7, minLabel: tc("Totalmente en desacuerdo"), maxLabel: tc("Totalmente de acuerdo") }),
      b("thank_you"),
    ] },

  { key: "kano", get name() { return t("Análisis Kano"); }, category: "Métricas", phase: 1,
    get description() { return t("Cada participante responde cómo se sentiría con y sin cada funcionalidad. Se clasifican solas en obligatorias, unidimensionales, atractivas o indiferentes."); },
    get when() { return t("Priorizar el backlog según el impacto en la satisfacción."); }, get duration() { return t("4–8 min"); }, get participants() { return t("20+"); },
    get guide() { return ["Escribe las funcionalidades (máx. 10–12 para no cansar).", "Usa nombres que el usuario entienda, sin jerga técnica.", "Deja activa la pregunta de importancia.", "En resultados, prioriza: obligatorias → unidimensionales → atractivas."].map((x) => t(x)); },
    build: () => [
      b("welcome", { description: tc("Te mostraremos algunas funcionalidades. Para cada una te preguntaremos cómo te sentirías si el producto la tuviera y si no la tuviera.") }),
      b("kano"),
      b("open_question", { title: tc("¿Hay alguna funcionalidad que eches de menos?"), required: false }),
      b("thank_you"),
    ] },

  // ── Organización ─────────────────────────────────────────────
  { key: "research_plan", doc: "ux_blueprint", get name() { return t("Research Plan"); }, category: "Organización", phase: 6,
    get description() { return t("Objetivos, preguntas de investigación, hipótesis, metodología, reclutamiento y timeline."); },
    get when() { return t("Al iniciar cualquier investigación."); }, get duration() { return t("—"); }, get participants() { return t("—"); } },
  { key: "participants", tab: "participants", get name() { return t("Panel de participantes"); }, category: "Organización", phase: 6,
    get description() { return t("Base de participantes, consentimiento informado e historial de estudios."); }, get when() { return t("Reclutamiento continuo."); }, get duration() { return t("—"); }, get participants() { return t("—"); } },
  { key: "insight_repo", get name() { return t("Repositorio de insights"); }, category: "Organización", phase: 1,
    get description() { return t("Hallazgos con etiquetas, severidad y confianza, ligados a cada estudio. Disponible en cada proyecto."); },
    get when() { return t("Siempre."); }, get duration() { return t("—"); }, get participants() { return t("—"); } },
  { key: "report", tab: "report", get name() { return t("Reporte compartible"); }, category: "Organización", phase: 1,
    get description() { return t("Link público de solo lectura con resultados, gráficas e insights de un estudio."); },
    get when() { return t("Presentar a stakeholders."); }, get duration() { return t("—"); }, get participants() { return t("—"); } },
];

export const BLANK: Template = {
  key: "blank", get name() { return t("Estudio en blanco"); }, category: "Generativa", phase: 1,
  get description() { return t("Empieza desde cero y arma tu propia secuencia de bloques."); },
  get when() { return t(""); }, get duration() { return t("—"); }, get participants() { return t("—"); },
  build: () => [b("welcome"), b("thank_you")],
};

export const templateByKey = (key: string) => (key === "blank" ? BLANK : TEMPLATES.find((t) => t.key === key));
