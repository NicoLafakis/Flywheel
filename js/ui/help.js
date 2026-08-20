// js/ui/help.js — Comprehensive Help, Interactive Walkthrough, FAQ, and Tips 'n Tricks
// Pure data models + rich DOM screen renderer. Follows strict ES module architecture.

import { POWERUP_TYPES, POWERUP_SPECS } from '../powerups.js';
import { CITY_CATALOG, getSortedCityCatalog } from '../citycatalog.js';
import { UPGRADES, SHOP_CATEGORIES } from '../upgrades.js';
import { BOARDS_ENABLED } from '../board/config.js';

export const HELP_TABS = Object.freeze([
  { id: 'walkthrough', name: 'WALKTHROUGH', icon: '📖', title: 'Complete Game Walkthrough & Guides' },
  { id: 'faq', name: 'FAQ', icon: '❓', title: 'Frequently Asked Questions' },
  { id: 'tips', name: "TIPS 'N TRICKS", icon: '💡', title: 'Pro Strategies & Mastery Tactics' },
]);

export const WALKTHROUGH_MODULES = Object.freeze([
  {
    id: 'core-mechanics',
    title: 'Core Mechanics & The 1.35× Tier Ladder',
    icon: '🌟',
    badge: 'FUNDAMENTALS',
    summary: 'Master the physics of black hole growth, mass thresholds, snack rings, and structural collapse waves.',
    content: [
      {
        heading: 'The Hunger of the Sprocket',
        text: 'In Flywheel, you control an insatiable black hole aperture traversing handcrafted voxel metropolises. Your primary objective is to ingest everything in the city — from tiny traffic cones to gargantuan skyscrapers — growing in diameter with every voxel consumed.',
      },
      {
        heading: 'The 1.35× Tier Ladder Rule (Strict Invariant)',
        text: 'You cannot swallow objects larger than your current aperture. Edibility is strictly governed by the 1.35× size ladder: an object is edible if and only if your hole radius is greater than the object tier radius (r_player > r_tier). Attempting to swallow an oversized object will cause you to bump against it harmlessly.',
      },
      {
        heading: 'The Snack Ring (Early Game Progression)',
        text: 'Every single-player city is designed with a perimeter "snack ring" — a concentrated scatter of small props (traffic cones, fire hydrants, trash bins, benches, mailboxes, and parking meters). Always begin every run by sweeping the snack ring to rapidly reach Size 2 and 3 before tackling larger buildings.',
      },
      {
        heading: 'Mass vs Score',
        text: 'Mass represents the physical voxel volume absorbed by your hole, driving your size expansion. Score is calculated based on total mass eaten, multiplied by your active combo chain, coin bonuses, and time efficiency.',
      },
      {
        heading: 'Physics Collapse Waves & Creak Delays',
        text: 'Buildings are not static blocks — they are bound by realistic structural physics. Ingesting ground-level pillars, corner supports, and base foundations destabilizes the structure. A collapse wave travels upward through the building, causing upper floors to break apart and rain down as digestible rubble piles.',
      },
    ],
  },
  {
    id: 'controls',
    title: 'Controls & Camera Schemes',
    icon: '🎮',
    badge: 'INPUT & CAMERA',
    summary: 'Full control keybinds for desktop keyboards and dual-zone touch controls for mobile devices.',
    content: [
      {
        heading: 'Desktop Keyboard Controls',
        list: [
          'W / Up Arrow: Drive forward',
          'S / Down Arrow: Reverse / brake',
          'A / Left Arrow: Turn left',
          'D / Right Arrow: Turn right',
          'Q / E: Orbit camera clockwise / counter-clockwise',
          'R / F: Zoom camera in / out',
          'Esc: Pause game menu',
        ],
      },
      {
        heading: 'Mobile & Touchscreen Dual-Zone Controls',
        list: [
          'Left Screen Half: Drag anywhere to steer your black hole directly toward your finger.',
          'Right Screen Half: Drag to orbit and look around the city from any angle.',
          'Pinch with Two Fingers: Dynamic zoom in and out.',
          'Optional "Tap to Move" Mode: Switchable in Settings to replace the virtual joystick with direct point-and-click movement.',
        ],
      },
      {
        heading: 'Camera Positioning & Sensitivity',
        text: 'You can customize camera distance and steering sensitivity in the Settings menu. The camera automatically elevates and zooms out smoothly as your hole expands to colossal sizes.',
      },
    ],
  },
  {
    id: 'menus-screens',
    title: 'Menus & UI Navigation Guide',
    icon: '🧭',
    badge: 'INTERFACE',
    summary: 'Walkthrough of every menu, screen, and feature accessible across the entire game.',
    content: [
      {
        heading: 'Title Landing Screen (The Main Hub)',
        text: 'The title screen is the central command center for Flywheel. It provides one-click access to all primary modes and systems: PLAY (Single-Player Sandbox Carousel), MULTIPLAYER (6-Player synchronized arena), Login / Profile button, Highest Score card, Skin Progress Meter (interactive progress bar linking to Shop), 3-Minute Challenges & Secret 90s Challenge shortcuts, RECORDS (Leaderboards), SHOP (Customization), SETTINGS, and HELP & FAQ.',
      },
      {
        heading: 'City Selection & Sandbox Shelf',
        text: 'Displays featured metropolitan scenes ordered strictly from smallest to largest size. Each city card showcases total block count, difficulty tier, stage badge, coin bounties, best score, fastest clear time, and full clear percentage. Navigation arrows (or touch swipes) allow smooth browsing.',
      },
      {
        heading: 'Pause Menu',
        text: 'Accessible mid-run by pressing Esc or clicking the top-right Pause button. Provides RESUME, SETTINGS, HELP & GUIDE, and safety-armed RESTART and CITIES buttons (requiring two clicks to prevent accidental progress loss).',
      },
      {
        heading: 'Results Screen',
        text: 'Presented upon completing or timing out of a match. Breaks down total mass devoured, elapsed time, fastest clear record badge, stars awarded (★☆☆ to ★★★), best combo chain, and coins earned, with instant options to Continue, Change Map, or return to the Main Menu.',
      },
      {
        heading: 'Records & Global Leaderboard Screen',
        text: 'View weekly and all-time leaderboards for all cities, inspect personal archives, check current weekly season countdowns, and manage your player profile and device key tokens.',
      },
    ],
  },
  {
    id: 'cities-progression',
    title: 'Global Campaign: 29 Metropolises & 7 Regional Acts',
    icon: '🗺️',
    badge: '29 CITIES · 7 ACTS',
    summary: 'Explore the 29-city worldwide odyssey across 7 regional Acts from The Lab to Cambridge UNBOUND.',
    content: [
      {
        heading: 'The 29-Metropolis World Tour (7 Regional Acts)',
        list: [
          'PROLOGUE · Calibration: THE LAB (Proving Ground · 15,767 blocks) — starter ramps and training grid.',
          'ACT I · The Pacific Awakening: SYDNEY HARBOUR (14,120 blocks), AUCKLAND (16,000 blocks), SINGAPORE MARINA BAY (22,000 blocks).',
          'ACT II · Asian Megacities: HONG KONG (28,500 blocks), SEOUL (32,000 blocks), TOKYO SHINJUKU (84,122 blocks), BEIJING (38,000 blocks), BANGKOK (30,000 blocks), MUMBAI (34,500 blocks).',
          'ACT III · Desert & Antiquity: DUBAI (36,000 blocks), CAIRO & GIZA (32,500 blocks), ATHENS (26,000 blocks), ROME (35,000 blocks).',
          'ACT IV · European Grandeur: PARIS (42,000 blocks), LONDON (45,000 blocks), AMSTERDAM (28,000 blocks), BERLIN (36,500 blocks).',
          'ACT V · The Americas: RIO DE JANEIRO (38,500 blocks), BUENOS AIRES (34,000 blocks), MEXICO CITY (37,000 blocks), SAN FRANCISCO (44,000 blocks), CHICAGO LOOP (44,578 blocks), TORONTO (40,000 blocks).',
          'ACT VI · New York Trilogy: LOWER MANHATTAN (25,875 blocks), BROOKLYN (39,984 blocks), UPPER MANHATTAN (73,393 blocks).',
          'ACT VII · Tech Corridor & Grand Finale: BOSTON SEAPORT (82,894 blocks), CAMBRIDGE (HubSpot HQ · 72,943 blocks · "SWALLOW THE SPROCKET!").',
        ],
      },
      {
        heading: 'City Progression Gate Rule',
        text: 'To unlock each subsequent metropolis in sequence, you must achieve a 100% full clear on the preceding playable city within the 5-minute (300s) master time limit. Once unlocked, a city remains permanently available for free play and challenges.',
      },
    ],
  },
  {
    id: 'game-modes',
    title: 'Game Modes & Timed Challenges',
    icon: '⏱️',
    badge: 'GAME MODES',
    summary: 'Overview of Sandbox Free Play, 3-Minute Challenges, Secret 90s Runs, and Ranked Competitions.',
    content: [
      {
        heading: '1. Sandbox Free Play Mode (300s / 5 Minutes)',
        text: 'The standard single-player experience. You have 300 seconds to consume as much of the metropolis as possible, collect scattered gold coins, trigger structural collapses, and achieve a 100% full clear.',
      },
      {
        heading: '2. 3-Minute City Challenge (2× Coin Multiplier)',
        text: 'A high-intensity time attack mode giving you exactly 180 seconds (3 minutes) to conquer the city. Successfully clearing the city in this window awards double (2×) coins!',
      },
      {
        heading: '3. Secret 90s Challenge (Apex Mastery)',
        text: 'Unlocked only after conquering the 3-minute challenge across ALL 8 metropolitan cities in the catalog! Features an intense 90-second sprint for ultimate speedrunners.',
      },
      {
        heading: '4. Ranked RUN Mode (90s Replay-Verified)',
        text: 'Official competitive ranked mode. Every input is recorded deterministically into an input buffer and verified server-side before scores appear on global leaderboards.',
      },
    ],
  },
  {
    id: 'hud-interface',
    title: 'In-Game HUD & Tactical Readouts',
    icon: '🖥️',
    badge: 'HUD & TELEMETRY',
    summary: 'Detailed guide to all in-game HUD indicators, countdowns, radar, and telemetry overlays.',
    content: [
      {
        heading: 'Left HUD Stack',
        list: [
          'Level Banner: Displays active city name and difficulty tier.',
          'Mass Collector Bar: Shows progress toward the next size tier.',
          'Mass Label: Current mass count and devour threshold.',
          'Score Plate: Live score tally and coin counter.',
        ],
      },
      {
        heading: 'Top-Center Level Clock',
        text: 'The primary focal constraint. Displays the countdown timer. Shimmers in standard white, shifts to gold warning at 60s, and pulses in urgent electric red with an audible heartbeat warning at 30s remaining.',
      },
      {
        heading: 'Blocks Left Pill',
        text: 'Appears automatically when 100 or fewer blocks remain, or when 30 seconds or less remain on the clock, displaying the exact remaining block count to assist in completing 100% clears.',
      },
      {
        heading: 'Right HUD Stack & Radial Combo Meter',
        list: [
          'Mute & Pause Buttons: Quick sound and pause controls.',
          'Radial Combo Meter: Dedicated circular dial with an arc that drains over the 1.5s combo window.',
          'Chain & Multiplier Readout: Displays your consecutive chain count and current honest score multiplier (up to 8×).',
          'Active Power-Up Badges: Displays icons and countdown bars for up to 3 active buffs simultaneously.',
        ],
      },
      {
        heading: 'Minimap & Screen Overlays',
        list: [
          'Minimap Radar: Real-time top-down overview tracking your position, coins, power-ups, and multiplayer rivals.',
          'Big Pop Toasts: Celebratory anime banner when advancing to a new size tier.',
          'Hype Consumption Bands: Full-width animated banners triggered on landmark and skyscraper swallows.',
        ],
      },
    ],
  },
  {
    id: 'powerups-overdrives',
    title: 'Power-Ups & Overdrive Transformations',
    icon: '⚡',
    badge: 'POWER-UPS',
    summary: 'Complete breakdown of all 6 power-ups, active buffs, durations, multipliers, and screen overdrives.',
    content: [
      {
        heading: '1. Gravitational Singularity (Vortex)',
        icon: '🌀',
        text: 'Emits a massive high-vacuum gravity core with 34.0 pull force across a 20m radius for 15 seconds. Magnetically drags loose rubble, props, and edible structures straight into your maw.',
      },
      {
        heading: '2. Hyper Velocity Overdrive (Speed)',
        icon: '💨',
        text: 'Grants +70% movement speed (1.7× speed multiplier) with instantaneous acceleration, razor-sharp steering torque, and lightning screen tunnel overlays for 15 seconds.',
      },
      {
        heading: '3. Colossal Titan Surge (Titan)',
        icon: '🔴',
        text: 'Instant mass surge granting a 10× radius multiplier and +7 tier bonus for 15 seconds. Temporarily enlarges your mouth to maximum scale to devour giant skyscrapers instantly.',
      },
      {
        heading: '4. Tectonic Fault Rupture (Quake)',
        icon: '💥',
        text: 'Rips an instantaneous 35m seismic rupture fault line across the city, cleaving building foundations and toppling entire skyscraper rows into digestible debris.',
      },
      {
        heading: '5. Resonance Chain Frenzy (Frenzy)',
        icon: '🟣',
        text: 'Freezes your combo decay timer and activates uncapped multiplier scaling with a 2.0× score multiplier bonus for 15 seconds.',
      },
      {
        heading: '6. Temporal Stasis Field (Chrono)',
        icon: '❄️',
        text: 'Freezes the match clock, adds +15 seconds of bonus time to the countdown, and locks your combo meter in stasis.',
      },
      {
        heading: 'Power-Up Invariants & Buff Stacking',
        text: 'You can hold up to 3 different power-up buffs active simultaneously! Power-ups wander the city dynamically and bounce off map boundaries until collected. Picking up a duplicate power-up refreshes and extends its duration.',
      },
    ],
  },
  {
    id: 'combos-scoring',
    title: 'Combos & Score Multipliers',
    icon: '🔥',
    badge: 'SCORING',
    summary: 'How to build high combo chains, maintain the 1.5s combo window, and maximize coin earnings.',
    content: [
      {
        heading: 'The 1.5-Second Combo Window',
        text: 'Consuming any edible object starts or refreshes the 1.5-second combo timer. The circular arc around the radial combo meter shows the remaining time. Swallow another object before the arc empties to extend your chain.',
      },
      {
        heading: 'Honest Multiplier Progression',
        text: 'The large number in the combo meter is your Chain Count (number of consecutive objects eaten). The multiplier scales honestly: x1.0 -> x1.5 -> x2.0 -> x3.0 -> x4.0 -> x5.0 -> x6.0 -> x7.0 -> x8.0 (MAX).',
      },
      {
        heading: 'Combo Heat Ramp & Visual Bursts',
        text: 'The combo meter transitions through 8 distinct heat tiers: White -> Cream -> Gold -> Orange -> Hot Orange -> Electric Rose -> Neon Violet -> Electric Turquoise Aura. Reaching major tiers triggers dynamic anime combo burst overlays.',
      },
      {
        heading: 'Coin Multipliers from Combos',
        text: 'Your highest combo chain achieved during a run directly multiplies the coin rewards awarded on the Results Screen, making combo mastery the fastest way to accumulate wealth.',
      },
    ],
  },
  {
    id: 'shop-upgrades',
    title: 'Shop, Skins & Permanent Stat Upgrades',
    icon: '🛒',
    badge: 'ECONOMY',
    summary: 'Cosmetics catalog, starter skins, and the 4 permanent character stat upgrade tracks.',
    content: [
      {
        heading: 'The 5 Shop Categories',
        list: [
          '🕳️ Skins: Aesthetic black hole rims, including 7 free basic colorways (Black, Crimson, Azure, Emerald, Amber, Violet, Gold) plus unlockable neon and holographic rings.',
          '👾 Creatures: Living maws featuring reactive animated jaws, sharp teeth, and expressive eyes.',
          '🤝 Partners: Official partner agency tribute skins with custom emblems and badges.',
          '🧭 Indicators: Directional movement chevrons and pointers indicating forward heading.',
          '⚡ Upgrades: Permanent stat upgrades providing persistent character enhancements.',
        ],
      },
      {
        heading: 'The 4 Permanent Stat Upgrade Tracks',
        list: [
          '💨 Thruster Overdrive (Speed): Increases hole movement and steering speed (+5% per rank, up to +100% at Rank 20).',
          '🌀 Gravitational Core (Vortex): Amplifies magnetic vacuum attraction pull on nearby rubble (+5% per rank, up to +100% at Rank 20).',
          '🟩 Mass Assimilator (Growth): Boosts mass gained and score yield per block eaten (+5% per rank, up to +100% at Rank 20).',
          '⏳ Overclock Battery (Duration): Extends the active duration of all collected map power-up buffs (+5% per rank, up to +100% at Rank 20).',
        ],
      },
      {
        heading: 'Upgrade Economy',
        text: 'Each upgrade track features 20 escalating ranks costing from 100 to 3,400 coins per rank. Upgrades apply permanently to all single-player sandboxes, challenges, and multiplayer arenas.',
      },
    ],
  },
  {
    id: 'multiplayer-arena',
    title: '6-Player Synchronized Multiplayer Arena',
    icon: '⚔️',
    badge: 'MULTIPLAYER',
    summary: 'Complete guide to host/join lobbies, room codes, PvP swallowing rules, respawns, and podium rankings.',
    content: [
      {
        heading: 'Hosting & Joining Matches',
        text: 'Click MULTIPLAYER on the main title screen to open the multiplayer hub. You can Host a new room or Join an existing room using a 5-letter Room Code. You can also share direct invite links (e.g., https://flywheelgame.com/?room=ABCDE) with up to 5 friends.',
      },
      {
        heading: 'Pre-Game Lobby & Ephemeral Chat',
        text: 'The lobby displays all connected player slots, assigned colors, equipped skins, and Ready toggles. Players can chat using in-memory ephemeral chat (zero server storage). Matches automatically begin with a 3-second countdown when all players are ready or when the 6-player room is full.',
      },
      {
        heading: 'PvP Swallowing Mechanics',
        text: 'Players compete in the same synchronized metropolis in real time. If your hole radius is at least 5% larger than a rival (r_eater > r_victim * 1.05), moving over them will swallow them whole, awarding you their mass and boosting your score!',
      },
      {
        heading: '10-Second Perimeter Respawn Penalty',
        text: 'Swallowed players are eliminated temporarily and placed into a 10-second respawn timeout before re-entering the match on the outer city perimeter.',
      },
      {
        heading: 'Territory Tracking & Victory Podium',
        text: 'Live matches feature a real-time tug-of-war bar, colored player craters, off-screen rival tracking chevrons, and milestone callouts. At match end, players are ranked on a 3D victory podium with individual coin payouts.',
      },
    ],
  },
  {
    id: 'special-events',
    title: 'Special City Disasters & Environmental Features',
    icon: '🏙️',
    badge: 'DISASTERS & SECRETS',
    summary: 'Learn about the Chicago Loop train derailment, Cambridge anisotropic architecture, and landmark events.',
    content: [
      {
        heading: 'Chicago Loop Runaway CTA Train Derailment',
        text: 'In the Chicago Loop map, an elevated CTA rapid transit train continuously navigates the elevated track network. Consuming track support pillars causes the train to derail in real-time, sending passenger cars crashing down into digestible steel chunks worth massive mass!',
      },
      {
        heading: 'Cambridge Anisotropic Architecture',
        text: 'The Cambridge map features complex brick labs and modern tech campuses built with specialized structural bonds. Approach buildings from multiple angles to find weak structural joints and trigger cascading collapses.',
      },
      {
        heading: 'Landmark Eviction Physics',
        text: 'Colossal landmarks (Willis Tower, suspension bridges, convention centers) cannot be swallowed until you reach the highest size tiers. Once your aperture is large enough, swallow the foundational anchors to trigger massive seismic collapse sequences.',
      },
    ],
  },
]);

