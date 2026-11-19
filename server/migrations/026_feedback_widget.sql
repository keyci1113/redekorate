-- Feedback widget: one per project. Other sites load /widget.js with the public key; what people send becomes tickets.
create table if not exists feedback_widgets (
  project_id      uuid primary key references projects(id) on delete cascade,
  public_key      text not null unique,          -- safe to publish; only works from the allowed domains
  secret          text not null,                 -- signs user ids so a host can prove who is signed in; never sent to browsers
  paused          boolean not null default false,
  allowed_domains text[] not null default '{}',
  settings        jsonb not null default '{}',
  seq             integer not null default 0,    -- last reference handed out (FB-<seq>)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
