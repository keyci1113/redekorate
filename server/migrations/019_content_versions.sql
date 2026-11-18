-- Earlier versions of what AI apps (the MCP server) overwrite: a study's blocks and settings, a document's
-- content. Each overwrite saves what was there first, so a bad write can be put back. The last 30 per item are kept.
create table if not exists content_versions (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid references studies(id) on delete cascade,
  document_id  uuid references documents(id) on delete cascade,
  content      jsonb not null,
  saved_by     uuid references users(id) on delete set null,
  reason       text not null default 'overwrite' check (reason in ('overwrite', 'restore')),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(study_id, document_id) = 1)
);
create index if not exists content_versions_study on content_versions(study_id, created_at desc) where study_id is not null;
create index if not exists content_versions_document on content_versions(document_id, created_at desc) where document_id is not null;
