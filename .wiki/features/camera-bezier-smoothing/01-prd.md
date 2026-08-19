# PRD: Camera Bézier Occlusion Smoothing & The Lab Testbed

**Status**: SPECIFIED  
**Target Milestone**: Future Polish / Next Sprint  

---

## 1. Problem Statement & User Experience

### 1.1 The Player's Pain Point
In urban maps with tall buildings, when the player drives past or directly behind a tower, the camera abruptly snaps upwards to an overhead angle. While this prevents building geometry from occluding the player, the sudden change in perspective:
- Disorients the player regarding their current heading.
- Creates visual jarring/motion sickness due to high angular acceleration ($> 800^\circ/\text{s}^2$).
- Causes jarring vertical "pops" when entering roof height thresholds.

### 1.2 Target Experience
- **Organic Flow**: As Sprocket approaches a building, the camera begins lifting gently, smoothly accelerating upward into an overhead vantage point without a hard angle pivot.
- **Zero Grazing Twitch**: Brushing past the edge of a building shouldn't violently flick the camera angle; minor obstructions produce subtle, natural framing adjustments.
- **Seamless Recovery**: Exiting a building canyon returns the camera to standard chase perspective along a smooth decay curve without bouncing or overshooting.
- **Immediate Local Testbed**: A dedicated cluster of tall buildings in The Lab so any future camera retuning can be instantly test-driven.

---

## 2. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| **REQ-CAM-01** | **$C^1$ Continuous Pitch Transition** | The pitch angle transition $\theta_\text{eff}(t)$ must have continuous first derivatives; jerk ($\frac{d^2\theta}{dt^2}$) at boundary crossover ($u \to 0^+$) must be zero. |
| **REQ-CAM-02** | **Smooth Roof Climb (No Instant Snaps)** | Roof clearance lift (`_lift`) must never change by $> 2.5\text{m}$ in a single 16ms frame, even when encountering a 50m sheer tower wall. |
| **REQ-CAM-03** | **Zero Wall Penetration Guarantee** | The camera must remain outside all active building bounding boxes ($> 0.5\text{m}$ clearance) across 100% of tested routes. |
| **REQ-CAM-04** | **The Lab Skyscraper Cluster** | The Lab (`gallery`) must contain at least 3 distinct towers with heights between $25\text{m}$ and $48\text{m}$, creating narrow alleys ($4\text{m}$–$8\text{m}$ wide) for camera stress-testing. |
| **REQ-CAM-05** | **Zero Regression on Intro & Cutscenes** | Level intro establishing shots (`beginIntro`), quake cinematics, and power-up spawn sweeps must remain bit-identical and unaffected. |

---

## 3. Non-Goals

1. **First-Person Camera**: The camera remains strictly third-person chase with hole follow.
2. **Manual Pitch Control**: Player pitch remains automated and bound to hole size tier and occlusion state (manual Q/E controls yaw only).
3. **Dynamic Camera Raycast Meshing**: The sim continues using axis-aligned bounding boxes (AABBs) for fast, deterministic $O(N)$ CPU sweeps rather than GPU rasterization or depth-buffer readbacks.
