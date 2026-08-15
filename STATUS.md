# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-14

---

## Active focus

- **Power-Up System**: Dynamic roaming power-ups with intermittent spawn/despawn lifecycle, HUD flyout notifications, screen edge ambient FX, and full WebAudio fanfares (`.wiki/modules/powerups.md`).
- **Scoreboards & Offline Fallback**: Live boards + seamless local/offline player profile creation and sync (`js/board/player.js`).
- **Timed Runs & Full Clear**: 180s clock (`js/levelclock.js`), 100% full-clear goals, verified 90s score attack on Chicago Loop.
- **T-403 — Parallel Validator**: Child processes for independent test suites, 0.4s fast check, Cambridge soak opt-in.

---

## Shipped state

- **Brand**: *Flywheel — A sprocket's story*. Branded landing screen over live city backdrop, block wordmark, legal footer.
- **Progression**: Free-play voxel sandboxes on 180s clock, 100% full-clear goal, 60 deterministic collectible coins per city, skin & indicator shop.
- **Cities (7 + Tokyo)**: Gallery, Manhattan, Upper Manhattan (73k blocks), Brooklyn (40k blocks), Boston (83k blocks), Cambridge (73k blocks), Chicago Loop (44k blocks), Tokyo (83k blocks).
- **Multiplayer & Boards**: Supabase Realtime 1v1 arena (`arena.html`); THE RUN Chicago 90s verified replay; public boards; local/cloud profiles; signed outbox.
- **Audio & Quality**: 10 streamed cues, independent audio mix controls, HIGH/LOW binary quality.

---

## Recent history

- 2026-08-15 — Short-Phone Landing Fix: On viewports under ~780px tall (iPhone SE class), the pinned chip-shelf design left RECORDS/SHOP/SETTINGS painted off-screen while the shelf's nested scroller (`overscroll-behavior: contain`) swallowed the page scroll gesture — taps meant for RECORDS landed on masked city chips ("tapped RECORDS, got Cambridge"). New `max-height: 780px` query flattens the shelf into document flow on short phones: no inner scroller, no mask, one page scroll. Verified with live hit-testing at 360×560/360×640/375×667 (flattened, RECORDS reachable) and 390×844 (pinned shelf intact).
- 2026-08-15 — SIZE 24 Ladder & Proportional Scaling Overhaul: Expanded the size progression ladder from SIZE 12 to SIZE 24 with geometric raw mass thresholds (`SIZE_MASS` extending up to 806k mass), scaling the maximum hole radius up to 12.6m (13.1m at sizeFrac 1) and `PLAYER_MAX_RADIUS` to 13.5m. Camera framing dynamically zooms out to track the player's immense scale (`base = 7 + holeRadius * 3.6`, up to ~52m distance at SIZE 24), maintaining perfect framing over colossal swallowed structures.
- 2026-08-15 — Tokyo Geographic Accuracy Pass: Remediated the Tokyo map against the real city. Removed the fictional Meiji Jingu 5-Tier Pagoda (Shinto shrines have no pagodas — that was Senso-ji) and replaced it with the Minami-Shinmon Grand Gate in unpainted cypress with a copper-patina roof; recolored the Great Torii, Haiden, and Kagura-den from vermilion to bare cypress/dark timber (vermilion is Fushimi Inari, not Meiji). Railed correctly: dropped the Shinkansen (none serve Shinjuku), relabeled the E-W viaduct as the JR Chūō Line with orange-striped E233 rapid trains, and moved the Yamanote E235 onto its own new N-S elevated track breaking at the terminal. Moved NTT Docomo Yoyogi Tower south of the station to Yoyogi (was in Nishi-Shinjuku); recolored Tochō twin towers to light granite with flat observation roofs (no helipads); separated Omoide Yokocho into its own west-exit alley strip by the tracks (Kabukicho district renamed "Kabukicho & Golden Gai"); relabeled the "Akihabara SEGA" arcades as Kabukicho's real TAITO Station & GiGO game centers.
- 2026-08-14 — Tokyo Daytime Palette Overhaul: Replaced neon/rainbow building accents (magenta, cyan, hot pink, purple, bright yellow) with realistic daytime architectural tones — muted bronze, sandstone, grey-green patina for skyscrapers; traditional cinnabar, indigo, ochre, pine green for izakaya signs; warm cream and cool grey for Harajuku boutiques; rich crimson for Kabukicho gate and 109 signage.
- 2026-08-14 — Earthquake Fault-Line Direction Fix: Rewired quake power-up so the crack starts at the player's position and extends toward the furthest map corner (was centered on player with velocity-based direction). Added propagating staggered VFX — shock rings fire sequentially along the crack over ~0.7s instead of all at once.
- 2026-08-14 — Environmental Cataclysms & Power-Up Overhaul:
  - **Fault Line Rupture (Seismic Quake Overhaul)**: Spawns a directional ground fault rupture from the impact point to the furthest map boundary, snapping building foundations and toppling skyscrapers with domino physics, subterranean tectonic rumble audio, and propagating magma crack particle bursts.
  - **Chrono Time Freeze (True World Time Stop)**: Completely pauses moving traffic and falling physics blocks in mid-air for 8s while the player zooms at hyperspeed vacuuming up frozen prey with frost screen vignette, reverse whoosh, and crystal shatter sound effects.
  - **Dynamic Tornado / Hurricane Storm System**: Schedules 3 dramatic atmospheric cataclysms per match (t=60s, 150s, 240s) with dark thunderstorm sky transitions, rolling thunder audio, and high-velocity wind vortices (Tornado rips upper floors & spires off skyscrapers inland; Hurricane unleashes coastal storm surges in harbor cities) breaking structures down into a chaotic scavenger hunt.
