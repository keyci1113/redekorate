-- Sesiones revocables, auditoría mínima, recuperación de contraseña y archivos subidos
alter table users add column if not exists token_version integer not null default 0;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists failed_logins integer not null default 0;
alter table users add column if not exists locked_until timestamptz;

create table if not exists password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,          -- solo guardamos el hash SHA-256 del token
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists uploads (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references users(id) on delete cascade,
  filename   text not null unique,
  mime       text not null,
  size       integer not null,
  created_at timestamptz not null default now()
);
create index if not exists uploads_owner_idx on uploads(owner_id);

-- Ya no guardamos el user-agent completo del participante: solo el tipo de dispositivo
alter table sessions add column if not exists device text;
update sessions set user_agent = null;
