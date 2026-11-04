-- Documentos de investigación (plantillas que se llenan: persona, journey, blueprint, heurística…)
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  owner_id    uuid not null references users(id) on delete cascade,
  kind        text not null,
  title       text not null,
  language    text not null default 'es' check (language in ('es','en')),
  data        jsonb not null default '{}'::jsonb,
  share_token text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists documents_project_idx on documents(project_id);
