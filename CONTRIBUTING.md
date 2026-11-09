# Contributing to redekorate

Thanks for your interest in redekorate. This guide covers how to set up a development environment, the conventions the codebase follows, and how to get a change merged.

Everything in this repository is written in **English**: code, comments, commit messages, issues, pull requests and docs. The product UI is bilingual (Spanish / English) and that is handled through the i18n layer described below.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Ways to contribute

- **Report a bug** or **request a feature** with the issue templates. Search existing issues first.
- **Improve the docs**: typos, unclear steps, missing screenshots.
- **Add translations** for untranslated UI strings (see [Internationalization](#internationalization)).
- **Add or improve a research method** (see [Adding a research method](#adding-a-research-method)).
- **Fix a bug** or pick up an issue labeled `good first issue` or `help wanted`.

For anything larger than a bug fix, open an issue first so we can agree on the approach before you invest time in it.

## Development setup

### Requirements

- Node.js 22 or newer (the Docker image uses Node 22)
- PostgreSQL 14 or newer running locally
- Python 3 (only for the optional test-data seed)

### Install and run

```bash
git clone https://github.com/keyci1113/redekorate.git
cd redekorate
npm install
createdb redekorate        # default credentials: redekorate / redekorate
npm run dev                # API on :4000, web on :5173
```

The server applies pending SQL migrations from `server/migrations/` on every start, so there is no separate migrate step for local development. If your PostgreSQL user is not `redekorate`, point `DATABASE_URL` at your database before starting.

Without SMTP configured, password-reset links are printed to the server console instead of being emailed.

### Optional: test data

```bash
npm run seed:test
```

This creates `[Test] …` projects for the first user in the database, with studies for every method, simulated responses, insights, participants, shared reports and filled-in documents. It is idempotent: running it again replaces the previous `[Test]` data.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start API and web dev servers together |
| `npm run build` | Type-check and build the web app, then compile the server |
| `npm test -w web` | Run the web unit tests (Vitest) |
| `npm run migrate` | Apply pending migrations without starting the server |
| `docker compose up -d --build` | Run the production image locally (needs a `.env`) |

## Project layout

```
server/   Express 5 · PostgreSQL · zod · helmet · express-rate-limit · multer
  migrations/   numbered SQL files, applied in order and recorded in schema_migrations
  src/routes/   auth · dashboard · projects · studies · insights · participants · documents · uploads · public
  src/lib/      auth · db · http · i18n (server messages, ES/EN) · mail · protoTracker · security
web/      React 19 · Vite · Tailwind 4 · React Router
  src/blocks/      block types, registry, Editor, Runner, Results, LogicEditor, logic, validate
  src/templates/   research-method catalog: guides, defaults and default blocks
  src/docs/        fillable document templates (templates.tsx) and their renderers
  src/lib/         i18n (UI language) · en.ts (English dictionary) · helpers
  src/pages/       routed screens
scripts/seed/      test-data seed (Python image generator + TypeScript seeder)
```

## Conventions

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(web): add Kano model results
fix(server): reject SVG uploads by magic bytes, not extension
docs: explain how HTML prototypes are sandboxed
chore: bump vite
```

Scopes in use: `web`, `server`, `prototypes`, `docs`, `ci`, `seed`. Keep the subject line under 72 characters and write it in the imperative.

### Branches and pull requests

1. Fork the repository and create a branch from `main`: `feat/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
2. Keep the PR focused on one change. Separate refactors from behavior changes.
3. Make sure `npm run build` and `npm test -w web` pass. The build type-checks both workspaces.
4. Fill in the pull request template. Screenshots or a short recording help a lot for UI changes.
5. A maintainer reviews the PR. Expect questions; small follow-up commits are fine, we squash on merge.

Pushing to `main` triggers the production deploy workflow, so `main` is protected and only maintainers merge.

### Code style

- TypeScript everywhere, strict mode. No `any` unless there is a comment explaining why.
- Validate every request body and query with **zod** in the route. Never interpolate values into SQL; use parameters.
- Every resource route must check that the record belongs to the authenticated user.
- Tailwind utility classes for styling. Reuse the components in `web/src/components/` before adding new ones.
- Prefer small pure functions in `web/src/blocks/logic.ts` and `validate.ts` and cover them with Vitest tests.
- No new runtime dependencies without discussing it in the issue first.

### Internationalization

The UI is Spanish-first with an English dictionary.

- Wrap every user-visible string in `t("texto en español")` and add its translation to `web/src/lib/en.ts`. A missing key falls back to Spanish, so a missing translation is a bug, not a crash.
- Server messages go through `server/src/lib/i18n.ts` and follow the `x-lang` header.
- Studies carry their own language (Design → Language) and documents carry theirs. Do not read the UI language inside a participant-facing component; use the study language.

### Adding a research method

1. Add the block type to `web/src/blocks/types.ts`.
2. Register it in `web/src/blocks/registry.tsx`.
3. Implement its editor (`Editor.tsx`), participant runner (`Runner.tsx`) and results view (`Results.tsx`).
4. If it supports conditional logic, add its outcomes to `logic.ts` and `LogicEditor.tsx`.
5. Add a template to `web/src/templates/catalog.ts` with the guide, recommended duration and sample size.
6. Add the English strings to `en.ts`.
7. Extend the seed in `scripts/seed/seed-test.mts` so the method has sample data.

### Adding a fillable document template

Templates live in `web/src/docs/templates.tsx`. Each one declares its `kind`, name, category and sections. Documents are created empty; examples appear only as placeholder text and are never saved or exported, so keep guidance in the placeholder fields, not in default values.

### Database migrations

- Add a new numbered file in `server/migrations/` (`007_short_name.sql`). Never edit an applied migration.
- Migrations run inside a transaction and are recorded by filename in `schema_migrations`.
- Use `create table if not exists` and `add column if not exists` so a migration can be re-run safely on a dev database.

## Security issues

Do not open a public issue for a vulnerability. Follow the process in [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [GNU Affero General Public License v3.0](LICENSE), the same license as the project.
