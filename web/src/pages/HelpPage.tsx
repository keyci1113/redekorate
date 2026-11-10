import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpenText, Compass, ListChecks } from "lucide-react";
import { Card, Tabs } from "../components/ui";
import { t } from "../lib/i18n";

/** A how-to: one goal, numbered steps, where it starts. */
interface HowTo { id: string; title: string; where: string; steps: string[]; note?: string }
/** A concept: the word as the interface uses it, and what it means here. */
interface Concept { id: string; term: string; body: string; related?: string[] }

const HOW_TOS = (): HowTo[] => [
  { id: "first-study", title: t("Crear tu primer estudio"), where: t("Proyectos → Nuevo estudio"), steps: [
    t("Crea un proyecto (o abre uno) y pulsa Nuevo estudio."),
    t("Elige un método. Si no sabes cuál, empieza por tu pregunta: los chips de arriba filtran los métodos recomendados."),
    t("Ponle nombre, elige el idioma que verán los participantes y pulsa Usar este método. El template trae los bloques listos."),
    t("En el builder edita los textos, agrega o quita bloques y revisa la vista previa a la derecha."),
  ] },
  { id: "publish", title: t("Publicar un estudio y enviar el link"), where: t("Builder → Publicar"), steps: [
    t("Pulsa Publicar en el builder. Se revisa que no falte nada (por ejemplo, una tarea sin pantalla meta)."),
    t("Copia el link para participantes (también está en Resultados). Puedes agregar ?pid=123 o ?source=email para distinguir de dónde llegan."),
    t("Comparte el link. Nadie necesita cuenta: el estudio funciona en celular y en computadora."),
  ], note: t("Un estudio activo guarda una versión publicada. Si sigues editando, los participantes ven la publicada hasta que pulses Publicar cambios.") },
  { id: "results", title: t("Leer resultados y guardar insights"), where: t("Estudio → Resultados"), steps: [
    t("La pestaña Resultados muestra el análisis de cada bloque: porcentajes, puntajes SUS/NPS, rutas, mapas de calor."),
    t("En Participantes ves cada sesión; puedes descartar las que no sirvan."),
    t("Convierte lo que aprendas en insights: título corto, severidad y evidencia. Viven en el repositorio del proyecto."),
    t("Marca un insight como revisado cuando el equipo ya lo discutió."),
  ] },
  { id: "share-report", title: t("Compartir un reporte con un cliente o directivo"), where: t("Resultados → Compartir"), steps: [
    t("Desde Resultados → Compartir crea un link de solo lectura. No incluye datos personales de participantes."),
    t("Para combinar varios estudios usa la pestaña Reporte del proyecto y elige cuáles entran."),
    t("Descarga el PDF desde el mismo reporte si lo prefieres por correo."),
    t("Revoca el link cuando ya no deba estar disponible."),
  ] },
  { id: "collaborators", title: t("Invitar a alguien a un proyecto"), where: t("Proyecto → Colaboradores"), steps: [
    t("Abre la pestaña Colaboradores del proyecto. Solo quien es dueño agrega personas."),
    t("Escribe el correo de una cuenta que ya existe y elige su rol: Editor, Comentarista o Solo lectura."),
    t("Si la persona aún no tiene cuenta, pídele a un admin de la instancia que la invite desde Usuarios, o invítala a tu organización."),
  ] },
  { id: "org", title: t("Crear una organización con logo"), where: t("Menú de la cuenta → Organizaciones"), steps: [
    t("Pulsa Nueva organización: nombre, logo (PNG con fondo transparente funciona mejor) y color."),
    t("En Personas agrega cuentas existentes por correo o envía invitaciones de 7 días a quien no tenga cuenta."),
    t("Crea proyectos dentro de la organización (selector Espacio del formulario) o mueve uno existente desde Editar proyecto."),
    t("Los estudios nuevos de esos proyectos nacen con el logo y el color de la organización; los reportes públicos muestran el logo."),
  ] },
  { id: "prototype", title: t("Probar un prototipo"), where: t("Nuevo estudio → Prototype Testing"), steps: [
    t("Con pantallas: exporta tus frames de Figma como PNG, súbelos en Prototipos y dibuja las zonas clicables que conectan pantallas."),
    t("Con HTML: sube un prototipo de un solo archivo (por ejemplo hecho con Claude). Se detectan sus pantallas y se registran los toques."),
    t("Con link: pega la URL de un prototipo publicado (Figma Make, un sitio). Se muestra en un iframe y el participante reporta el resultado."),
    t("En cada tarea define pantalla inicial, meta y ruta esperada; redacta la tarea como un objetivo, sin decir dónde hacer clic."),
  ] },
  { id: "documents", title: t("Llenar un documento de investigación"), where: t("Proyecto → Documentos"), steps: [
    t("Elige una plantilla: personas, journey map, affinity, guion de usabilidad, evaluación heurística…"),
    t("Los ejemplos aparecen solo como texto guía: nunca se guardan ni se exportan."),
    t("Se guarda solo mientras escribes. Exporta a Word, PDF, Markdown o CSV, o comparte un link de lectura."),
  ] },
  { id: "participants", title: t("Llevar un panel de participantes"), where: t("Proyecto → Participantes"), steps: [
    t("Registra a cada persona con contacto, etiquetas y consentimiento."),
    t("Asígnala a estudios y marca si completó, no se presentó o declinó."),
    t("Usa un Screener de reclutamiento para filtrar candidatos antes de invitarlos."),
  ] },
];

