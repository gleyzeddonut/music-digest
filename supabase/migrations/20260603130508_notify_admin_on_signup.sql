-- Emails the owner each new signup's email (up to the first 25) so they can be
-- added to the Spotify dev-app allowlist (Spotify caps Web API access at 25
-- authenticated users; there is no programmatic way to allowlist, it's manual
-- in the Spotify dashboard). Sends via the Resend HTTP API using the key stored
-- in Vault as 'resend_api_key'.
--
-- To activate, store the Resend API key (same value as the send-email function's
-- SMTP password) in Vault:
--   select vault.create_secret('re_...', 'resend_api_key', 'Resend key for signup notifications');
--
-- Fail-safe: dormant if the key is missing, silent past 25 users, and any error
-- is swallowed so a notification problem can NEVER block a user from signing up.
create or replace function public.notify_admin_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_key   text;
begin
  select count(*) into v_count from auth.users;
  if v_count > 25 then
    return new; -- past the Spotify cap; nothing to allowlist
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'resend_api_key'
  limit 1;

  if v_key is null or v_key = '' then
    return new; -- not configured yet; stay dormant
  end if;

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'
               ),
    body    := jsonb_build_object(
                 'from',    'Music Digest <noreply@musdiapp.xyz>',
                 'to',      'dmgleyzer@gmail.com',
                 'subject', 'New signup #' || v_count || ' of 25 — allowlist on Spotify',
                 'html',    '<p>New Music Digest signup <strong>#' || v_count || ' of 25</strong>.</p>'
                            || '<p><strong>Spotify allowlist email:</strong> '
                            || coalesce(new.email, '(no email on record)') || '</p>'
                            || '<p>Add it: developer.spotify.com/dashboard &rarr; your app &rarr; '
                            || 'Settings &rarr; User Management.</p>'
               )
  );

  return new;
exception when others then
  return new; -- never let a notification failure break signup
end;
$$;

drop trigger if exists trg_notify_admin_on_signup on auth.users;
create trigger trg_notify_admin_on_signup
  after insert on auth.users
  for each row execute function public.notify_admin_on_signup();
