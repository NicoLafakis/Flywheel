-- ONE global all-time leaderboard, ranked by the sum of a player's best score
-- on each city.
--
-- Why a new view instead of reshaping `v_overall`: they answer different
-- questions and both answers are wanted. `v_overall` ranks by RANK POINTS
-- (`fw_rank_points(rank)` summed across city boards) — a positional score, so a
-- player who is 1st on one city can outrank a player who is 2nd on four.
-- `v_leaderboard` ranks by RAW SCORE summed across cities, which is the model
-- the product owner asked for: replaying a city only helps you if you beat your
-- own best on that city, and the total grows on its own as cities are added
-- because nothing here enumerates the cities.
--
-- Nothing is dropped. `v_city_board` still backs Records (a player's own bests
-- per city are `v_city_board?player_id=eq.<id>`), and `v_overall` is left in
-- place so this migration is a pure addition and a rollback is a `drop view`.
--
-- No new score authority. This view reads `board_public`, which only
-- `fw_record_verdict` and `fw_claim_name` write, and both of them write the
-- server-replayed `verified_score` — invariant 8 is untouched. It is read-only
-- and off the sim path, so invariant 10 is untouched too.

-- Sum over BEST-PER-CITY, not over every published row. `board_public` is
-- keyed by `run_id`, so a player who beats their own Chicago record twice has
-- three Chicago rows; summing raw rows would pay a player for repeating a city.
-- (`fw_record_verdict` inserts one row per verified run — one per `run_id`,
-- `on conflict (run_id)` — it does NOT keep only the best. The dedupe has to
-- happen here, which is the same thing `v_city_board`'s `best` CTE does.)
--
-- Best-per-city ignores `season_id` on purpose: "all-time" means a player's
-- highest score on a city ever, whichever season it was set in. That holds
-- whether or not seasons are ever collapsed to one.
create or replace view public.v_leaderboard
  with (security_invoker = true, security_barrier = true) as
with best_per_city as (
  select
    b.player_id,
    b.scene_id,
    b.name,
    b.score,
    b.verified_at,
    row_number() over (
      partition by b.player_id, b.scene_id
      order by b.score desc, b.verified_at asc
    ) as city_row
  from public.board_public b
  -- Redundant under `security_invoker = true` (the RLS policy on
  -- `board_public` already limits `anon`/`authenticated` to 'ok' rows) and
  -- deliberately kept: `service_role` bypasses RLS, so without this line the
  -- operator console would read a different leaderboard than the public does,
  -- and a hidden or renamed-out player would be visible in it.
  where b.moderation_state = 'ok'
), totals as (
  select
    player_id,
    -- One published name per player is the intent (`name/rename` and
    -- `fw_moderate` patch every `board_public` row), but the column is
    -- denormalised per row, so take the most recently verified spelling rather
    -- than an arbitrary one if a patch was ever partial.
    (array_agg(name order by verified_at desc, scene_id asc))[1] as name,
    sum(score)::bigint as total_score,
    count(*)::integer as cities,
    max(score)::bigint as best_city_score,
    max(verified_at) as last_verified_at
  from best_per_city
  where city_row = 1
  group by player_id
)
select
  player_id,
  name,
  total_score,
  cities,
  best_city_score,
  last_verified_at,
  -- Rank is materialized in the view for the same reason `v_overall` does it
  -- (20260812211000): a client that pages or re-sorts must not be able to
  -- relabel its first visible row as #1. `dense_rank` rather than `row_number`
  -- because an exact tie on total score is a genuine tie and should read as
  -- one; ties therefore share a rank and the row count for rank <= 10 can
  -- exceed 10.
  dense_rank() over (order by total_score desc)::integer as rank
from totals;

comment on view public.v_leaderboard is
  'THE global all-time board: one row per player, ranked by the sum of their best verified score on each city. Season-agnostic and city-count-agnostic. TOP 10 is a client concern - read it as v_leaderboard?order=rank.asc,total_score.desc,name.asc&limit=10.';

-- TOP 10 lives in the CLIENT QUERY, not in the view.
--
-- Reasoning: the cut is a presentation decision and it is already changing
-- (top 25 today in `js/board/read.js`, top 10 as asked for now, "show more"
-- later, and a "your rank" lookup that needs a row past 10). A `limit 10`
-- baked into the view would need a migration to answer any of those, and a
-- second view (`v_leaderboard_top10`) would be a second definition of the same
-- ranking to keep in sync. PostgREST already passes `limit` straight through,
-- so the client spends nothing to specify it.
--
-- The cost of NOT baking it in is that the view materializes every player
-- before the limit applies. The index below makes that a bounded cost at this
-- scale: the aggregate is a single index-only scan over the published rows, so
-- the plan is the same whether the client asks for 10 rows or 1000.
create index if not exists board_public_leaderboard_idx
  on public.board_public (player_id, scene_id, score desc, verified_at asc)
  where moderation_state = 'ok';

-- Grants match `v_city_board`/`v_overall` exactly - `select` and nothing more.
-- Required explicitly: 20260812204210 set `alter default privileges ... revoke
-- select ... on tables from anon, authenticated, service_role`, which covers
-- views, so a new view is unreadable by everyone until it is granted here.
grant select on public.v_leaderboard to anon, authenticated, service_role;

-- ROLLBACK
--
--   drop view if exists public.v_leaderboard;
--   drop index if exists public.board_public_leaderboard_idx;
--
-- Nothing else to undo: no table, column, constraint, policy, function or row
-- is touched by this file, and no existing object is redefined. Re-applying is
-- a no-op (`create or replace view`, `create index if not exists`, and a
-- `grant` that is idempotent).
--
-- One forward-compat note for whoever edits this file next: `create or replace
-- view` cannot rename, reorder, retype or remove an existing output column. A
-- later change that only APPENDS a column is fine; anything else needs a
-- `drop view public.v_leaderboard;` immediately before the `create`.
