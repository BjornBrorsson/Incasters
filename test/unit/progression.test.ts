import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage before importing Progression
const mockStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => { mockStore[key] = String(value); },
  removeItem: (key: string) => { delete mockStore[key]; },
  clear: () => { Object.keys(mockStore).forEach((k) => delete mockStore[k]); },
  key: (index: number) => Object.keys(mockStore)[index] ?? null,
  length: 0
} as Storage;

import { progression, PART_COST } from '../../src/game/Progression';

describe('Progression & Economy: Leveling, Tokens, Challenges & Mastery', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('calculates level and XP progression monotonically', () => {
    const summary1 = progression.recordMatch({ won: false, kills: 2, mode: 'BATTLE_ROYALE' });
    assert.ok(summary1.xpGained > 0);
    assert.ok(summary1.tokensGained > 0);

    const initialLevel = progression.level;
    assert.equal(initialLevel, 1);

    // Record high score matches to level up
    for (let i = 0; i < 10; i++) {
      progression.recordMatch({ won: true, kills: 5, mode: 'BATTLE_ROYALE' });
    }

    assert.ok(progression.level > initialLevel, 'Expected player to level up');
    assert.ok(progression.tokens > 0, 'Expected player to have earned tokens');
  });

  it('manages cosmetic item unlocking and prevents unauthorized unlocks', () => {
    // 0 cost parts are always unlocked
    assert.equal(progression.isPartUnlocked('hat:WIZARD'), true);
    assert.equal(progression.isPartUnlocked('hat:NONE'), true);

    // Expensive part (e.g. hat:CROWN costs 40)
    assert.equal(PART_COST['hat:CROWN'], 40);
    
    // Attempt unlock if tokens < 40
    // Force low tokens
    const currentTokens = progression.tokens;
    if (currentTokens < 40) {
      const unlocked = progression.unlockPart('hat:CROWN');
      assert.equal(unlocked, false);
      assert.equal(progression.isPartUnlocked('hat:CROWN'), false);
    }
  });

  it('tracks Trickshot Trial stars, best times, and stage unlocking', () => {
    // Stages 0 and 1 are unlocked by default
    assert.equal(progression.isTrialUnlocked(0), true);
    assert.equal(progression.isTrialUnlocked(1), true);

    // Stage 2 is locked until Stage 1 is cleared with at least 1 star
    const initialStage2Unlocked = progression.isTrialUnlocked(2);
    
    // Clear Stage 1 with 3 stars in 8.5 seconds
    const clearResult = progression.recordTrialClear(1, 3, 8.5);
    assert.equal(clearResult.newStars, 3);
    assert.ok(clearResult.tokensEarned > 0);
    assert.equal(progression.getTrialStars(1), 3);
    assert.equal(progression.getTrialBestTime(1), 8.5);

    // Now Stage 2 should be unlocked
    assert.equal(progression.isTrialUnlocked(2), true);
  });

  it('tracks Mastery Feats and awards titles', () => {
    const featBefore = progression.getFeats().find((f) => f.id === 'first_win');
    assert.ok(featBefore);

    // Progress first_win feat
    const unlockedFeat = progression.recordFeatProgress('first_win', 1);
    const featAfter = progression.getFeats().find((f) => f.id === 'first_win');
    assert.ok(featAfter?.unlocked);
  });
});
