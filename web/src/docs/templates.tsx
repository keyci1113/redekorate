import { BookOpenCheck, Brain, Briefcase, ClipboardList, Compass, Eye, FileText, Gauge, Heart, LayoutGrid, Map, MessagesSquare, Network, NotebookPen, Route, ScanSearch, UserRound, UsersRound, Workflow } from "lucide-react";
import type { DocCategory, DocData, DocTemplate, Entry, Note, RowGroup } from "./types";
import type { Lang } from "../lib/i18n";
import { uid } from "../lib/hooks";
import { P_COLORS } from "./Affinity";

const L = (lang: Lang, es: string, en: string) => (lang === "en" ? en : es);
const notes = (...xs: string[]): Note[] => xs.map((text) => ({ id: uid(), text }));
const entries = (...xs: [string, string][]): Entry[] => xs.map(([name, body]) => ({ id: uid(), name, body }));
const rows = (labels: string[], kind: "text" | "yesno" = "text", answers: string[] = []) =>
  labels.map((label, i) => ({ id: uid(), label, kind, answer: answers[i] ?? "", yes: null }));

export const DOC_CATEGORIES: { id: DocCategory; blurb: string }[] = [
  { id: "Planeación", blurb: "Define el problema, las hipótesis y el plan antes de investigar" },
  { id: "Personas", blurb: "Describe para quién estás diseñando" },
  { id: "Mapas y síntesis", blurb: "Convierte lo que aprendiste en algo que el equipo entienda" },
  { id: "Campo y entrevistas", blurb: "Guías y formatos para observar y entrevistar" },
  { id: "Evaluación", blurb: "Mide qué tan bien funciona tu diseño" },
];

// ───────────────────────────────────────── Planeación
const blueprint: DocTemplate = {
  kind: "ux_blueprint", name: "UX Project Blueprint", category: "Planeación", icon: <ClipboardList size={18} />,
  description: "Planeación de la investigación: problema, datos duros, hipótesis, actividades de UX, entregables y métricas.",
  purpose: "Para planear un proyecto de UX, empieza haciéndote las preguntas correctas",
  question: "¿Qué sabes del problema que quieres resolver y qué se necesita hacer para resolverlo?",
  instructions: ["Contesta las preguntas de cada cuadrante", "Toma tu tiempo para reflexionar en cada una", "Escribe tus ideas en forma de bullet points"],
  sections: [
    { id: "problem", type: "list", title: "Problema supuesto", prompt: "¿Qué problema estamos resolviendo? ¿Cómo se presenta el problema?", span: 12 },
    { id: "data", type: "list", title: "Datos duros", prompt: "¿Cómo sabemos que el problema existe? ¿Qué evidencias tenemos?", span: 6 },
    { id: "questions", type: "list", title: "Preguntas sobresalientes", prompt: "¿Qué no sabemos del problema? ¿Qué otros datos necesitamos?", span: 6 },
    { id: "ideal", type: "list", title: "Escenario ideal", prompt: "¿Cómo se ve este problema una vez resuelto? ¿Cuál es la solución ideal?", span: 6 },
    { id: "activities", type: "list", title: "Actividades de UX", prompt: "¿Qué actividades de UX nos ayudan a llegar a la solución ideal? ¿Qué metodologías resuelven el problema?", span: 6 },
    { id: "hypothesis", type: "list", title: "Hipótesis", prompt: "¿Qué indicador nos diría que resolvimos el problema? ¿Qué pasaría si aplicáramos determinada solución?", span: 6 },
    { id: "objectives", type: "list", title: "Objetivos", prompt: "¿Qué queremos lograr con esas actividades? ¿Cómo se ven una vez terminadas?", span: 6 },
    { id: "tasks", type: "list", title: "Tareas", prompt: "¿Qué tareas operativas necesitamos realizar? ¿Qué requerimientos son indispensables?", span: 6 },
    { id: "deliverables", type: "list", title: "Entregables", prompt: "¿Qué documentos resultarán de las actividades? ¿Cómo comunicaremos los resultados?", span: 6 },
    { id: "metrics", type: "list", title: "Métricas", prompt: "¿Cómo podemos medir las mejoras en términos de negocio? ¿Cómo medimos el éxito?", span: 6 },
    { id: "value", type: "list", title: "Valor", prompt: "¿Cuál es el beneficio general para el producto? ¿Qué principios de UX aportan estas mejoras?", span: 6 },
  ],
  example: (lang) => lang === "en" ? {
    problem: ["Users struggle to understand their fitness, recovery and wellness data because it is scattered across apps and sections.", "Tablet users need a dashboard that uses the larger screen with clear hierarchy, rich visuals and easy navigation."],
    data: ["Many wellness apps separate activity, workouts, sleep and recovery into different screens, making the experience feel fragmented.", "Users rely on progress indicators, streaks and goal completion to stay motivated."],
    questions: ["Which dashboard information is most valuable during the daily routine?", "Do users prefer a performance-focused experience, a wellness-focused one, or a balance?", "How do tablet users physically interact with the app during workouts?"],
    ideal: ["Users open PulseUp and immediately understand their wellness status and recommended next action.", "The dashboard feels calm, motivating and easy to scan."],
    activities: ["Competitive analysis of fitness and wellness dashboards", "User persona for tablet fitness users", "Information architecture and user flows", "Low- and high-fidelity design", "Usability testing of navigation and dashboard clarity"],
    hypothesis: ["If PulseUp brings activity, workout plans, recovery and recommendations into one dashboard, users will understand their daily status faster.", "If recovery insights are integrated with workout suggestions, users will make better training decisions."],
    objectives: ["Design a tablet-first dashboard that clearly presents daily wellness information", "Create a smooth flow for the Workout Plans category"],
    tasks: ["Define the product concept and main user need", "Create the dashboard layout for tablet", "Design the Workout Plans flow"],
    deliverables: ["UX Project Blueprint", "Dashboard high-fidelity design", "Workout Plans user flow", "Presentation deck"],
    metrics: ["Dashboard engagement rate", "Workout completion rate", "Retention after 7, 14 and 30 days", "Reduction in time needed to find key information"],
    value: ["A unified experience to balance fitness, recovery and wellness", "UX principles: clarity, consistency, visual hierarchy, accessibility, progressive disclosure"],
  } : {
    problem: ["Los usuarios tienen dificultad para entender sus datos de actividad, recuperación y bienestar porque están dispersos en distintas apps y secciones.", "Quienes usan tablet necesitan un dashboard que aproveche la pantalla grande, con jerarquía clara y navegación sencilla."],
    data: ["Muchas apps de bienestar separan actividad, entrenamientos, sueño y recuperación en pantallas distintas; la experiencia se siente fragmentada.", "Los usuarios dependen de indicadores de progreso, rachas y metas para mantenerse motivados."],
    questions: ["¿Qué información del dashboard es más valiosa en la rutina diaria?", "¿Prefieren una experiencia enfocada en rendimiento, en bienestar o en un balance?", "¿Cómo interactúan físicamente con la tablet durante el entrenamiento?"],
    ideal: ["El usuario abre PulseUp y entiende de inmediato su estado y la siguiente acción recomendada.", "El dashboard se siente tranquilo, motivador y fácil de escanear."],
    activities: ["Análisis competitivo de dashboards de fitness y bienestar", "User persona de usuarios de tablet", "Arquitectura de información y user flows", "Diseño de baja y alta fidelidad", "Pruebas de usabilidad de navegación y claridad del dashboard"],
    hypothesis: ["Si PulseUp reúne actividad, planes de entrenamiento, recuperación y recomendaciones en un solo dashboard, los usuarios entenderán su estado diario más rápido.", "Si la recuperación se integra con las sugerencias de entrenamiento, tomarán mejores decisiones."],
    objectives: ["Diseñar un dashboard pensado para tablet que presente con claridad la información diaria", "Crear un flujo fluido para la categoría Planes de entrenamiento"],
    tasks: ["Definir el concepto del producto y la necesidad principal", "Crear el layout del dashboard para tablet", "Diseñar el flujo de Planes de entrenamiento"],
    deliverables: ["UX Project Blueprint", "Diseño de alta fidelidad del dashboard", "User flow de Planes de entrenamiento", "Presentación de resultados"],
    metrics: ["Tasa de uso del dashboard", "Tasa de entrenamientos completados", "Retención a 7, 14 y 30 días", "Reducción del tiempo para encontrar información clave"],
    value: ["Una experiencia unificada para equilibrar actividad, recuperación y bienestar", "Principios de UX: claridad, consistencia, jerarquía visual, accesibilidad, revelación progresiva"],
  },
};

