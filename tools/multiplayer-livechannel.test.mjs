// TDD Unit Test: LiveBroadcastChannel Queueing Behavior
import assert from 'node:assert/strict';
import { LiveBroadcastChannel, _setRealtimeClientForTest } from '../js/multiplayer/channel.js';
import { MSG_TYPES, createJoinRequest } from '../js/multiplayer/protocol.js';

console.log('Testing LiveBroadcastChannel queueing...');

// Mock the RealtimeClient globally before instantiating LiveBroadcastChannel
let sentMessages = [];
let subscribedCallback = null;

global.window = {}; // Bypass the window check

// We need to inject a mock RealtimeClient
class MockChannel {
  on(type, filter, callback) {
    return this;
  }
  subscribe(callback) {
    subscribedCallback = callback;
    return this;
  }
  send(payload) {
    sentMessages.push(payload);
    return Promise.resolve();
  }
}

class MockClient {
  channel(name, opts) {
    return new MockChannel();
  }
  removeChannel() {}
}

_setRealtimeClientForTest(new MockClient());

const liveChannel = new LiveBroadcastChannel('TESTROOM', 'peer1');

// Broadcast before SUBSCRIBED
const joinReq = { type: MSG_TYPES.JOIN_REQUEST, name: 'Alice', skin: 'default', senderId: 'peer1' };
liveChannel.broadcast(joinReq);

assert.equal(sentMessages.length, 0, 'Should not send over network before SUBSCRIBED');
assert.equal(liveChannel._queuedBroadcasts.length, 1, 'Message should be queued');

// Simulate Realtime SUBSCRIBED event
subscribedCallback('SUBSCRIBED');

assert.equal(sentMessages.length, 1, 'Queue should be flushed upon SUBSCRIBED');
assert.equal(liveChannel._queuedBroadcasts.length, 0, 'Queue should be empty');

// Broadcast after SUBSCRIBED
liveChannel.broadcast({ type: MSG_TYPES.LOBBY_CHAT, text: 'Hello' });
assert.equal(sentMessages.length, 2, 'Should send immediately after SUBSCRIBED');

console.log('✓ LiveBroadcastChannel queueing test PASSED');
