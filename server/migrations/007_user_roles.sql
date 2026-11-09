-- Roles de instancia: admin (gestiona usuarios e invitaciones) y member (todo lo demás, como hasta ahora).
alter table users add column if not exists role text not null default 'member' check (role in ('admin','member'));
alter table users add column if not exists disabled_at timestamptz;

-- La primera cuenta creada pasa a ser admin si todavía no hay ninguna.
update users set role = 'admin'
 where not exists (select 1 from users where role = 'admin')
   and id = (select id from users order by created_at limit 1);

-- Invitaciones: permiten crear cuenta aunque el registro esté cerrado. Solo se guarda el hash del token.
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null default 'member' check (role in ('admin','member')),
  token_hash  text not null unique,
  invited_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz
);
create index if not exists invites_email_idx on invites(email);