// ───────────────────────────────────────── Personas
const protoPersona: DocTemplate = {
  kind: "proto_persona", name: "Proto-persona", category: "Personas", icon: <UserRound size={18} />,
  description: "Supuestos sobre quiénes son tus usuarios, antes de investigar. Ideal para definir a quién reclutar.",
  purpose: "Para reclutar mejor, define los supuestos sobre quiénes son tus usuarios",
  question: "¿Quién está experimentando el problema a resolver?",
  instructions: ["Llena cada cuadrante con tantas notas como necesites", "Toma tu tiempo para reflexionar en cada una", "Recuerda: son supuestos que validarás con investigación"],
  sections: [
    { id: "photo", type: "image", title: "Foto o boceto", span: 4, round: true },
    { id: "who", type: "fields", title: "¿Quién es?", span: 8, cols: 2, fields: [{ id: "name", label: "Nombre", placeholder: "Ej.: Carlos" }, { id: "type", label: "Tipo de usuario", placeholder: "Ej.: Repartidor" }, { id: "age", label: "Edad aproximada" }, { id: "place", label: "Ubicación" }] },
    { id: "facts", type: "notes", color: "yellow", title: "Hechos", prompt: "Algunas ideas: género, edad, escolaridad, profesión, herramientas que usa, habilidades, responsabilidades. Solo datos que lo identifiquen como usuario.", span: 6 },
    { id: "problems", type: "notes", color: "orange", title: "Problemas", prompt: "¿Qué problema relacionado con tu producto tiene? Ej.: no tiene auto y necesita moverse por la ciudad.", span: 6 },
    { id: "behaviors", type: "notes", color: "blue", title: "Comportamientos", prompt: "¿Qué hace hoy? Ej.: crea documentos para medir el progreso y presentarlo a su equipo.", span: 6 },
    { id: "needs", type: "notes", color: "pink", title: "Necesidades y objetivos", prompt: "¿Qué quiere lograr? Ej.: llegar sano y salvo a casa sin tener que llamar a un taxi.", span: 6 },
  ],
  example: (lang) => ({
    who: { name: "Carlos", type: L(lang, "Repartidor de ruta", "Route delivery driver"), age: "28–40", place: L(lang, "San Pedro Sula", "San Pedro Sula") },
    facts: notes(L(lang, "Trabaja 10 horas diarias", "Works 10 hours a day"), L(lang, "Usa un teléfono Android de gama media", "Uses a mid-range Android phone"), L(lang, "Educación secundaria", "High school education")),
    problems: notes(L(lang, "Zonas sin señal donde no puede registrar entregas", "Areas without signal where he can't log deliveries"), L(lang, "Direcciones poco claras", "Unclear addresses")),
    behaviors: notes(L(lang, "Anota entregas en papel cuando falla la app", "Writes deliveries on paper when the app fails"), L(lang, "Llama al cliente antes de llegar", "Calls the customer before arriving")),
    needs: notes(L(lang, "Terminar la ruta a tiempo", "Finish the route on time"), L(lang, "Reportar incidencias rápido", "Report issues quickly")),
  }),
};

const personaCanvas: DocTemplate = {
  kind: "persona_canvas", name: "Perfil de persona (canvas)", category: "Personas", icon: <UsersRound size={18} />,
  description: "Canvas para sintetizar a una persona a partir de la investigación: objetivos, contexto de uso, canales y uso futuro.",
  purpose: "Para tener claro para quién estamos construyendo el producto",
  question: "¿Quién exactamente está experimentando el problema a resolver?",
  instructions: ["Revisa tus observaciones de las investigaciones", "Llena cada cuadrante con tantas notas como necesites", "Toma tu tiempo para reflexionar en cada una"],
  credit: "Basado en el canvas de persona de Laura Klein (usersknow.com)",
  sections: [
    { id: "who", type: "fields", title: "Nombre y tipo de usuario", span: 12, cols: 3, fields: [{ id: "name", label: "Nombre" }, { id: "type", label: "Tipo de usuario" }, { id: "quote", label: "Frase que lo describe" }] },
    { id: "goals", type: "notes", color: "yellow", title: "Objetivos e intención de compra", prompt: "Necesidades · Actualmente buscando… · Comportamientos · Requerimientos especiales", span: 4 },
    { id: "fit", type: "notes", color: "purple", title: "Compatibilidad usuario – producto", prompt: "Comportamientos, necesidades y objetivos predecibles · ¿Cómo lo ayuda el producto? · ¿Cómo es ahora mejor?", span: 4 },
    { id: "context", type: "notes", color: "blue", title: "Contexto de uso", prompt: "¿Con quién? · ¿Dónde? · ¿Cuándo? · ¿Qué tanto?", span: 4 },
    { id: "channels", type: "notes", color: "green", title: "Canales e influencers", prompt: "Mensajes · Influencers · Comunidades", span: 6 },
    { id: "future", type: "notes", color: "pink", title: "Uso futuro", prompt: "Uso continuo · Cambio en el uso · Cambio en el usuario", span: 6 },
  ],
  example: (lang) => ({
    who: { name: "Ana", type: L(lang, "Gerente de tienda", "Store manager"), quote: L(lang, "\"No tengo tiempo para reportes complicados\"", "\"I don't have time for complicated reports\"") },
    goals: notes(L(lang, "Controlar el inventario sin hojas de cálculo", "Control inventory without spreadsheets"), L(lang, "Busca algo que funcione desde el celular", "Looking for something that works on her phone")),
    fit: notes(L(lang, "Revisa ventas cada mañana", "Checks sales every morning"), L(lang, "Alertas de stock bajo le ahorran viajes", "Low-stock alerts save her trips")),
    context: notes(L(lang, "En la tienda, entre clientes", "In the store, between customers"), L(lang, "Varias veces al día", "Several times a day")),
    channels: notes(L(lang, "Grupos de WhatsApp de comerciantes", "Merchant WhatsApp groups"), L(lang, "Recomendación del proveedor", "Supplier recommendation")),
    future: notes(L(lang, "Delegar el cierre de caja a su equipo", "Delegate cash closing to her team")),
  }),
};

const personaProfile: DocTemplate = {
  kind: "persona_profile", name: "User persona (entregable)", category: "Personas", icon: <UserRound size={18} />,
  description: "Ficha final de persona para presentar: bio, personalidad, experiencia, objetivos, frustraciones y tecnologías.",
  purpose: "Para comunicar al equipo y a stakeholders quién es tu usuario",
  question: "¿Cómo es, qué busca y qué le frustra a esta persona?",
  instructions: ["Basa cada dato en lo que observaste o escuchaste", "Usa frases reales de tus entrevistas", "Mantén la ficha en una sola página"],
  sections: [
    { id: "photo", type: "image", span: 4, round: true },
    { id: "who", type: "fields", title: "Datos generales", span: 8, cols: 2, fields: [{ id: "trait", label: "Característica principal", placeholder: "Ej.: La organizadora" }, { id: "name", label: "Nombre" }, { id: "age", label: "Edad" }, { id: "status", label: "Estado civil" }, { id: "role", label: "Rol profesional" }, { id: "education", label: "Educación" }] },
    { id: "quotes", type: "list", title: "Frases que lo identifican", span: 4, placeholder: "\"Alguna frase común que lo identifique\"" },
    { id: "bio", type: "text", title: "Bio", span: 8, placeholder: "Una breve descripción: vida personal, gustos, actividades laborales y de recreación.", rows: 4 },
    { id: "personality", type: "chips", title: "Personalidad", span: 4, placeholder: "Adjetivo + Enter" },
    { id: "experience", type: "bars", title: "Nivel de experiencia", span: 4, placeholder: "Habilidad" },
    { id: "ideal", type: "chips", title: "Experiencia de usuario ideal", span: 4, placeholder: "Adjetivo + Enter" },
    { id: "goals", type: "list", title: "Objetivos", span: 4, numbered: true },
    { id: "must", type: "list", title: "Debe hacer", span: 4, numbered: true },
    { id: "mustnot", type: "list", title: "No debe permitir", span: 4, numbered: true },
    { id: "frustrations", type: "list", title: "Frustraciones", span: 4, numbered: true },
    { id: "tech", type: "text", title: "Tecnologías", span: 4, placeholder: "Preferencias y hábitos de tecnología.", rows: 3 },
    { id: "interests", type: "bars", title: "Conocimientos e intereses", span: 4, placeholder: "Conocimiento o interés" },
  ],
  example: (lang) => ({
    who: { trait: L(lang, "La organizadora", "The organizer"), name: "Ana Martínez", age: "34", status: L(lang, "Casada, 2 hijos", "Married, 2 kids"), role: L(lang, "Gerente de tienda", "Store manager"), education: L(lang, "Licenciatura en Administración", "Bachelor's in Business") },
    quotes: [L(lang, "\"Si no lo veo en un vistazo, no lo uso\"", "\"If I can't see it at a glance, I won't use it\""), L(lang, "\"Mi día es apagar incendios\"", "\"My day is putting out fires\"")],
    bio: L(lang, "Ana dirige una tienda de 8 empleados. Llega a las 7 a. m., revisa el inventario y coordina pedidos con proveedores por WhatsApp. Los fines de semana sale en familia y le gusta cocinar.", "Ana runs a store with 8 employees. She arrives at 7 a.m., checks inventory and coordinates orders with suppliers over WhatsApp. On weekends she goes out with her family and loves cooking."),
    personality: [L(lang, "Organizada", "Organized"), L(lang, "Práctica", "Practical"), L(lang, "Impaciente", "Impatient"), L(lang, "Sociable", "Sociable")],
    experience: [{ id: uid(), label: L(lang, "Tecnología", "Technology"), value: 55 }, { id: uid(), label: L(lang, "Apps móviles", "Mobile apps"), value: 80 }, { id: uid(), label: L(lang, "Hojas de cálculo", "Spreadsheets"), value: 35 }],
    ideal: [L(lang, "Rápida", "Fast"), L(lang, "Clara", "Clear"), L(lang, "Confiable", "Reliable")],
    goals: [L(lang, "Evitar quedarse sin stock", "Avoid running out of stock"), L(lang, "Cerrar caja sin errores", "Close the register without errors")],
    must: [L(lang, "Ver ventas del día en segundos", "See daily sales in seconds")],
    mustnot: [L(lang, "Perder datos si se cae la conexión", "Lose data if the connection drops")],
    frustrations: [L(lang, "Reportes que requieren muchos pasos", "Reports that take many steps"), L(lang, "Notificaciones irrelevantes", "Irrelevant notifications")],
    tech: L(lang, "Usa iPhone, WhatsApp Business y una laptop para facturar.", "Uses an iPhone, WhatsApp Business and a laptop for invoicing."),
    interests: [{ id: uid(), label: L(lang, "Finanzas", "Finance"), value: 60 }, { id: uid(), label: L(lang, "Cocina", "Cooking"), value: 85 }],
  }),
};

