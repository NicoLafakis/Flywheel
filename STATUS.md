# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-17

---

## Active focus

- **Global Campaign & Sprocket Storyline**: 29-metropolis world tour across 7 regional Acts (Pacific, Asia, Mediterranean, Europe, Americas, New York, Cambridge UNBOUND). Narrative grounding of flywheel mechanics, mission dossiers, and progressive city unlock ladders (`.wiki/features/global-campaign/`).
- **Multiplayer Multi-Hole & Join Polish**: 6-player synchronized invite lobby multiplayer, multi-hole presentation alignment, PvP hole swallowing, 10s respawn timeout, per-player coin isolation, and 7 free color skins (`.wiki/modules/multiplayer.md`).
- **Power-Up System**: Dynamic roaming power-ups with intermittent spawn/despawn lifecycle, in-world 3D beams, and full WebAudio fanfares (`.wiki/modules/powerups.md`).
- **Scoreboards & Offline Fallback**: Live ranked boards + server-replayed trace verification and local profile fallback (`js/board/`).
- **Cambridge Phase 7 Secrets & Belts**: Cambridge 44 hidden easter eggs, 11 ground glyphs, and championship belts.


### Open decisions (owner's call, papered not parked)

- **Menu-angle inheritance for the level intro** — the establishing beat uses the level's own sun-scored `_introYaw0`. Adopting the title backdrop's live yaw instead is a two-line change but discards that scoring, and the backdrop is hard-coded to Brooklyn regardless of city. `.wiki/modules/render.md`.
- **Mid-play power-up spawn cutscene** — still fires on every ~30s intermittent respawn, now smooth and cancellable rather than removed. Suppressing it entirely is a one-line change to the same gate that already suppresses it at level start.
- **Quake cutscene's authored internal hard cuts** — shot 0→1 turns 2.76 rad in one frame (285.3% distance, 165.88 rad/s whole-sequence). Deliberately outside the release-continuity gate; keeping or retiring them is shot design. `.wiki/modules/render.md`.
- **Cloud progress sync — built 2026-08-17.** Coins, skins, stars and upgrades now follow the signed-in player across devices (`.wiki/plans/cloud-progress-sync.md` tasks 1–17 complete; `.wiki/modules/cloud.md`, `.wiki/modules/api.md`, ADR-0021). **On by default** — setting `FW_PROGRESS_SYNC=false` on Vercel pauses it (both routes answer `503 SERVER_NOT_READY` and the game plays exactly as before), an emergency switch rather than a deploy step.
- **Cambridge 2** — the map was specced to *look* as detailed as 73k voxels, not to contain them. Rebuild at perceived density; the existing map stays. Root cause of the validator's runtime.

---

## Shipped state

- 2026-08-19 — Global Campaign Phase 2: UI & Mission Dossier Integration (shipped regional Act filter navigation tabs [All, Prologue, Acts I–VII] in City Select `js/ui/screens.js`; integrated interactive Sprocket Mission Dossier cards displaying tactical directives, radio transmissions, target hero landmarks, and rescued momentum companion bots; added Ready Gate pre-flight narrative briefing in `js/ui/ready.js`; added victory Kinetic Revival Debrief cards on 100% full clears in `showSandboxResults`; covered by 163 assertions in `tools/campaign-ui.test.mjs` and registered in `tools/validate.mjs`)

- 2026-08-19 — Global Campaign Phase 1: 29-Metropolis Roster, 7 Acts & Schema Foundation (shipped full 29-metropolis world tour schema in `js/citycatalog.js` across 7 regional Acts [Pacific, Asia, Mediterranean, Europe, Americas, New York, Cambridge UNBOUND]; added narrative tactical transmissions, hero landmark rosters, momentum companion bots, and debrief directives; engineered backward-compatible `PLAYABLE` vs. `DEVELOPMENT` status gating and monotonic economy ladders; updated help walkthrough and registered automated test suite `tools/validate-campaign.mjs` in `tools/validate.mjs` with 1178 assertions)

- 2026-08-18 — Mobile Pinch/Expand Zoom & Dual-Zone Gesture Guidance (prominently surfaced two-finger pinch-to-zoom-in and spread-to-zoom-out gesture controls on mobile touchscreens across Ready Gate pre-flight cards [🤏 Pinch / Expand with 2 fingers], in-game speech bubbles, Size 2 Level-Up Pro Tip, and Pause Menu quick cheat sheet; clearly contrasted with desktop R/F & scroll wheel; covered by `tools/mobile-zoom-controls.test.mjs`)

- 2026-08-18 — Cute Just-in-Time Milestone Onboarding & Introductory Instruction System (replaced rigid step checklist with delightful casual arcade flow: animated "START EATING BLOCKS!" speech bubble with Sprocket avatar ⚙️ and bouncing pointer; celebratory Size 2 Growth Modal with visual prop comparison [Small Props ➔ Cars & Trees Unlocked!]; 4× Combo Momentum callout; and structural foundation collapse callout; zero redundancy with existing power-up impact overlays; covered by `tools/tutorial.test.mjs`)


