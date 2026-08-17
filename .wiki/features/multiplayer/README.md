# Multiplayer (6-Player Shared City Sandboxes)

Clean-slate 6-player synchronized shared-city multiplayer with invite links, pre-game staging lobby, ephemeral non-persisted lobby chat, auto-start on full room, and direct 1:1 single-player map parity.

## Document Index

1. [00 — Objective & Overview](00-objective-overview.md): Vision, core principles, system boundaries, and initial 3-level scope.
2. [01 — Product Requirements Document (PRD)](01-prd.md): User personas, game modes, invite link flow, lobby UI, chat rules, and match lifecycle.
3. [02 — Detailed Requirements](02-requirements.md): Functional, UI/UX, network, audio, performance, and anti-persistence specifications.
4. [03 — Technical Design](03-technical-design.md): System architecture, lobby state machine, multi-hole simulation integration, and transport layers.
5. [04 — Netcode & Wire Protocol](04-netcode-protocol.md): Broadcast schema, ephemeral chat channel, state synchronization, clock alignment, and disconnection handling.
6. [05 — Multi-Hole Gameplay & Execution Plan](05-multihole-gameplay-plan.md): Independent player-controlled holes, camera tracking, rival rendering, multi-hole shader voxel clipping, and live scoreboards.
7. [13 — Task Breakdown](13-tasks.md): Phased Red-Green-Refactor TDD execution plan.

## Quick Reference

- **Max Players**: 6 (1 Host + up to 5 Joiners, configurable 2..6)
- **Initial Available Cities**: 
  - Level 1: The Lab (`gallery`, 12k blocks)
  - Level 2: Lower Manhattan (`manhattan`, 25k blocks)
  - Level 3: Brooklyn (`brooklyn`, 40k blocks)
- **Access Model**: Shareable invite links (`?room=CODE`) & 5-character codes
- **Lobby Start**: Automatic 3s countdown the instant room capacity is reached ($N/N$)
- **Chat**: Ephemeral in-lobby only; zero disk/DB storage; zero in-game chat UI
- **ADR Reference**: [ADR-0019](../../adr/0019-six-player-invite-lobby-multiplayer.md)

## Outstanding: no threat model

The legacy multiplayer stack's threat model (`09-threat-model.md`) was deleted
with the rest of the online-flywheel package on 2026-08-16 and never replaced.
This package's own docs above cover architecture and netcode, not an
adversarial analysis, so the current shipped multiplayer stack (`js/multiplayer/`)
has no security or cheating threat-model document at all. Writing one is
outstanding work.
