-- Reportes de proyecto: un link que combina los resultados de varios estudios elegidos a mano.
alter table report_shares alter column study_id drop not null;
alter table report_shares add column if not exists project_id uuid references projects(id) on delete cascade;
alter table report_shares add column if not exists study_ids uuid[] not null default '{}';
create index if not exists report_shares_project_idx on report_shares(project_id);
