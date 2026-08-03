# Clean-Room “Growing Hole” Arcade Game — Master Build Request

## 1. Project Mandate

Build a complete, original, production-ready 3D arcade game in Unreal Engine 5.8 that captures the satisfying gameplay pattern of controlling a moving hole, absorbing objects that fit, gaining score and size, and progressing from tiny clutter to massive structures.

This must be a clean-room implementation. Do not copy proprietary Blueprints, code, art, audio, level layouts, names, UI, or branding from any commercial game or marketplace template. Reproduce only the general game mechanic through an independently designed architecture, original content, and documented Unreal Engine techniques.

The final result must be a fully playable game rather than a mechanic demo. It must include:

- A polished core absorption mechanic
- Twelve campaign levels
- A competitive arena mode with AI-controlled rivals
- An endless score-attack mode
- Complete menus, HUD, progression, saving, settings, audio, VFX, tutorial, and results flow
- Keyboard/mouse, gamepad, and touch controls
- Windows and Android builds
- A project structure that is ready for later iOS packaging and optional online multiplayer
- Automated functional tests and a documented manual QA checklist
- No paid third-party runtime dependencies

Use C++ for performance-critical and testable core systems, while exposing configuration and content workflows to Blueprints, Data Assets, Data Tables, Curves, UMG, Niagara, and editor-authored levels. A Blueprint-only substitute is acceptable only when it remains clean, centralized, performant, and fully testable.

Working title: **Gravity Maw**. Treat this as a replaceable internal title.

---

## 2. Product Vision

### Player fantasy

The player begins as a tiny moving void that can swallow only loose clutter. Every successful absorption makes the void more powerful. By the end of a session, the player is consuming cars, trees, buildings, towers, and entire landmarks.

### Design pillars

1. **Immediately understandable**  
   Move over objects that visibly fit inside the hole.

2. **Constant escalation**  
   Every 15–30 seconds should unlock a noticeably larger class of target.

3. **Physical satisfaction without unstable simulation**  
   Objects should tip, slide, spiral, and drop convincingly, but the game must not depend on uncontrolled full-scene physics.

4. **Readable from a top-down camera**  
   Object size, eligibility, danger, goals, score, and remaining time must be understandable at a glance.

5. **Fast restarts and short sessions**  
   Campaign stages should take approximately two to four minutes.

6. **Scalable content production**  
   Designers must be able to add an absorbable object or level without rewriting gameplay code.

### Tone and age target

Use a playful, stylized, toy-city presentation. Avoid gore, realistic injury, copyrighted brands, real company logos, and frightening horror treatment. Stylized civilians may run away and disappear through a harmless cartoon vortex effect when consumed; do not depict injury.

---

## 3. Target Platforms and Performance

### Required targets

- Windows 11, 64-bit
- Android, landscape orientation
- Gamepad-compatible PC play
- Project configured so an iOS build can be produced later with the appropriate Apple toolchain

### Performance targets

- Windows: stable 60 FPS at 1920×1080 on a reasonable midrange gaming PC using the Medium preset
- High-end Android: target 60 FPS
- Midrange Android: stable 30 FPS
- No level should require more than 25 simultaneously simulated rigid bodies during normal play
- Support at least 300 placed absorbable actors in a campaign map, with no per-actor Tick while idle
- Stress-test 500 absorbable actors and 20 simultaneous capture operations without crashes, runaway allocations, or duplicate scoring

### Rendering baseline

- Use the mobile-friendly rendering path as the baseline
- Do not require Lumen, Nanite, hardware ray tracing, virtual shadow maps, or expensive full-screen effects
- Use baked or inexpensive lighting for the mobile baseline
- Allow enhanced PC-only quality through scalability settings
- Provide Low, Medium, High, and Epic presets
- Configure Android Low, Mid, and High device profiles
- Provide cull distances, LODs, texture-size limits, shadow limits, and effect-density differences by profile

---

## 4. Core Game Loop

1. Load a level and show a short objective card.
2. Spawn the player at the level’s configured starting radius and growth tier.
3. Let the player move freely across the playable ground plane.
4. Detect absorbable candidates near the hole.
5. Capture only objects whose complete horizontal footprint fits inside the effective opening.
6. Animate eligible objects below the ground using a controlled capture sequence.
7. Award score and growth only when consumption completes.
8. Increase the hole radius at configured thresholds.
9. Zoom the camera out smoothly as the hole grows.
10. Complete or fail the level based on the level objective and timer.
11. Show score, stars, records, unlocks, and replay/continue actions.
12. Persist progress and settings.

---

## 5. Precise Hole Rendering System

### 5.1 Visual principle

