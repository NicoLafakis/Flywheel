# Living World: blocky people, dogs, flocks and traffic

Status: PLAN (2026-09-27), code checked at 54b10b6. Real-world figures are from planner knowledge and must be verified before shipping. Consumes seams the Lab Tokyo remake records (walk paths, crosswalks, lanes, signal phases, perches); never edits js/voxelscene-lab.js.

## 1. What exists
- Render-only instanced gulls, pigeons (hole-flee "alarm" when hole within radius+5 m), ferries in js/voxelworld.js (PIGEON_KIT :284, _derivePigeons :1244, _tickPigeons :3094). Seeded with mulberry32(hash32), not the sim RNG. Frozen by _ambientFrozen; dropped by RenderBudget level >= 2. Not eatable.
- Mover seam (Chicago L train) in js/voxelsim.js: moverArc/moverPose :855-870, mover sim :3949+, _consumeMoverUnit :4243. Pose is a pure function of sim.time, eatable, awards via _award, no RNG. Pinned by tools/train-derail-selftest.mjs. Not replicated in multiplayer; tools/multiplayer-fixes.test.mjs guards it.
- Static vehicles/boats as voxels (voxelkit VEHICLE, rowBoat, sailBoat).
- Size only via js/tiers.js (1.35x ladder). RANKED_SIM_VERSION = 4 (voxelsim.js:773).
Lesson: extend the mover pattern; don't invent a parallel one.

## 2. Reference data (verify)
| Quantity | Value | Use |
|---|---|---|
| Shibuya scramble crossers per peak green | ~1,000-2,500 | render ~1:20 -> 60-150 people per phase |
| Signal cycle | ~100-120 s; all-way pedestrian ~40-50 s | SIGNAL_CYCLE 110 s, PED 45 s (38 walk + 7 flash), NS 30, EW 30, all-red 2.5 s x2 |
| Walking speed | 1.2-1.4 m/s (Tokyo ~1.3), flashing rush ~1.8 | per-agent from hash |
| Personal space | 0.6-0.8 m | separation 0.7 m |
| Traffic | left-hand, buses stop at left kerb | lane offset left of centreline |
| Speeds | cars 8, taxis 9, buses 6 m/s, accel 2 m/s^2 | |
| Vehicle mix | car 55%, taxi 35%, bus 10% (buses by route) | |
| Dogs | small breeds, leashed | ~1 per 40 people, 1.2 m leash |
| Pigeon flush | 2-5 m, relocate 10-30 m | matches existing trigger |

## 3. Reference games
Donut County/Katamari: living things panic visibly before being edible; they ignore you until you outsize them. Crossy Road: readable lanes, constant speed. Minecraft mobs: 2-frame limb swing (+-30 deg) reads as walking. Rule: readability over count, ~150 visible agents.

## 4. Archetypes
| Archetype | Parts | Size | Tier | Behaviour |
|---|---|---|---|---|
| Person | head, torso, 2 legs, 2 arms (10% bag/umbrella) | 0.45x1.7x0.3 m | 2 | walk graph, obey signal, loiter at perches, flee |
| Dog | body, head, 4 legs, tail | 0.5x0.35x0.2 m | 1 | follows owner; flees if owner eaten |
| Pigeon flock | reuse PIGEON_KIT | 0.3 m | 1 | eatable only grounded; scatter; resettle 20-40 s |
| Car | body, cabin, 4 wheels | 4.4x1.5x1.7 m | 3 | lanes, stop line on red, gap keeping, brake/reverse near hole |
| Taxi | car + roof lamp, JPN Taxi liveries | as car | 3 | + kerb stops at taxi ranks |
| Bus | body, window band, wheels | 10.5x2.5x3.1 m | 4 | fixed route, 8 s stops |
Mass only from TIERS[tier].mass; points via _award.

## 5. Behaviours
1. signalPhase(t): pure function of sim.time and the scene cycle table.
2. Walking on the walk-path graph via moverArc/moverPose; wait at crosswalk unless PED; in flashing only start if it can finish at 1.8 m/s; next edge by hash32(agentId, visitCount).
3. Vehicles: left-hand lane polylines, 1-D queueing, stop at line on red/amber.
4. Flee when hole within radius+6 m AND edible by tier; speed x1.8; arms-up pose; too-big agents ignore the hole; flee collides only with static grid (1 probe); recover after 6 s.
5. Eaten when centre inside the void and isEdible; eat event {id, life:true, kind} for audio (pigeon pop, car honk). Too-big agents falling in are removed unscored (like fissure award=false).
6. Free play respawns from map edges up to lifeCap (3 s delay); ranked never respawns.

## 6. Sim and determinism
New pure js/life.js (no three.js/DOM), struct-of-arrays fixed pools, zero per-step allocation, stepped inside sim.step after hole movement and before consumption. No RNG draws (hash32 variation). Ranked: life OFF (RANKED_TUNE.life=false) until a dedicated RANKED_SIM_VERSION 5 bump. Multiplayer: not replicated; extend the mover guard. Existing ambient pigeons stay decorative; scenes opt in to eatable flocks. No save schema change.

## 7. Render
js/liferender.js owned by VoxelWorld3D next to _buildMovers. One InstancedMesh per part shape per archetype, instanceColor palettes, shared caches; <= 10 new draw calls. Limb swing by distance walked. LOD: torso-only beyond 90 m, culled beyond 160 m. Budget/perf/reduced-motion freeze animation, never visibility. Flat low-chroma colours, no textures.

## 8. Performance budget
Lab HIGH: 160 people, 4 dogs, 3 flocks x12, 40 vehicles (6 buses); LOW halves people, 20 vehicles. life.step <= 0.25 ms p50 / 0.6 ms p95 (Node bench). Render <= 0.5 ms/frame, <= 10 draw calls, <= 25k triangles. Zero steady-state allocation. Agents never enter the debris solver.

## 9. TDD tests (red first; sections life, lifeRender)
1 signalPhase pure, phases sum to cycle, PED 45 s. 2 pedestrian waits on red, crosses on PED, won't start on flash if ETA too long. 3 vehicle stops before line, min gap >= 2 m over 10k steps. 4 left-hand lanes. 5 flee only if edible. 6 eat awards TIERS mass exactly once. 7 dog within 1.5 m leash; flees when owner consumed. 8 determinism hash at step 3600; life off leaves replay hash unchanged. 9 ranked tune has life off; v4 replay hash unchanged. 10 multiplayer guard. 11 placement accuracy: spawns on sidewalk/plaza/crosswalk (people) or road (vehicles) within 0.25 m, never inside buildings. 12 perf: p95 <= 0.6 ms, zero allocation. 13 render <= 10 draw calls, consumed hidden same frame. 14 free play refills within 5 s; ranked never respawns.

## 10. Rollout
0 contract: js/life.js scaffold + sceneLife schema {walkGraph, crosswalks, lanes, signals:{cycle,phases}, perches, busStops, taxiRanks, caps}. 1 Lab pedestrians + signal. 2 Lab vehicles. 3 flee/eat, dogs, eatable flocks at Hachiko; owner playtest. 4 deriveLife(decor) auto graph for other cities, traffic side per country table (left: Tokyo, London, Hong Kong, Singapore, Sydney, Auckland, Mumbai, Bangkok). 5 ranked after owner sign-off: RANKED_SIM_VERSION 5.

## 11. Risks
Lab seams still changing: pin to schema, not lines. Keep life off in validator sections that don't test it. Movers unreplicated: guard now.

Critical files: js/voxelsim.js, js/voxelworld.js, js/tiers.js, js/voxelscene-lab.js (read-only), tools/validate.mjs.
