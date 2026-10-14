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
