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
});
