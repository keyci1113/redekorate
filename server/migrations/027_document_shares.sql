-- Sharing one document with a person, by email, without giving them the project.
-- A share gives view, comment or edit on that document only (diagrams and sitemaps are documents too).
-- It never reaches the rest of the project, never deletes, duplicates or re-shares the document.
-- People without an account get an invitation (the invites table) that turns into a share when they sign up.

create table if not exists document_shares (
  document_id uuid not null references documents(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('viewer','commenter','editor')),
  added_by    uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (document_id, user_id)
);
create index if not exists document_shares_user_idx on document_shares(user_id);

alter table invites add column if not exists document_id uuid references documents(id) on delete cascade;
alter table invites add column if not exists doc_role text check (doc_role in ('viewer','commenter','editor'));
