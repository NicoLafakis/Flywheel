-- Scoreboards & Profiles. All score-bearing source tables are private to the
-- Vercel verifier; the only anonymous relation is a deliberately narrow,
-- server-maintained publication cache read through the two board views.

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text unique,
  token_hash bytea not null,
  token_version integer not null default 1 check (token_version > 0),
  moderation_state text not null default 'ok'
    check (moderation_state in ('ok', 'renamed', 'hidden')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key,
  player_id uuid references public.players(id),
  season_id integer not null default 1 check (season_id > 0),
  scene_id text not null,
  mode text not null default 'run90' check (mode in ('run90', 'run60')),
  seed text not null,
  tick_count integer not null check (tick_count > 0),
  tune_id text not null,
  sim_version integer not null check (sim_version > 0),
  client_build text not null,
  claimed_score bigint not null check (claimed_score >= 0),
  verified_score bigint,
  stats jsonb not null default '{}'::jsonb,
  verdict text not null default 'pending'
    check (verdict in ('pending', 'verified', 'unranked', 'unverifiable', 'mismatch', 'flagged')),
  verdict_detail jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table public.run_inputs (
  run_id uuid primary key references public.runs(id) on delete cascade,
  encoding text not null check (encoding = 'rle-i8-v1'),
  payload bytea not null check (octet_length(payload) <= 32768),
  byte_len integer not null check (byte_len between 1 and 32768),
  sha256 bytea not null
);

create table public.run_tickets (
  id uuid primary key,
  player_id uuid references public.players(id),
  device_key text not null check (char_length(device_key) between 16 and 128),
  scene_id text not null,
  seed text not null,
  mode text not null check (mode in ('run90', 'run60')),
  tune_id text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  check (expires_at > issued_at)
);

create table public.name_transfers (
  code text primary key check (code ~ '^[BCDFGHJKMNPQRSTVWXZ23456789]{6}$'),
  player_id uuid not null references public.players(id),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.blocked_names (
  pattern text primary key,
  severity integer not null check (severity between 1 and 4),
  category text not null,
  is_exact boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  reporter_device_key text not null check (char_length(reporter_device_key) between 16 and 128),
  created_at timestamptz not null default now()
);

create table public.submission_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id),
  device_key text not null check (char_length(device_key) between 16 and 128),
  kind text not null check (kind in ('ticket', 'ticket-ip', 'submit', 'submit-ip', 'claim', 'claim-ip', 'report')),
  created_at timestamptz not null default now()
);

create table public.operator_audit (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id),
  action text not null check (action in ('rename', 'hide', 'delete')),
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- This table is a publication projection, not a second score authority. It
-- contains only fields that a board intentionally makes public. Keeping the
-- projection separate lets the public views use `security_invoker = true`
-- without granting the browser access to a raw name, token, trace or score row.
create table public.board_public (
  run_id uuid primary key references public.runs(id) on delete cascade,
  player_id uuid not null references public.players(id),
  scene_id text not null,
  season_id integer not null,
  name text not null,
  moderation_state text not null check (moderation_state in ('ok', 'renamed', 'hidden')),
  score bigint not null check (score >= 0),
  verified_at timestamptz not null
);

create index runs_board_idx on public.runs (scene_id, season_id, verified_score desc, verified_at asc)
  where verdict = 'verified';
create index runs_player_idx on public.runs (player_id, created_at desc);
create index runs_pending_idx on public.runs (created_at asc) where verdict = 'pending';
create index tickets_device_idx on public.run_tickets (device_key, issued_at desc);
create index submission_log_rate_idx on public.submission_log (device_key, kind, created_at desc);
create index reports_player_idx on public.moderation_reports (player_id, created_at desc);
create index board_public_city_idx on public.board_public (scene_id, season_id, score desc, verified_at asc)
  where moderation_state = 'ok';

alter table public.players enable row level security;
alter table public.runs enable row level security;
alter table public.run_inputs enable row level security;
alter table public.run_tickets enable row level security;
alter table public.name_transfers enable row level security;
alter table public.blocked_names enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.submission_log enable row level security;
alter table public.operator_audit enable row level security;
alter table public.board_public enable row level security;

create policy "published board rows are readable" on public.board_public
  for select to anon, authenticated using (moderation_state = 'ok');

