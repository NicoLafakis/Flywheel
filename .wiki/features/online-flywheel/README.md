# Online Flywheel — planning package

Everything needed to take Flywheel from a single-player static toy to a
networked product with accounts, achievements, a live shared arena, and
four scopes of leaderboard — in time for UNBOUND, on a booth, in front of
HubSpot partners.

**As of 2026-08-10 this is no longer paperwork-only.** The multiplayer wire
layer (`js/net/**` — driver seam, protocol, snapshots, transports, the
host-authoritative loop skeleton) is built and self-tested standalone, and
Supabase (`flywheel`, ref `zrsrvhrkgfuqhcjnjezw`) and Vercel
(https://flywheel-woad.vercel.app) both exist, so credential handover no
longer blocks Phase 1. See `.wiki/architecture.md`'s Boundaries section and
`SETUP-FOR-NICO.md`. Nothing is wired into the shipped game yet — no screen
calls into `js/net/`, and accounts/leaderboard/arena remain undesigned in
code beyond the wire layer.

## Start here

- **Implementers:** [00-objective-overview.md](00-objective-overview.md) →
  [03-technical-design.md](03-technical-design.md). The overview is the spine;
  every other doc inherits its trajectory. Read it before you read a spec, or
  you will build the literal ask instead of the thing it serves.
- **Nico (product owner):** [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md). Nothing
  else in this folder is written for you, and none of it needs you to read it.

## The docs

| Doc | What it is |
|---|---|
| [00-objective-overview.md](00-objective-overview.md) | The spine. What this really serves, where it goes next, what it forecloses, and exactly where the scope line sits between "build silently" and "surface for Nico." |
| [01-prd.md](01-prd.md) | The normative product spec for online play. Extends `docs/PRD.md` rather than replacing it — and says which of its sentences it amends. |
| [02-requirements.md](02-requirements.md) | User stories with Given/When/Then acceptance criteria. This is the contract the tests check; if it is not in here, it is not verified. |
| [03-technical-design.md](03-technical-design.md) | How it is built: Supabase schema, RLS, Edge Functions, and how a backend arrives without a build step. |
| [04-netcode-design.md](04-netcode-design.md) | Host-authoritative peers over Realtime broadcast — snapshots, intent, interpolation, and host migration. |
| [05-identity-and-accounts.md](05-identity-and-accounts.md) | Guest-first play, then email OTP / Google / HubSpot. The HubSpot path is the highest-risk thing in the package. |
| [06-belts-and-achievements.md](06-belts-and-achievements.md) | The wrestling-title system: several belts held at once, each with a holder, a reign, and a way to be taken. Plus achievements. |
| [07-test-strategy.md](07-test-strategy.md) | What gets tested where, including the one thing a booth cannot afford to discover live. |
| [08-rollout-and-runbook.md](08-rollout-and-runbook.md) | Phasing, flags, and the day-of-conference runbook for whoever is standing at the booth. |
| [09-threat-model.md](09-threat-model.md) | Who attacks a leaderboard at a conference, and what stops them. |
| [10-observability-and-nfr.md](10-observability-and-nfr.md) | Latency, frame-rate, and cost budgets, and how we see a problem without buying a new SaaS. |
| [11-risk-register.md](11-risk-register.md) | Ranked risks with owners and mitigations. Conference wifi is near the top. |
| [12-migration-plan.md](12-migration-plan.md) | localStorage v13 → cloud profile, and how a guest's progress survives signing in. |
| [13-tasks.md](13-tasks.md) | Ordered, independently verifiable build tasks. |
| [SETUP-FOR-NICO.md](SETUP-FOR-NICO.md) | The accounts to create, the things to click, and the costs — in plain language. |

## New ADRs

Append-only, per `.wiki/conventions.md`. These record the decisions that this
package is not allowed to relitigate.

- `../../adr/0009-*` — Supabase as the backend, and how a backend arrives
  without breaking the no-build-step invariant.
- `../../adr/0010-*` — host-authoritative peer multiplayer over Realtime
  broadcast, rather than a dedicated game server.
- `../../adr/0011-*` — guest-first identity with deferred claim, and the custom
  HubSpot OAuth flow.
- `../../adr/0012-*` — server-side replay validation as the sole basis for
  leaderboard trust, leveraging the determinism invariant from
  [ADR-0003](../../adr/0003-deterministic-seeded-generation.md).

## Existing decisions this package builds on

- [ADR-0002 sim/render split](../../adr/0002-sim-render-split.md) — the reason
  a browser and a server can agree on a score at all.
- [ADR-0003 deterministic seeded generation](../../adr/0003-deterministic-seeded-generation.md)
  — the anti-cheat foundation. Determinism stopped being a nicety the moment
  there was a leaderboard.
- `docs/PRD.md` — the normative single-player spec. Still normative. See
  [01-prd.md](01-prd.md) §Amendments for the sentences that change.
