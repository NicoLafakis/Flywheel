-- Creating an account must inherit what this device already played, and must
-- prove the device played it.
--
-- WHAT WAS WRONG
-- `api/auth/register.mjs` adopted a prior run with:
--
--     PATCH runs?id=eq.<caller-supplied run_id>  { player_id: <new player> }
--
-- with no ownership check of any kind - no device match, no `player_id is
-- null`, no verdict check. Any run id a caller learned was adoptable by a name
-- they had just created. It never fired in practice only because the shipped
-- client passes no `run_id`, which is also why creating an account inherited
-- nothing at all. Both halves are fixed here, in the one place they can be:
-- inside a `security definer` function that can see `run_tickets`, which the
-- browser cannot.
--
-- A guard on the PATCH would not have been enough. For a run that is already
-- `verified`, `fw_record_verdict` has ALREADY run: it took the
-- `when r.player_id is not null` branch, skipped the `board_public` insert, and
-- will never run again for that run. Re-pointing the run therefore publishes
-- nothing. The backfill below is the part that actually puts an inherited score
-- on the leaderboard, and it is modelled directly on `fw_claim_name`
-- (20260812204210), which has had both halves right since the beginning.
--
-- THE OTHER HALF: DO NOT STRAND THE GUEST
-- `api/run/start.mjs` now provisions a real `players` row with a generated name
-- for any device that arrives without one, so a guest's very first run
-- publishes. That means by the time someone creates an account, this device's
-- runs are usually NOT unclaimed - they belong to that auto-provisioned guest,
-- and `player_id is null` adoption would find nothing to take. So registration
-- UPGRADES the guest in place: same row, same id, same board_public rows, now
-- carrying the chosen name and a password. Creating a second row and leaving
-- "Meat Tornado" holding the scores would be the same invisible failure this
-- migration exists to end.
--
-- Invariant 8 is untouched. Nothing here computes, accepts or adjusts a score:
-- every value written to `board_public.score` is `runs.verified_score`, which
-- only `fw_record_verdict` sets and only from a server-side replay.

-- Which players were handed their name by the machine. Needed because
-- "upgrade the guest, do not create a second player" has to be able to tell a
-- guest identity from a real account, and must never silently absorb the
-- latter: a claimed account is upgraded by `auth/login`, not by someone else
-- registering from a device that once held its token.
--
-- Additive, defaulted, and safe to apply to a live table: `boolean not null
-- default false` on Postgres 11+ is a catalogue-only rewrite, so it does not
-- lock `players` for a scan. Every existing row is correctly `false` - every
-- player that exists today typed their own name.
alter table public.players add column if not exists is_auto boolean not null default false;

comment on column public.players.is_auto is
  'True when run/start generated this name automatically for a device that had no identity. Such a row is a device-token account (token_hash = sha256(bearer token), session_token_hash null) and is the row fw_register_device_player upgrades in place when that device creates an account, so nothing it earned as a guest is stranded. Never set on a player who typed their own name.';

