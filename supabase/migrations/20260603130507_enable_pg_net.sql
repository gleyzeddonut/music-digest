-- Enable pg_net so database triggers can make outbound HTTPS calls
-- (used by the signup-notification trigger to reach the Resend API).
create extension if not exists pg_net;
