-- ============================================================================
-- Globe Quest — analytics schema
-- Paste this whole file into the Supabase SQL editor (Database ▸ SQL Editor)
-- and click "Run". Safe to re-run (idempotent).
--
-- What it gives you: anonymous players write gameplay events; ONLY you (logged
-- in as the admin email) can read them. Metrics produced: sessions/visitors over
-- time, most-played modes, hardest countries by wrong-answer rate, average score,
-- and round-completion rate. Cookieless, no IP, no personal data.
--
-- Security model (verified against Supabase docs, 2026-06):
--   • The public "publishable" key shipped in the browser can ONLY call
--     log_event() — it has NO direct read/write access to the table.
--   • log_event() is SECURITY DEFINER (runs as table owner) so it is the single,
--     validated write path. This closes the direct-insert bypass.
--   • Reads are gated by RLS to one email via is_admin().
--   • NEVER put the secret / service_role key in the browser or this repo.
-- ============================================================================

-- 1) EVENTS TABLE ------------------------------------------------------------
create table if not exists public.events (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  session_id   uuid        not null,                 -- anonymous, per-tab, not persisted
  event_type   text        not null,                 -- session_start | round_start | round_complete | answer
  game_mode    text,                                 -- e.g. find-map, guess-flag, capital ...
  country_code text,                                 -- ISO-3166 alpha-3 (answer events only)
  is_correct   boolean,                              -- answer events only
  score        integer,                              -- round_complete only
  constraint events_type_chk
    check (event_type in ('session_start','round_start','round_complete','answer')),
  constraint events_mode_len_chk  check (game_mode is null    or char_length(game_mode)    <= 40),
  constraint events_cc_len_chk    check (country_code is null or char_length(country_code) <= 3),
  constraint events_score_rng_chk check (score is null or (score between 0 and 100000))
);

create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_type_idx        on public.events (event_type);
create index if not exists events_mode_idx        on public.events (game_mode);
create index if not exists events_country_idx     on public.events (country_code);

-- 2) ROW LEVEL SECURITY + GRANTS --------------------------------------------
alter table public.events enable row level security;

-- Exhaustive lockdown: strip every default grant, then add back ONLY what's needed.
-- (Older projects auto-grant all verbs to anon/authenticated — this revoke removes them.)
revoke all on public.events from anon, authenticated;

-- Anonymous players never touch the table directly; they write only via log_event().
-- The admin dashboard reads through security_invoker views, which require the caller
-- to hold SELECT on the base table — so 'authenticated' gets SELECT, but RLS (below)
-- still restricts every row to the admin email. anon gets NOTHING here.
grant select on public.events to authenticated;

-- 3) ADMIN IDENTITY (one place to audit / change the allow-listed email) ------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- 👇 change this email if the admin ever changes
  select coalesce((select auth.jwt() ->> 'email') = 'halavahromeeva@gmail.com', false)
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Only the admin may read rows. Combined with the grant above, this gates all reads.
drop policy if exists "admin reads events" on public.events;
create policy "admin reads events"
  on public.events for select to authenticated
  using ( public.is_admin() );

-- 4) THE ONLY WRITE PATH: a validating SECURITY DEFINER function -------------
-- The browser calls supabase.rpc('log_event', {...}). Because it runs as the table
-- owner, anon needs NO insert grant on the table — there is no raw-insert bypass.
create or replace function public.log_event(
  p_session_id   uuid,
  p_event_type   text,
  p_game_mode    text    default null,
  p_country_code text    default null,
  p_is_correct   boolean default null,
  p_score        integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in ('session_start','round_start','round_complete','answer') then
    raise exception 'invalid event_type: %', p_event_type;
  end if;
  insert into public.events
    (session_id, event_type, game_mode, country_code, is_correct, score)
  values
    (p_session_id, p_event_type,
     left(p_game_mode, 40),
     upper(left(p_country_code, 3)),                 -- normalize to ISO-3
     p_is_correct,
     case when p_score between 0 and 100000 then p_score else null end);
end;
$$;

revoke all on function public.log_event(uuid,text,text,text,boolean,integer) from public;
grant execute on function public.log_event(uuid,text,text,text,boolean,integer) to anon, authenticated;

-- 5) AGGREGATE VIEWS (security_invoker => they honor the admin-only RLS above) -
create or replace view public.analytics_daily with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day,
         count(*) filter (where event_type='session_start')                   as sessions,
         count(distinct session_id) filter (where event_type='session_start') as visitors
  from public.events
  group by 1 order by 1;

create or replace view public.mode_popularity with (security_invoker = true) as
  select game_mode, count(*) as rounds_started
  from public.events
  where event_type='round_start' and game_mode is not null
  group by game_mode order by rounds_started desc;

create or replace view public.hardest_countries with (security_invoker = true) as
  select country_code,
         count(*)                                   as attempts,
         count(*) filter (where is_correct = false) as wrong,
         round(count(*) filter (where is_correct = false)::numeric
               / nullif(count(*),0), 3)             as wrong_rate
  from public.events
  where event_type='answer' and country_code is not null
  group by country_code
  having count(*) >= 5
  order by wrong_rate desc, attempts desc;

create or replace view public.score_summary with (security_invoker = true) as
  select round(avg(score)::numeric, 1) as avg_score,
         min(score) as min_score, max(score) as max_score,
         count(*)   as rounds_scored
  from public.events
  where event_type='round_complete' and score is not null;

create or replace view public.completion_rate with (security_invoker = true) as
  select coalesce(game_mode, '(all)') as game_mode,
         count(*) filter (where event_type='round_start')    as starts,
         count(*) filter (where event_type='round_complete') as completes,
         round(count(*) filter (where event_type='round_complete')::numeric
               / nullif(count(*) filter (where event_type='round_start'), 0), 3) as completion_rate
  from public.events
  where event_type in ('round_start','round_complete')
  group by rollup (game_mode)
  order by game_mode;

-- 6) KEEP-ALIVE helper -------------------------------------------------------
-- Free projects pause after ~7 days of inactivity. Real player traffic resets the
-- timer; for quiet stretches, point a FREE uptime monitor (cron-job.org, UptimeRobot)
-- at this RPC every ~3 days. See README ▸ "Keeping the backend awake".
--   POST https://<your-project>.supabase.co/rest/v1/rpc/keepalive
--   headers: apikey: <publishable key>,  Content-Type: application/json
create or replace function public.keepalive()
returns timestamptz language sql security definer set search_path = ''
as $$ select now() $$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;

-- ============================================================================
-- AFTER RUNNING — verify the lockdown (do this once):
--   In Supabase ▸ Authentication ▸ Sign In / Providers, turn OFF "Allow new users
--   to sign up", then create ONE user = your admin email.
--   Then sanity-check from the SQL editor's "Run as: anon" or via the API:
--     • anon: select * from public.events;          -> permission denied / 0 rows  ✅
--     • anon: select keepalive();                    -> a timestamp                 ✅
--     • admin (logged in): select * from analytics_daily;  -> rows                  ✅
-- ============================================================================
