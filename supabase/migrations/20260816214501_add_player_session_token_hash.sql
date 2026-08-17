-- `players.token_hash` was carrying two incompatible meanings, and only one of
-- them could ever be true for a given row. `name/claim` and
-- `name/transfer/redeem` store sha256(bearer token) there, which is exactly what
-- `playerForToken()` in `api/_lib.mjs` compares an incoming token against.
-- `auth/register` and `auth/login` store HMAC-SHA256(password) there instead,
-- then hand the browser an unrelated random token whose hash was never written
-- anywhere. No token value satisfies both functions over both inputs, so every
-- password account was created holding a credential that authenticates nothing:
-- it could not rename itself, remove itself, or start a name transfer, and
-- because `js/board/run.js`'s startTicket() sends the player binding whenever a
-- secret exists and `run/start` rejects an invalid one outright, it could not
-- get a ranked ticket at all. Every run those players finished was silently
-- unranked.
--
-- The two hashes need two columns; there is no encoding trick that makes one
-- column mean both without making the password verifier and the session
-- credential derivable from each other. So: `token_hash` keeps its original
-- meaning per account kind, and `session_token_hash` holds the bearer credential
-- for the password accounts that need somewhere separate to put it.
--
-- Additive and nullable on purpose. Existing rows are untouched and stay valid:
-- a null session hash means "device-token account", which is every row that
-- exists today, and `playerForToken()` falls back to `token_hash` for exactly
-- those. Nothing is backfilled, because there is nothing to backfill - a session
-- hash can only be created by a login, and inventing one would be inventing a
-- credential.
alter table public.players add column if not exists session_token_hash bytea;

comment on column public.players.session_token_hash is
  'sha256(bearer token) for password accounts (auth/register, auth/login). Null for device-token accounts (name/claim, name/transfer/redeem), which keep sha256(token) in token_hash. When non-null it is the ONLY value playerForToken() will accept, so a password digest can never stand in as a bearer target.';

-- Both RPCs below already rotate `token_hash` when a device stops owning a name.
-- Now that a second credential column exists they have to clear it in the same
-- statement, or the rotation is cosmetic: a removed or transferred name would
-- leave the old device holding a session token that still validates. Re-created
-- verbatim from 20260812204210_scoreboards_profiles.sql with that one line
-- added, since `create or replace function` has no partial form.

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
  -- Redeeming hands ownership to the redeeming device: the new device token
  -- becomes the account's only credential, so any session minted by a password
  -- login on the previous device dies here rather than outliving the transfer.
  update public.players set token_hash = decode(p_token_hash_hex, 'hex'),
      session_token_hash = null,
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
  -- The zeroed `token_hash` is unreachable by construction (no input hashes to
  -- 32 zero bytes); `session_token_hash` has to be nulled rather than zeroed for
  -- the same effect, because null is what marks a row as having no session at
  -- all. Without this line a player who asked to be deleted would keep a working
  -- bearer token against the retired row.
  update public.players set name = 'Retired Sprocket', name_key = null,
      moderation_state = 'hidden', token_hash = decode(repeat('00', 32), 'hex'),
      session_token_hash = null,
      token_version = token_version + 1, last_seen_at = now()
   where id = p_player_id;
  insert into public.operator_audit (player_id, action, reason)
    values (p_player_id, 'delete', 'player requested deletion');
end;
$$;
