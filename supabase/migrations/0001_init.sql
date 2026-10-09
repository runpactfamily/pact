-- Pact — initial schema. Apply in the Supabase SQL editor (or with the
-- Supabase CLI: `supabase db push`). Mirrors src/server/storage/supabase.ts.

create table if not exists users (
  id          text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists runs (
  id            text primary key,
  user_id       text not null references users(id),
  title         text not null,
  job           text not null,
  attachments   jsonb not null default '[]',
  status        text not null check (status in ('queued','running','completed','failed','cancelled')),
  stage         text not null,
  created_at    timestamptz not null,
  started_at    timestamptz,
  completed_at  timestamptz,
  result        jsonb,
  error         jsonb,
  activity      jsonb not null default '[]',
  llm           jsonb
);
create index if not exists runs_user_created on runs (user_id, created_at desc);

create table if not exists run_steps (
  id            text primary key,
  run_id        text not null references runs(id) on delete cascade,
  type          text not null,
  name          text not null,
  status        text not null,
  stage         text not null,
  started_at    timestamptz,
  completed_at  timestamptz,
  input         jsonb,
  output        jsonb,
  error         jsonb,
  position      integer not null default 0
);
create index if not exists run_steps_run on run_steps (run_id);

create table if not exists tool_calls (
  id            text primary key,
  run_id        text not null references runs(id) on delete cascade,
  step_id       text not null references run_steps(id) on delete cascade,
  tool          text not null,
  status        text not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  duration_ms   integer,
  input         jsonb,      -- sanitized, size-bounded
  output        jsonb,      -- metadata only
  error         jsonb
);
create index if not exists tool_calls_run on tool_calls (run_id);

create table if not exists sources (
  id            bigserial primary key,
  run_id        text not null references runs(id) on delete cascade,
  title         text not null,
  url           text,
  provider      text not null,
  kind          text not null,
  retrieved_at  timestamptz not null,
  published_at  text
);
create index if not exists sources_run on sources (run_id);

create table if not exists files (
  id               text primary key,
  user_id          text not null references users(id),
  name             text not null,
  kind             text not null,
  mime             text not null,
  size             integer not null,
  created_at       timestamptz not null,
  extracted        boolean not null default false,
  extraction_error text,
  storage_path     text,      -- "<blob store>:<key>" for the raw bytes
  document         jsonb      -- DocumentRepresentation (text, tables, pages, meta)
);
create index if not exists files_user_created on files (user_id, created_at desc);

create table if not exists artifacts (
  id            text primary key,
  run_id        text not null references runs(id) on delete cascade,
  user_id       text not null references users(id),
  kind          text not null,   -- report | csv | json | document
  name          text not null,
  mime          text not null,
  size          integer,
  storage_path  text,
  created_at    timestamptz not null default now()
);

-- These tables are reached only with the server-side secret key. Keep RLS on
-- so the publishable key cannot read them.
alter table users enable row level security;
alter table runs enable row level security;
alter table run_steps enable row level security;
alter table tool_calls enable row level security;
alter table sources enable row level security;
alter table files enable row level security;
alter table artifacts enable row level security;
