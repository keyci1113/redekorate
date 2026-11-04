-- Redekorate · esquema inicial
create extension if not exists pgcrypto;

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users(id) on delete cascade,
  name        text not null,
  description text not null default '',
  color       text not null default '#7C3AED',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_owner_idx on projects(owner_id);

-- Un estudio = una secuencia de bloques (como Maze).
-- method: clave del template (survey, sus, card_sort_open, prototype_test, ...)
create table if not exists studies (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  owner_id     uuid not null references users(id) on delete cascade,
  title        text not null,
  method       text not null,
  status       text not null default 'draft' check (status in ('draft','live','closed')),
  blocks       jsonb not null default '[]'::jsonb,
  settings     jsonb not null default '{}'::jsonb,
  public_slug  text not null unique,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists studies_project_idx on studies(project_id);

-- Una sesión = un participante respondiendo un estudio.
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references studies(id) on delete cascade,
  participant  jsonb not null default '{}'::jsonb,
  user_agent   text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists sessions_study_idx on sessions(study_id);

create table if not exists answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  study_id    uuid not null references studies(id) on delete cascade,
  block_id    text not null,
  value       jsonb not null,
  duration_ms integer,
  created_at  timestamptz not null default now(),
  unique (session_id, block_id)
);
create index if not exists answers_study_idx on answers(study_id);

-- Repositorio de insights (por proyecto, opcionalmente ligado a un estudio).
create table if not exists insights (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  study_id    uuid references studies(id) on delete set null,
  created_by  uuid not null references users(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  tags        text[] not null default '{}',
  severity    text not null default 'medium' check (severity in ('low','medium','high','critical')),
  confidence  text not null default 'medium' check (confidence in ('low','medium','high')),
  evidence    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists insights_project_idx on insights(project_id);
create index if not exists insights_study_idx on insights(study_id);

-- Links públicos de reporte (solo lectura).
create table if not exists report_shares (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references studies(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
