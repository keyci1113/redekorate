# Security Policy

redekorate stores research data from real participants, so we take reports seriously and appreciate the time it takes to send one.

## Supported versions

redekorate does not publish versioned releases yet. Only the `main` branch is supported; please reproduce the issue against the latest commit before reporting.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting: go to the repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

Include as much of the following as you can:

- The component involved (API route, participant link, uploads, prototypes, documents, auth) and the commit you tested.
- Steps to reproduce, or a proof of concept.
- The impact as you understand it: what an attacker gains, and whether it requires an account.

You can expect:

- An acknowledgement within **5 days**.
- An assessment and a planned fix date within **14 days** of acknowledgement.
- Credit in the changelog when the fix lands, unless you prefer to stay anonymous.

Please give us a reasonable window to ship a fix before disclosing publicly.

## Scope

In scope: anything in this repository, including the server, the web app, the Docker image and the deploy workflow.

Out of scope: vulnerabilities in third-party dependencies that are already public (please report those upstream, then open an issue here so we can bump the version), and findings that require a compromised server or database.

## Security measures in place

This is what the application already does, so you know what is intended behavior and where to look for gaps.

**Accounts**
- Passwords are hashed with bcrypt (cost 12). Policy: at least 10 characters with letters and numbers.
- Sessions are an `httpOnly`, `SameSite=Lax` cookie, `Secure` in production, carrying an HS256 JWT that expires after 14 days.
- Changing or resetting the password, or using "Sign out everywhere", revokes all existing sessions.
- Login is rate-limited per IP and the account locks temporarily after 8 failures. Unknown emails take the same time to respond, so accounts cannot be enumerated.
- Password reset uses a random 256-bit token. Only its SHA-256 hash is stored, it is single-use and expires in 1 hour. The response is identical whether or not the account exists.
- Deleting an account requires the password and cascades to projects, studies, responses and insights.

**Application**
- CSRF protection: a required `X-Requested-With` header plus `Origin` verification.
- Helmet headers: strict CSP (`script-src 'self'`, `frame-ancestors 'none'`), HSTS, `nosniff`, Referrer-Policy.
- All input is validated with zod and all SQL is parameterized. Every resource route checks ownership.
- Image uploads are validated by magic bytes (PNG, JPG, GIF, WEBP; SVG is rejected because it can carry scripts), capped at 10 MB, stored under random names and served with `CSP default-src 'none'`.
- HTML prototypes are served with a `sandbox` CSP (opaque origin), so they cannot read the session or call the API, and can only be framed by the app itself.
- Rate limits on public routes, session creation and uploads.
- The server refuses to start in production without a `JWT_SECRET` of at least 32 characters. The container runs as a non-root user and the database is not exposed outside the Docker network.

**Participants**
- IP addresses and full user agents are never stored; only the device class (mobile, tablet, desktop).
- Optional informed consent with editable text.
- Only short URL parameters are accepted (at most 10). Responses are validated against the study's blocks and size-capped.
- Public reports never include participant data and can be revoked.

**Known limitation**: rate limits are kept in process memory. Running several instances behind a load balancer needs a shared store such as Redis.
