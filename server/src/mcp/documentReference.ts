/**
 * How research documents are shaped, for outside assistants (MCP and /api/v1 callers). A document's `data` is an
 * object keyed by section id; what each value holds depends on the section's type. The section lists mirror
 * web/src/docs/templates.tsx, and documentReference.test.ts fails when they drift apart.
 */

/** date: "one" = a single day, "many" = any number of days. */
export interface DocField { id: string; label: string; date?: "one" | "many" }
export interface DocSection { id: string; type: string; component?: string; title?: string; prompt?: string; fields?: DocField[] }
export interface DocKind { name: string; description: string; sections: DocSection[] }

/** The document kinds the app opens, with their sections in display order. Titles and prompts are the English text. */
export const DOC_KINDS: Record<string, DocKind> = {
  ux_blueprint: {
    name: "UX Project Blueprint",
    description: "Research planning: problem, hard data, hypotheses, UX activities, deliverables and metrics.",
    sections: [
      { id: "problem", type: "list", title: "Assumed problem", prompt: "What problem are we solving? How does the problem show up?" },
      { id: "data", type: "list", title: "Hard data", prompt: "How do we know the problem exists? What evidence do we have?" },
      { id: "questions", type: "list", title: "Outstanding questions", prompt: "What don't we know about the problem? What other data do we need?" },
      { id: "ideal", type: "list", title: "Ideal scenario", prompt: "What does this problem look like once solved? What's the ideal solution?" },
      { id: "activities", type: "list", title: "UX activities", prompt: "Which UX activities help us reach the ideal solution? Which methodologies solve the problem?" },
      { id: "hypothesis", type: "list", title: "Hypothesis", prompt: "Which indicator would tell us we solved the problem? What would happen if we applied a given solution?" },
      { id: "objectives", type: "list", title: "Goals", prompt: "What do we want to achieve with those activities? What do they look like once done?" },
      { id: "tasks", type: "list", title: "Tasks", prompt: "What operational tasks do we need to carry out? Which requirements are essential?" },
      { id: "deliverables", type: "list", title: "Deliverables", prompt: "What documents will come out of the activities? How will we communicate the results?" },
      { id: "metrics", type: "list", title: "Metrics", prompt: "How can we measure the improvements in business terms? How do we measure success?" },
      { id: "value", type: "list", title: "Value", prompt: "What's the overall benefit for the product? Which UX principles do these improvements bring?" },
    ],
  },
  proto_persona: {
    name: "Proto-persona",
    description: "Assumptions about who your users are, before researching. Ideal for defining who to recruit.",
    sections: [
      { id: "photo", type: "image", title: "Photo or sketch" },
      { id: "who", type: "fields", title: "Who are they?", fields: [{ id: "name", label: "Name" }, { id: "type", label: "User type" }, { id: "age", label: "Approximate age" }, { id: "place", label: "Location" }] },
      { id: "facts", type: "notes", title: "Facts", prompt: "Some ideas: gender, age, education, profession, tools they use, skills, responsibilities. Only data that identifies them as a user." },
      { id: "problems", type: "notes", title: "Problems", prompt: "What problem related to your product do they have? E.g.: doesn't have a car and needs to get around the city." },
      { id: "behaviors", type: "notes", title: "Behaviors", prompt: "What do they do today? E.g.: creates documents to measure progress and present it to their team." },
      { id: "needs", type: "notes", title: "Needs and goals", prompt: "What do they want to achieve? E.g.: get home safe and sound without having to call a taxi." },
    ],
  },
  persona_canvas: {
    name: "Persona profile (canvas)",
    description: "Canvas to synthesize a persona from research: goals, context of use, channels and future use.",
    sections: [
      { id: "who", type: "fields", title: "Name and user type", fields: [{ id: "name", label: "Name" }, { id: "type", label: "User type" }, { id: "quote", label: "A phrase that describes them" }] },
      { id: "goals", type: "notes", title: "Goals and purchase intent", prompt: "Needs · Currently looking for… · Behaviors · Special requirements" },
      { id: "fit", type: "notes", title: "User – product fit", prompt: "Predictable behaviors, needs and goals · How does the product help? · How is it better now?" },
      { id: "context", type: "notes", title: "Context of use", prompt: "With whom? · Where? · When? · How much?" },
      { id: "channels", type: "notes", title: "Channels and influencers", prompt: "Messages · Influencers · Communities" },
      { id: "future", type: "notes", title: "Future use", prompt: "Continued use · Change in use · Change in the user" },
    ],
  },
  persona_profile: {
    name: "User persona (deliverable)",
    description: "Final persona sheet to present: bio, personality, experience, goals, frustrations and technologies.",
    sections: [
      { id: "photo", type: "image" },
      { id: "who", type: "fields", title: "General details", fields: [{ id: "trait", label: "Main trait" }, { id: "name", label: "Name" }, { id: "age", label: "Age" }, { id: "status", label: "Marital status" }, { id: "role", label: "Job title" }, { id: "education", label: "Education" }] },
      { id: "quotes", type: "list", title: "Phrases that identify them" },
      { id: "bio", type: "text", title: "Bio" },
      { id: "personality", type: "chips", title: "Personality" },
      { id: "experience", type: "bars", title: "Experience level" },
      { id: "ideal", type: "chips", title: "Ideal user experience" },
      { id: "goals", type: "list", title: "Goals" },
      { id: "must", type: "list", title: "Must do" },
      { id: "mustnot", type: "list", title: "Must not allow" },
      { id: "frustrations", type: "list", title: "Frustrations" },
      { id: "tech", type: "text", title: "Technologies" },
      { id: "interests", type: "bars", title: "Knowledge and interests" },
    ],
  },
  journey_map: {
    name: "User Journey Map",
    description: "Stages, actions, emotions (the curve draws itself), value, barriers and opportunities.",
    sections: [
      { id: "who", type: "fields", fields: [{ id: "persona", label: "Person" }, { id: "scenario", label: "Scenario" }, { id: "goal", label: "User goal" }] },
      { id: "journey", type: "custom", component: "journey" },
    ],
  },
  affinity: {
    name: "Affinity diagram",
    description: "Group each participant's observations, judgments and values into themes to find patterns.",
    sections: [

    ],
  },
  empathy_map: {
    name: "Empathy Map",
    description: "Dice, Piensa, Hace, Siente + dolores y ganancias del usuario.",
    sections: [
      { id: "who", type: "fields", title: "User or segment", fields: [{ id: "name", label: "Name or segment" }, { id: "scenario", label: "Scenario" }, { id: "goal", label: "Goal" }] },
      { id: "says", type: "notes", title: "Says", prompt: "Direct quotes they said or would say out loud." },
      { id: "thinks", type: "notes", title: "Thinks", prompt: "What they think but don't necessarily say." },
      { id: "does", type: "notes", title: "Does", prompt: "Observed actions and behaviors." },
      { id: "feels", type: "notes", title: "Feels", prompt: "Emotions: fears, anxieties, hopes." },
      { id: "pains", type: "notes", title: "Pains", prompt: "Frustrations, obstacles, risks they face." },
      { id: "gains", type: "notes", title: "Gains", prompt: "What they hope to gain; how they measure success." },
    ],
  },
  stakeholder_map: {
    name: "Stakeholder Map",
    description: "Actors, influence and interest around the product, grouped into quadrants to decide how to relate to each one.",
    sections: [
      { id: "context", type: "fields", fields: [{ id: "project", label: "Project" }, { id: "date", label: "Date", date: "one" }] },
      { id: "manage", type: "notes", title: "High power · High interest — Manage closely", prompt: "Involve them actively; they're key to the project's success." },
      { id: "satisfy", type: "notes", title: "High power · Low interest — Keep satisfied", prompt: "Keep them informed of what matters, without overwhelming them." },
      { id: "inform", type: "notes", title: "Low power · High interest — Keep informed", prompt: "Share progress with them; they can influence others' opinions." },
      { id: "monitor", type: "notes", title: "Low power · Low interest — Monitor", prompt: "Minimal follow-up effort." },
    ],
  },
  scamper: {
    name: "SCAMPER",
    description: "Seven questions (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Rearrange) to generate ideas about a product, service or problem. Each letter is a list; aim for three proposals each.",
    sections: [
      { id: "context", type: "fields", fields: [{ id: "subject", label: "Product, service or problem" }, { id: "date", label: "Date", date: "one" }] },
      { id: "substitute", type: "list", title: "S · Substitute", prompt: "What could you substitute to improve it?" },
      { id: "combine", type: "list", title: "C · Combine", prompt: "What could you combine to create something better?" },
      { id: "adapt", type: "list", title: "A · Adapt", prompt: "What could you adapt and use in a different way?" },
      { id: "modify", type: "list", title: "M · Modify", prompt: "What would happen if you changed it drastically?" },
      { id: "put_to_use", type: "list", title: "P · Put to another use", prompt: "What else could it be used for?" },
      { id: "eliminate", type: "list", title: "E · Eliminate or reduce", prompt: "What could you remove that would really make things better?" },
      { id: "rearrange", type: "list", title: "R · Rearrange", prompt: "How could you change the order or layout of the parts to add value?" },
      { id: "chosen", type: "list", title: "Chosen ideas", prompt: "The proposals you'll take forward, and why." },
    ],
  },
  crazy_eights: {
    name: "Crazy 8s",
    description: "Eight sketches in eight minutes, one per minute, on a sheet folded into eight panels. People draw in the app; each panel also has the idea in a few words.",
    sections: [
      { id: "context", type: "fields", fields: [{ id: "challenge", label: "Challenge" }, { id: "author", label: "Who sketches" }, { id: "date", label: "Date", date: "one" }] },
      { id: "sketch_1", type: "sketch", title: "Sketch 1" },
      { id: "sketch_2", type: "sketch", title: "Sketch 2" },
      { id: "sketch_3", type: "sketch", title: "Sketch 3" },
      { id: "sketch_4", type: "sketch", title: "Sketch 4" },
      { id: "sketch_5", type: "sketch", title: "Sketch 5" },
      { id: "sketch_6", type: "sketch", title: "Sketch 6" },
      { id: "sketch_7", type: "sketch", title: "Sketch 7" },
      { id: "sketch_8", type: "sketch", title: "Sketch 8" },
      { id: "chosen", type: "list", title: "Chosen ideas", prompt: "The proposals you'll take forward, and why." },
    ],
  },
  cognitive_map: {
    name: "Cognitive Mapping",
    description: "Mapa de conceptos y relaciones que muestra cómo el usuario entiende un sistema.",
    sections: [
      { id: "who", type: "fields", fields: [{ id: "participant", label: "Participant or segment" }, { id: "system", label: "System or topic explored" }] },
      { id: "concepts", type: "chips", title: "Concepts", prompt: "The ideas or elements the user mentions." },
      { id: "relations", type: "entries", title: "Relationships between concepts", prompt: "Describe how one concept connects to another and why." },
      { id: "gaps", type: "list", title: "Gaps or confusions found", prompt: "Differences between the user's mental model and the system's real model." },
    ],
  },
  user_flow: {
    name: "User / Task Flow",
    description: "Diagram of a task's steps, decisions and exits.",
    sections: [
      { id: "who", type: "fields", fields: [{ id: "task", label: "Task or flow" }, { id: "entry", label: "Entry point" }] },
      { id: "steps", type: "list", title: "Flow steps" },
      { id: "decisions", type: "list", title: "Decision points", prompt: "Where does the user choose between different paths? What happens in each case?" },
      { id: "exits", type: "list", title: "Exits", prompt: "Where can the user finish, abandon or exit the flow?" },
    ],
  },
  service_blueprint: {
    name: "Service Blueprint",
    description: "Frontstage, backstage, support processes and physical evidence of the service, stage by stage.",
    sections: [
      { id: "who", type: "fields", fields: [{ id: "service", label: "Service" }, { id: "scenario", label: "Scenario" }, { id: "goal", label: "Customer's goal" }] },
      { id: "photo", type: "image", title: "Customer" },
      { id: "persona", type: "text", title: "Customer persona", prompt: "Who is the customer? Their context, what they expect from the service and what worries them." },
      { id: "blueprint", type: "custom", component: "blueprint" },
      { id: "opportunities", type: "notes", title: "Areas of opportunity", prompt: "Pain points, waits, duplicated steps or hand-off failures between lanes worth improving." },
    ],
  },
  jtbd: {
    name: "Jobs To Be Done",
    description: "Job statements, contexto de la \\",
    sections: [
      { id: "who", type: "fields", fields: [{ id: "product", label: "Product or service" }, { id: "segment", label: "User segment" }] },
      { id: "statement", type: "text", title: "Job Statement", prompt: "When [situation], I want to [motivation], so I can [expected outcome]." },
      { id: "push", type: "notes", title: "Push of the situation", prompt: "What about their current situation pushes them to look for something new?" },
      { id: "pull", type: "notes", title: "Pull of the new", prompt: "What attracts them to the new solution?" },
      { id: "anxiety", type: "notes", title: "Anxiety of the new", prompt: "What worries them or holds them back from switching?" },
      { id: "habit", type: "notes", title: "Habit of the present", prompt: "What makes them stick with what they already use?" },
      { id: "triggers", type: "list", title: "Señales de que está por \\" },
      { id: "competing", type: "list", title: "Qué \\", prompt: "Other products, homemade solutions, or doing nothing." },
    ],
  },
  interview_guide: {
    name: "Interview guide & notes",
    description: "Topic list, open questions and a space to capture notes from each interviewee.",
    sections: [
      { id: "topic", type: "fields", title: "Topic list", fields: [{ id: "main", label: "Main topic to explore" }] },
      { id: "subtopics", type: "notes", title: "Sub-themes", prompt: "Break the main topic into 3 to 5 subtopics." },
      { id: "questions", type: "list", title: "Supporting open questions", prompt: "It's not a script: they're conversation starters." },
      { id: "notes", type: "entries", title: "Interview notes", prompt: "Dump all the notes from each interview here: verbatim quotes, behaviors, shortcuts." },
    ],
  },
  aeiou: {
    name: "AEIOU observation",
    description: "Field observation format: Activities, Environments, Interactions, Objects and Users.",
    sections: [
      { id: "meta", type: "fields", title: "Observation session", fields: [{ id: "place", label: "Place" }, { id: "date", label: "Date and time" }, { id: "observer", label: "Observer" }] },
      { id: "aeiou", type: "rowgroups" },
      { id: "photos", type: "gallery", title: "Photos and sketches" },
    ],
  },
  observation: {
    name: "Behavioral observation",
    description: "Observe how people really use a product in field conditions, phase by phase, with times and incidents.",
    sections: [
      { id: "meta", type: "fields", title: "Session details", fields: [{ id: "participant", label: "Participant name / code" }, { id: "context", label: "Area or context" }, { id: "device", label: "Device / medium" }, { id: "time", label: "Time of day" }] },
      { id: "script", type: "text", title: "Introduction script" },
      { id: "phases", type: "rowgroups", title: "Observed real flow", prompt: "Add or rename phases to match your product flow. Use Yes / No rows for quick checks." },
      { id: "photos", type: "gallery", title: "Evidence (photos)" },
    ],
  },
  diary_study: {
    name: "Diary Study",
    description: "Recurring entries from the participant over days or weeks, with the prompts you'll send them and a log of what they report.",
    sections: [
      { id: "setup", type: "fields", title: "Study setup", fields: [{ id: "duration", label: "Duration" }, { id: "frequency", label: "Logging frequency" }, { id: "participants", label: "Participants" }] },
      { id: "prompts", type: "list", title: "Prompts for each entry", prompt: "What you'll ask them or have them log each time." },
      { id: "method", type: "text", title: "How they'll log their entries", prompt: "Photo, voice note, text over WhatsApp, form…" },
      { id: "log", type: "entries", title: "Entry log", prompt: "Capture every entry the participant shares with you here." },
      { id: "patterns", type: "list", title: "Patterns and findings" },
    ],
  },
  usability_script: {
    name: "Usability test script",
    description: "Script for moderated sessions: introduction, warm-up questions, tasks with success criteria and closing.",
    sections: [
      { id: "meta", type: "fields", fields: [{ id: "moderator", label: "Moderator" }, { id: "product", label: "Product" }, { id: "date", label: "Date", date: "one" }] },
      { id: "intro", type: "text", title: "Introduction" },
      { id: "warmup", type: "list", title: "Questions to get to know the user" },
      { id: "before", type: "text", title: "Before starting the tasks" },
      { id: "tasks", type: "entries", title: "Tasks", prompt: "Task scenario and success criteria." },
      { id: "closing", type: "list", title: "Closing questions" },
    ],
  },
  time_study: {
    name: "Time study",
    description: "An observer follows a person through their workday and logs every activity: start, end, bucket and tool. The summary adds up hours by person, activity and tool, with weekly estimates.",
    sections: [
      { id: "meta", type: "fields", fields: [{ id: "org", label: "Team or organization" }, { id: "dates", label: "Dates", date: "many" }, { id: "goal", label: "What we want to learn" }] },
      { id: "study", type: "custom", component: "timestudy" },
      { id: "findings", type: "list", title: "Main findings" },
      { id: "next", type: "list", title: "Recommendations / next steps" },
    ],
  },
  usability_results: {
    name: "Usability test results",
    description: "Tasks × participants matrix with Pass / Partial / Fail and notes. The success rate calculates itself.",
    sections: [
      { id: "meta", type: "fields", fields: [{ id: "project", label: "Project" }, { id: "dates", label: "Dates", date: "many" }, { id: "moderator", label: "Moderator" }] },
      { id: "matrix", type: "custom", component: "usability" },
      { id: "findings", type: "list", title: "Main findings" },
      { id: "next", type: "list", title: "Recommendations / next steps" },
    ],
  },
  heuristic_eval: {
    name: "Heuristic evaluation",
    description: "Weinschenk's psychological heuristics or Nielsen's 10, with several evaluators, 0–4 severity and automatic overall results.",
    sections: [
      { id: "meta", type: "fields", fields: [{ id: "product", label: "Product or flow evaluated" }, { id: "company", label: "Company" }, { id: "date", label: "Date", date: "one" }] },
      { id: "eval", type: "custom", component: "heuristic" },
    ],
  },};

