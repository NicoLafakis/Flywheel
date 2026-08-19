# Feature: Camera Bézier Smoothing & The Lab Skyscraper Testbed

**Status**: SPECIFIED  
**Category**: Core Engine / Camera & Rendering  

---

## Overview
This feature package specifies the transition of the chase camera from linear occlusion pitch steps and hard 1-frame roof-lift snaps to **$C^1$-continuous cubic Bézier / Hermite S-curve interpolation** and **critically damped ascent filters**, alongside adding an architectural **Skyscraper Testbed to The Lab**.

## Table of Contents
1. [Objective Overview](00-objective-overview.md) — Problem statement, executive summary, and design principles.
2. [PRD (Requirements)](01-prd.md) — Functional requirements, acceptance criteria, and non-goals.
3. [Technical Design](02-technical-design.md) — Mathematical formulas, cubic Hermite curves, and skyscraper testbed layouts.
4. [Tasks Roadmap](03-tasks.md) — Phased implementation and verification checklist.
5. [ADR-0022](../../adr/0022-camera-bezier-occlusion-and-smooth-roof-climbing.md) — Architectural Decision Record.
