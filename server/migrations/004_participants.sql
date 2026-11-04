-- Panel de participantes: base de reclutamiento por proyecto, independiente de las respuestas anónimas.
create table if not exists participants (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_id   uuid not null references users(id) on delete cascade,
  name       text not null,
  email      text not null default '',
  phone      text not null default '',
  tags       text[] not null default '{}',
  notes      text not null default '',
  consent    boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists participants_project_idx on participants(project_id);

-- Historial de estudios de cada participante (a qué estudios se le invitó y cómo le fue).
create table if not exists participant_studies (
  participant_id uuid not null references participants(id) on delete cascade,
  study_id       uuid not null references studies(id) on delete cascade,
  status         text not null default 'invited' check (status in ('invited','completed','no_show','declined')),
  note           text not null default '',
  created_at     timestamptz not null default now(),
  primary key (participant_id, study_id)
);
create index if not exists participant_studies_study_idx on participant_studies(study_id);
