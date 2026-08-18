-- Cloud progress sync, Phase A (.wiki/plans/cloud-progress-sync.md §2.1, §2.4).
--
-- WHAT THIS ADDS
-- One row per signed-in player holding the syncable subset of their
-- localStorage save (`blob`: coins, stars, bests, owned cosmetics, upgrades,
-- taste settings — never the token, never the outbox, never device settings),
-- so a player who signs in on a second phone arrives with what they earned.
--
-- `coins_verified` is a LEDGER, not a claim: `fw_coins_verified` sums the
-- `coins_collected` the server's own replay counted over this player's
-- `verified` ranked runs. `coins_ceiling` is the plausibility bound the API
-- computes from the record itself (levels × replay allowance, sandbox runs ×
-- best payout). Together they fence `blob.coins` on every push; the server
-- never trusts a balance and never adds coins (api/_progress.mjs).
--
-- `revision` is the optimistic-concurrency counter: a push whose base_revision
-- is not the stored one is MERGED (js/cloud/merge.js) rather than overwriting,
-- and the counter bumps on every accepted push.
--
-- POSTURE. Same as every other fw table: RLS on, an explicit deny-browser
-- policy, no grants to anon/authenticated. Only `service_role` (the Vercel
-- functions, through `playerForToken()`) reads or writes it. `on delete
-- cascade` means `fw_remove_player`, which deletes the `players` row, erases
-- progress too — that function does not change.

create table if not exists public.player_progress (
  player_id        uuid primary key references public.players(id) on delete cascade,
  -- js/save.js CURRENT_VERSION at the time of the push. A row from a NEWER
  -- client than the server knows is refused, never overwritten (invariant 7).
  schema_version   integer not null check (schema_version > 0),
  blob             jsonb not null check (octet_length(blob::text) <= 65536),
  coins_verified   bigint not null default 0 check (coins_verified >= 0),
  coins_ceiling    bigint not null default 0 check (coins_ceiling >= 0),
  revision         integer not null default 1 check (revision > 0),
  updated_at       timestamptz not null default now(),
  pushed_by_device text check (char_length(pushed_by_device) between 16 and 128)
);

comment on table public.player_progress is
  'Cloud copy of the syncable subset of a player''s local save (see api/_progress.mjs SYNCED_KEYS). One row per players.id; written only by api/progress/push through the service role; blob.coins is fenced against coins_verified + coins_ceiling on every push and is never trusted as sent.';

alter table public.player_progress enable row level security;

drop policy if exists "raw progress deny browser" on public.player_progress;
create policy "raw progress deny browser" on public.player_progress
  for all to anon, authenticated using (false) with check (false);

-- 20260812204210 revoked everything from public/anon/authenticated by default
-- privilege; the explicit revoke is belt and braces, and the service_role
-- grant is REQUIRED for api/ to touch the table at all.
revoke all on table public.player_progress from public, anon, authenticated;
grant select, insert, update, delete on table public.player_progress to service_role;

-- Every push is logged as an admission-control event, the same way register
-- logs 'claim-ip': 60 pushes/hour/player (api/progress/push.mjs). Same move as
-- 20260812212500 — the constraint is re-created with one more kind.
alter table public.submission_log drop constraint if exists submission_log_kind_check;
alter table public.submission_log add constraint submission_log_kind_check
  check (kind in ('ticket', 'ticket-ip', 'submit', 'submit-ip', 'claim', 'claim-ip', 'report', 'progress'));

-- The verified-coin ledger. `stats` is the jsonb api/_verify.mjs writes through
-- fw_record_verdict; `coins_collected` joined it in the same commit as this
-- file, so rows verified earlier have no key and sum as 0 — which can only
-- narrow the allowance towards the ceiling, never dock a player below what the
-- ceiling already grants. `stable` because it reads and never writes;
-- `security definer` because `runs` is deny-browser and this is called by the
-- service role only anyway.
create or replace function public.fw_coins_verified(p_player_id uuid)
returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(greatest(0, coalesce((r.stats->>'coins_collected')::bigint, 0))), 0)::bigint
    from public.runs r
   where r.player_id = p_player_id
     and r.verdict = 'verified';
$$;

revoke all on function public.fw_coins_verified(uuid) from public, anon, authenticated;
grant execute on function public.fw_coins_verified(uuid) to service_role;

-- ROLLBACK
--
--   drop function if exists public.fw_coins_verified(uuid);
--   drop table if exists public.player_progress;
--   alter table public.submission_log drop constraint if exists submission_log_kind_check;
--   alter table public.submission_log add constraint submission_log_kind_check
--     check (kind in ('ticket', 'ticket-ip', 'submit', 'submit-ip', 'claim', 'claim-ip', 'report'));
--
-- Reverting is complete and safe: nothing else reads the table or the function.
-- api/progress/* would then answer 503 (retryable) on the missing table, and
-- the client keeps playing on its local save (invariant 10). Re-applying is a
-- no-op (`if not exists`, `create or replace`, idempotent grants).
--
-- ORDERING NOTE. Code deploys itself and schema does not. Until this file is
-- applied, `FW_PROGRESS_SYNC` stays unset on Vercel and both routes answer
-- 503 SERVER_NOT_READY before touching the database.
