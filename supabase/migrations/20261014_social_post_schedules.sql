-- One Way | Social Media Scheduler | migration 001
-- Safe additive migration: no changes to existing clients, reports or demands.
create extension if not exists pgcrypto;

create table if not exists public.social_post_schedules (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null,
  instagram_account_ref text,
  media_path text,
  media_mime_type text,
  caption text not null default '',
  scheduled_at timestamptz,
  timezone text not null default 'America/Cuiaba',
  approved_by text,
  approved_at timestamptz,
  approved_content_hash text,
  status text not null default 'draft'
    check (status in ('draft','awaiting_approval','approved','scheduled','publishing','published','failed','canceled')),
  publish_attempts integer not null default 0,
  claim_token uuid,
  publishing_started_at timestamptz,
  instagram_media_id text,
  published_permalink text,
  published_at timestamptz,
  last_error text,
  media_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_post_publish_ready check (
    status not in ('scheduled','publishing','published')
    or (scheduled_at is not null and approved_at is not null and media_path is not null)
  )
);
create index if not exists social_post_schedules_due_idx
  on public.social_post_schedules (scheduled_at)
  where status='scheduled';
create index if not exists social_post_schedules_client_idx
  on public.social_post_schedules (client_ref, created_at desc);
alter table public.social_post_schedules enable row level security;
-- Deny-by-default for browser roles. Only trusted server/service-role operations
-- until existing One Way authentication and client authorization are audited.

create table if not exists public.social_post_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.social_post_schedules(id) on delete cascade,
  event_type text not null,
  actor_ref text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists social_post_events_post_idx on public.social_post_events(post_id, created_at desc);
alter table public.social_post_events enable row level security;

-- Media is private, expires only after confirmed publish or explicit cancellation.
-- Create private bucket 'social-posts-temp' separately after confirming Storage settings.
-- Do not delete files on failed/uncertain publishing attempts.