- 2026-08-18 — Device Detection & Contextual Relative Controls (shipped `js/device.js` with `isTouchDevice` and `getDeviceInputMode`; dynamically adapts Level 1 tutorial walkthrough steps, Ready Gate pre-flight cards, and in-game control badges so mobile players see only touch instructions [drag left ½ to steer / right ½ to look] and desktop players see keyboard keybinds [WASD / Arrows]; covered by `tools/device-detection.test.mjs`)


- 2026-08-18 — Mobile-First UI & Navigation Architecture (overhauled mobile responsive layouts across Title Dashboard, City Selection Carousel, Shop Shell, and HUD overlays; thumb-friendly touch targets $\ge 48\text{px}$, notch safe-area insets, fluid horizontal pill navigation, and 2-column mobile item cards; covered by `tools/mobile-ui.test.mjs`)


- 2026-08-18 — Mobile-First Clarity & Adaptive Portrait FOV Overhaul (shipped `computeAdaptiveFov` in `js/camera.js` with smooth aspect-compensation curve $V(\text{aspect}) = 45^\circ / \sqrt{\text{aspect}}$, eliminating mobile portrait tunnel-vision and locking horizontal FOV $\ge 68^\circ-72^\circ$; upgraded mobile quality tier in `js/quality.js` to crisp 1.5× DPR with directional shadows and ambient lighting for razor-sharp voxel edges and 3D depth perception; covered by `tools/mobile-camera.test.mjs`)


- 2026-08-18 — Interactive In-Game Onboarding & Step-by-Step Walkthrough System (shipped `js/ui/tutorial.js` with 5-step progressive coachmark sequence in Level 1 / The Lab covering Steering/Snack Ring, Mass & Size 2, Combo Multipliers, Structural Foundation Collapse, and Orbital Power-Up Beacons; Pre-Flight Visual Cards on Level 1 Ready Gate; contextual tooltips for oversized objects & power-ups; auto-persisted save state with instant skip option; covered by `tools/tutorial.test.mjs`)


- 2026-08-18 — Sydney Sandbox Expansion: Voxel Strict Min Corner Implementation (expanded sandbox with Sydney architectural icons including Heritage Townhouses, CBD Tower, Opera House, and Harbour Bridge. Engineered entirely using strict min-corner geometric mapping, ensuring perfect structural bay alignment and exactly 0 overlap or collision errors. Block count optimized down to 1167 with full retention of architectural identity)


- 2026-08-17 — The Lab Architectural Realism, HUD Sandbox Progress Bar & Endgame Locators: Zero-Falling Spawn Physics, Vector Textures, 4-Way Stop Lines & Mast-Arm Signals (fixed HUD sandbox progress bar width & allBlocksConsumed 100% win trigger; updated 3D endgame beacons and HUD remaining blocks pill to trigger at 95% cleared; eliminated all unsupported and overlapping blocks across all buildings in The Lab for 100% spawn stability; replaced raster surfaces with accurate vector solid color rendering; added realistic road markings with white stop lines across approaching lanes at 4-way intersections, mast-arm cantilever traffic light signals, street trees, waste bins, hydrants, and potholes)

- 2026-08-17 — The Lab Architectural Expansion: Monuments, Mid-Rises, Supertalls & Cantilever Villas (expanded sandbox with Arc de Triomphe corbel monument, Art Deco maritime lighthouse, Fallingwater modernist cantilever villa, Googie butterfly-roof diner, Brutalist civic cultural library, 24m Grand Clock Tower & obelisk plaza, 4-storey urban fire-escape apartments, sawtooth industrial lofts, 46m diagonal X-braced supertall skyscraper, cylindrical drum tower, suspension bridge anchor pylon, and luxury rooftop infinity pool villa; all authored in modular anisotropic single-piece structural forms)

- 2026-08-17 — The Lab Modular Structural Sub-Division: 2m Bay Fragmentation & Detachment (subdivided oversized plinths, floor slabs, roofs, and walls in Modernist Pavilion, Grand Colonnade, and Skyscraper Alpha into modular 2m structural bays; complies with Grade and Bite clauses; enables fluid collapse, progressive crumbling, and consumption)

- 2026-08-17 — Cloud Progress Sync: Coins, Skins, Stars & Upgrades Follow The Signed-In Player (save schema v25; `player_progress` table with RLS deny-browser posture, `/api/progress/pull`+`push`, a merge that keeps the better of two records and never sums coins, a server-side coin plausibility fence, an 8s-debounced offline-safe sync queue, and a profile-tab sync indicator; behind `FW_PROGRESS_SYNC` — see `.wiki/modules/cloud.md`, ADR-0021)

