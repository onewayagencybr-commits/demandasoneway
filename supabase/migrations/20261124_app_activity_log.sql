-- ONE WAY — Registro de atividades feito pelo próprio banco ("Prova do banco")
-- Como aplicar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Seguro para repetir. Não apaga nem altera clientes, demandas, financeiro ou contratos.
--
-- O que faz:
--   A cada gravação do painel (linha 'main' da app_state), o banco compara as demandas
--   de antes e de depois e anota, numa tabela própria:
--     • demanda criada/restaurada, status alterado, demanda excluída ou que sumiu da lista;
--     • quem gravou: e-mail do Administrador (vem do login do Supabase, não dá para forjar)
--       e o nome/sigla informados pelo app (logins da equipe);
--     • without_app_record = true quando o status mudou SEM nenhuma ação registrada na
--       demanda — sinal de que uma tela aberta com dados antigos salvou por cima.
--   Só administradores conseguem ler. Guarda 180 dias.
--   Se algo der errado no registro, a gravação do painel continua normalmente.

begin;

do $$
begin
  if to_regprocedure('public.is_app_admin()') is null then
    raise exception 'A função public.is_app_admin() não existe neste banco. Nada foi alterado.';
  end if;
end $$;

create table if not exists public.app_activity_log (
  log_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  demand_id text,
  demand_title text,
  client_id text,
  area text,
  action text not null,            -- created | status | deleted | removed
  old_status text,
  new_status text,
  actor_email text,                -- e-mail do Administrador logado (null nos logins da equipe)
  actor_name text,                 -- nome informado pelo app
  actor_ini text,                  -- sigla informada pelo app
  actor_login text,                -- admin | design | video | status
  db_role text,                    -- authenticated (Administrador) ou anon (equipe)
  without_app_record boolean not null default false
);
create index if not exists app_activity_log_at_idx on public.app_activity_log (at desc);
create index if not exists app_activity_log_demand_idx on public.app_activity_log (demand_id, at desc);

alter table public.app_activity_log enable row level security;
revoke all on public.app_activity_log from anon, authenticated;
grant select on public.app_activity_log to authenticated;
drop policy if exists "oneway_activity_admin_read" on public.app_activity_log;
create policy "oneway_activity_admin_read" on public.app_activity_log
  for select to authenticated using ((select public.is_app_admin()));

create or replace function public.app_state_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role text;
  v_actor jsonb;
  v_new jsonb;
  v_old jsonb;
  v_new_deleted jsonb;
begin
  if new.id <> 'main' then return null; end if;
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then return null; end if;

  begin
    begin
      v_email := nullif(auth.jwt() ->> 'email', '');
      v_role := coalesce(nullif(auth.jwt() ->> 'role', ''), current_user::text);
    exception when others then
      v_email := null; v_role := current_user::text;
    end;

    v_actor := case when jsonb_typeof(new.data -> 'lastActor') = 'object' then new.data -> 'lastActor' else '{}'::jsonb end;
    v_new := case when jsonb_typeof(new.data -> 'demands') = 'array' then new.data -> 'demands' else '[]'::jsonb end;
    v_new_deleted := case when jsonb_typeof(new.data -> 'deletedDemands') = 'array' then new.data -> 'deletedDemands' else '[]'::jsonb end;
    v_old := case when tg_op = 'UPDATE' and jsonb_typeof(old.data -> 'demands') = 'array' then old.data -> 'demands' else '[]'::jsonb end;

    with n as (select d from jsonb_array_elements(v_new) d),
         o as (select d from jsonb_array_elements(v_old) d),
         nd as (select d ->> 'id' as id from jsonb_array_elements(v_new_deleted) d)
    insert into public.app_activity_log
      (demand_id, demand_title, client_id, area, action, old_status, new_status,
       actor_email, actor_name, actor_ini, actor_login, db_role, without_app_record)
    -- criadas/restauradas e status alterados
    select n.d ->> 'id', n.d ->> 'title', n.d ->> 'clientId', n.d ->> 'area',
           case when o.d is null then 'created' else 'status' end,
           o.d ->> 'status', n.d ->> 'status',
           v_email, v_actor ->> 'by', v_actor ->> 'ini', v_actor ->> 'login', v_role,
           -- sem registro: a última ação da demanda já existia antes (nada novo foi anotado nela)
           (o.d is not null and (
              coalesce(n.d -> 'activityLog' -> -1 ->> 'id', '') = ''
              or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(o.d -> 'activityLog') = 'array' then o.d -> 'activityLog' else '[]'::jsonb end) x
                         where x ->> 'id' = n.d -> 'activityLog' -> -1 ->> 'id')))
    from n left join o on o.d ->> 'id' = n.d ->> 'id'
    where tg_op = 'UPDATE' and (o.d is null or (o.d ->> 'status') is distinct from (n.d ->> 'status'))
    union all
    -- saíram da lista: excluídas (foram para Excluídos) ou sumiram (gravação por cima)
    select o.d ->> 'id', o.d ->> 'title', o.d ->> 'clientId', o.d ->> 'area',
           case when exists (select 1 from nd where nd.id = o.d ->> 'id') then 'deleted' else 'removed' end,
           o.d ->> 'status', null,
           v_email, v_actor ->> 'by', v_actor ->> 'ini', v_actor ->> 'login', v_role,
           not exists (select 1 from nd where nd.id = o.d ->> 'id')
    from o left join n on n.d ->> 'id' = o.d ->> 'id'
    where n.d is null;

    if random() < 0.02 then
      delete from public.app_activity_log where at < now() - interval '180 days';
    end if;
  exception when others then
    raise warning 'app_activity_log: registro ignorado (%).', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists app_state_activity_log_trg on public.app_state;
create trigger app_state_activity_log_trg
  after update on public.app_state
  for each row execute function public.app_state_activity_log();

commit;

-- Conferir depois (opcional):
--   select at at time zone 'America/Cuiaba' as quando, action, demand_title, old_status, new_status,
--          coalesce(actor_email, actor_name) as quem, without_app_record
--   from public.app_activity_log order by at desc limit 50;
