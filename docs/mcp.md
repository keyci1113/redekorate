# MCP server and AI operations

Redekorate is an [MCP](https://modelcontextprotocol.io) server, so AI apps such as Claude, ChatGPT and Cursor can work
in your projects as you: read projects, studies, results, insights and documents; draft, edit, launch and close
studies; write insights and documents; and keep tickets and milestones. They never delete anything.

| | |
|---|---|
| MCP address | `https://<your-redekorate>/mcp` (Streamable HTTP, stateless, `POST` only) |
| Same tools over plain HTTP | `POST /api/v1/tools/<tool>`, described at `/api/v1/tools/openapi.json` |
| Setup | The **Connect AI apps** page (`/connect`): addresses, step-by-step guides, tokens and connected apps |
| Code | `server/src/mcp/server.ts` (endpoint, instructions, annotations), `mcp/tools.ts` (the tools), `mcp/rest.ts` (tools over HTTP) |

For scripts that want plain resources instead of tools, there is the REST API at `/api/v1` ([api.md](api.md)).

## Connecting

| App | How |
|---|---|
| Claude (web, desktop, phone) | *Settings → Connectors → Add custom connector*, paste the MCP address, *Connect*, sign in and approve |
| ChatGPT, as a connector | *Settings → Apps & Connectors → Advanced*, turn on developer mode, *Create* with the MCP address and OAuth |
| ChatGPT, as GPT actions | In the GPT's *Actions*, *Import from URL* with `/api/v1/tools/openapi.json`, then *API key → Bearer* with a token |
| Claude Code | `claude mcp add --transport http redekorate https://<your-redekorate>/mcp --header "Authorization: Bearer rdk_pat_…"` (leave out the header to sign in with OAuth from `/mcp`) |
| Cursor and other clients | In your user file `~/.cursor/mcp.json` (never a project's `.cursor/mcp.json`, which tends to get committed): the address plus an `Authorization: Bearer rdk_pat_…` header |

Apps sign in one of two ways:
- **OAuth 2.1** with dynamic client registration and PKCE (S256). A consent screen names the app and where it sends you
  back. Access tokens last an hour; refresh tokens rotate and last 60 days. Discovery is at
  `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
- **Personal access tokens** from the Connect AI apps page: shown once, 30 days to no expiry, *read and edit* or
  *read only*, revocable at any time.

## Tools

33 tools. A read-only connection is only shown the 16 that read.

| Tool | | What it does |
|---|---|---|
| `whoami` | reads | The account, and its organizations (ids for `create_project`) |
| `list_projects` | reads | Projects you can open with role, category and counts; optionally one category |
| `get_project` | reads | A project with its studies and documents, plus links into the app |
| `get_study` | reads | A study's draft blocks and settings, status and unpublished changes |
| `get_study_results` | reads | Answers grouped by block (up to 500 each) with option labels, session counts and insights; no participant details |
| `list_insights` | reads | A project's insights |
| `get_document` | reads | A document, diagram, sitemap or mood board with its content |
| `study_block_reference`, `diagram_reference`, `document_reference` | reads | How blocks, logic and answers, canvases and document sections are shaped |
| `list_tickets` | reads | One page of a board, filtered by status, column name, label, type, priority, assignee or title text, with columns, people and milestones |
| `get_ticket` | reads | A ticket with comments, activity and links, without widget reporters' details |
| `get_ticket_screenshot` | reads | A feedback widget screenshot as an image (editors and owners only) |
| `list_milestones` | reads | Milestones with dates, state and progress |
| `my_work` | reads | Your tickets across projects |
| `list_versions` | reads | Earlier versions of a study, a document or a ticket's description |
| `create_project`, `update_project` | writes | Create a project; change its name, description, color or category |
| `create_study`, `update_study` | writes | Create a draft; edit it (blocks and settings replace) |
| `set_study_status`, `publish_study_changes` | writes | Launch, close or reopen a study; publish a live study's draft |
| `create_insight`, `update_insight` | writes | Record an insight; edit or review it |
| `create_document`, `update_document` | writes | Create a document; edit its title, language or content (content replaces) |
| `create_ticket` | writes | Create a ticket, in a column by name, with `insight_ids` linked as evidence |
| `update_ticket` | writes | Change any field or move it to a column; a new description replaces the old one |
| `comment_on_ticket` | writes | An internal comment, never emailed to the reporter |
| `link_ticket` | writes | Link a ticket to an insight, study, document or another ticket |
| `create_milestone`, `update_milestone` | writes | Create a milestone; rename it or change its dates |
| `restore_version` | writes | Put an earlier version back |

The Connect AI apps page and `/api/v1/tools/openapi.json` both read this list from `mcp/tools.ts`, so they can't
drift from what apps get.

## How the tools run

Each MCP request builds a fresh server for the token's user. Most tools call the web app's own routes on the same
server (a loopback call with a one-minute session for that user and the header `x-redekorate-client: mcp`). So a tool
can do exactly what the person could do in the app, with the same roles, sections, validation and side effects
(notifications, activity history). The header makes the app treat the call as coming from outside: content is checked
and replaced content is versioned, exactly as for the REST API. `get_ticket_screenshot` calls the tickets service
directly, because it answers an image rather than JSON.

On top of the app's answers, the tools add what helps a model: links into the app (`open_in_app`,
`participant_link`, `edit_in_app`), results grouped by block with option labels, and column names instead of ids.

## Rules

- **Your permissions.** Tools see and change only the projects you can open, with your role and sections in each.
- **No deletes.** No tool deletes, and the loopback client has no `DELETE` method.
- **Replacing content is guarded.** `update_study` (blocks, settings), `update_document` (data) and `update_ticket`
  (description) need `base_updated_at`, the `updated_at` the assistant read; an edit made since then is refused instead
  of overwritten. Emptying content is refused, and every replaced version is saved for `restore_version` (30 per
  item).
- **Asking first.** Tools that replace content or change what participants see (`update_*`, `set_study_status`,
  `publish_study_changes`, `restore_version`) carry `destructiveHint: true`, so clients like Claude ask before
  running them. Creating tools don't. Reading tools carry `readOnlyHint: true`.
- **Outside text is data.** Study answers and tickets with `from_feedback_widget: true` were written by people outside
  the team. Their results carry an `untrusted_content` notice, and the server's instructions tell the assistant never
  to follow requests written inside them.
- **No outside people's data.** Results leave out participant details and contact details typed into answers; tickets
  leave out the widget reporter's name, email, device and custom data and the widget reference.
- **Strict input.** A misspelled argument is refused by name.
- **Errors** reach the app in English.
- **Ending access.** Remove a connected app or revoke a token on the Connect AI apps page. Signing out everywhere,
  changing the password or disabling the account ends every token.
- **Rate limit.** 240 calls a minute per account, shared by `/mcp`, `/api/v1/tools` and `/api/v1` and by all of the
  account's tokens. Calls without a valid token count per address.

## AI operations over HTTP

For apps that don't speak MCP, every tool is also `POST /api/v1/tools/<tool>` with the tool's input as a JSON body.
Same tokens, same strict input, same rules. A read-only token gets `403` on a tool that writes. Tools that write carry
`x-openai-isConsequential: true` in the OpenAPI document, so a GPT asks before running them. `get_ticket_screenshot`
answers `{ mime, data_base64, note }` here.

```sh
curl -X POST https://research.example.com/api/v1/tools/list_tickets \
  -H "Authorization: Bearer rdk_pat_…" -H "Content-Type: application/json" \
  -d '{"project_id": "…", "column": "Needs QA"}'
```
