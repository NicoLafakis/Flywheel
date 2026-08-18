// tools/tutorial.test.mjs — Automated unit & contract tests for the In-Game Tutorial & Onboarding System.
// Run: node tools/tutorial.test.mjs

import assert from 'node:assert';
import {
  TUTORIAL_STEPS,
  TutorialManager,
  CONTEXTUAL_HINTS,
  getTutorialStepDef,
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

  // 1. Step Definitions and Schema Integrity
  test('TUTORIAL_STEPS contains all 5 canonical steps with required fields', () => {
    assert(Array.isArray(TUTORIAL_STEPS), 'TUTORIAL_STEPS must be an array');
    assert.strictEqual(TUTORIAL_STEPS.length, 5, 'Must contain 5 sequential steps');

    const expectedIds = ['steer_props', 'size_growth', 'combo_chain', 'topple_buildings', 'powerup_beacons'];
    TUTORIAL_STEPS.forEach((step, idx) => {
      assert.strictEqual(step.id, expectedIds[idx], `Step index ${idx} must have id ${expectedIds[idx]}`);
      assert(typeof step.stepNum === 'number', 'stepNum must be a number');
      assert(typeof step.badge === 'string' && step.badge.length > 0, 'badge must be non-empty string');
      assert(typeof step.title === 'string' && step.title.length > 0, 'title must be non-empty string');
      assert(typeof step.instruction === 'string' && step.instruction.length > 0, 'instruction must be non-empty string');
      assert(typeof step.icon === 'string' && step.icon.length > 0, 'icon must be non-empty string');
    });
  });

  // 2. Tutorial Eligibility Gate
  test('shouldShowTutorial only triggers on first level (gallery) when tutorial is not completed', () => {
    const freshSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    assert.strictEqual(shouldShowTutorial(freshSave, 'gallery'), true, 'Fresh save on gallery must show tutorial');
    assert.strictEqual(shouldShowTutorial(freshSave, 'sydney'), false, 'Non-starter level must not force initial tutorial sequence');

    const completedSave = { tutorialCompleted: true, settings: { tutorialHints: true } };
    assert.strictEqual(shouldShowTutorial(completedSave, 'gallery'), false, 'Completed save must not re-trigger tutorial');

    const disabledSave = { tutorialCompleted: false, settings: { tutorialHints: false } };
    assert.strictEqual(shouldShowTutorial(disabledSave, 'gallery'), false, 'Disabled tutorial in settings must not trigger');
  });

  // 3. Tutorial State Machine & Progression
  test('TutorialManager starts at Step 1 and advances on small prop eats', () => {
    let saved = null;
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({
      save: mockSave,
      scene: 'gallery',
      onSave: (s) => { saved = s; },
    });

    assert.strictEqual(tm.isActive(), true);
    assert.strictEqual(tm.currentStepIndex, 0);
    assert.strictEqual(tm.currentStep.id, 'steer_props');

    // Eat 1 prop
    tm.onEat({ tier: 1, mass: 2 });
    assert.strictEqual(tm.currentStepIndex, 0, 'Should remain on step 1 after 1 prop');

    // Eat 2nd and 3rd prop
    tm.onEat({ tier: 1, mass: 2 });
    tm.onEat({ tier: 1, mass: 2 });
    assert.strictEqual(tm.currentStepIndex, 1, 'Should advance to step 2 (size_growth) after 3 small props');
    assert.strictEqual(tm.currentStep.id, 'size_growth');
  });

  test('TutorialManager advances from Step 2 to Step 3 on size-up or vehicle eat', () => {
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });
    tm.currentStepIndex = 1; // force step 2 (size_growth)

    tm.onSizeUp(2);
    assert.strictEqual(tm.currentStepIndex, 2, 'Should advance to step 3 (combo_chain) on reaching Size 2');
    assert.strictEqual(tm.currentStep.id, 'combo_chain');
  });

  test('TutorialManager advances from Step 3 to Step 4 on 3x combo chain', () => {
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });
    tm.currentStepIndex = 2; // step 3 (combo_chain)

    tm.onCombo(2);
    assert.strictEqual(tm.currentStepIndex, 2, '2x combo is not enough');

    tm.onCombo(3);
    assert.strictEqual(tm.currentStepIndex, 3, '3x combo advances to step 4 (topple_buildings)');
    assert.strictEqual(tm.currentStep.id, 'topple_buildings');
  });

  test('TutorialManager advances from Step 4 to Step 5 on structural collapse or reaching Size 3', () => {
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });
    tm.currentStepIndex = 3; // step 4 (topple_buildings)

    tm.onCollapse();
    assert.strictEqual(tm.currentStepIndex, 4, 'Collapse event advances to step 5 (powerup_beacons)');
    assert.strictEqual(tm.currentStep.id, 'powerup_beacons');
  });

  test('TutorialManager completes and marks save when final step is done or dismissed', () => {
    let saveMutated = false;
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({
      save: mockSave,
      scene: 'gallery',
      onSave: () => { saveMutated = true; },
    });
    tm.currentStepIndex = 4; // final step

    tm.onPowerUpCollected();
    assert.strictEqual(tm.isActive(), false, 'Tutorial should now be inactive/completed');
    assert.strictEqual(mockSave.tutorialCompleted, true, 'save.tutorialCompleted must be set to true');
    assert.strictEqual(saveMutated, true, 'onSave callback must have fired');
  });

  test('TutorialManager skip() immediately concludes tutorial and persists', () => {
    const mockSave = { tutorialCompleted: false, settings: { tutorialHints: true } };
    const tm = new TutorialManager({ save: mockSave, scene: 'gallery' });
    assert.strictEqual(tm.isActive(), true);

    tm.skip();
    assert.strictEqual(tm.isActive(), false);
    assert.strictEqual(mockSave.tutorialCompleted, true);
  });

  // 4. Contextual Tooltip Messages
  test('CONTEXTUAL_HINTS contains definitions for oversized bumps and power-up types', () => {
    assert(CONTEXTUAL_HINTS.too_big, 'Must have too_big hint');
    assert(typeof CONTEXTUAL_HINTS.too_big.text === 'string');

    const expectedPowerups = ['magnet', 'freeze', 'speed', 'titan', 'quake'];
    expectedPowerups.forEach((pu) => {
      assert(CONTEXTUAL_HINTS[`powerup_${pu}`], `Must have hint for powerup_${pu}`);
      assert(typeof CONTEXTUAL_HINTS[`powerup_${pu}`].title === 'string');
      assert(typeof CONTEXTUAL_HINTS[`powerup_${pu}`].desc === 'string');
    });
  });

  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('tutorial.test.mjs')) {
  console.log('--- Validating Interactive Onboarding & Tutorial System ---');
  const count = runTutorialSelftest();
  console.log(`\nALL PASS. ${count} onboarding tutorial tests passing cleanly!`);
}