const CONCEPTS = (): Concept[] => [
  { id: "project", term: t("Proyecto"), body: t("La carpeta de un producto o un cliente. Agrupa estudios, documentos, insights, participantes y reportes, y define quién colabora."), related: ["study", "roles", "organization"] },
  { id: "study", term: t("Estudio"), body: t("Una secuencia de bloques que los participantes responden desde un link público. Nace como borrador, pasa a activo al publicarse y se cierra cuando ya no recibe respuestas."), related: ["method", "block", "published"] },
  { id: "method", term: t("Método"), body: t("El tipo de investigación: encuesta, card sorting, tree testing, first click, prueba de prototipo, SUS, NPS… Cada método es un template con sus bloques, su guía y su análisis automático."), related: ["study"] },
  { id: "block", term: t("Bloque"), body: t("Cada paso de un estudio: una pregunta, una tarea de prototipo, una escala, un bloque de bienvenida. Los bloques se reordenan y pueden tener lógica condicional que salta hacia adelante."), related: ["study"] },
  { id: "participant", term: t("Participante"), body: t("Quien responde un estudio. No necesita cuenta y no guardamos su IP ni su navegador completo: solo el tipo de dispositivo. El panel de participantes es tu base de reclutamiento, separada de las respuestas."), related: ["response"] },
  { id: "response", term: t("Respuesta (sesión)"), body: t("Una participación completa o abandonada en un estudio. Los resultados distinguen quién inició y quién terminó; el completado es terminaron ÷ iniciaron."), related: ["participant", "results"] },
  { id: "results", term: t("Resultados"), body: t("El análisis por bloque de un estudio: porcentajes, puntajes, rutas y mapas de calor. Se actualiza en vivo mientras llegan respuestas."), related: ["insight", "report"] },
  { id: "insight", term: t("Insight"), body: t("Un hallazgo accionable, escrito por una persona: título, severidad, confianza y evidencia. Vive en el repositorio del proyecto, opcionalmente ligado a un estudio, y se marca como revisado."), related: ["results", "report"] },
  { id: "report", term: t("Reporte"), body: t("Un link de solo lectura con los resultados y los hallazgos de uno o varios estudios, pensado para enviarse tal cual a un cliente o directivo. Nunca incluye datos personales y se puede revocar."), related: ["results", "insight"] },
  { id: "document", term: t("Documento"), body: t("Una plantilla llenable por proyecto: personas, journey map, affinity, guion y matriz de usabilidad, evaluación heurística, blueprint… Se exporta a Word, PDF, Markdown o CSV."), related: ["project"] },
  { id: "published", term: t("Borrador y versión publicada"), body: t("Un estudio activo tiene dos versiones: el borrador que editas y la publicada que ven los participantes. Publicar cambios copia el borrador a la publicada; cada respuesta recuerda con qué versión empezó."), related: ["study"] },
  { id: "prototype", term: t("Prototipo"), body: t("Lo que se prueba en una tarea: pantallas subidas con zonas clicables, un HTML de un solo archivo con seguimiento de toques, o un link a un prototipo publicado. Las tareas tienen pantalla inicial, meta y ruta esperada."), related: ["method"] },
  { id: "organization", term: t("Organización"), body: t("Un espacio con nombre, logo y color para una empresa, un equipo o un estudio personal. Sus proyectos heredan la marca y todas sus personas los ven y comentan. Un proyecto es personal o pertenece a una organización."), related: ["project", "roles"] },
  { id: "roles", term: t("Roles"), body: t("En la instancia: admin (gestiona usuarios e invitaciones) y miembro. En un proyecto: dueño/a, editor, comentarista y solo lectura. En una organización: dueño/a, admin y miembro; los miembros son comentaristas en todos sus proyectos. Cuando aplican varios roles, gana el más alto."), related: ["project", "organization"] },
  { id: "comments", term: t("Comentarios"), body: t("Conversación ligera sobre un proyecto, los resultados de un estudio o un documento. Pueden escribir comentaristas, editores y dueños; borran sus autores y quien es dueño del proyecto."), related: ["roles"] },
];