Do not deform or cut the ground mesh at runtime.

Create the visible opening by masking ground pixels in world space and revealing a separate animated interior mesh placed below the surface.

### 5.2 Required material assets

Create:

- `MPC_HoleWorld`
- `MF_HoleMask`
- `M_Ground_Master`
- `MI_Ground_*` instances for each biome
- `M_HoleInterior`
- `M_HoleRim`
- `M_HoleShadow`
- Optional low-cost mobile variants

### 5.3 Material Parameter Collection

Support up to four simultaneous holes for the player-plus-bots arena mode.

Use four vector parameters:

- `Hole0_PositionRadius`
- `Hole1_PositionRadius`
- `Hole2_PositionRadius`
- `Hole3_PositionRadius`

Store world X, world Y, world Z, and radius in each vector. Add scalar parameters for:

- `ActiveHoleCount`
- `EdgeSoftness`
- `GlobalHoleDepth`
- `MaskEnable`

### 5.4 Ground mask function

For each enabled hole:

1. Read `Absolute World Position`.
2. Compare world XY position with the hole’s XY position.
3. Calculate radial distance.
4. Produce a circular mask using `SphereMask` or an equivalent distance calculation.
5. Combine all active-hole masks.
6. Send the inverse result to the ground material’s Opacity Mask.
7. Use a hard enough edge for reliable masking and a separate rim mesh to visually soften the boundary.

All drivable ground surfaces—including roads, sidewalks, grass pads, plazas, and roofs that can be consumed from—must use a material containing `MF_HoleMask`.

Do not use translucent ground for the main effect.

### 5.5 Interior illusion

Each hole pawn owns:

- A shallow inverted bowl or cylinder beneath the ground
- A black-to-dark interior material with subtle radial motion
- A rim mesh slightly above or aligned with the ground
- A soft contact-shadow mesh or decal
- A low-cost Niagara swirl
- A capture kill volume below the surface

Scale all hole visual components from one authoritative gameplay radius.

The interior must not reveal an open empty world beneath the level. It should read as a deep portal even though it is a shallow hidden mesh.

---

## 6. Collision and Absorption Architecture

### 6.1 Custom collision channels

Create dedicated project collision channels:

- Object channel: `HoleFloor`
- Object channel: `Absorbable`
- Trace channel: `HoleQuery`
- Optional object channel: `HolePawn`

Rules:

- Ground collision components use `HoleFloor`, not generic `WorldStatic`.
- Absorbable objects block `HoleFloor` when idle.
- A captured object changes only its `HoleFloor` response to Ignore.
- It must retain appropriate collisions with walls, other props, and capture-funnel components.
- Hole sensors overlap `Absorbable`.
- Hole pawns do not physically push normal props.
- World boundaries block hole pawns.

### 6.2 Absorbable interface

Create `BPI_Absorbable` or a C++ `UInterface` with Blueprint events/functions:

- `GetAbsorptionProfile`
- `GetFitRadius`
- `GetScoreMass`
- `CanBeAbsorbedBy`
- `BeginCapture`
- `CancelCapture`
- `CompleteConsumption`
- `GetPrimaryPrimitiveComponent`
- `GetCapturePivot`
- `OnHoleTierChanged`

Every absorbable object must implement the interface or derive from `BP_AbsorbableBase`.

### 6.3 Absorption profile

Create `DA_AbsorptionProfile` with:

- Gameplay tag
- Minimum hole tier
- Automatic or overridden fit radius
- Mass used for score
- Base score override
- Growth value override
- Capture style
- Physics enabled during capture
- Downward acceleration
- Centering strength
- Maximum capture time
- Rotation impulse range
- Scale-down amount near completion
- Impact sound set
- Consumption sound set
- Niagara effect
- Camera impulse amount
- Haptic amount
- Pool or destroy policy
- Static-structure proxy reference
- Optional child actors to consume together

Profiles:

- TinyClutter
- SmallProp
- MediumProp
- LargeProp
- Vehicle
- Tree
- SmallStructure
- LargeStructure
- Landmark
- CartoonCharacter

### 6.4 Candidate detection

The hole actor contains:

- `CandidateSensor`: a cylinder or sphere overlap volume slightly larger than the visible hole
- `CaptureSensor`: a smaller central volume
- `KillVolume`: below the floor
- Optional `RimGuide`: non-blocking debug geometry

On candidate overlap:

- Validate interface and current state
- Add the actor to a central candidate set
- Do not run a Tick on the candidate actor
- Re-evaluate candidates from the hole manager at 20 Hz, or immediately after meaningful events such as player movement, growth, or candidate movement

On end overlap:

- Remove idle candidates
- Do not release an actor that has already committed to capture unless a fail-safe explicitly cancels it

