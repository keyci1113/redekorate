-- Milestones get their own dates (the roadmap draws them), and a project can publish a read-only roadmap link.
alter table milestones add column if not exists start_date date;
alter table milestones add column if not exists due_date date;
alter table projects add column if not exists roadmap_token text unique;
