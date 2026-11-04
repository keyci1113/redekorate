import type { Lang } from "../lib/i18n";

export interface HeuristicCategory { id: string; name: string; items: { id: string; text: string }[] }
type Bi = [string, string]; // [es, en]

// Heurísticas psicológicas de usabilidad (Susan Weinschenk · adaptación de jordisan)
const WEINSCHENK: { name: Bi; items: Bi[] }[] = [
  { name: ["La gente no quiere trabajar más de lo necesario", "People don't want to work more than necessary"], items: [
    ["El sistema no requiere que los usuarios trabajen más de lo necesario.", "The system doesn't require users to work more than necessary."],
    ["El sistema muestra la información en pequeños pasos secuenciales.", "The system shows information in small, sequential steps."],
    ["Se muestran ejemplos además de las descripciones.", "Examples are shown in addition to descriptions."],
    ["Los objetos en pantalla tienen affordances: lo que se puede tocar, parece tocable.", "On-screen objects have affordances: what is clickable looks clickable."],
    ["El sistema no ofrece más funcionalidades de las que el usuario necesita.", "The system doesn't offer more features than the user needs."],
    ["El sistema habla un lenguaje coloquial, con palabras y conceptos de la vida diaria.", "The system speaks the user's language, with everyday words and concepts."],
  ] },
  { name: ["La gente tiene limitaciones", "People have limitations"], items: [
    ["La información es fácil de escanear; hay jerarquía visual en imágenes y tipografía.", "Information is easy to scan; images and typography have a clear visual hierarchy."],
    ["Se usan encabezados y bloques cortos de texto.", "Headings and short blocks of text are used."],
    ["El sistema no requiere que los usuarios hagan tareas simultáneas.", "The system doesn't require users to multitask."],
    ["Las líneas de texto tienen una longitud adecuada (alrededor de 15 palabras).", "Lines of text have an adequate length (around 15 words)."],
    ["Se prefieren mapas, diagramas, gráficas y otras ayudas visuales sobre bloques largos de texto.", "Maps, diagrams, charts and other visuals are preferred over long blocks of text."],
  ] },
  { name: ["La gente comete errores", "People make mistakes"], items: [
    ["El sistema anticipa los errores de los usuarios y busca prevenirlos.", "The system anticipates user errors and tries to prevent them."],
    ["Es sencillo deshacer y recuperarse de un error.", "It's easy to undo and recover from an error."],
    ["Los errores se previenen en lugar de mostrarse y corregirse.", "Errors are prevented rather than shown and corrected."],
    ["El sistema lleva al usuario al campo donde hubo un error y lo señala.", "The system takes the user to the field with the error and highlights it."],
    ["La interfaz se ha iterado con base en retroalimentación y pruebas con usuarios.", "The interface has been iterated based on feedback and user testing."],
  ] },
  { name: ["La memoria humana es complicada", "Human memory is complicated"], items: [
    ["El sistema no depende de que los usuarios recuerden demasiado.", "The system doesn't rely on users remembering too much."],
    ["Los usuarios no necesitan recordar información para pasar de una tarea a otra.", "Users don't need to remember information to move from one task to another."],
    ["Los usuarios no necesitan recordar más de 3–4 cosas a la vez.", "Users don't need to remember more than 3–4 things at once."],
    ["El espacio en blanco crea simetría y guía la vista en la dirección correcta.", "White space creates symmetry and guides the eye in the right direction."],
    ["El código de color es consistente en todo el sistema.", "Color coding is consistent throughout the system."],
  ] },
  { name: ["La gente es social", "People are social"], items: [
    ["El sistema aprovecha herramientas sociales en sus funcionalidades.", "The system supports social tools within its features."],
    ["Los usuarios pueden guiar a otros con recomendaciones, obtener reconocimiento o crear reputación.", "Users can guide others with recommendations, earn recognition or build reputation."],
    ["El sistema aprovecha que varios usuarios hagan tareas al mismo tiempo.", "The system takes advantage of several users doing tasks at the same time."],
    ["Antes de pedir algo a los usuarios, el sistema les ofrece algo que necesitan.", "Before asking users for something, the system gives them something they need."],
    ["El sistema muestra cómo hacer lo que los usuarios necesitan hacer.", "The system shows people how to do what they need to do."],
  ] },
  { name: ["La gente tiene atención limitada", "People have limited attention"], items: [
    ["La atención se capta en los momentos correctos y no se distrae al usuario en lo importante.", "Attention is captured at the right moments; users aren't distracted from what matters."],
    ["Se usan elementos novedosos o diferentes cuando se necesita atención.", "Novel or different elements are used when attention is needed."],
    ["El sistema no asume que los usuarios notarán cada cambio en la interfaz.", "The system doesn't assume users will notice every change in the interface."],
    ["Para llamar la atención se usan colores, tamaños, sonidos o movimiento de forma adecuada.", "Color, size, sound or motion are used appropriately to draw attention."],
    ["El sistema no distrae innecesariamente a los usuarios.", "The system doesn't distract users unnecessarily."],
  ] },
  { name: ["La gente busca información por naturaleza", "People crave information"], items: [
    ["El sistema aprovecha lo que los usuarios están buscando.", "The system leverages what users are looking for."],
    ["El sistema ofrece más información cuando el usuario la solicita.", "The system provides more information when the user asks for it."],
    ["El sistema da suficiente retroalimentación sobre lo que está pasando (genera confianza).", "The system gives enough feedback about what's happening (builds trust)."],
    ["Las funciones de ayuda y documentación son visibles.", "Help and documentation are visible."],
    ["Los usuarios inician las acciones en lugar de solo responder.", "Users initiate actions rather than only respond."],
    ["Navegación: la información es fácil de encontrar.", "Navigation: information is easy to find."],
    ["Presentación: el diseño visual está bien resuelto.", "Presentation: the visual design is well executed."],
  ] },
  { name: ["La gente opera bajo procesos inconscientes", "People operate on unconscious processes"], items: [
    ["El sistema considera el procesamiento inconsciente.", "The system takes unconscious processing into account."],
    ["Antes de pedir un compromiso grande, se pide uno pequeño.", "Before asking for a big commitment, users are asked for a small one."],
    ["Se usan imágenes de personas e historias para generar respuestas emocionales.", "Images of people and stories are used to evoke emotional responses."],
    ["El contenido inconsciente se usa de forma ética y adecuada.", "Unconscious cues are used ethically and appropriately."],
    ["Las indicaciones transmiten que el usuario tiene el control.", "Prompts convey that the user is in control."],
  ] },
  { name: ["La gente crea modelos mentales", "People create mental models"], items: [
    ["El sistema considera los modelos mentales de los usuarios.", "The system considers users' mental models."],
    ["Las tareas se diseñan según los modelos mentales previos de cada tarea.", "Tasks are designed according to users' existing mental models."],
    ["El sistema coincide con el modelo mental del usuario o le enseña el correcto.", "The system matches the user's mental model or teaches the right one."],
    ["Se usan metáforas adecuadas para explicar el sistema.", "Appropriate metaphors are used to explain the system."],
    ["Se investiga a los usuarios para conocer sus modelos mentales.", "User research is done to learn users' mental models."],
  ] },
  { name: ["La gente responde mejor a sistemas visuales claros", "People respond better to clear visual systems"], items: [
    ["La información se agrupa para dar foco y evitar interfaces saturadas.", "Information is grouped to give focus and avoid cluttered interfaces."],
    ["Los elementos relacionados están cerca unos de otros.", "Related items are placed close together."],
    ["La tipografía es suficientemente grande y fácil de leer.", "Typography is large enough and easy to read."],
    ["Se considera la visión periférica; el entorno de los elementos importantes es coherente.", "Peripheral vision is considered; surroundings of key elements are consistent."],
    ["Las imágenes de objetos son suficientemente descriptivas.", "Images of objects are descriptive enough."],
    ["Los colores corresponden a las expectativas comunes (rojo = error, verde = éxito…).", "Colors match common expectations (red = error, green = success…)."],
  ] },
];