create or replace function public.fw_register_device_player(
  p_name text,
  p_name_key text,
  p_password_hash_hex text,
  p_session_hash_hex text,
  p_device_key text,
  p_run_id uuid default null
) returns table(
  player_id uuid,
  player_name text,
  token_version integer,
  upgraded boolean,
  adopted integer,
  published integer,
  requested_run_adopted boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.players;
  v_upgraded boolean := false;
  v_adopted integer := 0;
  v_published integer := 0;
  v_requested boolean := false;
begin
  if p_name is null or p_name_key is null or p_password_hash_hex is null
     or p_session_hash_hex is null or p_device_key is null then
    raise exception 'name, credentials and device are all required' using errcode = 'P0001';
  end if;
  if char_length(p_device_key) not between 16 and 128 then
    raise exception 'device key is outside the allowed length' using errcode = 'P0001';
  end if;

  -- The device's own auto-provisioned guest, if it has one. `for update` because
  -- two tabs registering at once must not both take the same guest row.
  --
  -- The ownership evidence is the same as everywhere else in this file: a
  -- `run_tickets` row issued to this device key. `is_auto` and
  -- `session_token_hash is null` together mean this identity has never been
  -- claimed by a human, so upgrading it takes nothing away from anybody. A
  -- claimed account is skipped and a fresh row is created instead.
  select p2.* into p
    from public.players p2
   where p2.is_auto
     and p2.moderation_state = 'ok'
     and p2.session_token_hash is null
     and exists (
       select 1 from public.run_tickets t
        where t.player_id = p2.id and t.device_key = p_device_key
     )
   order by p2.created_at desc
   limit 1
     for update;

  if found then
    update public.players set
        name = p_name,
        name_key = p_name_key,
        -- Same two-column split every password account uses (20260816214501):
        -- `token_hash` becomes the password verifier, `session_token_hash` the
        -- bearer credential. The guest's old device token stops working at this
        -- moment, which is correct - the account now has a password.
        token_hash = decode(p_password_hash_hex, 'hex'),
        session_token_hash = decode(p_session_hash_hex, 'hex'),
        is_auto = false,
        -- QUALIFIED, and it has to be. This function returns a table with a
        -- `token_version` column, which makes that name a plpgsql OUT variable;
        -- a bare `token_version + 1` on the right-hand side is then a name that
        -- could mean either the column or the variable, and the default
        -- `plpgsql.variable_conflict = error` raises "column reference
        -- token_version is ambiguous" AT RUN TIME - the function still creates
        -- cleanly, so nothing catches it until a real player registers.
        token_version = players.token_version + 1,
        last_seen_at = now()
     where id = p.id
     returning * into p;
    v_upgraded := true;
    -- The published rows carry a denormalised name, so the leaderboard must be
    -- renamed in the same breath or it keeps showing the generated name.
    update public.board_public b set name = p.name where b.player_id = p.id;
  else
    insert into public.players (
      name, name_key, token_hash, session_token_hash, is_auto, moderation_state, last_seen_at
    ) values (
      p_name, p_name_key, decode(p_password_hash_hex, 'hex'),
      decode(p_session_hash_hex, 'hex'), false, 'ok', now()
    ) returning * into p;
  end if;

  -- ADOPTION, GATED. `run_tickets` is the only record of which device was issued
  -- a run, so the join to it IS the ownership proof; `player_id is null` keeps
  -- adoption from ever taking a run away from the player who owns it. Note what
  -- is absent: `p_run_id` appears nowhere in this statement. A caller-supplied
  -- id cannot authorise a write here, which is the whole defect being closed.
  with adopted_runs as (
    update public.runs r set player_id = p.id
      from public.run_tickets t
     where r.id = t.id
       and t.device_key = p_device_key
       and r.player_id is null
    returning r.id
  )
  select count(*)::integer into v_adopted from adopted_runs;

  -- BACKFILL. For a run verified while it had no owner, fw_record_verdict has
  -- already skipped this insert and will not run again, so this is the only
  -- thing that publishes an inherited score. Idempotent on `run_id`, same as
  -- fw_record_verdict and fw_claim_name.
  --
  -- `verified_score` and `verified_at` are the server's own numbers. Nothing the
  -- caller sent reaches `score`.
  with published_rows as (
    insert into public.board_public (
      run_id, player_id, scene_id, season_id, name, moderation_state, score, verified_at
    )
    select r.id, p.id, r.scene_id, r.season_id, p.name, p.moderation_state,
           r.verified_score, r.verified_at
      from public.runs r
     where r.player_id = p.id
       and r.verdict = 'verified'
       and r.verified_score is not null
       and r.verified_at is not null
    on conflict (run_id) do update set
      player_id = excluded.player_id, name = excluded.name,
      moderation_state = excluded.moderation_state, score = excluded.score,
      verified_at = excluded.verified_at
    returning run_id
  )
  select count(*)::integer into v_published from published_rows;

  -- Reported, never trusted. `p_run_id` is the run the client believes it just
  -- played; this answers "is it yours and did it land?" so registration can say
  -- so honestly, and it is read-only by construction.
  if p_run_id is not null then
    select exists (
      select 1 from public.runs r
        join public.run_tickets t on t.id = r.id
       where r.id = p_run_id and t.device_key = p_device_key and r.player_id = p.id
    ) into v_requested;
  end if;

  insert into public.submission_log (player_id, device_key, kind)
    values (p.id, p_device_key, 'claim');

  return query select p.id, p.name, p.token_version, v_upgraded, v_adopted, v_published, v_requested;
end;
$$;

-- SAME BUG, ALREADY SHIPPED, FIXED HERE.
--
-- Writing the qualification above is what surfaced it: `fw_transfer_redeem`
-- also returns a `token_version` column and also does `set token_version =
-- token_version + 1` unqualified, in both 20260812204210 and the re-creation in
-- 20260816214501. `create function` does not plan the statements inside a
-- plpgsql body, so that function was created successfully and raises "column
-- reference token_version is ambiguous" the first time anyone actually redeems
-- a transfer code - a path with no automated coverage and, on the evidence of
-- an empty leaderboard, probably no traffic either. Left alone it would fail
-- the same way forever.
--
-- Re-created VERBATIM from 20260816214501 with the one reference qualified.
-- `session_token_hash = null` is carried over deliberately and asserted by
-- tools/api-auth.test.mjs: a `create or replace` that dropped that line would
-- silently undo the revocation that migration exists to provide, and hand a
-- transferred-away device a session token that still validates.
create or replace function public.fw_transfer_redeem(
  p_code text,
  p_token_hash_hex text
) returns table(player_id uuid, player_name text, token_version integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.name_transfers; p public.players;
begin
  select * into t from public.name_transfers
   where code = p_code and redeemed_at is null and expires_at > now() for update;
  if not found then raise exception 'transfer code is unavailable' using errcode = 'P0001'; end if;
  update public.name_transfers set redeemed_at = now() where code = t.code;
  update public.players set token_hash = decode(p_token_hash_hex, 'hex'),
      session_token_hash = null,
      token_version = players.token_version + 1, last_seen_at = now()
   where id = t.player_id returning * into p;
  return query select p.id, p.name, p.token_version;
end;
$$;

-- Private by default, like every other fw_ function. The explicit grant is
-- required, not decorative: 20260812204210 set `alter default privileges ...
-- revoke execute on functions from public, anon, authenticated, service_role`,
-- so a new function is unexecutable by api/ until this line runs.
revoke all on function public.fw_register_device_player(text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fw_register_device_player(text, text, text, text, text, uuid)
  to service_role;
-- `create or replace` preserves an existing ACL, so this is belt and braces for
-- a database rebuilt from these files in order rather than patched in place.
grant execute on function public.fw_transfer_redeem(text, text) to service_role;

-- ROLLBACK
--
--   drop function if exists public.fw_register_device_player(text, text, text, text, text, uuid);
--   -- `players.is_auto` may be left in place; it is nullable-free, defaulted and
--   -- read by nothing else. Only if it must go:
--   -- alter table public.players drop column is_auto;
--
-- Reverting the FUNCTION alone is safe and complete: `api/auth/register.mjs`
-- would then 404 on the RPC and answer 503 (retryable) rather than silently
-- adopting anything, which is the correct failure direction. Nothing in this
-- file drops, renames or retypes an existing object, and re-applying it is a
-- no-op (`add column if not exists`, `create or replace function`, idempotent
-- grants).
--
-- ORDERING NOTE. Code deploys itself and schema does not. Between a push and
-- this migration being applied by hand, `api/run/start.mjs` asks PostgREST to
-- filter on `players.is_auto`, which 400s a column the database cannot see -
-- `ensureDevicePlayer()` catches that and issues the unbound guest ticket the
-- old code issued, and `auth/register` answers 503 retryable on the missing
-- RPC. Degraded, never broken.
