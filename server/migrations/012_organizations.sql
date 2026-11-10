-- Organizations (personal or company workspaces), the commenter project role, and comments.

-- Organizations: anyone can create one; it owns a logo and a color that studies and reports can inherit.
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo       text,                                  -- /uploads/… (raster only, like avatars)
  color      text not null default '#5902A1',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- owner: everything, including deleting the organization. admin: settings and people. member: comments on every project.
create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null check (role in ('owner','admin','member')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_members_user_idx on organization_members(user_id);

-- A project may belong to an organization. Null = personal project, exactly as before.
-- Deleting an organization turns its projects back into personal projects of their owners.
alter table projects add column if not exists organization_id uuid references organizations(id) on delete set null;
create index if not exists projects_org_idx on projects(organization_id);

-- Invitations can also join an organization when the account is created.
alter table invites add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table invites add column if not exists org_role text check (org_role in ('admin','member'));

-- New project role between viewer and editor: reads everything and can leave comments.
alter table project_members drop constraint if exists project_members_role_check;
alter table project_members add constraint project_members_role_check check (role in ('editor','commenter','viewer'));

-- Comments on a project, a study or a document. Exactly one target; deleting the target deletes its comments.
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  study_id    uuid references studies(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  user_id     uuid references users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  check (study_id is null or document_id is null)
);
create index if not exists comments_project_idx on comments(project_id, study_id, document_id);
