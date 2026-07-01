import './style.css';
import { Game } from './engine/Game';
import { GameModeType } from './world/GameModes';
import { MapType } from './world/Arena';
import {
  loadCharacterConfig,
  saveCharacterConfig,
  HAT_STYLES,
  ACCESSORY_STYLES,
  HAIR_STYLES,
  FACE_GEAR_STYLES,
  WEAPON_STYLES,
  EYE_COLORS,
  type CharacterConfig,
  type HatStyle,
  type AccessoryStyle,
  type HairStyle,
  type FaceGearStyle,
  type WeaponStyle
} from './game/CharacterConfig';
import { CharacterPreview } from './game/CharacterPreview';
import { progression, type MatchResult, type MatchSummary } from './game/Progression';
import { loadDifficulty, saveDifficulty, type DifficultyLevel } from './game/Difficulty';
import { LanClient, ClientGameRenderer, type GameStateSnapshot, type NetPlayerInfo } from './net/LanClient';

/**
 * Lightweight keyboard + gamepad navigator for the menu / game-over screens.
 * Runs only while an overlay is visible, so it never contends with the in-game
 * InputManager (gameplay and menus are mutually exclusive in time).
 */
class MenuNavigator {
  private focusIndex = 0;
  private navCooldown = 0;
  private lastTs = 0;
  private aPrev = false;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    const loop = (ts: number) => {
      requestAnimationFrame(loop);
      this.pollGamepad(ts);
    };
    requestAnimationFrame(loop);
  }

  private getContainer(): HTMLElement | null {
    const gameover = document.getElementById('gameover-overlay');
    if (gameover && gameover.offsetParent !== null) return gameover;
    const menu = document.getElementById('menu-screen');
    if (menu && menu.offsetParent !== null) return menu;
    return null;
  }

  private getItems(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>('button, .color-dot')).filter(
      (el) => el.offsetParent !== null
    );
  }

  private highlight(items: HTMLElement[]) {
    items.forEach((el, i) => el.classList.toggle('kb-focus', i === this.focusIndex));
    const el = items[this.focusIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  private move(dir: number) {
    const container = this.getContainer();
    if (!container) return;
    const items = this.getItems(container);
    if (items.length === 0) return;
    this.focusIndex = (this.focusIndex + dir + items.length) % items.length;
    this.highlight(items);
  }

  private activate() {
    const container = this.getContainer();
    if (!container) return;
    const items = this.getItems(container);
    if (this.focusIndex >= items.length) this.focusIndex = 0;
    items[this.focusIndex]?.click();
  }

  private onKeyDown(e: KeyboardEvent) {
    const container = this.getContainer();
    if (!container) return;
    const items = this.getItems(container);
    if (this.focusIndex >= items.length) this.focusIndex = 0;
    if (!container.querySelector('.kb-focus')) this.highlight(items);

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        this.move(1);
        break;
      case 'Enter':
        e.preventDefault();
        this.activate();
        break;
    }
  }

  private pollGamepad(ts: number) {
    const dt = this.lastTs ? (ts - this.lastTs) / 1000 : 0;
    this.lastTs = ts;

    const container = this.getContainer();
    if (!container) {
      this.navCooldown = 0;
      return;
    }

    const items = this.getItems(container);
    if (items.length === 0) return;
    if (this.focusIndex >= items.length) this.focusIndex = 0;
    if (!container.querySelector('.kb-focus')) this.highlight(items);

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
    if (!gp) return;

    const v = gp.axes[1] || 0;
    const h = gp.axes[0] || 0;
    const up = (gp.buttons[12] && gp.buttons[12].pressed) || v < -0.5 || h < -0.5;
    const down = (gp.buttons[13] && gp.buttons[13].pressed) || v > 0.5 || h > 0.5;

    this.navCooldown -= dt;
    if (up || down) {
      if (this.navCooldown <= 0) {
        this.move(up ? -1 : 1);
        this.navCooldown = 0.18;
      }
    } else {
      this.navCooldown = 0;
    }

    const a = (gp.buttons[0] && gp.buttons[0].pressed) || false;
    if (a && !this.aPrev) this.activate();
    this.aPrev = a;
  }
}