### 6.5 Fit calculation

Use a conservative two-dimensional footprint test.

Default automatic calculation:

- Call `GetActorBounds` using colliding components
- Let `BoundsExtentX` and `BoundsExtentY` be the horizontal half-extents
- Calculate `AutoFitRadius = sqrt(X² + Y²)`
- Calculate the two-dimensional distance from the bounds origin to the hole center
- The object fits when:

`Distance2D + FitRadius <= HoleRadius × FitTolerance`

Default `FitTolerance = 0.92`.

Allow an authored `FitRadiusOverride` for long, irregular, multi-part, or visually misleading objects.

Also support an optional footprint-socket mode in which the object provides several footprint scene components. Every provided point must lie within the effective hole radius before capture begins.

Objects that are too large must remain supported by the floor. They may wobble or show a subtle “too large” rim response, but must not clip through the ground.

### 6.6 Capture ownership and state machine

Create states:

- Idle
- Candidate
- Committed
- Capturing
- Consumed
- Restoring
- Disabled

When an object becomes Committed:

- Assign one owning hole
- Add it to a global captured-object set
- Prevent other holes from claiming it
- Cache its original physics, collision, mobility, damping, gravity, scale, and parent state
- Prevent duplicate score events
- Start one of the capture styles below

### 6.7 Capture styles

#### Physics Drop

For small and medium movable props:

- Enable physics if needed
- Wake rigid body
- Change `HoleFloor` response to Ignore
- Apply a downward force proportional to mass
- Apply a horizontal attraction force toward the hole center
- Add a small randomized angular impulse
- Clamp extreme velocity
- Increase damping if the object becomes unstable
- Optionally shrink only during the final 20% of descent to hide edge clipping

#### Guided Sink

For objects where deterministic motion is more important than physics:

- Disable blocking collision except required sensors
- Interpolate the capture pivot toward a point below the hole
- Add controlled tilt and rotation
- Use easing, not a constant-speed linear move
- Complete within the profile’s maximum capture time

#### Structure Collapse Proxy

For buildings and landmarks:

- Never enable expensive full-building rigid-body simulation
- Disable the original actor’s collision
- Hide or dissolve the original in sections
- Spawn or reveal a lightweight collapse proxy
- Tilt, compress, and sink the proxy
- Spawn restrained debris and dust
- Consume attached child props as one transaction
- Pool or remove the proxy after completion

#### Character Escape/Consume

- Characters outside the capture threshold may run away from nearby holes
- Once fully eligible, switch to a harmless cartoon spiral-and-poof sequence
- No ragdoll injury presentation is required

### 6.8 Consumption completion

Complete consumption when:

- The actor overlaps the owning hole’s kill volume, or
- The guided sequence reaches its final position, or
- A hard timeout triggers the fail-safe

On completion:

1. Mark the object Consumed.
2. Remove it from all candidate and capture sets.
3. Calculate score and growth once.
4. Trigger VFX, audio, haptics, camera feedback, and score popup.
5. Update combo state.
6. Return the actor to a pool or destroy it according to profile.
7. Restore nothing unless the capture was canceled before completion.

### 6.9 Fail-safes

- If a captured object becomes invalid, clear all references safely.
- If an object remains Capturing beyond its maximum time, force-complete it.
- If it falls below the world without hitting the kill volume, force-complete it.
- If a capture is canceled, restore every cached collision and physics setting.
- Never award points from overlap begin alone.
- Never award points twice.
- Never allow two holes to own the same object.
- Do not change an absorbable’s response to all collision channels; change only the dedicated floor channel unless the profile explicitly requires more.

---

## 7. Scoring, Growth, and Combo

### 7.1 Score

Use authored profile values for final balancing, with a mass-based fallback.

Fallback:

`BaseScore = round(pow(clamp(MassKg, 0.1, 100000), 0.55) × 10)`

Final:

`AwardedScore = BaseScore × ComboMultiplier × LevelScoreMultiplier`

The UI may show the base value before combo.

### 7.2 Growth

Maintain separate `GrowthXP` rather than deriving current radius directly from total score.

Use:

- `Curve_HoleRadiusByGrowthXP`
- `Curve_HoleTierByGrowthXP`
- Level-defined start XP and maximum tier
- Smooth radius interpolation over 0.35–0.75 seconds

When growth occurs:

- Scale visible opening
- Scale sensors and interior meshes
- Update material parameters
- Update camera distance
- Play a growth swell
- Spawn a rim pulse
- Briefly highlight newly eligible object classes

### 7.3 Combo

