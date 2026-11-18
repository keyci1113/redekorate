-- What kind of work a project holds, so the platform reads as more than UX research.
-- Existing projects were all UX research, so they start there.
alter table projects add column if not exists category text not null default 'ux_research';
alter table projects drop constraint if exists projects_category_check;
alter table projects add constraint projects_category_check
  check (category in ('ux_research', 'software', 'ai', 'automation', 'it', 'design', 'other'));
