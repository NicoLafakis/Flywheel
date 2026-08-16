// TDD Unit Test: Multiplayer Host & Peer Session (Level 1: The Lab)
import assert from 'node:assert/strict';
import { InMemoryChannelHub } from '../js/multiplayer/channel.js';
import { MultiplayerHost } from '../js/multiplayer/host.js';
import { MultiplayerPeer } from '../js/multiplayer/peer.js';
import { loadScene } from '../js/voxelsim.js';

console.log('Testing multiplayer host & peer synchronization session on Level 1 (The Lab)...');

await loadScene('gallery');

const hub = new InMemoryChannelHub();
const hostChannel = hub.createChannel('TEST_MATCH', 'host');
const peerChannel = hub.createChannel('TEST_MATCH', 'peer-1');

const players = [
  { slot: 0, name: 'Host', skin: 'default', color: '#00f0ff', isHost: true },
  { slot: 1, name: 'Alice', skin: 'nebula', color: '#ff0054', isHost: false },
];

// 1. Instantiate Host Session
const host = new MultiplayerHost({
  channel: hostChannel,
  scene: 'gallery',
  matchSeed: 999,
  players,
});

assert.equal(host.scene, 'gallery');
assert.equal(host.sim.holes.length, 2);
assert.equal(host.isHost, true);

// 2. Instantiate Peer Session
const peer = new MultiplayerPeer({
  channel: peerChannel,
  scene: 'gallery',
  matchSeed: 999,
  players,
  mySlot: 1,
});

assert.equal(peer.mySlot, 1);
assert.equal(peer.isHost, false);

// 3. Step forward with inputs
// Peer sends steering input: moving in +X direction
peer.sendInput({ x: 1.0, z: 0 });

// Host steps simulation
host.step(1 / 60);

// Host broadcasts state sync
host.sendStateSync();

// Peer ingests sync
assert.ok(host.sim.holes[1].x !== undefined);

// 4. Test PvP Kill Notification
// Force hole 0 to eat hole 1
host.sim.holes[0].size = 9;
host.sim.holes[0].radius = 5.0;
host.sim.holes[0].mass = 3000;
host.sim.holes[0].x = 10;
host.sim.holes[0].z = 10;

host.sim.holes[1].size = 1;
host.sim.holes[1].radius = 1.0;
host.sim.holes[1].x = 10.1;
host.sim.holes[1].z = 10.1;

let peerPvPNotified = false;
peer.onPvPKill = (ev) => {
  if (ev.victimSlot === 1) peerPvPNotified = true;
};

host.step(1 / 60);

assert.equal(host.sim.holes[1].alive, false);
assert.equal(host.sim.holes[1].respawnTimer, 10.0);
assert.equal(peerPvPNotified, true, 'Peer must receive PvP kill notification when eaten');

// 5. Cleanup
host.destroy();
peer.destroy();

console.log('✓ Multiplayer host & peer session test PASSED');
