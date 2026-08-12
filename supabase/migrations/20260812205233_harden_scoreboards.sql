-- Explicit deny policies make the raw-table boundary visible to the advisor as
-- well as to a reviewer. `service_role` still bypasses RLS for Vercel only.
create policy "raw players deny browser" on public.players
  for all to anon, authenticated using (false) with check (false);
create policy "raw runs deny browser" on public.runs
  for all to anon, authenticated using (false) with check (false);
create policy "raw inputs deny browser" on public.run_inputs
  for all to anon, authenticated using (false) with check (false);
create policy "raw tickets deny browser" on public.run_tickets
  for all to anon, authenticated using (false) with check (false);
create policy "raw transfers deny browser" on public.name_transfers
  for all to anon, authenticated using (false) with check (false);
create policy "raw blocklist deny browser" on public.blocked_names
  for all to anon, authenticated using (false) with check (false);
create policy "raw reports deny browser" on public.moderation_reports
  for all to anon, authenticated using (false) with check (false);
create policy "raw submission log deny browser" on public.submission_log
  for all to anon, authenticated using (false) with check (false);
create policy "raw operator audit deny browser" on public.operator_audit
  for all to anon, authenticated using (false) with check (false);

create index board_public_player_idx on public.board_public (player_id);
create index name_transfers_player_idx on public.name_transfers (player_id);
create index operator_audit_player_idx on public.operator_audit (player_id);
create index run_tickets_player_idx on public.run_tickets (player_id);
create index submission_log_player_idx on public.submission_log (player_id);

create or replace function public.fw_rank_points(p_rank integer)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_rank = 1 then 100 when p_rank = 2 then 80 when p_rank = 3 then 65
    when p_rank = 4 then 55 when p_rank = 5 then 45
    when p_rank between 6 and 10 then 40 - (p_rank - 6) * 4
    when p_rank between 11 and 25 then 20 - (p_rank - 11)
    else 3
  end
$$;
