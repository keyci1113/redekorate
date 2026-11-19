-- Session recordings: what a participant did on screen during a study (page changes, clicks, scrolling),
-- stored as the recorder's events, compressed, in the order they were sent. Not video.
create table if not exists session_recordings (
  session_id  uuid primary key references sessions(id) on delete cascade,
  study_id    uuid not null references studies(id) on delete cascade,
  events      int not null default 0,
  bytes       int not null default 0,          -- compressed size of all chunks
  first_ts    bigint,                           -- time of the first and last event, in ms since 1970
  last_ts     bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists session_recordings_study_idx on session_recordings(study_id);
create index if not exists session_recordings_created_idx on session_recordings(created_at);

create table if not exists session_recording_chunks (
  session_id  uuid not null references session_recordings(session_id) on delete cascade,
  seq         int not null,
  data        bytea not null,                   -- gzip of a JSON array of events
  primary key (session_id, seq)
);