// ───────────────────────────────────────── Mapas y síntesis
const stage = (name: string, actions: [string, number][], value = "", barriers = "", opportunities = "") =>
  ({ id: uid(), name, actions: actions.map(([text, emotion]) => ({ id: uid(), text, emotion })), value, barriers, opportunities });
const bstage = (name: string, evidence = "", customer = "", frontstage = "", backstage = "", support = "") =>
  ({ id: uid(), name, evidence, customer, frontstage, backstage, support });

const journey: DocTemplate = {
  kind: "journey_map", name: "User Journey Map", category: "Mapas y síntesis", icon: <Map size={18} />,
  description: "Etapas, acciones, emociones (la curva se dibuja sola), valor, barreras y oportunidades.",
  purpose: "Para tener clara toda la experiencia que un usuario vive con el producto",
  question: "¿Cuáles son los puntos de contacto que un usuario experimenta?",
  instructions: ["Nombra cada una de las etapas o puntos de contacto", "Describe las actividades específicas de cada etapa", "Elige la emoción de cada acción: la línea de emociones se dibuja automáticamente", "Llena valor, barreras y oportunidades de cada etapa"],
  sections: [
    { id: "who", type: "fields", span: 12, cols: 3, fields: [{ id: "persona", label: "Persona", placeholder: "Ej.: Carlos, repartidor" }, { id: "scenario", label: "Escenario", placeholder: "Ej.: Un día de ruta de entregas" }, { id: "goal", label: "Objetivo del usuario" }] },
    { id: "journey", type: "custom", component: "journey", span: 12 },
  ],
  // Etapas y acciones vacías con la misma forma que el ejemplo (el ejemplo se ve como texto guía)
  init: (lang) => ({ journey: { stages: (journey.example!(lang).journey as { stages: { actions: unknown[] }[] }).stages.map((st) => stage("", st.actions.map(() => ["", 0] as [string, number]))) } }),
  example: (lang) => ({
    who: { persona: L(lang, "Carlos, repartidor", "Carlos, delivery driver"), scenario: L(lang, "Un día de ruta de entregas", "A day on the delivery route"), goal: L(lang, "Completar todas las entregas a tiempo", "Complete every delivery on time") },
    journey: { stages: [
      stage(L(lang, "Llegada y preparación del camión", "Arrival and truck preparation"), [[L(lang, "Llega al patio a las 6 a. m.", "Arrives at the yard at 6 a.m."), 0], [L(lang, "Espera a que carguen el camión", "Waits for the truck to be loaded"), -1], [L(lang, "Revisa la lista de entregas", "Reviews the delivery list"), -1], [L(lang, "El vehículo tiene problemas antes de salir", "The vehicle has issues before leaving"), -2]],
        L(lang, "Camión listo a tiempo, comunicación clara e inicio rápido.", "Truck ready on time, clear communication and a quick start."), L(lang, "Retrasos en la preparación, falta de notificaciones, desorden.", "Delays in preparation, missing notifications, disorder."), L(lang, "Notificaciones de preparación, checklist digital y registro de tiempos de espera.", "Preparation notifications, digital checklist and wait-time tracking.")),
      stage(L(lang, "Inicio de ruta y registro", "Route start and check-in"), [[L(lang, "Arranca el camión", "Starts the truck"), 2], [L(lang, "Verifica sus entregas", "Checks his deliveries"), 0], [L(lang, "No le queda clara la dirección", "The address isn't clear"), -1], [L(lang, "No puede reportar un problema", "Can't report a problem"), -2]],
        L(lang, "Proceso sencillo para iniciar ruta y confirmación de registro.", "Simple route start and check-in confirmation."), L(lang, "Proceso manual o confuso; sin guía de ruta óptima.", "Manual or confusing process; no optimal route guidance."), L(lang, "Automatizar el registro, navegación asistida y geolocalización.", "Automated check-in, assisted navigation and geolocation.")),
      stage(L(lang, "Ronda de entregas", "Delivery round"), [[L(lang, "Se dirige a cada parada", "Drives to each stop"), 0], [L(lang, "Entrega paquetes", "Delivers packages"), 1], [L(lang, "Pide firma y foto", "Asks for signature and photo"), 0], [L(lang, "Se salta ciertas entregas", "Skips some deliveries"), -2]],
        L(lang, "Ruta optimizada y confirmación con firma, foto y GPS.", "Optimized route and confirmation with signature, photo and GPS."), L(lang, "Problemas de conectividad y dificultad para reportar incidencias.", "Connectivity problems and difficulty reporting issues."), L(lang, "Botón de incidencias, chat con despacho y modo sin conexión.", "Issue button, chat with dispatch and offline mode.")),
      stage(L(lang, "Pausa de comida y fin de ruta", "Lunch break and end of route"), [[L(lang, "Marca el inicio de su pausa", "Logs the start of his break"), 1], [L(lang, "Come", "Eats"), 2], [L(lang, "Termina entregas y regresa al almacén", "Finishes deliveries and returns to the warehouse"), 2]],
        L(lang, "Seguimiento del tiempo de comida y cierre fácil.", "Break-time tracking and easy closing."), L(lang, "Olvida marcar el descanso o el cierre.", "Forgets to log the break or the closing."), L(lang, "Temporizador de pausa y resumen de entregas completadas.", "Break timer and a summary of completed deliveries.")),
    ] },
  }),
};

const affinity: DocTemplate = {
  kind: "affinity", name: "Diagrama de afinidad", category: "Mapas y síntesis", icon: <LayoutGrid size={18} />,
  description: "Agrupa observaciones, juicios y valores de cada participante en temas para encontrar patrones.",
  purpose: "Para encontrar patrones en todo lo que observaste y escuchaste",
  question: "¿Qué temas se repiten entre los participantes?",
  instructions: ["Agrega a tus participantes (cada uno tiene un color)", "Escribe una nota por idea: observación, juicio o valor", "Crea grupos y arrastra las notas hasta que aparezcan temas", "Nombra cada grupo con el insight que representa"],
  sections: [{ id: "board", type: "custom", component: "affinity", span: 12 }],
  init: () => ({ board: { participants: [0, 1, 2].map((i) => ({ id: uid(), name: "", color: P_COLORS[i] })), notes: [], groups: [{ id: uid(), name: "" }, { id: uid(), name: "" }] } }),
  example: (lang) => {
    const ps = ["Diana", "Josette", "Piero"].map((name, i) => ({ id: uid(), name, color: P_COLORS[i] }));
    const g1 = { id: uid(), name: L(lang, "La configuración inicial confunde", "Initial setup is confusing") }, g2 = { id: uid(), name: L(lang, "Necesitan confirmación de que todo salió bien", "They need confirmation that everything worked") };
    const n = (text: string, type: "obs" | "judgment" | "value", p: number, g: string | null) => ({ id: uid(), text, type, participantId: ps[p].id, groupId: g });
    return { board: { participants: ps, groups: [g1, g2], notes: [
      n(L(lang, "No encontró dónde configurar la numeración", "Couldn't find where to set up numbering"), "obs", 0, g1.id),
      n(L(lang, "Usó otro término para 'certificado'", "Used a different term for 'certificate'"), "obs", 2, g1.id),
      n(L(lang, "\"Pensé que ya lo había guardado\"", "\"I thought I had already saved it\""), "judgment", 1, g2.id),
      n(L(lang, "Valora ver el estado de la factura enviada", "Values seeing the status of the sent invoice"), "value", 0, g2.id),
      n(L(lang, "Prefiere la opción manual para tener control", "Prefers the manual option to stay in control"), "value", 1, null),
    ] } };
  },
};

