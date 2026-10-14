-- One Way Social Scheduler - execute ONLY after the Meta test and production deployment.
-- Preconditions:
--   extensions pg_cron + pg_net enabled in Supabase
--   Supabase Vault secret named oneway_social_cron_bearer holds SAME CRON_SECRET as Vercel
--   production environment META credentials configured and first test succeeds
--   SOCIAL_PUBLISHING_ENABLED=true only after explicit validation
-- NEVER paste the secret into SQL or the ChatGPT conversation.
--
-- Example Vault creation (use Vault UI; do not put credentials in a query history):
-- Supabase Dashboard > Integrations > Vault > Add secret
-- Secret name: oneway_social_cron_bearer

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Check secret exists BEFORE scheduling either job.
do $validation$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
      where name='oneway_social_cron_bearer' and decrypted_secret is not null
  ) then
    raise exception 'Required Vault secret oneway_social_cron_bearer not configured';
  end if;
end $validation$;

select cron.schedule('oneway_social_publish_each_minute','* * * * *',$job$
  select net.http_get(
    url:='https://onewaydemandas.vercel.app/api/social?action=run',
    headers:=jsonb_build_object(
      'Authorization','Bearer '||(
        select decrypted_secret from vault.decrypted_secrets
         where name='oneway_social_cron_bearer' order by created_at desc limit 1
      )
    ),
    timeout_milliseconds:=25000
  );
$job$);

select cron.schedule('oneway_social_cleanup_daily','0 10 * * *',$job$
  select net.http_get(
    url:='https://onewaydemandas.vercel.app/api/social?action=cleanup',
    headers:=jsonb_build_object(
      'Authorization','Bearer '||(
        select decrypted_secret from vault.decrypted_secrets
         where name='oneway_social_cron_bearer' order by created_at desc limit 1
      )
    ),
    timeout_milliseconds:=25000
  );
$job$);

-- If rollbacks are necessary, stop the external schedules immediately:
-- select cron.unschedule('oneway_social_publish_each_minute');
-- select cron.unschedule('oneway_social_cleanup_daily');
