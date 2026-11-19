-- Files of a project ("Documents" tab): PDFs, Word, Markdown and similar, uploaded as they are, like a shared drive.
-- The bytes live on disk under UPLOAD_DIR/.files (never served publicly); this table is the index.
create table if not exists project_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,                      -- the name people see, with its extension
  mime        text not null,
  size        integer not null,
  stored      text not null unique,               -- file name on disk
  uploaded_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists project_files_project_idx on project_files(project_id, created_at desc);
