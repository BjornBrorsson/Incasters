import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTY_PRESETS,
  DIFFICULTY_ORDER,
  loadDifficulty,
  saveDifficulty,
  type DifficultyLevel
} from '../../src/game/Difficulty';

// Mock localStorage for node test runner
const mockStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => { mockStore[key] = String(value); },
  removeItem: (key: string) => { delete mockStore[key]; },
  clear: () => { Object.keys(mockStore).forEach((k) => delete mockStore[k]); },
  key: (index: number) => Object.keys(mockStore)[index] ?? null,
  length: 0
} as Storage;

describe('Difficulty: Preset Validation & AI Scaling Curves', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('contains all 4 expected difficulty tiers in ascending order', () => {
    assert.deepEqual(DIFFICULTY_ORDER, ['EASY', 'NORMAL', 'HARD', 'INSANE']);
    assert.ok(DIFFICULTY_PRESETS.EASY);
    assert.ok(DIFFICULTY_PRESETS.NORMAL);
    assert.ok(DIFFICULTY_PRESETS.HARD);
    assert.ok(DIFFICULTY_PRESETS.INSANE);
  });

  it('scales speed monotonically across difficulty tiers', () => {
    assert.ok(DIFFICULTY_PRESETS.EASY.botSpeedMultiplier < DIFFICULTY_PRESETS.NORMAL.botSpeedMultiplier);
    assert.ok(DIFFICULTY_PRESETS.NORMAL.botSpeedMultiplier < DIFFICULTY_PRESETS.HARD.botSpeedMultiplier);
    assert.ok(DIFFICULTY_PRESETS.HARD.botSpeedMultiplier < DIFFICULTY_PRESETS.INSANE.botSpeedMultiplier);
  });

  it('decreases aim error and fire cooldown on higher difficulties', () => {
    // Easy bots have highest aim error, Insane bots have lowest aim error
    assert.ok(DIFFICULTY_PRESETS.EASY.botAimError > DIFFICULTY_PRESETS.NORMAL.botAimError);
    assert.ok(DIFFICULTY_PRESETS.NORMAL.botAimError > DIFFICULTY_PRESETS.HARD.botAimError);
    assert.ok(DIFFICULTY_PRESETS.HARD.botAimError > DIFFICULTY_PRESETS.INSANE.botAimError);

    // Fire rate multiplier is lower on harder bots (lower multiplier = faster fire rate)
    assert.ok(DIFFICULTY_PRESETS.EASY.botFireRateMultiplier > DIFFICULTY_PRESETS.NORMAL.botFireRateMultiplier);
    assert.ok(DIFFICULTY_PRESETS.NORMAL.botFireRateMultiplier > DIFFICULTY_PRESETS.HARD.botFireRateMultiplier);
    assert.ok(DIFFICULTY_PRESETS.HARD.botFireRateMultiplier > DIFFICULTY_PRESETS.INSANE.botFireRateMultiplier);
  });

  it('increases dodge and dash probability on higher difficulties', () => {
    assert.ok(DIFFICULTY_PRESETS.EASY.botDodgeChance < DIFFICULTY_PRESETS.NORMAL.botDodgeChance);
    assert.ok(DIFFICULTY_PRESETS.NORMAL.botDodgeChance < DIFFICULTY_PRESETS.HARD.botDodgeChance);
    assert.ok(DIFFICULTY_PRESETS.HARD.botDodgeChance < DIFFICULTY_PRESETS.INSANE.botDodgeChance);

    assert.ok(DIFFICULTY_PRESETS.EASY.botDashChance < DIFFICULTY_PRESETS.NORMAL.botDashChance);
    assert.ok(DIFFICULTY_PRESETS.NORMAL.botDashChance < DIFFICULTY_PRESETS.HARD.botDashChance);
    assert.ok(DIFFICULTY_PRESETS.HARD.botDashChance < DIFFICULTY_PRESETS.INSANE.botDashChance);
  });

  it('persists and loads difficulty correctly from localStorage', () => {
    assert.equal(loadDifficulty(), 'NORMAL'); // default
    saveDifficulty('HARD');
    assert.equal(loadDifficulty(), 'HARD');
    saveDifficulty('INSANE');
    assert.equal(loadDifficulty(), 'INSANE');
  });

  it('handles invalid or corrupted difficulty storage safely by defaulting to NORMAL', () => {
    localStorage.setItem('incasters_difficulty', 'IMPOSSIBLE_INVALID_TIER');
    assert.equal(loadDifficulty(), 'NORMAL');
  });
});
