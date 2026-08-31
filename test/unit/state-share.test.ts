import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeStateShare,
  decodeStateShare,
  generateShareUrl,
  generateShareCode,
  parseStateShareFromUrl,
  toBase64Url,
  fromBase64Url,
  resolveShareCode
} from '../../src/game/StateShare';
import {
  type CustomMapData,
  MAP_TEMPLATES,
  sanitizeCustomMap
} from '../../src/game/CustomMap';
import { PowerUpType } from '../../src/entities/PowerUp';

describe('State Share System: Google Stadia-inspired Link Mechanics', () => {
  it('losslessly encodes and decodes a standard custom trickshot map', () => {
    const original: CustomMapData = {
      version: 1,
      id: 'test_map_001',
      title: 'The Great Curved Gauntlet',
      subtitle: 'Bank Around Pillars',
      author: 'Archmage Test',
      description: 'Curve your spells around stone barriers to hit moving dummies.',
      tip: 'Hold aim to steer in mid-air.',
      mode: 'TRIAL',
      theme: 'CHAMBER',
      size: { width: 36, height: 36 },
      parTime: 14.5,
      maxShots: 3,
      star2Time: 22.0,
      clearCheck: {
        completed: true,
        clearTime: 4.8,
        clearShots: 2,
        clearedAt: 1700000000000
      },
      playerSpawn: { x: -8, y: 0 },
      dummies: [
        { id: 'd1', x: 8, y: 0, health: 30, radius: 0.75, isMoving: true, moveAxis: 'y', moveRange: 6, moveSpeed: 2 }
      ],
      walls: [
        { minX: -18, minY: -18, maxX: -17, maxY: 18 },
        { minX: 17, minY: -18, maxX: 18, maxY: 18 },
        { minX: -18, minY: -18, maxX: 18, maxY: -17 },
        { minX: -18, minY: 17, maxX: 18, maxY: 18 },
        { minX: -2, minY: -4, maxX: 2, maxY: 4 }
      ],
      powerups: [
        { x: -4, y: 0, type: PowerUpType.BOUNCE }
      ],
      portals: [
        { id1: 'p1', x1: -6, y1: 6, id2: 'p2', x2: 6, y2: -6 }
      ],
      speedRunes: [
        { id: 'r1', x: -6, y: -6 }
      ],
      hazards: [
        { x: 0, y: 8, angle: 0, rotateSpeed: 1.5, fireInterval: 2.5 }
      ],
      movingWalls: [
        { baseX: 0, baseY: -8, halfW: 2, halfH: 1, axis: 'x', range: 4, speed: 1.2 }
      ],
      destructibleProps: [
        { type: 'MANA_CRYSTAL', x: 0, y: 0 }
      ]
    };

    const encoded = encodeStateShare(original);
    assert.ok(typeof encoded === 'string' && encoded.length > 20, 'Encoded string should be non-empty');
    assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='), 'Base64URL should be URL-safe');

    const decoded = decodeStateShare(encoded);
    assert.ok(decoded !== null, 'Decoded map should not be null');
    assert.equal(decoded.title, 'The Great Curved Gauntlet');
    assert.equal(decoded.author, 'Archmage Test');
    assert.equal(decoded.mode, 'TRIAL');
    assert.equal(decoded.theme, 'CHAMBER');
    assert.equal(decoded.parTime, 14.5);
    assert.equal(decoded.maxShots, 3);
    assert.equal(decoded.clearCheck?.completed, true);
    assert.equal(decoded.clearCheck?.clearTime, 4.8);
    assert.equal(decoded.dummies?.length, 1);
    assert.equal(decoded.dummies?.[0].isMoving, true);
    assert.equal(decoded.portals?.length, 1);
    assert.equal(decoded.hazards?.length, 1);
    assert.equal(decoded.movingWalls?.length, 1);
  });

  it('safely handles corrupted or invalid payloads without throwing exceptions', () => {
    assert.equal(decodeStateShare(''), null);
    assert.equal(decodeStateShare('invalid_not_base64!!!'), null);
    assert.equal(decodeStateShare('eyJ2IjoxLCJjcyI6MTIzLCJkIjp7fX0'), null); // Missing walls/spawn
    assert.equal(decodeStateShare('null'), null);
  });

  it('correctly parses State Share parameters from URL hashes and query strings', () => {
    const template = MAP_TEMPLATES.PORTAL_MAZE();
    const payload = encodeStateShare(template);

    // 1. Standard Hash format
    const urlHash = `https://incasters.app/#share=${payload}`;
    const parsed1 = parseStateShareFromUrl(urlHash);
    assert.ok(parsed1 !== null);
    assert.equal(parsed1.title, template.title);

    // 2. Query param format
    const urlQuery = `https://incasters.app/?share=${payload}`;
    const parsed2 = parseStateShareFromUrl(urlQuery);
    assert.ok(parsed2 !== null);
    assert.equal(parsed2.title, template.title);

    // 3. Alternate #state= format
    const urlState = `https://incasters.app/#state=${payload}`;
    const parsed3 = parseStateShareFromUrl(urlState);
    assert.ok(parsed3 !== null);
    assert.equal(parsed3.title, template.title);
  });

  it('generates reproducible share URLs with proper clean base URLs', () => {
    const template = MAP_TEMPLATES.BLANK_COURTYARD();
    const url = generateShareUrl(template, 'https://play.incasters.com/game.html');
    assert.ok(url.startsWith('https://play.incasters.com/game.html#share='));
    assert.ok(url.length > 50);

    const parsed = parseStateShareFromUrl(url);
    assert.ok(parsed !== null);
    assert.equal(parsed.title, template.title);
  });

  it('generates and resolves short 6-letter room-style share codes', () => {
    const map = MAP_TEMPLATES.DUEL_ARENA();
    const code = generateShareCode(map);
    assert.ok(code.startsWith('ST-'), `Code should start with ST- prefix, got ${code}`);
    assert.equal(code.length, 7); // ST-XXXX

    const resolved = resolveShareCode(code);
    assert.ok(resolved !== null);
    assert.equal(resolved.title, map.title);

    // Should also resolve without prefix
    const resolvedRaw = resolveShareCode(code.replace('ST-', ''));
    assert.ok(resolvedRaw !== null);
    assert.equal(resolvedRaw.title, map.title);
  });
});
