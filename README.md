# Flywheel

**A sprocket's story.**

A browser-based 3D city-eater game (hole.io-style). Fully static - no backend,
no build step. Three.js loads from a CDN importmap.

## Run

Serve the folder with any static file server, then open `index.html`:

```
python -m http.server 8000     # then http://localhost:8000/
```

(Any static host works: GitHub Pages, Netlify, `npx serve`, etc.)

## Title screen

The branded landing screen: a rotating voxel sprocket mark, the FLYWHEEL
wordmark, **PLAY** for the 100-level campaign, then a **Free play** shelf of the
voxel cities (Brooklyn, Lower Manhattan, Upper Manhattan, Sandbox) and the shop
and settings below it.

## Controls

- **Desktop**: WASD / arrows move (camera-relative), Q/E orbit, R/F zoom, Esc pause.
- **Mobile**: left-half touch = virtual joystick, right-half drag = camera orbit.
- **Voxel Sandbox**: drive-style — W/S throttle forward/back, A/D turn the
  heading left/right (turn in place; the chase camera swings behind it),
  Q/E sidestep (strafe), R/F zoom. Turn and sidestep are separate keys;
  the full per-mode list is in SETTINGS → CONTROLS.

## Voxel Sandbox

From the title screen, under Free play: **SANDBOX**. A physics mode where the
hole excavates a block-built city from underneath: a tower, warehouse, house,
shop, church, brownstone, apartment block, parking garage, gas station,
construction crane, elevated bridge + train, 8 vehicles, and a street-furniture
strip (~3,800 blocks, ~30 object kinds). Blocks lose support, creak (orange
heat glow), then crumble into the hole rim-first; rigid chunks tip and split
by material strength. Bricks come in 0.25/0.5/1/2 m sizes — an object's
physical size and its brick density are independent (same footprint, more
detail). Drive controls: W/S throttle, A/D turn, Q/E sidestep; the camera
chases behind your heading.

**LOWER MANHATTAN** is the second, bigger level: ~25,800 blocks of the
downtown peninsula — One WTC with its spire, the twin memorial pools, a
Woolworth-style setback tower, the Wall St bank canyon, an elevated train,
Trinity Church, City Hall, the Seaport piers and tall ship, Battery Park with
the Charging Bull, and the ferry terminal. Same physics, bigger world, SIZE
ladder scaled to the bigger city.

**UPPER MANHATTAN** is the Central Park district (~8,400 blocks: the
Reservoir, The Lake, Harlem Meer, Belvedere Castle, the Met, Museum Mile, the
Upper West Side). **BROOKLYN** is the showcase scene (~39,980 blocks, the
bridges out to Coney Island) and the only one that opens on an establishing
shot, held by a READY gate until you start.

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
