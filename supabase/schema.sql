-- Aegis database schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)

create table if not exists missions (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null,
  status text not null default 'pending', -- pending | running | approved | rejected | completed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists council_decisions (
  id bigint generated always as identity primary key,
  mission_id bigint references missions(id) on delete cascade,
  role_id text not null,
  response text not null,
  confidence text not null check (confidence in ('high','medium','low','unknown')),
  score int not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id bigint generated always as identity primary key,
  mission_id bigint references missions(id) on delete cascade,
  approved boolean not null,
  average_score numeric not null,
  threshold numeric not null,
  reasoning text,
  created_at timestamptz not null default now()
);

create table if not exists versions (
  id bigint generated always as identity primary key,
  mission_id bigint references missions(id) on delete set null,
  content text not null,
  is_latest boolean not null default false,
  is_last_stable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists content_queue (
  id bigint generated always as identity primary key,
  content_type text not null, -- e.g. 'video_script', 'social_post', 'site_update'
  content text not null,
  status text not null default 'pending_review', -- pending_review | approved | rejected | published
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists violations (
  id bigint generated always as identity primary key,
  role_id text not null,
  category text not null,
  description text not null,
  severity text not null default 'warning', -- warning | suspension
  created_at timestamptz not null default now()
);

create table if not exists budget_tracker (
  id bigint generated always as identity primary key,
  period text not null unique, -- e.g. '2026-07'
  limit_usd numeric not null,
  spent_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpful index for fetching the next pending mission quickly
create index if not exists idx_missions_status on missions(status);
create index if not exists idx_versions_latest on versions(is_latest) where is_latest = true;
create index if not exists idx_versions_stable on versions(is_last_stable) where is_last_stable = true;