const empathyMap: DocTemplate = {
  kind: "empathy_map", name: "Empathy Map", category: "Mapas y síntesis", icon: <Heart size={18} />,
  description: "Dice, Piensa, Hace, Siente + dolores y ganancias del usuario.",
  purpose: "Para alinear al equipo sobre cómo piensa, siente y actúa un segmento de usuarios",
  question: "¿Qué dice, piensa, hace y siente este usuario frente al problema?",
  instructions: ["Define a qué usuario o segmento te refieres", "Llena cada cuadrante con frases cortas basadas en evidencia, no en suposiciones", "Usa dolores y ganancias para encontrar oportunidades de diseño"],
  credit: "Basado en el Empathy Map de Dave Gray (Gamestorming / XPLANE)",
  sections: [
    { id: "who", type: "fields", title: "Usuario o segmento", span: 12, cols: 3, fields: [{ id: "name", label: "Nombre o segmento" }, { id: "scenario", label: "Escenario" }, { id: "goal", label: "Objetivo" }] },
    { id: "says", type: "notes", color: "yellow", title: "Dice", prompt: "Frases textuales que dijo o diría en voz alta.", span: 4 },
    { id: "thinks", type: "notes", color: "purple", title: "Piensa", prompt: "Qué piensa pero no necesariamente dice.", span: 4 },
    { id: "does", type: "notes", color: "blue", title: "Hace", prompt: "Acciones y comportamientos observados.", span: 4 },
    { id: "feels", type: "notes", color: "pink", title: "Siente", prompt: "Emociones: miedos, ansiedades, ilusiones.", span: 4 },
    { id: "pains", type: "notes", color: "orange", title: "Dolores", prompt: "Frustraciones, obstáculos, riesgos que enfrenta.", span: 4 },
    { id: "gains", type: "notes", color: "green", title: "Ganancias", prompt: "Lo que espera obtener; cómo mide el éxito.", span: 4 },
  ],
  example: (lang) => ({
    who: { name: L(lang, "Ana, gerente de tienda", "Ana, store manager"), scenario: L(lang, "Cierre de caja al final del día", "Closing the register at the end of the day"), goal: L(lang, "Cuadrar las ventas sin errores", "Reconcile sales without errors") },
    says: notes(L(lang, "\"No tengo tiempo para reportes complicados\"", "\"I don't have time for complicated reports\""), L(lang, "\"¿Por qué no cuadra esto?\"", "\"Why doesn't this add up?\"")),
    thinks: notes(L(lang, "Cree que cometerá un error y tendrá que explicarlo", "She worries she'll make a mistake and have to explain it")),
    does: notes(L(lang, "Revisa el total tres veces antes de cerrar", "Checks the total three times before closing"), L(lang, "Pide ayuda a un compañero por WhatsApp", "Asks a coworker for help over WhatsApp")),
    feels: notes(L(lang, "Ansiosa por terminar antes de irse", "Anxious to finish before leaving"), L(lang, "Aliviada cuando el total cuadra", "Relieved when the total matches")),
    pains: notes(L(lang, "Los reportes tardan en cargar al final del día", "Reports are slow to load at the end of the day"), L(lang, "No sabe por qué un número no cuadra", "Doesn't know why a number is off")),
    gains: notes(L(lang, "Cerrar en menos de 10 minutos", "Closing in under 10 minutes"), L(lang, "Confianza en que el reporte es correcto", "Confidence that the report is correct")),
  }),
};

const stakeholderMap: DocTemplate = {
  kind: "stakeholder_map", name: "Stakeholder Map", category: "Mapas y síntesis", icon: <Network size={18} />,
  description: "Actores, influencia e interés alrededor del producto, en cuadrantes para decidir cómo relacionarte con cada quién.",
  purpose: "Para identificar a quién involucrar, informar o monitorear al iniciar un proyecto",
  question: "¿Quién tiene poder de decisión o interés en este proyecto, y cómo deberíamos relacionarnos con cada quién?",
  instructions: ["Haz una lista de las personas o áreas involucradas", "Ubica a cada una según su poder de decisión y su interés en el proyecto", "Define cómo te vas a relacionar con cada cuadrante"],
  credit: "Basado en la matriz poder / interés de Mendelow",
  sections: [
    { id: "context", type: "fields", span: 12, cols: 2, fields: [{ id: "project", label: "Proyecto" }, { id: "date", label: "Fecha" }] },
    { id: "manage", type: "notes", color: "purple", title: "Alto poder · Alto interés — Gestionar de cerca", prompt: "Involúcralos activamente; son clave para el éxito del proyecto.", span: 6 },
    { id: "satisfy", type: "notes", color: "blue", title: "Alto poder · Bajo interés — Mantener satisfechos", prompt: "Mantenlos informados de lo importante, sin saturarlos.", span: 6 },
    { id: "inform", type: "notes", color: "green", title: "Bajo poder · Alto interés — Mantener informados", prompt: "Comunícales avances; pueden influir en la opinión de otros.", span: 6 },
    { id: "monitor", type: "notes", color: "yellow", title: "Bajo poder · Bajo interés — Monitorear", prompt: "Esfuerzo mínimo de seguimiento.", span: 6 },
  ],
  example: (lang) => ({
    context: { project: L(lang, "Rediseño del checkout", "Checkout redesign"), date: "" },
    manage: notes(L(lang, "Dirección de Producto", "Head of Product"), L(lang, "Gerencia de Operaciones", "Operations management")),
    satisfy: notes(L(lang, "Legal y cumplimiento", "Legal and compliance")),
    inform: notes(L(lang, "Equipo de soporte al cliente", "Customer support team"), L(lang, "Vendedores en tienda", "In-store sales staff")),
    monitor: notes(L(lang, "Proveedores externos de pago", "External payment providers")),
  }),
};

const cognitiveMap: DocTemplate = {
  kind: "cognitive_map", name: "Cognitive Mapping", category: "Mapas y síntesis", icon: <Brain size={18} />,
  description: "Mapa de conceptos y relaciones que muestra cómo el usuario entiende un sistema.",
  purpose: "Para explorar modelos mentales complejos y encontrar vacíos o confusiones en cómo las personas entienden el sistema",
  question: "¿Qué conceptos usa el usuario y cómo cree que se relacionan entre sí?",
  instructions: ["Anota los conceptos clave que el usuario mencionó o usó", "Describe cómo el usuario cree que se relacionan esos conceptos entre sí", "Compara el mapa con el modelo real del sistema para encontrar diferencias"],
  sections: [
    { id: "who", type: "fields", span: 12, cols: 2, fields: [{ id: "participant", label: "Participante o segmento" }, { id: "system", label: "Sistema o tema explorado" }] },
    { id: "concepts", type: "chips", title: "Conceptos", prompt: "Las ideas o elementos que el usuario menciona.", span: 12 },
    { id: "relations", type: "entries", title: "Relaciones entre conceptos", prompt: "Describe cómo un concepto se conecta con otro y por qué.", span: 12, nameLabel: "Ej.: Concepto A → Concepto B", bodyLabel: "¿Cómo se relacionan? (causa, pertenece a, lleva a, se confunde con…)", addLabel: "Agregar relación" },
    { id: "gaps", type: "list", title: "Vacíos o confusiones encontradas", prompt: "Diferencias entre el modelo mental del usuario y el modelo real del sistema.", span: 12 },
  ],
  example: (lang) => ({
    who: { participant: L(lang, "Usuario nuevo, primera semana", "New user, first week"), system: L(lang, "Sistema de permisos de la app", "The app's permission system") },
    concepts: [L(lang, "Cuenta", "Account"), L(lang, "Equipo", "Team"), L(lang, "Rol", "Role"), L(lang, "Proyecto", "Project"), L(lang, "Permiso", "Permission")],
    relations: entries(
      [L(lang, "Cuenta → Equipo", "Account → Team"), L(lang, "Cree que su cuenta pertenece a un solo equipo; no sabe que puede estar en varios.", "Believes their account belongs to a single team; doesn't know they can be in several.")],
      [L(lang, "Rol → Permiso", "Role → Permission"), L(lang, "Entiende que el rol define qué puede hacer, pero no distingue entre roles de equipo y de proyecto.", "Understands the role defines what they can do, but doesn't distinguish team roles from project roles.")],
    ),
    gaps: [L(lang, "El sistema real separa permisos por proyecto; el usuario asume que son globales por cuenta.", "The real system separates permissions per project; the user assumes they're global to the account.")],
  }),
};

const userFlow: DocTemplate = {
  kind: "user_flow", name: "User / Task Flow", category: "Mapas y síntesis", icon: <Route size={18} />,
  description: "Diagrama de pasos, decisiones y salidas de una tarea.",
  purpose: "Para documentar cómo es (o debería ser) el flujo de una tarea, paso a paso",
  question: "¿Qué pasos sigue el usuario, dónde decide algo y cómo puede salir del flujo?",
  instructions: ["Escribe los pasos en el orden en que ocurren", "Anota los puntos de decisión y qué pasa en cada camino posible", "Anota las salidas: dónde puede terminar o abandonar el flujo"],
  sections: [
    { id: "who", type: "fields", span: 12, cols: 2, fields: [{ id: "task", label: "Tarea o flujo" }, { id: "entry", label: "Punto de entrada" }] },
    { id: "steps", type: "list", title: "Pasos del flujo", numbered: true, span: 12 },
    { id: "decisions", type: "list", title: "Puntos de decisión", prompt: "¿Dónde elige el usuario entre caminos distintos? ¿Qué pasa en cada caso?", span: 6 },
    { id: "exits", type: "list", title: "Salidas", prompt: "¿Dónde puede terminar, abandonar o salir del flujo?", span: 6 },
  ],
  example: (lang) => ({
    who: { task: L(lang, "Recuperar contraseña", "Reset password"), entry: L(lang, "Botón \"¿Olvidaste tu contraseña?\" en el login", "\"Forgot password?\" button on the login screen") },
    steps: [
      L(lang, "El usuario da clic en \"¿Olvidaste tu contraseña?\"", "User clicks \"Forgot your password?\""),
      L(lang, "Escribe su correo y envía el formulario", "Enters their email and submits the form"),
      L(lang, "Revisa su correo y da clic en el enlace recibido", "Checks their email and clicks the link received"),
      L(lang, "Escribe una nueva contraseña y la confirma", "Enters a new password and confirms it"),
      L(lang, "Inicia sesión con la nueva contraseña", "Logs in with the new password"),
    ],
    decisions: [L(lang, "¿El correo existe en el sistema? Si no, se muestra el mismo mensaje por seguridad.", "Does the email exist in the system? If not, the same message is shown for security."), L(lang, "¿El enlace ya venció (1 hora)? Si sí, se pide solicitar uno nuevo.", "Has the link expired (1 hour)? If so, the user is asked to request a new one.")],
    exits: [L(lang, "El usuario cierra la pestaña sin revisar su correo.", "The user closes the tab without checking their email."), L(lang, "Contraseña restablecida con éxito.", "Password successfully reset.")],
  }),
};

