import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage before importing
const mockStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => { mockStore[key] = String(value); },
  removeItem: (key: string) => { delete mockStore[key]; },
  clear: () => { Object.keys(mockStore).forEach((k) => delete mockStore[k]); },
  key: (index: number) => Object.keys(mockStore)[index] ?? null,
  length: 0
} as Storage;

import { progression, FEAT_DEFINITIONS } from '../../src/game/Progression';
import { Projectile, type ProjectileStats } from '../../src/entities/Projectile';
import { TRIAL_STAGES } from '../../src/game/Trials';

describe('GitHub Issues & PR Verification Matrix (#18, #20, #21, #22, #23, #24)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Issue #24 & PR #25: validates all 15 Feat definitions and title rewards exist', () => {
    assert.equal(FEAT_DEFINITIONS.length, 15);
    const expectedIds = [
      'first_win', 'trickshot_master', 'wall_runner', 'bounty_hunter',
      'sharp_shooter', 'speed_demon', 'elemental_lord', 'gold_hoarder',
      'cauldron_king', 'trial_master', 'insane_slayer', 'undefeated',
      'fashionista', 'veteran', 'grand_archmage'
    ];
    expectedIds.forEach((id) => {
      const feat = FEAT_DEFINITIONS.find((f) => f.id === id);
      assert.ok(feat, `Expected feat definition for ${id}`);
      assert.ok(feat.name.length > 0);
      assert.ok(feat.desc.length > 0);
      assert.ok(feat.titleReward.length > 0);
      assert.ok(feat.goal > 0);
    });
  });

  it('Issue #20: Projectile accurately tracks turn angle and sets hasCurved only when curving', () => {
    const stats: ProjectileStats = {
      damage: 25,
      speed: 10,
      maxBounces: 0,
      maxPierces: 0,
      splitLevel: 0,
      color: 0xff4400
    };

    // 1. Straight projectile with target straight ahead: hasCurved must be FALSE
    const straightProj = new Projectile(0, 0, 0, 'player', stats);
    straightProj.targetPoint = { x: 50, y: 0 };
    straightProj.update(0.1);
    straightProj.update(0.1);
    assert.equal(straightProj.hasCurved, false, 'Straight shot should not have hasCurved true');

    // 2. Curved projectile with target 90 degrees offset: hasCurved must become TRUE
    const curvedProj = new Projectile(0, 0, 0, 'player', stats);
    curvedProj.targetPoint = { x: 0, y: 20 };
    for (let i = 0; i < 10; i++) {
      curvedProj.update(0.1);
    }
    assert.ok(curvedProj.totalTurnAngle >= 0.25, `Expected totalTurnAngle >= 0.25 rad, got ${curvedProj.totalTurnAngle}`);
    assert.equal(curvedProj.hasCurved, true, 'Curved shot must set hasCurved to true');

    // 3. Manual steered projectile (Q/E): hasCurved must become TRUE
    const steerProj = new Projectile(0, 0, 0, 'player', stats);
    steerProj.steerDirection = 1; // Steering right
    for (let i = 0; i < 5; i++) {
      steerProj.update(0.1);
    }
    assert.equal(steerProj.hasCurved, true, 'Manually steered shot must set hasCurved to true');
  });

  it('Issue #23: verifies Trial stages integrity and maxShots criteria', () => {
    assert.equal(TRIAL_STAGES.length, 11);
    TRIAL_STAGES.forEach((stage) => {
      assert.ok(stage.maxShots > 0, `Stage ${stage.id} must have positive maxShots`);
      assert.ok(stage.parTime > 0, `Stage ${stage.id} must have positive parTime`);
      assert.ok(stage.dummies.length > 0, `Stage ${stage.id} must have target dummies`);
      assert.ok(stage.walls.length > 0, `Stage ${stage.id} must have walls`);
    });
  });

  it('Issue #20 & PR #25: verifies undefeated feat tracks deathless matches', () => {
    // Match with died: true -> should not award undefeated progress
    progression.recordMatch({ won: true, kills: 5, mode: 'BATTLE_ROYALE', died: true });
    let undefeatedFeat = progression.getFeats().find((f) => f.id === 'undefeated');
    assert.equal(undefeatedFeat?.progress ?? 0, 0);

    // Match with died: false -> should award undefeated progress
    progression.recordMatch({ won: true, kills: 5, mode: 'BATTLE_ROYALE', died: false });
    undefeatedFeat = progression.getFeats().find((f) => f.id === 'undefeated');
    assert.equal(undefeatedFeat?.progress, 1);
  });
});
