# redekorate · plataforma de UX Research

Herramienta propia (tipo Maze) para planear, lanzar y analizar investigación de UX: crea un proyecto, elige el método, configúralo, envía el link a participantes reales y comparte un reporte con insights.

## Flujo

1. **Inicio:** un dashboard con estudios activos, respuestas de los últimos 14 días, actividad reciente, borradores e insights.
2. **Proyecto:** al crearlo, pasas directo a elegir el método. Puedes buscarlo, filtrarlo por categoría o partir de tu pregunta ("¿Las personas pueden usar mi diseño?").
3. **Template:** cada método muestra sus bloques, una guía paso a paso, la duración y la muestra recomendada antes de crearlo.
4. **Builder:** reordenas los bloques arrastrando, editas el contenido y la lógica, ves la vista previa en escritorio o móvil, ajustas la marca y pasas una revisión antes de publicar.
5. **Participantes:** un link público, sin cuenta, que funciona en móvil, con consentimiento informado opcional.
6. **Resultados:** análisis automático por método, detalle por participante, exportación a CSV, insights y un reporte público revocable.

## Métodos disponibles

| Categoría | Listos |
|---|---|
| Prototipos | **Prototype Testing** y **Usability Test no moderado**: pantallas subidas + zonas clicables, éxito directo/indirecto, embudo de ruta esperada, rutas más comunes, mapas de calor y clics fuera de zona por pantalla |
| Usabilidad | First Click (mapa de clics y área correcta), Five Second, Preference Test A/B con imágenes, Tree Testing (éxito directo/indirecto y destinos) |
| Arquitectura de información | Card Sorting abierto, cerrado e híbrido (acuerdo por tarjeta, matriz de similitud con clustering, categorías creadas) |
| Generativa | Encuesta, Screener, Priorización de funcionalidades (ranking + matriz) |
| Métricas | SUS (con escala Sauro-Lewis), NPS con lógica para detractores y promotores, CSAT/CES, SEQ, UMUX-Lite |
| Organización | Repositorio de insights, reporte compartible |

**Bloques** (se combinan libremente en un "Estudio en blanco"): Bienvenida, Instrucciones, Agradecimiento, Pregunta abierta, Opción múltiple, Sí/No, Escala (números, estrellas o emojis), Ranking, Matriz, NPS, SUS, Card Sorting, Tree Test, Preference, Five Second, First Click. Todos admiten una imagen opcional.

**Prototipos (Fase 3):**
1. En Figma, selecciona tus frames y usa **Export → PNG 2x**.
2. En el builder, abre **Prototipos** y arrastra todas las pantallas a la vez; el nombre del archivo será el nombre de la pantalla.
3. Dibuja zonas clicables arrastrando sobre cada pantalla y elige a dónde llevan (otra pantalla o "atrás"). Las zonas se pueden mover y redimensionar, y el modo **Probar** te deja navegar el prototipo.
4. En cada tarea eliges la pantalla inicial, la pantalla meta y, si quieres, la ruta esperada.
5. El participante ve la tarea, navega el prototipo en un marco de teléfono o escritorio (a pantalla completa en su celular) y puede marcar "No puedo completarla". Se guardan cada clic con coordenadas, la ruta y los tiempos.

**Prototipos HTML (por ejemplo, hechos con Claude):**
1. Pídele a Claude el prototipo como **un solo archivo .html** y descárgalo (un componente `.jsx` no sirve).
2. En **Prototipos**, crea uno nuevo y usa **Subir HTML**. No hay zonas que dibujar.
3. Navégalo en el editor: cada pantalla que visitas aparece en **Pantallas detectadas**. Se reconocen por el atributo `data-screen="Nombre"`, por el `#` de la URL o por el `<h1>` visible. El editor trae una instrucción lista para copiar y pedirle a Claude que agregue `data-screen`.
4. En la tarea eliges la pantalla meta y, si quieres, la ruta esperada. Sin meta, el participante toca "Terminé la tarea" (es éxito autodeclarado, no se verifica).
5. Se guardan la ruta, los tiempos y cada clic con el texto del elemento. En vez de mapas de calor, los resultados muestran los elementos más tocados por pantalla y los **clics sin respuesta** (en algo que no es interactivo).

> ¿Por qué no basta con pegar el link de Claude? claude.ai no permite que otros sitios muestren sus artifacts dentro de un iframe (`frame-ancestors`), así que el prototipo se sube como archivo. El servidor le agrega un script de seguimiento y lo sirve con CSP `sandbox` (origen opaco): el HTML no puede leer la sesión ni llamar a la API, y solo se puede incrustar desde la app.

