-- Notifications: what happened to a ticket that someone is on (assigned, tagged, moved, commented).
-- Shown in the app's bell, and emailed once unless the person turned emails off.
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,      -- who is told
  actor_id    uuid references users(id) on delete set null,              -- who did it (null: the feedback widget)
  project_id  uuid not null references projects(id) on delete cascade,
  ticket_id   uuid not null references tickets(id) on delete cascade,
  kind        text not null check (kind in ('assigned','tagged','status','comment')),
  data        jsonb not null default '{}',                                -- from/to for a move, the comment's first words
  lang        text not null default 'es',                                 -- the language the email is written in
  read_at     timestamptz,
  emailed_at  timestamptz,                                                -- set once the email went out (or was skipped)
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
create index if not exists notifications_unsent_idx on notifications(created_at) where emailed_at is null;

alter table users add column if not exists notify_email boolean not null default true;