const serviceBlueprint: DocTemplate = {
  kind: "service_blueprint", name: "Service Blueprint", category: "Mapas y síntesis", icon: <Workflow size={18} />,
  description: "Frontstage, backstage, procesos de soporte y evidencia física del servicio, etapa por etapa.",
  purpose: "Para entender y rediseñar servicios con muchas partes, visibles e invisibles para el usuario",
  question: "¿Qué hace el cliente, qué ve, y qué pasa detrás de cámaras en cada etapa del servicio?",
  instructions: ["Nombra cada etapa del servicio en orden", "Llena la evidencia física y las acciones del cliente", "Documenta lo que hace el personal o sistema visible (frontstage) y el invisible (backstage)", "Anota los procesos de soporte que hacen posible cada etapa"],
  sections: [
    { id: "who", type: "fields", span: 12, cols: 3, fields: [{ id: "service", label: "Servicio" }, { id: "scenario", label: "Escenario" }, { id: "goal", label: "Objetivo del cliente" }] },
    { id: "blueprint", type: "custom", component: "blueprint", span: 12 },
  ],
  init: () => ({ blueprint: { stages: [0, 1, 2].map(() => bstage("")) } }),
  example: (lang) => ({
    who: { service: L(lang, "Devolución en tienda", "In-store return"), scenario: L(lang, "Cliente quiere devolver un producto defectuoso", "Customer wants to return a defective product"), goal: L(lang, "Recuperar su dinero sin fricción", "Get their money back with no friction") },
    blueprint: { stages: [
      bstage(L(lang, "Llegada a tienda", "Arrival at the store"),
        L(lang, "Letrero de \"Devoluciones\" en la entrada", "\"Returns\" sign at the entrance"),
        L(lang, "Busca el mostrador de devoluciones con el producto y el recibo", "Looks for the returns counter with the product and receipt"),
        L(lang, "Un empleado lo saluda y lo dirige al mostrador correcto", "An employee greets them and points them to the right counter"),
        "—",
        L(lang, "Señalización actualizada por el equipo de tienda", "Signage kept up to date by the store team")),
      bstage(L(lang, "Revisión del producto", "Product review"),
        L(lang, "Formulario de devolución en el mostrador", "Return form at the counter"),
        L(lang, "Explica el defecto y entrega el producto", "Explains the defect and hands over the product"),
        L(lang, "El cajero revisa el producto y el recibo, y llena el formulario", "The cashier checks the product and receipt, and fills out the form"),
        L(lang, "Un supervisor valida devoluciones mayores a cierto monto", "A supervisor validates returns above a certain amount"),
        L(lang, "Política de devoluciones y límites de autorización por rol", "Return policy and authorization limits by role")),
      bstage(L(lang, "Reembolso", "Refund"),
        L(lang, "Recibo de reembolso impreso", "Printed refund receipt"),
        L(lang, "Confirma el método de reembolso", "Confirms the refund method"),
        L(lang, "El cajero procesa el reembolso en el sistema de punto de venta", "The cashier processes the refund in the point-of-sale system"),
        L(lang, "El sistema de pagos acredita el reembolso en 3–5 días", "The payments system credits the refund in 3–5 days"),
        L(lang, "Conciliación diaria de devoluciones con finanzas", "Daily reconciliation of returns with finance")),
    ] },
  }),
};

const jtbd: DocTemplate = {
  kind: "jtbd", name: "Jobs To Be Done", category: "Mapas y síntesis", icon: <Briefcase size={18} />,
  description: "Job statements, contexto de la \"contratación\" y las cuatro fuerzas del progreso.",
  purpose: "Para entender por qué alguien \"contrata\" tu producto en lugar de otra alternativa",
  question: "¿Qué progreso quiere lograr esta persona, y qué fuerzas la empujan o la frenan?",
  instructions: ["Escribe el job statement a partir de entrevistas reales", "Llena las cuatro fuerzas con evidencia, no suposiciones", "Anota qué \"contrataba\" antes de tu producto y qué dispara el cambio"],
  credit: "Basado en la teoría Jobs To Be Done de Clayton Christensen y el marco de las Cuatro Fuerzas de Bob Moesta",
  sections: [
    { id: "who", type: "fields", span: 12, cols: 2, fields: [{ id: "product", label: "Producto o servicio" }, { id: "segment", label: "Segmento de usuario" }] },
    { id: "statement", type: "text", title: "Job Statement", prompt: "Cuando [situación], quiero [motivación], para poder [resultado esperado].", span: 12, rows: 3 },
    { id: "push", type: "notes", color: "orange", title: "Empuje de la situación (Push)", prompt: "¿Qué de su situación actual la empuja a buscar algo nuevo?", span: 6 },
    { id: "pull", type: "notes", color: "green", title: "Atracción de lo nuevo (Pull)", prompt: "¿Qué le atrae de la nueva solución?", span: 6 },
    { id: "anxiety", type: "notes", color: "pink", title: "Ansiedad de lo nuevo (Anxiety)", prompt: "¿Qué le preocupa o la detiene de cambiar?", span: 6 },
    { id: "habit", type: "notes", color: "blue", title: "Hábito de lo actual (Habit)", prompt: "¿Qué la hace quedarse con lo que ya usa?", span: 6 },
    { id: "triggers", type: "list", title: "Señales de que está por \"contratar\" algo nuevo", span: 6 },
    { id: "competing", type: "list", title: "Qué \"contrata\" hoy en su lugar", prompt: "Otros productos, soluciones caseras, o no hacer nada.", span: 6 },
  ],
  example: (lang) => ({
    who: { product: L(lang, "App de contabilidad para pequeños negocios", "Accounting app for small businesses"), segment: L(lang, "Dueños de tienda que llevan sus cuentas en papel", "Shop owners who keep their books on paper") },
    statement: L(lang,
      "Cuando mi negocio crece y ya no puedo llevar las cuentas en un cuaderno, quiero ver mis ventas y gastos de un vistazo, para poder tomar decisiones sin esperar al contador.",
      "When my business grows and I can no longer keep the books in a notebook, I want to see my sales and expenses at a glance, so I can make decisions without waiting for the accountant."),
    push: notes(L(lang, "Perdió horas buscando un gasto en el cuaderno", "Lost hours looking for an expense in the notebook"), L(lang, "El contador tarda días en responder", "The accountant takes days to respond")),
    pull: notes(L(lang, "Ver todo en el celular, sin instalar nada en la computadora", "Seeing everything on the phone, without installing anything on the computer")),
    anxiety: notes(L(lang, "Miedo a perder sus datos si cambia de app", "Afraid of losing data if she switches apps"), L(lang, "No confía en dejar de imprimir todo", "Doesn't trust giving up printing everything")),
    habit: notes(L(lang, "Ya sabe exactamente cómo usar su cuaderno", "Already knows exactly how to use her notebook")),
    triggers: [L(lang, "Contrata a su primer empleado", "Hires their first employee"), L(lang, "Un gasto importante se le pasó por alto", "An important expense slipped through unnoticed")],
    competing: [L(lang, "Cuaderno y calculadora", "Notebook and calculator"), L(lang, "Hoja de cálculo armada por su sobrino", "A spreadsheet built by their nephew"), L(lang, "Contador externo una vez al mes", "An outside accountant once a month")],
  }),
};

