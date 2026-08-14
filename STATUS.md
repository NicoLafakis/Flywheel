# STATUS.md — Flywheel

*A sprocket's story.*

Last updated: 2026-08-14

---

## Active focus

- **Power-Up System**: Shipped catalogue (`VORTEX`, `SPEED`, `TITAN`, `QUAKE`, `FRENZY`, `CHRONO`) across sim, 3D render, and HUD with dynamic 100k pts / 500 mult drops (`.wiki/modules/powerups.md`).
- **Scoreboards & Offline Fallback**: Live boards + seamless local/offline player profile creation and sync (`js/board/player.js`).
- **Timed Runs & Full Clear**: 180s clock (`js/levelclock.js`), 100% full-clear goals, verified 90s score attack on Chicago Loop.
- **T-403 — Parallel Validator**: Child processes for independent test suites, 0.4s fast check, Cambridge soak opt-in.

---

## Shipped state

- **Brand**: *Flywheel — A sprocket's story*. Branded landing screen over live city backdrop, block wordmark, legal footer.
- **Progression**: Free-play voxel sandboxes on 180s clock, 100% full-clear goal, 60 deterministic collectible coins per city, skin & indicator shop.
- **Cities (7)**: Gallery, Manhattan, Upper Manhattan (73k blocks), Brooklyn (40k blocks), Boston (83k blocks), Cambridge (73k blocks), Chicago Loop (44k blocks).
- **Multiplayer & Boards**: Supabase Realtime 1v1 arena (`arena.html`); THE RUN Chicago 90s verified replay; public boards; local/cloud profiles; signed outbox.
- **Audio & Quality**: 10 streamed cues, independent audio mix controls, HIGH/LOW binary quality.

---

## Recent history

- 2026-08-14 — Boards offline/local fallback: seamless profile creation without server dependency
- 2026-08-14 — Power-Up System: 6 physical power-ups with initial drops and 100k/500-mult milestones
- 2026-08-14 — Parallelized validator test suite & Cambridge soak opt-in (T-403)
- 2026-08-14 — Debris retirement on proven stationarity (T-402, ADR-0018)
- 2026-08-13 — Player identity chip, legal pages (`privacy.html`, `terms.html`), score integrity (T-301..T-312)
- 2026-08-13 — Timed runs (180s clock) & 100% full-clear goals across all scenes
- Older: `CHANGELOG.md`
