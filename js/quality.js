// Two hand-picked device quality tiers. The player chooses; nothing guesses.
//
// This module used to be a policy table, a device classifier and a live
// frame-time controller. The classifier and the controller are gone — full
// graphics or not, chosen in SETTINGS, is the whole of the contract now. What
// remains is the policy table, which is the part that was ever measured.
//
// It still imports nothing from the game: main.js is what pushes a tier into
// the renderer and the sim.
//
// What it is NOT: a GPU story. The sandbox is CPU-bound — measured on an RTX
// 4060 Ti, `world.render` (35 draw calls, ~1M triangles) is 0.60 ms/frame while
// debris physics alone is 7.11 ms. Every lever below that actually moves a
// phone's frame time is a CPU lever; the pixel-ratio one is here because a 3x
// phone panel is the one place the GPU DOES bind.

// Ordered best-first. Two entries, so "the other one" is the only step there is.
export const TIER_ORDER = ['high', 'low'];

// The levers, all of them measured on the Boston profile (82,894 blocks,
// SIZE 5, 45 s) unless noted:
//   debrisCap      — loose debris physics is 47.7% of CPU and the only cost that
//                    grows without bound during a session. The single biggest
//                    lever there is.
//   contactBudget  — the number of loose blocks the pair-relaxation may consider
//                    per step, nearest the hole first. This is the lever that
//                    actually binds a runaway session: measured at 4x throttle on
//                    Brooklyn, a sustained run reaches ~800 loose blocks costing
//                    1266 ms/frame in that pass, and `debrisCap` alone barely
//                    dents it because most of that pile is debris resting on other
//                    DEBRIS, which must not be slept onto a support that can
//                    vanish (it hangs in the sky) — `_capDebris` skips it via
//                    `_looseSup`. Excluded blocks are parked, not integrated:
//                    see the long note in _resolveDebrisContacts.
//   contactRounds  — `_resolveDebrisContacts` is 24.9% of CPU on its own; the
//                    second relaxation round is roughly half of that.
//   supportEvery   — `_recalcSupport` is 8.6%; this amortises the coverage-driven
//                    half of its trigger (a graph change still recalcs at once).
//   maxSubSteps    — the fixed-timestep catch-up ceiling (main.js). The biggest
//                    lever of all on a device that is already behind, because it
//                    is the one that breaks the positive feedback loop rather
//                    than shaving a constant off it. See the note at the loop.
//   dpr            — no-op on a 1x panel by construction; 2.25x fewer fragments
//                    on a 3x phone panel, shadow pass included.
//   shadows        — a second draw of every casting bucket.
//   ambient        — 0.4% of CPU. Included because it is free once the tier is
//                    already down, not because it buys anything. Do not sell it.
//
// HIGH is exactly the pre-tier build: Infinity / Infinity / 2 / 1 / 6 / 1.5 / on / on. That is
// deliberate and load-bearing — a default-tier sim must stay byte-identical, and
// `tools/validate.mjs` never constructs a tier at all. HIGH is also now the
// DEFAULT for a fresh save (see js/save.js), so that byte-identity is what an
// untouched settings screen ships.
export const TIERS = {
  high: { dpr: 1.5, shadows: true, ambient: true, debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1, maxSubSteps: 6 },
  low: { dpr: 1, shadows: false, ambient: false, debrisCap: 280, contactBudget: 200, contactRounds: 1, supportEvery: 2, maxSubSteps: 2 },
};