export const FAQ_ITEMS = Object.freeze([
  {
    q: "Why can't I swallow skyscrapers or cars at the very beginning?",
    a: "Flywheel enforces a strict 1.35× Tier Ladder rule: your black hole radius must be strictly greater than the object's tier radius (r_player > r_tier). Start by eating the small props in the outer snack ring (cones, trash cans, hydrants) to grow into larger tiers.",
    category: 'Gameplay',
    tags: ['ladder', 'tiers', 'growth', 'size', 'snack ring'],
  },
  {
    q: 'How do I unlock new cities and stages?',
    a: 'Each city in the catalog unlocks when you achieve a 100% full clear on the previous city within the 5-minute (300s) time limit. Once unlocked, the city is permanently available.',
    category: 'Progression',
    tags: ['unlock', 'cities', 'progression', 'stages'],
  },
  {
    q: 'What is the 3-Minute City Challenge and how do I unlock the Secret 90s Challenge?',
    a: 'The 3-Minute Challenge tasks you with clearing a city in under 180s for a 2× Coin Multiplier. Conquering the 3-minute challenge on all 8 cities unlocks the ultimate Secret 90s Sprint Challenge!',
    category: 'Progression',
    tags: ['challenge', '3-minute', 'secret 90s', 'coins'],
  },
  {
    q: 'How does multiplayer work and can I invite my friends?',
    a: 'Click MULTIPLAYER on the main menu, choose Host Room to get a 5-letter Room Code, or share the direct invite link (?room=CODE). Up to 6 players can join a synchronized arena match.',
    category: 'Multiplayer',
    tags: ['multiplayer', 'room code', 'invite', 'friends', 'lobby'],
  },
  {
    q: 'Can other players swallow me in multiplayer?',
    a: 'Yes! If another player is at least 5% larger than you (r_eater > r_victim × 1.05), they can swallow you. You will respawn on the city perimeter after a 10-second timeout.',
    category: 'Multiplayer',
    tags: ['pvp', 'swallow', 'respawn', 'elimination'],
  },
  {
    q: 'Do permanent stat upgrades work in multiplayer matches?',
    a: 'Yes! All purchased stat upgrades (Speed, Vortex, Growth, Duration) enhance your black hole across single-player sandboxes, timed challenges, and multiplayer arenas.',
    category: 'Shop & Upgrades',
    tags: ['upgrades', 'stats', 'multiplayer', 'speed', 'vortex'],
  },
  {
    q: 'How is my score calculated?',
    a: 'Score is determined by total block mass consumed, scaled dynamically by your active combo chain multiplier, coin pickups collected, and time remaining upon level completion.',
    category: 'Scoring',
    tags: ['score', 'combo', 'points', 'leaderboard'],
  },
  {
    q: 'What is the fastest way to earn coins?',
    a: '1) Maintain high combo chains (coins scale with best chain). 2) Complete 3-Minute Challenges for 2× coin payouts. 3) Play higher-tier cities (Tokyo and Boston have higher coin counts and values). 4) Collect loose gold coins scattered across streets.',
    category: 'Shop & Upgrades',
    tags: ['coins', 'money', 'grind', 'shop'],
  },
  {
    q: 'Can I play Flywheel offline without an internet connection?',
    a: 'Yes! Flywheel is fully playable offline. All single-player cities, saves, and personal best records are saved locally in your browser. Ranked scores and account progress (coins, skins, stars) queue locally and sync when an internet connection is restored.',
    category: 'Technical',
    tags: ['offline', 'internet', 'saves', 'storage'],
  },
  {
    q: 'How do touch controls work on mobile phones and tablets?',
    a: 'Drag the left half of the glass to steer your hole; drag the right half to orbit the camera; pinch two fingers to zoom. You can also enable "Tap to Move" in Settings for single-finger point-and-click pathing.',
    category: 'Controls',
    tags: ['mobile', 'touch', 'touchscreen', 'joystick', 'tap to move'],
  },
  {
    q: 'How do power-ups work and can I stack multiple power-ups at once?',
    a: 'Power-ups wander the city and grant powerful buffs (Vortex, Speed, Titan, Quake, Frenzy, Chrono). You can have up to 3 distinct power-up buffs active simultaneously! Duplicate pickups refresh and extend duration.',
    category: 'Gameplay',
    tags: ['powerups', 'buffs', 'stacking', 'vortex', 'speed', 'titan'],
  },
  {
    q: 'How do I submit scores to the official global leaderboards?',
    a: 'Sign in with a player name on the title screen, then launch a ranked RUN from the records screen. Runs record deterministic input traces verified by the server before posting.',
    category: 'Scoring',
    tags: ['records', 'leaderboard', 'ranked', 'profile', 'anti-cheat'],
  },
  {
    q: 'Does my progress follow me to another device?',
    a: 'Yes, once you sign in. Your coins, skins, stars and upgrades are saved to your account, so sign in on another phone, tablet or computer and they are there. The dot beside your name on the title screen shows SYNCED when everything is saved, and OFFLINE — WILL SYNC when it is waiting for a connection.',
    category: 'Technical',
    tags: ['sync', 'account', 'progress', 'devices', 'coins', 'skins', 'stars', 'cloud'],
  },
  {
    q: 'What happens to my progress if I sign out, or sign in on another device?',
    a: 'Signing out keeps everything on this device and hands it a guest name; your account keeps its own copy. If you sign in somewhere else, this device shows SIGNED OUT ELSEWHERE until you sign in again. Signing in on a device that already has progress adds it to your account; nothing is ever taken away.',
    category: 'Technical',
    tags: ['sign out', 'sign in', 'account', 'progress', 'devices', 'merge'],
  },
  {
    q: 'How can I improve frame rate and performance on low-spec devices?',
    a: 'Go to Settings and switch "Graphics detail" to LOW, disable "Pretty shadows", and enable "Smoother play" (perfMode). This optimizes resolution scaling, particle budgets, and debris calculations.',
    category: 'Technical',
    tags: ['performance', 'fps', 'lag', 'graphics', 'low spec'],
  },
  {
    q: 'How do I reset game settings or city physics back to default?',
    a: 'Open Settings, scroll down to "ADVANCED — CITY FEEL", and click the "RESET TO DEFAULTS" button to restore factory physics (gravity, collapse wave, speed, and attraction).',
    category: 'Technical',
    tags: ['reset', 'settings', 'defaults', 'physics'],
  },
]);

