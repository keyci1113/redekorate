-- Earlier versions of a ticket's description, next to those of studies and documents (019_content_versions).
-- Each row still belongs to exactly one item, so the unnamed check from 019 is replaced by one that counts tickets too.
alter table content_versions add column if not exists ticket_id uuid references tickets(id) on delete cascade;
alter table content_versions drop constraint if exists content_versions_check;
alter table content_versions drop constraint if exists content_versions_one_item_check;
alter table content_versions add constraint content_versions_one_item_check check (num_nonnulls(study_id, document_id, ticket_id) = 1);
create index if not exists content_versions_ticket on content_versions(ticket_id, created_at desc) where ticket_id is not null;
