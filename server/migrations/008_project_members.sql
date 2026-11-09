-- Colaboradores por proyecto. El dueño sigue siendo projects.owner_id; aquí van los demás con su rol.
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('editor','viewer')),
  added_by   uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members(user_id);
