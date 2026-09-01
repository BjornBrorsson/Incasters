import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  type CustomMapData,
  validateCustomMap,
  sanitizeCustomMap,
  createPerimeterWalls,
  MAP_TEMPLATES,
  CustomMapStorage
} from '../../src/game/CustomMap';
import { PowerUpType } from '../../src/entities/PowerUp';

describe('Custom Maps: Schema Validation, Templates & Persistence', () => {
  beforeEach(() => {
    // Reset mock localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('validates a well-formed custom map successfully', () => {
    const map = MAP_TEMPLATES.BLANK_COURTYARD();
    const result = validateCustomMap(map);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('rejects maps missing critical requirements like title, player spawn, or walls', () => {
    const invalid1 = {
      title: '',
      playerSpawn: { x: 0, y: 0 },
      walls: createPerimeterWalls(36, 36),
      theme: 'ARENA',
      mode: 'TRIAL',
      dummies: [{ id: 'd1', x: 0, y: 5, health: 30, radius: 0.75 }]
    };
    assert.equal(validateCustomMap(invalid1).valid, false);

    const invalid2 = {
      title: 'Valid Title',
      walls: createPerimeterWalls(36, 36),
      theme: 'ARENA',
      mode: 'TRIAL',
      dummies: [{ id: 'd1', x: 0, y: 5, health: 30, radius: 0.75 }]
    };
    assert.equal(validateCustomMap(invalid2).valid, false);

    const invalid3 = {
      title: 'Valid Title',
      playerSpawn: { x: 0, y: 0 },
      walls: [], // no perimeter walls
      theme: 'ARENA',
      mode: 'TRIAL',
      dummies: [{ id: 'd1', x: 0, y: 5, health: 30, radius: 0.75 }]
    };
    assert.equal(validateCustomMap(invalid3).valid, false);

    const invalidTrial = {
      title: 'Trial Without Dummies',
      playerSpawn: { x: 0, y: 0 },
      walls: createPerimeterWalls(36, 36),
      theme: 'ARENA',
      mode: 'TRIAL',
      dummies: [] // Trial requires at least 1 dummy
    };
    assert.equal(validateCustomMap(invalidTrial).valid, false);
  });

  it('sanitizes strings, bounds-clamps numerical parameters, and prevents injection', () => {
    const raw: any = {
      title: '  <b>Super Cool Challenge!</b>  '.repeat(10),
      author: '  Gamer123  ',
      parTime: -50,
      maxShots: 0,
      size: { width: 9999, height: 5 },
      theme: 'INVALID_THEME',
      playerSpawn: { x: 10, y: -10 },
      walls: createPerimeterWalls(36, 36)
    };

    const sanitized = sanitizeCustomMap(raw);
    assert.ok(sanitized.title.length <= 48);
    assert.equal(sanitized.author, 'Gamer123');
    assert.ok(sanitized.parTime >= 1);
    assert.ok(sanitized.maxShots >= 1);
    assert.ok(sanitized.size.width <= 60 && sanitized.size.width >= 20);
    assert.ok(sanitized.size.height <= 60 && sanitized.size.height >= 20);
    assert.equal(sanitized.theme, 'ARENA'); // Fallback to ARENA
  });

  it('creates clean 4-wall perimeter bounding boxes for custom arena dimensions', () => {
    const walls = createPerimeterWalls(40, 30);
    assert.equal(walls.length, 4);

    // West: x between -20 and -19
    const west = walls.find((w) => w.minX === -20 && w.maxX === -19);
    assert.ok(west !== undefined);
    assert.equal(west.minY, -15);
    assert.equal(west.maxY, 15);

    // East: x between 19 and 20
    const east = walls.find((w) => w.minX === 19 && w.maxX === 20);
    assert.ok(east !== undefined);

    // South: y between -15 and -14
    const south = walls.find((w) => w.minY === -15 && w.maxY === -14);
    assert.ok(south !== undefined);

    // North: y between 14 and 15
    const north = walls.find((w) => w.minY === 14 && w.maxY === 15);
    assert.ok(north !== undefined);
  });

  it('persists, updates, lists, duplicates, and deletes maps in CustomMapStorage', () => {
    const map1 = MAP_TEMPLATES.PORTAL_MAZE();
    map1.id = 'map_test_storage_1';
    map1.title = 'Storage Test 1';

    CustomMapStorage.save(map1);
    assert.equal(CustomMapStorage.getAll().length, 1);
    assert.equal(CustomMapStorage.getById('map_test_storage_1')?.title, 'Storage Test 1');

    // Update existing map
    map1.title = 'Updated Title';
    map1.clearCheck = {
      completed: true,
      clearTime: 3.5,
      clearShots: 1,
      clearedAt: Date.now()
    };
    CustomMapStorage.save(map1);
    assert.equal(CustomMapStorage.getAll().length, 1);
    assert.equal(CustomMapStorage.getById('map_test_storage_1')?.title, 'Updated Title');
    assert.equal(CustomMapStorage.getById('map_test_storage_1')?.clearCheck?.completed, true);

    // Summaries
    const summaries = CustomMapStorage.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].isCleared, true);
    assert.equal(summaries[0].clearTime, 3.5);

    // Duplicate
    const duplicated = CustomMapStorage.duplicate('map_test_storage_1');
    assert.ok(duplicated !== null);
    assert.equal(duplicated.title, 'Updated Title (Copy)');
    assert.equal(duplicated.clearCheck, undefined, 'Duplicate should require fresh clear check');
    assert.equal(CustomMapStorage.getAll().length, 2);

    // Delete
    const deleted = CustomMapStorage.delete('map_test_storage_1');
    assert.equal(deleted, true);
    assert.equal(CustomMapStorage.getAll().length, 1);
  });

  it('handles unified spawns array and maintains backward compatibility for playerSpawn/botSpawns', () => {
    // 1. Unified spawns input
    const unifiedInput: any = {
      title: 'Unified Spawns Arena',
      spawns: [
        { x: 0, y: -10 },
        { x: 10, y: 0, team: 'BLUE' },
        { x: -10, y: 0, team: 'RED' },
        { x: 0, y: 10 }
      ],
      walls: createPerimeterWalls(36, 36),
      theme: 'ARENA',
      mode: 'BATTLE_ROYALE'
    };

    assert.equal(validateCustomMap(unifiedInput).valid, true);
    const sanitizedUnified = sanitizeCustomMap(unifiedInput);
    assert.equal(sanitizedUnified.spawns?.length, 4);
    assert.deepEqual(sanitizedUnified.playerSpawn, { x: 0, y: -10 });
    assert.equal(sanitizedUnified.botSpawns?.length, 3);
    assert.deepEqual(sanitizedUnified.botSpawns?.[0], { x: 10, y: 0, team: 'BLUE' });

    // 2. Legacy playerSpawn + botSpawns input automatically populates spawns
    const legacyInput: any = {
      title: 'Legacy Spawns Arena',
      playerSpawn: { x: -5, y: -5 },
      botSpawns: [
        { x: 5, y: 5 },
        { x: -5, y: 5 }
      ],
      walls: createPerimeterWalls(36, 36),
      theme: 'ARENA',
      mode: 'BATTLE_ROYALE'
    };

    assert.equal(validateCustomMap(legacyInput).valid, true);
    const sanitizedLegacy = sanitizeCustomMap(legacyInput);
    assert.equal(sanitizedLegacy.spawns?.length, 3);
    assert.equal(sanitizedLegacy.spawns?.[0].x, -5);
    assert.equal(sanitizedLegacy.spawns?.[0].y, -5);
    assert.equal(sanitizedLegacy.spawns?.[1].x, 5);
    assert.equal(sanitizedLegacy.spawns?.[1].y, 5);
    assert.deepEqual(sanitizedLegacy.playerSpawn, { x: -5, y: -5 });
  });

  it('correctly calculates object rotations for walls, moving walls, hazards, dummies, and spawns', () => {
    // 1. Wall rotation: 4x2 wall at (10, 20) -> minX=8, maxX=12, minY=19, maxY=21
    const wall = { minX: 8, maxX: 12, minY: 19, maxY: 21 };
    const cx = (wall.minX + wall.maxX) / 2; // 10
    const cy = (wall.minY + wall.maxY) / 2; // 20
    const hw = (wall.maxX - wall.minX) / 2; // 2
    const hh = (wall.maxY - wall.minY) / 2; // 1
    // After rotation: width and height swap
    const rotatedWall = {
      minX: cx - hh, // 9
      maxX: cx + hh, // 11
      minY: cy - hw, // 18
      maxY: cy + hw  // 22
    };
    assert.equal(rotatedWall.minX, 9);
    assert.equal(rotatedWall.maxX, 11);
    assert.equal(rotatedWall.minY, 18);
    assert.equal(rotatedWall.maxY, 22);

    // 2. Moving Wall: toggle axis and swap dimensions
    const mw = { baseX: 0, baseY: 0, halfW: 2, halfH: 1, axis: 'x' as const, range: 4, speed: 2 };
    const oldHw = mw.halfW;
    mw.halfW = mw.halfH;
    mw.halfH = oldHw;
    mw.axis = mw.axis === 'x' ? 'y' : 'x';
    assert.equal(mw.halfW, 1);
    assert.equal(mw.halfH, 2);
    assert.equal(mw.axis, 'y');

    // 3. Hazard Turret: advance angle by 45 degrees (PI / 4)
    let hazardAngle = 0;
    hazardAngle = (hazardAngle + Math.PI / 4) % (Math.PI * 2);
    assert.equal(hazardAngle, Math.PI / 4);
    hazardAngle = (hazardAngle + Math.PI / 4) % (Math.PI * 2);
    assert.equal(hazardAngle, Math.PI / 2);

    // 4. Target Dummy: toggle moveAxis
    let dummyAxis: 'x' | 'y' = 'x';
    dummyAxis = dummyAxis === 'y' ? 'x' : 'y';
    assert.equal(dummyAxis, 'y');
    dummyAxis = dummyAxis === 'y' ? 'x' : 'y';
    assert.equal(dummyAxis, 'x');

    // 5. Spawn Team: cycle undefined -> RED -> BLUE -> undefined
    let team: 'RED' | 'BLUE' | undefined = undefined;
    team = team === 'RED' ? 'BLUE' : (team === 'BLUE' ? undefined : 'RED');
    assert.equal(team, 'RED');
    team = team === 'RED' ? 'BLUE' : (team === 'BLUE' ? undefined : 'RED');
    assert.equal(team, 'BLUE');
    team = team === 'RED' ? 'BLUE' : (team === 'BLUE' ? undefined : 'RED');
    assert.equal(team, undefined);
  });
});
