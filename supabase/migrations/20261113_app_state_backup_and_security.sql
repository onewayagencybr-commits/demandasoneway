-- ONE WAY — Backup automático + segurança da tabela app_state
-- Como aplicar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Seguro para repetir. Não apaga nem altera clientes, demandas, financeiro ou contratos.
--
-- O que faz:
--  1. Cria public.app_state_history: o banco guarda sozinho versões anteriores dos dados
--     (no máximo 1 a cada 30 min; tudo dos últimos 2 dias + 1 por dia até 45 dias).
--  2. Trava: bloqueia qualquer gravação que apagaria TODOS os clientes e demandas de uma vez.
--  3. Função public.restore_app_state(history_id) para restaurar uma versão (só administradores).
--  4. Segurança: equipe/visitantes continuam lendo e atualizando só o painel ('main');
--     Financeiro, Contratos e o histórico ficam acessíveis apenas a administradores logados.

begin;

-- 0. Pré-requisito: a função de administrador usada no login precisa existir.
do $$
begin
  if to_regprocedure('public.is_app_admin()') is null then
    raise exception 'A função public.is_app_admin() não existe neste banco. Nada foi alterado.';
  end if;
end $$;

-- 1. Histórico de versões
create table if not exists public.app_state_history (
  history_id bigint generated always as identity primary key,
  state_id text not null,
  data jsonb not null,
  state_updated_at timestamptz,
  saved_at timestamptz not null default now(),
  reason text not null default 'auto'
);
create index if not exists app_state_history_state_saved_idx
  on public.app_state_history (state_id, saved_at desc);

alter table public.app_state_history enable row level security;
revoke all on public.app_state_history from anon, authenticated;
grant select on public.app_state_history to authenticated;
drop policy if exists "oneway_history_admin_read" on public.app_state_history;
create policy "oneway_history_admin_read" on public.app_state_history
  for select to authenticated using ((select public.is_app_admin()));

-- 2. Gatilho: guarda a versão anterior + trava contra apagar tudo
create or replace function public.app_state_before_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_clients int; new_clients int; new_demands int;
  forced boolean := coalesce(current_setting('oneway.force_snapshot', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    insert into public.app_state_history (state_id, data, state_updated_at, reason)
    values (old.id, old.data, old.updated_at, 'delete');
    return old;
  end if;

  if new.data is not distinct from old.data then
    return new;
  end if;

  if old.id = 'main' and not forced then
    old_clients := case when jsonb_typeof(old.data->'clients') = 'array' then jsonb_array_length(old.data->'clients') else 0 end;
    new_clients := case when jsonb_typeof(new.data->'clients') = 'array' then jsonb_array_length(new.data->'clients') else 0 end;
    new_demands := case when jsonb_typeof(new.data->'demands') = 'array' then jsonb_array_length(new.data->'demands') else 0 end;
    if old_clients > 0 and new_clients = 0 and new_demands = 0 then
      raise exception 'Gravação bloqueada: ela apagaria todos os clientes e demandas. Recarregue a página.'
        using errcode = 'P0001';
    end if;
  end if;

  if forced or not exists (
    select 1 from public.app_state_history
    where state_id = old.id and reason = 'auto' and saved_at > now() - interval '30 minutes'
  ) then
    insert into public.app_state_history (state_id, data, state_updated_at, reason)
    values (old.id, old.data, old.updated_at, case when forced then 'before-restore' else 'auto' end);

    -- Retenção: tudo dos últimos 2 dias; depois, só a primeira versão de cada dia; nada além de 45 dias.
    delete from public.app_state_history h
    where h.state_id = old.id and h.reason = 'auto'
      and h.saved_at < now() - interval '2 days'
      and (
        h.saved_at < now() - interval '45 days'
        or exists (
          select 1 from public.app_state_history k
          where k.state_id = h.state_id and k.reason = 'auto'
            and k.saved_at::date = h.saved_at::date and k.saved_at < h.saved_at
        )
      );
  end if;

  return new;
end $$;

drop trigger if exists app_state_history_trg on public.app_state;
create trigger app_state_history_trg
  before update or delete on public.app_state
  for each row execute function public.app_state_before_change();

-- Primeira cópia de segurança imediata de tudo que existe hoje.
insert into public.app_state_history (state_id, data, state_updated_at, reason)
select id, data, updated_at, 'initial' from public.app_state
where not exists (select 1 from public.app_state_history where reason = 'initial');

-- 3. Restaurar uma versão (somente administradores)
create or replace function public.restore_app_state(p_history_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text; v_data jsonb;
begin
  -- Pelo app (session_user = authenticator) exige administrador; pelo SQL Editor do Supabase é permitido.
  if session_user = 'authenticator' and not coalesce(public.is_app_admin(), false) then
    raise exception 'Somente administradores podem restaurar backups.';
  end if;
  select state_id, data into v_id, v_data from public.app_state_history where history_id = p_history_id;
  if not found then
    raise exception 'Versão % não encontrada.', p_history_id;
  end if;
  if v_id = 'main' then
    v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint));
  end if;
  perform set_config('oneway.force_snapshot', '1', true);
  insert into public.app_state (id, data, updated_at) values (v_id, v_data, now())
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  perform set_config('oneway.force_snapshot', '', true);
  return v_id;
end $$;
revoke all on function public.restore_app_state(bigint) from public, anon;
grant execute on function public.restore_app_state(bigint) to authenticated;

-- 4. Políticas de acesso da app_state (substitui as antigas, que liberavam tudo para anon)
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_state' loop
    execute format('drop policy %I on public.app_state', p.policyname);
  end loop;
end $$;

alter table public.app_state enable row level security;
revoke delete on public.app_state from anon, authenticated;
grant select, insert, update on public.app_state to anon, authenticated;

-- Painel compartilhado (clientes, demandas, agenda): equipe e administradores.
create policy "oneway_main_read" on public.app_state
  for select to anon, authenticated using (id = 'main');
create policy "oneway_main_insert" on public.app_state
  for insert to anon, authenticated with check (id = 'main');
create policy "oneway_main_update" on public.app_state
  for update to anon, authenticated using (id = 'main') with check (id = 'main');

-- Financeiro, Contratos e demais registros: apenas administradores autenticados.
create policy "oneway_admin_all" on public.app_state
  for all to authenticated
  using ((select public.is_app_admin()))
  with check ((select public.is_app_admin()));

commit;

-- Conferir depois (opcional):
--   select history_id, state_id, reason, saved_at from public.app_state_history order by saved_at desc limit 20;
--   select pg_size_pretty(pg_total_relation_size('public.app_state_history'));
-- Restaurar uma versão (como administrador no app, ou aqui no SQL Editor):
--   select public.restore_app_state(<history_id>);