- Combo window: 1.5 seconds by default
- Each completed consumption refreshes the window
- Multiplier steps: ×1, ×1.25, ×1.5, ×2, ×3, ×5
- Large multi-object collapses count as one headline event plus subordinate item points
- Combo UI must remain readable and not obscure the play area
- Reduced-motion mode replaces aggressive scale punches with fades

---

## 8. Player Movement and Camera

### 8.1 Input

Use Enhanced Input.

Actions:

- `IA_Move`
- `IA_Pause`
- `IA_Confirm`
- `IA_Back`
- `IA_Restart`
- `IA_ZoomOptional`
- `IA_DebugToggle` for development builds only

Mapping contexts:

- Keyboard and mouse
- Gamepad
- Touch
- UI navigation

Touch control:

- Default to relative drag steering: touch and drag anywhere on the gameplay area to create a movement vector
- Include an optional fixed virtual joystick in settings
- Include left-handed placement
- Ignore touches over active UI controls

### 8.2 Movement

- Restrict movement to the level’s XY play plane
- Use acceleration and deceleration rather than instant velocity changes
- Starting speed should feel agile
- Gradually reduce maximum speed as the hole becomes very large
- Use swept movement against level boundaries
- Do not let normal absorbable props block movement
- Provide soft repulsion between rival holes to avoid exact visual stacking
- Pause input during countdown, results, and blocking tutorial prompts

### 8.3 Camera

- Perspective top-down camera
- Default pitch around 50–65 degrees, tuned by playtest
- Smoothly follow the hole with slight forward look based on velocity
- Zoom out with radius using a curve
- Keep the hole approximately within the lower-middle region during movement
- Prevent camera clipping into tall structures
- Use subtle camera impulses for large consumptions
- Include camera shake and motion feedback toggles
- Do not use aggressive motion blur

---

## 9. Game Modes

### 9.1 Campaign

- Twelve handcrafted levels
- Two-to-four-minute target length
- Three-star scoring
- Unlock next stage with at least one star
- Record best score, best time, and stars
- Short objective card before play
- Retry and next-level flow after results

### 9.2 Arena

- Player versus three AI-controlled holes
- Three-minute match
- Shared map and shared absorbable objects
- Each object has exclusive capture ownership
- Live rank display
- Final ranking by score
- Difficulty options: Relaxed, Standard, Expert
- No online networking required in version 1
- Keep architecture authoritative and event-driven so online replication can be added later

### 9.3 Endless

- Unlock after completing Campaign Level 6
- One expanding city map
- Increasing score thresholds add time
- Object waves or districts unlock as the hole grows
- Record local high score
- End when time reaches zero

---

## 10. AI Rivals

Implement lightweight utility-based AI rather than heavyweight combat AI.

Each bot:

1. Scans nearby unclaimed absorbables at a throttled interval.
2. Filters by current fit eligibility and tier.
3. Scores targets using value, travel distance, cluster density, nearby rival pressure, and expected growth.
4. Chooses a target or cluster.
5. Steers toward it with simple obstacle avoidance.
6. Re-evaluates when the target is consumed, claimed, too large, or significantly displaced.
7. May prioritize a growth threshold when close to leveling up.
8. Does not cheat by consuming objects that fail the same fit test used by the player.

Difficulty changes:

- Decision interval
- Steering accuracy
- Target valuation quality
- Willingness to contest clusters
- Reaction time

Bots must not teleport, receive hidden score, or ignore capture ownership.

---

## 11. Campaign Level Plan

Use original modular environments and layouts.

### World 1 — Small Beginnings

#### Level 1: Pocket Park
- Tutorial
- Start with tiny litter, flowers, cups, balls, and cones
- Introduce movement, fit rules, scoring, and growth
- Objective: reach Tier 2 before time expires
- Time: 150 seconds

#### Level 2: Backyard Bash
- Garden props, toys, stools, grills, bins, small trees
- Introduce irregular objects and authored fit radii
- Objective: score threshold
- Time: 180 seconds

#### Level 3: Schoolyard Sweep
- Benches, sports equipment, bikes, vending kiosks, small sheds
- Introduce moving cartoon characters
- Objective: consume three marked target objects
- Time: 180 seconds

### World 2 — Busy Districts

#### Level 4: Market Block
- Crates, signs, carts, stalls, scooters, delivery vans
- Dense combo opportunities
- Objective: score threshold with a two-star combo challenge
- Time: 180 seconds

#### Level 5: Construction Zone
- Barriers, pipes, pallets, machinery, containers, crane components
- Introduce heavy objects and structure proxies
- Objective: consume the site office
- Time: 210 seconds

