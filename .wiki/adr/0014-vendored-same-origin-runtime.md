# ADR-0014: Third-party runtime code is vendored and same-origin, and the site stays no-build

- **Status:** accepted
- **Date:** 2026-08-09
- **Deciders:** Nico, Claude Opus 5

## Context

`index.html`'s import map resolved the bare specifier `three` to
`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`, which made a
third-party host a hard dependency of the boot. Every module under `js/` imports
`three` directly or transitively, so if that one fetch does not land, nothing in
the module graph evaluates.

That is not hypothetical. The fetch failed live during a session with
`ERR_CONNECTION_RESET` and succeeded on a retry minutes later — a flaky
real-world failure, not a sandbox artifact. The consequence was worse than the
outage: `js/main.js` never ran, so nothing removed `#boot-splash`, and the game
sat on "FLYWHEEL / LOADING…" indefinitely with no error, no diagnosis, and no
way for a player to tell that anything was wrong. The splash comment at
`index.html:20` records what it was built for — 10-15 s cold loads observed in
playtest, i.e. the **slow** case. The **failed** case had no path at all. The
game is being demoed at UNBOUND on venue wifi, which moves this from a tail risk
to an expected one.

Two existing commitments constrain the fix. The site has no build step, no
`package.json` and no lockfile: what is committed is byte-for-byte what the
browser gets, which is what makes the deploy story "copy the repo root to any
static host" (`runbooks/run-and-validate.md`) and what lets `tools/validate.mjs`
import the shipping pure-sim modules under Node with no transform in between
(ADR-0002). And `conventions.md` already refuses new runtime dependencies for
cosmetic reasons — ADR-0005 turned down a webfont on exactly this ground.

ADR-0009 anticipated the problem for the Supabase client and proposed a
CDN-primary chain with a committed same-origin copy as fallback, noting in
passing that "a vendored artifact is not a build step". That reasoning was
right; the ordering was not, and this ADR settles it in the other direction for
all runtime code.

## Decision

**Third-party runtime code is committed to `js/vendor/`, referenced by relative
path, and never fetched from another origin at boot. The site stays no-build.**
Concretely:

- `three@0.160.0` ships as `js/vendor/three.module.js` (1,272,972 bytes,
  `REVISION '160'`, 416 named exports, MIT banner intact — verified to be the
  real module rather than an error page saved under the right name). The import
  map points at `./js/vendor/three.module.js`. The pin is unchanged; vendoring
  is not an occasion to upgrade, and the two must not be bundled.
- `js/vendor/` holds code we do not author. Nothing in it is edited; a version
  change replaces the file wholesale. That keeps third-party bytes out of the
  hand-written `js/` namespace while still being a plain same-origin path a
  static host serves without configuration.
- **No `package.json`, no lockfile, no bundler.** A committed artifact is not a
  build step, which is the property that lets this decision hold without
  touching ADR-0002's guarantee that the validator runs the shipping modules.
- The **failed**-boot case gets a path of its own, separate from the splash that
  covers the slow case: an inline classic (deliberately non-module) watchdog in
  `index.html` rewrites the splash to "The game could not start. Please reload
  the page to try again." after 20 s, or immediately on an uncaught error or
  rejection while the splash is still up. 20 s clears the observed 10-15 s cold
  loads with margin, so it cannot fire on a working-but-slow boot. The error
  listener registers in the **capture** phase because a module script that
  cannot fetch itself fires a *non-bubbling* error on its own element, which a
  plain bubble-phase window listener never sees — precisely the failure being
  watched — and targets are filtered to scripts so one missing texture cannot
  claim the game failed to start. `js/main.js` is not modified and does not know
  the watchdog exists: the contract runs one way, `main.js` removes
  `#boot-splash` when the first screen can mount, and every path in the watchdog
  re-queries the live DOM and no-ops if the element is gone.
- **`validateOfflineBoot()` in `tools/validate.mjs` enforces the rule**, so it
  is a gate rather than a habit. It fails on any external-origin runtime
  dependency in `index.html` — import-map target, `<script src>`, or
  `<link href>` — and on a missing or unparseable import map, since the browser
  drops a malformed map whole and every bare `three` import then fails. It was
  proved in both directions: pointed back at jsdelivr it exits 1, restored it
  passes. A check never seen to fail is not a check.