- 2026-08-17 — Keyboard Steering Angular Acceleration: Smooth Continuous Turn Ramp (replaces instantaneous fixed-step turn rate; short taps execute sub-degree micro-adjustments; holding A/D smoothly accelerates turn rate up to maximum speed across 0.45s; direction switches cleanly reset)

- 2026-08-17 — Power-Up Wild Spawn Encounter & Overhead Camera: 4.0s Non-Interruptible Sequence ("A WILD [NAME] HAS APPEARED!" holographic battle card, name, icon and short description; overhead 1.20 rad pitch framing over drop beacon; 4.0s duration)

- 2026-08-17 — The Lab Architectural & Scoring Overhaul: Anisotropic Forms, Texture-Free Solids, Size-Scaled Points & 6-Player Spawn Snack Rings (HUD score reads h.mass instead of rawMass; base points scale with object size; lightweight solid color rendering; subway hub, waterfront pier basin, helipad & helicopter, billboard, and balanced 6-player snack rings shipped)

- 2026-08-17 — Level Intro Camera: Establishing Hold → Overhead Rise → Dive To The Hole (RCA-2026-08-17 level-start camera; an orphaned power-up cinematic had hijacked frame 1 of every level since `8818c2d` — peak yaw 1220 → 42.5 °/s, cinematic-armed frames 185/350 → 0, pitch leak closed)

- 2026-08-17 — Excursion Harness Advances On Arrival, Not On The Clock (RCA-2026-08-17 chicago; `tools/route-driver.mjs`, ≤2% parked ticks, new `speedInvariance` gate, four unregistered suites now gated)

- 2026-08-17 — Inaudible Sounds No Longer Fatigue Their Sample (audibility floor moved between peek and deposit; the near tower 11.1 dB louder, rival `quiet` ladder made real)

- 2026-08-17 — Multiplayer Match Start Is An Act, Not A Side Effect Of Capacity (host presses start, or non-hosts vote unanimously once the host is idle; vote unavailable below 3 players)

- 2026-08-17 — Mobile Shop Bottom Nav Undocked From Its Own Scroll Container (RCA-2026-08-17 backdrop-filter; 6087px drift → 0px, 241-check browser contract, fluid tab labels)

- 2026-08-17 — Voxel Event Audio Restored: Eat Gulps, Combo Ladder, Stingers, Derailment & Tornado (RCA-2026-08-17, three suites now gated)

- 2026-08-17 — Partner Skin Approval Gating & Coin Refund (save schema v24)

- 2026-08-17 — Hole Speed Retune: 1.4× → 1.8× (save schema v23, ranked v2)

- 2026-08-17 — The Lab Theme & Pause-Menu Track Picker

- 2026-08-17 — Automatic Player Names, One All-Time Leaderboard & Guest Run Adoption (T-801, T-802, T-803)

- 2026-08-17 — Music Buffers Before The First Tap (T-704)

- 2026-08-16 — Economy Corrections: Coin Ladder, Campaign Growth Upgrade & Legacy Double-Count (T-701, T-702, T-703)

- 2026-08-16 — Silent Victory Podium Fixed & Music Cue Registry Guarded

- 2026-08-16 — Host-Authoritative Match Clock & Shared Coin Pool (T-635, T-636)

- 2026-08-16 — Interactive Help Menu, Comprehensive Walkthrough, FAQ & Tips 'n Tricks Shipped

- 2026-08-16 — Multiplayer Per-Player End-of-Match Scorecard & Results Podium Shipped

- 2026-08-16 — 10-Second Combo Meter with 5s / 3s Dynamic Flashing & Arc Draining Shipped

- 2026-08-16 — 3-Minute City Challenges, 2x Coin Rewards & Secret 90s Challenge Unlock

- 2026-08-16 — Multiplayer Multi-Hole System, Power-Up Polish & 7 Basic Color Skins Shipped

- 2026-08-16 — ADR-0020: Menu Wiring Bug Fixes

- 2026-08-16 — Demographic Cohort Playtesting (Marketing Professionals 30–55)

- 2026-08-16 — Level 1 (The Lab) 6-Player Invite Lobby Multiplayer Shipped

- 2026-08-16 — Scrapped Legacy Multiplayer & Prepared Fresh Clean-Slate Architecture

- 2026-08-15 — Modern Mobile Game Shop & Multi-Rank Incremental Character Stat Upgrades

- 2026-08-15 — Gameplay Enhancements & Mechanics Polish

- 2026-08-15 — Dragon Ball Pickup Camera Recovery

- 2026-08-15 — Chrono Freeze Ice Cue Restored

- 2026-08-15 — Non-Quake Dragon Ball Pickup Sequences Restored