const CUSTOM_COLORS = [
  { hex: 0xff007f, css: '#ff007f' }, // Pink
  { hex: 0x00f0ff, css: '#00f0ff' }, // Cyan
  { hex: 0x39ff14, css: '#39ff14' }, // Lime Green
  { hex: 0xff5f1f, css: '#ff5f1f' }, // Orange
  { hex: 0xb026ff, css: '#b026ff' }, // Purple
  { hex: 0xffe200, css: '#ffe200' }, // Yellow
  { hex: 0xff1122, css: '#ff1122' }, // Red
  { hex: 0x0044ff, css: '#0044ff' }  // Blue
];

let selectedMode: GameModeType = GameModeType.BATTLE_ROYALE;
let selectedControl: 'TARGET' | 'MANUAL' = 'TARGET';
const characterConfig: CharacterConfig = loadCharacterConfig();
// Grandfather the player's currently-selected cosmetics so they stay usable
progression.grantPart(`hat:${characterConfig.hat}`);
progression.grantPart(`acc:${characterConfig.accessory}`);
progression.grantPart(`hair:${characterConfig.hair}`);
progression.grantPart(`face:${characterConfig.faceGear}`);
progression.grantPart(`weapon:${characterConfig.weapon}`);
let selectedMap: MapType = (localStorage.getItem('incasters_map') || 'ARENA') as MapType;
let selectedPlayerCount = parseInt(localStorage.getItem('incasters_player_count') || '8', 10);
let selectedDifficulty: DifficultyLevel = loadDifficulty();
let game: Game | null = null;

// LAN Multiplayer state
let lanClient: LanClient | null = null;
let lanRenderer: ClientGameRenderer | null = null;
let lanMode: 'offline' | 'host' | 'client' = 'offline';
let lanPlayers: NetPlayerInfo[] = [];
void lanMode; // referenced in event handlers below