## Consequences

The game boots from one origin. A CDN outage, a DNS failure, a captive portal or
a blocked host can no longer stop it, and the only remaining boot dependency is
the host serving the game itself — which, if it is down, there is no game to
load anyway. This closes what ADR-0009 called "the only supply risk" for the
current tree.

Cost: 1.24 MB of third-party source in the repository, and dependency updates
become a manual, deliberate act — download, verify, replace, re-validate — with
no tool to run and nothing to tell us a new version exists. That is the intended
trade at this size. One pinned dependency does not need a package manager, and
the manual step is a feature while the count stays this low; if it grows past a
handful, revisit rather than tolerate.

`ADR-0009`'s planned Supabase client loading now inverts: the vendored copy is
the import-map target and the CDN is not in the chain at all, which also removes
the `three/local` fallback-entry machinery
(`features/online-flywheel/03-technical-design.md` §5) that only existed to work
around a CDN-primary map. That package's docs still describe the old ordering
and should be reconciled when it is next opened; nothing is built there yet, so
nothing is broken by the difference today.

The watchdog trades a small amount of duplicated knowledge (it knows the splash
element's id and shape) for independence from the module graph, which is the
only way to report a module-graph failure. Because it re-queries the DOM on
every path, a gameplay error after a successful boot hits the same guard and is
correctly ignored.

**One gap this decision surfaces but does not close.** `node --check` and a full
`ALL PASS` from `tools/validate.mjs` were both observed on a renderer file the
browser refuses to parse, because the validator drives the pure sim and never
loads the render ring. No existing gate can see a broken renderer; the watchdog
is currently the only thing that surfaces it, and it is how that breakage was
found. Confirming a boot means loading the module graph in a real browser — see
`runbooks/run-and-validate.md`.

## Alternatives Considered

- **Keep the CDN, add a fallback chain in the import map** — the ADR-0009
  design, applied to three.js. Rejected: an import map maps one specifier to one
  URL and has no built-in fallback list, so this needs a second `three/local`
  entry plus a wrapper module that catches the rejection and re-imports — real
  machinery, in the boot path, to buy nothing the vendored copy does not already
  give. The fallback also only helps once the *primary* has failed, so the good
  case still pays a third-party round trip on every cold load, and the bad case
  pays a timeout before recovering. When our own origin is the reliable one, it
  should be the first choice, not the second.
- **A package manager plus a bundler** (`package.json`, `npm`/`pnpm`, Vite or
  esbuild). Rejected: it solves dependency hygiene we do not have a problem with
  — one pinned dependency — at the cost of the constraint the rest of the
  architecture rests on. It puts a generated artifact between the source and
  both of its consumers, so `tools/validate.mjs` would either import
  pre-bundle source (proving something other than what ships, against ADR-0002)
  or post-bundle output (a second toolchain in the validator). It also ends the
  "copy the repo root to a static host" deploy and adds a build that can fail.
- **Ship a smaller three.js build, or tree-shake it.** Rejected as out of scope
  and as the same decision in disguise: tree-shaking is a bundler, and a
  hand-trimmed engine is a fork of `js/vendor/`'s no-edit rule. 1,272,972 bytes
  served same-origin, once, is not the problem being solved.
- **Retry the CDN fetch, or just show an error and let the player reload.**
  Rejected as insufficient on its own: a retry is what the player already does
  by reloading, and the observed failure was a connection reset that a retry
  minutes later cleared — which is exactly the wait a person at a conference
  booth will not sit through. The error message shipped anyway, because it is
  the right behaviour for *any* boot failure, not just this one; it is a
  complement to vendoring, not a substitute for it.

## Related

- 0002 sim/render split — the reason the no-build constraint is load-bearing:
  the validator imports the shipping modules directly
- 0005 shared brand layer — the "no new dependencies" constraint this extends
  from cosmetics to the runtime
- 0009 Supabase backend — proposed the CDN-primary, vendored-fallback chain this
  decision inverts (planned, not built)
- `runbooks/run-and-validate.md` — how to confirm a boot, and the offline-boot
  gate
- `architecture.md` — "Boot"
