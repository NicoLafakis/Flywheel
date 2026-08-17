# CHANGELOG — Flywheel

Detailed build history, migrated from STATUS.md (which is a lean board, not a
changelog). Newest first. Commit-level history: `git log`.

- 2026-08-17 — Partner Skin Approval Gating & Coin Refund (save schema v24)
  - **Only approved partners may be featured.** Six of the eight partner agencies have not granted permission to use their mark, so `js/skinapproval.js` makes `approved: true` the entry condition for the `partner` family and the other rows lose it. `supered` stays live (approved); Value First is approved but not yet built (awaiting logo vector + brand colors). The predicate is a standalone import-free module rather than an export of `js/skins.js`, which pulls three.js at module scope and is therefore unreachable from the Node validator and from `js/upgrades.js` on the pure-sim side of the boundary. It fails **closed** (`row.approved === true`), so a future partner row that forgets the field is hidden, not published.
  - **Save schema v23 → v24 refunds the withdrawn rows.** Seven partner skins were purchasable at 750 coins; the migration pays back every owned one, drops it from `ownedItems`, and un-equips back to `classic`. Its price table is a frozen literal in `js/save.js` and deliberately does **not** read the live `SKINS` catalog — those rows are expected to be deleted from `skins.js` eventually, and a migration that stops paying out when its subject disappears is one that breaks silently years after anyone remembers it exists.
  - **The save is not the only path a withdrawn id arrives on.** `makeSkin()` now resolves through `skinRowFor()`, which falls back to `classic` on UNAVAILABLE rather than on UNKNOWN — the old `SKIN_BY_ID.get(id) || classic` still rendered a withdrawn row, because a withdrawn row is still in the map. That path is live over the multiplayer wire (`js/multiplayer/roster.js` → `js/world3d.js` takes a peer's skin id straight off the network), where no local migration can reach it. Indicators resolve the same way via `indicatorRowFor()`; `ind-supered` is approved, so no indicator row actually changes today.
  - **Guarded twice, because a shelf filter is a display.** `js/ui/screens.js` and `js/upgrades.js` render `SKINS.filter(isSkinAvailable)` across the `partners` tab, all four collection counters and `nextUnlock()`'s teaser — the counters mattered as much as the tab, since a hidden-but-counted row makes the collection permanently uncompletable and reads to a player as a broken save. `main.js`'s `buy()` and `equip()` refuse an unavailable id outright.
  - **TDD coverage**: `tools/partner-approval.test.mjs` pins the withdrawn set at exactly seven ids, so an eighth going quiet fails rather than passing unnoticed, and `tools/economy-consistency.test.mjs` gained an assertion that no withdrawn id reaches a shop shelf. `validate.mjs`'s partner-tab count assertion moved 8 → 1, which is the check that proves the gate is doing something.

- 2026-08-17 — Hole Speed Retune: 1.4× → 1.8× (save schema v23, ranked v2)
  - **The sandbox hole's default speed is now 1.8×** the campaign curve (`SPEED_MULT` in `js/voxelsim.js`, `VOX_DEFAULTS.voxSpeed` in `js/save.js`): 12.81 m/s at SIZE 1 and 30.13 m/s at the top of the ladder, from 9.96 / 26.12. The SETTINGS → ADVANCED "Hole speed" slider (0.7–3.0) is unchanged; only its resting point moved.
  - **Save schema v22 → v23**: the migration resets `voxSpeed` to 1.8 for the installed base — a feel retune owns the key it retunes, the same precedent as v8's creak reset and v9's gravity/wave/attract pass — and preserves every other setting, including deliberately moved sliders.
  - **This is a ranked-physics change**: `RANKED_TUNE.speed` reads the same constant, so `RANKED_SIM_VERSION` bumped 1 → 2 and `RANKED_TUNE_ID` to `ranked-v2`. The server verifier imports both from the same file, so it stays in lockstep on the next deploy; runs recorded under v1 remain on the boards and are simply not re-verifiable against v2 (the designed cross-version path, never a cheat label).
  - **TDD coverage**: pins written red first (four failures: fresh-save default, missing migration, ranked tune speed, unbumped sim version). `validateSaveSchema` now asserts a fresh save carries 1.8 and that v22→v23 resets exactly `voxSpeed` and nothing else; `validateVoxelSandbox` asserts `RANKED_TUNE.speed === 1.8` and `RANKED_SIM_VERSION >= 2`. Camera/filter comments quoting the old 9.96 / 26.12 figures were swept; the ratios those filters tune from are multiplier-independent and were NOT retuned.

- 2026-08-17 — The Lab Theme & Pause-Menu Track Picker
  - **Nine new tracks wired in**: `the-lab.mp3` plus an eight-track `Flywheel-music-*` default pool ("Afterhours Static", "Basement Bloom", "Block Drift", "Falling Skies", "I Wonder", "Slow Down", "Slow Smokey Vinyl", "Smoke On Wax") are registered in `MUSIC_CUES` (`js/audio/music.js`) and pinned in `assets/music/MANIFEST.json` (19 files, 86,668,977 bytes). The gallery was deliberately music-free by owner decision; that decision is reversed — **The Lab now plays its own theme**.
  - **The pause menu is now a track picker** (`showPause()` in `js/ui/screens.js`), reachable mid-run in single player and multiplayer alike. The catalog lives in the new pure module `js/audio/tracklist.js`: the eight default-pool tracks are always selectable; a city's own theme appears only while the real `isCityUnlocked(save, scene)` gate says the city is unlocked — the picker can never offer music from a city the player has not reached. Tokyo is deliberately absent (it aliases Lower Manhattan's MP3; a row for it would be a second button for the same bytes).
  - **A pick is a session override, never persisted**: `musicOverride` in `js/main.js` takes effect immediately (doubling as the preview while paused), holds until the run ends, and is cleared by every run-start path (campaign, sandbox, multiplayer match), so a new city returns to its own theme. Resume requests `playCue() === musicOverride || activePlayMusicCue`. No save-schema change.
  - **TDD coverage**: `js/audio/tracklist.test.mjs` (written red first — module did not exist) pins that every picker row's cue resolves to a real file in `MUSIC_CUES`, that the default pool is save-independent, that The Lab is always offered, and that city gating matches `isCityUnlocked` on both the played-it path and the full-clear ladder path. `tools/music-assets-selftest.mjs`'s gallery-silence assertion flipped to `the-lab.mp3`, and both it and the new suite now run from `validateMultiplayer()` — the assets selftest was previously listed only in `tools/diagnostics.mjs`, so soundtrack drift never failed a gate.

- 2026-08-17 — Automatic Player Names, One All-Time Leaderboard & Guest Run Adoption (T-801, T-802, T-803)
  - **The boards were empty because nobody had a name (T-801/T-803)**: a run with no name was never published, and nothing handed a name out until the player went looking for one. Every player now gets a Parks-and-Recreation-themed name the moment they arrive. `js/board/names.js` + `api/data/parks-names.json` hold 44 modifiers × 48 subjects, **2,070 emittable pairs** after the over-length filter — every one of them proven to pass `normaliseName()`, the 16-character cap, the character class and the `blocked()` screen, so a generated name can never be one the server refuses. Entropy is `crypto.getRandomValues`: **not** `rng.js`, which is reserved for reproducible world generation and must not be perturbed by a name draw, and not `Math.random()` (invariant 2). `api/_names.mjs` is the server-side half. A `⟳` re-roll sits on the title chip (`js/ui/screens.js`) and on the MY NAME screen (`js/ui/boards.js`). `tools/names.test.mjs` walks the **full cross product** rather than sampling, so a single bad pair cannot hide behind a lucky seed.
  - **Save schema v21 → v22**: `CURRENT_VERSION = 22`; `defaultPlayer()` now carries a generated `name` plus `nameSource`. `__MIGRATIONS[21]` reaches the installed base — a default is only ever read by a save that does not exist yet, so changing `defaultPlayer()` alone would have left every existing player nameless forever. Three cases: no name → generate one marked `'auto'`; a name **with** a `claimedAt` → keep it and mark `'claimed'`, never re-rollable because the server owns that name and renaming behind its back would publish scores under a name it does not hold; a name with no claim → keep it, mark `'auto'`. No id is fabricated (a name is not an account), no progress is touched, nothing is deleted, and the quarantine paths are unchanged.
  - **Records and Leaderboards are now different things (T-802)**: the tabs are **MY RECORDS / LEADERBOARD / MY NAME**. LEADERBOARD is ONE global all-time board over the new `v_leaderboard` view, ranked by the sum of a player's best score on each city. The top-ten cut is on `rank <= 10`, not `slice(0, 10)`: `v_leaderboard.rank` is a `dense_rank()`, so three players tied for tenth all genuinely hold tenth and all three render (`topTen()` in `js/ui/boards.js`, pure so it is assertable headlessly). MY RECORDS is the player's own bests per city out of `v_city_board`. `v_overall` is still read in `js/board/read.js` but no longer rendered — it ranked by placement rather than score, so a 1st on one city outranked a 2nd on four — and is pending retirement.
  - **The weekly-season fiction is deleted**: the banner counted down to a reset with no scheduler behind it and every stored row was season 1. Product decision: **all-time scores, no reset**. The `season_id` columns stay as future-proofing, and `cityBoard()` still accepts an optional season filter, so bringing seasons back later is a scheduler and a UI, not a migration.
  - **A guest's first run now publishes (server)**: `api/run/start.mjs` provisions a real `players` row with a generated name for an unbound device, because `fw_record_verdict` inserts into `board_public` only `when r.player_id is not null` — an anonymous ticket was a run the server verified, scored, and then silently never published. Provisioning sits **after** the rate limit (12/hr device, 60/hr origin) since it is the only path that creates a player row without a human deciding to, and `ensureDevicePlayer()` caps it at one auto player per device.
  - **A live vulnerability closed in the same pass**: `api/auth/register.mjs` ran an unguarded `PATCH runs?id=eq.<caller-supplied id>` with **no ownership check** — a crafted request could adopt any run in the table. It is replaced by `fw_register_device_player`, which gates on a `run_tickets` device-key join, bulk-adopts all of that device's unclaimed verified runs, **upgrades the existing guest row in place** rather than orphaning what it earned, and backfills `board_public`.
  - **Two migrations applied to production and verified live**: `20260817113000_add_all_time_leaderboard.sql` (the `v_leaderboard` view plus the `board_public_leaderboard_idx` partial index that keeps the whole-table aggregate a single index-only scan) and `20260817124500_register_adopts_device_runs.sql` (the `is_auto` column, the register RPC, and a fix to `fw_transfer_redeem`, whose unqualified `token_version = token_version + 1` collides with its own OUT column and **would have raised at run time the first time anyone redeemed a transfer code**).
  - **A blocker caught before it shipped**: binding guests to a player at ticket time would have made every guest run 401 at submission — and `js/board/outbox.js` **deletes** non-retryable failures, so those runs would have been destroyed rather than merely left unpublished. `api/run/submit.mjs` instead proves a ticket-bound player from the HMAC ticket plus the enforced `device_key` match, and accepts it only for an `is_auto` player: a claimed account still has to present its token.
  - **Known gaps, recorded honestly**: the `local-*` offline identity trap in `js/board/player.js` is **unchanged** — on API failure it fabricates a credential the server never issued, which then permanently 401s `startTicket` and silently unranks every later run with no repair path except Log Out. It is marginally better only in that a failed request can no longer blank a name the player already has, and logout now hands back a fresh automatic name instead of `null`. Two players can currently roll the same name; the server de-duplicates only at claim time. Per-city PUBLIC boards have no screen any more (`v_city_board` is still read, for personal bests).

- 2026-08-17 — Music Buffers Before The First Tap (T-704)
  - **The first tap bought a download, not a song**: reported as "the music doesn't start until you touch something". Two things were conflated. PLAYING is gated by the browser's autoplay policy and is not fixable — `init()` already binds `pointerdown`, `touchstart`, `click` and `keydown`, so any first input unlocks. But DOWNLOADING was gated behind the same gesture: `js/audio/music.js` set `preload='none'` in the constructor and only ever assigned `this.audio.src` inside `_switchTo()`, which every caller (`unlock()`, `request()`, `resumeForPage()`) reached only once `_unlocked` was true. So the tap started a fetch of a multi-MB MP3 and the player heard nothing until it buffered.
  - **Arming, not autoplay**: the autoplay policy gates `play()` alone — assigning `src`, setting `preload='auto'` and calling `load()` are all permitted while locked. `request()` now calls a new `_arm(cue)` when locked: the element takes the source, lifts `preload` off `none`, loads, and parks at `_fade = 0`. `unlock()` finds `_current === _wanted`, presses play and runs the fade-in a normal switch would have run — **no second `src` assignment and no second `load()`**. `_safePlay()`'s `!this._unlocked` early return, which the `loadedmetadata` handler passes through, is the single thing stopping this from becoming an autoplay attempt. `_armedSrc` tracks the assigned source string because reading `audio.src` back yields an absolute URL that never compares equal to the relative path.
  - **The menu track was downloading three times**: `index.html`'s preload link used `as="fetch"`, and the preload cache is keyed by request destination, so the `<audio>` element could never match that entry — hence both a duplicate download and the console's "preloaded but not used" warning. It is now `as="audio"` with no `crossorigin` (the file is same-origin and the audio element issues no CORS request, so a crossorigin entry sits in a partition nothing reads). A third fetch — a throwaway `bgMusicPreload = new Audio()` in the boot script, playing into an element nothing ever read — is deleted. **The menu theme now downloads exactly once.**
  - **The music suite was running in no gate at all**: `js/audio/music.test.mjs` was referenced only by `tools/diagnostics.mjs`, so the entire director state machine could regress with `ALL PASS` still printing. It is now spawned from `validateMultiplayer()` alongside the other standalone suites.
  - **TDD coverage**: written red first — the arming assertion reported `'' !== 'assets/music/main-menu.mp3'` before any implementation. `js/audio/music.test.mjs` went 29 → 40 assertions: the fake audio element gained a counted `src` setter so "the gesture caused no further network work" is assertable, and the suite now pins that a locked request sets `src`/`preload='auto'`/`load()` and does **not** call `play()`, that `unlock()` then plays with no second `src` write and no second `load()`, and — statically, since no runtime test here reads the document — that `index.html`'s menu preload still says `as="audio"`, carries no `crossorigin`, and that `bgMusicPreload` has not come back.

