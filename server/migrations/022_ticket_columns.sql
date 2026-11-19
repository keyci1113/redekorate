-- Board columns a project defines for its tickets. A project without rows here uses the four built-in
-- columns (To do, In progress, In review, Done), exactly as before.
--
-- Every column "counts as" one of the four statuses. tickets.status keeps holding that status, so reports,
-- milestones and My work need no changes; tickets.column_id says which column of the board the ticket sits in.
create table if not exists ticket_columns (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  status     text not null check (status in ('todo','in_progress','in_review','done')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ticket_columns_project_idx on ticket_columns(project_id, position);

alter table tickets add column if not exists column_id uuid references ticket_columns(id) on delete set null;
create index if not exists tickets_column_idx on tickets(project_id, column_id, position);