export const TIPS_ITEMS = Object.freeze([
  {
    title: 'The Perimeter Snack Ring Spiral',
    badge: 'OPENING STRATEGY',
    icon: '🌀',
    desc: 'Never drive straight down the main avenue at Size 1. Always spiral along the outermost sidewalk perimeter to sweep hydrants, trash cans, and parking meters. This guarantees reaching Size 2 in under 10 seconds without bumping into cars.',
  },
  {
    title: 'Combo Chain Bridging',
    badge: 'SCORING MASTERY',
    icon: '⚡',
    desc: 'When moving between two dense building clusters, do not eat every small prop along the road at once. Leave a trail of 2-3 small props behind you to eat while transitioning, keeping your 1.5s combo meter alive.',
  },
  {
    title: 'Skyscraper Foundation Cleaving',
    badge: 'DESTRUCTION TACTICS',
    icon: '💥',
    desc: 'To topple massive skyscrapers, do not orbit the upper walls. Drive directly under the structural corner columns at ground level. Snapping the base triggers an instant collapse wave that brings the entire tower down into your hole.',
  },
  {
    title: 'The Supersonic Vacuum Buff Stack',
    badge: 'POWER-UP SYNERGIES',
    icon: '🧲',
    desc: 'Combining Hyper Velocity Overdrive (Speed) with Gravitational Singularity (Vortex) creates a supersonic vacuum sweeper. You can race down crowded streets at full speed while the vortex pulls all surrounding rubble into your maw automatically.',
  },
  {
    title: 'Chicago CTA Train Derailment Farming',
    badge: 'CITY-SPECIFIC PRO TIP',
    icon: '🚂',
    desc: 'In Chicago Loop, position yourself under the elevated rail bends and swallow the support pillars right before the train arrives. The derailing carriages drop tons of high-density steel blocks for an instant size leap.',
  },
  {
    title: 'Multiplayer Canyon Ambush',
    badge: 'PVP TACTICS',
    icon: '⚔️',
    desc: 'In multiplayer, hide behind skyscraper corners and monitor the minimap. When an opponent approaches, cut diagonally across their trajectory once your radius is 5% larger than theirs to catch them in a blind spot.',
  },
  {
    title: 'Optimal Upgrade Investment Priority',
    badge: 'ECONOMY & UPGRADES',
    icon: '🪙',
    desc: 'Invest your early coins into Thruster Overdrive (Speed) and Gravitational Core (Vortex). Increasing speed and pull radius drastically cuts down early snack ring collection time, speeding up every subsequent run.',
  },
  {
    title: 'Chrono Stasis + Frenzy Super Combo',
    badge: 'POWER-UP MASTERY',
    icon: '❄️',
    desc: 'When you spot both Temporal Stasis Field (Chrono) and Resonance Chain Frenzy, grab Chrono first to freeze the countdown clock, then Frenzy to lock the combo multiplier. You get 15+ seconds of risk-free double-multiplier feeding!',
  },
  {
    title: 'Camera Orbiting on Complex Bridges',
    badge: 'NAVIGATION',
    icon: '🧭',
    desc: 'When navigating Brooklyn waterfront piers or Boston bridges, press Q/E (or swipe the right screen) to look perpendicular to your travel vector. This exposes hidden snack clusters tucked behind warehouse walls.',
  },
  {
    title: 'Endgame Blocks Left Radar Sweeping',
    badge: '100% CLEAR EFFICIENCY',
    icon: '🎯',
    desc: 'When the "Blocks Left" pill appears (<100 blocks remaining), zoom your camera out (F key or pinch) and sweep the map edges. Look for stray lampposts or rubble chunks knocked into riverbeds or park borders.',
  },
]);