#### Level 6: Boardwalk
- Chairs, umbrellas, kiosks, arcade props, small rides, boats
- Introduce mixed terrain materials that all share the hole mask
- Objective: consume the pier landmark
- Time: 210 seconds

### World 3 — City Scale

#### Level 7: Downtown Rush
- Street furniture, cars, buses, trees, storefronts, low-rise buildings
- Traffic and moving targets
- Objective: reach Tier 6
- Time: 210 seconds

#### Level 8: Transit Hub
- Taxis, buses, station props, platforms, rail cars
- Large elongated objects with footprint sockets
- Objective: consume a marked train after growing sufficiently
- Time: 240 seconds

#### Level 9: Industrial Yard
- Tanks, warehouses, trucks, pipes, gantries, large machinery
- High-value clusters and narrow routes
- Objective: score threshold
- Time: 240 seconds

### World 4 — Giant Finale

#### Level 10: Stadium District
- Tailgate clutter, vehicles, gates, stands, field structures
- Objective: consume the central stadium structure
- Time: 240 seconds

#### Level 11: Harbor Megamix
- Containers, cranes, warehouses, ships, docks
- Objective: consume two landmark-class targets
- Time: 270 seconds

#### Level 12: Citywide Finale
- Multi-district city combining previous object families
- Start small and finish at tower scale
- Objective: consume the final skyline landmark
- Time: 300 seconds
- Unlock Endless mode completion badge and final hole skin

### Star thresholds

Each level data asset contains:

- One-star score
- Two-star score
- Three-star score
- Optional special challenge
- Time limit
- Starting radius and XP
- Maximum tier
- Level score multiplier
- Allowed object profiles
- Target actor IDs
- Music and ambience references

---

## 12. Art Direction and Environment Design

### Visual style

- Original stylized low-poly or softened toy-like 3D
- Clean silhouettes readable from above
- Slightly exaggerated object proportions
- Consistent texel density
- Minimal tiny surface detail
- Strong size hierarchy between tiers
- No real brands or copied landmark designs
- Modular city kit for roads, sidewalks, plots, parks, waterfronts, and industrial areas

### Object readability

Provide a brief rim reaction when:

- An object fits and enters the capture zone
- An object is barely too large
- A growth event makes a nearby object newly eligible

Do not permanently outline every object.

### Environment construction

- Use modular blocks and reusable prop families
- Decorative non-absorbable clutter should use instancing where appropriate
- Absorbable objects use simple collision
- Avoid complex per-poly collision for gameplay props
- Use authored collision proxies for buildings
- Keep playable boundaries visually clear through roads, walls, water, fences, or terrain edges

### Hole skins

Ship at least six original cosmetic skins unlocked through campaign progress:

- Classic Void
- Neon Circuit
- Lava Core
- Frost Rift
- Galaxy Swirl
- Golden Singularity

Skins may change rim, interior material, particles, and sound accent, but must never change gameplay radius or scoring.

---

## 13. VFX and Feedback

Use Niagara for reusable effects and pool frequently spawned systems.

Required effects:

- Idle hole swirl
- Movement wisps based on speed
- Small capture dust
- Medium capture debris
- Large structure collapse dust
- Object spiral trail
- Consumption pulse
- Growth shock ring
- Combo escalation accent
- Score popup
- Countdown pulse
- Level-complete celebration
- Fail state fade
- Newly eligible object pulse
- Cartoon character poof

Surface-aware effects:

- Grass
- Concrete
- Dirt
- Wood
- Metal
- Water-edge spray where appropriate

Avoid expensive GPU particles on the mobile baseline. Provide reduced particle counts and simplified emitters by quality level.

---

## 14. Audio Design

All audio must be original, properly licensed, or generated specifically for the project. Include attribution and license records where required.

### Required sound categories

#### Hole
- Idle low vortex loop
- Movement layer driven by speed
- Size layer driven by radius
- Rim scrape or suction accent
- Growth swell

#### Consumption
- Tiny tick/pop
- Small whoosh and thump
- Medium suction drop
- Large bass impact
- Structure collapse sequence
- Vehicle-specific metal accent
- Tree/wood accent
- Cartoon character poof
- Combo-rise stinger

#### UI
- Hover
- Confirm
- Back
- Locked
- Countdown
- Pause
- Star reveal
- New record
- Unlock
- Success
- Failure

#### Ambience
- Park
- Residential
- Market
- Construction
- Boardwalk
- Downtown
- Transit
- Industrial
- Stadium
- Harbor

### Music

Create four original loopable gameplay tracks plus menu and results music.

Requirements:

- Music must support seamless looping
- Increase intensity during the final 30 seconds
- Duck appropriately under major feedback sounds
- Do not restart the track on every small UI transition
- Provide independent Music, SFX, Ambience, and UI volume sliders

