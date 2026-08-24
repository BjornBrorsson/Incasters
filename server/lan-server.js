/**
 * Lightweight WebSocket server for LAN multiplayer. The host runs this server
 * alongside the game; clients on the same network connect to play together.
 *
 * Architecture: Host-authoritative. The host runs the full game simulation
 * and broadcasts state snapshots. Clients send only their input state each
 * frame and render the snapshots they receive.
 *
 * Protocol (JSON messages):
 *  Client → Server:
 *   { type: 'join', name: string, config: object }
 *   { type: 'input', input: PlayerInputState }
 *   { type: 'leave' }
 *  Server → Client:
 *   { type: 'welcome', playerId: string, roomInfo: RoomInfo }
 *   { type: 'join', player: NetPlayer }
 *   { type: 'leave', playerId: string }
 *   { type: 'state', state: GameStateSnapshot }
 *   { type: 'event', event: GameEvent }
 *   { type: 'start', config: MatchConfig }
 *   { type: 'end', result: MatchResult }
 *
 * Run with: node server/lan-server.js
 * Default port: 7070
 */

import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.INCASTERS_PORT || '7070', 10);

const players = new Map();
let nextId = 1;
let hostId = null;

const wss = new WebSocketServer({ port: PORT });

console.log(`Incasters LAN Server listening on ws://0.0.0.0:${PORT}`);
console.log('Waiting for players to connect...');

function broadcast(data, excludeId) {
  const msg = JSON.stringify(data);
  players.forEach((p) => {
    if (p.id !== excludeId && p.ws.readyState === 1) {
      p.ws.send(msg);
    }
  });
}

function sendTo(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function getRoomInfo() {
  return {
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready
    })),
    hostId
  };
}

wss.on('connection', (ws, req) => {
  const clientId = `p${nextId++}`;
  const ip = req.socket.remoteAddress;
  console.log(`[CONNECT] ${clientId} from ${ip}`);

  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        if (player) return; // already joined
        player = {
          id: clientId,
          name: msg.name || `Player ${clientId}`,
          ws,
          config: msg.config || null,
          input: { moveX: 0, moveY: 0, aimAngle: 0, firing: false, dashing: false },
          ready: false
        };
        players.set(clientId, player);

        // First player becomes host
        if (!hostId) {
          hostId = clientId;
          player.ready = true; // host is always ready
        }

        console.log(`[JOIN] ${player.name} (${clientId})${hostId === clientId ? ' [HOST]' : ''}`);

        // Send welcome with player ID and room info
        sendTo(ws, { type: 'welcome', playerId: clientId, roomInfo: getRoomInfo(), isHost: hostId === clientId });

        // Broadcast new player to everyone else
        broadcast({ type: 'join', player: { id: clientId, name: player.name, ready: player.ready } }, clientId);
        break;
      }

      case 'ready': {
        if (!player) return;
        player.ready = !!msg.ready;
        broadcast({ type: 'ready', playerId: clientId, ready: player.ready });
        console.log(`[READY] ${player.name}: ${player.ready}`);
        break;
      }

      case 'input': {
        if (!player) return;
        player.input = msg.input || player.input;
        if (hostId && hostId !== clientId) {
          const hostPlayer = players.get(hostId);
          if (hostPlayer && hostPlayer.ws.readyState === 1) {
            sendTo(hostPlayer.ws, { type: 'clientInput', playerId: clientId, input: player.input });
          }
        }
        break;
      }

      case 'start': {
        // Only host can start the match
        if (!player || hostId !== clientId) return;
        const matchConfig = msg.config || {};
        broadcast({ type: 'start', config: matchConfig });
        console.log(`[START] Host ${player.name} started match`);
        break;
      }

      case 'state': {
        // Only host broadcasts state
        if (!player || hostId !== clientId) return;
        broadcast({ type: 'state', state: msg.state }, clientId);
        break;
      }

      case 'event': {
        if (!player || hostId !== clientId) return;
        broadcast({ type: 'event', event: msg.event }, clientId);
        break;
      }

      case 'end': {
        if (!player || hostId !== clientId) return;
        broadcast({ type: 'end', result: msg.result });
        console.log(`[END] Match ended`);
        break;
      }

      case 'leave': {
        handleDisconnect();
        break;
      }
    }
  });

  function handleDisconnect() {
    if (!player) return;
    players.delete(clientId);
    console.log(`[LEAVE] ${player.name} (${clientId})`);

    // If host left, assign new host
    if (hostId === clientId) {
      const next = players.values().next();
      if (!next.done) {
        hostId = next.value.id;
        next.value.ready = true;
        sendTo(next.value.ws, { type: 'host', isHost: true });
        console.log(`[HOST] ${next.value.name} is now host`);
      } else {
        hostId = null;
      }
    }

    broadcast({ type: 'leave', playerId: clientId, roomInfo: getRoomInfo() });
    player = null;
  }

  ws.on('close', handleDisconnect);
  ws.on('error', (err) => {
    console.error(`[ERROR] ${clientId}:`, err.message);
    handleDisconnect();
  });
});

wss.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('SIGINT', () => {
  console.log('\nShutting down LAN server...');
  players.forEach((p) => p.ws.close());
  wss.close();
  process.exit(0);
});
