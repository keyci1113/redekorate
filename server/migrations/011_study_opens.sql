-- Último estudio que abrió cada persona (builder o resultados), para retomarlo desde el inicio.
create table if not exists study_opens (
  user_id   uuid not null references users(id) on delete cascade,
  study_id  uuid not null references studies(id) on delete cascade,
  opened_at timestamptz not null default now(),
  where_    text not null default 'edit' check (where_ in ('edit','results')),
  primary key (user_id, study_id)
);
create index if not exists study_opens_user_idx on study_opens(user_id, opened_at desc);
