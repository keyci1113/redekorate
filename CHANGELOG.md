# Changelog

All notable changes to redekorate are documented here. The project does not publish versioned releases yet; entries are grouped by development phase, newest first.

## Unreleased

- **Sign in with Google and Microsoft.** Optional OpenID Connect login (authorization code with PKCE, state and nonce; ID token verified against the provider's keys; migration 014). Buttons appear on the login and invitation pages when a provider is configured in `.env`. The provider's stable subject is stored per user; a verified email that matches an existing account links to it, otherwise an account is created under the same rules as the form (first account is admin, closed registration honors invitations). *My account* lists linked accounts to link or unlink them, lets provider-only accounts create a password, and never removes the last way to sign in. Password-less accounts confirm deletion by typing their email.
- **HTML prototypes.** Upload a single-file HTML prototype (for example one made with Claude). The server injects a tracker and serves it inside a CSP sandbox; screens are detected by `data-screen`, URL hash or visible `h1`; results show most-tapped elements and clicks with no response.
- **Home redesign.** Greeting and "Continue draft" card, day summary from real data, four KPIs with a 14-day chart, live studies table with sorting and a low-completion chip, per-user detail view preference, insights sorted by severity with a review toggle, activity grouped by study, loading/error/empty states.
- **Insight review.** Insights can be marked as reviewed (migration 006), with a pending filter.
- **Participant panel.** Per-project recruiting base with contact, tags, consent and study history (migration 004).
- **Project reports.** A shared report can combine several studies of a project (migration 005).
- **PDF reports**, colored KPIs and layout polish.
- Official Redekorate logos.
- Test-data seed (`npm run seed:test`) and upload proxying in development.
- **Performance.** Gzip/Brotli compression on every response, one-year immutable caching for hashed assets with `no-cache` on `index.html`, one JS chunk per route (the participant runner no longer downloads the builder, results or document templates; main entry 920 KB → 416 KB raw, 138 KB gzipped) and the dashboard's eight queries run in parallel.
- **Profile photos.** Upload one from My account (optimized in the browser like any image); shown in the header menu, Users and project collaborators (migration 009).
- **Users and roles.** Admin and member roles (migration 007); the first account becomes admin. Admins invite people by email with a 7-day link that bypasses closed sign-up, change roles, and disable or reactivate accounts (disabling revokes sessions). Guards keep at least one active admin.
- **Project collaborators.** Owners add existing accounts to a project as editor or read-only (migration 008). Every project, study, document, insight and participant route now checks membership and role; viewers are redirected from the builder, get read-only documents and results, and see no create, edit, delete or share controls anywhere in a project; the dashboard includes shared projects.
- **Draft vs. published.** Live studies keep a published snapshot (migration 010): the builder edits a draft, participants see the published version, and "Publish changes" pushes the draft explicitly. Sessions record the version they started with and answers validate against the published blocks.
- **Prototype flow.** HTML prototypes carry a start screen, goal screen, ordered path, required interactions (recorded from the preview or typed, e.g. "tap the Order Checklist tab"; any can be the goal) and participant instructions, marked in the detected-screens list; tasks take the flow as defaults, with a one-click "use the prototype's flow" when it changes. The link and HTML panels can also drop the current source and go back to the chooser, or delete the prototype.
- **Prototype by link.** Paste a published prototype URL (Figma Make, any live site). The server validates it, refuses private hosts, and reports whether the site allows embedding; the task shows it in an iframe and records time and self-reported outcome.
- **Neutral dark mode.** Dark backgrounds, borders and secondary text are now grays instead of purple tints; the accent stays purple. Input borders reach a 3:1 boundary contrast in dark mode.
- **PDF reports** no longer open with a solid purple title block; the title is set in plain type.
- **Client-side image optimization.** Block, branding and prototype images are resized (max 2048 px) and re-encoded as WebP in the browser before upload; GIFs untouched; the original is kept when re-encoding does not shrink it.
- Open-source preparation: English README, contributing guide, code of conduct, security policy, issue and PR templates, CI workflow, AGPL-3.0 license.

## Phase 4

- Fillable document templates per project: personas, journey map, affinity, interviews, AEIOU, observation, usability script and results, heuristic evaluation and UX blueprint. Documents start empty, with examples as placeholder text.
- "Save as…" (copy into this or another project) and export to Word, PDF, Markdown and CSV.
- Kano model.
- Bilingual interface, Spanish / English.
- Spline Sans for headings.

## Phase 3

- Prototype Testing with uploaded screens, clickable zones, paths, direct/indirect success and heatmaps.

## Phase 2

- Purple palette, login and dashboard, research types with images, conditional logic, card sorting, tree test, preference, five second and first click. Security hardening.

## Phase 1

- Projects, block-based studies, participant links, results, insights and shareable reports.
