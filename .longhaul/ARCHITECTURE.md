# Scoreboards & Profiles architecture

## Boundaries

```text
browser UI ──lazy import──> js/board/* ──fetch──> api/*.mjs ──service key──> Supabase
      │                         │                    │                        │
      └──js/main.js─────────────┴──js/replay.js──────┴──js/voxelsim.js        └──public views
```

`js/replay.js` and `js/fwmath.js` are pure shared modules. `js/board/*` owns
optional network state only; UI modules never issue raw board fetches. The game
must still boot without importing that directory.

## Ownership

| Module | Owns | Must not own |
|---|---|---|
| `js/fwmath.js` | exact bounded math helpers | sim state or browser APIs |
| `js/replay.js` | trace encoding, decoding, fixed-size input buffer helpers | UI, storage, HTTP |
| `js/voxelsim.js` | `RANKED_TUNE`, tick-bound RUN simulation | client quality policy or HTTP |
| `js/main.js` | RUN lifecycle and exactly one per-tick input write | board persistence or API details |
| `js/board/config.js` | public coordinates, flags, ranked scene configuration | tokens, writes, UI |
| `js/board/player.js` | device token and public save projection | score calculation |
| `js/board/run.js` | ticket and submission envelopes | replay algorithm or UI |
| `js/board/outbox.js` | bounded durable retry queue | rendering or rank computation |
| `js/board/read.js` | board read cache and timeouts | table writes |
| `js/ui/boards.js` | RECORDS/PROFILE interaction and a11y | HTTP protocol or token storage |
| `api/**` | request validation, HMAC, server replay, privileged writes | client UI state |
| `supabase/migrations/**` | additive schema, RLS, views, transactional RPCs | browser policy |

## Interfaces

- Every API returns `{ ok, data? , error?: { code, message, retryable } }`.
- Browser network calls carry public `device_key`; a name token is sent only to
  API routes that require ownership, never to PostgREST.
- `rle-i8-v1` is the sole trace encoding. A trace has exactly two signed-int8
  intents per tick.
- `runs.verified_score`, `points`, and rank originate only from server replay
  and read views. Client input has no field that writes any of them.
- Only `v_city_board` and `v_overall` are readable with the publishable key.
  All internal tables have RLS and no anon grants except insert-only reports.

## Deployment and security budgets

- Root remains a dependency-free static site: no root `package.json`.
- API functions use Node ESM and relative imports only; no secret reaches
  browser-loaded source.
- Browser additions (`js/board/**`, `js/ui/boards.js`, `js/replay.js`,
  `js/fwmath.js`) remain under 25 KB uncompressed.
- The ranked verifier lazy-loads only its requested city before replay.
- Views use `security_invoker`; privileged RPCs are not executable by `PUBLIC`,
  `anon`, or `authenticated`.

## Out of scope for every implementation wave

No account/auth provider, cloud save, ranked city clear, ranked arena, client
score write, direct browser table write, external SDK, or unrelated game/UI
refactor.
