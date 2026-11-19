-- Email notifications per kind: the kinds a person turned off (assigned, tagged, status, comment).
-- Stored as what is off, so a kind added later is emailed until someone turns it off. notify_email stays the
-- master switch: when it is false nothing is emailed, whatever this holds.
alter table users add column if not exists notify_email_off text[] not null default '{}';
