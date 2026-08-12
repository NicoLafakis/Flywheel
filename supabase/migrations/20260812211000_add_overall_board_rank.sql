-- The public overall view is a derived publication, never a browser-write
-- surface. Rank is materialized in the view so page two cannot quietly relabel
-- its first row as #1.
create or replace view public.v_overall with (security_invoker = true, security_barrier = true) as
with totals as (
  select player_id, name, sum(public.fw_rank_points(rank::integer))::integer as points,
    count(*)::integer as cities, min(rank)::integer as best_rank
  from public.v_city_board
  group by player_id, name
)
select player_id, name, points, cities, best_rank,
  row_number() over (order by points desc, best_rank asc, name asc)::integer as rank
from totals;
