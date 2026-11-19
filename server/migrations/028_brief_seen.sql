-- Daily brief: when the person last opened it. "What's new" counts from here (capped at 7 days back),
-- and the sun button in the header shows a dot while something newer exists. Null: never opened (the last 24 hours).
alter table users add column if not exists brief_seen_at timestamptz;
-- "New responses since" reads completed sessions by time across every study the person can open.
create index if not exists sessions_completed_idx on sessions(completed_at) where completed_at is not null;