create or replace function public.fw_rank_points(p_rank integer)
returns integer language sql immutable as $$
  select case
    when p_rank = 1 then 100 when p_rank = 2 then 80 when p_rank = 3 then 65
    when p_rank = 4 then 55 when p_rank = 5 then 45
    when p_rank between 6 and 10 then 40 - (p_rank - 6) * 4
    when p_rank between 11 and 25 then 20 - (p_rank - 11)
    else 3
  end
$$;

create or replace function public.fw_accept_run(
  p_run_id uuid,
  p_tick_count integer,
  p_sim_version integer,
  p_client_build text,
  p_claimed_score bigint,
  p_payload_b64 text,
  p_payload_sha256_hex text
) returns table(run_id uuid, verdict text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.run_tickets;
  existing public.runs;
  payload bytea;
begin
  select * into existing from public.runs where id = p_run_id;
  if found then
    return query select existing.id, existing.verdict;
    return;
  end if;

  update public.run_tickets
     set redeemed_at = now()
   where id = p_run_id and redeemed_at is null and expires_at > now()
   returning * into t;
  if not found then
    raise exception 'ticket is unavailable' using errcode = 'P0001';
  end if;

  payload := decode(p_payload_b64, 'base64');
  if octet_length(payload) = 0 or octet_length(payload) > 32768 then
    raise exception 'payload is outside the allowed size' using errcode = 'P0001';
  end if;

  insert into public.runs (
    id, player_id, scene_id, mode, seed, tick_count, tune_id, sim_version,
    client_build, claimed_score
  ) values (
    t.id, t.player_id, t.scene_id, t.mode, t.seed, p_tick_count, t.tune_id,
    p_sim_version, p_client_build, p_claimed_score
  );
  insert into public.run_inputs (run_id, encoding, payload, byte_len, sha256)
    values (t.id, 'rle-i8-v1', payload, octet_length(payload), decode(p_payload_sha256_hex, 'hex'));
  insert into public.submission_log (player_id, device_key, kind)
    values (t.player_id, t.device_key, 'submit');
  return query select t.id, 'pending'::text;
end;
$$;

create or replace function public.fw_record_verdict(
  p_run_id uuid,
  p_verdict text,
  p_score bigint default null,
  p_stats jsonb default '{}'::jsonb,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.runs;
begin
  update public.runs
     set verdict = p_verdict,
         verified_score = case when p_verdict = 'verified' then p_score else null end,
         stats = coalesce(p_stats, '{}'::jsonb),
         verdict_detail = nullif(p_detail, '{}'::jsonb),
         verified_at = now()
   where id = p_run_id
   returning * into r;
  if not found then raise exception 'unknown run' using errcode = 'P0001'; end if;

  if p_verdict = 'verified' and r.player_id is not null then
    insert into public.board_public (
      run_id, player_id, scene_id, season_id, name, moderation_state, score, verified_at
    )
    select r.id, p.id, r.scene_id, r.season_id, p.name, p.moderation_state, p_score, r.verified_at
      from public.players p where p.id = r.player_id
    on conflict (run_id) do update set
      name = excluded.name, moderation_state = excluded.moderation_state,
      score = excluded.score, verified_at = excluded.verified_at;
  end if;
end;
$$;

create or replace function public.fw_claim_name(
  p_name text,
  p_name_key text,
  p_token_hash_hex text,
  p_device_key text,
  p_run_id uuid
) returns table(player_id uuid, player_name text, token_version integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.players;
begin
  perform 1
    from public.runs r join public.run_tickets t on t.id = r.id
   where r.id = p_run_id and t.device_key = p_device_key
     and r.player_id is null and r.verdict = 'verified';
  if not found then raise exception 'a verified run owned by this device is required' using errcode = 'P0001'; end if;

  insert into public.players (name, name_key, token_hash)
    values (p_name, p_name_key, decode(p_token_hash_hex, 'hex')) returning * into p;
  update public.runs r set player_id = p.id
    from public.run_tickets t
   where r.id = t.id and r.player_id is null and t.device_key = p_device_key;
  insert into public.board_public (
    run_id, player_id, scene_id, season_id, name, moderation_state, score, verified_at
  )
  select r.id, p.id, r.scene_id, r.season_id, p.name, p.moderation_state,
         r.verified_score, r.verified_at
    from public.runs r
   where r.player_id = p.id and r.verdict = 'verified'
  on conflict (run_id) do update set
    player_id = excluded.player_id, name = excluded.name,
    moderation_state = excluded.moderation_state, score = excluded.score,
    verified_at = excluded.verified_at;
  insert into public.submission_log (player_id, device_key, kind)
    values (p.id, p_device_key, 'claim');
  return query select p.id, p.name, p.token_version;
end;
$$;

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
      token_version = token_version + 1, last_seen_at = now()
   where id = t.player_id returning * into p;
  return query select p.id, p.name, p.token_version;
end;
$$;

create or replace function public.fw_remove_player(p_player_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.run_inputs i using public.runs r
   where i.run_id = r.id and r.player_id = p_player_id;
  update public.runs set player_id = null where player_id = p_player_id;
  update public.board_public set moderation_state = 'hidden' where player_id = p_player_id;
  update public.players set name = 'Retired Sprocket', name_key = null,
      moderation_state = 'hidden', token_hash = decode(repeat('00', 32), 'hex'),
      token_version = token_version + 1, last_seen_at = now()
   where id = p_player_id;
  insert into public.operator_audit (player_id, action, reason)
    values (p_player_id, 'delete', 'player requested deletion');
end;
$$;

create or replace function public.fw_moderate(
  p_player_id uuid,
  p_action text,
  p_reason text default ''
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare replacement text;
begin
  if p_action = 'hide' then
    update public.players set moderation_state = 'hidden', last_seen_at = now() where id = p_player_id;
    update public.board_public set moderation_state = 'hidden' where player_id = p_player_id;
  elsif p_action = 'rename' then
    replacement := 'Sprocket-' || upper(substr(replace(p_player_id::text, '-', ''), 1, 6));
    update public.players set name = replacement, name_key = lower(replacement),
        moderation_state = 'renamed', last_seen_at = now() where id = p_player_id;
    update public.board_public set name = replacement, moderation_state = 'renamed' where player_id = p_player_id;
  else
    raise exception 'unknown moderation action' using errcode = 'P0001';
  end if;
  insert into public.operator_audit (player_id, action, reason)
    values (p_player_id, p_action, left(coalesce(p_reason, ''), 500));
end;
$$;

create view public.v_city_board with (security_invoker = true, security_barrier = true) as
with best as (
  select b.*, row_number() over (
    partition by b.player_id, b.scene_id, b.season_id
    order by b.score desc, b.verified_at asc
  ) as player_row
  from public.board_public b
  where b.moderation_state = 'ok'
), ranked as (
  select scene_id, season_id, player_id, name, score, verified_at,
    row_number() over (partition by scene_id, season_id order by score desc, verified_at asc) as rank
  from best where player_row = 1
)
select * from ranked;

create view public.v_overall with (security_invoker = true, security_barrier = true) as
select player_id, name, sum(public.fw_rank_points(rank::integer))::integer as points,
  count(*)::integer as cities, min(rank)::integer as best_rank
from public.v_city_board
group by player_id, name;

revoke all on table public.players, public.runs, public.run_inputs, public.run_tickets,
  public.name_transfers, public.blocked_names, public.moderation_reports,
  public.submission_log, public.operator_audit from public, anon, authenticated;
revoke all on table public.board_public from public, anon, authenticated;
grant select on public.board_public, public.v_city_board, public.v_overall to anon, authenticated;
grant select, insert, update, delete on table public.players, public.runs, public.run_inputs,
  public.run_tickets, public.name_transfers, public.blocked_names, public.moderation_reports,
  public.submission_log, public.operator_audit, public.board_public to service_role;
grant select on public.v_city_board, public.v_overall to service_role;

revoke all on function public.fw_accept_run(uuid, integer, integer, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.fw_record_verdict(uuid, text, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fw_claim_name(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fw_transfer_redeem(text, text) from public, anon, authenticated;
revoke all on function public.fw_remove_player(uuid) from public, anon, authenticated;
revoke all on function public.fw_moderate(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fw_accept_run(uuid, integer, integer, text, bigint, text, text),
  public.fw_record_verdict(uuid, text, bigint, jsonb, jsonb),
  public.fw_claim_name(text, text, text, text, uuid),
  public.fw_transfer_redeem(text, text), public.fw_remove_player(uuid),
  public.fw_moderate(uuid, text, text) to service_role;

-- New objects should be private by default; a future board surface must make
-- its grant and RLS policy explicit in the migration that introduces it.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
