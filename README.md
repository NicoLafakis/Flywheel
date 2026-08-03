# Hole City

A browser-based 3D city-eater game (hole.io-style). Fully static — no backend,
no build step. Three.js loads from a CDN importmap.

## Run

Serve the folder with any static file server, then open `index.html`:

```
python -m http.server 8000     # then http://localhost:8000/
```

(Any static host works: GitHub Pages, Netlify, `npx serve`, etc.)

## Controls

- **Desktop**: WASD / arrows move (camera-relative), Q/E orbit, R/F zoom, Esc pause.
- **Mobile**: left-half touch = virtual joystick, right-half drag = camera orbit.
- **Voxel Sandbox**: drive-style — W/S throttle forward/back, A/D turn the
  heading left/right (turn in place; the chase camera swings behind it),
  Q/E sidestep (strafe), R/F zoom. Turn and sidestep are separate keys;
  the full per-mode list is in SETTINGS → CONTROLS.

## Voxel Sandbox

From the title screen: **VOXEL SANDBOX**. A free-play physics mode — the hole
excavates a block-built city from underneath: a tower, warehouse, house,
shop, church, brownstone, apartment block, parking garage, gas station,
construction crane, elevated bridge + train, 8 vehicles, and a street-furniture
strip (~3,800 blocks, ~30 object kinds). Blocks lose support, creak (orange
heat glow), then crumble into the hole rim-first; rigid chunks tip and split
by material strength. Bricks come in 0.25/0.5/1/2 m sizes — an object's
physical size and its brick density are independent (same footprint, more
detail). Drive controls: W/S throttle, A/D turn, Q/E sidestep; the camera
chases behind your heading.

**NYC: LOWER MANHATTAN** is the second, bigger level: ~11,900 blocks of
downtown — One WTC with its spire, the twin memorial pools, a Woolworth-style
setback tower, a glass slab tower, the Wall St bank canyon, an elevated
train over Pearl St, Trinity Church, City Hall, Battery Park with the
Charging Bull, and a ferry pier on the harbor. Same physics, bigger world
(±40 m), SIZE ladder scaled to the bigger city.

## Validate (beatability proof)

```
node tools/validate.mjs        # all 100 levels + voxel sandbox checks
node tools/validate.mjs 42     # one level
```

Rebuilds every level from its seed with the same code the game runs, then asserts:
no overlapping placements, a guaranteed snack ring (first eat < 1 s), and that a
greedy bot beats the mass target with >= 15% of the clock to spare. Also asserts
the voxel sandbox is deterministic (identical seeded runs), spawn-stable, and
collapses progressively — and greps all pure-sim files for `Math.random()`.

## Docs

- `.wiki/INDEX.md` — living engineering wiki (architecture, modules, ADRs)
- `docs/PRD.md` — requirements (size ladder, campaign, mechanics, saves)
- `docs/ARCHITECTURE.md` — module map and design decisions
- `docs/TUNING.md` — growth math and the proof methodology
