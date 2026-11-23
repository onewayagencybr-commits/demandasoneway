-- ONE WAY — Assistente de WhatsApp
-- Cole tudo em: Supabase > SQL Editor > New query > Run
-- Cria duas tabelas que só o servidor (Vercel) consegue ler e gravar.
-- O navegador nunca acessa direto: tudo passa por /api/whatsapp com login de Administrador.

create extension if not exists pgcrypto;

-- Quem é quem: número de WhatsApp -> cliente (ou membro da equipe).
create table if not exists public.whatsapp_contacts (
  phone text primary key,
  client_name text not null default '',
  contact_name text not null default '',
  is_team boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tudo o que chega pelo WhatsApp: solicitações, agendamentos, dúvidas e reuniões transcritas.
create table if not exists public.whatsapp_items (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  phone text not null default '',
  contact_name text not null default '',
  client_name text not null default '',
  kind text not null default 'outro'
    check (kind in ('solicitacao','agendamento','duvida','reuniao','nota','outro')),
  message_type text not null default 'text',
  text text not null default '',
  transcript text not null default '',
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  reply text not null default '',
  status text not null default 'processando'
    check (status in ('processando','novo','feito','arquivado','erro')),
  error text not null default '',
  demand_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_items_created_idx on public.whatsapp_items (created_at desc);
create index if not exists whatsapp_items_status_idx on public.whatsapp_items (status);

-- Sem políticas para anon/authenticated = ninguém de fora lê. Só a chave secreta do servidor.
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_items enable row level security;
revoke all on public.whatsapp_contacts from anon, authenticated;
revoke all on public.whatsapp_items from anon, authenticated;

-- ===== Conversas (a aba WhatsApp com todas as mensagens) =====

-- Cada mensagem que entra ou sai do número da agência.
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  contact_name text not null default '',
  message_type text not null default 'text',
  text text not null default '',
  transcript text not null default '',
  media_id text not null default '',
  mime text not null default '',
  status text not null default 'received'
    check (status in ('received','sending','sent','delivered','read','failed')),
  sent_by text not null default '',
  error text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);

-- Quando alguém marca a conversa como resolvida sem precisar responder.
create table if not exists public.whatsapp_threads (
  phone text primary key,
  resolved_at timestamptz,
  resolved_by text not null default ''
);

-- Resumo de cada conversa para a lista da esquerda.
create or replace view public.whatsapp_conversations with (security_invoker = true) as
select
  m.phone,
  max(m.created_at) as last_at,
  max(m.created_at) filter (where m.direction = 'in') as last_in_at,
  max(m.created_at) filter (where m.direction = 'out' and m.sent_by <> 'Robô') as last_human_out_at,
  (array_agg(m.text order by m.created_at desc))[1] as last_text,
  (array_agg(m.message_type order by m.created_at desc))[1] as last_type,
  (array_agg(m.direction order by m.created_at desc))[1] as last_direction,
  (array_agg(m.contact_name order by m.created_at desc) filter (where m.direction = 'in' and m.contact_name <> ''))[1] as profile_name,
  t.resolved_at
from public.whatsapp_messages m
left join public.whatsapp_threads t on t.phone = m.phone
group by m.phone, t.resolved_at;

alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_threads enable row level security;
revoke all on public.whatsapp_messages from anon, authenticated;
revoke all on public.whatsapp_threads from anon, authenticated;
revoke all on public.whatsapp_conversations from anon, authenticated;

-- Resultado esperado: "Success. No rows returned".
