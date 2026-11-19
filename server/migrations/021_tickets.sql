-- Tickets: work items inside a project (tasks, bugs, research requests, design changes), with a
-- per-project number, people, labels, links to insights/studies/documents/tickets, an activity
-- history and, for tickets that arrive from the feedback widget, the reporter's details.

create table if not exists milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists milestones_project_name_idx on milestones(project_id, lower(name));

-- One row per project; the row lock taken by the upsert serializes concurrent creations,
-- so two tickets of a project never get the same number.
create table if not exists ticket_counters (
  project_id  uuid primary key references projects(id) on delete cascade,
  last        integer not null default 0
);

create table if not exists tickets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  number        integer not null,
  title         text not null,
  description   text not null default '',
  type          text not null default 'task'   check (type in ('task','bug','research_request','design_change')),
  status        text not null default 'todo'   check (status in ('todo','in_progress','in_review','done')),
  priority      text not null default 'medium' check (priority in ('urgent','high','medium','low')),
  due_date      date,
  milestone_id  uuid references milestones(id) on delete set null,
  position      double precision not null default 0,
  source        text not null default 'manual' check (source in ('manual','insight','widget')),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, number)
);
create index if not exists tickets_board_idx on tickets(project_id, status, position);

create table if not exists ticket_assignees (
  ticket_id  uuid not null references tickets(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  primary key (ticket_id, user_id)
);

-- "Tagged" people: they follow the ticket.
create table if not exists ticket_watchers (
  ticket_id  uuid not null references tickets(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  primary key (ticket_id, user_id)
);

-- Labels are plain text scoped to the project through the ticket.
create table if not exists ticket_labels (
  ticket_id  uuid not null references tickets(id) on delete cascade,
  label      text not null,
  primary key (ticket_id, label)
);

-- A link is stored once, on the ticket; the other side (insight, study, document, ticket) reads it back.
create table if not exists ticket_links (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references tickets(id) on delete cascade,
  target_type  text not null check (target_type in ('insight','study','document','ticket')),
  target_id    uuid not null,
  relation     text not null default 'related',
  created_at   timestamptz not null default now(),
  unique (ticket_id, target_type, target_id)
);
create index if not exists ticket_links_target_idx on ticket_links(target_type, target_id);

create table if not exists ticket_activity (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  actor_id    uuid references users(id) on delete set null,
  action      text not null,
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);
create index if not exists ticket_activity_ticket_idx on ticket_activity(ticket_id, created_at);

-- Who sent a widget ticket. A ticket can hold more than one reporter after a merge.
create table if not exists ticket_reporters (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references tickets(id) on delete cascade,
  ref               text,                         -- the widget's own reference, e.g. FB-1842
  name              text,
  email             text,
  external_user_id  text,
  verified          boolean not null default false,
  first_seen        timestamptz,
  last_seen         timestamptz,
  reports_count     integer not null default 1,
  metadata          jsonb not null default '{}',  -- page_url, page_title, os, browser, window_size, screen_resolution, pixel_ratio, color_depth, language, timezone, approx_location, sent_at
  custom_data       jsonb not null default '{}',
  attachments       jsonb not null default '{}',  -- screenshot, recording, files
  erased_at         timestamptz,                  -- personal data deleted on request
  created_at        timestamptz not null default now()
);
create index if not exists ticket_reporters_ticket_idx on ticket_reporters(ticket_id);

-- Ticket conversation reuses comments: internal notes, emails sent to the reporter and their replies.
alter table comments add column if not exists ticket_id uuid references tickets(id) on delete cascade;
alter table comments add column if not exists visibility text not null default 'internal';
alter table comments add column if not exists author_name text;   -- the reporter's name on a reply_from_reporter
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'comments_visibility_check') then
    alter table comments add constraint comments_visibility_check check (visibility in ('internal','email_to_reporter','reply_from_reporter'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_single_target_check') then
    alter table comments add constraint comments_single_target_check
      check ((study_id is not null)::int + (document_id is not null)::int + (ticket_id is not null)::int <= 1);
  end if;
end $$;
create index if not exists comments_ticket_idx on comments(ticket_id, created_at);
