-- Inicio de sesión con Google y Microsoft (OpenID Connect).
-- Una cuenta puede tener contraseña, una o varias identidades externas, o ambas.
alter table users alter column password_hash drop not null;

create table if not exists user_identities (
  provider      text not null check (provider in ('google','microsoft')),
  subject       text not null,                       -- claim "sub" del proveedor: estable, nunca el correo
  user_id       uuid not null references users(id) on delete cascade,
  email         text,                                -- correo que el proveedor reportó al vincular (informativo)
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  primary key (provider, subject)
);
create index if not exists user_identities_user_idx on user_identities(user_id);
