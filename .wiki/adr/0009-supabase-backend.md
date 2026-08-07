# ADR-0009: Introduce a backend and end the static-only constraint

- **Status:** accepted
- **Date:** 2026-08-06
- **Deciders:** Nico, Claude Opus 5

## Context

`docs/PRD.md` opens by declaring the game "a **fully static web app** (no
backend, no build step)" and §8 hardens that into a constraint: "No bundler, no
server code, no network calls beyond CDN." That premise has been correct for
every day of the project's life. It is what made `tools/validate.mjs` possible,
it is why there is no dependency tree to rot, and it is why the game can be run
by opening `index.html` over any file server.

UNBOUND breaks it. The game is going to a conference booth in front of HubSpot
partners, and the product owner has decided it needs player accounts,
achievements, a live shared arena, and leaderboards scoped by event, city,
level and all-time — with lead capture as an explicit goal. Every one of those
requires state that outlives one browser's `localStorage`, an identity that is
the same person on two devices, and a party that is not the player deciding
whether a score is real. None of that is reachable from a static file.

So the question is not whether to add a backend. It is how much of the static
premise has to die to get one, and the answer we want is: the persistence and
identity half, and none of the *build* half. The no-build-step rule is not
sentimentality — it is why anyone can open this repo and change a file, why
there is nothing to keep upgrading, and why a CDN outage is the only supply
chain we have.

## Decision

Adopt **Supabase** (Postgres, Auth, Realtime, Edge Functions, RLS) as the
backend and **Vercel** for static hosting. Projected steady-state cost is $0 on
free tiers. Plan pricing, verified 2026-08-06: **Supabase Free is $0, Supabase
Pro is $25/month** — the "$10" quoted earlier is a compute credit inside Pro,
not a plan price. Pro is the recommendation for the event month because Free
pauses a project after ~7 days of inactivity; the plan choice itself is Nico's
and is still open. See
`../features/online-flywheel/03-technical-design.md` §7 and
`../features/online-flywheel/10-observability-and-nfr.md` §4.

The no-build-step invariant survives, and survives specifically:

- `@supabase/supabase-js` loads through the **existing importmap**, exactly as
  three.js does. Pinned version, no bundler, no `package.json` for the game.
- A second importmap entry points at a **committed, same-origin copy** of the
  same prebuilt ESM file under `vendor/`, and `js/net/client.js` falls back to
  it when the CDN import rejects. A vendored artifact is not a build step —
  nobody runs a tool — and `tools/validate.mjs` pins its SHA-256 so a silent
  swap is loud. three.js gets the same treatment in the same commit, closing a
  single point of failure that predates this decision.
- Edge Functions are Deno and live in `supabase/functions/`, outside the
  browser constraint entirely. They import the pure sim files unchanged — the
  same trick `tools/validate.mjs` already plays from Node.
- The game boots, plays the 100-level campaign, and plays every voxel sandbox
  with the entire `js/net/` tree deleted and the machine in airplane mode. This
  is written into `AGENTS.md` as an invariant, not left as an intention.

`docs/PRD.md` §8 is amended rather than deleted; see
`.wiki/features/online-flywheel/01-prd.md`.

## Consequences

What gets easier: identity, cross-device progress, leaderboards, a shared
arena, and — because Edge Functions can import `sim.js` — server-side score
verification that costs one function instead of a rewrite.

What gets harder, honestly:

- **The project is no longer self-contained.** "Open index.html and it works"
  becomes "open index.html and the game works; the online half needs a
  project." Onboarding gains a `.env`-shaped step it never had.
- **There is now a thing that can be down**, and a bill that can arrive, and a
  vendor whose API can change under us. Zero of those existed before.
- **A second runtime.** Deno for Edge Functions means two JavaScript
  environments to keep the pure sim honest in, and a sim change now has to be
  deployed to both or scores become unverifiable.
- **Secrets exist.** There was nothing to leak; now there is a service-role key
  that must never reach the client.
- **Migrations exist.** `save.js`'s versioned-migration discipline (hard rule
  6) now has a Postgres-shaped sibling, with the same failure mode and a
  bigger blast radius.

What we deliberately keep: no bundler, no transpiler, no lockfile for the game,
no framework, and a repo where every file the browser runs is the file that is
written.

## Alternatives Considered

- **Stay static; fake it with a shared read-only JSON leaderboard** — rejected:
  no identity, no writes, no arena. It answers a different, smaller ask.
- **Vercel serverless functions + a hosted Postgres** — rejected: equivalent
  capability, but Auth, Realtime and RLS would all be hand-built, and building
  auth is how a conference deadline is missed.
- **Firebase** — rejected: strong realtime and anonymous-auth-upgrade story,
  but the leaderboard/belt/replay half wants Postgres and a runtime that can
  `import` our own ES modules. Full comparison in
  `.wiki/features/online-flywheel/03-technical-design.md` §6.
- **Accept a build step and use a framework** — rejected: it would buy nothing
  this feature needs and would end the one property that has kept this codebase
  cheap to change.
- **Load supabase-js only from the CDN, with no vendored fallback** — rejected:
  the deployment environment is a conference venue's wifi, where third-party
  DNS is exactly what fails first.

## Related

- 0002 sim/render split — the reason a Deno function can score a browser's run
- 0003 deterministic seeded generation — the reason that score is trustworthy
- 0010 host-authoritative arena over Supabase Realtime
