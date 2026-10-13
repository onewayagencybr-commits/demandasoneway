-- ONE WAY — biblioteca privada de PDFs de Instagram
-- Executar uma vez: Supabase > SQL Editor > New query > Run.
-- Não mexe na tabela de clientes, demandas, financeiro ou nos outros buckets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oneway-instagram-reports','oneway-instagram-reports',false,15728640,array['application/pdf'])
on conflict (id) do update
set public=false, file_size_limit=15728640, allowed_mime_types=array['application/pdf'];

-- Somente usuários autenticados que pertencem aos administradores do sistema.
-- Utiliza a função public.is_app_admin() já usada pelo login One Way.
drop policy if exists "oneway_ig_read_admin" on storage.objects;
drop policy if exists "oneway_ig_insert_admin" on storage.objects;
drop policy if exists "oneway_ig_delete_admin" on storage.objects;

create policy "oneway_ig_read_admin" on storage.objects
for select to authenticated
using (bucket_id='oneway-instagram-reports' and (select public.is_app_admin()));

create policy "oneway_ig_insert_admin" on storage.objects
for insert to authenticated
with check (bucket_id='oneway-instagram-reports'
  and name like 'instagram/%'
  and (select public.is_app_admin()));

create policy "oneway_ig_delete_admin" on storage.objects
for delete to authenticated
using (bucket_id='oneway-instagram-reports' and (select public.is_app_admin()));
