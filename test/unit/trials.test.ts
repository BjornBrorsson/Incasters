import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_STAGES, type TrialStage } from '../../src/game/Trials';

describe('Trickshot Trials: Stage Definitions & Integrity Matrix', () => {
  it('contains all 11 unique trickshot trial stages (Stages 0 to 10)', () => {
    assert.equal(TRIAL_STAGES.length, 11);
    const ids = TRIAL_STAGES.map((s) => s.id);
    assert.deepEqual(ids, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('validates each stage has valid metadata, par goals, walls, and target dummies', () => {
    TRIAL_STAGES.forEach((stage: TrialStage) => {
      assert.ok(stage.title.length > 0, `Stage ${stage.id} missing title`);
      assert.ok(stage.description.length > 0, `Stage ${stage.id} missing description`);
      assert.ok(stage.tip.length > 0, `Stage ${stage.id} missing tip`);
      assert.ok(stage.parTime > 0, `Stage ${stage.id} invalid parTime`);
      assert.ok(stage.maxShots > 0, `Stage ${stage.id} invalid maxShots`);
      assert.ok(stage.star2Time >= stage.parTime, `Stage ${stage.id} star2Time should be >= parTime`);

      // Verify spawn position
      assert.ok(typeof stage.playerSpawn.x === 'number');
      assert.ok(typeof stage.playerSpawn.y === 'number');

      // Verify target dummies
      assert.ok(stage.dummies.length > 0, `Stage ${stage.id} has no target dummies`);
      stage.dummies.forEach((dummy) => {
        assert.ok(dummy.id.length > 0, `Dummy in stage ${stage.id} missing id`);
        assert.ok(dummy.health > 0, `Dummy ${dummy.id} in stage ${stage.id} has invalid health`);
        assert.ok(dummy.radius > 0, `Dummy ${dummy.id} in stage ${stage.id} has invalid radius`);
      });

      // Verify boundary/obstacle walls
      assert.ok(stage.walls.length >= 4, `Stage ${stage.id} has fewer than 4 boundary walls`);
      stage.walls.forEach((wall) => {
        assert.ok(wall.minX < wall.maxX, `Wall in stage ${stage.id} has inverted X coordinates`);
        assert.ok(wall.minY < wall.maxY, `Wall in stage ${stage.id} has inverted Y coordinates`);
      });
    });
  });

  it('verifies specialized stage mechanics exist for advanced trickshots', () => {
    // Stage with Portals
    const portalStage = TRIAL_STAGES.find((s) => s.portals && s.portals.length > 0);
    assert.ok(portalStage, 'Expected at least one trial stage with arcane portals');

    // Stage with Speed Runes or Powerups
    const powerupStage = TRIAL_STAGES.find((s) => s.powerups && s.powerups.length > 0);
    assert.ok(powerupStage, 'Expected at least one trial stage with powerups');

    // Moving dummies
    const movingDummyStage = TRIAL_STAGES.find((s) => s.dummies.some((d) => d.isMoving));
    assert.ok(movingDummyStage, 'Expected at least one trial stage with moving target dummies');
  });
});
