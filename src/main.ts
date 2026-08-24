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
import { loadGraphicsQuality, saveGraphicsQuality, type GraphicsQuality } from './game/GraphicsSettings';
import { LanClient, ClientGameRenderer, type GameStateSnapshot, type NetPlayerInfo, type PlayerInputState } from './net/LanClient';
import { P2PClient, cleanRoomCode } from './net/P2PClient';
import {
  getAudioSettings,
  music,
  setMasterVolume,
  setMusicEnabled,
  setMusicVolume,
  setSfxVolume,
  sfx
} from './engine/Audio';

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

// Multiplayer state (LAN + Serverless P2P)
let lanClient: LanClient | null = null;
let p2pClient: P2PClient | null = null;
let lanRenderer: ClientGameRenderer | null = null;
let lanPlayers: NetPlayerInfo[] = [];
let p2pPlayers: NetPlayerInfo[] = [];
let netLocalTeam: string | null = null;
let countdownRunId = 0;
let countdownTimeout = 0;

function cancelPregameCountdown() {
  countdownRunId++;
  window.clearTimeout(countdownTimeout);
  const overlay = document.getElementById('countdown-overlay');
  if (overlay) overlay.classList.remove('visible', 'cast');
}

function startPregameCountdown(onComplete: () => void) {
  cancelPregameCountdown();
  const runId = countdownRunId;
  const overlay = document.getElementById('countdown-overlay');
  const text = document.getElementById('countdown-text');
  if (!overlay || !text) {
    onComplete();
    return;
  }

  const steps = [
    { label: '3', cast: false },
    { label: '2', cast: false },
    { label: '1', cast: false },
    { label: 'CAST!', cast: true }
  ];
  let stepIndex = 0;
  overlay.classList.add('visible');

  const advance = () => {
    if (runId !== countdownRunId) return;
    if (stepIndex >= steps.length) {
      overlay.classList.remove('visible', 'cast');
      onComplete();
      return;
    }
    const step = steps[stepIndex++];
    text.textContent = step.label;
    overlay.classList.toggle('cast', step.cast);
    text.classList.remove('countdown-pop');
    void text.offsetWidth;
    text.classList.add('countdown-pop');
    sfx.playCountdown(step.cast);
    countdownTimeout = window.setTimeout(advance, step.cast ? 700 : 850);
  };

  advance();
}

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
  const mapObservatoryBtn = document.getElementById('btn-map-observatory');
  const mapCatacombsBtn = document.getElementById('btn-map-catacombs');

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
  const optionsBtn = document.getElementById('btn-options') as HTMLButtonElement | null;
  const optionsPanel = document.getElementById('options-panel');
  const masterVolume = document.getElementById('master-volume') as HTMLInputElement | null;
  const musicVolume = document.getElementById('music-volume') as HTMLInputElement | null;
  const sfxVolume = document.getElementById('sfx-volume') as HTMLInputElement | null;
  const musicEnabled = document.getElementById('music-enabled') as HTMLInputElement | null;

  const playBtn = document.getElementById('btn-play');
  const restartBtn = document.getElementById('btn-restart');

  const menuScreen = document.getElementById('menu-screen');
  const hudContainer = document.getElementById('hud-container');
  const gameOverOverlay = document.getElementById('gameover-overlay');
  const gameContainer = document.getElementById('game-container') as HTMLDivElement;

  optionsBtn?.addEventListener('click', () => {
    if (!optionsPanel) return;
    const expanded = optionsBtn.getAttribute('aria-expanded') === 'true';
    optionsBtn.setAttribute('aria-expanded', String(!expanded));
    optionsPanel.hidden = expanded;
  });

  const bindVolume = (
    input: HTMLInputElement | null,
    outputId: string,
    initialValue: number,
    setter: (value: number) => void
  ) => {
    const output = document.getElementById(outputId) as HTMLOutputElement | null;
    if (!input) return;
    const render = () => {
      const value = Number(input.value);
      if (output) output.value = `${value}%`;
      setter(value / 100);
    };
    input.value = String(Math.round(initialValue * 100));
    if (output) output.value = `${input.value}%`;
    input.addEventListener('input', render);
  };

  const savedAudio = getAudioSettings();
  bindVolume(masterVolume, 'master-volume-value', savedAudio.masterVolume, setMasterVolume);
  bindVolume(musicVolume, 'music-volume-value', savedAudio.musicVolume, setMusicVolume);
  bindVolume(sfxVolume, 'sfx-volume-value', savedAudio.sfxVolume, setSfxVolume);
  if (musicEnabled) {
    musicEnabled.checked = savedAudio.musicEnabled;
    musicEnabled.addEventListener('change', () => setMusicEnabled(musicEnabled.checked));
  }

  let audioStarted = false;
  const startAudio = () => {
    if (audioStarted) return;
    audioStarted = true;
    sfx.preload();
    void music.playMenu();
  };
  window.addEventListener('pointerdown', startAudio, { once: true });
  window.addEventListener('keydown', startAudio, { once: true });

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

  const hideGlobalTouchControls = () => {
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      fireBtn.style.display = 'none';
      fireBtn.classList.remove('pressed', 'empty');
    }
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) {
      dashBtn.style.display = 'none';
      dashBtn.classList.remove('pressed');
    }
    const joyLeft = document.getElementById('joy-left');
    if (joyLeft) joyLeft.style.display = 'none';
    const joyRight = document.getElementById('joy-right');
    if (joyRight) joyRight.style.display = 'none';
  };

  // Ensure touch controls are hidden initially on menu load
  hideGlobalTouchControls();

  const wireGameCallbacks = (activeGame: Game) => {
    activeGame.onMatchEnd = (result) => {
      hideGlobalTouchControls();
      const specHud = document.getElementById('spectator-hud');
      if (specHud) specHud.style.display = 'none';
      const elimOverlay = document.getElementById('elimination-overlay');
      if (elimOverlay) elimOverlay.style.display = 'none';

      const summary = progression.recordMatch(result);
      showMatchSummary(result, summary);
      refreshBadge();
      renderChallenges();
    };

    activeGame.onPlayerEliminated = (data) => {
      hideGlobalTouchControls();
      const summary = progression.recordMatch({ won: false, kills: data.kills, mode: activeGame.gameModeManager.type });
      const elimOverlay = document.getElementById('elimination-overlay');
      const elimRank = document.getElementById('elimination-rank');
      const elimSummary = document.getElementById('elimination-summary');
      if (elimRank) {
        elimRank.textContent = `Finished #${data.rank} of ${data.totalPlayers} Casters`;
      }
      if (elimSummary) {
        elimSummary.innerHTML = `
          <div class="ms-row"><span>Kills</span><strong>${data.kills}</strong></div>
          <div class="ms-row"><span>Tokens Earned</span><strong style="color:#ffd23d;">+${summary.tokensGained} \u{1FA99}</strong></div>
          <div class="ms-row"><span>XP Earned</span><strong style="color:#e0a020;">+${summary.xpGained} XP</strong></div>
          ${summary.newLevel ? `<div class="ms-levelup">\u{1F389} LEVEL UP! Now Level ${summary.newLevel}!</div>` : ''}
        `;
      }
      if (elimOverlay) elimOverlay.style.display = 'flex';
      const hud = document.getElementById('hud-container');
      if (hud) hud.style.display = 'none';
      refreshBadge();
      renderChallenges();
    };

    activeGame.onSpectateChange = (data) => {
      const specName = document.getElementById('spec-target-name');
      const specCount = document.getElementById('spec-alive-count');
      if (specName) specName.textContent = data.name;
      if (specCount) specCount.textContent = `(${data.aliveCount} Casters Left)`;
    };
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
    [mapArenaBtn, mapColosseumBtn, mapChamberBtn, mapObservatoryBtn, mapCatacombsBtn].forEach((btn) => {
      btn?.classList.remove('active');
    });
    activeBtn.classList.add('active');
    localStorage.setItem('incasters_map', map);
  };

  mapArenaBtn?.addEventListener('click', () => setMap('ARENA', mapArenaBtn));
  mapColosseumBtn?.addEventListener('click', () => setMap('COLOSSEUM', mapColosseumBtn));
  mapChamberBtn?.addEventListener('click', () => setMap('CHAMBER', mapChamberBtn));
  mapObservatoryBtn?.addEventListener('click', () => setMap('OBSERVATORY', mapObservatoryBtn));
  mapCatacombsBtn?.addEventListener('click', () => setMap('CATACOMBS', mapCatacombsBtn));

  // Set initial active state for map buttons
  [
    { map: 'ARENA', btn: mapArenaBtn },
    { map: 'COLOSSEUM', btn: mapColosseumBtn },
    { map: 'CHAMBER', btn: mapChamberBtn },
    { map: 'OBSERVATORY', btn: mapObservatoryBtn },
    { map: 'CATACOMBS', btn: mapCatacombsBtn }
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

  // Graphics Quality Preset Buttons
  let selectedGraphics: GraphicsQuality = loadGraphicsQuality();
  const gfxBtns = document.querySelectorAll<HTMLButtonElement>('.gfx-btn');
  gfxBtns.forEach((btn) => {
    const gfx = btn.getAttribute('data-gfx') as GraphicsQuality;
    if (gfx === selectedGraphics) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    btn.addEventListener('click', () => {
      gfxBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedGraphics = gfx;
      saveGraphicsQuality(gfx);
      if (game) {
        game.setGraphicsQuality(gfx);
      }
    });
  });

  // ── Multiplayer Tabs (Serverless Online P2P vs LAN) ──
  const tabOnline = document.getElementById('tab-online');
  const tabLan = document.getElementById('tab-lan');
  const onlineMpContainer = document.getElementById('online-mp-container');
  const lanMpContainer = document.getElementById('lan-mp-container');

  tabOnline?.addEventListener('click', () => {
    tabOnline.classList.add('active');
    tabLan?.classList.remove('active');
    if (onlineMpContainer) onlineMpContainer.style.display = 'block';
    if (lanMpContainer) lanMpContainer.style.display = 'none';
  });

  tabLan?.addEventListener('click', () => {
    tabLan.classList.add('active');
    tabOnline?.classList.remove('active');
    if (lanMpContainer) lanMpContainer.style.display = 'block';
    if (onlineMpContainer) onlineMpContainer.style.display = 'none';
  });

  // ── Serverless Online Multiplayer (P2P WebRTC) ──
  const btnP2pHost = document.getElementById('btn-p2p-host') as HTMLButtonElement | null;
  const btnP2pJoin = document.getElementById('btn-p2p-join') as HTMLButtonElement | null;
  const p2pHostPanel = document.getElementById('p2p-host-panel');
  const p2pJoinPanel = document.getElementById('p2p-join-panel');
  const p2pLobby = document.getElementById('p2p-lobby');
  const p2pRoomCodeEl = document.getElementById('p2p-room-code');
  const lobbyRoomCodeEl = document.getElementById('lobby-room-code');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnP2pStartHosting = document.getElementById('btn-p2p-start-hosting') as HTMLButtonElement | null;
  const btnP2pConnect = document.getElementById('btn-p2p-connect') as HTMLButtonElement | null;
  const btnP2pReady = document.getElementById('btn-p2p-ready') as HTMLButtonElement | null;
  const btnP2pStartMatch = document.getElementById('btn-p2p-start-match') as HTMLButtonElement | null;
  const btnP2pLeave = document.getElementById('btn-p2p-leave') as HTMLButtonElement | null;
  const p2pJoinCodeInput = document.getElementById('p2p-join-code') as HTMLInputElement | null;
  const p2pJoinStatus = document.getElementById('p2p-join-status');
  const p2pLobbyPlayers = document.getElementById('p2p-lobby-players');

  function renderP2pLobbyPlayers() {
    if (!p2pLobbyPlayers) return;
    p2pLobbyPlayers.innerHTML = p2pPlayers
      .map((p) => {
        const isHost = p2pClient?.roomInfo?.hostId === p.id;
        const readyClass = p.ready ? 'player-ready' : 'player-not-ready';
        const readyText = p.ready ? 'Ready' : 'Not Ready';
        const hostBadge = isHost ? '<span class="player-host">HOST</span>' : '';
        return '<div class="lan-player-item"><span>' + p.name + ' ' + hostBadge + '</span><span class="' + readyClass + '">' + readyText + '</span></div>';
      })
      .join('');
  }

  function showP2pLobby() {
    if (p2pHostPanel) p2pHostPanel.style.display = 'none';
    if (p2pJoinPanel) p2pJoinPanel.style.display = 'none';
    if (p2pLobby) p2pLobby.style.display = 'block';
    if (lobbyRoomCodeEl && p2pClient) lobbyRoomCodeEl.textContent = p2pClient.roomCode;
    renderP2pLobbyPlayers();
    if (btnP2pStartMatch) btnP2pStartMatch.style.display = p2pClient?.isHost ? 'block' : 'none';
  }

  function hideP2pLobby() {
    if (p2pLobby) p2pLobby.style.display = 'none';
  }

  btnP2pHost?.addEventListener('click', () => {
    btnP2pHost.classList.add('active');
    btnP2pJoin?.classList.remove('active');
    if (p2pHostPanel) p2pHostPanel.style.display = 'block';
    if (p2pJoinPanel) p2pJoinPanel.style.display = 'none';
    if (p2pLobby) p2pLobby.style.display = 'none';
  });

  btnP2pJoin?.addEventListener('click', () => {
    btnP2pJoin.classList.add('active');
    btnP2pHost?.classList.remove('active');
    if (p2pJoinPanel) p2pJoinPanel.style.display = 'block';
    if (p2pHostPanel) p2pHostPanel.style.display = 'none';
    if (p2pLobby) p2pLobby.style.display = 'none';
  });

  // Copy Room Code
  btnCopyCode?.addEventListener('click', () => {
    if (p2pClient?.roomCode) {
      void navigator.clipboard.writeText(p2pClient.roomCode);
      btnCopyCode.textContent = '✅ Copied!';
      setTimeout(() => { if (btnCopyCode) btnCopyCode.textContent = '📋 Code'; }, 1500);
    }
  });

  // Copy Direct Invite Link
  btnCopyLink?.addEventListener('click', () => {
    if (p2pClient?.roomCode) {
      const url = `${window.location.origin}${window.location.pathname}?room=${p2pClient.roomCode}`;
      void navigator.clipboard.writeText(url);
      btnCopyLink.textContent = '✅ Copied Link!';
      setTimeout(() => { if (btnCopyLink) btnCopyLink.textContent = '🔗 Invite Link'; }, 1500);
    }
  });

  // Host: Open Online Room
  btnP2pStartHosting?.addEventListener('click', async () => {
    if (!btnP2pStartHosting) return;
    btnP2pStartHosting.disabled = true;
    btnP2pStartHosting.textContent = 'Creating room...';

    try {
      p2pClient = new P2PClient();

      const code = await p2pClient.createRoom('Host', characterConfig);
      if (p2pRoomCodeEl) p2pRoomCodeEl.textContent = code;
      p2pPlayers = p2pClient.roomInfo?.players || [];

      showP2pLobby();
      setupNetHandlers(p2pClient);
    } catch (e: any) {
      if (p2pHostPanel) {
        const status = p2pHostPanel.querySelector('.lan-status');
        if (status) status.textContent = 'Failed to create room: ' + (e.message || e);
      }
      btnP2pStartHosting.disabled = false;
      btnP2pStartHosting.textContent = 'Open Online Room';
    }
  });

  // Join: Connect to Online Room
  btnP2pConnect?.addEventListener('click', async () => {
    if (!btnP2pConnect || !p2pJoinCodeInput) return;
    const code = cleanRoomCode(p2pJoinCodeInput.value);
    if (!code) {
      if (p2pJoinStatus) {
        p2pJoinStatus.textContent = 'Please enter a room code.';
        p2pJoinStatus.className = 'lan-status error';
      }
      return;
    }

    if (p2pJoinStatus) {
      p2pJoinStatus.textContent = `Connecting to room ${code}...`;
      p2pJoinStatus.className = 'lan-status';
    }
    btnP2pConnect.disabled = true;

    try {
      p2pClient = new P2PClient();

      await p2pClient.joinRoom(code, 'Player', characterConfig);
      p2pPlayers = p2pClient.roomInfo?.players || [];

      if (p2pJoinStatus) {
        p2pJoinStatus.textContent = 'Connected!';
        p2pJoinStatus.className = 'lan-status success';
      }

      showP2pLobby();
      setupNetHandlers(p2pClient);
    } catch (e: any) {
      if (p2pJoinStatus) {
        p2pJoinStatus.textContent = 'Connection failed: ' + (e.message || e);
        p2pJoinStatus.className = 'lan-status error';
      }
      btnP2pConnect.disabled = false;
    }
  });

  // Ready button (P2P)
  let isP2pReady = false;
  btnP2pReady?.addEventListener('click', () => {
    if (!p2pClient) return;
    isP2pReady = !isP2pReady;
    p2pClient.setReady(isP2pReady);
    btnP2pReady.textContent = isP2pReady ? 'Cancel Ready' : 'Ready';
    btnP2pReady.classList.toggle('active', isP2pReady);
  });

  // Start Match (P2P Host only)
  btnP2pStartMatch?.addEventListener('click', () => {
    if (!p2pClient || !p2pClient.isHost) return;
    p2pClient.startMatch({
      mode: selectedMode,
      map: selectedMap,
      playerCount: selectedPlayerCount,
      difficulty: selectedDifficulty
    });
  });

  // Leave lobby (P2P)
  btnP2pLeave?.addEventListener('click', () => {
    cancelPregameCountdown();
    if (p2pClient) {
      p2pClient.disconnect();
      p2pClient = null;
    }
    p2pPlayers = [];
    netLocalTeam = null;
    isP2pReady = false;
    if (btnP2pReady) {
      btnP2pReady.textContent = 'Ready';
      btnP2pReady.classList.remove('active');
    }
    hideP2pLobby();
    if (btnP2pHost) btnP2pHost.classList.remove('active');
    if (btnP2pJoin) btnP2pJoin.classList.remove('active');
    if (p2pHostPanel) p2pHostPanel.style.display = 'block';
    if (p2pJoinPanel) p2pJoinPanel.style.display = 'none';
    if (btnP2pStartHosting) {
      btnP2pStartHosting.disabled = false;
      btnP2pStartHosting.textContent = 'Open Online Room';
    }
    if (btnP2pConnect) btnP2pConnect.disabled = false;
    void music.playMenu();
  });

  // Auto-fill from URL query parameter ?room=XYZ or ?join=XYZ
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room') || urlParams.get('join');
  if (roomParam) {
    tabOnline?.click();
    btnP2pJoin?.click();
    if (p2pJoinCodeInput) {
      p2pJoinCodeInput.value = cleanRoomCode(roomParam);
    }
  }

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

  function renderLanLobbyPlayers() {
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

  function showLanLobby() {
    if (lanHostPanel) lanHostPanel.style.display = 'none';
    if (lanJoinPanel) lanJoinPanel.style.display = 'none';
    if (lanLobby) lanLobby.style.display = 'block';
    renderLanLobbyPlayers();
    if (btnLanStartMatch) btnLanStartMatch.style.display = lanClient?.isHost ? 'block' : 'none';
  }

  function hideLanLobby() {
    if (lanLobby) lanLobby.style.display = 'none';
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
      const port = (document.getElementById('lan-host-port') as HTMLInputElement)?.value || '7070';
      const serverUrl = 'ws://localhost:' + port;
      lanClient = new LanClient(serverUrl);

      await lanClient.connect('Host', characterConfig);
      lanPlayers = lanClient.roomInfo?.players || [];

      if (lanRoomInfo) {
        lanRoomInfo.innerHTML = '<p class="lan-status success">Server connected! Your LAN game is live.</p><div id="lan-player-list" class="lan-player-list"></div>';
      }

      showLanLobby();
      setupNetHandlers(lanClient);
    } catch (e: any) {
      if (lanRoomInfo) {
        lanRoomInfo.innerHTML = '<p class="lan-status error">Failed to start: ' + e.message + '</p><p class="lan-status">Make sure to run the LAN server first: <code>node server/lan-server.js</code></p>';
      }
      btnLanStartServer.disabled = false;
      btnLanStartServer.textContent = 'Start LAN Server';
    }
  });

  // Join: Connect to LAN host
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

      await lanClient.connect('Player', characterConfig);
      lanPlayers = lanClient.roomInfo?.players || [];

      if (lanJoinStatus) {
        lanJoinStatus.textContent = 'Connected!';
        lanJoinStatus.className = 'lan-status success';
      }

      showLanLobby();
      setupNetHandlers(lanClient);
    } catch (e: any) {
      if (lanJoinStatus) {
        lanJoinStatus.textContent = 'Connection failed: ' + e.message;
        lanJoinStatus.className = 'lan-status error';
      }
      btnLanConnect.disabled = false;
    }
  });

  // Ready button (LAN)
  let isLanReady = false;
  btnLanReady?.addEventListener('click', () => {
    if (!lanClient) return;
    isLanReady = !isLanReady;
    lanClient.setReady(isLanReady);
    btnLanReady.textContent = isLanReady ? 'Cancel Ready' : 'Ready';
    btnLanReady.classList.toggle('active', isLanReady);
  });

  // Start Match (LAN Host only)
  btnLanStartMatch?.addEventListener('click', () => {
    if (!lanClient || !lanClient.isHost) return;
    lanClient.startMatch({
      mode: selectedMode,
      map: selectedMap,
      playerCount: selectedPlayerCount,
      difficulty: selectedDifficulty
    });
  });

  // Leave lobby (LAN)
  btnLanLeave?.addEventListener('click', () => {
    cancelPregameCountdown();
    if (lanClient) {
      lanClient.disconnect();
      lanClient = null;
    }
    lanPlayers = [];
    netLocalTeam = null;
    isLanReady = false;
    if (btnLanReady) {
      btnLanReady.textContent = 'Ready';
      btnLanReady.classList.remove('active');
    }
    hideLanLobby();
    if (btnLanHost) btnLanHost.classList.remove('active');
    if (btnLanJoin) btnLanJoin.classList.remove('active');
    if (lanHostPanel) lanHostPanel.style.display = 'block';
    if (lanJoinPanel) lanJoinPanel.style.display = 'none';
    if (btnLanStartServer) {
      btnLanStartServer.disabled = false;
      btnLanStartServer.textContent = 'Start LAN Server';
    }
    if (btnLanConnect) btnLanConnect.disabled = false;
    void music.playMenu();
  });

  function setupNetHandlers(client: LanClient | P2PClient) {
    client.on('playerJoin', (msg: any) => {
      if (client instanceof P2PClient) {
        p2pPlayers.push({ id: msg.player.id, name: msg.player.name, ready: msg.player.ready });
        renderP2pLobbyPlayers();
      } else {
        lanPlayers.push({ id: msg.player.id, name: msg.player.name, ready: msg.player.ready });
        renderLanLobbyPlayers();
      }
    });

    client.on('playerLeave', (msg: any) => {
      if (client instanceof P2PClient) {
        p2pPlayers = p2pPlayers.filter((p) => p.id !== msg.playerId);
        if (msg.roomInfo) p2pPlayers = msg.roomInfo.players || [];
        renderP2pLobbyPlayers();
      } else {
        lanPlayers = lanPlayers.filter((p) => p.id !== msg.playerId);
        if (msg.roomInfo) lanPlayers = msg.roomInfo.players || [];
        renderLanLobbyPlayers();
      }
    });

    client.on('playerReady', (msg: any) => {
      const list = client instanceof P2PClient ? p2pPlayers : lanPlayers;
      const p = list.find((p) => p.id === msg.playerId);
      if (p) p.ready = msg.ready;
      if (client instanceof P2PClient) renderP2pLobbyPlayers();
      else renderLanLobbyPlayers();
    });

    client.on('clientInput', (data: any) => {
      if (game && game.netMode === 'host') {
        game.setRemoteInput(data.playerId, data.input);
      }
    });

    client.on('event', (event: any) => {
      if (client.isHost) return;
      const localId = client.playerId;
      if (event.kind === 'fire') {
        sfx.playShoot(event.data?.ownerId === localId ? 1 : 0.28);
      } else if (event.kind === 'hit' && event.data?.surface === 'wall') {
        sfx.playWallHit(event.data?.ownerId === localId ? 0.85 : 0.3);
      } else if (event.kind === 'hit' && event.data?.surface === 'clash') {
        sfx.playHit();
      } else if (event.kind === 'hit' && event.data?.surface === 'fizzle') {
        sfx.playFizzle(event.data?.ownerId === localId ? 0.72 : 0.22);
      } else if (event.kind === 'hit') {
        const involved = event.data?.targetId === localId || event.data?.ownerId === localId;
        sfx.playWizardHit(event.data?.targetId === localId ? 1 : involved ? 0.68 : 0.24);
      } else if (event.kind === 'pickup') {
        sfx.playPowerup();
      } else if (event.kind === 'dash') {
        sfx.playDash();
      }
    });

    client.on('matchStart', (msg: any) => {
      const config = msg.config || {};
      const matchMode = (config.mode || selectedMode) as GameModeType;
      const matchMap = (config.map || selectedMap) as MapType;
      const matchPlayerCount = config.playerCount || selectedPlayerCount;
      const matchDifficulty = (config.difficulty || selectedDifficulty) as DifficultyLevel;

      if (client.isHost) {
        startNetHostGame(client, matchMode, matchMap, matchPlayerCount, matchDifficulty);
      } else {
        startNetClientGame(client, matchMode, matchMap);
      }
    });

    client.on('state', (state: GameStateSnapshot) => {
      if (lanRenderer) {
        lanRenderer.applyState(state);
      }
      const localPlayer = state.casters.find((caster) => caster.id === client.playerId);
      if (localPlayer) {
        netLocalTeam = localPlayer.team;
        const danger = state.projectiles.reduce((level, projectile) => {
          if (projectile.ownerId === localPlayer.id || projectile.isDead) return level;
          const distance = Math.hypot(projectile.x - localPlayer.x, projectile.y - localPlayer.y);
          return distance < 8 ? level + (1 - distance / 8) * 0.3 : level;
        }, 0);
        music.updateGameplay(localPlayer.health / Math.max(1, localPlayer.maxHealth), localPlayer.isDead, danger);
      }
    });

    client.on('matchEnd', (result: any) => {
      if (lanRenderer) {
        lanRenderer.destroy();
        lanRenderer = null;
      }
      showNetGameOver(client, result);
    });

    client.on('disconnect', () => {
      cancelPregameCountdown();
      if (lanRenderer) {
        lanRenderer.destroy();
        lanRenderer = null;
      }
      if (client instanceof P2PClient) hideP2pLobby();
      else hideLanLobby();
      netLocalTeam = null;
    });
  }

  function startNetHostGame(client: LanClient | P2PClient, mode: GameModeType, map: MapType, playerCount: number, difficulty: DifficultyLevel) {
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
    wireGameCallbacks(game);

    const playersList = client instanceof P2PClient ? p2pPlayers : lanPlayers;
    playersList.forEach((p) => {
      if (p.id !== client.playerId) {
        game?.registerRemotePlayer(p.id, p.name);
      }
    });

    game.onNetBroadcast = (state: GameStateSnapshot) => {
      client.broadcastState(state);
    };
    game.onNetEvent = (event) => {
      client.broadcastEvent(event);
    };
    game.onNetMatchEnd = (result) => {
      client.broadcastEnd(result);
    };

    const activeGame = game;
    activeGame.tick();
    void music.startMatch(mode);
    startPregameCountdown(() => {
      if (game === activeGame) activeGame.startGame();
    });
  }

  function startNetClientGame(client: LanClient | P2PClient, mode: GameModeType, map: MapType) {
    if (menuScreen) menuScreen.style.display = 'none';
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    if (lanRenderer) {
      lanRenderer.destroy();
      lanRenderer = null;
    }

    lanRenderer = new ClientGameRenderer(gameContainer, map, mode);
    lanRenderer.setLocalPlayerId(client.playerId);
    lanRenderer.onSendInput = (input: PlayerInputState) => {
      client.sendInput(input);
    };
    void music.startMatch(mode);
    startPregameCountdown(() => {});
  }

  function showNetGameOver(client: LanClient | P2PClient, result: any) {
    cancelPregameCountdown();
    hideGlobalTouchControls();
    if (hudContainer) hudContainer.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'flex';
    const winnerEl = document.getElementById('gameover-winner');
    if (winnerEl) winnerEl.textContent = result?.winnerText || 'Match Over';
    let won = Boolean(result?.won);
    if (!client.isHost) {
      if (result?.winningTeam) won = result.winningTeam === netLocalTeam;
      else if (result?.winnerId) won = result.winnerId === client.playerId;
      else won = false;
    }
    void music.playResult(won);
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

  // ── Elimination and Spectator Controls ──
  const elimOverlay = document.getElementById('elimination-overlay');
  const spectatorHud = document.getElementById('spectator-hud');
  const btnElimRestart = document.getElementById('btn-elim-restart');
  const btnElimSpectate = document.getElementById('btn-elim-spectate');
  const btnElimMenu = document.getElementById('btn-elim-menu');

  const btnSpecPrev = document.getElementById('btn-spec-prev');
  const btnSpecNext = document.getElementById('btn-spec-next');
  const btnSpecEnd = document.getElementById('btn-spec-end');
  const btnSpecMenu = document.getElementById('btn-spec-menu');

  btnElimRestart?.addEventListener('click', () => {
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
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
      wireGameCallbacks(game);
      const activeGame = game;
      void music.startMatch(selectedMode);
      startPregameCountdown(() => {
        if (game === activeGame) activeGame.startGame();
      });
    }
  });

  btnElimSpectate?.addEventListener('click', () => {
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'flex';
    if (hudContainer) hudContainer.style.display = 'block';
    game?.startSpectating();
  });

  btnElimMenu?.addEventListener('click', () => {
    cancelPregameCountdown();
    hideGlobalTouchControls();
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'none';
    if (menuScreen) menuScreen.style.display = 'flex';
    void music.playMenu();

    if (game) {
      game.cleanup();
      game = null;
    }
  });

  btnSpecPrev?.addEventListener('click', () => {
    game?.cycleSpectator(-1);
  });

  btnSpecNext?.addEventListener('click', () => {
    game?.cycleSpectator(1);
  });

  btnSpecEnd?.addEventListener('click', () => {
    if (spectatorHud) spectatorHud.style.display = 'none';
    game?.endBattleImmediately();
  });

  btnSpecMenu?.addEventListener('click', () => {
    cancelPregameCountdown();
    hideGlobalTouchControls();
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'none';
    if (menuScreen) menuScreen.style.display = 'flex';
    void music.playMenu();

    if (game) {
      game.cleanup();
      game = null;
    }
  });

  // Start Game callback
  playBtn?.addEventListener('click', () => {
    // Hide overlays & menu screen
    if (menuScreen) menuScreen.style.display = 'none';
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
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
    (window as any).game = game;
    game.controlMode = selectedControl;
    wireGameCallbacks(game);

    const activeGame = game;
    activeGame.tick();
    void music.startMatch(selectedMode);
    startPregameCountdown(() => {
      if (game === activeGame) activeGame.startGame();
    });
  });

  // Play Again callback
  restartBtn?.addEventListener('click', () => {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    if (game) {
      game.playerConfig = { ...characterConfig };
      game.playerRobeColor = characterConfig.robeColor;
      game.playerSpellColor = characterConfig.spellColor;
      game.mapType = selectedMap;
      game.playerCount = selectedPlayerCount;
      game.difficulty = selectedDifficulty;
      game.resetGame();
      wireGameCallbacks(game);
      const activeGame = game;
      void music.startMatch(selectedMode);
      startPregameCountdown(() => {
        if (game === activeGame) activeGame.startGame();
      });
    }
  });

  // Back to Menu callback
  const backMenuBtn = document.getElementById('btn-back-menu');
  backMenuBtn?.addEventListener('click', () => {
    cancelPregameCountdown();
    hideGlobalTouchControls();
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (elimOverlay) elimOverlay.style.display = 'none';
    if (spectatorHud) spectatorHud.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'none';
    if (menuScreen) menuScreen.style.display = 'flex';
    void music.playMenu();

    // Destroy the current game instance to free WebGL resources
    if (game) {
      game.cleanup();
      game = null;
    }
  });

  // Enable keyboard + gamepad navigation of menu & game-over screens
  new MenuNavigator();
});