- 2026-08-15 — Fault Line Rupture Super-Move Expansion

- **Brand**: *Flywheel — A sprocket's story*. Branded landing screen over live city backdrop, block wordmark, legal footer.
- **Progression**: Free-play voxel sandboxes on 180s clock, 100% full-clear goal, 60 deterministic collectible coins per city, skin & indicator shop.
- **Cities (7 + Tokyo)**: Gallery, Manhattan, Upper Manhattan (73k blocks), Brooklyn (40k blocks), Boston (83k blocks), Cambridge (73k blocks), Chicago Loop (44k blocks), Tokyo (83k blocks).
- **Boards & Online Progression**: THE RUN Chicago 90s verified replay; public boards; local/cloud profiles; signed outbox. Multiplayer being rebuilt from scratch.
- **Audio & Quality**: 19 streamed tracks, pause-menu track picker with unlock gating, independent audio mix controls, HIGH/LOW binary quality.

---

- 2026-08-15 — Strict Test-Driven Development (TDD) Mandatory Standard

- 2026-08-15 — Fault Line Rupture Cinematic Restored

- 2026-08-15 — Collected Power-Up 3D Mesh Disappearance & Scene Graph Cleanup
- 2026-08-15 — Tornado Siren Dissipation Cutoff, Level Soundtrack Initiation & 50% Master Volume Tuning
- 2026-08-15 — Smooth Boot Progression & Title Music Autoplay Fix
- 2026-08-15 — High-Fidelity Rendered Audio Assets Integration (19 Dedicated Masters)
- 2026-08-15 — Immediate Title Music Preloading & Early Boot Audio Streaming
- 2026-08-15 — Real-Time Dragon Ball Fault Line Rupture Restoration & Uninterrupted Power-Up Activation
- 2026-08-15 — Natural Disaster Physics Optimization & Bounded Twister Vortex
- 2026-08-15 — Tiered City Coin Economy (Scaled Ground Spawns, Per-Coin Multipliers, and Escalating Full-Clear Payouts)
- 2026-08-15 — Fast Startup & 2-Stage Menu Flow (Stage 1 Clean Title -> Stage 2 City Carousel with Dynamic Size Progression)
- 2026-08-15 — Power-Up Lifecycle, Louder Combo Multipliers, Anime Screen Overlays, Endgame Target Beacons & Scheduled Disasters
- 2026-08-15 — Short-Phone Landing Fix
- 2026-08-15 — Default Action Camera Angle & Obstruction View Clearance
- 2026-08-15 — In-Game GUI Visual Hierarchy & Mobile Ergonomics Overhaul
- 2026-08-15 — Mobile UI Screen Region Spatial Separation (Size Center vs Combo Meter Burst)
- 2026-08-15 — Pokémon Wild Battle Encounter Power-Up Spawn Introduction
- 2026-08-15 — Combo Screen Glow Removal & Anime Battle Banner Overhaul
- 2026-08-15 — Dragon Ball Anime Cinematic Earthquake Power-Up Overhaul
- 2026-08-15 — SIZE 24 Ladder & Proportional Scaling Overhaul
- 2026-08-15 — Tokyo Geographic Accuracy Pass
- 2026-08-14 — Tokyo Daytime Palette Overhaul
- 2026-08-14 — Earthquake Fault-Line Direction Fix
- 2026-08-14 — Environmental Cataclysms & Power-Up Overhaul
- 2026-08-14 — Tokyo Mega-Metropolis Expansion (83,573 blocks / 154,879 mass)
- 2026-08-14 — Panicked Derailment Scream SFX
- 2026-08-14 — 3-Thirds Showcase Sandbox Architecture
- 2026-08-14 — Cute Kenney-Inspired City Surface Textures
- 2026-08-14 — 5-Minute Level Duration & Perimeter Voxel Containment
- 2026-08-14 — Power-Up Showcase Modal & Pure Demolition
- 2026-08-14 — Anti-Clustering & Power-Up Balancing
- 2026-08-14 — Dynamic Roaming & Intermittent Power-Ups
- 2026-08-14 — Authentic Coin Audio & Power-Up Polish
- 2026-08-14 — Visual Polish Stage 6
- 2026-08-14 — Visual Polish Stages 2–5
- 2026-08-14 — Splash screen status header
- 2026-08-14 — Boards offline/local fallback
- 2026-08-14 — Power-Up System
- 2026-08-14 — Parallelized validator test suite & Cambridge soak opt-in (T-403)
- 2026-08-14 — Debris retirement on proven stationarity (T-402, ADR-0018)
- 2026-08-13 — Player identity chip, legal pages (`privacy.html`, `terms.html`), score integrity (T-301..T-312)
- 2026-08-13 — Timed runs (180s clock) & 100% full-clear goals across all scenes
- Older: `CHANGELOG.md`
