// tools/tutorial.test.mjs — Automated unit & contract tests for the Just-in-Time Milestone Onboarding System.
// Run: node tools/tutorial.test.mjs

import assert from 'node:assert';
import {
  TutorialManager,
  CONTEXTUAL_HINTS,
  shouldShowTutorial,
} from '../js/ui/tutorial.js';

export function runTutorialSelftest() {
  let passed = 0;
  function test(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      throw err;
    }
  }

  // 1. Eligibility Gate
  test('shouldShowTutorial triggers on first level (gallery) when tutorial is not completed', () => {
    const freshSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    assert.strictEqual(shouldShowTutorial(freshSave, 'gallery'), true, 'Fresh save on gallery must show onboarding');
    assert.strictEqual(shouldShowTutorial(freshSave, 'sydney'), false, 'Other cities must not force initial onboarding');

    const completedSave = { tutorialCompleted: true, settings: { tutorialHints: true } };
    assert.strictEqual(shouldShowTutorial(completedSave, 'gallery'), false, 'Completed save must not re-trigger');
  });

  // 2. Just-In-Time Milestone Triggers
  test('TutorialManager triggers initial Start Eating Blocks bubble on start', () => {
    let saved = null;
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({
      save: mockSave,
      scene: 'gallery',
      onSave: (s) => { saved = s; },
    });

    assert.strictEqual(tm.isActive(), true);
    assert.strictEqual(tm.hasShown('start'), true, 'Start bubble must be marked shown');
  });

  test('TutorialManager triggers Size 2 Growth Milestone modal on first reaching Size 2', () => {
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });

    assert.strictEqual(tm.hasShown('size2'), false);
    tm.onSizeUp(2);
    assert.strictEqual(tm.hasShown('size2'), true, 'Size 2 milestone must trigger when reaching size 2');

    // Repeated size-up must not duplicate milestone modal
    tm.onSizeUp(2);
    assert.strictEqual(tm.milestoneCounts.size2, 1, 'Size 2 milestone should only trigger once');
  });

  test('TutorialManager triggers 4x Combo Momentum explanation callout on reaching 4x combo', () => {
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });

    tm.onCombo(2);
    assert.strictEqual(tm.hasShown('combo4'), false, '2x combo should not trigger 4x combo modal');

    tm.onCombo(4);
    assert.strictEqual(tm.hasShown('combo4'), true, '4x combo must trigger combo momentum callout');
  });

  test('TutorialManager triggers Building Collapse callout on first structural crash', () => {
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });

    assert.strictEqual(tm.hasShown('collapse'), false);
    tm.onCollapse();
    assert.strictEqual(tm.hasShown('collapse'), true, 'Collapse milestone must trigger on building collapse');
  });

  test('TutorialManager completes and marks save when milestones are finished or skipped', () => {
    let saveMutated = false;
    const mockSave = { tutorialCompleted: false, milestones: {} };
    const tm = new TutorialManager({
      save: mockSave,
      scene: 'gallery',
      onSave: () => { saveMutated = true; },
    });

    tm.skip();
    assert.strictEqual(tm.isActive(), false);
    assert.strictEqual(mockSave.tutorialCompleted, true);
  });

  // 3. Contextual Tooltips for foreign mechanics
  test('CONTEXTUAL_HINTS contains bump alerts for oversized objects', () => {
    assert(CONTEXTUAL_HINTS.too_big, 'Must have too_big hint');
    assert(typeof CONTEXTUAL_HINTS.too_big.text === 'string');
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('tutorial.test.mjs')) {
  console.log('--- Validating Just-in-Time Milestone Onboarding System ---');
  const count = runTutorialSelftest();
  console.log(`\nALL PASS. ${count} milestone onboarding tests passing cleanly!`);
}
