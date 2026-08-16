// tools/cinematic-vfx-selftest.mjs — Test suite for High-Intensity Cinematic VFX & Civil Emergency Disasters
// Validates pure-sim config, WebAudio synthesis hooks, 3D WebGL dynamic lighting/shockwaves,
// and screen-space cinematic overlays while guaranteeing removal of outdated anime/pokemon tropes.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { POWERUP_TYPES, POWERUP_SPECS } from '../js/powerups.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [main, screens, voxelWorld, world3d, audioEngine, gameAudio, css] = await Promise.all([
  read('js/main.js'),
  read('js/ui/screens.js'),
  read('js/voxelworld.js'),
  read('js/world3d.js'),
  read('js/audio/engine.js'),
  read('js/audio/game-audio.js'),
  read('css/main.css'),
]);

console.log('Testing Power-Up Specs & Pure Sim Boundary...');

// 1. Power-Up Specs verification
for (const [key, spec] of Object.entries(POWERUP_SPECS)) {
  assert.ok(spec.id, `Spec for ${key} must have id`);
  assert.ok(spec.name, `Spec for ${key} must have name`);
  assert.ok(spec.tagline, `Spec for ${key} must have tagline`);
  assert.ok(spec.color != null, `Spec for ${key} must have color`);
  
  // Ensure legacy Pokemon/Dragonball fields are completely purged
  assert.strictEqual(spec.pokeType, undefined, `Spec ${key} must not contain pokeType`);
  assert.strictEqual(spec.pokeLevel, undefined, `Spec ${key} must not contain pokeLevel`);
  assert.strictEqual(spec.pokeRarity, undefined, `Spec ${key} must not contain pokeRarity`);
  assert.strictEqual(spec.animeSubtitle, undefined, `Spec ${key} must not contain animeSubtitle`);
}

console.log('✓ Power-Up specs are clean and free of legacy anime/pokemon fields');

console.log('Testing Screen-Space Cinematic Transformations & Emergency Disasters...');

// 2. Screen-Space UI & Method verification in screens.js
assert.ok(screens.includes('showSuperOverdriveTransformation('), 'screens must implement showSuperOverdriveTransformation');
assert.ok(screens.includes('showCivilDisasterEmergencyCinematic('), 'screens must implement showCivilDisasterEmergencyCinematic');
assert.ok(screens.includes('showOrbitalBeaconNotification('), 'screens must implement showOrbitalBeaconNotification');
assert.ok(!screens.includes('poke-wild-tag'), 'screens must NOT contain poke-wild-tag');
assert.ok(!screens.includes('DRAGON BALL ANIME POWER-UP'), 'screens must NOT contain DRAGON BALL ANIME text');
assert.ok(!screens.includes('DRAGON BALL SUPER SAIYAN QUAKE'), 'screens must NOT contain SUPER SAIYAN QUAKE text');

// Verification of high-end cinematic transformation overlay elements
assert.ok(screens.includes('overdrive-anamorphic-flare'), 'screens must contain overdrive-anamorphic-flare');
assert.ok(screens.includes('overdrive-chromatic-pulse'), 'screens must contain overdrive-chromatic-pulse');
assert.ok(screens.includes('overdrive-energy-aura'), 'screens must contain overdrive-energy-aura');
assert.ok(screens.includes('overdrive-card-title'), 'screens must contain overdrive-card-title');

// Verification of Direction 3 Civil Emergency elements
assert.ok(screens.includes('civil-emergency-ticker'), 'screens must contain civil-emergency-ticker');
assert.ok(screens.includes('civil-telemetry-badge'), 'screens must contain civil-telemetry-badge');

console.log('✓ Screen-space cinematic components verified');

console.log('Testing WebAudio Synthesis for Sub-Bass Drop & Siren...');

// 3. Audio synthesis methods
assert.ok(audioEngine.includes('playBassDrop('), 'audio engine must implement playBassDrop');
assert.ok(audioEngine.includes('playEnergyRiser('), 'audio engine must implement playEnergyRiser');
assert.ok(audioEngine.includes('playCivilEmergencySiren('), 'audio engine must implement playCivilEmergencySiren');
assert.ok(gameAudio.includes('playPowerUpTransformation('), 'gameAudio must implement playPowerUpTransformation');
assert.ok(gameAudio.includes('playCivilEmergencyDisaster('), 'gameAudio must implement playCivilEmergencyDisaster');

console.log('✓ WebAudio synthesis methods verified');

console.log('Testing WebGL 3D Dynamic Lighting & Shockwave Systems...');

// 4. WebGL Dynamic Lighting & 3D Shockwave in voxelworld.js and world3d.js
assert.ok(voxelWorld.includes('triggerTransformationLighting(') || voxelWorld.includes('_triggerPowerUpLighting('), 'voxelworld must support transformation lighting');
assert.ok(voxelWorld.includes('spawnShockwaveRing(') || voxelWorld.includes('_spawnShockwaveRing('), 'voxelworld must support 3D shockwave rings');
assert.ok(voxelWorld.includes('spawnOrbitalBeacon(') || voxelWorld.includes('_spawnOrbitalBeacon(') || voxelWorld.includes('orbitalBeacon'), 'voxelworld must support orbital beacon light pillars');

console.log('✓ 3D WebGL dynamic lighting, shockwaves, and beacons verified');

console.log('Testing CSS Shaders & Anamorphic Flares...');

// 5. CSS Rules
assert.ok(css.includes('.overdrive-anamorphic-flare'), 'css must define .overdrive-anamorphic-flare');
assert.ok(css.includes('.overdrive-chromatic-pulse'), 'css must define .overdrive-chromatic-pulse');
assert.ok(css.includes('.overdrive-energy-aura'), 'css must define .overdrive-energy-aura');
assert.ok(css.includes('.civil-emergency-overlay'), 'css must define .civil-emergency-overlay');
assert.ok(css.includes('.civil-emergency-ticker'), 'css must define .civil-emergency-ticker');

console.log('✓ High-end cinematic CSS shaders verified');

console.log('Testing main.js Coordinator Integration...');

// 6. Main integration
assert.ok(main.includes('playPowerUpCollectCinematic') || main.includes('playPowerUpTransformationCinematic'), 'main must coordinate powerup transformation');
assert.ok(main.includes('playEarthquakeCinematic') || main.includes('playCivilDisasterCinematic'), 'main must coordinate disaster cinematic');

console.log('\n========================================');
console.log('ALL CINEMATIC VFX & DISASTER TESTS PASS!');
console.log('========================================');
