-- "Mention grants view": a person who can open the project but not its Tickets section, and is @mentioned in a
-- ticket comment, can read that one ticket (read-only). Checked only after project access, so it never lets
-- anyone into a project they can no longer open.
create table if not exists ticket_mention_access (
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  granted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index if not exists ticket_mention_access_user_idx on ticket_mention_access(user_id);
