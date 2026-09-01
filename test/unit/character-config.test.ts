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
  saveCharacterConfig,
  sanitizePlayerName
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

  it('validates, sanitizes and persists player customized name', () => {
    const validCheck = sanitizePlayerName('Spellweaver');
    assert.equal(validCheck.valid, true);
    assert.equal(validCheck.name, 'Spellweaver');

    const trimmedCheck = sanitizePlayerName('   ArcaneStorm   ');
    assert.equal(trimmedCheck.valid, true);
    assert.equal(trimmedCheck.name, 'ArcaneStorm');

    const config = { ...DEFAULT_CONFIG, name: 'Merlin' };
    saveCharacterConfig(config);
    const loaded = loadCharacterConfig();
    assert.equal(loaded.name, 'Merlin');
  });

  it('enforces character name bounds (non-empty, max 16 chars)', () => {
    const emptyCheck = sanitizePlayerName('    ');
    assert.equal(emptyCheck.valid, false);
    assert.equal(emptyCheck.name, 'Wizard');

    const tooLongCheck = sanitizePlayerName('ThisNameIsWayTooLongForWizard');
    assert.equal(tooLongCheck.valid, false);
    assert.ok(tooLongCheck.name.length <= 16);
  });

  it('blocks racist, bigoted and sexist words, including leetspeak and spaced bypasses', () => {
    // Racist slurs & hate speech
    const slur1 = sanitizePlayerName('nigger');
    assert.equal(slur1.valid, false);
    assert.equal(slur1.name, 'Wizard');

    const slurLeet = sanitizePlayerName('n!gg3r');
    assert.equal(slurLeet.valid, false);
    assert.equal(slurLeet.name, 'Wizard');

    const slurSpaced = sanitizePlayerName('n i g g a');
    assert.equal(slurSpaced.valid, false);
    assert.equal(slurSpaced.name, 'Wizard');

    const slurNazi = sanitizePlayerName('Heil Hitler');
    assert.equal(slurNazi.valid, false);
    assert.equal(slurNazi.name, 'Wizard');

    // Bigotry & homophobic slurs
    const slurHomo = sanitizePlayerName('faggot');
    assert.equal(slurHomo.valid, false);
    assert.equal(slurHomo.name, 'Wizard');

    const slurHomoLeet = sanitizePlayerName('f@g');
    assert.equal(slurHomoLeet.valid, false);
    assert.equal(slurHomoLeet.name, 'Wizard');

    // Sexist & misogynistic slurs
    const sexist1 = sanitizePlayerName('bitch');
    assert.equal(sexist1.valid, false);
    assert.equal(sexist1.name, 'Wizard');

    const sexistLeet = sanitizePlayerName('b.i.t.c.h');
    assert.equal(sexistLeet.valid, false);
    assert.equal(sexistLeet.name, 'Wizard');

    const sexist2 = sanitizePlayerName('cunt');
    assert.equal(sexist2.valid, false);
    assert.equal(sexist2.name, 'Wizard');

    // Attempting to save an offensive name falls back to safe default
    const badConfig = { ...DEFAULT_CONFIG, name: 'b1tch' };
    saveCharacterConfig(badConfig);
    const loaded = loadCharacterConfig();
    assert.equal(loaded.name, 'Wizard');
  });
});