/**
 * Filter help content by text query and tab.
 * Pure deterministic function safe for tests & UI.
 */
export function filterHelpContent(query = '', tab = 'walkthrough') {
  const q = (query || '').trim().toLowerCase();

  if (tab === 'walkthrough') {
    if (!q) return WALKTHROUGH_MODULES;
    return WALKTHROUGH_MODULES.filter((m) => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchBadge = m.badge.toLowerCase().includes(q);
      const matchSummary = m.summary.toLowerCase().includes(q);
      const matchContent = m.content.some((c) =>
        (c.heading && c.heading.toLowerCase().includes(q)) ||
        (c.text && c.text.toLowerCase().includes(q)) ||
        (c.list && c.list.some((li) => li.toLowerCase().includes(q)))
      );
      return matchTitle || matchBadge || matchSummary || matchContent;
    });
  }

  if (tab === 'faq') {
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => {
      const matchQ = item.q.toLowerCase().includes(q);
      const matchA = item.a.toLowerCase().includes(q);
      const matchCat = item.category.toLowerCase().includes(q);
      const matchTags = item.tags && item.tags.some((t) => t.toLowerCase().includes(q));
      return matchQ || matchA || matchCat || matchTags;
    });
  }

  if (tab === 'tips') {
    if (!q) return TIPS_ITEMS;
    return TIPS_ITEMS.filter((tip) => {
      const matchTitle = tip.title.toLowerCase().includes(q);
      const matchBadge = tip.badge.toLowerCase().includes(q);
      const matchDesc = tip.desc.toLowerCase().includes(q);
      return matchTitle || matchBadge || matchDesc;
    });
  }

  if (tab === 'all') {
    return {
      walkthrough: filterHelpContent(q, 'walkthrough'),
      faq: filterHelpContent(q, 'faq'),
      tips: filterHelpContent(q, 'tips'),
    };
  }

  return [];
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

