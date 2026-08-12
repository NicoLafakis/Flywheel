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

// Which tier a player who has never opened SETTINGS starts on.
//
// It is a DEFAULT, not a classifier: the moment the Graphics detail button is
// pressed, `settings.qualityChosen` goes true and this function is never
// consulted again on that device (js/save.js, main.js `wantedTier`). Nothing
// here watches frame times and nothing changes mid-session — that machinery was
// removed on purpose and is not coming back through this door.
//
// The test is the same `(hover: none) and (pointer: coarse)` query css/main.css
// uses for its device block and Controls uses for the joystick, so the tier, the
// HUD and the stick can never disagree about what a phone is. It deliberately
// omits Controls' extra width clause: that clause exists because a MOUSE in a
// phone-width window still needs touch controls, and a mouse in a narrow window
// is attached to a desktop CPU, which is the thing this default is about.
//
// Why LOW is the honest default on a phone: measured on a Pixel-5 profile at 4x
// CPU throttle, HIGH on Brooklyn never reached a playable frame at all, while
// LOW held a steerable frame through the same window. A default that produces a
// frozen tab is not a "better graphics" default, it is a broken one.
export function defaultTierForDevice() {
  try {
    if (typeof matchMedia === 'function'
        && matchMedia('(hover: none) and (pointer: coarse)').matches) return 'low';
  } catch (e) { /* no matchMedia (headless/older) — fall through to HIGH */ }
  return 'high';
}

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
//                    It is 2 on BOTH tiers, which is the one lever below that is
//                    NOT tier-differentiated. Six was never a quality choice, it
//                    was the arithmetic ceiling `0.1 / FIXED_DT` left unexamined:
//                    the instant a device cannot finish one sub-step inside a
//                    frame it is asked for six, so a 4x CPU slowdown produced a
//                    16x frame-time blowup (measured on a Pixel-5 profile at 4x:
//                    Brooklyn pegged at ~1 fps / ~1000 ms frames from the first
//                    seconds, the sim advancing 6 s of game time per 60 s of
//                    wall clock). A device that is coping never owes more than
//                    one sub-step, so the cap costs it nothing; a device that is
//                    not gets slow motion it can still steer instead of a freeze.
//   dpr            — no-op on a 1x panel by construction; 2.25x fewer fragments
//                    on a 3x phone panel, shadow pass included.
//   shadows        — a second draw of every casting bucket.
//   ambient        — 0.4% of CPU. Included because it is free once the tier is
//                    already down, not because it buys anything. Do not sell it.
//
// HIGH keeps every SIM-TRAJECTORY lever of the pre-tier build: Infinity /
// Infinity / 2 / 1. That is deliberate and load-bearing — a default-tier sim
// must stay byte-identical, and `tools/validate.mjs` never constructs a tier at
// all. `maxSubSteps` is the one number that moved off the pre-tier value (6 -> 2)
// and it is NOT one of those levers: it lives in main.js's real-time catch-up
// loop, not in `sim.tune`, so it changes how much game time a wall-clock second
// buys, never what a given sequence of steps computes. The validator does not
// run that loop, and the lockstep arena runs its own.
//
// HIGH is the DEFAULT for a fresh save on a fine-pointer device; a coarse-pointer
// device that has never been to SETTINGS defaults to LOW instead (see js/save.js
// and main.js's wantedTier).
export const TIERS = {
  high: { dpr: 1.5, shadows: true, ambient: true, debrisCap: Infinity, contactBudget: Infinity, contactRounds: 2, supportEvery: 1, maxSubSteps: 2 },
  low: { dpr: 1, shadows: false, ambient: false, debrisCap: 280, contactBudget: 200, contactRounds: 1, supportEvery: 2, maxSubSteps: 2 },
};
