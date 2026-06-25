import './style.css';
import { Game } from './engine/Game';
import { GameModeType } from './world/GameModes';
import { MapType } from './world/Arena';

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
let selectedRobeColor = parseInt(localStorage.getItem('incasters_robe_color') || '0xff007f', 16);
let selectedSpellColor = parseInt(localStorage.getItem('incasters_spell_color') || '0x00f0ff', 16);
let selectedMap: MapType = (localStorage.getItem('incasters_map') || 'ARENA') as MapType;
let selectedPlayerCount = parseInt(localStorage.getItem('incasters_player_count') || '8', 10);
let game: Game | null = null;

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

  const playBtn = document.getElementById('btn-play');
  const restartBtn = document.getElementById('btn-restart');

  const menuScreen = document.getElementById('menu-screen');
  const hudContainer = document.getElementById('hud-container');
  const gameOverOverlay = document.getElementById('gameover-overlay');
  const gameContainer = document.getElementById('game-container') as HTMLDivElement;

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

  // Setup customizer pickers
  const setupColorPicker = (pickerEl: HTMLElement | null, storageKey: string, currentValue: number, onSelect: (val: number) => void) => {
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
        localStorage.setItem(storageKey, '0x' + color.hex.toString(16));
        onSelect(color.hex);
      });
      pickerEl.appendChild(dot);
    });
  };

  setupColorPicker(robePicker, 'incasters_robe_color', selectedRobeColor, (val) => {
    selectedRobeColor = val;
  });

  setupColorPicker(spellPicker, 'incasters_spell_color', selectedSpellColor, (val) => {
    selectedSpellColor = val;
  });

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
      selectedRobeColor,
      selectedSpellColor,
      selectedMap,
      selectedPlayerCount
    );
    game.controlMode = selectedControl;
    game.startGame();
    
    // Start game tick loop
    game.tick();
  });

  // Play Again callback
  restartBtn?.addEventListener('click', () => {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'block';

    if (game) {
      game.playerRobeColor = selectedRobeColor;
      game.playerSpellColor = selectedSpellColor;
      game.mapType = selectedMap;
      game.playerCount = selectedPlayerCount;
      game.resetGame();
      game.startGame();
    }
  });
});
