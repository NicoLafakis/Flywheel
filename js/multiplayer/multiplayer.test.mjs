// js/multiplayer/multiplayer.test.mjs — Automated Test Suite for Multiplayer & Multi-Hole Systems
// Run: node js/multiplayer/multiplayer.test.mjs

import { VoxelSandboxSim, COMBO_WINDOW } from '../voxelsim.js';
import { MultiplayerHost } from './host.js';
import { MultiplayerPeer } from './peer.js';
import { InMemoryChannelHub } from './channel.js';
import { getShopItemsByCategory } from '../upgrades.js';
import { readFileSync } from 'node:fs';

const DT = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.error('  FAIL: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

console.log('--- 1. VoxelSandboxSim localSlot & localHole ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery',
    holes: [
      { slot: 0, x: 0, z: 0, name: 'Host' },
      { slot: 1, x: 10, z: 10, name: 'Peer 1' },
      { slot: 2, x: -10, z: -10, name: 'Peer 2' },
    ],
  });

  if (sim.localSlot !== 0) fail(`sim.localSlot default should be 0, got ${sim.localSlot}`);
  else ok('sim.localSlot defaults to 0');

  if (sim.localHole !== sim.holes[0]) fail('sim.localHole is not sim.holes[0] when localSlot is 0');
  else ok('sim.localHole returns sim.holes[0] when localSlot is 0');

  if (sim.hole !== sim.holes[0]) fail('sim.hole is not sim.holes[0]');
  else ok('sim.hole remains sim.holes[0] for backward compatibility');

  sim.localSlot = 2;
  if (sim.localHole !== sim.holes[2]) fail(`sim.localHole is not sim.holes[2] when localSlot is 2`);
  else ok('sim.localHole dynamically returns sim.holes[2] when localSlot is set to 2');
}

console.log('\n--- 2. MultiplayerHost & MultiplayerPeer localSlot binding ---');
{
  const hub = new InMemoryChannelHub();
  const hostChannel = hub.createChannel('TEST1', 'host');
  const peerChannel = hub.createChannel('TEST1', 'peer_1');

  const players = [
    { slot: 0, senderId: 'host', name: 'Host', skin: 'classic', color: '#00f0ff' },
    { slot: 1, senderId: 'peer_1', name: 'Peer 1', skin: 'baseline-crimson', color: '#ff0054' },
  ];

  const host = new MultiplayerHost({
    channel: hostChannel,
    scene: 'gallery',
    matchSeed: 12345,
    players,
  });

  if (host.sim.localSlot !== 0) fail(`host.sim.localSlot should be 0, got ${host.sim.localSlot}`);
  else ok('host.sim.localSlot is correctly bound to 0');

  const peer = new MultiplayerPeer({
    channel: peerChannel,
    scene: 'gallery',
    matchSeed: 12345,
    players,
    mySlot: 1,
  });

  if (peer.sim.localSlot !== 1) fail(`peer.sim.localSlot should be 1, got ${peer.sim.localSlot}`);
  else ok('peer.sim.localSlot is correctly bound to mySlot (1)');

  if (peer.myHole !== peer.sim.holes[1]) fail('peer.myHole does not point to peer.sim.holes[1]');
  else ok('peer.myHole correctly references peer.sim.holes[1]');

  if (peer.sim.localHole !== peer.sim.holes[1]) fail('peer.sim.localHole does not point to peer.sim.holes[1]');
  else ok('peer.sim.localHole correctly returns peer.sim.holes[1]');

  // Test host onGameOver callback firing
  let hostGameOverFired = false;
  host.onGameOver = (data) => {
    hostGameOverFired = true;
    if (data.reason !== 'TIME_EXPIRED') fail(`Expected reason TIME_EXPIRED, got ${data.reason}`);
    if (!Array.isArray(data.finalLeaderboard) || data.finalLeaderboard.length !== 2) {
      fail('finalLeaderboard missing or incorrect length in host onGameOver');
    }
  };

  host.finishMatch('TIME_EXPIRED');
  if (!hostGameOverFired) fail('MultiplayerHost.finishMatch did not fire host.onGameOver callback');
  else ok('MultiplayerHost.finishMatch correctly invoked host.onGameOver');

  host.destroy();
  peer.destroy();
}