// ───────────────────────────────────────── Campo y entrevistas
const interviews: DocTemplate = {
  kind: "interview_guide", name: "Guía y notas de entrevistas", category: "Campo y entrevistas", icon: <MessagesSquare size={18} />,
  description: "Lista de temas, preguntas abiertas y un espacio para vaciar las notas de cada entrevistado.",
  purpose: "Para entender a tus usuarios, sentir empatía y aprender de sus necesidades",
  question: "¿Cómo están experimentando el problema y cómo se presentan esas necesidades?",
  instructions: [
    "Asigna roles: una persona modera y el resto toma notas",
    "Si es posible, ve al lugar donde la necesidad se presenta",
    "Empieza con una conversación casual para que la persona se relaje",
    "No sigas un cuestionario: usa una lista de temas y deja fluir la conversación",
    "Nunca impongas tus ideas; estás ahí para escuchar",
    "Indaga siempre: ¿por qué?, ¿por qué?, ¿por qué?",
    "Regla de oro: haz preguntas abiertas (evita las de sí o no)",
    "Pregunta cómo resuelven hoy el problema y qué atajos usan",
    "Toma notas de lo que dice y hace; idealmente graba la sesión con permiso",
  ],
  sections: [
    { id: "topic", type: "fields", title: "Lista de temas", span: 12, cols: 1, fields: [{ id: "main", label: "Tema principal a explorar", placeholder: "Ej.: Percepción y utilidad del sistema de comentarios" }] },
    { id: "subtopics", type: "notes", color: "purple", title: "Sub-temas", prompt: "Divide el tema principal en 3 a 5 sub-temas.", span: 6 },
    { id: "questions", type: "list", title: "Preguntas abiertas de apoyo", prompt: "No es un guion: son disparadores para la conversación.", span: 6 },
    { id: "notes", type: "entries", title: "Notas de las entrevistas", prompt: "Vacía aquí todas las notas de cada entrevista: frases textuales, comportamientos, atajos.", span: 12, nameLabel: "Nombre del entrevistado", bodyLabel: "Escribe tus notas aquí…", addLabel: "Agregar entrevistado" },
  ],
  example: (lang) => ({
    topic: { main: L(lang, "Percepción y utilidad del sistema de comentarios para los estudiantes", "Perception and usefulness of the feedback system for students") },
    subtopics: notes(L(lang, "Cómo reciben comentarios hoy", "How they receive feedback today"), L(lang, "Qué hacen con los comentarios", "What they do with feedback"), L(lang, "Momentos de frustración", "Moments of frustration")),
    questions: [L(lang, "Cuéntame de la última vez que recibiste un comentario sobre una tarea", "Tell me about the last time you got feedback on an assignment"), L(lang, "¿Qué hiciste después?", "What did you do next?"), L(lang, "¿Qué es lo más difícil?", "What is the hardest part?"), L(lang, "¿Por qué es importante para ti?", "Why is that important to you?"), L(lang, "Si tuvieras una varita mágica, ¿qué cambiarías?", "If you had a magic wand, what would you change?")],
    notes: entries([L(lang, "María, 21 años", "María, 21"), L(lang, "Revisa los comentarios solo si la nota es baja. \"Si saco buena nota, ni los abro\".", "Only reads feedback when the grade is low. \"If I get a good grade I don't even open them.\"")]),
  }),
};

const AEIOU = (lang: Lang): RowGroup[] => [
  { id: uid(), letter: "A", title: L(lang, "Actividades", "Activities"), rows: rows(lang === "en"
    ? ["How do people move around?", "What routes do they take?", "How is time managed?", "Is there dialogue or silence?", "What activities happen?", "Passive or participatory?", "Individual or collective?", "Guided or autonomous?", "Static or dynamic?"]
    : ["¿Cómo son los desplazamientos?", "¿Qué recorridos se hacen?", "¿Cómo se manejan los tiempos?", "¿Hay diálogos o silencio?", "¿Qué tipo de actividades se hacen?", "¿Son pasivas o participativas?", "¿Son individuales o colectivas?", "¿Son guiadas o autónomas?", "¿Son estáticas o dinámicas?"]) },
  { id: uid(), letter: "E", title: L(lang, "Entornos", "Environments"), rows: rows(lang === "en"
    ? ["What kinds of spaces are there?", "How is the lighting?", "Colors, textures, smells?", "Materials and shapes?", "Noise and sounds?", "Cleanliness and safety?", "What messages or instructions are in the space?"]
    : ["¿Qué tipos de espacios hay?", "¿Cómo es la iluminación?", "¿Qué colores, texturas y olores hay?", "¿Qué materiales y formas se observan?", "¿Cómo es el ruido o sonidos del espacio?", "¿Cómo es la higiene y la seguridad?", "¿Qué mensajes o instrucciones hay en el espacio?"]) },
  { id: uid(), letter: "I", title: L(lang, "Interacciones", "Interactions"), rows: rows(lang === "en"
    ? ["With the context: obstacles, objects, gathering points", "With other people: personal, forced or voluntary", "Verbal or physical?", "Competitive or operational?", "Individual or collective?"]
    : ["Con el contexto: obstáculos, objetos, puntos de aglutinamiento", "Con otras personas: personal, forzada o voluntaria", "¿Verbal o física?", "¿Competitiva u operativa?", "¿Individual o colectiva?"]) },
  { id: uid(), letter: "O", title: L(lang, "Objetos", "Objects"), rows: rows(lang === "en"
    ? ["What things are in the place?", "How do they work?", "Where are they located?", "Which are main and which are secondary?", "How many are there and what colors?", "Is anything missing or extra?"]
    : ["¿Qué cosas están en el lugar?", "¿Cómo funcionan?", "¿Cómo están ubicadas?", "¿Cuáles son protagónicas y cuáles secundarias?", "¿Cuántas hay y de qué colores?", "¿Sobra o falta algo?"]) },
  { id: uid(), letter: "U", title: L(lang, "Usuarios", "Users"), rows: rows(lang === "en"
    ? ["Who are they? How old are they?", "How do they dress and talk?", "What do they do and why are they there?", "Who do they come with?", "What do they need or look for?", "Are they comfortable? What do they feel?"]
    : ["¿Quiénes son? ¿Qué edad tienen?", "¿Cómo se visten y cómo hablan?", "¿Qué hacen y por qué están ahí?", "¿Con quiénes acuden al lugar?", "¿Qué necesitan o buscan?", "¿Están cómodas? ¿Qué sienten?"]) },
];

const aeiou: DocTemplate = {
  kind: "aeiou", name: "Observación AEIOU", category: "Campo y entrevistas", icon: <Eye size={18} />,
  description: "Formato de observación de campo: Actividades, Entornos, Interacciones, Objetos y Usuarios.",
  purpose: "Para observar el entorno y entender el contexto en el que el usuario se desenvuelve",
  question: "¿Cómo es el contexto del usuario donde experimenta el problema a resolver?",
  instructions: ["Usa el formato para vaciar tus anotaciones mientras haces la inmersión", "Deja registro de cualquier observación, por pequeña que sea", "Agrega fotos o bocetos cuando sea necesario"],
  sections: [
    { id: "meta", type: "fields", title: "Sesión de observación", span: 12, cols: 3, fields: [{ id: "place", label: "Lugar" }, { id: "date", label: "Fecha y hora" }, { id: "observer", label: "Observador(a)" }] },
    { id: "aeiou", type: "rowgroups", span: 12 },
    { id: "photos", type: "gallery", title: "Fotos y bocetos", span: 12 },
  ],
  init: (lang) => ({ aeiou: AEIOU(lang) }),
  example: (lang) => {
    const g = AEIOU(lang);
    g[0].rows[0].answer = L(lang, "Los clientes revisan folletos en la mesa de la agencia de viajes mientras esperan.", "Customers browse brochures on the travel agency table while they wait.");
    g[1].rows[1].answer = L(lang, "Luz blanca intensa; las pantallas de los agentes tienen reflejos.", "Bright white light; agents' screens have glare.");
    g[4].rows[0].answer = L(lang, "Parejas de 30 a 45 años planeando vacaciones familiares.", "Couples aged 30–45 planning family vacations.");
    return { meta: { place: L(lang, "Agencia de viajes, centro", "Travel agency, downtown"), date: "", observer: "" }, aeiou: g };
  },
};

const OBS_PHASES = (lang: Lang): RowGroup[] => [
  { id: uid(), title: L(lang, "Inicio de la tarea", "Starting the task"), rows: [...rows([L(lang, "¿Cómo inicia la tarea?", "How does the person start the task?")]), ...rows([L(lang, "¿Encuentra rápido lo que necesita?", "Do they quickly find what they need?")], "yesno"), ...rows([L(lang, "Tiempo para iniciar", "Time to get started")])] },
  { id: uid(), title: L(lang, "Uso del producto", "Using the product"), rows: [...rows([L(lang, "Pasos que realiza", "Steps taken"), L(lang, "Errores o bloqueos", "Errors or blockers")]), ...rows([L(lang, "¿Pide ayuda?", "Do they ask for help?")], "yesno")] },
  { id: uid(), title: L(lang, "Incidentes y estrategias alternas", "Incidents and workarounds"), rows: rows([L(lang, "¿Qué interrumpe la tarea?", "What interrupts the task?"), L(lang, "Estrategias alternas (notas manuales, otro dispositivo, preguntar a alguien)", "Workarounds (manual notes, another device, asking someone)")]) },
  { id: uid(), title: L(lang, "Preguntas rápidas al final", "Quick questions at the end"), rows: rows([L(lang, "¿Qué fue lo más difícil hoy?", "What was hardest today?"), L(lang, "¿Qué cambiarías primero?", "What would you change first?")]) },
];