Use Sound Cues for stable randomized sample playback. MetaSounds may be used for gameplay-driven procedural vortex layers or randomized consumption variation, but provide a conventional fallback if the chosen engine revision presents shipping risk.

### Spatial and tactile feedback

- Use attenuation for world sounds
- Keep primary score and growth feedback centered and readable
- Add mobile vibration and gamepad rumble by absorption size
- Provide independent haptic toggle

---

## 15. UI and UX

Use UMG. Use Common UI only where its cross-platform navigation and layered-screen routing provide clear value.

### Required screens

- Splash/loading
- Main menu
- Mode select
- Campaign world map
- Level select
- Hole skin select
- Settings
- Credits/licenses
- Gameplay HUD
- Pause
- Tutorial overlays
- Results
- New unlock popup
- Confirmation dialogs

### HUD

Display:

- Current score
- Score target or objective
- Timer
- Growth progress
- Current tier
- Combo multiplier and remaining combo window
- Arena rank when applicable
- Pause button on touch devices
- Contextual tutorial prompt

### Results

Display:

- Success/failure
- Final score
- Stars earned
- Previous best comparison
- Best time if relevant
- New unlocks
- Retry
- Next level
- Level select
- Main menu

### Responsive behavior

- Support common 16:9, 16:10, 18:9, 19.5:9, and 20:9 layouts
- Respect safe zones and notches
- Scale cleanly from 720p to 4K
- Support mouse, keyboard, gamepad, and touch navigation
- Detect active input method and update prompts

### Accessibility

Include:

- Text-size option
- Reduced motion
- Camera shake toggle
- Haptics toggle
- High-contrast objective indicators
- Color-independent icons and shapes
- Left-handed touch layout
- Remappable keyboard/gamepad inputs
- Master, Music, SFX, Ambience, and UI volume
- Pause timer during blocking tutorial overlays
- No critical information conveyed only by sound

Use event-driven widget updates rather than frame-by-frame property bindings for frequently changing gameplay values.

---

## 16. Progression and Save System

Create versioned SaveGame classes.

Persist:

- Unlocked worlds and levels
- Stars per level
- Best score per level
- Best time per level
- Endless high score
- Arena difficulty preference
- Unlocked and selected hole skins
- Settings
- Input preferences
- Tutorial completion
- Save schema version

Requirements:

- Use asynchronous saving for normal progression writes
- Save after level results, settings changes, unlocks, and clean mode exit
- Provide a safe default if the save is missing or corrupted
- Add migration logic for future schema versions
- Never reset progress because a new optional field is absent
- Include a “Reset Progress” confirmation flow

---

## 17. Data-Driven Content Architecture

Create:

- `DA_LevelDefinition`
- `DA_AbsorptionProfile`
- `DA_HoleSkin`
- `DT_LevelBalance`
- `DT_ObjectBalance`
- `Curve_HoleRadiusByGrowthXP`
- `Curve_CameraDistanceByRadius`
- `Curve_MoveSpeedByRadius`
- `Curve_ScoreByMass`
- `Curve_AIValueByDistance`

Suggested Gameplay Tags:

- `Absorb.Tier.Tiny`
- `Absorb.Tier.Small`
- `Absorb.Tier.Medium`
- `Absorb.Tier.Large`
- `Absorb.Tier.Structure`
- `Absorb.Tier.Landmark`
- `Absorb.Type.Vehicle`
- `Absorb.Type.Character`
- `Absorb.Type.Tree`
- `State.Candidate`
- `State.Capturing`
- `State.Consumed`
- `Surface.Concrete`
- `Surface.Grass`
- `Surface.Dirt`
- `Surface.Wood`
- `Surface.Metal`
- `GameMode.Campaign`
- `GameMode.Arena`
- `GameMode.Endless`

A designer must be able to add a new object by:

1. Creating or reusing an absorption profile.
2. Assigning a mesh and simple collision.
3. Setting fit radius, mass/score values, and feedback assets.
4. Placing it in a level.
5. Running the validation tool.

No central gameplay graph should require editing for a normal new object.

---

## 18. Major Runtime Classes

Create or equivalent:

- `AGM_GameModeBase`
- `AGM_CampaignGameMode`
- `AGM_ArenaGameMode`
- `AGM_EndlessGameMode`
- `AGM_HolePawn`
- `AGM_HolePlayerController`
- `AGM_HoleAIController`
- `AGM_AbsorbableActor`
- `UGM_AbsorbableComponent`
- `UGM_HoleCaptureComponent`
- `UGM_ProgressionSubsystem`
- `UGM_AudioSubsystem`
- `UGM_PoolSubsystem`
- `UGM_SettingsSubsystem`
- `UGM_LevelObjectiveComponent`
- `UGM_SaveGame`
- `UGM_LevelDefinition`
- `UGM_AbsorptionProfile`
- `UGM_HoleSkinDefinition`