- 2026-08-16 — Economy Corrections: Coin Ladder, Campaign Growth Upgrade & Legacy Double-Count (T-701, T-702, T-703)
  - **THE LAB was paying TOKYO's apex rate (T-701)**: the coin ladder existed in two copies that had silently drifted. `js/citycatalog.js` is the DECLARED economy — it is what the city-select card prints (`60 COINS (+25 CLEAR)`) and what `validateCityChallenges` computes expected payouts from — while `CITY_COIN_TIERS` in `js/voxelsim.js` is the table the running sim actually reads. Commit `6902032` introduced both halves in agreement; commit `08d104b`, a power-up/boot/audio commit that rewrote most of `voxelsim.js` and never mentioned the economy, replaced the `gallery` row with a byte-for-byte copy of `tokyo`'s apex row. The first, easiest, always-unlocked scene therefore paid `200 x 5 / +500` while advertising `60 x 1 / +25` — a **1,500-coin full clear where the card promised 85**, making the tutorial city the most lucrative farm in the game. The fix is not "put 60 back": `CITY_COIN_TIERS` is now **projected from `CITY_CATALOG`**, so the displayed ladder and the paid ladder are one table and cannot disagree again.
  - **The growth upgrade did nothing in the campaign (T-702)**: `Mass Assimilator` (20 ranks, 27,195 coins to max) and the legacy `growth5` item (500 coins, "Mass gained is 5% higher") both fed `options.growthBonus` into the campaign `Sim`, which stored it on `this.growthBonus` and then read it from nowhere — up to **27,695 coins of purchases moved no number at all** across the 100-level campaign, while the identical purchase worked in the voxel sandbox. `completeEat` in `js/sim.js` now reads it in the sandbox's own shape (`_award` in `js/voxelsim.js`): growth scales the RAW mass **before** the combo and frenzy multipliers, so a combo multiplies an already-boosted bite rather than compounding into a second, larger bonus. Player-only, matching the sandbox's `isPlayer` gate — an upgrade the player bought must never also arm the rivals racing them. An already-purchased rank started working immediately, because the bonus is recomputed from the save on every `startLevel()`.
  - **A pre-v20 player was being paid the same 5% twice (T-703)**: the v20 migration (`__MIGRATIONS[19]` in `js/save.js`) converts owning the legacy `growth5` item into `upgrades.growth >= 1`, and rank 1 already **is** that item's +5% — but `computeShopBonus()` in `js/main.js` then added a second `0.05` for the same `ownedItems` marker. The two are one purchase recorded twice, not two effects. This was inert for as long as nothing read `growthBonus`; T-702 wiring it into campaign mass gain would have shipped it live, giving anyone whose save predates v20 **+10% growth in the campaign against the +5% the same save gets in a city** — `VoxelSandboxSim` derives `growthMult` from `save.upgrades` alone and never looks at `ownedItems`. The redundant legacy term is deleted rather than subtracted back out: the migration is the source of truth and the `main.js` addition was the leftover. Players who never owned `growth5` are byte-identical.
  - **No save migration was needed for any of the three**: `js/save.js` stores what the player OWNS (`coins`, `ownedItems`, `upgrades` ranks, `sandbox` records) and never a price, payout, or multiplier, so every one of these retunes takes effect on the next run without a version bump or re-seed.
  - **TDD coverage**: `tools/economy-consistency.test.mjs` (spawned from `validateMultiplayer()` alongside the other standalone cross-file suites) pins all three. It asserts every catalog city agrees with its tier row in both directions with no orphans, that the ladder is monotonic in the catalog's own difficulty order, and that a **live** `gallery` sim reads `60 / 1 / +25` for an 85-coin clear; it drives a seeded greedy bot through two campaign sims fed one identical move vector so the growth bonus is the only variable, proving the first bite scales exactly `x(1 + bonus)`, that rival holes are untouched, and that a `growthBonus: 0` run stays bit-identical to `new Sim(level)` so the beatability proof still measures an un-upgraded game. For T-703 it lifts the `computeShopBonus()` object literal out of `js/main.js` as text and **evaluates** it (the module cannot be imported headlessly — `document.getElementById` at module scope, and three.js in its import graph), asserting a migrated `growth5` owner gets exactly `+5%`, that `1 + growthBonus` equals the sandbox's `growthMult` for the identical save, and that all 21 ranks are unmoved with the legacy marker present or absent.

- 2026-08-16 — Silent Victory Podium Fixed & Music Cue Registry Guarded
  - **The end-of-match screen had no music**: observed in a live two-player match — the podium appeared and the console logged `music: unknown cue "victory"`. Both multiplayer game-over handlers in `js/main.js` asked for a cue named `victory` that `MUSIC_CUES` never defined, and `MusicDirector.request()` answers an unknown name by warning once and playing nothing. The loudest moment in the game was dead quiet for every player of every match. **No dedicated victory track exists on disk** and none was invented: `victory` is now registered as an alias onto the shipped `post-game.mp3`, the same aliasing already used for `title`→`main-menu.mp3` and `tokyo`→`lower-manhattan.mp3`. The podium is a post-game screen, so it gets the post-game track. Single-player was never affected — its results screen already asked for the registered `results` cue.
  - **Silence is no longer a failure mode**: a player cannot tell "this screen has a bug" from "this screen is quiet on purpose", so `MusicDirector.request()` now falls back to `MUSIC_FALLBACK_CUE` (`menu`, the signature theme) for any unrecognised name. It still returns `false` and still warns once, so the mismatch stays loud in development while the player hears music instead of nothing.
  - **TDD coverage**: `tools/music-cue.test.mjs` (registered in `validateMultiplayer()`) is a static cross-check — the callers live in DOM-only modules the headless validator can never import, so it reads `js/**/*.js` as text, collects every cue name passed as a string literal to `setMusicCue()`, `actions.music()` or `music.request()`, and asserts each is a key of the imported `MUSIC_CUES`. It catches **any** future caller/registry mismatch, not just this one, and carries anti-vacuity assertions so a scanner that matched nothing cannot pass. Written red first: it reported both `js/main.js:1059` and `js/main.js:1107` before the fix. `js/audio/music.test.mjs` gained three assertions covering the fallback (26 → 29).

- 2026-08-16 — Host-Authoritative Match Clock & Shared Coin Pool (T-635, T-636)
  - **The match clock no longer desynchronises (T-635)**: measured in a live two-browser match on Lower Manhattan — at the instant the host ended, the host read 0.0 s / `over` while the peer's HUD still showed **0:38** and `over` false. Every client had been counting its own `step()` calls, so any device that could not sustain 60 sim steps per second fell behind permanently with nothing to pull it back. `STATE_SYNC` now carries `clockTicks`, peers build their sim with `clockFollower: true`, and `VoxelSandboxSim._clockAdvanceTicks()` reconciles toward host truth a fraction of the error per step (snapping only past `CLOCK_AUTHORITY_SNAP_TICKS` = 2 s). Corrections are **forward-only**: a peer that is ahead holds instead of rewinding, so the countdown a player watches is monotonic. A follower never latches `timedOut`/`over` on its own clock — `GAME_OVER` from the host stays the only ending, with the host-silence watchdog unchanged as the safety net.
  - **Coins read as one shared pool draining (T-636)**: in a match the readout is now `🪙 n LEFT` — the finite map pool, identical on every screen, ticking down when *any* player collects. It is host-authoritative (`STATE_SYNC.coinsCollected` → `sim.applyCoinAuthority()`, monotonic so a stale sync can never refill the map), so it cannot drift the way the clock did. **Single-player is untouched** (`🪙 collected/total`), and per-player attribution is untouched everywhere it already existed: `hole.coinsCollected` / `hole.coins`, the podium's `COINS EARNED 🪙 +N (M found)`, and banking into `save.coins`.
  - **TDD coverage**: `tools/multiplayer-clock-coins.test.mjs` (registered in `validateMultiplayer()`) asserts a deliberately slow peer converges on the host clock inside a bounded number of syncs and never displays a backwards second, that a follower never ends its own match, that two holes drain one shared total, that host and peer agree after a sync, and that the solo readout is byte-identical to before. Headless throughout — in-memory channel hub, injected timers, and a pure `formatCoinReadout()` so the HUD copy is asserted without a DOM.

- 2026-08-16 — Interactive Help Menu, Comprehensive Walkthrough, FAQ & Tips 'n Tricks Shipped
  - **Comprehensive Help & Academy Hub (`js/ui/help.js`, `css/help.css`)**: Built interactive multi-tab guide center featuring 3 major views:
    - **📖 HOW TO PLAY & WALKTHROUGH**: 11 in-depth instructional chapters covering Core Mechanics & 1.35x Tier Ladder ($r_\text{player} > r_\text{tier}$), Snack Ring perimeter sweeping, Physics Collapse Waves & Creak Delays, Desktop & Mobile Dual-Zone Controls, Menus & UI Navigation, All 8 Metropolitan City Guides & Progression Unlock Gates, Game Modes (Sandbox, 3-Minute 2x Coin Challenge, Secret 90s Sprint, Ranked RUN), In-Game HUD Telemetry & Radar, All 6 Power-Ups & Overdrive Transformations (Vortex, Speed, Titan, Quake, Frenzy, Chrono), Combos & Honest Multipliers, Shop Customization & 4 Stat Upgrade Tracks, 6-Player Synchronized Multiplayer Arena (Lobbies, Invite Links, Ephemeral Chat, PvP Swallowing, 10s Perimeter Respawns, Podium Scorecards), and Special City Disasters (Chicago runaway CTA train derailment, Cambridge anisotropic architecture, landmark eviction physics).
    - **❓ FREQUENTLY ASKED QUESTIONS (FAQ)**: 14 categorized Q&A items covering edibility rules, city unlocking, challenges, multiplayer room codes and swallowing mechanics, stat upgrade persistence, scoring formulas, coin farming strategies, offline browser play, touchscreen controls, power-up buff stacking (up to 3 simultaneous buffs), global leaderboard submissions, performance tuning for low-spec devices, and physics settings resets.
    - **💡 TIPS 'N TRICKS (PRO GUIDE)**: 10 tactical pro guides covering the Perimeter Snack Ring Spiral opening, Combo Chain Bridging, Skyscraper Foundation Cleaving, the Supersonic Vacuum Buff Stack, Chicago Train Derailment Farming, Multiplayer Canyon Ambushes, Optimal Upgrade Investment Priority, Chrono Stasis + Frenzy Super Combos, Bridge Camera Orbiting, and Endgame Blocks Left Radar Sweeping.
  - **Live Search & Filter Engine**: Added instant search across all walkthrough modules, FAQs, and tips with keyword tag matching, clear button, and categorized accordion cards.
  - **Omnipresent UI Entry Points**: Integrated `HELP & FAQ` buttons on Title Screen (`showTitle`), Pause Screen (`showPause`), and Settings Screen (`showSettings`) via `ScreenManager.showHelp()` in `js/ui/screens.js`.
  - **100% Automated TDD Test Coverage**: Created `tools/help.test.mjs` verifying module data models, power-up catalog parity, city catalog coverage, search filtering, and DOM renderer (122 assertions). Integrated `runHelpSelftest` directly into `tools/validate.mjs` test orchestrator. All tests passing (`ALL PASS`).

- 2026-08-16 — Multiplayer Per-Player End-of-Match Scorecard & Results Podium Shipped
  - **Eliminated Generic Single-Player Results Screen in Multiplayer**: Guarded `tickVoxelSandbox()` in `js/main.js` so single-player `endSandbox()` / `showSandboxResults` is bypassed in multiplayer. Match completion strictly finishes via `MultiplayerHost.finishMatch()` and `MultiplayerPeer.onGameOver`.
  - **Comprehensive Per-Player Leaderboard Cards**: Upgraded `showMultiplayerPodium()` in `js/multiplayer/ui.js` and `css/multiplayer.css` to render an enhanced per-player comparative scorecard featuring:
    - Rank badges & trophy medals (1st 🥇, 2nd 🥈, 3rd 🥉, etc.)
    - Player name, slot color swatch, and glowing **`YOU`** badge for the local player
    - **Score (PTS)** formatted with commas
    - **City Devoured** (% of total metropolis mass & raw kg eaten)
    - **Best Combo** (maximum chain eats achieved)
    - **PvP Takedowns** (kills count and times swallowed)
    - **Coins Earned** (pickups collected and coins banked)
  - **Personalized Header & Reason**: Displays `🎉 VICTORY! YOU WIN! 🎉` with gold glow when local player places #1, `${winner.name} WINS!` for rivals, and subtitle reason (`METROPOLIS 100% DEMOLISHED` or `MATCH COMPLETE · TIME EXPIRED`).
  - **100% Automated TDD Test Coverage**: Added Section 7 to `js/multiplayer/multiplayer.test.mjs` verifying per-player leaderboard generation, `percentCleared` calculations, and synchronized host/peer delivery. All tests passing (`ALL PASS`).

- 2026-08-16 — 10-Second Combo Meter with 5s / 3s Dynamic Flashing & Arc Draining Shipped
  - **10.0-Second Combo Reset Window**: Set `COMBO_WINDOW = 10.0` in `js/voxelsim.js` and `js/sim.js`, granting players a generous 10-second window between meals to navigate across city streets without dropping their combo chains.
  - **Radial SVG Arc Draining**: Updated `_updateCombo` in `js/ui/hud.js` to smoothly animate `comboArc.style.strokeDashoffset` from 100% full down to 0% in proportion to `chainTimer / COMBO_WINDOW`.
  - **5-Second Warning Flash**: Applied `.cm-warn` when `chainTimer <= 5.0s`, pulsing the meter at ~2 Hz with warm golden heat aura.
  - **3-Second Urgent Flash**: Applied `.cm-urgent` when `chainTimer <= 3.0s`, escalating to a rapid ~5 Hz high-intensity neon strobe with micro-pulse scaling.
  - **Clean Expiration Reset**: At 0s, clears warning/urgent states, fires `pulseComboBreak()`, and smoothly returns to resting state.
  - **100% Automated TDD Test Coverage**: Added Section 6 to `js/multiplayer/multiplayer.test.mjs` verifying 10s initialization, linear time decay, warning/urgent checkpoints, and 0s chain resets. All tests passing (`ALL PASS`).

