-- ONE WAY — Linha do tempo do status de uma demanda (últimos 30 dias)
-- Usa as cópias de segurança automáticas (app_state_history): mostra QUANDO o status mudou.
-- Não mostra QUEM (as cópias antigas não guardavam isso). Só leitura: não altera nada.
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo, troque NOME DA DEMANDA
-- (pode ser só um pedaço do título) e clique em Run.
-- Precisão: cópias a cada ~30 min nos últimos 2 dias; antes disso, 1 por dia.

with versoes as (
  select h.saved_at, d
  from public.app_state_history h,
       jsonb_array_elements(case when jsonb_typeof(h.data->'demands') = 'array' then h.data->'demands' else '[]'::jsonb end) d
  where h.state_id = 'main'
    and h.saved_at > now() - interval '30 days'
    and d->>'title' ilike '%NOME DA DEMANDA%'
  union all
  select s.updated_at, d
  from public.app_state s,
       jsonb_array_elements(s.data->'demands') d
  where s.id = 'main' and d->>'title' ilike '%NOME DA DEMANDA%'
),
marcado as (
  select saved_at, d->>'id' as id, d->>'title' as demanda, d->>'status' as status,
         lag(d->>'status') over (partition by d->>'id' order by saved_at) as status_anterior
  from versoes
)
select to_char(saved_at at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI') as visto_em,
       demanda,
       case status when 'red' then 'Não feito' when 'yellow' then 'Em produção'
         when 'salmon' then 'Aguardando aprovação OneWay' when 'purple' then 'Aguardando aprovação cliente'
         when 'orange' then 'Aguardando postagem' when 'green' then 'Finalizado' else status end as status
from marcado
where status_anterior is null or status_anterior is distinct from status
order by id, saved_at;
