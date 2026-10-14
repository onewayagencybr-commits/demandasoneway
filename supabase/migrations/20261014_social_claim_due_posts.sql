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