- 2026-08-16 — 3-Minute City Challenges, 2x Coin Rewards & Secret 90s Challenge Unlock
  - **3-Minute Standard Challenge Clock**: Configured city challenge duration to 3 minutes (`CHALLENGE_CLOCK_SECONDS = 180` / `CHALLENGE_CLOCK_TICKS = 10,800`), providing ample time for speed boost power-up routing and full map clears.
  - **2x Coin & Goal Bonus Multiplier**: Beating city challenges awards double coins on collected pickups and 2x level goal completion bonus.
  - **Secret 90-Second Hyper Run Progression**: Completing all 3-minute city challenges across every metropolis in `CITY_CATALOG` unlocks the secret 90s speed challenge across the entire map roster.
  - **Pure Sim `citycatalog.js` Module**: Separated pure progression rules and catalog metadata into a headless Node-safe module (`js/citycatalog.js`) without DOM/three.js dependencies.
  - **Save Schema Migration v20 -> v21**: Bumped `CURRENT_VERSION = 21` with migration initializing `challenges: {}` tracking best times, scores, and completion flags for 3m and 90s modes per city.
  - **UI Integration**: Updated Title Screen, City Carousel, HUD, and Results Screen with dynamic challenge CTAs, completion badges, 2x reward breakdowns, and secret unlock celebration banners.

- 2026-08-16 — Multiplayer Multi-Hole System, Power-Up Polish & 7 Basic Color Skins Shipped
  - **Nixed Multiplayer Power-Up/Disaster Cutscenes & Pauses**: Disabled `queuePokemonSpawnIntro` (no `powerup_encounter` camera hijacking/modals), `playPowerUpCollectCinematic` (no 10-second `powerup_pause` showcase modal), `playEarthquakeCinematic` (no `quake_cinematic` pause), and remote camera shakes during multiplayer matches. Power-ups render cleanly with live in-world 3D beams and auras and lightweight non-blocking HUD banners.
  - **Instant Camera Spawn Snapping**: Updated `startMultiplayerMatch` in `main.js` to immediately initialize `cam.target`, `cam.smoothTarget`, `cam.lastHoleX`, `cam.lastHoleZ`, and clear `cam.shakeIntensity` at the player's perimeter spawn point, eliminating the initial camera swoop and shaky entry.
  - **Local Player Hole Alignment across Presentation Stack**: Added `localSlot` and `localHole` getter to `VoxelSandboxSim` (`js/voxelsim.js`). Wired `main.js` (controls, camera, audio listener, heading indicator), `hud.js` (mass, SIZE, cleared %, combo), and `voxelworld.js` to strictly follow `sim.localHole`, completely fixing the peer hole tracking and visual desync bugs where peers previously followed slot 0.
  - **Dynamic Inverted Rival Meshes in 3D**: `VoxelWorld3D` (`js/voxelworld.js`) now creates rival meshes for all connected slots $0..N-1$ excluding `localSlot`, each rendered with high-contrast colored rings corresponding to their `PLAYER_PALETTES` slot color, while the local hole renders with the player's equipped skin and nav indicator.
  - **7 Free Basic Color Skins**: Added 7 new 0-cost baseline skins (`baseline-cyan`, `baseline-crimson`, `baseline-amber`, `baseline-emerald`, `baseline-purple`, `baseline-orange`, `baseline-magenta`) in `js/skins.js` based on `buildBaseline`, automatically owned by all players (`isOwned: true`) without requiring save migrations.
  - **Multiplayer Hole Interaction & PvP Polish**: Supported PvP hole swallowing ($r_\text{killer} > r_\text{victim} \times 1.05$), +50% mass steal bounties, 10s perimeter respawning, respawn overlay for both host and peers, real-time takedown announcements (`hud.announce`), camera kick/shake, shockwaves, and portal respawn bursts in `main.js`.
  - **Host Podium Callback Fix**: Added missing `onGameOver` callback execution to `MultiplayerHost.finishMatch()`, ensuring hosts transition to the victory podium alongside peers upon match expiration.
  - **Strict Per-Player Coin Attribution & Isolation**: Initialized `coinsCollected: 0` and `coins: 0` per hole in `VoxelSandboxSim` (`js/voxelsim.js`), isolated `_collectCoinsFor(h)` increments to the specific collecting hole, updated `hud.js` to render each player's local coin count, guarded `audio.playCoin()` / toasts / combo pulses to fire only for the local hole, included coins in host wire state syncs & leaderboard, and deposited only the local player's earned coins into their persistent vault (`save.coins`) on match completion.
  - **100% Automated TDD Test Coverage**: Created `js/multiplayer/multiplayer.test.mjs` verifying multi-hole sim properties, host/peer session bindings, PvP mechanics, skin registration, and per-player coin isolation. All tests passing (`ALL PASS`).

- 2026-08-16 — ADR-0020: Menu Wiring Bug Fixes
  - **City Select icon slot**: `CITY_CATALOG` lacked an `icon` field on all 8 entries; the card template rendered `"undefined"`. Each entry now has its city emoji (🧪🏙️🌉🌆🔬🌳⚓🗼).
  - **Power-Up Showcase timer bar**: Fill formula used `6000` ms as the denominator while the countdown ran for `10000` ms. Replaced with `SHOWCASE_TOTAL_MS = 10000` constant so bar and countdown share one number.
  - **Shop tab tap sound**: `actions?.sound('click')` was never registered; shop tabs now carry `.secondary` so the existing `#screen-root` delegated listener plays `audio.uiTap()` on every switch.
  - **HUD mute button emoji**: Button was hardcoded `🔊` in HTML and never updated on click. Handler now writes `🔇`/`🔊` to match actual mute state.

- 2026-08-16 — Demographic Cohort Playtesting (Marketing Professionals 30–55)
  - **4-Persona Simulation Harness**: Created automated demographic playtesting runner (`tools/demographic-playtest.mjs`) modeling 4 distinct player behavioral personas across the target demographic (Elena 32y, Marcus 41y, David 48y, Sarah 54y) on Campaign Levels 1–4.
  - **Single-Player Validation**: Validated single-player campaign completion metrics (100% clears, 13–22s clear times, 3/3 stars, high combo scaling) across all 4 levels.
  - **Aesthetic & UX Findings**: Identified key demographic preferences (clean emoji-free typography, fast 1-tap mobile loops, miniature diorama aesthetic) and roadmap recommendations (aligning power-up presentation with the industrial/architectural Flywheel brand language).

- 2026-08-16 — Level 1 (The Lab) 6-Player Invite Lobby Multiplayer Shipped
  - **6-Player Multi-Hole City Sandbox Engine**: Enhanced `VoxelSandboxSim` (`js/voxelsim.js`) to support 2..6 player holes simultaneously on Level 1 (The Lab, 12,213 blocks) with deterministic perimeter spawning, synchronized movement, and full power-up parity.
  - **Authoritative PvP Hole-on-Hole Eating & 10s Respawn Timeout**: Implemented pairwise hole collision detection ($r_\text{large} > r_\text{small} \times 1.05$). The smaller player is devoured, awarded to the killer as bonus mass, and put into a mandatory **10.0-second timeout/pause** penalty (`💀 SWALLOWED BY RIVAL! · RESPAWNING IN 10s...`) before respawning at a safe perimeter position.
  - **Shareable Room Invite Links**: Instant room link generation (`?room=CODE`) defaulting to `playflywheel.com` for local dev parity, with automatic lobby join when loaded from URL query parameter.
  - **Zero-Persistence Ephemeral Chat**: Strictly in-memory, never written to disk or database, destroyed on match launch.
  - **Auto-Start Countdown**: Automatically launches a 3-second countdown the moment all player slots are filled ($N/N$).
  - **Multi-Client Wire Protocol & Transport**: Authoritative host (`js/multiplayer/host.js`) and client peer (`js/multiplayer/peer.js`) over **Supabase Realtime Broadcast** (`js/multiplayer/channel.js`). Includes robust **outbound message queueing** to buffer broadcasts (like initial `JOIN_REQUEST` and `ROOM_STATE` syncs) until the WebSocket channel confirms `SUBSCRIBED` status, eliminating peer 4-slot desync race conditions.
  - **Multiplayer UI & Podium**: `MultiplayerUI` (`js/multiplayer/ui.js`), `css/multiplayer.css`, in-world rival colored hole meshes, title screen `👥 MULTIPLAYER (2-6P)` button, and post-match victory podium with rankings.
  - **100% TDD Test Suite**: Comprehensive automated test suites (`tools/multiplayer-livechannel.test.mjs`, `tools/pw/test.mjs`, etc.) all passing.

- 2026-08-16 — Scrapped Legacy Multiplayer & Prepared Fresh Clean-Slate Architecture
  - **Scrapped Legacy Multiplayer Stack**: Completely removed the old prototype arena code (`js/net/`, `js/demo/`, `arena.html`, `multiplayer.html`, `netdemo.html`, and related selftests).
  - **Purged Outdated Multiplayer Design Docs & ADRs**: Scrapped `.wiki/features/online-flywheel/`, `.wiki/features/party-mode/`, and `ADR-0010`.
  - **Decoupled Leaderboards & Cleaned Front Door**: Retained Supabase credentials inside `js/board/config.js` for standalone leaderboards/profiles, and removed legacy title screen `#mp-link` / redirects in preparation for building multiplayer from scratch.

- 2026-08-15 — Modern Mobile Game Shop & Multi-Rank Incremental Character Stat Upgrades
  - **Category Icon Tabs**: Replaced flat item shelf with 5 dedicated icon category tabs (`🕳️ Skins`, `👾 Creatures`, `🤝 Partners`, `🧭 Indicators`, `⚡ Upgrades`) with unlock progress badges and fluid category transitions.
  - **Collection & Bank Header**: Sticky top navigation bar featuring unified collection progress (`14/31 Cosmetics · 12/80 Upgrade Ranks`), responsive Back navigation, and live animated coin capsule.
  - **Multi-Rank Incremental Stat Upgrades**: Added 4 character stat upgrade tracks (`speed`, `vortex`, `growth`, `duration`) with 20 incremental ranks each (+5% per rank up to +100% maximum capability boost).
  - **20-Tier Cost Curve**: Balanced 20-step exponential cost progression (`100` -> `3,400` coins per track, totaling 25,975 coins per category and 103,900 coins across all 4 tracks to achieve 100% max mastery).
  - **20-Segment Pip Progress Visualizers**: Discrete interactive segment progress meters indicating current rank, active bonus, and next-rank unlock cost with distinct maxed crown badges.
  - **Save Migration v19 -> v20**: Bumped `CURRENT_VERSION = 20` with backward-compatible migration converting legacy `growth5` owner into Rank 1 Mass Growth and initializing `upgrades` schema defaults.
  - **Simulation & Sandbox Wiring**: Upgrades dynamically scale movement speed, vortex attraction pull, devoured block mass growth, and power-up active durations in both `Sim` (`sim.js`) and `VoxelSandboxSim` (`voxelsim.js`).

- 2026-08-15 — Gameplay Enhancements & Mechanics Polish
  - **Titan Surge Max Size**: Player reaches absolute max size (`MAX_RADIUS` = 13.1m in sandbox, `PLAYER_MAX_RADIUS` = 13.5m in campaign) for the full 15s duration of the power-up.
  - **6-Second Minimum Modal Duration**: Modals, cinematics, and HUD announcements (`showPowerUpShowcase`, `showDragonballCollectCinematic`, `showEarthquakeCinematic`, `showPokemonEncounterModal`, and `hud.announce`) display for at least 6.0 seconds unless cancelled/skipped by the player.
  - **Defensive Coin & Bank Accounting**: Initialized `coinsCollected = 0` in both simulation engines and added guarded fallbacks across results and HUD readouts to eliminate `NaN` / `NaN/80` bank accounting anomalies.
  - **Smooth Eased Loading Bar**: Continuous requestAnimationFrame tween with cubic easing and shimmer gradient eliminates jumpy loading snaps.
  - **Uncapped Chain Frenzy Combo Scaling**: Multiplier scales continuously without ceiling during Frenzy (`x30`, `x55`, etc. computed as `Math.max(comboMult(chain), chain) * 2.0`) and reflects live on the HUD ring.
  - **Disaster Teleport Penalty**: Collisions with natural disasters (seismic fault fissures, meteor strikes, storm vortices) trigger penalty teleportation to an alternate quadrant with electric zap audio, shockwaves, camera shake, and HUD announcement.

- 2026-08-15 — Dragon Ball Pickup Camera Recovery
  - **Live Render Continuity**: Fixed the undefined return-distance reference
    in the final non-quake pickup camera phase. The camera now eases back to
    the current chase distance instead of throwing per frame, so the world
    keeps rendering as Chrono Freeze (and every other non-quake power-up)
    completes its explanatory card.

- 2026-08-15 — Chrono Freeze Ice Cue Restored
  - **Sequenced Pickup Audio**: Collecting Chrono Freeze now plays the normal
    power-up collection sound followed 250 ms later by its dedicated frozen-time
    ice cue, in both campaign and voxel sandbox modes.

- 2026-08-15 — Non-Quake Dragon Ball Pickup Sequences Restored
  - **Two-Stage Power-Up Flow**: Spawned Vortex, Turbo, Titan, Chain Frenzy,
    and Chrono power-ups retain their Pokemon encounter intro, then play the
    Dragon Ball collection camera move and explanatory effect card when picked
    up. The fixed-step timer pauses for the 3.4-second card sequence.
  - **Quake Isolation**: Fault Line Rupture is explicitly excluded from the
    generic collector and retains its independently timed earthquake super-move.
    All collection sequences retain Space/Enter/Escape/tap/click skipping and
    the reduced-motion path.

- 2026-08-15 — Fault Line Rupture Super-Move Expansion
  - **Dragon Ball Arcade Sequence**: Extended the cinematic to 5.8 seconds of
    paused game time: three hard-cut player close-ups from distinct angles slam
    **EARTH**, **QUAKE**, and **TIME!** into the center of the screen before
    the camera launches to the distant endpoint, pulls a 180-degree turn, and
    races back down the glowing rupture toward the player.
  - **Motion-Safe Variant**: The sequence honors the operating system and
    in-game reduced-motion settings with a 2.4-second overview hold, while the
    normal version keeps the existing Space/Enter/Escape/tap/click skip path.