/** Kinds that live in the Architecture section rather than among the research documents. */
export const CANVAS_KINDS = ["diagram", "sitemap", "moodboard"] as const;

/** Every kind create_document takes. Anything else opens as "unknown document type" in the app. */
export const DOCUMENT_KINDS = [...Object.keys(DOC_KINDS), ...CANVAS_KINDS] as string[] as [string, ...string[]];

/** What a section's value in `data` looks like, by section type (and by component for "custom"). Ids are any unique strings. */
export const SECTION_SHAPES: Record<string, string> = {
  text: "a string (line breaks kept)",
  list: "an array of strings, one per bullet",
  chips: "an array of short strings (tags)",
  notes: "an array of sticky notes: [{ id, text }]",
  fields: "an object keyed by the section's field ids: { <field id>: string }. A field with date \"one\" takes one day as YYYY-MM-DD; with date \"many\" it takes days joined by commas, every day of a range listed (\"2026-11-09,2026-11-10,2026-11-11\")",
  bars: "an array of rated items: [{ id, label, value }] with value 0–100",
  entries: "an array of named entries: [{ id, name, body }] (e.g. one per interviewee, one per task)",
  rowgroups: "an array of question groups: [{ id, title, letter?, rows: [{ id, label, kind: \"text\" | \"yesno\", answer: string, yes: boolean | null }] }]",
  image: "an image URL string (leave it out; people add photos in the app)",
  sketch: "{ idea: string, image?: string, strokes?: string[] } — idea is the sketch in a few words; strokes (SVG path data on a 300×200 panel) and image (an uploaded photo) are drawn in the app, so send only idea",
  gallery: "an array of photos: [{ id, url, caption }] (leave it out; people add photos in the app)",
  "custom:journey": "{ stages: [{ id, name, actions: [{ id, text, emotion }], value, barriers, opportunities }] } — emotion is an integer from -2 (very negative) to 2 (very positive); value, barriers and opportunities are strings",
  "custom:blueprint": "{ stages: [{ id, name, evidence, customer, frontstage, backstage, support }], links?: [{ id, from: { stage, lane }, to: { stage, lane } }] } — stage fields are strings, empty when a lane has no step at that stage; a link draws a line from one step to another (stage is a stage id, lane is evidence | customer | frontstage | backstage | support)",
  "custom:affinity": "{ participants: [{ id, name, color }], notes: [{ id, text, type: \"obs\" | \"judgment\" | \"value\", participantId, groupId: string | null }], groups: [{ id, name, conclusion? }], conclusion? } — color is a hex like #fde68a",
  "custom:usability": "{ tasks: [{ id, name, success }], users: [{ id, name, profile }], results: { \"<task id>:<user id>\": { status: \"pass\" | \"partial\" | \"fail\" | \"na\" | null, note } } }",
  "custom:heuristic": "{ framework: \"weinschenk\" | \"nielsen\", product, evaluators: [{ id, name }], answers: {} } — answers are filled in the app; send them empty",
  "custom:timestudy": "an observation log ({ people, workdays, keyLabel, buckets, tools, schedule, rows, rounds }); create it from the app, it is not meant to be written from outside",
};

/** One kind as an assistant needs it: its sections, each with the shape its value takes. */
export function documentReference(kind: string) {
  const k = DOC_KINDS[kind];
  if (!k) return null;
  return {
    kind, name: k.name, description: k.description,
    sections: k.sections.map((s) => ({ ...s, value_shape: SECTION_SHAPES[s.type === "custom" ? `custom:${s.component}` : s.type] })),
  };
}
