-- ONE WAY — configuração única do Supabase
-- Cole tudo em: Supabase > SQL Editor > New query > Run

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists "oneway_select" on public.app_state;
drop policy if exists "oneway_insert" on public.app_state;
drop policy if exists "oneway_update" on public.app_state;

create policy "oneway_select" on public.app_state for select to anon using (true);
create policy "oneway_insert" on public.app_state for insert to anon with check (true);
create policy "oneway_update" on public.app_state for update to anon using (true) with check (true);

grant select, insert, update on public.app_state to anon;

-- Ativa a tabela no Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

-- Bucket para anexos compartilhados entre os computadores.
insert into storage.buckets (id, name, public, file_size_limit)
values ('demand-files', 'demand-files', false, 20971520)
on conflict (id) do update set public=false, file_size_limit=20971520;

drop policy if exists "oneway_files_select" on storage.objects;
drop policy if exists "oneway_files_insert" on storage.objects;
drop policy if exists "oneway_files_delete" on storage.objects;

create policy "oneway_files_select" on storage.objects
for select to anon using (bucket_id='demand-files');

create policy "oneway_files_insert" on storage.objects
for insert to anon with check (bucket_id='demand-files');

create policy "oneway_files_delete" on storage.objects
for delete to anon using (bucket_id='demand-files');