Blueprint children handle art, level-specific behavior, and tuning.

Use event dispatchers/delegates for:

- Score changed
- Growth changed
- Tier changed
- Combo changed
- Timer changed
- Objective changed
- Object committed
- Object consumed
- Level completed
- Level failed
- Input method changed
- Settings changed

---

## 19. Folder Structure

Use a clean project structure:

```text
Content/GravityMaw/
  Art/
    Characters/
    Environments/
    Hole/
    Props/
    UI/
  Audio/
    Ambience/
    Music/
    SFX/
    UI/
  Blueprints/
    AI/
    Core/
    GameModes/
    Interactables/
    Levels/
    Pawns/
    UI/
  Data/
    Curves/
    DataAssets/
    DataTables/
    Tags/
  FX/
    Materials/
    Niagara/
  Input/
  Maps/
    Campaign/
    Arena/
    Endless/
    Frontend/
    Tests/
  Tests/
  Developer/
Source/GravityMaw/
  AI/
  Core/
  Gameplay/
  Save/
  Tests/
  UI/
```

Do not place production logic in Level Blueprints except simple level-specific hookups. Core logic belongs in reusable classes or components.

---

## 20. Optimization Requirements

- No idle Tick on absorbable actors
- Central throttled candidate evaluation
- Sleeping physics until capture
- Simple collision shapes
- Pool score popups, common Niagara systems, and frequently reused temporary actors
- Limit simultaneous structure effects
- Use LODs and cull distances
- Use instancing for decorative repeated meshes
- Keep collision disabled on distant decorative-only actors
- Profile packaged Development and Shipping builds, not only PIE
- Use `stat unit`, Unreal Insights, GPU profiling, and on-device Android testing
- Provide a performance map with 500 objects and automated capture waves
- Ensure the material mask is used through a shared material function rather than duplicated logic
- Minimize dynamic material-instance updates; use the Material Parameter Collection for global hole data
- Use event-driven UMG updates
- Avoid destroying and recreating high-cost effects repeatedly when pooling is appropriate
- Provide quality-switch branches for particles, shadows, post effects, and audio concurrency

---

## 21. Editor Tools and Validation

Create an editor validation utility that reports:

- Absorbable actor missing profile
- Missing simple collision
- Fit radius of zero
- Invalid mass or score
- Missing primary primitive component
- Structure profile without proxy
- Object tier outside level’s allowed range
- Ground actor not using `HoleFloor`
- Ground material missing `MF_HoleMask`
- Duplicate level IDs
- Missing star thresholds
- Missing objective target actor
- Hole skin missing required material or icon

Provide optional debug visualizations:

- Visible hole radius
- Effective fit radius
- Candidate sensor
- Capture sensor
- Bounds footprint
- Footprint sockets
- Capture ownership
- AI target
- Collision response state
- Current tier and score value

Debug visuals must be excluded from Shipping builds.

---

## 22. Testing Requirements

Use Unreal Functional Tests and automation where practical.

### Core functional tests

1. Tiny eligible object is captured and scored once.
2. Object larger than the hole is not captured.
3. Object touching the rim but not fully inside is not captured.
4. Object becomes eligible immediately after a growth event.
5. Fit-radius override changes eligibility correctly.
6. Footprint-socket object requires every point inside.
7. Captured object ignores only `HoleFloor`.
8. Canceled capture restores original collision and physics.
9. Kill-volume completion awards score once.
10. Capture timeout force-completes safely.
11. Two holes cannot claim the same object.
12. Object destroyed externally during capture clears references.
13. Pause stops timer and movement.
14. Level success saves stars and records.
15. Corrupt or missing save creates safe defaults.
16. Input can switch between keyboard, gamepad, and touch.
17. AI uses the same fit test as the player.
18. Arena ranking updates correctly.
19. Reduced-motion setting suppresses strong camera feedback.
20. All campaign maps load without missing references.

### Stress tests

- 500 idle absorbables
- 100 candidates near the player
- 20 simultaneous captures
- Rapid level restart 20 times
- Repeated save/load cycles
- Android suspend/resume
- Resolution and safe-zone changes
- Low-memory device profile
- Four active hole masks

### Manual QA matrix

Test every level on:

- Keyboard/mouse
- Gamepad
- Touch
- Low, Medium, and High settings
- At least one midrange Android device
- Windowed, fullscreen, and common ultrawide/mobile aspect ratios

