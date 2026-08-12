# Game Music — Objective Overview

**Tier:** 1 · **Date:** 2026-08-11 · **Status:** implemented

## What was asked

Add the supplied game-music files and give the player a music adjustment in
the GUI. The implementation now streams the committed MP3s from
`assets/music/`; objective loudness/true-peak analysis remains outstanding.

## What it really serves

The sound-effect pass gave actions weight, but the game still has no musical
arc. Music should tell the player whether they are choosing, playing, paused,
or celebrating, while preserving the readability of eats, collapses, goals,
and the Chicago train. The setting must let a player reduce or silence music
without losing gameplay cues.

## Source inventory

Ten files ship in `assets/music/` (49,798,924 bytes / 47.49 MiB):

| Source file | Intended cue | Size |
|---|---|---:|
| `main-menu.mp3` | Title and arena lobby | 3.77 MiB |
| `brooklyn.mp3` | Brooklyn match | 3.55 MiB |
| `boston.mp3` | Boston match | 5.43 MiB |
| `cambridge.mp3` | Cambridge match | 3.91 MiB |
| `chicago.mp3` | Chicago match | 5.52 MiB |
| `lower-manhattan.mp3` | Lower Manhattan match | 5.47 MiB |
| `upper-manhattan.mp3` | Upper Manhattan match | 5.38 MiB |
| `shop.mp3` | Shop | 6.90 MiB |
| `pause.mp3` | Pause overlay | 3.73 MiB |
| `post-game.mp3` | Results | 3.83 MiB |

No dedicated Gallery file was supplied. Gallery deliberately remains
music-free; its gameplay SFX and environmental ambience still play.

**Provenance:** Nico created the ten original tracks with Suno and, as project
owner, states that the music copyright is owned by the project. The tracks are
proprietary Flywheel assets, not part of the CC0 sound-effects library.

## 20 moves ahead

- **Next wants:** per-cue mix tuning, track replacement without code edits,
  and perhaps separate ambience/SFX sliders once real playtesting identifies a
  need.
- **Breaks at scale / edges:** eagerly fetching or decoding 47.49 MiB at boot
  damages first play and memory use; autoplay restrictions mean the first cue
  cannot begin until a player gesture; background tabs must not keep playing.
- **Unlocks:** a small cue registry makes later cities, alternate tracks, and
  event-specific music a data addition instead of another state-machine fork.
- **Doors kept open vs. shut:** use a dedicated streamed music controller and
  registry, separate from decoded SFX/ambience. Keep one active music element
  now; do not build playlists, shuffle, beat matching, or adaptive stems.

## Scope line (pencil test)

- **Building:** canonical asset names under `assets/music/`; menu, shop, city,
  pause, and results cue mapping; lifecycle-safe switching; persisted independent
  music volume; global mute/master-volume interaction; foreground/background
  handling; loudness and rights checks; main game and arena wiring.
- **Surfacing for your call:** none. All cue mappings and the supplied
  recordings' provenance are settled.
- **Dropping:** playlists, track selection, shuffle, adaptive stems, campaign
  scoring sync, a new settings screen, and music in developer tools.

## Caliber & package

Tier 1 because this is reversible player-visible behavior on top of the
existing audio subsystem, touching a handful of files with no dependency,
network service, or save-schema change. Package: this overview,
[requirements](01-requirements.md), and [implementation tasks](02-tasks.md).
