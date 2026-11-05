# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuario principal:** diseñadores UX/UI. Es un público exigente con la interfaz: la herramienta debe ser completamente fácil de usar.

**Hoy:** la persona dueña del proyecto y su equipo usan redekorate como herramienta interna para planear, lanzar y analizar investigación de UX.

**Más adelante:** se abrirá a otras personas, que crearán sus propias cuentas. Todavía no está definido a quién se dirigirá exactamente ni cuándo se abrirá.

**Audiencias que no tienen cuenta:**
- **Participantes:** responden estudios desde un link público, muchas veces en el celular y sin conocer la herramienta.
- **Lectores de reportes:** clientes o directivos que reciben un reporte o documento por link de solo lectura.

## Product Purpose

Permite crear un proyecto, elegir un método de investigación, configurarlo, enviar el link a participantes reales y compartir un reporte con insights. El éxito es que una investigación pase de la pregunta a una decisión informada sin saltar entre varias herramientas.

## Positioning

- **Todo en un solo lugar:** estudios, resultados, insights y documentos de investigación (personas, journey maps, evaluaciones heurísticas, etc.) viven juntos, organizados por proyecto.
- **Datos bajo tu control:** hoy se aloja en un servidor propio y no guarda la IP ni el user-agent completo de los participantes.
- **Sin costo por uso:** sin suscripción ni límites por asiento o por número de respuestas.

## Operating Context

Flujo principal: inicio → proyecto → método o template → builder → link para participantes → resultados → insights y reporte compartible.

Se despliega con Docker en un VPS. El registro se puede cerrar con `ALLOW_REGISTRATION=false`.

## Capabilities and Constraints

**Vocabulario:** proyecto, estudio, método, bloque, participante, respuesta, insight, reporte, documento.

**Métodos:** Prototype Testing, Usability Test no moderado, First Click, Five Second, Preference Test, Tree Testing, Card Sorting, encuestas, Screener, priorización de funcionalidades, modelo Kano, SUS, NPS, CSAT/CES, SEQ y UMUX-Lite.

**Documentos:** plantillas llenables por proyecto. Nacen vacías, los ejemplos son solo texto guía y nunca se guardan ni se exportan. Se exportan a Word, PDF, Markdown y CSV.

**Restricciones que el trabajo futuro debe respetar:**
- Los prototipos usan pantallas subidas, no una conexión directa con Figma. La Embed API solo envía eventos si el participante tiene sesión en Figma, y los clics llegan relativos a la capa tocada.
- La lógica condicional solo salta hacia adelante, para que nunca se formen ciclos.
- Los reportes públicos nunca incluyen datos del participante y se pueden revocar.

**Decisiones abiertas:**
- Cómo se alojará la versión pública, y qué significará "datos bajo tu control" si no la aloja cada persona.
- Cómo se sostendrá la versión pública, y si "sin costo por uso" seguirá aplicando a terceros.

## Brand Commitments

- El nombre se escribe `redekorate`, en minúscula, en el README y en el texto corrido. El título de la app usa `Redekorate`.
- Existe un logo en el código (`web/src/components/Logo.tsx`) y un favicon (`web/public/favicon.svg`).

## Evidence on Hand

El repositorio no contiene clientes, testimonios, benchmarks, precios ni casos de estudio reales. No se deben inventar.

Las cifras de las tarjetas del login (por ejemplo, "SUS · 78.5" o "NPS · +42") son ilustrativas. No deben presentarse como resultados reales.

## Product Principles

1. **Del dato a la decisión:** cada pantalla debe acercar a una conclusión accionable, no solo mostrar datos.
2. **Cero fricción para quien responde:** un participante entra por un link, sin cuenta y desde cualquier dispositivo. Nada debe interponerse entre esa persona y el estudio.
3. **Lo compartido debe poder presentarse:** un reporte o documento público se debe poder enviar tal cual a un cliente o directivo.
4. **La privacidad no es opcional:** se recolecta solo lo necesario, y lo que se comparte se puede revocar.
5. **Pensar en la apertura sin aparentarla:** las decisiones de hoy no deben cerrar la versión pública, pero la interfaz no debe prometer lo que aún no existe.

## Accessibility & Inclusion

- **WCAG AA es el mínimo**, al menos en todo lo que ven los participantes. Es un objetivo: el cumplimiento actual no se ha auditado.
- **Bilingüe ES/EN:** todo texto nuevo debe existir en español y en inglés (`t()` y `web/src/lib/en.ts`). Cada estudio y documento conserva su propio idioma, sin importar el idioma de quien lo creó.
- **Móvil:** todo el recorrido del participante debe funcionar bien en un celular.