---

## 23. Build and Delivery

Deliver:

- Complete Unreal Engine project
- Source code
- All Blueprints
- All original or licensed assets
- Windows Shipping build
- Android App Bundle or APK as agreed
- Configuration files and device profiles
- Save schema documentation
- Gameplay-system architecture document
- Absorbable-object authoring guide
- Level-authoring guide
- Audio and asset license manifest
- Automated-test instructions
- Manual QA checklist
- Known limitations
- Performance report for representative PC and Android hardware
- Changelog
- README with exact setup, build, and packaging steps

The project must open without missing plugins or external marketplace dependencies.

---

## 24. Development Milestones

### Milestone 1 — Core Prototype

- Player movement
- Camera
- Single masked hole
- Dedicated floor channel
- One absorbable base actor
- Fit test
- Physics Drop capture
- Score and growth
- Debug visualization

Exit criterion: ten mixed-size objects behave correctly with no duplicate scoring.

### Milestone 2 — Vertical Slice

- Polished Pocket Park level
- Tutorial
- HUD
- Menu, pause, and results
- Audio and VFX baseline
- Save progression
- Touch and gamepad controls
- Performance baseline

Exit criterion: Level 1 is shippable-quality from launch to results.

### Milestone 3 — Content Systems

- Guided Sink and Structure Collapse Proxy
- Data-driven profiles
- Campaign level framework
- Objective system
- Star scoring
- Hole skins
- Validation tools

Exit criterion: designers can add objects and levels without modifying core code.

### Milestone 4 — Full Campaign

- All twelve campaign levels
- Balance pass
- Complete environment set
- Complete audio/VFX set
- Accessibility and settings
- Android optimization

Exit criterion: campaign is finishable with persistent progression.

### Milestone 5 — Arena and Endless

- Three AI rivals
- Four-hole material support
- Arena ranking
- Endless mode
- Additional balance and performance work

Exit criterion: all three game modes are complete and stable.

### Milestone 6 — QA and Release Candidate

- Automated tests
- Full manual QA
- Packaged builds
- Save migration test
- Performance report
- Documentation
- Bug fixing and polish

Exit criterion: all acceptance criteria pass.

---

## 25. Acceptance Criteria and Definition of Done

The project is complete only when all of the following are true:

- The ground visually opens under every active hole without runtime terrain deformation.
- Eligible objects fall or sink through the opening while ineligible objects remain supported.
- The fit test is based on the object’s complete footprint, not only its pivot.
- Captured objects change only the dedicated floor collision response unless their profile requires otherwise.
- Objects cannot score twice or be owned by two holes.
- Growth, sensor size, visual radius, camera zoom, and material radius stay synchronized.
- Small objects use convincing controlled physics.
- Large structures use deterministic optimized proxies rather than unstable full-building simulation.
- All twelve campaign levels can be launched, completed, failed, retried, and progressed through.
- Arena mode works with three fair AI rivals.
- Endless mode saves a local high score.
- Menus, HUD, pause, results, settings, tutorial, credits, and unlock flows are complete.
- Progress and settings persist across sessions.
- Keyboard/mouse, gamepad, and touch are fully supported.
- Audio, VFX, haptics, and camera feedback scale with object size.
- Accessibility settings work and persist.
- Windows and Android packaged builds launch without missing content.
- Mobile quality settings materially reduce cost.
- Automated core tests pass.
- The project includes no copied proprietary content and no undocumented paid dependency.
- Documentation is sufficient for another developer to add an object, create a level, rebalance growth, package the game, and diagnose the capture system.

---

## 26. Implementation Rules for the Development Agent

- Do not stop at mockups, pseudocode, placeholder buttons, or disconnected demo maps.
- Do not claim a feature is complete until it is connected to the full user flow and tested.
- Implement one authoritative source of truth for hole radius, score, growth, timer, and capture ownership.
- Prefer reusable components and data assets over duplicated Blueprint graphs.
- Keep Blueprints organized with named functions, comments, categories, and limited graph size.
- Never use arbitrary delays as the primary synchronization mechanism.
- Avoid Level Blueprint gameplay logic.
- Add logging for capture state transitions in Development builds.
- Include clear errors when required content is missing.
- Commit work in coherent milestones.
- At the end of each milestone, provide:
  - What was implemented
  - Files/classes/assets created
  - Tests run
  - Performance observations
  - Known issues
  - Exact next steps
- When a requirement conflicts with platform performance, preserve gameplay correctness first, then provide a scalable visual substitute.
- Ask for clarification only when a decision would materially alter scope, cost, platform support, or the player experience. Otherwise choose the most conservative production-ready interpretation and document it.