const observation: DocTemplate = {
  kind: "observation", name: "Observación conductual", category: "Campo y entrevistas", icon: <ScanSearch size={18} />,
  description: "Observa cómo las personas usan realmente un producto en condiciones de campo, fase por fase, con tiempos e incidentes.",
  purpose: "Para entender cómo las personas interactúan realmente con el producto en su contexto",
  question: "¿Qué pasa de verdad cuando la persona usa el producto en condiciones reales?",
  instructions: [
    "Explica que observarás la herramienta, no su desempeño",
    "Documenta cada paso que hace al usar el producto",
    "Registra tiempos y dificultades",
    "Observa problemas reales: señal, GPS, lentitud, errores",
    "Anota estrategias alternas: notas manuales, otro dispositivo, preguntar a otros",
    "Documenta incidentes críticos (lo que interrumpe la tarea)",
    "Al final haz 3–4 preguntas rápidas sobre su experiencia",
  ],
  sections: [
    { id: "meta", type: "fields", title: "Datos de la sesión", span: 12, cols: 2, fields: [{ id: "participant", label: "Nombre / código del participante" }, { id: "context", label: "Zona o contexto", placeholder: "Urbana, rural, oficina, sin señal…" }, { id: "device", label: "Dispositivo / medio" }, { id: "time", label: "Hora del día" }] },
    { id: "script", type: "text", title: "Diálogo de presentación", span: 12, rows: 5 },
    { id: "phases", type: "rowgroups", addGroups: true, title: "Flujo real observado", prompt: "Agrega o renombra fases según el flujo de tu producto. Usa filas Sí / No para comprobaciones rápidas.", span: 12 },
    { id: "photos", type: "gallery", title: "Evidencias (fotos)", span: 12 },
  ],
  init: (lang) => ({ phases: OBS_PHASES(lang) }),
  example: (lang) => ({
    script: lang === "en"
      ? "Hi, my name is ______ and I'll be with you today to learn how you use [product].\nWe want to understand your main pain points, the problems you've had and the opportunities to improve.\nWe're testing the design, not you. There's nothing you can do wrong here."
      : "Hola, mi nombre es ______ y hoy te acompañaré para conocer cómo usas [producto].\nQueremos entender tus principales puntos de dolor, los problemas que has tenido y las oportunidades de mejora.\nEstamos probando el diseño, no a ti. No hay nada que puedas hacer mal.",
    meta: { participant: L(lang, "Gestor 07", "Field agent 07"), context: L(lang, "Rural, señal intermitente", "Rural, intermittent signal"), device: L(lang, "Terminal PAX · moto", "PAX terminal · motorbike"), time: "10:30" },
    phases: (() => {
      const g = OBS_PHASES(lang);
      g[0].rows[0].answer = L(lang, "Sale de la agencia y busca el domicilio con referencias verbales.", "Leaves the branch and looks for the address using verbal references.");
      g[0].rows[2].answer = L(lang, "15 min de traslado", "15 min ride");
      g[1].rows[0].answer = L(lang, "Abre la app, busca al cliente, toma la foto de fachada y registra la visita.", "Opens the app, finds the customer, takes the storefront photo and logs the visit.");
      g[1].rows[1].answer = L(lang, "Error al guardar la foto la segunda vez.", "Error saving the photo on the second try.");
      g[2].rows[0].answer = L(lang, "Se pierde la señal al llegar a la zona rural.", "Signal drops on arrival in the rural area.");
      g[2].rows[1].answer = L(lang, "Abre Google Maps en su celular personal.", "Opens Google Maps on his personal phone.");
      g[3].rows[0].answer = L(lang, "\"Que el GPS no coincide con la dirección\"", "\"The GPS doesn't match the address\"");
      g[3].rows[1].answer = L(lang, "Poder guardar sin conexión.", "Being able to save offline.");
      return g;
    })(),
  }),
};

const diaryStudy: DocTemplate = {
  kind: "diary_study", name: "Diary Study", category: "Campo y entrevistas", icon: <NotebookPen size={18} />,
  description: "Entradas recurrentes del participante durante días o semanas, con los prompts que vas a enviarle y la bitácora de lo que reporta.",
  purpose: "Para capturar comportamientos y decisiones que ocurren a lo largo del tiempo, no en una sola sesión",
  question: "¿Qué hace, piensa o decide esta persona día a día alrededor del problema?",
  instructions: ["Define qué quieres aprender y por cuánto tiempo necesitas observarlo", "Escribe los prompts que le enviarás al participante en cada registro", "Explícale cómo y dónde debe registrar sus entradas (foto, texto, WhatsApp, formulario…)", "Vacía aquí sus entradas y busca patrones al final"],
  sections: [
    { id: "setup", type: "fields", title: "Configuración del estudio", span: 12, cols: 3, fields: [{ id: "duration", label: "Duración", placeholder: "Ej.: 2 semanas" }, { id: "frequency", label: "Frecuencia de registro", placeholder: "Ej.: Una vez al día" }, { id: "participants", label: "Participantes" }] },
    { id: "prompts", type: "list", title: "Prompts para cada registro", prompt: "Lo que le preguntarás o pedirás que registre cada vez.", span: 6 },
    { id: "method", type: "text", title: "Cómo va a registrar sus entradas", prompt: "Foto, nota de voz, texto por WhatsApp, formulario…", span: 6, rows: 4 },
    { id: "log", type: "entries", title: "Bitácora de entradas", prompt: "Vacía aquí cada entrada que te comparta el participante.", span: 12, nameLabel: "Participante y día (ej.: Ana · Día 3)", bodyLabel: "Qué registró o reportó…", addLabel: "Agregar entrada" },
    { id: "patterns", type: "list", title: "Patrones y hallazgos", span: 12 },
  ],
  example: (lang) => ({
    setup: { duration: L(lang, "2 semanas", "2 weeks"), frequency: L(lang, "Una vez al día, al cerrar el negocio", "Once a day, when closing up the shop"), participants: "6" },
    prompts: [L(lang, "¿Qué registraste hoy y cuánto tiempo te tomó?", "What did you log today and how long did it take?"), L(lang, "¿Hubo algún momento de duda o frustración?", "Was there a moment of doubt or frustration?"), L(lang, "¿Qué harías distinto mañana?", "What would you do differently tomorrow?")],
    method: L(lang, "Nota de voz de 1 minuto por WhatsApp al número del estudio, todas las noches.", "A 1-minute voice note over WhatsApp to the study number, every night."),
    log: entries(
      [L(lang, "Ana · Día 1", "Ana · Day 1"), L(lang, "Se le olvidó registrar dos ventas en efectivo y las agregó de memoria al día siguiente.", "She forgot to log two cash sales and added them from memory the next day.")],
      [L(lang, "Ana · Día 4", "Ana · Day 4"), L(lang, "Primera vez que cuadra la caja sin ayuda; dice que ya le toma la mitad del tiempo.", "First time she balances the register without help; says it now takes half the time.")],
    ),
    patterns: [L(lang, "Los primeros 3 días todos cometen al menos un olvido.", "Everyone makes at least one mistake in the first 3 days."), L(lang, "Para el día 5 la mayoría deja de necesitar ayuda.", "By day 5 most no longer need help.")],
  }),
};

// ───────────────────────────────────────── Evaluación
const script: DocTemplate = {
  kind: "usability_script", name: "Guion de prueba de usabilidad", category: "Evaluación", icon: <BookOpenCheck size={18} />,
  description: "Guion para sesiones moderadas: introducción, preguntas de calentamiento, tareas con criterio de éxito y cierre.",
  purpose: "Para que todas las sesiones moderadas sean consistentes",
  question: "¿Qué vas a decir y qué tareas vas a pedir en cada sesión?",
  instructions: ["Ajusta la introducción con tu nombre y el del producto", "Escribe las tareas como escenarios realistas, sin decir dónde hacer clic", "Define el criterio de éxito de cada tarea", "Cuando termines, genera la matriz de resultados con un clic"],
  sections: [
    { id: "meta", type: "fields", span: 12, cols: 3, fields: [{ id: "moderator", label: "Moderador(a)" }, { id: "product", label: "Producto" }, { id: "date", label: "Fecha" }] },
    { id: "intro", type: "text", title: "Introducción", span: 12, rows: 10 },
    { id: "warmup", type: "list", title: "Preguntas para conocer al usuario", span: 6, numbered: true },
    { id: "before", type: "text", title: "Antes de comenzar con las tareas", span: 6, rows: 4 },
    { id: "tasks", type: "entries", title: "Tareas", prompt: "Escenario de la tarea y criterio de éxito.", span: 12, nameLabel: "Escenario de la tarea", bodyLabel: "Criterio de éxito: ¿qué debe lograr y por dónde?", addLabel: "Agregar tarea" },
    { id: "closing", type: "list", title: "Preguntas de cierre", span: 12, numbered: true },
  ],
  example: (lang) => ({
    ...SCRIPT_TEXT(lang),
    meta: { moderator: "Keyci", product: L(lang, "Facturación electrónica", "E-invoicing"), date: "" },
    tasks: entries(
      [L(lang, "Configura la información de facturación electrónica de tu empresa", "Set up your company's e-invoicing information"), L(lang, "Llega a Configuración > Empresa y carga los certificados.", "Reaches Settings > Company and uploads the certificates.")],
      [L(lang, "Crea tu primera factura electrónica", "Create your first e-invoice"), L(lang, "Desde Ingresos > Facturas de venta, usando la numeración electrónica.", "From Income > Sales invoices, using the electronic numbering.")],
      [L(lang, "Anula una factura con una nota de crédito", "Void an invoice with a credit note"), L(lang, "Desde el detalle de la factura, opción Nota de crédito.", "From the invoice detail, Credit note option.")],
    ),
  }),
};

