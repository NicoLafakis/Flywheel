# ADR 0026: Direct input and one active power presentation

Status: Accepted, 2026-09-08; final visual/device acceptance pending.

## Context

The user explicitly chose v3-like direct movement and fixed orientation over
tank steering/manual orbit, and full cinematics only for major powers.

## Decision

Input names immediate screen direction. Normal camera yaw stays fixed; facing
does not control movement. Keep existing follow/zoom and touch-role handling,
with fresh-input cleanup at presentation boundaries. One presentation clock owns
major collection sequences; the pure sim remains the only activation authority.
Competitive and reduced-motion paths stay nonblocking. Spawn events announce
without taking the camera. See the
[implementation plan](../plans/controls-powerup-remediation.md).

## Alternatives and consequences

Retaining camera-relative tank steering would continue the mismatch. Full
sequences for every pickup would repeatedly interrupt play. Rendering-only
ownership allows skip/cleanup without duplicate activation, while requiring real
browser tests for input release, camera return, framing and accessibility.
Historical control preferences in old comments do not override this newer user
decision. Existing saves keep their schema; retired turn sensitivity is ignored.