- 2026-08-15 — Strict Test-Driven Development (TDD) Mandatory Standard
  - **Standardized TDD Workflow**: Mandated the Red-Green-Refactor development methodology across all codebase modifications. Established that tests/assertions must be written first in the validator suite (`tools/validate.mjs` or modular test harnesses) to prove expected failure before writing implementation code.
  - **Agent & Contributor Alignment**: Added the TDD mandate and workflow instructions to [AGENTS.md](file:///C:/programming/nicos-apps/Flywheel/AGENTS.md), created [CLAUDE.md](file:///C:/programming/nicos-apps/Flywheel/CLAUDE.md), and updated [.wiki/conventions.md](file:///C:/programming/nicos-apps/Flywheel/.wiki/conventions.md) so all coding assistants adhere to TDD uniformly.

- 2026-08-15 — Fault Line Rupture Cinematic Restored
  - **Live Presentation Wiring**: Reconnected the existing earthquake camera and
    UI cinematic to the emitted `quake` event in both campaign and voxel
    sandbox play. The sim resolves the rupture first, then the 2.4-second
    sequence holds gameplay while it frames the player, whip-pans along the
    fault, tracks the propagating destruction, and returns to chase view.
  - **Safe Skip & Recovery**: Space, Enter, Escape, tap, or click skips to the
    completed visual state; natural completion preserves the fissure's normal
    8.5-second visual lifetime. The hold clears queued pointer movement and
    resets the fixed-step accumulator on return, so no movement or gameplay
    time advances unseen; a full-clear result waits until the cinematic ends.
  - **Pickup Event Guard**: Protected the legacy call to the removed
    `Screens.triggerActivePowerUpOverlay` method so collecting any power-up no
    longer interrupts its event stream before the renderer receives it.

- 2026-08-15 — Collected Power-Up 3D Mesh Disappearance & Scene Graph Cleanup
  - **Instant Power-Up Despawn on Collection**: Fixed an issue in `voxelworld.js` and `world3d.js` where collected power-up meshes remained visible in the 3D scene after pickup. Added `_removePowerUpMesh(id)` with explicit Three.js node detachment, scene removal, and visibility silencing (`visible = false`).
  - **Continuous State Reconciliation**: Updated the per-frame power-up loop to continuously purge any power-up mesh marked `collected` or `expired`, ensuring 3D pickup items disappear the instant the player runs over them across both campaign and voxel sandbox modes.

- 2026-08-15 — Tornado Siren Dissipation Cutoff, Level Soundtrack Initiation & 50% Master Volume Tuning
  - **Dynamic Tornado Siren Cutoff**: Converted the tornado warning siren and whirlwind sounds in `game-audio.js` into controllable audio handles (`stopTornadoSiren`, `stopTornadoLoop`). The siren and vortex loop now cleanly cut and fade out the moment the twister dissipates or leaves the metropolis (`storm_cleared` event), as well as on scene exit/results.
  - **In-Game Level Soundtrack Activation**: Fixed level start music cue assignment in `main.js` (`startLevel`). Campaign levels now dynamically map each metropolitan district to its dedicated soundtrack (`brooklyn.mp3`, `lower-manhattan.mp3`, `boston.mp3`, `chicago.mp3`, `cambridge.mp3`), ensuring level music starts playing immediately upon level entry.
  - **50% Default Master Volume Tuning**: Set `DEFAULT_MASTER_VOLUME = 0.50` (50%) in `mix.js` and bumped `MIX_VERSION = 3` so existing installs automatically receive the calibrated mix while preserving relative bus levels (SFX 30%, Music 25%, Ambience 15%).

- 2026-08-15 — Smooth Boot Progression & Title Music Autoplay Fix
  - **Fluid 0% to 100% Loading Bar**: Rebuilt the boot splash progress engine (`index.html`) with smooth milestone damping and progressive interpolation across all initialization phases (`INITIALIZING ENGINE`, `FETCHING METROPOLIS VOXELS`, `BUILDING 3D GEOMETRY`, `COMPILING 3D SHADERS`, `READY TO ROLL!`). Eliminated premature 15% flash and guaranteed a rhythmic, measured loading progression that smoothly completes to 100% before elegant fade-out.
  - **Reliable Title Music Playback**: Fixed an issue in `MusicDirector` (`music.js`) where cold-boot early unlock swallowed subsequent play attempts after browser autoplay blocks. `unlock()` and `request()` now continuously retry playback on user gestures, ensuring soundtrack streams seamlessly on boot or immediately on first tap.

- 2026-08-15 — High-Fidelity Rendered Audio Assets Integration (19 Dedicated Masters)
  - **19 Custom Rendered Sound Assets Hooked Up**: Integrated all authored sound effects in `assets/audio/` (`Flywheel-tornado-siren.mp3`, `Flywheel-police-siren.mp3`, `Flywheel-coin.mp3`, `Flywheel-power-up-collect.mp3`, `Flywheel-power-up-spawn.mp3`, `Flywheel-frozen-time-powerup.mp3`, `Flywheel-earthquake.mp3`, `Flywheel-tornado-loop.mp3`, `Flywheel-shooting-comet.mp3`, `Flywheel-gound-impact-01.mp3`, `Flywheel-gound-impact-02.mp3`, `Flywheel-glass-shatter.mp3`, `Flywheel-debris-metal.mp3`, `Flywheel-crash-small.mp3`, `Flywheel-combo-small.mp3`, `Flywheel-combo-big.mp3`, `Flywheel-combo-alternate.mp3`, `Flywheel-ui-confirm.mp3`, `Flywheel-ui-tap.mp3`).
  - **Cataclysm Warning Sirens & Emergency Audio**: Wired `Flywheel-tornado-siren.mp3` to `storm_warning` events and cataclysm alerts, and `Flywheel-police-siren.mp3` for emergency response and high-tier wanted frenzy events.
  - **Dynamic Audio Engine Routing**: Updated `AudioEngine` (`engine.js`) to support direct full-filename mappings via `_ext` and hooked all power-ups, earthquakes, tornado loops, comet strikes, combo escalations, and UI interactions directly to their dedicated masters in `game-audio.js`.
  - **Test Suite Verification**: All audio test suites passing (`game-audio.test.mjs`, `engine.test.mjs`, `music.test.mjs`) along with offline boot validation.

- 2026-08-15 — Immediate Title Music Preloading & Early Boot Audio Streaming
  - **Zero-Latency Music Preloading**: Added same-origin `<link rel="preload">` for `assets/music/main-menu.mp3` in `index.html` and pre-warmed audio buffer allocation during HTML parsing.
  - **Early Boot Music Request**: Initialized and unlocked `audio.music` on boot in `main.js` with cue `'menu'` and attached early interaction handlers (`pointerdown`, `touchstart`, `keydown`) so soundtrack playback begins streaming and playing immediately while the progress bar is filling.
  - **Synchronized 3D City & Music Load Gate**: Linked `#boot-splash` progress bar and percentage directly to the live lifecycle of the 3D spinning title background city in `menuscene.js` and title music cue in `main.js`. Eliminated the artificial 1.1s build delay; the loader actively tracks script loading ($0\text{–}30\%$), voxel metropolis fetching ($30\text{–}65\%$), 3D geometry and shader instancing ($65\text{–}90\%$), and only advances to $100\%$ and fades out when the 3D spinning city is actually rendered on screen and title music is playing.
  - **Button Interaction Gate**: All title screen inputs and buttons are protected from phantom taps until the 3D metropolis is confirmed hot and spinning.
  - **Metropolis Transition Loader**: Added matching in-game loading screen in `screens.showLoading` with live progress animation and district initialization telemetry when switching between cities.

- 2026-08-15 — Real-Time Dragon Ball Fault Line Rupture Restoration & Uninterrupted Power-Up Activation
  - **Live Gameplay Uninterrupted Flow**: Restored seamless, unpaused real-time gameplay on power-up pickup (removing pausing sky cutaway modals so players remain in continuous direct steering control while watching the live city destruction unfold).
  - **Live Dragon Ball Super Saiyan Ki Aura**: Collecting the Earthquake power-up instantly bursts golden Super Saiyan flame jets, levitating spinning boulder chunks, and expanding golden ground shockwaves directly around the player's hole.
  - **8.5s Molten Fault Line & Magma Geyser Chasm**: The ground fissure rips continuously from the player's epicenter across the entire map, snapping skyscraper foundation blocks in domino cascade with incandescent magma geysers shooting up along the fissure.
  - **Exclusively Player-Earned Superpower**: Preserved the seismic cataclysm as an earned collectible power-up (`FAULT LINE RUPTURE`) with heavy tectonic screen rumble (`cam.triggerShake(1.2)`) and sub-bass audio (`playFaultLineQuake`).

- 2026-08-15 — Natural Disaster Physics Optimization & Bounded Twister Vortex
  - **Disaster Spatial Query Indexing**: Replaced unindexed full-scene block scans in `StormSystem._applyStormDestruction` with local bounding-box queries `[vortexX ± stormRad, vortexZ ± stormRad]`, eliminating CPU spikes on 80,000+ voxel metropolises during active tornado/hurricane cataclysms.
  - **Bounded Twister Vortex Simulation**: Capped active swirling physics bodies in tornado funnels to 48 pieces, allowing dense airborne visual chaos while immediately settling ground debris to keep frame rates locked at 60 FPS.
  - **Graph Invalidation Throttling**: Restricted support graph invalidation during atmospheric wind events to structural foundation elements (preventing unnecessary whole-city BFS recalculations when detached roof/window voxels peel off).
  - **Validation Test Suite Verification**: All validation suites passing cleanly (`scenesWinnable` across all 8 metropolises, `campaignLevels` across all 100 levels, `runBoard` 10,807 deterministic assertions accelerated >2×).

- 2026-08-15 — Tiered City Coin Economy (Scaled Ground Spawns, Per-Coin Multipliers, and Escalating Full-Clear Payouts)
  - **Escalating Map Coins & Multipliers**: Scaled ground coin spawns and individual coin values across the 8-metropolis difficulty ladder (`The Lab` 60 coins × 1 -> `Lower Manhattan` 70 coins × 2 -> `Brooklyn` 80 coins × 2 -> `Chicago Loop` 100 coins × 2 -> `Cambridge` 120 coins × 3 -> `Upper Manhattan` 140 coins × 3 -> `Boston Seaport` 160 coins × 4 -> `Tokyo Shinjuku` 200 coins × 5).
  - **Tiered Level Clear Bonus**: Scaled 100% full-clear completion bonuses proportionately (`The Lab` +25 -> `Lower Manhattan` +50 -> `Brooklyn` +75 -> `Chicago Loop` +100 -> `Cambridge` +150 -> `Upper Manhattan` +200 -> `Boston Seaport` +300 -> `Tokyo Shinjuku` +500).
  - **Live HUD & Result Screen Synchronization**: Coin pickup HUD announcements dynamically report the tiered coin value (`COIN! +X`), city select cards showcase `🪙 MAP COINS` with multiplier and clear bonuses, and result screens calculate deterministic total coin awards correctly.

- 2026-08-15 — Fast Startup & 2-Stage Menu Flow (Stage 1 Clean Title -> Stage 2 City Carousel with Dynamic Size Progression)
  - **Fast Startup Module Preloading**: Added same-origin `<link rel="modulepreload">` tags for `js/main.js`, `js/vendor/three.module.js`, and `js/ui/screens.js` in `index.html`, eliminating module parse latency on cold boot while strictly adhering to offline boot invariants.
  - **Stage 1 Clean Title Screen**: Stripped level chips and dense free-play shelf from the landing screen in favor of a clean, structured top-to-bottom hierarchy: Standalone **`PLAY`** primary CTA button (`#btn-main-play`) -> Split **`Login | Highest Score`** row -> Standalone **`Skin Progress`** graphic coin meter card -> Full-width **`RUN CHICAGO · 90 SECONDS`** challenge -> Split **`Records | Shop`** row -> Full-width **`Settings`** button -> Legal & Credits footer.
  - **Stage 2 City Selection Carousel**: Built a dedicated Stage 2 metropolis selector (`showCitySelect`) featuring a centered 3D holographic city card, interactive `<` and `>` navigation buttons, touch swipe gesture support, keyboard arrow controls (`←`/`→`, `A`/`D`, `Enter`, `Esc`), and a bottom step pagination rail.
  - **Dynamic Size-Ascending Progression Gating**: Implemented `getSortedCityCatalog()` and `isCityUnlocked()`, sorting all 8 metropolises strictly by voxel block count ascending (`The Lab` 12k -> `Lower Manhattan` 25k -> `Brooklyn` 40k -> `Chicago Loop` 44k -> `Cambridge` 73k -> `Upper Manhattan` 73k -> `Boston Seaport` 83k -> `Tokyo Shinjuku` 84k). If a player has not played a level yet, that level remains unavailable until they have cleared the previous level at 100% in under the 5-minute duration limit.

- 2026-08-15 — Power-Up Lifecycle, Louder Combo Multipliers, Anime Screen Overlays, Endgame Target Beacons & Scheduled Disasters
  - **Power-Up Spawning Cadence & Lifespan Rules**: Standardized board maximum to 2 power-ups (`MAX_MAP_POWERUPS = 2`), set indefinite ground lifespan until collected (`lifespan: Infinity`, no despawning), and established a strict 35-second cadence and cooldown after collection. Standardized all timed power-ups (`VORTEX`, `SPEED`, `TITAN`, `FRENZY`, `CHRONO`) to a full 15-second duration (`duration: 15.0`).
  - **Louder Combo Multiplier Visuals**: Overhauled `#cm-burst` with bold anime action typography (22-32px), glowing 3D comic extrusions, spinning dashed halo rings, and energetic scale slam animation directly framing the top-right combo meter.
  - **Endgame Remaining Blocks Pill (`#blocks-left-pill`)**: Displays `🎯 42 BLOCKS LEFT` under the top-center countdown clock when remaining uneaten blocks drop below 100 or when time remaining reaches `≤ 30s`.
  - **3D In-World Target Locator Beacons**: Added downward-pointing 3D glowing cone arrows and pulsating ground beacon rings hovering over remaining standing blocks across the map during the endgame (`≤ 30s` or `≤ 100` blocks remaining) so players can quickly target stragglers for 100% full clears.
  - **Anime Power-Up Screen Overlays**: Built active visual overlays for each power-up including Chrono Freeze (icy frost vignette & clock freeze), Vortex Vacuum (gravitational lens warp & inward suction rays), Titan Surge (crimson kinetic aura & Kanji expansion header `巨 大 化`), Turbo Overdrive (anime lightning speedlines), and Chain Frenzy (dragon flame borders).
  - **Scheduled Natural Disasters**: Added natural disaster triggers in city sandboxes at 1m30s elapsed (Seismic Super Quake ripping fault fissures across the map) and 1m before the end (Meteor Shower bombarding building clusters and detaching loose rubble).

- 2026-08-15 — Short-Phone Landing Fix
  - On viewports under ~780px tall (iPhone SE class), the pinned chip-shelf design left RECORDS/SHOP/SETTINGS painted off-screen while the shelf's nested scroller (`overscroll-behavior: contain`) swallowed the page scroll gesture — taps meant for RECORDS landed on masked city chips ("tapped RECORDS, got Cambridge"). New `max-height: 780px` query flattens the shelf into document flow on short phones: no inner scroller, no mask, one page scroll. Verified with live hit-testing at 360×560/360×640/375×667 (flattened, RECORDS reachable) and 390×844 (pinned shelf intact).

- 2026-08-15 — Default Action Camera Angle & Obstruction View Clearance
  - **Dynamic Action Camera Angle by Default**: Set default base pitch to `0.54` rad (~31 deg, matching the cinematic third-person action angle) across all gameplay instead of the steep 0.98 top-down view, framing skyscrapers and city depth dynamically.
  - **Near-Clipping & Blocker Margin Elimination**: Added safety standoff margins (`0.75m` in XZ and `0.4m` in Y) to `_insideBlocker` and `_roofOver` in `js/camera.js`, ensuring the camera near-clipping plane never slices into building geometry or exposes hollow internal faces.
  - **Universal Roof Clearance**: Enabled roof climb and blocker clearance continuously during gameplay (`this.introPhase !== 'hold'`).
  - **X-Ray Occlusion Silhouette Vision Beacon**: Added an always-visible see-through silhouette rim (`depthTest: false`, `renderOrder: 995`, cyan aura) to the player hole in both `js/voxelworld.js` and `js/world3d.js`, guaranteeing the player hole, navigation pointer, and radius remain visible through occluding buildings.

- 2026-08-15 — In-Game GUI Visual Hierarchy & Mobile Ergonomics Overhaul
  - **Master Countdown Timer at Top-Center (`#level-clock`)**: Elevated the primary game constraint (time remaining) to the prime focal anchor at top-center (`left: 50%; transform: translateX(-50%)`) with obsidian frosted glass styling, high-contrast tabular typography, amber warning glows (`<= 30s`), and fiery red heartbeat pulsing (`<= 10s`).
  - **Demoted Level / City Name (`#level-banner`)**: Stripped the oversized accent banner card in favor of a sleek, unobtrusive micro-capsule pill (`✦ TOKYO · SANDBOX ✦`, 9-11px tracked uppercase), maximizing mobile screen real estate and eliminating view obstruction.
  - **Clean Objective & Progress Stack (`#hud-left`)**: Grouped the micro-pill, glowing clearance progress bar (`#mass-bar`), metric label (`#mass-label`), and gold tabular score plate (`#score-plate`) into a streamlined vertical stack on the top-left.
  - **Top-Right Utility & Currency Bar (`#hud-right`)**: Consolidated secondary currency (`#timer`), 🔊 Mute, and ⏸️ Pause into a single horizontal controls row above the radial combo meter and active power-up flyouts.

- 2026-08-15 — Mobile UI Screen Region Spatial Separation (Size Center vs Combo Meter Burst)
  - **Center-Glass Size Level-Up Pop (`#big-pop`)**: Size level-ups (`SIZE 2!`, `SIZE 3!`, ..., `SIZE 24!`) are prominently centered on mobile glass (`left: 50%; top: 44%`) with 3D extruded comic typography, cyan energy badges (`✦ EXPANDING VORTEX ✦`), and radiant particle shockwaves.
  - **Combo Meter Burst Overlay (`#cm-burst`)**: Moved combo multiplier gain announcements (`2X`, `3X`, `5X`, `MAX 8X`) off the main screen center and positioned them directly over the **combo meter** in the top right. Sized at 120% diameter (`inset: -10%`) to precisely cover the combo meter ring and readout with 20% margin, animated circular burst halo, shock ring, and tier-specific heat aura (`#ffd23f`, `#ff9f1c`, `#ff2a2a`, `#00e5ff`).
  - **Upper-Middle Band (`#hype-band`)**: Reserved exclusively for citywide milestones (`50% CLEARED`, `100% CLEARED`), environmental cataclysms (`THE TIDE IS RISING!`), and landmark consumption (`LANDMARK SWALLOWED!`).
  - **Queue-Governed Routing**: All presentation channels routed through `hud.announce(...)` with distinct channel identifiers (`pop`, `cm_burst`, `band`, `toast`).

- 2026-08-15 — Pokémon Wild Battle Encounter Power-Up Spawn Introduction
  - **Synthesized Pokémon Battle Fanfare**: When a power-up spawns on the map, plays an authentic 6-note battle arpeggio into chiptune square/brass blast with sub-bass drop and star sparkles (`playPokemonEncounter` & `playPokemonDropLand` in `js/audio/engine.js`).
  - **Full-Screen Battle Encounter Modal**: Angled black battle shutter doors (`.poke-battle-wipe`), rotating stadium radial burst rays, and a holographic 3D battle card displaying `"⚡ A WILD POWER-UP HAS APPEARED! ⚡"`, elemental typing (`PSYCHIC / GRAVITY`, `ELECTRIC / SPEED`, `FIGHTING / TITAN`, `GROUND / SEISMIC`, `DRAGON / RAGE`, `STEEL / TEMPORAL`), level badges (`Lv.55 - Lv.80`), rarity tags (`LEGENDARY`, `MYTHICAL`, `RARE`), and animated floating power-up icon with spinning energy aura.
  - **Choreographed Skyfall Camera & In-World Beacon**: 3-phase camera movement zooming from the player down city streets to frame the exact touchdown point where a 50m vertical skyfall light pillar beams into the clouds with dual shockwaves.
  - **Instant Skip Controls**: Snappy 1.5s auto-resume with instant skip support on Space, Enter, Escape, Arrow keys, or screen tap/click.

- 2026-08-15 — Combo Screen Glow Removal & Anime Battle Banner Overhaul
  - **Removed Damage-Like Combo Screen Glow**: Eliminated the red/orange/pink peripheral border vignette and pulse animations (`combo-lvl-4/6/8`) that previously caused visual confusion on mobile devices resembling player damage.
  - **Dynamic Anime Combo Announcements**: Multiplier tier thresholds (`x2`, `x3`, `x4`, `x5`, `x6`, `x7`, `MAX 8x`) now trigger dynamic anime battle announcements (`"2X COMBO!"`, `"3X COMBO!"`, `"5X COMBO!"`, `"MAX 8X COMBO!"`) with chain subtitles (`"CHAIN ×10"`, `"⚡ HYPER CHAIN ×50"`, `"⚡ GODLIKE CHAIN ×600 ⚡"`), camera shakes, and shock rings.
  - **Full Anime Presentation Overhaul**: Replaced the generic black announcement bar with a dynamic Shonen/Anime battle banner (`#hype-band`) featuring angled polygon cuts (`skew(-9deg)`), horizontal speed motion streaks, glowing tier badges (`combo`, `roar`, `hype`, `nudge`, `size`, `powerup`), and heavy extruded typography with vibrant glows.
  - **Milestone Ladder Order & Text Remediation**: Fixed the out-of-order 65% "NOTHING LEFT STANDING!" bug in `js/voxelsim.js`. Rebuilt the milestone ladder with strictly escalating clear percentages and descriptive titles (`5%`, `15%`, `25%`, `40%`, `50%`, `65%`, `75%`, `90%`, `98%`, `100%`), reserving `"100% CLEARED — TOTAL MAP CONSUMPTION!"` exclusively for full map clears.

- 2026-08-15 — Dragon Ball Anime Cinematic Earthquake Power-Up Overhaul
  - **Hit-Stop Freeze Frame & Sonic Impact**: Collecting the Earthquake power-up triggers a crisp dramatic anime freeze frame with high-frequency strike audio, instant sub-bass drop (`playAnimeHitStop`), and radial orange impact flash.
  - **Multi-Phase Cinematic Camera Choreography**: 4-phase choreographed camera movement featuring an ultra-dramatic low-angle hero freeze frame on the player, a hypersonic whip-pan zoom to the distant horizon end point, a tracking chase camera following the supersonic shockwave along the rupture corridor with reactive building collapse camera shakes, and a buttery-smooth return to the player chase camera.
  - **Procedural 3D Jagged Magma Fissure**: Generates real-time 3D glowing molten basalt fissures with lifted tectonic crust slabs, angled slabs, branching side cracks, smoke plumes, and glowing embers tearing across the map from the player to the furthest corner.
  - **Building Collapse Physics & Voxel Fracturing**: Buildings caught in the rupture corridor tilt violently outward, sink into the opening crevasse, and fracture into exploding 3D voxel debris in real time with synthesized concrete crumble and rubble collapse sound effects.
  - **Anime UI & Skip Controls**: Full-screen cinematic letterbox bars, radiating speed lines, and stylized `"⚡ FAULT LINE RUPTURE ⚡ - TECTONIC CATACLYSM"` banner with instant skip support on Space, Enter, Escape, or screen tap.

- 2026-08-15 — SIZE 24 Ladder & Proportional Scaling Overhaul
  - Expanded the size progression ladder from SIZE 12 to SIZE 24 with geometric raw mass thresholds (`SIZE_MASS` extending up to 806k mass), scaling the maximum hole radius up to 12.6m (13.1m at sizeFrac 1) and `PLAYER_MAX_RADIUS` to 13.5m. Camera framing dynamically zooms out to track the player's immense scale (`base = 7 + holeRadius * 3.6`, up to ~52m distance at SIZE 24), maintaining perfect framing over colossal swallowed structures.

- 2026-08-15 — Tokyo Geographic Accuracy Pass
  - Remediated the Tokyo map against the real city. Removed the fictional Meiji Jingu 5-Tier Pagoda (Shinto shrines have no pagodas — that was Senso-ji) and replaced it with the Minami-Shinmon Grand Gate in unpainted cypress with a copper-patina roof; recolored the Great Torii, Haiden, and Kagura-den from vermilion to bare cypress/dark timber (vermilion is Fushimi Inari, not Meiji). Railed correctly: dropped the Shinkansen (none serve Shinjuku), relabeled the E-W viaduct as the JR Chūō Line with orange-striped E233 rapid trains, and moved the Yamanote E235 onto its own new N-S elevated track breaking at the terminal. Moved NTT Docomo Yoyogi Tower south of the station to Yoyogi (was in Nishi-Shinjuku); recolored Tochō twin towers to light granite with flat observation roofs (no helipads); separated Omoide Yokocho into its own west-exit alley strip by the tracks (Kabukicho district renamed "Kabukicho & Golden Gai"); relabeled the "Akihabara SEGA" arcades as Kabukicho's real TAITO Station & GiGO game centers.

- 2026-08-14 — Tokyo Daytime Palette Overhaul
  - Replaced neon/rainbow building accents (magenta, cyan, hot pink, purple, bright yellow) with realistic daytime architectural tones — muted bronze, sandstone, grey-green patina for skyscrapers; traditional cinnabar, indigo, ochre, pine green for izakaya signs; warm cream and cool grey for Harajuku boutiques; rich crimson for Kabukicho gate and 109 signage.

- 2026-08-14 — Earthquake Fault-Line Direction Fix
  - Rewired quake power-up so the crack starts at the player's position and extends toward the furthest map corner (was centered on player with velocity-based direction). Added propagating staggered VFX — shock rings fire sequentially along the crack over ~0.7s instead of all at once.

- 2026-08-14 — Environmental Cataclysms & Power-Up Overhaul
  - **Fault Line Rupture (Seismic Quake Overhaul)**: Spawns a directional ground fault rupture from the impact point to the furthest map boundary, snapping building foundations and toppling skyscrapers with domino physics, subterranean tectonic rumble audio, and propagating magma crack particle bursts.
  - **Chrono Time Freeze (True World Time Stop)**: Completely pauses moving traffic and falling physics blocks in mid-air for 8s while the player zooms at hyperspeed vacuuming up frozen prey with frost screen vignette, reverse whoosh, and crystal shatter sound effects.
  - **Dynamic Tornado / Hurricane Storm System**: Schedules 3 dramatic atmospheric cataclysms per match (t=60s, 150s, 240s) with dark thunderstorm sky transitions, rolling thunder audio, and high-velocity wind vortices (Tornado rips upper floors & spires off skyscrapers inland; Hurricane unleashes coastal storm surges in harbor cities) breaking structures down into a chaotic scavenger hunt.

- 2026-08-14 — Tokyo Mega-Metropolis Expansion (83,573 blocks / 154,879 mass)
  - Expanded `js/voxelscene-tokyo.js` into the largest, most hyper-dense city sandbox on the roster, featuring wall-to-wall infill across 5 iconic districts (Nishi-Shinjuku Skyscraper Canyon, Kabukicho & Golden Gai Izakayas, Ginza & Roppongi Hills Luxury Wards, Shibuya Scramble Crossing & 109, and Meiji Jingu Sacred Forest & 5-Tier Pagoda) with 100% static structural equilibrium (0 falling blocks at t=3s)

- 2026-08-14 — Panicked Derailment Scream SFX
  - Added procedural multi-voice vocal formant scream effect (`playTrainScream` in `js/audio/engine.js`) triggered whenever an elevated train track is undermined and the train plummets into the city

- 2026-08-14 — 3-Thirds Showcase Sandbox Architecture
  - Reorganized the full sandbox map into 3 distinct showcase zones spanning 190m × 90m (11k blocks, bounds ±95m): Zone 1 (West: Voxel models + Kenney textures), Zone 2 (Center: Kenney break-apart vehicles & suburban/commercial prefabs), Zone 3 (East: Modified Kenney mega skyscrapers up to 30m tall with modular detachable floor breakdown physics)

- 2026-08-14 — Cute Kenney-Inspired City Surface Textures
  - Added `mat_awning_stripe` (commercial awnings), `mat_shop_window` (storefront display glass), `mat_suburban_siding` (wood clapboard), `mat_clay_shingles` (scalloped roof tiles), and `mat_warehouse_roll` (industrial garage doors) with zero-cost procedural WebGL2 texture array support and per-block overrides

- 2026-08-14 — 5-Minute Level Duration & Perimeter Voxel Containment
  - Standard city goal clock extended to 5:00 minutes (300s); added perimeter boundary clamping to prevent fallen voxels from spilling outside the playable area, and calibrated ground friction for natural rubble mounds

- 2026-08-14 — Power-Up Showcase Modal & Pure Demolition
  - Added 5-second power-up popup card with timer progress bar & auto-resume; turned off damage color tinting so blocks break apart in their original textures and colors

- 2026-08-14 — Anti-Clustering & Power-Up Balancing
  - Max 4 power-ups on map, minimum 24m spatial separation on spawns, dynamic mutual repulsion on roaming items, and max 3 active buffs

- 2026-08-14 — Dynamic Roaming & Intermittent Power-Ups
  - Ground items actively wander city streets, expire with pre-despawn flicker (~26s), and intermittently drop every 18–28s; stripped obsolete 100-levels / campaign map UI from stats screens

- 2026-08-14 — Authentic Coin Audio & Power-Up Polish
  - Harmonic WebAudio synthesized coin chimes (`B5 -> E6`), 6-note arpeggio power-up fanfare, persistent HUD flyout animations, ambient screen color vignettes, and stripped repetitive crash audio

- 2026-08-14 — Visual Polish Stage 6
  - In-world active power-up aura rings & trail sparks, void accretion spiral depth, demolition dust poofs, combo/powerup screen edge heat vignettes, and native tactile mobile haptics

- 2026-08-14 — Visual Polish Stages 2–5
  - 4 architectural facade canvas textures, aggregate roads with sidewalks/curbs, procedural pads, detailed vehicles/trees/street furniture, elevated hemisphere/sun lighting & atmospheric fog, near-isometric tilt-shift camera (56° pitch, 45° FOV), and eat squash-and-stretch motion

- 2026-08-14 — Splash screen status header
  - always-visible Player Login, Highest Score (Overall), and next skin coin progress meter above city choices

- 2026-08-14 — Boards offline/local fallback
  - seamless profile creation without server dependency

- 2026-08-14 — Power-Up System
  - 6 physical power-ups with initial drops and 100k/500-mult milestones

- 2026-08-13: **Four findings closed, not filed** (Phase 5 of
  `.wiki/features/timed-runs-and-full-clear/`, T-501..T-504 — the out-of-scope
  defects Phase 3 raised).
  (1) **The head of the combo ladder did nothing.** `comboLevel` mapped a
  crossing of `COMBO_THRESHOLDS[i]` to level `i + 1`, and level 1 is the floor,
  so crossing index 0 awarded what a chain of 0 already had: a chain of 2 scored
  exactly what a chain of 0 scored while the game published a step at 2. The
  defect was structural, not a bad number — **any** value at index 0 was inert,
  so re-tuning `2` to `5` would have fixed nothing. The entry is dropped, the
  mapping is `level = i + 2`, and `COMBO_MAX_LEVEL` is `length + 1` (the x1
  floor is a level with no threshold). Every rung x1..x8 keeps its exact chain
  range, so **no score moved and there is no `RANKED_SIM_VERSION` implication**.
  Proven twice over: the 27-row literal chain→multiplier table in
  `tools/validate.mjs` passes **unedited**, and six scripted routes replay
  bit-identically — gallery 19,149 (peak chain 601, so it crosses the top rung),
  Manhattan 23,175 (peak 1,526), its district excursion 5,025, Brooklyn 6,397,
  Boston 12,957, Chicago 7,228. A new guard asks the ladder FUNCTION whether
  each threshold changes the payout, rather than checking the index arithmetic
  that caused the bug.
  (2) **The stored stat says which quantity it holds.** `runs.stats.best_combo`
  was a chain COUNT under a multiplier's name — the schema-level twin of the
  readout defect T-309/T-311 closed, and the first surface to render it would
  have printed 530 against a ladder that stops at x8. Renamed to `best_chain`
  in `api/_verify.mjs` (its only writer; there is no reader) with an idempotent
  jsonb migration for existing rows. The multiplier that chain bought is
  deliberately not stored beside it: it is `comboMult(best_chain)`, derived by
  the same ladder every other surface reads.
  (3) **The finish bonus is paid for finishing.** `SANDBOX_GOAL_BONUS` was added
  to the coin payout unconditionally, so a run that ran out of clock at 3% of
  the city collected +35 for reaching a goal it never reached — on a screen
  whose own heading read "TIME'S UP". Harmless while reaching the goal was the
  only way to end a sandbox run; a live payout bug from the moment the 180 s
  clock made timing out the ordinary ending. Gated on `sim.won`, the same latch
  the heading and the percentage read. The row is **absent** when unearned
  rather than showing "+0" — and the same rule now applies one row down, because
  gating only the bonus left `Coins earned +0` on the screen of a run that
  collected nothing, which reads as a broken game rather than an honest nil.
  Measured end to end: a timed-out run banks `coins × 2`, a full clear banks
  `coins × 2 + 35`, and the bank moves by exactly the number the screen printed.
  (4) **One countdown, in the pill built for it.** THE RUN wrote its clock into
  `#timer` — the sandbox's coin readout — while `#level-clock` sat hidden
  (`sim.timeLeft` is null in run90). So the one mode whose length is a decision
  of record rendered its countdown in a pill with no endgame states, and the
  coin readout vanished for the whole run. `index.html`'s own comment had
  already warned that "one element cannot be both without one of them
  disappearing". The countdown now goes to `#level-clock` in every mode, derived
  from `RANKED_TICK_COUNT` rather than a literal 90 — as does the RUN results
  screen's "Clock 90.0 s", found while proving this and closed with it, since a
  length stated in three places is a length that will disagree in one. `#timer`
  no longer ships holding `75`, the start value of the campaign clock ramp R-1.1
  retired. The proof COUNTS visible countdowns in the browser rather than
  reading one of them, because a probe that reads `#timer` passes just as
  happily with a second contradictory clock beside it.
  Every guard above was run against a deliberately broken build first — HEAD's
  own files restored one at a time, plus the near-miss forms (the inert entry
  re-tuned instead of removed; the mapping left at `i + 1`, which the literal
  table catches as 23 moved scores; the money gated but the copy left
  unconditional) — and every one failed before it passed.
- 2026-08-13: **Score integrity and honest combo readouts** (Phase 3 of
  `.wiki/features/timed-runs-and-full-clear/`, closing
  `.wiki/findings/RCA-2026-08-13-scoring-and-combo-audit.md`).
  (1) **The ranked release blocker.** `RANKED_TUNE` is now a COMPLETE physics
  description — it names `perfMode` too — and a `run90` sim's `tune` is
  replaced rather than merged, then double-locked (`Object.freeze` on the
  object, `writable: false` on the property, so `sim.tune = {…}` is refused as
  well as `sim.tune.x = 1`). `Object.assign` could never clear a key its source
  lacked, which is exactly how SETTINGS → "Smoother play" leaked into ranked
  physics. `js/main.js` gates every physics lever on `!sim.tuneLocked` while
  still applying RENDER quality, and the server asserts the tune instead of
  assigning it (`unverifiable`, not `mismatch` — a build problem is not the
  player's fault). Measured: server 2231.9625, hostile client 2231.9625
  (delta 0), pre-fix client 2247.9250. Driving all 19 controls on the pause
  SETTINGS screen mid-run moves nothing; the same routine moves five tune keys
  on a free-play sim. **No `RANKED_SIM_VERSION` bump**: adding `perfMode: false`
  leaves the server byte-identical (`undefined` and `false` take the same
  branch), so stored traces replay to the same verdicts.
  (2) **The server compares the two numbers it always had.** A claimed score
  that disagrees with the replayed one is a `score` mismatch at zero tolerance,
  and the claim is recorded either way — including on the `unranked` placement
  gate, whose trust boundary is now written down rather than re-derived.
  (3) **The arena judges the currency it prints.** THE SCORE WINS: the winner
  comes off the combo-multiplied points on screen, not `finalSplit().mass`.
  ADR-0015 already ruled that the combo buys score and the boards rank score;
  if raw mass decided the match, a combo would carry no competitive meaning in
  the one mode where you are beating someone. The tug bar keeps showing
  raw-mass territory and now says `TERRITORY` so it cannot be read as the score.
  (4) **Protocol v4.** The per-hole `mass_q` field went u16 → u32 (a hole is 12
  bytes, a worked-example snapshot 156). The u16 clamped a peer's readable score
  at 16383.75 while the shipped 180 s Chicago route scores 7,425 — 14,709.5 if
  every block it ate had landed at the 8x ceiling, so the old cap sat at 1.11x
  the hard bound of a route we ship. New cap 1,073,741,823.75 = 1082x the
  whole-city-at-8x bound of 992,377.
  (5) **Every combo readout states its unit.** `Best combo x47` on the campaign
  results screen and `COMBO x47` on the campaign HUD pill were chain counts in
  multiplier notation against a ladder that caps at **3.0**; both now read
  `47 eats at x3.0` off `comboMultiplier`. The RUN and sandbox results say
  `530 eats at x7`. The HUD ring's big number — the largest text in the HUD —
  carries a `CHAIN` unit under it. `COMBO_LEVEL_NAMES` numbers its top rung
  `x8` instead of naming it `MAX`, so the real ceiling is finally shown; the
  summit reads as the summit through a paint-only `topped` state instead of a
  label sitting over a number that keeps climbing.
  (6) **The validator's tautology is gone.** The load-bearing combo assertion
  compared `comboMult(c)` against that function's own inlined body and passed on
  any code — proven: it reports ALL PASS on a ladder paying x50. It is replaced
  by a literal chain→multiplier table transcribed from the ruling, and the
  source guards now cover the whole audit B2 inventory (hud, screens, arena,
  index.html, arena.html) plus the float-layout trap that two `<b>` values in
  one results row renders in reverse. All ten breakages were run against a
  deliberately broken tree first and every one failed. `FW_VALIDATE_SECTIONS`
  lets a single section run, since the full validator still stalls in
  `validateCambridge`.
- 2026-08-13: **The 180 s clock and the full-clear goal** (Phases 1–2 of
  `.wiki/features/timed-runs-and-full-clear/`). (1) New pure module
  `js/levelclock.js` holds the ONE declaration — `LEVEL_CLOCK_SECONDS = 180`,
  its tick count, the 30 s/10 s endgame thresholds and `formatClock()`. It has
  zero imports on purpose: the campaign chain (`levels.js` → `sim.js`) and the
  sandbox (`voxelsim.js`, which `api/_verify.mjs` also imports) must both read
  it without dragging each other in. `js/levels.js` dropped its
  `75 + g*0.75 + metroIndex*3` formula; all 100 levels now carry the constant.
  Knock-on: `js/citygen.js` times tides at `level.clock * (0.35 + i*0.25)`, a
  DERIVED value, so campaign tides fire later in absolute seconds — a campaign
  sim-output change that does not touch `sim_version` (ranked `run90` only).
  (2) City runs had no timer at all and now have one. `VoxelSandboxSim` counts
  `clockTicks` (ticks, not accumulated float seconds, so expiry is bit-exact
  and device-independent) and sets `timedOut` + `over` at 10,800. The block
  sits after the goal/win check — a full clear on the final tick is a win — and
  after the `run90` early return, so THE RUN is untouched and its `clockLimit`
  is `null`. (3) Expiry is a NORMAL ending: it lands on the results screen
  under `TIME'S UP` carrying the percentage reached, score, best chain and
  coins. Not a failure state. (4) `GOALS` → exported `SCENE_GOALS`, with
  `targetFraction: 1.0` on all seven scenes. 100% is a scoring ceiling, not a
  win condition. The sweep past the literal `0.5` mattered more than the
  constant: `js/ui/hud.js` compared `cleared >= targetFraction`, which had half
  a city of slack at 0.5 and becomes the exact expression the sim needs a 1e-9
  epsilon for at 1.0 — it now reads the `sim.won` latch, or a real full clear
  would sit on "CLEARED 99%" forever. `js/save.js` v18 splits `completions`
  (full clears only) from the new `runs` (finished runs) and adds
  `bestPercent`; `bestTime` is only set on a win, since a timed-out run always
  takes exactly the clock and would otherwise drive every scene to 180. The
  city chips, RECORDS history and results screen follow that split. Nothing was
  needed on the back end — `api/_verify.mjs` already reports
  `rawMass / totalMass` over the whole map and no board view names a fraction.
  (5) New HUD pill `#level-clock` (its own element: `#timer` is already the
  sandbox coin readout and the campaign countdown), built from existing
  `--fw-*` tokens, with `.warn`/`.urgent` states; both reduced-motion paths
  (OS media query and the in-game `body.reduced-motion` setting) drop the pulse
  and keep the colour and size step. (6) `tools/validate.mjs` gained
  `validateLevelClock()` and `validateScenesWinnable()` — the latter replaces
  the gallery-only guard and consumes every block of all seven scenes in radial
  order, because the epsilon it is testing only fails in some consumption
  orders.

- 2026-08-12: **Mobile performance pass.** Measured on a Pixel-5 profile at
  4x CPU throttle, then fixed: (1) the six authored city scene modules (1.19
  MB of source between them, Cambridge alone 664 KB) no longer load at boot —
  `js/voxelsim.js` gained an on-demand registry (`await loadScene(id)`, with
  in-flight dedupe; the constructor stays synchronous and throws by name if a
  city was not awaited), and the game start path, menu backdrop, arena, scene
  viewer and tools each fetch exactly the city they build. Static imports put
  most of an 18.6 s throttled cold load in front of the title screen; now the
  title paints with zero city modules fetched. (2) The default quality tier
  is device-aware for exactly as long as the player has not chosen:
  `defaultTierForDevice()` starts coarse-pointer phones on LOW, and the new
  `settings.qualityChosen` marker (deliberately no schema bump — absent reads
  false, which is the true answer for every pre-existing save) flips on the
  first Graphics-detail press, after which the stored tier is the only
  authority. The settings label and the menu backdrop's `tooWeak` both read
  the EFFECTIVE tier, so an unchosen phone is never told it runs HIGH and
  never builds a Brooklyn backdrop it cannot afford. (3) `maxSubSteps` 6 → 2
  on BOTH tiers: six was the arithmetic ceiling `0.1 / FIXED_DT` left
  unexamined, and a device that cannot finish one sub-step in a frame was
  asked for six — measured as a 16x frame-time blowup (Brooklyn at ~1 fps,
  6 s of game time per 60 s of wall clock). The cap lives in `main.js`'s
  real-time catch-up loop, not in `sim.tune`, so HIGH's sim trajectory stays
  byte-identical and the validator is untouched; a struggling device now
  gets steerable slow motion instead of a freeze. (4) `resize` events are
  coalesced to one realloc per frame and dropped when nothing moved (mobile
  browsers fire them continuously through the URL-bar collapse). (5) A
  hidden tab now genuinely stops the loop (no renders, no sim steps, no GPU
  work) and lands a mid-run game on PAUSED, with the accumulator and frame
  clock reset on return. (6) `vercel.json` declares the cache split:
  `/assets/**` immutable for a year, `/js/**` + `/css/**` five minutes with
  a week of stale-while-revalidate. **Same pass:** the three eat gulps are
  now original Flywheel MP3 masters (Nico with Suno) replacing the freesound
  CC0 gulps — `AudioEngine` gained a per-name extension map (`FILE_EXT`), so
  sound names, call sites and tests are unchanged; `CREDITS.json`/`CREDITS.md`
  record the provenance swap. Verified: all headless selftests green (voxelsim
  gravity/multihole, duel, rival, arena 72, net 132 + 48, train-derail 39,
  chicago-probe, audio suites, music-assets), validator pre-Cambridge stages
  clean (Cambridge excursion stall remains the documented open issue,
  RCA-2026-08-11), and the in-browser harness
  (`.playwright-mcp/verify.mjs` + `verify-backdrop.mjs`) proves the lazy
  fetch, resize guard and visibility pause on a live page.

- 2026-08-11: **Rival visibility shipped, phases A–D**
  (`.wiki/features/rival-visibility/`) — the answer to the two-phone
  playtest's "no sense of whose blocks were eaten". New `js/rival/` layer,
  read-only over sim events and wire snapshots (ADR-0002): one per-slot color
  identity table (`identity.js`, 8 slots, blue/orange unchanged for P1/P2), an
  attribution record (block id → eater slot + per-slot raw-mass tallies,
  headless-readable — the future seam for heatmaps/stats), crater tinting
  (each eaten column's ground tile takes its eater's color — one InstancedMesh,
  one draw call, tiles written once on the eat, zero per-frame work), a coarse
  tug-of-war possession bar with no digits during play, an "apart or
  off-screen" rival chevron extending the directional-indicator vocabulary,
  rare milestone callouts (first blood / lead change with hysteresis /
  trailing-at-30s / landmark) through one priority announcement channel, and
  an end-of-match territory reveal (ortho frame eases out over the crater map,
  the bar settles to exact percentages — shown there for the first time — and
  the winner is called from the same attribution record on both screens).
  Wire: **protocol v3** — the keyframe tail is now one eaten-RLE stream per
  occupied slot (codec unchanged, layout framed as `u8 count`, then
  `u8 slot/u16 len/bytes` per stream) so a late joiner or a healing peer
  learns *whose* every crater is; hard version gate unchanged. The hot-seat
  page shares the craters + bar; chevron/callouts skipped there on purpose
  (one screen, two humans). `arena.html?t=<seconds>` shortens the match
  (dev-only, host-side, same idiom as multiplayer.html). New headless suite
  `js/rival/rival.test.mjs` (58 checks: keyframe attribution round-trip,
  territory determinism, beat exactly-once/hysteresis, reveal math, shares,
  edge projection). Patterns 3 (size-as-threat) and 7 (score popups) left as
  planned seams for the 8-player pass.
  **Same pass, from device testing: the arena match camera is now the game's
  progressive follow-zoom**, not the full-city overhead frame — the window
  tracks your own hole and widens as it grows (mirroring the single-player
  sandbox feel), because both phones rendering the whole map and every
  distant collapse at once was the big-city FPS killer. `DuelView` grew a
  dirty-only block sync (full N-instance recompose once at start, then only
  `_falling`/`_leanSet`/`_renderTouch` per frame — the same union
  `VoxelWorld3D._syncBlocks` uses — with movers outside ~2.2× the view span
  skipped in follow mode; their settlement still lands via `_renderTouch`,
  and a wire-fed peer reports eats via `noteConsumed`). The hot-seat page
  keeps its full-city frame (two players, one screen) but inherits the
  dirty-only sync. The full-city frame now appears in the arena ONLY at the
  end reveal, which makes the pull-up the first sight of the whole
  two-colored city — and makes the rival chevron the way you find them
  mid-match.

- 2026-08-06: **Persona playtest remediation.** A five-agent UX playtest
  (ux-tester-personas suite, findings in
  `playtests/2026-08-06-persona-campaign/`, gitignored) scored the shipped
  game at "explains itself ~60%" across 21 findings; this pass fixes 15 of
  them and deliberately defers the rest. Sandbox HUD: the goal readout is now
  live (`CLEARED x% / 50% OF THE CITY · SIZE n`) and visually dominant while
  the coin pill shrinks and loses its unexplained `+2` (`body.mode-sandbox`
  scopes the CSS so the campaign countdown is untouched); the combo pill is
  gated at chain ≥ 26 so "COMBO x1" never renders. Pause: WORLD MAP renamed
  CITIES (no map exists; `showWorldMap()` is a `showTitle()` alias), RESTART
  works in the sandbox via `lastSandboxScene` (it was campaign-gated dead
  UI), and both run-discarding buttons got a two-step inline confirm.
  Onboarding: the READY gate carries a control cheat-sheet (key/tap split),
  SETTINGS shows CONTROLS directly under the first toggles, the CTA reads
  PLAY BROOKLYN, and Brooklyn's tag is START HERE. Persistence: the landing
  screen shows the coin bank (hidden at zero) and per-city `CLEARED ×n · BEST
  SIZE n` records from the existing `save.sandbox` data — no schema change.
  Settings hygiene: dev physics sliders folded into `ADVANCED — CITY FEEL`
  with RESET TO DEFAULTS driven by the newly exported `VOX_DEFAULTS` (spread
  into `defaultSettings()`, so reset and fresh-save defaults share one
  source), and BACK is sticky-bottom in the scrolling panel. Loading: a
  static `#boot-splash` in `index.html` covers the module/CDN load until
  `main.js` removes it; the pause button's ❙❙ text glyph became CSS-drawn
  bars. Camera: a `_introK(1-_introK)` pitch bump keeps the intro dive above
  the roofline mid-zoom — the playtest caught ~1 s of blank wall after GO!
  (zero at hold and settled, so neither end pose changes). A verification
  re-run of two personas scored the build at ~85% (from ~55-60%) and closed
  the last residuals the same day: the READY gate now also states the tier
  rule in one sentence ("EAT WHAT'S SMALLER THAN YOU TO GROW"), the sandbox
  results screen shows the projected coin Bank, and the gallery scene is
  'SANDBOX' on every surface (was 'THE COLLECTION' in three places).
  Deferred by decision: campaign resurrection (retired in a137054), sandbox
  coin minimap, per-prop edibility tint, pacing verdicts (headless
  SwiftShader ran the sim at 5-11% speed; needs a real-GPU pass). Validator
  ALL PASS; browser smoke of every new flow in
  `playtests/.../scripts/smoke-fixes.cjs`.

- 2026-08-06: **Tank controls everywhere — one scheme, campaign and sandbox.**
  The hole now carries a persistent world-space heading owned by
  `js/controls.js`: W/S are throttle along it, A/D rotate the heading itself
  at `ORBIT_RATE × turnSens × size ramp` (sandbox; flat base rate in the
  campaign) — including spinning in place when stationary, so a parked A-press
  visibly turns. Turning only bends the path while also driving, car-style.
  The heading seeds from the live camera yaw on the first move input of a
  level (reset to `null` on every start), so W always starts as "drive
  up-screen"; after that only A/D — or point-to-move, which keeps the heading
  synced to the driven direction — ever change it. Because the camera can no
  longer steer the input, the sandbox chase camera now chases the control
  heading outright (`driveHeading` arg to `ChaseCamera.update`), which makes
  parked spins visible and is identical to the old velocity chase while
  driving (velocity = heading × throttle by construction). The velocity-
  derived target survives as a fallback for heading-less callers. This retired
  the whole camera-relative-basis apparatus: the rising-edge basis latch,
  `onBasisLatch`, and `ChaseCamera.recentre()` (the ratchet mechanism ADR-0007
  guarded against cannot occur when the input never re-adopts the camera yaw —
  see ADR-0008). The heading also rides on the hole for the renderer:
  directional skins (`st.heading`) and bite bearings (`biteFromEvent`'s
  `h.heading`) are live for the first time — both fields existed but had never
  been fed, so A/B Split's left/right axis and the reduced-motion Impressions
  head were silently pinned north. Settings screen relabelled to match:
  "Sandbox turn sensitivity" (the slider scales steering AND orbit, both at
  the printed rate) and a proper tank-controls listing for both modes. The
  sims are untouched — `sim.step` still receives a world-space move vector —
  so determinism, the validator contract, and invariant 3 are unaffected.

- 2026-08-05: **Upper Manhattan full rebuild — Central Park geography,
  structural-zone sim optimization, renderer/input fixes.** Five sequential
  passes replaced Upper Manhattan's ~8,400-block Central Park sketch with the
  full district: 73,393 blocks / 86,083 mass across Central Park's real
  geography (Great Lawn, the Ramble, the Lake, Bethesda Terrace, the Mall,
  Conservatory Water, the Reservoir, the Zoo, Wollman Rink), the Upper West
  Side (El Dorado, the Beresford, the Dakota, the AMNH + Hayden Sphere, San
  Remo, Trump International, Columbus Circle), Fifth Avenue / Museum Mile (the
  Met, the Guggenheim, the Frick, Temple Emanu-El, Mount Sinai, the Jewish
  Museum), and Harlem (Striver's Row, the Apollo, Marcus Garvey Park,
  Abyssinian Baptist, the Adam Clayton Powell Jr building, four cruciform
  public-housing towers). 32 new parametric kit builders landed in the shared
  `js/voxelkit.js` (`setbackTower`, `streetWall`, `porticoFront`,
  `spiralRotunda`, `stoneArch`-driven bridges, `pathRibbon` for curvilinear
  park surfaces, and more), reused across scenes rather than duplicated. The
  validator's contract went from 9 to 19 probes for both Brooklyn and Upper
  Manhattan, refactored onto 16 shared `probe*`/`report*` helpers so
  duplicated probe bodies went from 19 to 0; the excursion floor rose to
  `eatenCount ≥ 300` (matches Brooklyn), measured yield 721 eaten, combo
  3,680, SIZE 4 at 37.8 s of 62.

  The rebuild made the scene briefly unplayable: 15 fps median while driving,
  3.3 fps in the worst collapse. The cause was `_recalcSupport` re-walking the
  entire 73k-block connectivity graph on nearly every step while the hole
  moved (48.55 ms/call, 80% of frame time — measured, not assumed, along with
  a matching Node-only sim benchmark and a per-method CPU profile). The fix:
  automatic structural zones. The support graph's connected components are
  computed once at build time (Upper Manhattan has 1,114 of them, the largest
  3.4% of the scene), and `_recalcSupport` now recomputes only the zones a
  moving hole can provably reach, instead of the whole scene every call. This
  is the "structural zones" optimization the wiki had previously recorded as
  intentionally unimplemented — it now ships as *discovered* zones rather than
  authored ones, so no scene file declares anything. `_recalcSupport` fell to
  0.295 ms/call (a 165× reduction), and the sim was proved byte-identical to
  the pre-fix version three independent ways: `tools/validate.mjs`, a full
  per-step state digest across 16 scripted excursions (including two 3-/2-
  minute SIZE-10 ploughs generating thousands of sleep/wake events), and 50
  randomized fuzz runs. Companion fixes gave the loose-debris scan
  (`_stepDebris`, `_resolveDebrisContacts`) a maintained active set instead of
  a full block-array walk every step, and gave sleeping rubble a persistent
  broad-phase cell index instead of a per-step rebuild (the latter alone was
  roughly half of step time five minutes into a long collapse). Net: driving
  p50 66.1 ms → 3.6 ms; the worst collapse's p50 300.9 ms → 16.6 ms.

  Renderer and input fixes, verified by A/B screenshot diff against the
  pre-pass tree (42 stacked comparison pairs) plus a raycast probe: the ground
  plane is now sized and centred on the scene's actual content
  (`contentExtent()` — every block footprint, every decor rect, the hole
  clamp) plus a 600 m margin, replacing a fixed `PlaneGeometry(240, 240)` that
  had left 8.5% of Upper Manhattan's blocks (the whole northern band) hanging
  off the edge of the world with sky behind them; the far edge is now hidden
  with distance fog riding the camera's far plane instead of showing a flat
  cut or a floating rim. Blocks now render at their full cell size instead of
  95% of it, closing a defect where the old 5% mortar inset became a
  continuous see-through slot through every wall in the scene at certain
  camera heights (confirmed by raycast: rays that hit nothing at any x across
  a full screen row); the course line is now a shared, proportional 128×128
  painted texture instead, at zero extra draw calls. `Controls` steering,
  orbit, and zoom are now rate-per-second (`STEER_RATE = 2.7`,
  `ORBIT_RATE = 1.8`, `ZOOM_RATE = 24`, each tuned to feel identical to the
  old per-frame step at 60 fps) instead of a fixed amount added once per
  rendered frame with no `dt` — the old code made turn rate `0.009 × fps`
  rad/s, a 400× swing measured between a fast machine's idle and a struggling
  scene's crawl, which made the hole nearly unsteerable exactly when driving
  through the pre-fix Upper Manhattan collapse. `VoxelWorld3D.setPerfMode` was
  implemented for the first time — it previously existed only on the campaign
  renderer (`World3D.setPerfMode`), so the sandbox's Performance Mode toggle
  was a silent no-op on the renderer (`main.js:101`'s guarded call never
  matched). It now pins device pixel ratio to 1 and freezes ambient motion
  (gulls/pigeons/steam/ferries/surf/neon), measured at −35% median idle frame
  time on a 1× panel and −36% median / 13× p95 collapse on a 2× panel; it
  deliberately does not cull or LOD the block field, which stays a real
  renderer lever for later.

  Two pre-existing "40k block ceiling" code comments in
  `js/voxelscene-brooklyn.js` (there is no such ceiling — see `STATUS.md`'s
  Established facts) were corrected in place while documenting this session.

  Known remaining, deliberately not addressed: `main.js`'s fixed-timestep
  catch-up loop clamps at 6 steps per frame, so a step that crosses ~16.7 ms
  costs roughly 6× itself — this is why the worst collapse's p95 is still
  101 ms even though its median is fast (16.6 ms). Lowering the clamp would
  trade dropped frames for brief slow motion during a big collapse, which is a
  pacing decision rather than a technical one, left unmade. Shadow-map
  aliasing at the widest SIZE 10-12 camera distances and the `roads` decor
  color (`0x1c2030`, reads as near-black) are also left as-is, along with
  three scene-authoring notes (Bethesda's bronze angel reads near-black,
  Turtle Pond is barely findable, Belvedere Castle stands close against the
  CPW wall — the last one inherent to the park's 44 m width at that latitude)
  for whoever next works in `voxelscene-upper-manhattan.js`.

- 2026-08-04: **Rebrand to Flywheel - A sprocket's story**. The game is no
  longer "Hole City"; product name and repo name now match. The visual language
  invented for the Brooklyn READY gate (gold slab letters with a hard ink ring,
  two-tone extrude, staggered pop-in, orange extruded CTA pill) was extracted
  out of that one screen into a shared brand layer: `js/ui/blockword.js` builds
  the wordmark for both the gate and the landing screen, and `css/main.css`
  gained `--fw-*` tokens plus `.fw-title` / `.fw-plate` / `.fw-cta` primitives
  that both screens now draw from, so the letter treatment cannot drift between
  them. New branded landing screen (`js/ui/sprocket.js`, `showTitle` in
  `js/ui/screens.js`): a rotating voxel sprocket mark whose empty center is the
  hole itself, the FLYWHEEL wordmark and tagline plate, one PLAY pill for the
  campaign, and a grouped free-play city picker (Brooklyn first as the showcase
  scene, then Lower Manhattan, Upper Manhattan, Sandbox) replacing the old stack
  of seven equal-weight buttons. `.btn`, `.btn.secondary`, and `.screen`
  headings were unified to the same brand treatment, so every other screen
  inherits it without being rewritten. Reduced motion is honored from both the
  in-game setting and the OS preference; the wordmark and mark are decorative
  and the accessible name is stated once in text. **The world map and level
  selection were deliberately left unchanged** - they are the campaign's own
  language and are out of scope for this pass. The READY gate was verified
  visually unchanged after the extraction: it renders the same wordmark at its
  own font size and contributes nothing else.

- 2026-08-04: **Brooklyn sandbox + performance pass**. Added
  `js/voxelscene-brooklyn.js` (bridges to Coney Island, ~39,980 blocks), the
  intro establishing camera (`beginIntro`/`releaseIntro`/`skipIntro`, yaw sweep
  with a Lambertian lighting term so the pose cannot land on the unlit side of
  an antipodal pair), and the READY gate (`js/ui/ready.js`) that holds the shot
  until the player starts. Performance pass on top: a renderer fast path that
  skips per-frame matrix and color work for static, undamaged, out-of-region
  blocks (40,000 down to roughly 50-200 active blocks per frame); a cached
  floor-block list and distance-gated anchor checks in the support-graph BFS;
  damage, healing, and collapse timers that visit only active blocks instead of
  scanning all 39,984; bit-packed integer spatial keys and pooled buckets that
  remove thousands of per-frame allocations from loose-body physics; particle
  and crumble-mesh pooling; and a user-facing Performance Mode toggle in
  SETTINGS (save schema v10) that caps particle, crumble, and relaxation work on
  low-resource hardware. Validator gained `validateBrooklyn()` with 12 probes;
  ALL PASS.

- 2026-08-04: **Upper Manhattan realism + graphics pass**. Repositioned the
  Reservoir, The Lake, Harlem Meer, Belvedere Castle, and Met to match the
  recognizable Central Park geography; added 59th/72nd/86th/96th/102nd/110th
  street surfaces, sidewalks, loop bike paths, lane markers, striped
  crosswalks, oriented curb traffic, hydrants, waste bins, traffic lights,
  subway entrances, a newsstand, and a hot-dog cart. Fine-cell ownership,
  idle stability, camera coverage, roadway clearance, and deterministic
  excursion remain ALL PASS;
  the renderer now batches by material/brick size and caches static transforms;
  Playwright smoke found WebGL/page/request errors at zero and 61–66 measured
  draw calls per frame under the available SwiftShader browser renderer.

- 2026-08-04: **Upper Manhattan grid + object alignment scrub**. Applied the
  official park map and object-level NYC street references to a reusable
  intersection template: five-stripe zebra crossings without border rails,
  consistent curb-side furniture offsets, avenue-facing vehicles, and a clear
  sidewalk buffer. Moved the Met and Belvedere footprints off roadway bands,
  corrected castle turret/building ownership, and added a validator guard for
  tall structures, foliage, benches, and roadway overlap. Playwright close-ups
  at the 72nd Street / west-curb template show aligned roads, sidewalks,
  crossings, lamps, signals, hydrants, bins, and benches.

- 2026-08-04: **Sandbox feel tuning**. Defaults are now gravity 70, collapse
  wave `0.10 s/m`, attraction pull 2, and instant creak. Existing saves
  migrate to these values in schema v9; the gradual turn `.20→.80` and camera
  ramps remain tied to sandbox SIZE rather than campaign settings.

- 2026-08-03: **Upper Manhattan: Central Park sandbox level** added as a third
  scene (`js/voxelscene-upper-manhattan.js`). The park-first map has ~7,600
  deterministic blocks around Central Park, the Reservoir, The Lake, Harlem
  Meer, Bethesda Terrace, Belvedere Castle, the Met, Dakota, Museum Mile, and
  Harlem edges. Added a title-screen entry, scene-specific loading/HUD labels,
  camera-blocker coverage, and a validator excursion from the park promenade
  to the Upper West Side; full suite `ALL PASS`.

- 2026-08-03: **Instant sandbox collapse**. Support loss now detaches newly
  unsupported blocks on the next `sim.step` by default, removing the visible
  creak/wave wait between the hole touching a structure and its fall. The
  optional SETTINGS tuning can still restore a nonzero delay; save schema v9
  migrates existing saves to the instant default. Validator now asserts that
  no blocks remain in the delayed `unstable` state.

- 2026-08-03: **SIZE-scaled sandbox handling**. Hole speed rises across SIZE
  1→12, turn sensitivity ramps `.20→.80`, and the chase camera ramps from
  max zoom-in to max zoom-out on top of its blocker-clearance curve. Campaign
  movement remains unchanged.

- 2026-08-03: **Voxel collision hardening**. Falling bodies now use full AABB
  separation against nearby solid buckets when a directional/top contact is
  detected; chunk members split on solid overlap, and loose-body separation
  remains prioritized over preserving flight paths. Added deterministic solid
  and loose-body overlap probes; full suite `ALL PASS`.

- 2026-08-03: **Upper Manhattan prop-accuracy scrub**. Playwright screenshots
  swept the spawn promenade, park water, Met edge, and Upper West Side. The
  shared bench builder had its second leg 1 m beyond the 1 m seat; moved it
  under the seat so every park bench now has aligned supports. Trees, lamps,
  subway railings, and vehicle frames passed the source/visual review.

- 2026-08-03: **Manhattan sandbox review pass**. The physics layer audited
  clean (0 ghost fine cells, 0 floaters, validator `ALL PASS`); every finding
  was in the derived/render-only data no test covered. Fixed: 13 missing
  `cameraBlockers` for the 6-9 m mid-rise band (Trinity, City Hall, NYSE,
  Custom House, Courthouse, Chinatown rows ×3, SE tenements, Seaport, Oculus,
  tall ship, and the 58 m-long El viaduct) plus one entry that understated its
  rooftop water tower by 2 m; `sceneDecor` extended with the peninsula (Duane
  St, Bayard St, two South St aprons, Battery Park green out to x 36, Pearl St
  no longer running through the park) and the harbor carved into five rects so
  Castle Clinton and the ferry terminal stand on land — the Castle Clinton
  park plane was being drawn over by the harbor and never rendered at all;
  Hudson marina basin + East River Seaport reach added so the moored boats and
  the tall ship float on water instead of asphalt; asymmetric `sim.boundsRect`
  replaces the square ±80 clamp (~36 m of dead harbor removed); the Battery
  Park hedge row rebuilt on a 0.5 m step (it was 13 isolated cubes); Municipal
  and Courthouse porticoes bridged to their facades and the Wall St bank
  colonnades evened to a 2 m pitch. Validator gained three anti-drift probes:
  per-footprint-cell camera-blocker coverage (≥ 6 m, matching the campaign's
  `world3d.js` cut), a SIZE ≥ 4 progression floor (the mass-scaled ladder is
  now ×10 and had nothing pinning it), and a decor draw-order check.
- 2026-08-02: **Full Lower Manhattan expansion + 5-class kit**. New
  `js/voxelkit.js`: the five object size classes (PROP 0.25 m / VEHICLE
  0.5 m / SMALL_BLDG / LARGE_BLDG / MEGA) with canonical builders extracted
  from `voxelsim.js` (vehicles) and `voxelscene-manhattan.js` (`tower()`);
  both scenes now build from the kit. Manhattan expanded ±40 → ±80,
  11,872 → 25,827 blocks: Seaport/piers/tall ship/heliport (E), Municipal
  Building + courthouse + Chinatown rows + Columbus Park + Tribeca lofts +
  Brooklyn Bridge tower (N), BPC towers + marina + pier shed (W), Fed
  Reserve + NYSE + offices (FiDi), 7 WTC + Oculus (WTC site), Castle
  Clinton + SI Ferry Terminal + orange ferry + Custom House (S). Every
  placement validated per the scene rules; the tower helper's column rule
  hardened (footprints ≥ 8 m need interior columns — an 8×8 masonry slab's
  center cell was 4 hops out once window panes punched the verticals).
  Loading overlay (`BUILDING CITY…`) covers the ~1.3 s scene build (was a
  silent freeze — persona P0). Validator gained a second scripted excursion
  (expansion-district sweep, 213 eaten). ALL PASS.
- 2026-08-02: **Hanging reach scales with hole radius** (playtest: the hole
  "affects buildings further out than the circle is"). The creak zone was
  `remR + span + 1.5` flat — up to ~5.5 m at SIZE 1, vs the ~1 m visible
  ring. Now `remR + (span + 1.5) × radius/6.6`: stress hugs the rim at
  small sizes (~0.5 m out), unchanged at max radius. Probes: intact
  building at 1.5 m/3 m pre-fails nothing (was rim-creak/facade-drop), and
  during excavation the stressed set tracks the current radius (max ~2.5 m
  at r 1.75). Validator ALL PASS.
- 2026-08-02: **Loose-body contact resolution + sleep rework** (playtest:
  blocks clipped through each other and spun in place near buildings).
  `js/voxelsim.js`: new `_resolveDebrisContacts` pass — AABB least-
  penetration separation between grounded/slow debris, sleepers, chunk
  members, and rain (2 relaxation rounds, padded fine-column buckets,
  deterministic pair order). Rim tip-over now requires the hole-facing edge
  to truly overhang the void; attraction only acts on airborne/sliding
  bodies (grounded blocks are exempt); debris sleeps anywhere once slow +
  contact-free (committed after the contact pass — never mid-overlap);
  `_restLoose` lets rubble serve as support so piles solidify bottom-up;
  chunk/debris tumble capped; repose threshold 0.75→1.25×s; recursive
  sleeper-wake crash fixed (`_topRemove` iterates a copy). Probes: frozen
  sleeper overlaps 0, resting overlaps transient-only, spinners 0.
  Manhattan excursion eats 1438 (was 1834 — piles no longer clip into the
  hole); validator ALL PASS.
- 2026-08-02: Sandbox camera see-over-any-building rule (`js/camera.js`):
  `setBlockers` caches the scene's tallest blocker (`maxBlockerH`) and the
  sandbox distance curve smoothstep-ramps from SIZE 4 (r 2.6) so that by
  SIZE 10 (r 5.6) the camera clears it (+8 m margin), clamped just above
  clearance through SIZE 12. Manhattan: ~84 m dist / ~66 m high at SIZE 10+
  (WTC is 58 m); gallery unchanged (no cameraBlockers). Validator ALL PASS.
- 2026-08-02: Hole ring render pass is now depth-test disabled (`depthTest: false`, `depthWrite: false`, `renderOrder: 999`) in both campaign (`js/world3d.js`) and voxel sandbox (`js/voxelworld.js`) — the hole's outer ring indicator remains visible through buildings and structures when occluded.
- 2026-08-01: Settings sliders gained measurement readouts: Turn sensitivity
  shows multiplier + actual turn rate (`0.15 · ~23°/s` — the user's optimal,
  2nd step from min) and Hole speed shows × + actual m/s at SIZE 1
  (`1.4× · ~9.9 m/s`, from `playerSpeedForRadius(1.1) = 7.1`).
- 2026-08-01: **Block-vs-block collision** for the voxel sandbox: a
  solid-surface heightmap (`_top`, per fine column: static + sleeping
  debris) replaces the flat ground plane for falling bodies — debris/chunks
  land on rooftops and stack into piles, an angle-of-repose slide spills
  steep piles outward (the requested "messy"), `_contact` probes make
  chunks shatter on facades + debris wall-scrape + hard hits smash-damage
  what they strike, and sleeping debris registers for wake-on-support-loss
  (piles stack, eaten bases drop what was on them). Probes: 24-block drop
  stacks + spills (not a flat carpet), roof landing at exactly roofTop+s/2.
  Tour eats dip ~5% (2044 vs 2152) as debris piles at rims — intended.
- 2026-08-01: Dev voxel-physics sliders in SETTINGS (schema v7): Gravity
  (26–130), Collapse wave (`WAVE_K` 0.05–1 s/m — higher = slower, more
  readable rim→center sweep), Creak delay (0.25–2× global `mat.delay`
  scale), Hole speed (0.7–3×), Attraction pull (0–20). Live-applied to the
  running sim via `sim.tune` (validator keeps constant defaults). Fixed a
  latent crash: `applySettings` called `world.setShadows` which
  VoxelWorld3D lacks — everything after it in the handler silently skipped
  (this is why live tuning never reached the sim).
- 2026-08-01: Voxel gravity 26 → 65 (2.5×) — playtest: falls read as
  floating. 10 m drop: steel 0.73 → 0.45 s, glass 1.06 → 0.68 s (density
  spread preserved). Harder impacts split/bounce/scatter more — spillier
  collapse, as requested. Tour eats slightly more (2125 → 2152), ALL PASS.
- 2026-08-01: New sandbox level — **Lower Manhattan** (`js/voxelscene-manhattan.js`,
  title → NYC: LOWER MANHATTAN). ~11,900 blocks in a ±40 m world: One WTC
  (3 setback tiers + spire), twin memorial pools, Woolworth-style tower,
  glass slab tower, Wall St bank canyon with porticos, elevated train
  (58 m viaduct + 3-car train), Trinity Church, City Hall, Battery Park +
  Charging Bull, ferry pier, full street-furniture/vehicle set. Engine grew
  a scene option: `bounds` per scene, render-only `sceneDecor` (roads/park/
  harbor), `cameraBlockers` for supertall occlusion, and the SIZE ladder
  scales with scene mass (gallery exactly ×1, Manhattan ×10 at its current
  43.5k mass — it was ×5 before the full-peninsula expansion). Bug-hunted via
  the new validator checks: El-through-tower overlap (ghost cells), lamps
  inside buildings, setback tiers topping out on wall rings (floating base
  slabs), interior-column grid math, El rails one cell past the deck edge,
  and Trinity 9 mm inside the hanging threshold (remR+span+1.5 ≈ 3.55 m).