console.log('\n--- 3. PvP Hole Swallowing & Respawn Interaction ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery',
    holes: [
      { slot: 0, x: 0, z: 0, name: 'Big Hole' },
      { slot: 1, x: 1.0, z: 1.0, name: 'Small Hole' },
    ],
  });

  const h0 = sim.holes[0];
  const h1 = sim.holes[1];

  // Make h0 significantly larger than h1
  h0.radius = 4.0;
  h0.size = 5;
  h0.mass = 2000;
  h0.rawMass = 2000;

  h1.radius = 1.5;
  h1.size = 1;
  h1.mass = 500;
  h1.rawMass = 500;

  // Run one step where h0 touches h1
  sim.step(DT, [null, null]);

  if (h1.alive !== false) fail('h1 was not swallowed by h0');
  else ok('h1 was swallowed by larger h0 in PvP collision');

  if (h1.respawnTimer <= 0) fail(`h1 respawnTimer should be set (got ${h1.respawnTimer})`);
  else ok(`h1 respawnTimer initialized to ${h1.respawnTimer}s`);

  if (h0.kills !== 1) fail(`h0 kills should be 1 (got ${h0.kills})`);
  else ok('h0 kills incremented to 1');

  const pvpKillEvent = sim.events.find((e) => e.type === 'pvp_kill');
  if (!pvpKillEvent) fail('pvp_kill event was not emitted in sim.events');
  else ok(`pvp_kill event emitted with awardMass ${pvpKillEvent.awardMass}`);

  // Fast-forward 10 seconds of simulation to verify respawn
  for (let i = 0; i < 10.5 * 60; i++) {
    sim.step(DT, [null, null]);
  }

  if (h1.alive !== true) fail('h1 did not respawn after 10 seconds');
  else ok('h1 successfully respawned after 10-second timeout');

  if (h1.radius > 2.0 || h1.size !== 1) fail(`h1 should reset to SIZE 1 / start radius upon respawn (got size ${h1.size}, radius ${h1.radius})`);
  else ok('h1 correctly reset to SIZE 1 and base radius upon respawn');
}