const SCRIPT_TEXT = (lang: Lang) => lang === "en" ? {
    intro: "Hi, my name is ______ and I'll be facilitating this session.\n\nToday we're testing the design of [product]. We want to see people use it to find out how well it works.\n\nWe're testing the design, not you. There's nothing you can do wrong. Please share exactly what you think — honest feedback helps us improve.\n\nAs we go, I'll ask you to do some tasks. Please think out loud and tell me what's going through your mind.\n\nIf you have questions, ask. I may not answer right away because we want to learn what you think, but I'll answer them at the end.\n\nWith your permission, I'll record the audio and the screen so I don't have to take notes now. Please don't share what we see today, as it isn't public yet.\n\nDo you have any questions before we start?",
    warmup: ["What is your occupation?", "Do you use a mobile device for your work?", "Roughly how much time per week do you use [product]?", "On a typical day, when and in what situation do you use it?", "Do you have favorite websites or apps?"],
    before: "For now, don't click anywhere. Just tell me what you see on the screen and where you would start this task… And again, please think out loud.",
    closing: ["Overall, how would you describe your experience?", "What was the most confusing part?", "What would you change first?", "Is there anything else you'd like to tell us?"],
  } : {
    intro: "Hola, mi nombre es ______ y estaré facilitando esta sesión.\n\nHoy estamos probando el diseño de [producto]. Queremos verlo en uso para saber qué tan bien funciona.\n\nQuiero dejar claro que estamos probando el diseño, no a ti. No hay nada que puedas hacer mal ni respuestas correctas o incorrectas. Necesitamos saber honestamente lo que piensas para poder mejorarlo.\n\nA medida que avancemos te pediré que realices algunas tareas. Por favor piensa en voz alta: dime qué pasa por tu mente al realizarlas.\n\nSi tienes preguntas, hazlas. Es posible que no pueda responderlas de inmediato, pero lo haré al final.\n\nCon tu permiso, voy a grabar el audio y la pantalla para no tener que tomar notas ahora. También te pido no compartir lo que veremos hoy, ya que aún no es público.\n\n¿Tienes alguna pregunta antes de comenzar?",
    warmup: ["¿Cuál es tu ocupación?", "¿Usas algún dispositivo móvil como parte de tu trabajo?", "¿Aproximadamente cuánto tiempo a la semana usas [producto]?", "En un día típico, ¿en qué momento y en qué situación lo usas?", "¿Tienes algún sitio web o aplicación favorita?"],
    before: "Por ahora no hagas clic en ningún lado; solo dime qué ves en pantalla y dónde comenzarías esta tarea… Y de nuevo, nos ayuda mucho que pienses en voz alta.",
    closing: ["En general, ¿cómo describirías tu experiencia?", "¿Qué fue lo más confuso?", "¿Qué cambiarías primero?", "¿Hay algo más que quieras contarnos?"],
  };

const results: DocTemplate = {
  kind: "usability_results", name: "Resultados de prueba de usabilidad", category: "Evaluación", icon: <Gauge size={18} />,
  description: "Matriz de tareas × participantes con Pasa / Parcial / Falla y observaciones. La tasa de éxito se calcula sola.",
  purpose: "Para registrar y comunicar qué tan bien completaron las tareas",
  question: "¿Qué tareas se completan con éxito y dónde se atoran?",
  instructions: ["Agrega las tareas y su descripción de éxito", "Agrega una columna por participante", "Marca Pasa, Parcial, Falla o N/A y escribe observaciones", "La tasa de éxito por tarea y la total se calculan automáticamente"],
  sections: [
    { id: "meta", type: "fields", span: 12, cols: 3, fields: [{ id: "project", label: "Proyecto" }, { id: "dates", label: "Fechas" }, { id: "moderator", label: "Moderador(a)" }] },
    { id: "matrix", type: "custom", component: "usability", span: 12 },
    { id: "findings", type: "list", title: "Hallazgos principales", span: 6 },
    { id: "next", type: "list", title: "Recomendaciones / siguientes pasos", span: 6 },
  ],
  init: () => ({ matrix: {
    tasks: [1, 2, 3, 4].map(() => ({ id: uid(), name: "", success: "" })),
    users: [1, 2, 3, 4].map(() => ({ id: uid(), name: "", profile: "" })), results: {},
  } }),
  example: (lang) => {
    const tasks = [
      [L(lang, "Configurar la información de FE", "Set up e-invoicing info"), L(lang, "Configuración > Empresa y cargar certificados", "Settings > Company and upload certificates")],
      [L(lang, "Configurar la numeración electrónica", "Set up electronic numbering"), L(lang, "Configuración > Numeraciones > Nueva", "Settings > Numbering > New")],
      [L(lang, "Crear la primera factura electrónica", "Create the first e-invoice"), L(lang, "Ingresos > Facturas de venta con numeración electrónica", "Income > Sales invoices with electronic numbering")],
      [L(lang, "Crear una nota de crédito", "Create a credit note"), L(lang, "Desde el detalle de la factura", "From the invoice detail")],
    ].map(([name, success]) => ({ id: uid(), name, success }));
    const users = [["Diana A.", "COL"], ["Diana V.", "COL"], ["Josette C.", L(lang, "CRI · interna", "CRI · internal")], ["Fátima T.", L(lang, "MEX · interna", "MEX · internal")]].map(([name, profile]) => ({ id: uid(), name, profile }));
    const S: [string, string][][] = [
      [["pass", L(lang, "Tuvo inconvenientes al guardar.", "Had trouble saving.")], ["pass", ""], ["fail", L(lang, "Conoce el término con otro nombre.", "Knows the term by another name.")], ["pass", ""]],
      [["fail", L(lang, "No fue claro que debía crear una nueva numeración.", "Wasn't clear she had to create new numbering.")], ["pass", ""], ["pass", ""], ["partial", L(lang, "En MEX no aplica igual.", "Works differently in MEX.")]],
      [["pass", ""], ["pass", L(lang, "La creó desde una remisión.", "Created it from a delivery note.")], ["pass", ""], ["pass", ""]],
      [["na", ""], ["fail", L(lang, "Fue al menú de NC en lugar del detalle.", "Went to the credit-note menu instead of the detail.")], ["na", ""], ["na", ""]],
    ];
    const r: Record<string, { status: string; note: string }> = {};
    tasks.forEach((tk, i) => users.forEach((u, k) => { r[`${tk.id}:${u.id}`] = { status: S[i][k][0], note: S[i][k][1] }; }));
    return {
      meta: { project: L(lang, "Facturación electrónica", "E-invoicing"), dates: "01/10 – 25/11", moderator: "" },
      matrix: { tasks, users, results: r },
      findings: [L(lang, "La numeración electrónica no se entiende como paso obligatorio.", "Electronic numbering isn't understood as a required step."), L(lang, "Los términos varían por país.", "Terms vary by country.")],
      next: [L(lang, "Guiar la configuración inicial con un checklist.", "Guide the initial setup with a checklist."), L(lang, "Adaptar la terminología por país.", "Localize terminology per country.")],
    };
  },
};

const heuristic: DocTemplate = {
  kind: "heuristic_eval", name: "Evaluación heurística", category: "Evaluación", icon: <FileText size={18} />,
  description: "Heurísticas psicológicas de Weinschenk o las 10 de Nielsen, con varios evaluadores, severidad 0–4 y resultados globales automáticos.",
  purpose: "Para detectar problemas de usabilidad con una revisión experta",
  question: "¿Qué principios de usabilidad no cumple el diseño y qué tan grave es cada problema?",
  instructions: ["Cada evaluador revisa el producto por su cuenta, en su pestaña", "Marca Pasa, Falla o N/A en cada punto", "Si falla, asigna la severidad (0 a 4) y explica dónde ocurre", "Revisa los resultados globales: cumplimiento por heurística y problemas priorizados"],
  credit: "Heurísticas psicológicas basadas en Susan Weinschenk (adaptación de jordisan) · Heurísticas de Jakob Nielsen",
  sections: [
    { id: "meta", type: "fields", span: 12, cols: 3, fields: [{ id: "product", label: "Producto o flujo evaluado" }, { id: "company", label: "Empresa" }, { id: "date", label: "Fecha" }] },
    { id: "eval", type: "custom", component: "heuristic", span: 12 },
  ],
  init: () => ({ eval: { framework: "weinschenk", product: "", evaluators: [1, 2, 3].map(() => ({ id: uid(), name: "" })), answers: {} } }),
  example: (lang) => {
    const ev = [{ id: uid(), name: "Ana" }, { id: uid(), name: "Luis" }];
    const a: Record<string, { r: string; s: number | null; n: string }> = {};
    const mark = (item: string, e: number, r: string, s: number | null = null, n = "") => { a[`${item}:${ev[e].id}`] = { r, s, n }; };
    mark("w1.1", 0, "fail", 3, L(lang, "El registro pide 14 campos antes de mostrar valor.", "Sign-up asks for 14 fields before showing any value.")); mark("w1.1", 1, "fail", 2);
    mark("w1.4", 0, "pass"); mark("w1.4", 1, "pass");
    mark("w3.2", 0, "fail", 4, L(lang, "No se puede deshacer al eliminar un pedido.", "You can't undo deleting an order.")); mark("w3.2", 1, "fail", 3);
    mark("w4.5", 0, "pass"); mark("w4.5", 1, "fail", 1, L(lang, "El verde se usa para alertas y para éxito.", "Green is used both for alerts and success."));
    return { meta: { product: L(lang, "App de pedidos · checkout", "Ordering app · checkout"), company: "", date: "" }, eval: { framework: "weinschenk", product: "", evaluators: ev, answers: a } };
  },
};

export const DOC_TEMPLATES: DocTemplate[] = [blueprint, protoPersona, personaCanvas, personaProfile, journey, affinity, empathyMap, stakeholderMap, cognitiveMap, userFlow, serviceBlueprint, jtbd, interviews, aeiou, observation, diaryStudy, script, results, heuristic];
export const docTemplate = (kind: string) => DOC_TEMPLATES.find((d) => d.kind === kind);
export const DOC_ICON = Compass;
export type { DocData };