> ¿Por qué no se conecta directo con Figma? La Embed API de Figma es gratuita, pero solo envía eventos si el participante tiene sesión iniciada en Figma (confirmado por el soporte de Figma en enero de 2026), y además da los clics relativos a la capa tocada, no a la pantalla. Con pantallas subidas, cualquier participante anónimo funciona y los mapas de calor son precisos.

**Lógica condicional:** reglas en lenguaje natural, por ejemplo "si la respuesta es menor que 7 → ir a…". Funciona con opciones, Sí/No, escalas, NPS, preferencia y acierto/fallo en tree test y first click. Solo se puede saltar hacia adelante, así que nunca se forman ciclos.

## Seguridad y privacidad

**Cuentas de usuarios**
- Las contraseñas se guardan con bcrypt (costo 12). Política: mínimo 10 caracteres, con letras y números, y medidor de fuerza en la interfaz.
- La sesión vive en una cookie `httpOnly`, `SameSite=Lax` y `Secure` en producción, con un JWT HS256 que expira a los 14 días.
- Las sesiones se pueden revocar: cambiar la contraseña, restablecerla o usar "Cerrar sesión en todos los dispositivos" invalida todos los tokens.
- Contra la fuerza bruta: límite de intentos por IP y bloqueo temporal de la cuenta tras 8 fallos. Con un correo inexistente el login tarda lo mismo, para que no se puedan descubrir cuentas.
- Recuperación de contraseña con un token aleatorio de 256 bits. Solo se guarda su hash SHA-256, sirve una vez y vence en 1 hora. La respuesta es la misma exista o no la cuenta.
- La cuenta se puede eliminar confirmando con la contraseña. Se borran en cascada los proyectos, estudios, respuestas e insights.

**Aplicación**
- Protección CSRF: encabezado obligatorio `X-Requested-With` y verificación de `Origin`.
- Encabezados con Helmet: CSP estricta (`script-src 'self'`, `frame-ancestors 'none'`), HSTS, `nosniff` y Referrer-Policy.
- Toda la entrada se valida con zod y todo el SQL va parametrizado. Cada recurso verifica que pertenezca al usuario.
- Imágenes: se valida el formato real del archivo por sus primeros bytes (PNG, JPG, GIF, WEBP; SVG se rechaza porque puede contener scripts). Máximo 10 MB, nombres aleatorios y se sirven con `CSP default-src 'none'`.
- Límites de uso en las rutas públicas, en la creación de sesiones y en las subidas.
- El servidor no arranca en producción sin un `JWT_SECRET` de al menos 32 caracteres. El contenedor corre sin root y la base de datos no se expone.

**Respuestas por voz.** En las preguntas abiertas y en el "¿por qué elegiste esta opción?", el participante puede pulsar *Responder con voz* y hablar en vez de escribir. El navegador transcribe mientras habla, el texto cae en el mismo campo y se puede corregir. El campo le avisa, antes y mientras habla, que su voz no se graba ni se guarda. No se graba ni se guarda audio: solo el texto, igual que una respuesta escrita. Usa el reconocimiento de voz del navegador (Chrome, Edge y Safari); donde no existe, como en Firefox, el campo aparece sin micrófono. Se desactiva por estudio en *Diseño → Permitir responder con voz*.

**Participantes**
- No se guardan su IP ni su user-agent completo, solo el tipo de dispositivo (móvil, tablet o escritorio).
- Consentimiento informado opcional, con un texto editable.
- Solo se aceptan parámetros cortos en la URL (máximo 10). Las respuestas se validan contra los bloques del estudio y tienen un tamaño máximo.
- Los reportes públicos nunca incluyen datos del participante y se pueden revocar.
- Puedes descartar respuestas individuales.

> Los límites de uso se guardan en memoria. Si corres varias instancias detrás de un balanceador, conviene moverlos a Redis.

## Despliegue en tu servidor

```bash
cp .env.example .env        # completa JWT_SECRET, DB_PASSWORD, APP_URL y SMTP
docker compose up -d --build
```

La app escucha en `127.0.0.1:4000`. Ponla detrás de Caddy o Nginx con HTTPS:

```
research.tudominio.com {
  reverse_proxy localhost:4000
}
```

### Despliegue automático (GitHub Actions)

`.github/workflows/deploy.yml` construye y levanta la app en cada push a `main` (o a mano desde la pestaña Actions). Corre en un runner self-hosted instalado en el mismo VPS:

1. En el VPS, instala Docker y agrega el usuario del runner al grupo `docker`.
2. Registra el runner en *Settings → Actions → Runners → New self-hosted runner* (Linux) e instálalo como servicio (`sudo ./svc.sh install && sudo ./svc.sh start`).
3. Crea el secret `ENV_FILE` en *Settings → Secrets and variables → Actions* con el contenido completo de tu `.env`.

No cambies `DB_PASSWORD` después del primer despliegue: PostgreSQL solo la lee al crear el volumen.

