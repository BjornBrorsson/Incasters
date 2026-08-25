import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  screenToWorldIso,
  screenAngleToWorldIso,
  worldAngleToScreenIso,
  testCircleVsAABB,
  testCircleVsCircle,
  reflectVector,
  type Circle,
  type AABB
} from '../../src/engine/Physics';

describe('Physics: Isometric Coordinate Transforms', () => {
  it('correctly maps 2D screen direction vectors to isometric world coordinates', () => {
    // Screen right (1, 0) should map to world (+1/sqrt(2), -1/sqrt(2))
    const right = screenToWorldIso(1, 0);
    assert.ok(Math.abs(right.x - 0.70710678) < 1e-4);
    assert.ok(Math.abs(right.y - (-0.70710678)) < 1e-4);

    // Screen left (-1, 0)
    const left = screenToWorldIso(-1, 0);
    assert.ok(Math.abs(left.x - (-0.70710678)) < 1e-4);
    assert.ok(Math.abs(left.y - 0.70710678) < 1e-4);

    // Screen down (0, 1)
    const down = screenToWorldIso(0, 1);
    assert.ok(Math.abs(down.x - 0.70710678) < 1e-4);
    assert.ok(Math.abs(down.y - 0.70710678) < 1e-4);

    // Screen up (0, -1)
    const up = screenToWorldIso(0, -1);
    assert.ok(Math.abs(up.x - (-0.70710678)) < 1e-4);
    assert.ok(Math.abs(up.y - (-0.70710678)) < 1e-4);
  });

  it('correctly shifts angles between screen and isometric space with 45 degree offset', () => {
    const screenAngle = 0; // Screen right
    const worldAngle = screenAngleToWorldIso(screenAngle);
    assert.equal(worldAngle, -Math.PI / 4);

    const backToScreen = worldAngleToScreenIso(worldAngle);
    assert.ok(Math.abs(backToScreen - screenAngle) < 1e-6);

    const upScreenAngle = -Math.PI / 2;
    const upWorldAngle = screenAngleToWorldIso(upScreenAngle);
    assert.equal(upWorldAngle, -3 * Math.PI / 4);
  });
});

describe('Physics: Circle vs Circle Collision', () => {
  it('detects separation when circles do not intersect', () => {
    const c1: Circle = { x: 0, y: 0, radius: 1 };
    const c2: Circle = { x: 3, y: 0, radius: 1 };
    const result = testCircleVsCircle(c1, c2);
    assert.equal(result.collided, false);
    assert.equal(result.overlapX, 0);
    assert.equal(result.overlapY, 0);
  });

  it('detects intersection and calculates penetration normal and depth', () => {
    const c1: Circle = { x: 0, y: 0, radius: 1 };
    const c2: Circle = { x: 1.5, y: 0, radius: 1 };
    const result = testCircleVsCircle(c1, c2);
    assert.equal(result.collided, true);
    // Radius sum = 2.0, distance = 1.5 -> overlap = 0.5
    assert.ok(Math.abs(result.normalX - (-1)) < 1e-4);
    assert.ok(Math.abs(result.normalY - 0) < 1e-4);
    assert.ok(Math.abs(result.overlapX - (-0.5)) < 1e-4);
  });

  it('resolves concentric circles safely without NaN', () => {
    const c1: Circle = { x: 5, y: 5, radius: 1 };
    const c2: Circle = { x: 5, y: 5, radius: 1 };
    const result = testCircleVsCircle(c1, c2);
    assert.equal(result.collided, true);
    assert.ok(!Number.isNaN(result.normalX));
    assert.ok(!Number.isNaN(result.overlapX));
  });
});

describe('Physics: Circle vs AABB Collision & Reflection', () => {
  it('detects collision with wall and calculates normal facing outwards', () => {
    const circle: Circle = { x: 4.5, y: 0, radius: 1 };
    const wall: AABB = { minX: 5, minY: -5, maxX: 10, maxY: 5 };
    const result = testCircleVsAABB(circle, wall);

    assert.equal(result.collided, true);
    // Normal points OUT of the wall towards circle (-1, 0)
    assert.ok(Math.abs(result.normalX - (-1)) < 1e-4);
    assert.ok(Math.abs(result.normalY - 0) < 1e-4);
    assert.ok(result.overlapX < 0);
  });

  it('ignores open doors / walls', () => {
    const circle: Circle = { x: 5.5, y: 0, radius: 1 };
    const wall: AABB = { minX: 5, minY: -5, maxX: 10, maxY: 5, isOpen: true };
    const result = testCircleVsAABB(circle, wall);
    assert.equal(result.collided, false);
  });

  it('reflects velocity vector off collision normal with bounciness factor', () => {
    // Projectile moving right (+10, 0) hitting vertical wall normal (-1, 0)
    const reflected = reflectVector(10, 0, -1, 0, 1);
    assert.ok(Math.abs(reflected.x - (-10)) < 1e-4);
    assert.ok(Math.abs(reflected.y - 0) < 1e-4);

    // Projectile moving diagonally (10, 10) hitting floor normal (0, -1) with 0.8 bounciness
    const bouncedFloor = reflectVector(10, 10, 0, -1, 0.8);
    assert.ok(Math.abs(bouncedFloor.x - 10) < 1e-4);
    assert.ok(Math.abs(bouncedFloor.y - (-6)) < 1e-4);

    // If already moving away from normal, velocity is preserved
    const movingAway = reflectVector(-5, 0, -1, 0, 1);
    assert.equal(movingAway.x, -5);
    assert.equal(movingAway.y, 0);
  });
});
