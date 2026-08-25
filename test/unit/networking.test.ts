import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRoomCode,
  formatPeerId,
  cleanRoomCode
} from '../../src/net/P2PClient';

describe('Networking: Room Code Generation & Sanitization', () => {
  it('generates a 4-character alphanumeric uppercase room code', () => {
    const code = generateRoomCode();
    assert.equal(code.length, 4);
    assert.match(code, /^[A-Z2-9]{4}$/);
  });

  it('sanitizes user input for room codes cleanly', () => {
    assert.equal(cleanRoomCode('  abc-12  '), 'ABC12');
    assert.equal(cleanRoomCode('ROOM#99!'), 'ROOM99');
    assert.equal(cleanRoomCode('test room'), 'TESTROOM');
  });

  it('formats peer ID with prefix for P2P signaling', () => {
    assert.equal(formatPeerId('ABCD'), 'incasters-room-ABCD');
    assert.equal(formatPeerId('  xyz-99 '), 'incasters-room-XYZ99');
  });
});