type Section = "howto" | "concepts";

/** Help: short how-tos for the main tasks and a glossary of the words the interface uses. */
export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Section>(params.get("tab") === "concepts" ? "concepts" : "howto");
  const change = (v: Section) => { setTab(v); setParams(v === "howto" ? {} : { tab: v }, { replace: true }); };
  const howTos = HOW_TOS(), concepts = CONCEPTS();
  const byId = new Map(concepts.map((c) => [c.id, c.term]));
  return (
    <div className="page">
      <h1 className="page-title">{t("Ayuda y conceptos")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{t("Cómo hacer lo más común, y qué significa cada palabra que usa la interfaz. También puedes")} <Link to="/welcome" className="font-medium text-accent">{t("repetir el recorrido de bienvenida")}</Link>.</p>
      <div className="mt-8"><Tabs value={tab} onChange={change} items={[{ id: "howto", label: t("Cómo hacer…"), count: howTos.length }, { id: "concepts", label: t("Conceptos"), count: concepts.length }]} /></div>

      {tab === "howto" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {howTos.map((h) => (
            <Card key={h.id} className="p-5" >
              <h2 className="flex items-start gap-2 text-[17px] font-semibold" id={h.id}><ListChecks size={18} className="mt-0.5 shrink-0 text-accent" /> {h.title}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Compass size={12} /> {h.where}</p>
              <ol className="mt-3 space-y-2 pl-1">
                {h.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/5 text-[11px] font-semibold text-ink">{i + 1}</span><span>{s}</span></li>
                ))}
              </ol>
              {h.note && <p className="mt-3 rounded-lg border border-accent/15 bg-accent-soft/60 px-3 py-2 text-[13px] leading-relaxed text-accent-ink">{h.note}</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === "concepts" && (
        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {concepts.map((c) => (
            <Card key={c.id} className="p-5">
              <dt className="flex items-center gap-2 text-[17px] font-semibold" id={c.id}><BookOpenText size={17} className="shrink-0 text-accent" /> {c.term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-2">{c.body}</dd>
              {c.related && (
                <dd className="mt-3 flex flex-wrap gap-1.5">
                  {c.related.map((r) => <a key={r} href={`#${r}`} className="focus-ring rounded-md border border-line bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-2 hover:border-line-2 hover:text-ink">{byId.get(r) ?? r}</a>)}
                </dd>
              )}
            </Card>
          ))}
        </dl>
      )}

      <Related />
    </div>
  );
}

function Related(): ReactNode {
  return (
    <p className="mt-10 text-sm text-ink-3">{t("¿Falta algo? Las guías de cada método están en Nuevo estudio, y el README del proyecto explica la instalación y la configuración.")}</p>
  );
}
