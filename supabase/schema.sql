-- Supabase schema for downstream-effects-study MVP.
-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists writers (
  id uuid primary key default gen_random_uuid(),
  writer_id text unique not null,
  email text unique not null,
  name text,
  condition text not null check (condition in ('human_only', 'ai_mediated')),
  status text not null default 'not_started' check (status in ('not_started','started','completed')),

  consent_given boolean default false,
  consent_timestamp timestamptz,
  consent_version text,

  program_overview_pdf_url text,
  reflections_json jsonb default '[]'::jsonb,

  task_started_at timestamptz,
  task_ended_at timestamptz,
  task_duration_seconds integer,

  -- Resume support: when a writer starts the writing phase we persist the
  -- generated memo_id and session_id so a refresh/crash returns the same IDs
  -- and the original task_started_at is preserved.
  current_memo_id text,
  current_session_id text,

  survey_answers_json jsonb,
  survey_submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  memo_id text unique not null,
  writer_id text not null,
  condition text not null,
  final_memo_text text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists readers (
  id uuid primary key default gen_random_uuid(),
  reader_id text unique not null,
  email text not null,
  assigned_memo_id text not null,
  assigned_writer_id text not null,
  status text not null default 'not_started' check (status in ('not_started','started','completed')),

  consent_given boolean default false,
  consent_timestamp timestamptz,
  consent_version text,

  immediate_started_at timestamptz,
  reading_started_at timestamptz,
  reading_ended_at timestamptz,
  reading_duration_seconds integer,
  immediate_answers_json jsonb,
  immediate_submitted_at timestamptz,

  delayed_available_from timestamptz,
  delayed_answers_json jsonb,
  delayed_submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists readers_email_idx on readers (email);

create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  writer_id text not null,
  memo_id text not null,
  prompt_text text not null,
  pdf_attached boolean default false,
  ai_response_text text,
  created_at timestamptz not null default now()
);

create table if not exists word_diff_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  writer_id text not null,
  memo_id text not null,
  condition text,

  surface_key text,
  location text,
  target_key text,
  source text check (source in ('human','ai')),

  added_words integer default 0,
  removed_words integer default 0,

  metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists word_diff_logs_writer_idx on word_diff_logs (writer_id);
create index if not exists word_diff_logs_memo_idx on word_diff_logs (memo_id);

-- Idempotent migrations for existing deployments.
alter table writers add column if not exists current_memo_id text;
alter table writers add column if not exists current_session_id text;
