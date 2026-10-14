-- One Way Social Media | INSTALADOR ÚNICO ADITIVO
-- Execute no Supabase SQL Editor somente depois de verificar o projeto certo.
-- Seguro para repetir: cria somente estruturas novas e não mexe em app_state.
-- NÃO ativa a publicação automática; Cron e credenciais são configurados separadamente.

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


-- ------------------ PRÓXIMO MÓDULO ------------------

-- One Way · Agendador · 002: conexões Instagram segregadas por cliente.
-- Aditiva: mantém app_state, contratos e finanças intocados.
create table if not exists public.social_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  client_ref text not null unique,
  instagram_user_id text not null unique,
  username text not null,
  encrypted_access_token text not null,
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connection_status text not null default 'connected'
    check (connection_status in ('connected','expired','revoked','error'))
);
alter table public.social_instagram_accounts enable row level security;
revoke all on public.social_instagram_accounts from anon, authenticated;

create table if not exists public.social_oauth_states (
  state_hash text primary key,
  client_ref text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists social_oauth_states_expiry_idx on public.social_oauth_states(expires_at);
alter table public.social_oauth_states enable row level security;
revoke all on public.social_oauth_states from anon, authenticated;

-- Safety: the initial scheduling migration enables RLS but has no public policies.
-- The backend accesses these tables only using the service secret after
-- checking Supabase Auth + is_app_admin().


-- ------------------ PRÓXIMO MÓDULO ------------------

-- One Way | third additive scheduler migration.
-- Atomic claim prevents two workers from publishing the same scheduled post.
create or replace function public.social_claim_due_posts(batch_limit integer default 3)
returns setof public.social_post_schedules
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with due as (
      select s.id from public.social_post_schedules s
      where s.status='scheduled' and s.scheduled_at<=now()
        and s.approved_at is not null and s.approved_content_hash is not null
      order by s.scheduled_at asc
      for update skip locked
      limit least(greatest(batch_limit,1),5)
    )
    update public.social_post_schedules s
      set status='publishing',claim_token=gen_random_uuid(),publishing_started_at=now(),
          publish_attempts=s.publish_attempts+1,updated_at=now()
    where s.id in (select id from due)
    returning s.*;
end $$;
revoke all on function public.social_claim_due_posts(integer) from public, anon, authenticated;
grant execute on function public.social_claim_due_posts(integer) to service_role;
-- Keep ambiguous processing outcomes in 'publishing' for operator review.
-- A second run never claims a publishing/failed/published row.