Después de crear tu cuenta, cambia `ALLOW_REGISTRATION=false` y reinicia. Las imágenes y la base de datos viven en volúmenes de Docker (`uploads`, `pgdata`); inclúyelos en tus respaldos.

## Desarrollo local

```bash
npm install
createdb redekorate          # usuario/clave por defecto: redekorate/redekorate
npm run dev                  # API :4000 + web :5173
```

Si no configuras SMTP, el enlace de recuperación de contraseña aparece en la consola del servidor.

## Arquitectura

```
server/  Express 5 · PostgreSQL · zod · helmet · express-rate-limit · multer
  migrations/   001 esquema base · 002 seguridad, recuperación y archivos · 003 documentos
  src/routes/   auth · dashboard · projects · studies · insights · documents · uploads · public
  src/lib/i18n.ts  mensajes del servidor en ES/EN (según el header x-lang)
web/     React 19 · Vite · Tailwind 4 · React Router
  src/blocks/   types · registry · Editor · Runner · Results · LogicEditor · logic · validate
  src/templates/catalog.ts   métodos, guías y bloques por defecto
  src/docs/     plantillas llenables (templates.tsx), secciones, journey, afinidad, matriz, heurísticas
  src/lib/i18n.tsx · en.ts   idioma de la interfaz (ES/EN) y diccionario en inglés
```

## Documentos (plantillas llenables)

Cada proyecto tiene una pestaña **Documentos** con 12 plantillas que se llenan ahí mismo. Los documentos nacen vacíos: los ejemplos solo aparecen como texto guía (en gris e itálica) dentro de cada campo y nunca se guardan:
UX Project Blueprint, Proto-persona, Perfil de persona (canvas), User persona (entregable), User Journey Map (la curva de emociones se dibuja sola),
Diagrama de afinidad, Guía y notas de entrevistas, Observación AEIOU, Observación conductual, Guion de prueba de usabilidad,
Resultados de prueba de usabilidad (calcula tasas por tarea y total) y Evaluación heurística (Weinschenk o Nielsen, varios evaluadores, severidad 0–4).
Se guardan solos en su proyecto, se pueden **Guardar como…** (copia con otro nombre en este u otro proyecto) y se **exportan a Word (.docx), PDF, Markdown y CSV** desde el menú Exportar (también en el link público). La exportación se genera en el navegador y solo incluye lo que se llenó, nunca los textos de ejemplo. También se comparten con un link de solo lectura que se puede revocar. Cada documento tiene su propio idioma (ES/EN).

## Idiomas

Toda la interfaz cambia entre **español e inglés** (selector ES/EN en el menú lateral y en el login). Reglas:

- El idioma de la interfaz es por persona y se guarda en el navegador.
- Cada estudio tiene su **idioma del estudio** (Diseño → Idioma): los participantes y el reporte compartido lo ven en ese idioma, sin importar quién lo creó.
- Los bloques nuevos se crean en el idioma del estudio; los documentos, en el idioma del documento.
- Para traducir un texto nuevo: envuélvelo en `t("texto en español")` y agrega la traducción en `web/src/lib/en.ts`. Si falta, se muestra en español.

Para agregar un método nuevo:

1. Agrega el tipo en `blocks/types.ts`.
2. Regístralo en `registry.tsx`.
3. Implementa su editor (`Editor.tsx`), su runner (`Runner.tsx`) y sus resultados (`Results.tsx`).
4. Agrega su template en `catalog.ts`.

## Roadmap

- ✅ **Fase 1:** proyectos, encuestas y métricas, resultados, insights y reportes.
- ✅ **Fase 2:** imágenes, lógica condicional, drag & drop, ranking, matriz, sí/no, card sorting, tree test, preference, five second, first click, marca por estudio, consentimiento, revisión previa, dashboard, gestión de cuenta y seguridad.
- ✅ **Fase 3:** Prototype Testing con pantallas subidas, zonas clicables, rutas esperadas, éxito directo/indirecto, mapas de calor por pantalla y test de usabilidad no moderado.
- **Fase 3.1 (opcional):** barras fijas (header/tab bar) en prototipos, overlays y grabación de pantalla, cámara y micrófono con consentimiento.
- ✅ **Fase 4:** plantillas llenables (personas, journey map, afinidad, entrevistas, AEIOU, observación, guion y resultados de usabilidad, evaluación heurística, UX blueprint), modelo Kano, interfaz bilingüe ES/EN y tipografía Spline Sans en títulos.
- **Fase 5:** sesiones moderadas con grabación y transcripción, diary study, Empathy Map, Service Blueprint, Stakeholder Map y personas ligadas a insights.
- **Fase 6:** Research Plan, panel de participantes, colaboradores por proyecto con roles y 2FA.
