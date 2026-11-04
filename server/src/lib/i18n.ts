// Mensajes del servidor en inglés (el cliente envía x-lang: en|es)
const EN: Record<string, string> = {
  "Agrega al menos un bloque antes de publicar": "Add at least one block before publishing",
  "Bloque inválido": "Invalid block",
  "Contenido demasiado grande": "Content too large",
  "Contraseña incorrecta": "Incorrect password",
  "Correo o contraseña incorrectos": "Incorrect email or password",
  "Cuenta bloqueada temporalmente por varios intentos fallidos. Inténtalo en unos minutos.": "Account temporarily locked after several failed attempts. Try again in a few minutes.",
  "Datos inválidos": "Invalid data",
  "El enlace no es válido o ya expiró. Solicita uno nuevo.": "This link is invalid or has expired. Request a new one.",
  "El estudio no pertenece a este proyecto": "The study does not belong to this project",
  "El registro está cerrado. Pide acceso a la administradora.": "Sign-up is closed. Ask the administrator for access.",
  "Error interno del servidor": "Internal server error",
  "Este estudio no está recibiendo respuestas": "This study is not accepting responses",
  "Este estudio ya no recibe respuestas": "This study no longer accepts responses",
  "Formato no permitido. Usa PNG, JPG, GIF o WEBP.": "Format not allowed. Use PNG, JPG, GIF or WEBP.",
  "JSON inválido": "Invalid JSON",
  "La contraseña actual no es correcta": "Your current password is incorrect",
  "La contraseña debe combinar letras y números": "Password must combine letters and numbers",
  "La contraseña debe tener al menos 10 caracteres": "Password must be at least 10 characters",
  "La contraseña es demasiado simple": "Password is too simple",
  "La sesión ya fue completada": "This session is already completed",
  "No autenticado": "Not authenticated",
  "No se recibió ningún archivo": "No file received",
  "Origen no permitido": "Origin not allowed",
  "Recurso no encontrado": "Resource not found",
  "Respuesta demasiado grande": "Response too large",
  "Ruta no encontrada": "Route not found",
  "Solicitud no permitida": "Request not allowed",
  "Ya existe una cuenta con ese correo": "An account with that email already exists",
  "Estudio no encontrado": "Study not found",
  "Proyecto no encontrado": "Project not found",
  "Insight no encontrado": "Insight not found",
  "Reporte no encontrado": "Report not found",
  "Sesión no encontrado": "Session not found",
  "Documento no encontrado": "Document not found",
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.": "Too many attempts. Wait a few minutes and try again.",
  "Demasiadas solicitudes de recuperación. Inténtalo más tarde.": "Too many recovery requests. Try again later.",
  "Demasiadas solicitudes. Espera un momento.": "Too many requests. Please wait a moment.",
  "Límite de participaciones alcanzado desde esta red.": "Participation limit reached from this network.",
  "Demasiadas subidas. Espera un momento.": "Too many uploads. Please wait a moment.",
};
export function translate(msg: string, lang: string | undefined): string {
  if (lang !== "en") return msg;
  if (EN[msg]) return EN[msg];
  const m = msg.match(/^La imagen supera (\d+) MB$/);
  if (m) return `Image exceeds ${m[1]} MB`;
  return msg;
}
