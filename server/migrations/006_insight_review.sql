-- Revisión de insights: cuándo y quién marcó un hallazgo como revisado (null = pendiente).
alter table insights add column if not exists reviewed_at timestamptz;
alter table insights add column if not exists reviewed_by uuid references users(id) on delete set null;
create index if not exists insights_pending_idx on insights(project_id) where reviewed_at is null;
