// Aplica el tema guardado antes del primer pintado. Va en un archivo propio porque
// la CSP de producción (script-src 'self') bloquea los scripts en línea.
try {
  var t = localStorage.getItem("rk_theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