- 2026-08-14 — Tokyo Mega-Metropolis Expansion (83,573 blocks / 154,879 mass): Expanded `js/voxelscene-tokyo.js` into the largest, most hyper-dense city sandbox on the roster, featuring wall-to-wall infill across 5 iconic districts (Nishi-Shinjuku Skyscraper Canyon, Kabukicho & Golden Gai Izakayas, Ginza & Roppongi Hills Luxury Wards, Shibuya Scramble Crossing & 109, and Meiji Jingu Sacred Forest & 5-Tier Pagoda) with 100% static structural equilibrium (0 falling blocks at t=3s)
- 2026-08-14 — Panicked Derailment Scream SFX: Added procedural multi-voice vocal formant scream effect (`playTrainScream` in `js/audio/engine.js`) triggered whenever an elevated train track is undermined and the train plummets into the city
- 2026-08-14 — 3-Thirds Showcase Sandbox Architecture: Reorganized the full sandbox map into 3 distinct showcase zones spanning 190m × 90m (11k blocks, bounds ±95m): Zone 1 (West: Voxel models + Kenney textures), Zone 2 (Center: Kenney break-apart vehicles & suburban/commercial prefabs), Zone 3 (East: Modified Kenney mega skyscrapers up to 30m tall with modular detachable floor breakdown physics)
- 2026-08-14 — Cute Kenney-Inspired City Surface Textures: Added `mat_awning_stripe` (commercial awnings), `mat_shop_window` (storefront display glass), `mat_suburban_siding` (wood clapboard), `mat_clay_shingles` (scalloped roof tiles), and `mat_warehouse_roll` (industrial garage doors) with zero-cost procedural WebGL2 texture array support and per-block overrides
- 2026-08-14 — 5-Minute Level Duration & Perimeter Voxel Containment: Standard city goal clock extended to 5:00 minutes (300s); added perimeter boundary clamping to prevent fallen voxels from spilling outside the playable area, and calibrated ground friction for natural rubble mounds
- 2026-08-14 — Power-Up Showcase Modal & Pure Demolition: Added 5-second power-up popup card with timer progress bar & auto-resume; turned off damage color tinting so blocks break apart in their original textures and colors
- 2026-08-14 — Anti-Clustering & Power-Up Balancing: Max 4 power-ups on map, minimum 24m spatial separation on spawns, dynamic mutual repulsion on roaming items, and max 3 active buffs
- 2026-08-14 — Dynamic Roaming & Intermittent Power-Ups: Ground items actively wander city streets, expire with pre-despawn flicker (~26s), and intermittently drop every 18–28s; stripped obsolete 100-levels / campaign map UI from stats screens
- 2026-08-14 — Authentic Coin Audio & Power-Up Polish: Harmonic WebAudio synthesized coin chimes (`B5 -> E6`), 6-note arpeggio power-up fanfare, persistent HUD flyout animations, ambient screen color vignettes, and stripped repetitive crash audio
- 2026-08-14 — Visual Polish Stage 6: In-world active power-up aura rings & trail sparks, void accretion spiral depth, demolition dust poofs, combo/powerup screen edge heat vignettes, and native tactile mobile haptics
- 2026-08-14 — Visual Polish Stages 2–5: 4 architectural facade canvas textures, aggregate roads with sidewalks/curbs, procedural pads, detailed vehicles/trees/street furniture, elevated hemisphere/sun lighting & atmospheric fog, near-isometric tilt-shift camera (56° pitch, 45° FOV), and eat squash-and-stretch motion
- 2026-08-14 — Splash screen status header: always-visible Player Login, Highest Score (Overall), and next skin coin progress meter above city choices
- 2026-08-14 — Boards offline/local fallback: seamless profile creation without server dependency
- 2026-08-14 — Power-Up System: 6 physical power-ups with initial drops and 100k/500-mult milestones
- 2026-08-14 — Parallelized validator test suite & Cambridge soak opt-in (T-403)
- 2026-08-14 — Debris retirement on proven stationarity (T-402, ADR-0018)
- 2026-08-13 — Player identity chip, legal pages (`privacy.html`, `terms.html`), score integrity (T-301..T-312)
- 2026-08-13 — Timed runs (180s clock) & 100% full-clear goals across all scenes
- Older: `CHANGELOG.md`
