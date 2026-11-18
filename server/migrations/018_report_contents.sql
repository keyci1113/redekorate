-- A project report can hold more than studies: research documents and diagrams (document_ids), and
-- project-wide parts (sections): 'overview' (name and description) and 'insights' (every insight in the
-- project, also those not tied to a study).
alter table report_shares add column if not exists document_ids uuid[] not null default '{}';
alter table report_shares add column if not exists sections text[] not null default '{}';
