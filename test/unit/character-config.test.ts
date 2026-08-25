import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAT_STYLES,
  WEAPON_STYLES,
  ACCESSORY_STYLES,
  HAIR_STYLES,
  FACE_GEAR_STYLES,
  TRAIL_STYLES,
  BURST_STYLES,
  EYE_COLORS,
  HAIR_COLORS,
  DEFAULT_CONFIG,
  loadCharacterConfig,
  saveCharacterConfig
} from '../../src/game/CharacterConfig';

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

describe('CharacterConfig: Cosmetic Catalog & Config Integrity', () => {
  it('contains comprehensive lists of customizable cosmetics', () => {
    assert.ok(HAT_STYLES.length >= 8, `Expected >= 8 hat styles, found ${HAT_STYLES.length}`);
    assert.ok(WEAPON_STYLES.length >= 7, `Expected >= 7 weapon styles, found ${WEAPON_STYLES.length}`);
    assert.ok(ACCESSORY_STYLES.length >= 6, `Expected >= 6 accessory styles, found ${ACCESSORY_STYLES.length}`);
    assert.ok(HAIR_STYLES.length >= 4, `Expected >= 4 hair styles, found ${HAIR_STYLES.length}`);
    assert.ok(FACE_GEAR_STYLES.length >= 7, `Expected >= 7 face gear styles, found ${FACE_GEAR_STYLES.length}`);
    assert.ok(TRAIL_STYLES.length >= 5, `Expected >= 5 trail styles, found ${TRAIL_STYLES.length}`);
    assert.ok(BURST_STYLES.length >= 4, `Expected >= 4 burst styles, found ${BURST_STYLES.length}`);
    assert.ok(EYE_COLORS.length >= 6, `Expected >= 6 eye colors, found ${EYE_COLORS.length}`);
    assert.ok(HAIR_COLORS.length >= 6, `Expected >= 6 hair colors, found ${HAIR_COLORS.length}`);
  });

  it('validates default character config conforms to schema', () => {
    assert.ok(DEFAULT_CONFIG.robeColor !== undefined);
    assert.ok(DEFAULT_CONFIG.spellColor !== undefined);
    assert.ok(DEFAULT_CONFIG.hat !== undefined);
    assert.ok(DEFAULT_CONFIG.weapon !== undefined);
    assert.ok(DEFAULT_CONFIG.accessory !== undefined);
    assert.ok(DEFAULT_CONFIG.hair !== undefined);
    assert.ok(DEFAULT_CONFIG.faceGear !== undefined);
    assert.ok(DEFAULT_CONFIG.trail !== undefined);
    assert.ok(DEFAULT_CONFIG.burst !== undefined);
  });

  it('saves, persists, and loads character config correctly', () => {
    const config = { ...DEFAULT_CONFIG, hat: 'CROWN' as const, weapon: 'SCYTHE' as const, trail: 'LIGHTNING' as const };
    saveCharacterConfig(config);

    const loaded = loadCharacterConfig();
    assert.equal(loaded.hat, 'CROWN');
    assert.equal(loaded.weapon, 'SCYTHE');
    assert.equal(loaded.trail, 'LIGHTNING');
  });

  it('safely recovers default config if localStorage contains corrupted JSON', () => {
    localStorage.setItem('incasters_character', '{ corrupted json invalid');
    const loaded = loadCharacterConfig();
    assert.deepEqual(loaded, DEFAULT_CONFIG);
  });
});
