---
covers:
  - "js/citycatalog.js"
  - "js/ui/ready.js"
  - "js/ui/screens.js"
---
# 01 — Narrative & World Bible: Sprocket’s Odyssey

## 1. Character Lore: Who is Sprocket?

### The Mark & The Void
**Sprocket** is a sentient kinetic entity—a titanium-alloy toothed wheel with a singular, frictionless gravitational singularity at its center. 

Unlike traditional destructive monsters or anomalies, Sprocket is an engine of **momentum**. In mechanical systems and growth theory, the **Flywheel Effect** demonstrates that substantial power is built not from a single explosive jolt, but through compound, frictionless revolutions. Sprocket is that law manifested in physical form:
* **The Outer Toothed Ring (12 Sprocket Teeth):** High-speed shredding edges that mill architectural matter into digestible fragments.
* **The Central Core (The Hole):** A microscopic gravitational event horizon that converts consumed mass directly into **angular momentum**.
* **The Protagonist Portrait:** The official Flywheel brand mark (`js/ui/sprocket.js`) is a direct 1:1 portrait of Sprocket looking upward at the player.

---

## 2. In-Universe Physics & Gameplay Mechanics Translation

Every gameplay system in Flywheel maps directly to the physical laws governing Sprocket's flywheel engine:

| Gameplay Mechanic | In-Universe Physical Principle |
| :--- | :--- |
| **Strict Tier Ladder ($T_1 \to T_7$)** | **Rotational Inertia Law:** At $t=0$, Sprocket's flywheel has low angular momentum ($L = I\omega$). Attempting to ingest a 50-meter skyscraper immediately would stall the core. Sprocket must ingest low-mass props ($T_1$ street lamps, cones, mailboxes) to spin up rim velocity before the vortex can overcome the gravitational binding energy of multi-thousand-ton buildings. |
| **Combo Multiplier Ladder ($1.0\times \to 8.0\times$)** | **Frictionless Momentum Retention:** Ingesting matter in rapid cadence ($<1.5\text{s}$ interval) prevents thermal/frictional decay, compounding kinetic yield and coin extraction. |
| **2m Structural Bay Crumble & Fracture** | **Resonance Shear:** As Sprocket moves beneath foundations, harmonic vibrations fracture load-bearing columns. Modular 2m bays detach under structural stress and slide into the void. |
| **Orbital Power-Up Drops** | **Orbital Resonance Beams:** Satellite calibration buoys dropped into the sector by orbital tracking stations (Magnetron, Chrono Freeze, Titan, Overdrive) to test Sprocket's field adaptation. |
| **5-Minute & 3-Minute Clocks** | **Sector Thermal Dissipation:** Urban sectors maintain structural cohesion for a finite window. If Sprocket fails to achieve 100% mass capture within the time limit, the sector reaches static equilibrium. |
| **Rival Holes & 6-Player Multiplayer** | **Rival Prototype Cores:** Competing kinetic engines engineered by rival global laboratories seeking to monopolize urban mass and reach singularity first. |

---

## 3. The Overarching Narrative Arc: The Road to UNBOUND

### Act I: The Pacific Awakening (The Spark)
Born in the underground calibration tunnels of **The Lab**, Sprocket executes its first containment breach, emerging across the Pacific in **Sydney Harbour**, **Auckland**, and **Singapore**. Here, Sprocket calibrates maritime suction, soaring bridge arches, and high-salinity coastal grids.

### Act II: Asian Megacities & High-Density Grids (The Speed Test)
Sprocket enters the dense urban labyrinths of **Hong Kong**, **Seoul**, **Tokyo**, **Beijing**, **Bangkok**, and **Mumbai**. High-speed scramble crossings, neon skyscraper canyons, and runaway transit lines test Sprocket's angular acceleration and precision cornering.

### Act III: Desert Horizons & Mediterranean Antiquity (The Mass Test)
Crossing into **Dubai**, **Cairo**, **Athens**, and **Rome**, Sprocket encounters ancient stone monuments, colossal limestone pyramids, and marble colonnades. These heavy, dense materials harden Sprocket's core against extreme mass resistance.

### Act IV: European Capitals of Grandeur (The Architectural Crucible)
Arriving in Europe, Sprocket tours **Paris**, **London**, **Amsterdam**, and **Berlin**. Sweeping Haussmann boulevards, river crossings, historic brick canal rings, and iron towers tune Sprocket's harmonic resonance.

### Act V: The Americas & Transcontinental Transit (The Power Curve)
Sweeping through the Western Hemisphere from **Rio de Janeiro**, **Buenos Aires**, and **Mexico City** to **San Francisco**, **Chicago Loop**, and **Toronto**, Sprocket masters steep grade physics, runaway CTA train derailments, and colossal midwestern skyscrapers.

### Act VI: The New York Megacity Trilogy (The Master Class)
Descending upon New York City across **Lower Manhattan**, **Brooklyn**, and **Upper Manhattan**, Sprocket tackles 140,000+ total voxel blocks across Wall Street financial monoliths, DUMBO industrial lofts, and Central Park perimeters.

### Act VII: The Massachusetts Tech Corridor & Grand Finale (UNBOUND)
Sprocket reaches the final leg: staging at **Boston Seaport** before crossing the Charles River into **Cambridge, MA**. On the day of the global **UNBOUND Summit**, Sprocket enters Canal Park, dismantles the tech campus, and ascends to the roof of the First Street Garage to **"SWALLOW THE SPROCKET"**—uniting with its original blueprint, unleashing boundless global momentum, and igniting the summit!

---

## 4. UI Directives & Transmission Script Format

Each city features a structured narrative transmission displayed during the **City Select Dossier**, the **Ready Gate Briefing**, and the **Victory Debrief**:

### Dossier Schema:
```js
{
  scene: 'sydney',
  name: 'SYDNEY HARBOUR',
  location: 'SYDNEY, AUSTRALIA',
  act: 'ACT I',
  actTitle: 'THE PACIFIC AWAKENING',
  tagline: 'CHAPTER 1 · HARBOUR VOYAGE',
  status: 'PLAYABLE', // 'PLAYABLE' | 'DEVELOPMENT'
  directive: 'CALIBRATE OCEANIC INERTIA & CONSUME THE SAIL VAULTS',
  transmission: 'Vortex operational. Target acquired: Port Jackson. Ingest coastal bollards and ferries to build sufficient angular velocity for the Harbour Bridge through-arch.',
  debrief: 'Sydney sector 100% converted. Oceanic resonance achieved. Vector locked for trans-Pacific leap.'
}
```
