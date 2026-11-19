# Architecture of the server

How the server is put together, and how the web app, the REST API and the MCP server share one set of rules. The
web app itself (React, Vite) is described in the README.

## Layers

```
 web app (session cookie)      REST API /api/v1 (bearer)      MCP /mcp and /api/v1/tools (bearer)
          │                              │                                │
   routes/*.ts  ◄──────────── loopback HTTP call as the user ─────────────┤ (most tools)
          │                              │                                │
          └──────────────►  services/*.ts  ◄──────────────────────────────┘ (get_ticket_screenshot)
                                   │
                    lib/access.ts · lib/contentCheck.ts · lib/versions.ts · lib/db.ts
                                   │
                               PostgreSQL
```

- **`server/src/services/`** holds the business logic for projects, studies, insights, documents, tickets (with the
  board's columns and the widget's reporter data) and milestones, the roadmap and My work. A service function takes
  an `Actor` and plain input, checks access with `lib/access.ts`, validates the input with its own zod schema, does
  the work and returns plain data. It never sees an HTTP request.
- **`server/src/routes/`** are the web app's routes. For the parts above they are one line each: build the actor from
  the request and answer what the service returns. Things only the web app does stay in the routes: sharing (project
  members, report links, a document's people and public link), project comments, organizations, accounts and admin,
  uploads, the feedback widget's settings and the public pages.
- **`server/src/api/v1.ts`** is the public REST API. It calls the services in process.
- **`server/src/mcp/`** is the MCP server and the same tools over HTTP. Most tools call the web app's routes as the
  token's user (see [mcp.md](mcp.md)), which in turn call the services.

## The actor

```ts
interface Actor { id: string; name: string; lang: "es" | "en"; outside: boolean; appUrl: string }
```

- `lang` decides the language of what a call writes for people: a copy's suffix, built-in column names, notification
  emails.
- `outside` is true for the REST API, and for the MCP server's loopback calls (they send
  `x-redekorate-client: mcp`). An outside call:
  - has its study blocks and settings, diagrams and document sections checked (`lib/contentCheck.ts`);
  - can't empty existing content;
  - saves what it replaces as a version (`lib/versions.ts`: study blocks and settings, document data, a ticket's
    description; the last 30 per item);
  - is refused with `409` when it sends a `base_updated_at` older than the item.

  The web app saves while people type, so its own edits are neither checked nor versioned.
- `appUrl` is the address used in links of emails sent after the call (ticket notifications).

`services/actor.ts` builds the actor from a web request (`actorOf`) and holds the shared transaction helper `tx`.

## Errors

Services throw `HttpError(status, message)` with the Spanish message the web app shows, and zod errors for invalid
input. Each door turns them into its own answer:
- the web app translates the message to the request's language (`x-lang`, `lib/i18n.ts`);
- the REST API always answers in English, as `{ error, issues?, … }`;
- the MCP tools pass the English message to the app.

`services/messages.test.ts` reads the services' source and fails if a message has no English translation.

## The REST API

`api/v1.ts` has one list, `OPERATIONS`. Each entry has an id, a method (`get`, `post` or `patch`, never delete), an
OpenAPI-style path, a strict schema for its body or query, and a `run` that calls a service. From that list the
module builds:
- the Express routes, in order: CORS, bearer check (the session cookie is never read), scope check (a read-only
  token can only `GET`), path parameter check (an id that can't exist is a `404`), strict body and query check
  (unknown fields are a `400` naming them), then the service;
- a `405` with `Allow` for a known path with another method, and a `404` for anything else;
- the OpenAPI 3.1 document at `/api/v1/openapi.json`.

The strict schemas only reject what an outside caller must not send (unknown fields, wrong types). They don't add
defaults: the service gets the body as it was sent and applies its own full rules. That is why a `PATCH` changes only
the fields it sends.

Answers go through `services/outside.ts` before they leave:
- `withoutLinkTokens` drops `share_token` and `roadmap_token` everywhere;
- `ticketForOutside` and `ticketRowForOutside` replace widget reporters with a summary, drop the widget reference, add
  `from_feedback_widget` and `screenshot_count`, and show reporter replies as "Reporter";
- `resultsForOutside` drops the participant record and recordings and removes contact details typed into answers.

The MCP tools use the same functions on the app's answers.

## Mounting and limits

In `index.ts`, in this order:
1. `/mcp`: OAuth discovery and the MCP endpoint.
2. `/api/v1/tools`: the MCP tools over HTTP.
3. `/api/v1`: the REST API, then its error handler, so a body that isn't JSON also gets the API's English answer.
4. `/api` with the CSRF guard, and the web app's routes.

`/mcp`, `/api/v1/tools` and `/api/v1` all use the same limiter instance (`mcpLimiter` in `lib/security.ts`). It keys a
valid token by its account, so the three doors share one allowance per account across all of the account's tokens.
Calls without a valid token are counted per address.

## Tests

- `routes/pinned.db.test.ts` pins what the web app's project, study, insight, document, milestone, roadmap and My work
  routes answer. It was written before the logic moved into services and still passes.
- `routes/tickets.db.test.ts`, `roadmap.db.test.ts`, `assistantWrites.db.test.ts` and the others cover the rest of
  the web routes.
- `api/v1.db.test.ts` covers the REST API: tokens, the read-only scope, strict edits, `409`, emptying, versions,
  `405`, what answers leave out and the OpenAPI document.
- `mcp/tools.test.ts` and `mcp/rest.db.test.ts` cover the tools and their annotations.

Database tests need `TEST_DATABASE_URL` pointing at a database whose name ends in `_test`.
