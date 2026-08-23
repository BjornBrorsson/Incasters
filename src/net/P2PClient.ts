import { Peer, type DataConnection } from 'peerjs';
import type {
  PlayerInputState,
  NetPlayerInfo,
  RoomInfo,
  MatchConfig,
  GameStateSnapshot,
  GameEvent
} from './LanClient';

type EventHandler = (data: any) => void;

const PEER_PREFIX = 'incasters-room-';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function formatPeerId(roomCode: string): string {
  return `${PEER_PREFIX}${roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
}

export function cleanRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Serverless WebRTC Peer-to-Peer network client for online multiplayer.
 * Uses public STUN servers and PeerJS cloud broker for signaling, requiring
 * zero dedicated backend servers to be run by players.
 */
export class P2PClient {
  public playerId: string = '';
  public isHost: boolean = false;
  public roomCode: string = '';
  public roomInfo: RoomInfo | null = null;
  public connected: boolean = false;

  private peer: Peer | null = null;
  private hostConnection: DataConnection | null = null;
  private clientConnections: Map<string, { conn: DataConnection; name: string; ready: boolean }> = new Map();
  private nextClientId: number = 1;
  private handlers: Map<string, EventHandler[]> = new Map();
  private localName: string = 'Wizard';
  private localConfig: any = null;

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any) {
    const handlers = this.handlers.get(event);
    if (handlers) handlers.forEach((h) => h(data));
  }

  /**
   * Host an online room with a given or auto-generated room code.
   */
  createRoom(name: string, config: any, customCode?: string): Promise<string> {
    this.isHost = true;
    this.localName = name || 'Host Wizard';
    this.localConfig = config;
    this.roomCode = customCode ? cleanRoomCode(customCode) : generateRoomCode();
    this.playerId = 'host';

    return new Promise((resolve, reject) => {
      const fullPeerId = formatPeerId(this.roomCode);

      try {
        this.peer = new Peer(fullPeerId, {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Signaling server connection timeout'));
          this.disconnect();
        }
      }, 10000);

      this.peer.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.roomInfo = {
          players: [{ id: this.playerId, name: this.localName, ready: true }],
          hostId: this.playerId
        };

        this.emit('welcome', {
          playerId: this.playerId,
          roomInfo: this.roomInfo,
          isHost: true,
          roomCode: this.roomCode
        });

        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingClientConnection(conn);
      });

      this.peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
          // Retry with fresh random code if code was taken
          this.peer?.destroy();
          this.createRoom(name, config)
            .then(resolve)
            .catch(reject);
          return;
        }
        clearTimeout(timeout);
        this.emit('error', err);
        if (!this.connected) reject(err);
      });

      this.peer.on('close', () => {
        this.connected = false;
        this.emit('disconnect', {});
      });
    });
  }

  private handleIncomingClientConnection(conn: DataConnection) {
    const clientId = `p${this.nextClientId++}`;

    conn.on('open', () => {
      // Wait for join message
    });

    conn.on('data', (raw: any) => {
      let msg = raw;
      if (typeof raw === 'string') {
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
      }

      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'join': {
          const playerName = msg.name || `Player ${clientId}`;
          this.clientConnections.set(clientId, { conn, name: playerName, ready: false });

          // Send welcome to this client
          this.sendToConn(conn, {
            type: 'welcome',
            playerId: clientId,
            roomInfo: this.getRoomInfo(),
            isHost: false
          });

          // Broadcast new player join to all clients
          const joinMsg = {
            type: 'join',
            player: { id: clientId, name: playerName, ready: false }
          };
          this.broadcastToAllClients(joinMsg, clientId);

          // Update host's local room info and trigger event
          this.roomInfo = this.getRoomInfo();
          this.emit('playerJoin', joinMsg);
          break;
        }

        case 'ready': {
          const client = this.clientConnections.get(clientId);
          if (client) {
            client.ready = !!msg.ready;
            const readyMsg = { type: 'ready', playerId: clientId, ready: client.ready };
            this.broadcastToAllClients(readyMsg);
            this.emit('playerReady', readyMsg);
          }
          break;
        }

        case 'input': {
          this.emit('clientInput', { playerId: clientId, input: msg.input });
          break;
        }

        case 'leave': {
          this.handleClientLeave(clientId);
          break;
        }
      }
    });

    conn.on('close', () => {
      this.handleClientLeave(clientId);
    });

    conn.on('error', (err) => {
      console.warn(`Peer connection error for ${clientId}:`, err);
      this.handleClientLeave(clientId);
    });
  }

  private handleClientLeave(clientId: string) {
    if (this.clientConnections.has(clientId)) {
      this.clientConnections.delete(clientId);
      this.roomInfo = this.getRoomInfo();
      const leaveMsg = { type: 'leave', playerId: clientId, roomInfo: this.roomInfo };
      this.broadcastToAllClients(leaveMsg);
      this.emit('playerLeave', leaveMsg);
    }
  }

  private getRoomInfo(): RoomInfo {
    const list: NetPlayerInfo[] = [
      { id: this.playerId, name: this.localName, ready: true }
    ];
    this.clientConnections.forEach((val, id) => {
      list.push({ id, name: val.name, ready: val.ready });
    });
    return { players: list, hostId: this.playerId };
  }

  /**
   * Join an online room by room code.
   */
  joinRoom(roomCode: string, name: string, config: any): Promise<void> {
    this.isHost = false;
    this.roomCode = cleanRoomCode(roomCode);
    this.localName = name || 'Guest Wizard';
    this.localConfig = config;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer({
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });
      } catch (err) {
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Failed to connect to host room'));
          this.disconnect();
        }
      }, 10000);

      this.peer.on('open', () => {
        const hostPeerId = formatPeerId(this.roomCode);
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true
        });
        this.hostConnection = conn;

        conn.on('open', () => {
          this.connected = true;
          this.sendToHost({ type: 'join', name: this.localName, config: this.localConfig });
        });

        conn.on('data', (raw: any) => {
          let msg = raw;
          if (typeof raw === 'string') {
            try {
              msg = JSON.parse(raw);
            } catch {
              return;
            }
          }

          if (!msg || !msg.type) return;

          switch (msg.type) {
            case 'welcome':
              this.playerId = msg.playerId;
              this.isHost = false;
              this.roomInfo = msg.roomInfo;
              clearTimeout(timeout);
              this.emit('welcome', msg);
              resolve();
              break;
            case 'join':
              this.emit('playerJoin', msg);
              break;
            case 'leave':
              this.roomInfo = msg.roomInfo;
              this.emit('playerLeave', msg);
              break;
            case 'ready':
              this.emit('playerReady', msg);
              break;
            case 'start':
              this.emit('matchStart', msg);
              break;
            case 'state':
              this.emit('state', msg.state);
              break;
            case 'event':
              this.emit('event', msg.event);
              break;
            case 'end':
              this.emit('matchEnd', msg.result);
              break;
          }
        });

        conn.on('close', () => {
          this.connected = false;
          this.emit('disconnect', {});
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          this.emit('error', err);
          if (!this.connected) reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        this.emit('error', err);
        if (!this.connected) reject(err);
      });
    });
  }

  private sendToHost(data: any) {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(data);
    }
  }

  private sendToConn(conn: DataConnection, data: any) {
    if (conn.open) {
      conn.send(data);
    }
  }

  private broadcastToAllClients(data: any, excludeId?: string) {
    this.clientConnections.forEach((val, id) => {
      if (id !== excludeId && val.conn.open) {
        val.conn.send(data);
      }
    });
  }

  sendInput(input: PlayerInputState) {
    if (!this.isHost) {
      this.sendToHost({ type: 'input', input });
    }
  }

  setReady(ready: boolean) {
    if (!this.isHost) {
      this.sendToHost({ type: 'ready', ready });
    }
  }

  startMatch(config: MatchConfig) {
    if (this.isHost) {
      this.broadcastToAllClients({ type: 'start', config });
      this.emit('matchStart', { config });
    }
  }

  broadcastState(state: GameStateSnapshot) {
    if (this.isHost) {
      this.broadcastToAllClients({ type: 'state', state });
    }
  }

  broadcastEvent(event: GameEvent) {
    if (this.isHost) {
      this.broadcastToAllClients({ type: 'event', event });
    }
  }

  broadcastEnd(result: any) {
    if (this.isHost) {
      this.broadcastToAllClients({ type: 'end', result });
    }
  }

  disconnect() {
    if (this.isHost) {
      this.broadcastToAllClients({ type: 'leave', playerId: this.playerId });
      this.clientConnections.forEach((c) => c.conn.close());
      this.clientConnections.clear();
    } else if (this.hostConnection) {
      this.sendToHost({ type: 'leave' });
      this.hostConnection.close();
      this.hostConnection = null;
    }

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connected = false;
  }
}
