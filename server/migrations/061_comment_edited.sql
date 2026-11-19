-- Ticket comments can be edited by their author. edited_at marks a comment as "edited" (null = never edited).
alter table comments add column if not exists edited_at timestamptz;
