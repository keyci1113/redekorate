-- Outside access through the MCP server (/mcp).
-- Two ways in, both acting as one user and limited to what the MCP tools expose:
--   * personal access tokens, made on the Account page (Claude Code, Claude Desktop, scripts)
--   * OAuth 2.1 sign-in, for connectors such as Claude.ai and ChatGPT
-- Only SHA-256 hashes of tokens and codes are stored.

-- Apps that registered themselves (OAuth dynamic client registration). Public clients: no secret, PKCE only.
create table if not exists oauth_clients (
  id            text primary key,
  name          text not null,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

-- One row per app a user allowed. Holds the current refresh token; revoking it cuts the app off.
create table if not exists oauth_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  client_id    text not null references oauth_clients(id) on delete cascade,
  refresh_hash text unique,
  refresh_expires_at timestamptz,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists oauth_grants_user_idx on oauth_grants(user_id);

-- Short-lived, single-use authorization codes.
create table if not exists oauth_codes (
  code_hash      text primary key,
  client_id      text not null references oauth_clients(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz
);

-- Bearer tokens for /mcp: personal access tokens (grant_id null, no expiry unless set)
-- and OAuth access tokens (grant_id set, expire after an hour).
create table if not exists api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  grant_id     uuid references oauth_grants(id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  hint         text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_tokens_user_idx on api_tokens(user_id);