// Initialize Menu Controls
document.addEventListener('DOMContentLoaded', () => {
  const modeBrBtn = document.getElementById('btn-mode-br');
  const modeTdmBtn = document.getElementById('btn-mode-tdm');
  const modeGoldBtn = document.getElementById('btn-mode-gold');

  const ctrlTargetBtn = document.getElementById('btn-ctrl-target');
  const ctrlManualBtn = document.getElementById('btn-ctrl-manual');

  const mapArenaBtn = document.getElementById('btn-map-arena');
  const mapColosseumBtn = document.getElementById('btn-map-colosseum');
  const mapChamberBtn = document.getElementById('btn-map-chamber');

  const playerCountBtns = document.querySelectorAll('.player-count-btn');

  const robePicker = document.getElementById('robe-color-picker');
  const spellPicker = document.getElementById('spell-color-picker');
  const eyePicker = document.getElementById('eye-color-picker');
  const hairPicker = document.getElementById('hair-picker');
  const hatPicker = document.getElementById('hat-picker');
  const faceGearPicker = document.getElementById('facegear-picker');
  const weaponPicker = document.getElementById('weapon-picker');
  const accessoryPicker = document.getElementById('accessory-picker');
  const previewContainer = document.getElementById('char-preview');
  const progressBadge = document.getElementById('progress-badge');
  const challengesList = document.getElementById('challenges-list');
  const matchSummary = document.getElementById('match-summary');

  const playBtn = document.getElementById('btn-play');
  const restartBtn = document.getElementById('btn-restart');

  const menuScreen = document.getElementById('menu-screen');
  const hudContainer = document.getElementById('hud-container');
  const gameOverOverlay = document.getElementById('gameover-overlay');
  const gameContainer = document.getElementById('game-container') as HTMLDivElement;

  // Progression UI helpers
  const refreshBadge = () => {
    if (!progressBadge) return;
    const pct = Math.round((progression.xpIntoLevel / progression.xpForLevel) * 100);
    progressBadge.innerHTML =
      `<span class="pb-level">LV ${progression.level}</span>` +
      `<span class="pb-xpbar"><span class="pb-xpfill" style="width:${pct}%"></span></span>` +
      `<span class="pb-tokens">${progression.tokens} \u{1FA99}</span>`;
  };

  const renderChallenges = () => {
    if (!challengesList) return;
    const daily = progression.challenges.filter((c) => c.cadence === 'daily');
    const weekly = progression.challenges.filter((c) => c.cadence === 'weekly');
    const renderGroup = (label: string, items: typeof daily) => {
      if (items.length === 0) return '';
      const header = '<div class="challenge-group-label">' + label + '</div>';
      const rows = items
        .map((c) => {
          const pct = Math.round((c.progress / c.goal) * 100);
          const cls = c.done ? 'challenge-item done' : 'challenge-item';
          return (
            '<div class="' + cls + '">' +
            '<div class="challenge-top"><span>' + c.desc + '</span><span>' + c.progress + '/' + c.goal + ' \u00B7 ' + c.reward + '\u{1FA99}</span></div>' +
            '<div class="challenge-bar"><span style="width:' + pct + '%"></span></div>' +
            '</div>'
          );
        })
        .join('');
      return header + rows;
    };
    challengesList.innerHTML = renderGroup('DAILY', daily) + renderGroup('WEEKLY', weekly);
  };

  const showMatchSummary = (result: MatchResult, summary: MatchSummary) => {
    if (!matchSummary) return;
    let html =
      `<div class="ms-row"><span>Result</span><span>${result.won ? 'VICTORY' : 'DEFEAT'}</span></div>` +
      `<div class="ms-row"><span>Eliminations</span><span>${result.kills}</span></div>` +
      `<div class="ms-row"><span>XP gained</span><span>+${summary.xpGained}</span></div>` +
      `<div class="ms-row"><span>Tokens earned</span><span>+${summary.tokensGained} \u{1FA99}</span></div>`;
    if (summary.newLevel) html += `<div class="ms-levelup">LEVEL UP! Now level ${summary.newLevel}</div>`;
    summary.completed.forEach((c) => {
      html += `<div class="ms-challenge">\u2714 ${c.desc} (+${c.reward} \u{1FA99})</div>`;
    });
    matchSummary.innerHTML = html;
  };

  // Toggle Mode Selection
  const setMode = (mode: GameModeType, activeBtn: HTMLElement) => {
    selectedMode = mode;
    [modeBrBtn, modeTdmBtn, modeGoldBtn].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');
  };

  modeBrBtn?.addEventListener('click', () => setMode(GameModeType.BATTLE_ROYALE, modeBrBtn));
  modeTdmBtn?.addEventListener('click', () => setMode(GameModeType.TEAM_BATTLE, modeTdmBtn));
  modeGoldBtn?.addEventListener('click', () => setMode(GameModeType.GOLD_RUSH, modeGoldBtn));

  // Toggle Control Selection
  const setControl = (control: 'TARGET' | 'MANUAL', activeBtn: HTMLElement) => {
    selectedControl = control;
    [ctrlTargetBtn, ctrlManualBtn].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');
  };

  ctrlTargetBtn?.addEventListener('click', () => setControl('TARGET', ctrlTargetBtn));
  ctrlManualBtn?.addEventListener('click', () => setControl('MANUAL', ctrlManualBtn));

  // Toggle Map Selection
  const setMap = (map: MapType, activeBtn: HTMLElement) => {
    selectedMap = map;
    [mapArenaBtn, mapColosseumBtn, mapChamberBtn].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');
    localStorage.setItem('incasters_map', map);
  };

  mapArenaBtn?.addEventListener('click', () => setMap('ARENA', mapArenaBtn));
  mapColosseumBtn?.addEventListener('click', () => setMap('COLOSSEUM', mapColosseumBtn));
  mapChamberBtn?.addEventListener('click', () => setMap('CHAMBER', mapChamberBtn));

  // Set initial active state for map buttons
  [
    { map: 'ARENA', btn: mapArenaBtn },
    { map: 'COLOSSEUM', btn: mapColosseumBtn },
    { map: 'CHAMBER', btn: mapChamberBtn }
  ].forEach((item) => {
    if (item.map === selectedMap) {
      item.btn?.classList.add('active');
    } else {
      item.btn?.classList.remove('active');
    }
  });

  // Setup Player Count Buttons
  playerCountBtns.forEach((btn) => {
    const count = parseInt(btn.getAttribute('data-count') || '8', 10);
    if (count === selectedPlayerCount) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      playerCountBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPlayerCount = count;
      localStorage.setItem('incasters_player_count', count.toString());
    });
  });

  // Difficulty selector
  const diffBtns = document.querySelectorAll('.diff-btn');
  diffBtns.forEach((btn) => {
    const diff = btn.getAttribute('data-diff') as DifficultyLevel;
    if (diff === selectedDifficulty) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      diffBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = diff;
      saveDifficulty(diff);
    });
  });

  // ── LAN Multiplayer UI ──
  const btnLanHost = document.getElementById('btn-lan-host') as HTMLButtonElement | null;
  const btnLanJoin = document.getElementById('btn-lan-join') as HTMLButtonElement | null;
  const lanHostPanel = document.getElementById('lan-host-panel');
  const lanJoinPanel = document.getElementById('lan-join-panel');
  const lanLobby = document.getElementById('lan-lobby');
  const btnLanStartServer = document.getElementById('btn-lan-start-server') as HTMLButtonElement | null;
  const btnLanConnect = document.getElementById('btn-lan-connect') as HTMLButtonElement | null;
  const btnLanReady = document.getElementById('btn-lan-ready') as HTMLButtonElement | null;
  const btnLanStartMatch = document.getElementById('btn-lan-start-match') as HTMLButtonElement | null;
  const btnLanLeave = document.getElementById('btn-lan-leave') as HTMLButtonElement | null;
  const lanJoinStatus = document.getElementById('lan-join-status');
  const lanRoomInfo = document.getElementById('lan-room-info');
  const lanLobbyPlayers = document.getElementById('lan-lobby-players');

  function renderLobbyPlayers() {
    if (!lanLobbyPlayers) return;
    lanLobbyPlayers.innerHTML = lanPlayers
      .map((p) => {
        const isHost = lanClient?.roomInfo?.hostId === p.id;
        const readyClass = p.ready ? 'player-ready' : 'player-not-ready';
        const readyText = p.ready ? 'Ready' : 'Not Ready';
        const hostBadge = isHost ? '<span class="player-host">HOST</span>' : '';
        return '<div class="lan-player-item"><span>' + p.name + ' ' + hostBadge + '</span><span class="' + readyClass + '">' + readyText + '</span></div>';
      })
      .join('');
  }

  function showLobby() {
    if (lanHostPanel) lanHostPanel.style.display = 'none';
    if (lanJoinPanel) lanJoinPanel.style.display = 'none';
    if (lanLobby) lanLobby.style.display = 'block';
    renderLobbyPlayers();
    // Only host sees the Start Match button
    if (btnLanStartMatch) btnLanStartMatch.style.display = lanClient?.isHost ? 'block' : 'none';
  }

  function hideLobby() {
    if (lanLobby) lanLobby.style.display = 'none';
  }

  function updateLobbyFromRoom(roomInfo: any) {
    lanPlayers = roomInfo.players || [];
    renderLobbyPlayers();
    if (btnLanStartMatch) btnLanStartMatch.style.display = lanClient?.isHost ? 'block' : 'none';
  }

  btnLanHost?.addEventListener('click', () => {
    if (btnLanHost) btnLanHost.classList.add('active');
    if (btnLanJoin) btnLanJoin.classList.remove('active');
    if (lanHostPanel) lanHostPanel.style.display = 'block';
    if (lanJoinPanel) lanJoinPanel.style.display = 'none';
    if (lanLobby) lanLobby.style.display = 'none';
  });

  btnLanJoin?.addEventListener('click', () => {
    if (btnLanJoin) btnLanJoin.classList.add('active');
    if (btnLanHost) btnLanHost.classList.remove('active');
    if (lanJoinPanel) lanJoinPanel.style.display = 'block';
    if (lanHostPanel) lanHostPanel.style.display = 'none';
    if (lanLobby) lanLobby.style.display = 'none';
  });

  // Host: Start LAN Server
  btnLanStartServer?.addEventListener('click', async () => {
    if (!btnLanStartServer) return;
    btnLanStartServer.disabled = true;
    btnLanStartServer.textContent = 'Starting server...';

    try {
      // The server runs as a separate Node process. On desktop, we can spawn it.
      // On mobile (Capacitor), the host would need a separate server device.
      const port = (document.getElementById('lan-host-port') as HTMLInputElement)?.value || '7070';

      // Try to start the server via a fetch to a local helper, or spawn a child process
      // For now, we connect to the server URL (server must be started separately)
      const serverUrl = 'ws://localhost:' + port;
      lanClient = new LanClient(serverUrl);
      lanMode = 'host';

      await lanClient.connect('Host', characterConfig);
      lanPlayers = lanClient.roomInfo?.players || [];

      if (lanRoomInfo) {
        lanRoomInfo.innerHTML = '<p class="lan-status success">Server connected! Your LAN game is live.</p><div id="lan-player-list" class="lan-player-list"></div>';
      }

      showLobby();
      setupLanHandlers();
    } catch (e: any) {
      if (lanRoomInfo) {
        lanRoomInfo.innerHTML = '<p class="lan-status error">Failed to start: ' + e.message + '</p><p class="lan-status">Make sure to run the LAN server first: <code>node server/lan-server.js</code></p>';
      }
      btnLanStartServer.disabled = false;
      btnLanStartServer.textContent = 'Start LAN Server';
    }
  });

  // Join: Connect to host
  btnLanConnect?.addEventListener('click', async () => {
    if (!btnLanConnect) return;
    const ip = (document.getElementById('lan-join-ip') as HTMLInputElement)?.value || 'localhost';
    const port = (document.getElementById('lan-join-port') as HTMLInputElement)?.value || '7070';
    const serverUrl = 'ws://' + ip + ':' + port;

    if (lanJoinStatus) {
      lanJoinStatus.textContent = 'Connecting to ' + ip + ':' + port + '...';
      lanJoinStatus.className = 'lan-status';
    }
    btnLanConnect.disabled = true;

    try {
      lanClient = new LanClient(serverUrl);
      lanMode = 'client';

      await lanClient.connect('Player', characterConfig);
      lanPlayers = lanClient.roomInfo?.players || [];

      if (lanJoinStatus) {
        lanJoinStatus.textContent = 'Connected!';
        lanJoinStatus.className = 'lan-status success';
      }

      showLobby();
      setupLanHandlers();
    } catch (e: any) {
      if (lanJoinStatus) {
        lanJoinStatus.textContent = 'Connection failed: ' + e.message;
        lanJoinStatus.className = 'lan-status error';
      }
      btnLanConnect.disabled = false;
    }
  });

  // Ready button
  btnLanReady?.addEventListener('click', () => {
    if (!lanClient) return;
    const isReady = btnLanReady.textContent === 'Ready';
    lanClient.setReady(!isReady);
    btnLanReady.textContent = isReady ? 'Not Ready' : 'Ready';
  });

  // Start Match (host only)
  btnLanStartMatch?.addEventListener('click', () => {
    if (!lanClient || !lanClient.isHost) return;
    lanClient.startMatch({
      mode: selectedMode,
      map: selectedMap,
      playerCount: selectedPlayerCount,
      difficulty: selectedDifficulty
    });
  });

  // Leave lobby
  btnLanLeave?.addEventListener('click', () => {
    if (lanClient) {
      lanClient.disconnect();
      lanClient = null;
    }
    lanMode = 'offline';
    lanPlayers = [];
    hideLobby();
    if (btnLanHost) btnLanHost.classList.remove('active');
    if (btnLanJoin) btnLanJoin.classList.remove('active');
    if (lanHostPanel) lanHostPanel.style.display = 'block';
    if (lanJoinPanel) lanJoinPanel.style.display = 'none';
    if (btnLanStartServer) {
      btnLanStartServer.disabled = false;
      btnLanStartServer.textContent = 'Start LAN Server';
    }
    if (btnLanConnect) btnLanConnect.disabled = false;
  });

  function setupLanHandlers() {
    if (!lanClient) return;

    lanClient.on('playerJoin', (msg: any) => {
      lanPlayers.push({ id: msg.player.id, name: msg.player.name, ready: msg.player.ready });
      renderLobbyPlayers();
    });

    lanClient.on('playerLeave', (msg: any) => {
      lanPlayers = lanPlayers.filter((p) => p.id !== msg.playerId);
      if (msg.roomInfo) updateLobbyFromRoom(msg.roomInfo);
      renderLobbyPlayers();
    });

    lanClient.on('playerReady', (msg: any) => {
      const p = lanPlayers.find((p) => p.id === msg.playerId);
      if (p) p.ready = msg.ready;
      renderLobbyPlayers();
    });

    lanClient.on('matchStart', (msg: any) => {
      // Start the game in the appropriate mode
      const config = msg.config || {};
      const matchMode = (config.mode || selectedMode) as GameModeType;
      const matchMap = (config.map || selectedMap) as MapType;
      const matchPlayerCount = config.playerCount || selectedPlayerCount;
      const matchDifficulty = (config.difficulty || selectedDifficulty) as DifficultyLevel;

      if (lanClient?.isHost) {
        // Host: start the real game with networking hooks
        startLanHostGame(matchMode, matchMap, matchPlayerCount, matchDifficulty);
      } else {
        // Client: start the lightweight renderer
        startLanClientGame(matchMode, matchMap);
      }
    });

    lanClient.on('state', (state: GameStateSnapshot) => {
      if (lanRenderer) {
        lanRenderer.applyState(state);
      }
    });

    lanClient.on('matchEnd', (result: any) => {
      // Show game over screen
      if (lanRenderer) {
        lanRenderer.destroy();
        lanRenderer = null;
      }
      showLanGameOver(result);
    });

    lanClient.on('disconnect', () => {
      if (lanRenderer) {
        lanRenderer.destroy();
        lanRenderer = null;
      }
      hideLobby();
      lanMode = 'offline';
    });
  }

  function startLanHostGame(mode: GameModeType, map: MapType, playerCount: number, difficulty: DifficultyLevel) {
    if (menuScreen) menuScreen.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    game = new Game(
      gameContainer,
      mode,
      characterConfig.robeColor,
      characterConfig.spellColor,
      map,
      playerCount,
      { ...characterConfig },
      difficulty
    );
    game.netMode = 'host';

    // Register connected remote players
    lanPlayers.forEach((p) => {
      if (p.id !== lanClient?.playerId) {
        game?.registerRemotePlayer(p.id, p.name);
      }
    });

    // Set up state broadcasting
    if (lanClient) {
      game.onNetBroadcast = (state: GameStateSnapshot) => {
        lanClient!.broadcastState(state);
      };
    }

    game.startGame();
  }

  function startLanClientGame(_mode: GameModeType, _map: MapType) {
    if (menuScreen) menuScreen.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    // Client uses the lightweight renderer
    lanRenderer = new ClientGameRenderer(gameContainer);
    if (lanClient) lanRenderer.setLocalPlayerId(lanClient.playerId);
  }

  function showLanGameOver(result: any) {
    if (hudContainer) hudContainer.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'flex';
    const winnerEl = document.getElementById('winner-text');
    if (winnerEl) winnerEl.textContent = result?.winnerText || 'Match Over';
  }

  // Live 3D preview of the customised wizard (guarded so a WebGL failure can't break the menu)
  let preview: CharacterPreview | null = null;
  if (previewContainer) {
    try {
      preview = new CharacterPreview(previewContainer);
      preview.setConfig(characterConfig);
    } catch (e) {
      console.warn('Character preview unavailable', e);
    }
  }
  const refreshPreview = () => preview?.setConfig(characterConfig);

  // Color pickers (robe + spell)
  const setupColorPicker = (pickerEl: HTMLElement | null, currentValue: number, onSelect: (val: number) => void) => {
    if (!pickerEl) return;
    CUSTOM_COLORS.forEach((color) => {
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = color.css;
      dot.style.color = color.css;
      if (color.hex === currentValue) {
        dot.classList.add('active');
        dot.style.boxShadow = `0 0 10px ${color.css}`;
      }

      dot.addEventListener('click', () => {
        pickerEl.querySelectorAll('.color-dot').forEach((d) => {
          d.classList.remove('active');
          (d as HTMLElement).style.boxShadow = '';
        });
        dot.classList.add('active');
        dot.style.boxShadow = `0 0 10px ${color.css}`;
        onSelect(color.hex);
        saveCharacterConfig(characterConfig);
        refreshPreview();
      });
      pickerEl.appendChild(dot);
    });
  };

  setupColorPicker(robePicker, characterConfig.robeColor, (val) => { characterConfig.robeColor = val; });
  setupColorPicker(spellPicker, characterConfig.spellColor, (val) => { characterConfig.spellColor = val; });

  // Eye colour picker (uses EYE_COLORS list)
  const setupEyeColorPicker = (pickerEl: HTMLElement | null, currentValue: number, onSelect: (val: number) => void) => {
    if (!pickerEl) return;
    EYE_COLORS.forEach((hex) => {
      const css = '#' + hex.toString(16).padStart(6, '0');
      const dot = document.createElement('div');
      dot.className = 'color-dot';
      dot.style.backgroundColor = css;
      dot.style.color = css;
      if (hex === currentValue) {
        dot.classList.add('active');
        dot.style.boxShadow = `0 0 10px ${css}`;
      }
      dot.addEventListener('click', () => {
        pickerEl.querySelectorAll('.color-dot').forEach((d) => {
          d.classList.remove('active');
          (d as HTMLElement).style.boxShadow = '';
        });
        dot.classList.add('active');
        dot.style.boxShadow = `0 0 10px ${css}`;
        onSelect(hex);
        saveCharacterConfig(characterConfig);
        refreshPreview();
      });
      pickerEl.appendChild(dot);
    });
  };
  setupEyeColorPicker(eyePicker, characterConfig.eyeColor, (val) => { characterConfig.eyeColor = val; });

  // Part pickers (hat + accessory) with token-gated unlocks
  const setupPartPicker = <T extends string>(
    pickerEl: HTMLElement | null,
    prefix: string,
    options: { id: T; label: string }[],
    current: T,
    onSelect: (id: T) => void
  ) => {
    if (!pickerEl) return;
    options.forEach((opt) => {
      const key = `${prefix}:${opt.id}`;
      const btn = document.createElement('button');
      btn.className = 'part-btn';

      const render = () => {
        if (progression.isPartUnlocked(key)) {
          btn.textContent = opt.label;
          btn.classList.remove('locked');
        } else {
          btn.textContent = `\uD83D\uDD12 ${opt.label} \u00B7 ${progression.partCost(key)}\u{1FA99}`;
          btn.classList.add('locked');
        }
      };
      render();
      if (opt.id === current && progression.isPartUnlocked(key)) btn.classList.add('active');

      btn.addEventListener('click', () => {
        if (!progression.isPartUnlocked(key)) {
          if (!progression.unlockPart(key)) {
            btn.classList.add('denied');
            setTimeout(() => btn.classList.remove('denied'), 400);
            return;
          }
          render();
          refreshBadge();
        }
        pickerEl.querySelectorAll('.part-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(opt.id);
        saveCharacterConfig(characterConfig);
        refreshPreview();
      });

      pickerEl.appendChild(btn);
    });
  };

  setupPartPicker<HatStyle>(hatPicker, 'hat', HAT_STYLES, characterConfig.hat, (id) => { characterConfig.hat = id; });
  setupPartPicker<AccessoryStyle>(accessoryPicker, 'acc', ACCESSORY_STYLES, characterConfig.accessory, (id) => { characterConfig.accessory = id; });
  setupPartPicker<HairStyle>(hairPicker, 'hair', HAIR_STYLES, characterConfig.hair, (id) => { characterConfig.hair = id; });
  setupPartPicker<FaceGearStyle>(faceGearPicker, 'face', FACE_GEAR_STYLES, characterConfig.faceGear, (id) => { characterConfig.faceGear = id; });
  setupPartPicker<WeaponStyle>(weaponPicker, 'weapon', WEAPON_STYLES, characterConfig.weapon, (id) => { characterConfig.weapon = id; });

  refreshBadge();
  renderChallenges();

  // Start Game callback
  playBtn?.addEventListener('click', () => {
    // Hide menu screen
    if (menuScreen) menuScreen.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    // Cleanup previous instance if any
    if (game) {
      game.cleanup();
    }

    // Instantiate new game with selections
    game = new Game(
      gameContainer,
      selectedMode,
      characterConfig.robeColor,
      characterConfig.spellColor,
      selectedMap,
      selectedPlayerCount,
      { ...characterConfig },
      selectedDifficulty
    );
    game.controlMode = selectedControl;
    game.onMatchEnd = (result) => {
      const summary = progression.recordMatch(result);
      showMatchSummary(result, summary);
      refreshBadge();
      renderChallenges();
    };
    game.startGame();
    
    // Start game tick loop
    game.tick();
  });

  // Play Again callback
  restartBtn?.addEventListener('click', () => {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    if (game) {
      game.playerConfig = { ...characterConfig };
      game.playerRobeColor = characterConfig.robeColor;
      game.playerSpellColor = characterConfig.spellColor;
      game.mapType = selectedMap;
      game.playerCount = selectedPlayerCount;
      game.difficulty = selectedDifficulty;
      game.resetGame();
      game.startGame();
    }
  });

  // Enable keyboard + gamepad navigation of menu & game-over screens
  new MenuNavigator();
});
