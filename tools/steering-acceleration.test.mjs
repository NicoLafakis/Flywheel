import assert from 'node:assert/strict';
import { Controls, ORBIT_RATE } from '../js/controls.js';

console.log('Testing keyboard steering acceleration and smooth turning in Controls...');

// Mock canvas and DOM elements for standalone Node environment
globalThis.document = {
  getElementById: () => ({
    classList: { add: () => {}, remove: () => {} },
    style: {},
  }),
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1024,
};

const mockCanvas = {
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
};

const ctrl = new Controls(mockCanvas);

// 1. Initial State
assert.strictEqual(ctrl.heading, null, 'Initial heading must be null');

// 2. Tap Left (A) for 1 frame (1/60s)
ctrl.keys.add('KeyA');
ctrl.keys.add('KeyW');
const move1 = ctrl.getMove(0, 1 / 60);

assert.ok(ctrl.heading !== null, 'Heading must be initialized');
const headingAfter1Frame = ctrl.heading;
console.log(`Heading after 1 frame (16.7ms): ${(headingAfter1Frame * 180 / Math.PI).toFixed(2)} deg`);
// 1 frame should turn < 1.5 deg
assert.ok(Math.abs(headingAfter1Frame * 180 / Math.PI) < 1.5, 'Short tap must make smooth micro-adjustment');

// 3. Hold for 30 frames (0.5s)
let prevHeading = headingAfter1Frame;
const rates = [];
for (let i = 0; i < 30; i++) {
  ctrl.getMove(0, 1 / 60);
  const delta = ctrl.heading - prevHeading;
  rates.push(delta / (1 / 60)); // rad/s
  prevHeading = ctrl.heading;
}

console.log(`Steering turn rate at t=0.1s: ${(rates[5] * 180 / Math.PI).toFixed(1)} deg/s`);
console.log(`Steering turn rate at t=0.3s: ${(rates[17] * 180 / Math.PI).toFixed(1)} deg/s`);
console.log(`Steering turn rate at t=0.5s: ${(rates[29] * 180 / Math.PI).toFixed(1)} deg/s`);

assert.ok(rates[29] > rates[5], 'Turn rate must accelerate the longer key is held');
assert.ok(rates[5] < 120 * Math.PI / 180, 'Initial turn rate must be smooth');

// 4. Release and change direction to Right (D)
ctrl.keys.delete('KeyA');
ctrl.keys.add('KeyD');
ctrl.getMove(0, 1 / 60); // 1 frame right
const rightRate1 = (ctrl.heading - prevHeading) / (1 / 60);
console.log(`Turn rate immediately upon direction switch: ${(rightRate1 * 180 / Math.PI).toFixed(1)} deg/s`);
assert.ok(Math.abs(rightRate1) < rates[29], 'Direction switch must reset acceleration to base rate');

console.log('✓ All steering acceleration assertions passed!');
