-- Instance-wide switches kept in the database so they survive restarts and deploys.
-- First one: maintenance mode ({ "on": bool, "message": text, "since": timestamptz, "by": user id }).
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