/**
 * Render the complete interactive Help, FAQ & Tips screen into root DOM container.
 */
export async function renderHelp(root, { onBack = () => {}, initialTab = 'walkthrough' } = {}) {
  root.innerHTML = '';

  let currentTab = initialTab || 'walkthrough';
  let searchQuery = '';
  let activeAccordionId = null;

  const container = el(`<div class="screen fw-help-screen">
    <div class="fw-help-card">
      <div class="fw-help-header">
        <div class="fw-help-title-wrap">
          <div class="fw-help-icon">⚙️</div>
          <div class="fw-help-headings">
            <h2 class="fw-help-title">FLYWHEEL ACADEMY</h2>
            <div class="fw-help-subtitle">HOW TO PLAY · FAQ · TIPS 'N TRICKS</div>
          </div>
        </div>
        <button type="button" class="btn secondary fw-help-close-btn" aria-label="Close Help Menu">✕</button>
      </div>

      <div class="fw-help-search-row">
        <div class="fw-help-search-box">
          <span class="fw-help-search-icon">🔍</span>
          <input type="search" class="fw-help-search-input" placeholder="Search guides, power-ups, controls, FAQs, tips..." aria-label="Search guides and FAQs">
          <button type="button" class="fw-help-search-clear hidden" aria-label="Clear search">✕</button>
        </div>
      </div>

      <div class="fw-help-nav-tabs" role="tablist">
        ${HELP_TABS.map((tab) => `
          <button type="button" class="fw-help-tab${tab.id === currentTab ? ' fw-help-tab--active' : ''}" data-tab="${tab.id}" role="tab" aria-selected="${tab.id === currentTab}">
            <span class="fw-tab-icon">${tab.icon}</span>
            <span class="fw-tab-name">${tab.name}</span>
          </button>
        `).join('')}
      </div>

      <div class="fw-help-body" id="fw-help-content-area" role="tabpanel"></div>

      <div class="fw-help-footer">
        <button type="button" class="btn secondary fw-help-back-btn">BACK</button>
      </div>
    </div>
  </div>`);

  const contentArea = container.querySelector('#fw-help-content-area');
  const searchInput = container.querySelector('.fw-help-search-input');
  const clearBtn = container.querySelector('.fw-help-search-clear');
  const closeBtn = container.querySelector('.fw-help-close-btn');
  const backBtn = container.querySelector('.fw-help-back-btn');
  const tabButtons = container.querySelectorAll('.fw-help-tab');

  function renderContent() {
    contentArea.innerHTML = '';

    if (currentTab === 'walkthrough') {
      const items = filterHelpContent(searchQuery, 'walkthrough');
      if (items.length === 0) {
        contentArea.appendChild(el(`<div class="fw-help-empty">
          <div class="fw-empty-icon">🔍</div>
          <h3>No walkthrough guides found</h3>
          <p>Try searching for "powerup", "controls", "chicago", "combo", or "multiplayer".</p>
        </div>`));
        return;
      }

      const list = el(`<div class="fw-walkthrough-list"></div>`);
      items.forEach((item, idx) => {
        const isOpen = activeAccordionId === item.id || (!searchQuery && idx === 0 && activeAccordionId === null);
        const card = el(`<div class="fw-accordion-card${isOpen ? ' fw-accordion--open' : ''}" data-id="${item.id}">
          <button type="button" class="fw-accordion-header" aria-expanded="${isOpen}">
            <div class="fw-accordion-title-wrap">
              <span class="fw-accordion-icon">${item.icon}</span>
              <div class="fw-accordion-title-text">
                <span class="fw-accordion-badge">${item.badge}</span>
                <h3 class="fw-accordion-title">${item.title}</h3>
              </div>
            </div>
            <span class="fw-accordion-chevron">${isOpen ? '▲' : '▼'}</span>
          </button>
          <div class="fw-accordion-body" style="display:${isOpen ? 'block' : 'none'}">
            <p class="fw-walkthrough-summary">${item.summary}</p>
            <div class="fw-walkthrough-sections">
              ${item.content.map((c) => `
                <div class="fw-walkthrough-section">
                  <h4 class="fw-section-heading">${c.heading}</h4>
                  ${c.text ? `<p class="fw-section-text">${c.text}</p>` : ''}
                  ${c.list ? `
                    <ul class="fw-section-list">
                      ${c.list.map((li) => `<li>${li}</li>`).join('')}
                    </ul>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>`);

        card.querySelector('.fw-accordion-header').onclick = () => {
          activeAccordionId = (activeAccordionId === item.id) ? null : item.id;
          renderContent();
        };

        list.appendChild(card);
      });
      contentArea.appendChild(list);
    } else if (currentTab === 'faq') {
      const items = filterHelpContent(searchQuery, 'faq');
      if (items.length === 0) {
        contentArea.appendChild(el(`<div class="fw-help-empty">
          <div class="fw-empty-icon">🔍</div>
          <h3>No FAQs matched your query</h3>
          <p>Try searching for "swallow", "coins", "upgrades", "offline", or "reset".</p>
        </div>`));
        return;
      }

      const list = el(`<div class="fw-faq-list"></div>`);
      items.forEach((item, idx) => {
        const isOpen = activeAccordionId === `faq-${idx}`;
        const card = el(`<div class="fw-faq-card${isOpen ? ' fw-faq--open' : ''}">
          <button type="button" class="fw-faq-question" aria-expanded="${isOpen}">
            <div class="fw-faq-q-left">
              <span class="fw-faq-badge">${item.category}</span>
              <span class="fw-faq-q-text">${item.q}</span>
            </div>
            <span class="fw-faq-chevron">${isOpen ? '−' : '+'}</span>
          </button>
          <div class="fw-faq-answer" style="display:${isOpen ? 'block' : 'none'}">
            <p>${item.a}</p>
            ${item.tags ? `
              <div class="fw-faq-tags">
                ${item.tags.map((t) => `<span class="fw-tag">#${t}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>`);

        card.querySelector('.fw-faq-question').onclick = () => {
          activeAccordionId = (activeAccordionId === `faq-${idx}`) ? null : `faq-${idx}`;
          renderContent();
        };

        list.appendChild(card);
      });
      contentArea.appendChild(list);
    } else if (currentTab === 'tips') {
      const items = filterHelpContent(searchQuery, 'tips');
      if (items.length === 0) {
        contentArea.appendChild(el(`<div class="fw-help-empty">
          <div class="fw-empty-icon">🔍</div>
          <h3>No pro tips found</h3>
          <p>Try searching for "combo", "snack ring", "skyscraper", "derailment", or "vortex".</p>
        </div>`));
        return;
      }

      const grid = el(`<div class="fw-tips-grid"></div>`);
      items.forEach((tip) => {
        const card = el(`<div class="fw-tip-card">
          <div class="fw-tip-header">
            <span class="fw-tip-icon">${tip.icon}</span>
            <span class="fw-tip-badge">${tip.badge}</span>
          </div>
          <h4 class="fw-tip-title">${tip.title}</h4>
          <p class="fw-tip-desc">${tip.desc}</p>
        </div>`);
        grid.appendChild(card);
      });
      contentArea.appendChild(grid);
    }
  }

  // Bind Tab Switching
  tabButtons.forEach((btn) => {
    btn.onclick = () => {
      tabButtons.forEach((b) => {
        b.classList.remove('fw-help-tab--active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('fw-help-tab--active');
      btn.setAttribute('aria-selected', 'true');
      currentTab = btn.dataset.tab;
      activeAccordionId = null;
      renderContent();
    };
  });

  // Bind Search Input
  searchInput.oninput = () => {
    searchQuery = searchInput.value;
    clearBtn.classList.toggle('hidden', !searchQuery);
    renderContent();
  };

  clearBtn.onclick = () => {
    searchInput.value = '';
    searchQuery = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    renderContent();
  };

  closeBtn.onclick = onBack;
  backBtn.onclick = onBack;

  renderContent();
  root.appendChild(container);
}
