-- Per-user fixed-window rate limiting for edge functions.
-- Only the edge functions (via service_role) touch this; clients never see it.
create table if not exists public.rate_limits (
  user_id      uuid        not null,
  bucket       text        not null,
  window_start timestamptz not null default now(),
  count        int         not null default 0,
  primary key (user_id, bucket)
);

alter table public.rate_limits enable row level security;
-- Intentionally no policies: RLS-enabled with none means anon/authenticated
-- callers get zero rows; only service_role (used inside the functions) bypasses.

-- Atomically bump the counter for (user, bucket) and report whether the request
-- is within the limit. Resets the window once it has elapsed. SECURITY DEFINER
-- so it can write regardless of the caller's RLS.
create or replace function public.check_rate_limit(
  p_user uuid, p_bucket text, p_max int, p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits (user_id, bucket, window_start, count)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set count        = case when public.rate_limits.window_start < now() - p_window
                            then 1 else public.rate_limits.count + 1 end,
        window_start = case when public.rate_limits.window_start < now() - p_window
                            then now() else public.rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, int, interval) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, int, interval) to service_role;