// 10 heurísticas de usabilidad de Jakob Nielsen
const NIELSEN: Bi[][] = [
  [["Visibilidad del estado del sistema", "Visibility of system status"], ["El sistema informa qué está pasando con retroalimentación oportuna.", "The system keeps users informed through timely feedback."]],
  [["Relación entre el sistema y el mundo real", "Match between system and the real world"], ["Usa el lenguaje y conceptos del usuario, en un orden natural.", "Uses the user's language and concepts in a natural order."]],
  [["Control y libertad del usuario", "User control and freedom"], ["Hay salidas claras para deshacer o cancelar acciones.", "There are clear exits to undo or cancel actions."]],
  [["Consistencia y estándares", "Consistency and standards"], ["Las palabras, situaciones y acciones significan lo mismo en todo el producto.", "Words, situations and actions mean the same thing throughout."]],
  [["Prevención de errores", "Error prevention"], ["El diseño evita que ocurran problemas en primer lugar.", "The design prevents problems from occurring in the first place."]],
  [["Reconocer antes que recordar", "Recognition rather than recall"], ["Los elementos, acciones y opciones son visibles; no hay que memorizar.", "Elements, actions and options are visible; no need to memorize."]],
  [["Flexibilidad y eficiencia de uso", "Flexibility and efficiency of use"], ["Hay atajos para usuarios expertos sin complicar a los novatos.", "Shortcuts exist for experts without complicating novices."]],
  [["Diseño estético y minimalista", "Aesthetic and minimalist design"], ["No hay información irrelevante que compita con lo importante.", "No irrelevant information competes with what matters."]],
  [["Ayuda a reconocer, diagnosticar y recuperarse de errores", "Help users recognize, diagnose and recover from errors"], ["Los mensajes de error son claros y sugieren una solución.", "Error messages are clear and suggest a solution."]],
  [["Ayuda y documentación", "Help and documentation"], ["La ayuda es fácil de encontrar y enfocada en la tarea.", "Help is easy to find and focused on the task."]],
];

export type Framework = "weinschenk" | "nielsen";

export function heuristicCategories(fw: Framework, lang: Lang): HeuristicCategory[] {
  const L = lang === "en" ? 1 : 0;
  if (fw === "nielsen") {
    return NIELSEN.map(([name, desc], i) => ({ id: `n${i + 1}`, name: `${i + 1}. ${name[L]}`, items: [{ id: `n${i + 1}.1`, text: desc[L] }] }));
  }
  return WEINSCHENK.map((c, i) => ({ id: `w${i + 1}`, name: `${i + 1}. ${c.name[L]}`, items: c.items.map((it, k) => ({ id: `w${i + 1}.${k + 1}`, text: it[L] })) }));
}

export const SEVERITY: Bi[] = [["0 · Sin problema", "0 · No problem"], ["1 · Cosmético", "1 · Cosmetic"], ["2 · Menor", "2 · Minor"], ["3 · Mayor", "3 · Major"], ["4 · Catástrofe", "4 · Catastrophe"]];
