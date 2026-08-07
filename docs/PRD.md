# PRD — Flywheel ("A sprocket's story")

A browser-based 3D city-eater game in the hole.io genre, shipped as a **fully static
web app** (no backend, no build step). Everything below is normative.

## 1. Core loop

The player steers a hole across a dense city district. Any object whose footprint
radius is strictly smaller than the hole's current radius is swallowed on contact
(falls in, plays a shrink-and-drop animation, adds mass). Eating grows the hole's
radius. The progression fantasy: trash → bikes → cars → buses → small buildings →
medium buildings → large buildings.

## 2. Size ladder (hard requirement)

- Exactly **7 edible object tiers** on a **strict 1.35× ladder**:
  | Tier | Name            | Radius (m) | Base mass |
  |------|-----------------|------------|-----------|
  | 1    | trash / clutter | 0.35       | 1         |
  | 2    | bikes           | 0.47       | 2         |
  | 3    | cars            | 0.64       | 5         |
  | 4    | buses           | 0.86       | 12        |
  | 5    | small buildings | 1.16       | 30        |
  | 6    | medium buildings| 1.57       | 75        |
  | 7    | large buildings | 2.12       | 180       |
- Radii: `r(t) = 0.35 * 1.35^(t-1)` — exact geometric ladder, enforced by a single
  `tiers.js` constant table derived from that formula.
- **Edibility gate**: object tier `t` is edible iff `playerRadius > objectRadius(t)`.
  Gating is the *only* rule; no tier may ever be eaten early.
- Hole growth: radius is a function of total mass eaten,
  `playerRadius = clamp(0.45 + growthK * mass^0.42, 0.45, 6.0)`, tuned so the tiers
  unlock in order at a satisfying cadence (see docs/TUNING.md for the proof).

## 3. Levels

- Each level is a **dense city district**: street grid, city blocks, parks, parking
  lots, and a **waterfront** along one edge.
- **Deterministic generation from a seed** `(levelIndex)`. Same level → identical
  city, prop placement, timing, and rival behavior on every play and every machine.
  PRNG: mulberry32 over a string-hashed seed; zero use of `Math.random()` in game
  code (enforced — see validator).
- **Win condition**: reach the level's mass target before the countdown ends.
  **Fail condition**: timer hits zero below target.
- **Guaranteed snack ring**: every level spawns a ring of ≥10 tier-1/2 objects
  within 6 m of the player spawn, arranged so a greedy bot's first eat happens
  in < 1 second. Validated programmatically.

## 4. Campaign

- **100 levels** across **5 themed metro areas** (20 each):
  1. Suburbs (green, houses, mellow)
  2. Downtown (towers, dense)
  3. Harbor (waterfront-heavy, docks)
  4. Neon District (night, emissive)
  5. Old Town (tight streets, capstone finale)
- Every level introduces **exactly one new mechanic** or is a pure level; the four
  mechanics roll out in order:
  - **Golden bonus props** (from metro 1, level 6): rare gold-tinted props worth
    **8× mass** of their tier.
  - **AI rival holes** (from metro 2): 1–3 rival holes eat the same food, grow, and
    can eat props the player needs. Rivals are deterministic (seeded movement
    policy). Player and rivals cannot eat each other.
  - **Tide events** (from metro 3): at scripted times the playable bounds shrink
    (rising water); objects outside the new bounds are removed, players outside
    are pushed inward. Shrinks are part of the beatability proof.
  - **Shielded capstone landmark** (metro finales + last 10 levels): one large
    landmark with a shield that drops only after the player eats `unlockMass` of
    other objects; it is worth a large chunk of the target.
- Mechanic introduction: `levels.js` declares exactly one `introduces` field per
  level; the validator asserts the schedule is consistent.

## 5. Feel & meta

- **Combos**: eats within 1.5 s of the previous eat chain a combo; multiplier
  `1 + 0.1*(chain-1)` capped at ×3 applies to mass. HUD shows the chain.
- **Results screen**: win/fail, mass vs target, time used, best combo, and a
  **star rating** — 1★ win, 2★ win with ≥20% time left, 3★ win with ≥35% time left.
- **Currency & shop**: completing levels pays coins (base + star bonus + combo
  bonus). Shop sells cosmetics (hole skins: colors, trails) and one functional
  item per metro (e.g. +5 s clock, +5% growth). Cosmetics only affect looks;
  functional items are accounted for in the beatability proof (beatable *without*
  them).
- **World map**: metro → 20 level cards each, showing stars earned, lock state
  (level N unlocks when N−1 is won), and the mechanic introduced.
- **Persistence**: `localStorage`, key `hole-city-save`, **schema-versioned**
  (current v13) with an explicit migration for every step v1→v13. Corrupt or unversioned saves are
  quarantined, not crashed on.

## 6. Controls & camera

- **Desktop**: WASD/arrows move (camera-relative), Q/E orbit the camera, R/F zoom.
- **Mobile**: virtual joystick (left half) to move, one-finger drag on the right
  half orbits the camera. Joystick appears where the thumb lands.
- **Chase camera**: follows the hole, collision-aware — raycasts from the hole to
  the desired camera position and pulls in front of the first obstruction; pitch
  also rises when pulled in so it **never clips into buildings**.
- Art direction per the reference image: bright low-poly flat-shaded city, soft
  shadows, orthographic-ish high-angle default view, colorful building palette
  per metro.

## 7. Beatability (hard requirement)

- "Provably beatable" is enforced by `tools/validate.mjs` (run in Node, headless):
  for every level it rebuilds the exact city from the seed, runs a **greedy-route
  bot** (nearest edible object, re-planned each eat, with tide/rival/golden/landmark
  rules applied), and asserts:
  1. the bot hits the mass target with **≥ 15% of the clock to spare**;
  2. the first eat happens < 1.0 s after spawn (snack ring);
  3. no two placed objects overlap (footprint circles + margin).
- Placement guarantee: the generator places objects by rejection sampling into
  free cells; overlap is impossible by construction **and** verified post-hoc.
- Targets are set as `target = floor(0.62 * greedyBotMass)` per level so the proof
  is self-calibrating; targets are then frozen into `levels.js` and re-validated.

## 8. Tech constraints

- Static hosting only: `index.html` + ES modules + Three.js from CDN importmap.
  No bundler, no server code, no network calls beyond CDN.
- Must run by opening `index.html` over any static file server.
- 60 fps target on a mid laptop; instanced meshes for props, merged geometry for
  buildings; ≤ 1500 draw-call-free logical objects per level.