console.log('\n--- 4. Seven 0-Cost Basic Color Skins Registration ---');
{
  const skinsSrc = readFileSync(new URL('../skins.js', import.meta.url), 'utf8');
  const skinsBlock = skinsSrc.slice(skinsSrc.indexOf('export const SKINS = ['), skinsSrc.indexOf('export const SKIN_BY_ID'));
  const rawSkinItems = skinsBlock.split(/\{\s*id:\s*['"]/g).slice(1);
  const skinsParsed = rawSkinItems.map((chunk) => {
    const id = chunk.slice(0, chunk.indexOf("'"));
    const nameMatch = chunk.match(/name:\s*['"]([^'"]+)['"]/);
    const priceMatch = chunk.match(/price:\s*(\d+)/);
    const familyMatch = chunk.match(/family:\s*['"]([^'"]+)['"]/);
    return {
      id,
      name: nameMatch ? nameMatch[1] : id,
      price: priceMatch ? Number(priceMatch[1]) : 0,
      family: familyMatch ? familyMatch[1] : undefined,
    };
  });

  const expectedNewSkins = [
    { id: 'baseline-cyan', name: 'Baseline Cyan' },
    { id: 'baseline-crimson', name: 'Baseline Crimson' },
    { id: 'baseline-amber', name: 'Baseline Amber' },
    { id: 'baseline-emerald', name: 'Baseline Emerald' },
    { id: 'baseline-purple', name: 'Baseline Purple' },
    { id: 'baseline-orange', name: 'Baseline Orange' },
    { id: 'baseline-magenta', name: 'Baseline Magenta' },
  ];

  for (const exp of expectedNewSkins) {
    const skin = skinsParsed.find((s) => s.id === exp.id);
    if (!skin) {
      fail(`Skin ${exp.id} (${exp.name}) not found in skins.js`);
      continue;
    }
    if (skin.price !== 0) {
      fail(`Skin ${exp.id} should cost 0 coins, got ${skin.price}`);
    }
  }

  const shopItems = getShopItemsByCategory('skins', { save: { equippedSkin: 'classic', ownedItems: [] }, skins: skinsParsed });
  for (const exp of expectedNewSkins) {
    const item = shopItems.find((s) => s.id === exp.id);
    if (!item) {
      fail(`Shop item for ${exp.id} not found in category 'skins'`);
    } else if (!item.isOwned) {
      fail(`Shop item ${exp.id} should be automatically owned (isOwned === true)`);
    }
  }

  if (failures === 0) ok('All 7 new basic color skins are registered, cost 0, and are automatically owned');
}

console.log('\n--- 5. Per-Player Coin Attribution & Isolation ---');
{
  const sim = new VoxelSandboxSim({
    scene: 'gallery',
    bounds: 40,
    holes: [
      { x: -10, z: 0, slot: 0, name: 'Host' },
      { x: 10, z: 0, slot: 1, name: 'Peer' },
    ],
  });

  const h0 = sim.holes[0];
  const h1 = sim.holes[1];

  if (h0.coinsCollected !== 0 || h0.coins !== 0) fail(`h0 should initialize with 0 coinsCollected and 0 coins (got ${h0.coinsCollected}, ${h0.coins})`);
  else ok('h0 initialized with 0 coins');

  if (h1.coinsCollected !== 0 || h1.coins !== 0) fail(`h1 should initialize with 0 coinsCollected and 0 coins (got ${h1.coinsCollected}, ${h1.coins})`);
  else ok('h1 initialized with 0 coins');

  // Place a coin right on top of h1 and away from h0
  sim.coins = [
    { x: 10, z: 0, id: 0, collected: false },
    { x: 10.2, z: 0.1, id: 1, collected: false },
  ];
  sim.coinValue = 2;

  sim.step(1 / 60, [{ x: 0, z: 0 }, { x: 0, z: 0 }]);

  if (h1.coinsCollected !== 2 || h1.coins !== 4) fail(`h1 should have collected 2 coins (4 value), got ${h1.coinsCollected} coins (${h1.coins} val)`);
  else ok('h1 correctly collected 2 coins (4 coin value)');

  if (h0.coinsCollected !== 0 || h0.coins !== 0) fail(`h0 should still have 0 coins (got ${h0.coinsCollected}, ${h0.coins})`);
  else ok('h0 strictly retained 0 coins (no cross-player coin leakage)');
}

console.log('\n--- 6. 10-Second Combo Window & Decay Lifecycle ---');
{
  if (COMBO_WINDOW !== 10.0) fail(`COMBO_WINDOW must be exactly 10.0s, got ${COMBO_WINDOW}`);
  else ok('COMBO_WINDOW is configured to 10.0 seconds');

  const sim = new VoxelSandboxSim({
    scene: 'gallery',
    bounds: 2000,
    holes: [{ x: 999, z: 999, slot: 0 }],
  });
  const h = sim.holes[0];

  // Feed an object to start a chain
  h.chain = 0;
  h.chainTimer = 0;
  sim._award(h, 10, { id: 9999 });

  if (h.chain !== 1) fail(`Expected chain 1 after eat, got ${h.chain}`);
  if (Math.abs(h.chainTimer - 10.0) > 0.001) fail(`Expected chainTimer 10.0 after eat, got ${h.chainTimer}`);
  else ok('Eating initializes chainTimer to 10.0s');

  // Step 4.0s (timer should reach 6.0s - normal state)
  for (let i = 0; i < 240; i++) sim.step(1 / 60, [{ x: 0, z: 0 }]);
  if (h.chainTimer > 6.1 || h.chainTimer < 5.9) fail(`Expected chainTimer ~6.0s, got ${h.chainTimer}`);
  else ok('Timer decays normally to 6.0s');

  // Step 2.0s more (timer should reach 4.0s - warning state <= 5.0s)
  for (let i = 0; i < 120; i++) sim.step(1 / 60, [{ x: 0, z: 0 }]);
  if (h.chainTimer > 4.1 || h.chainTimer < 3.9) fail(`Expected chainTimer ~4.0s, got ${h.chainTimer}`);
  else ok('Timer reaches warning window at 4.0s (<= 5.0s)');

  // Step 2.0s more (timer should reach 2.0s - urgent state <= 3.0s)
  for (let i = 0; i < 120; i++) sim.step(1 / 60, [{ x: 0, z: 0 }]);
  if (h.chainTimer > 2.1 || h.chainTimer < 1.9) fail(`Expected chainTimer ~2.0s, got ${h.chainTimer}`);
  else ok('Timer reaches urgent window at 2.0s (<= 3.0s)');

  // Step 2.5s more (timer expires <= 0, chain resets to 0)
  for (let i = 0; i < 150; i++) sim.step(1 / 60, [{ x: 0, z: 0 }]);
  if (h.chain !== 0) fail(`Expected chain to reset to 0 upon timer expiry, got ${h.chain}`);
  else ok('Chain resets cleanly to 0 upon timer expiry');
}

console.log('\n' + (failures === 0 ? 'PASS — all multiplayer tests passed.' : `FAIL — ${failures} assertion(s) failed.`));
process.exit(failures === 0 ? 0 : 1);

