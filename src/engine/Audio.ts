export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
}

const AUDIO_STORAGE_KEY = 'incasters_audio_settings';
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  musicEnabled: true
};

const clampVolume = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function loadAudioSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY) || '{}') as Partial<AudioSettings>;
    return {
      masterVolume: clampVolume(saved.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
      musicVolume: clampVolume(saved.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
      sfxVolume: clampVolume(saved.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
      musicEnabled: saved.musicEnabled ?? DEFAULT_AUDIO_SETTINGS.musicEnabled
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveAudioSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

const audioSettings = loadAudioSettings();

export type MusicMatchMode = 'BATTLE_ROYALE' | 'TEAM_BATTLE' | 'GOLD_RUSH' | 'KING_OF_THE_CAULDRON';
type MusicCueId = 'menu' | 'battleRoyale' | 'teamBattle' | 'goldRush' | 'victory' | 'defeat';
type StemRole = 'drums' | 'other' | 'vocals';

export type SfxAsset =
  // Combat
  | 'spell_conjure'
  | 'spell_air_whistle'
  | 'spell_hit_wizard'
  | 'spell_hit_wall'
  | 'spell_fizzle'
  | 'spell_clash'
  | 'dodge_dash'
  | 'wizard_defeated'
  | 'heartbeat_low_health'
  | 'critical_hit'
  // Powerups
  | 'powerup_spawn'
  | 'powerup_collect'
  | 'powerup_shield_on'
  | 'powerup_shield_break'
  | 'powerup_haste'
  | 'powerup_freeze'
  | 'powerup_bounce'
  | 'powerup_split'
  | 'powerup_pierce'
  | 'powerup_wallrun'
  // Game Modes
  | 'coin_spawn'
  | 'coin_pickup'
  | 'vault_bank_deposit'
  | 'cauldron_capturing'
  | 'cauldron_captured'
  | 'storm_warning_siren'
  | 'storm_damage_zap'
  // Hazards
  | 'hazard_jumppad'
  | 'hazard_portal_enter'
  | 'hazard_portcullis_slam'
  | 'hazard_urn_shatter'
  | 'hazard_crystal_pulse'
  // Trials
  | 'dummy_target_hit'
  | 'dummy_target_destroy'
  | 'trial_3star_fanfare'
  | 'trial_par_shot_bonus'
  // UI & Lifecycle
  | 'ui_hover'
  | 'ui_click'
  | 'ui_modal_open'
  | 'ui_modal_close'
  | 'ui_token_purchase'
  | 'ui_equip_cosmetic'
  | 'ui_xp_tally_tick'
  | 'ui_level_up'
  | 'ui_feat_unlocked'
  | 'match_countdown_beep'
  | 'match_start_cast'
  | 'match_victory'
  | 'match_game_over_sad'
  // Killstreaks
  | 'streak_double_kill'
  | 'streak_triple_kill'
  | 'streak_mega_kill'
  | 'streak_rampage'
  // Legacy aliases
  | 'conjure'
  | 'air'
  | 'fizzle'
  | 'wallHit'
  | 'wizardHit';

export const SfxPriority = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 100
} as const;

export type SfxPriority = typeof SfxPriority[keyof typeof SfxPriority];

interface MusicCueDefinition {
  stems: Record<StemRole, string>;
  gains: Record<StemRole, number>;
  loop: boolean;
}

const MUSIC_CUES: Record<MusicCueId, MusicCueDefinition> = {
  menu: {
    stems: {
      drums: new URL('../assets/audio/music/Main Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Main Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Main Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.82, other: 0.88, vocals: 0.72 },
    loop: true
  },
  battleRoyale: {
    stems: {
      drums: new URL('../assets/audio/music/Last Caster Standing Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Last Caster Standing Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Last Caster Standing Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.78, other: 0.9, vocals: 0.7 },
    loop: true
  },
  teamBattle: {
    stems: {
      drums: new URL('../assets/audio/music/Team Deathmatch Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Team Deathmatch Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Team Deathmatch Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.86, other: 0.86, vocals: 0.68 },
    loop: true
  },
  goldRush: {
    stems: {
      drums: new URL('../assets/audio/music/Gold Rush Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Gold Rush Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Gold Rush Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.8, other: 0.9, vocals: 0.68 },
    loop: true
  },
  victory: {
    stems: {
      drums: new URL('../assets/audio/music/Victory Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Victory Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Victory Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.84, other: 0.9, vocals: 0.78 },
    loop: true
  },
  defeat: {
    stems: {
      drums: new URL('../assets/audio/music/Defeat Theme/drums.ogg', import.meta.url).href,
      other: new URL('../assets/audio/music/Defeat Theme/other.ogg', import.meta.url).href,
      vocals: new URL('../assets/audio/music/Defeat Theme/vocals.ogg', import.meta.url).href
    },
    gains: { drums: 0.3, other: 0.9, vocals: 0.78 },
    loop: true
  }
};

const SFX_ASSETS: Record<string, string> = {
  // Combat
  spell_conjure: new URL('../assets/audio/sfx/spell_conjure.mp3', import.meta.url).href,
  spell_air_whistle: new URL('../assets/audio/sfx/spell_air_whistle.mp3', import.meta.url).href,
  spell_hit_wizard: new URL('../assets/audio/sfx/spell_hit_wizard.mp3', import.meta.url).href,
  spell_hit_wall: new URL('../assets/audio/sfx/spell_hit_wall.mp3', import.meta.url).href,
  spell_fizzle: new URL('../assets/audio/sfx/spell_fizzle.mp3', import.meta.url).href,
  spell_clash: new URL('../assets/audio/sfx/spell_clash.mp3', import.meta.url).href,
  dodge_dash: new URL('../assets/audio/sfx/dodge_dash.mp3', import.meta.url).href,
  wizard_defeated: new URL('../assets/audio/sfx/wizard_defeated.mp3', import.meta.url).href,
  heartbeat_low_health: new URL('../assets/audio/sfx/heartbeat_low_health.mp3', import.meta.url).href,
  critical_hit: new URL('../assets/audio/sfx/critical_hit.mp3', import.meta.url).href,
  // Powerups
  powerup_spawn: new URL('../assets/audio/sfx/powerup_spawn.mp3', import.meta.url).href,
  powerup_collect: new URL('../assets/audio/sfx/powerup_collect.mp3', import.meta.url).href,
  powerup_shield_on: new URL('../assets/audio/sfx/powerup_shield_on.mp3', import.meta.url).href,
  powerup_shield_break: new URL('../assets/audio/sfx/powerup_shield_break.mp3', import.meta.url).href,
  powerup_haste: new URL('../assets/audio/sfx/powerup_haste.mp3', import.meta.url).href,
  powerup_freeze: new URL('../assets/audio/sfx/powerup_freeze.mp3', import.meta.url).href,
  powerup_bounce: new URL('../assets/audio/sfx/powerup_bounce.mp3', import.meta.url).href,
  powerup_split: new URL('../assets/audio/sfx/powerup_split.mp3', import.meta.url).href,
  powerup_pierce: new URL('../assets/audio/sfx/powerup_pierce.mp3', import.meta.url).href,
  powerup_wallrun: new URL('../assets/audio/sfx/powerup_wallrun.mp3', import.meta.url).href,
  // Game Modes
  coin_spawn: new URL('../assets/audio/sfx/coin_spawn.mp3', import.meta.url).href,
  coin_pickup: new URL('../assets/audio/sfx/coin_pickup.mp3', import.meta.url).href,
  vault_bank_deposit: new URL('../assets/audio/sfx/vault_bank_deposit.mp3', import.meta.url).href,
  cauldron_capturing: new URL('../assets/audio/sfx/cauldron_capturing.mp3', import.meta.url).href,
  cauldron_captured: new URL('../assets/audio/sfx/cauldron_captured.mp3', import.meta.url).href,
  storm_warning_siren: new URL('../assets/audio/sfx/storm_warning_siren.mp3', import.meta.url).href,
  storm_damage_zap: new URL('../assets/audio/sfx/storm_damage_zap.mp3', import.meta.url).href,
  // Hazards
  hazard_jumppad: new URL('../assets/audio/sfx/hazard_jumppad.mp3', import.meta.url).href,
  hazard_portal_enter: new URL('../assets/audio/sfx/hazard_portal_enter.mp3', import.meta.url).href,
  hazard_portcullis_slam: new URL('../assets/audio/sfx/hazard_portcullis_slam.mp3', import.meta.url).href,
  hazard_urn_shatter: new URL('../assets/audio/sfx/hazard_urn_shatter.mp3', import.meta.url).href,
  hazard_crystal_pulse: new URL('../assets/audio/sfx/hazard_crystal_pulse.mp3', import.meta.url).href,
  // Trials
  dummy_target_hit: new URL('../assets/audio/sfx/dummy_target_hit.mp3', import.meta.url).href,
  dummy_target_destroy: new URL('../assets/audio/sfx/dummy_target_destroy.mp3', import.meta.url).href,
  trial_3star_fanfare: new URL('../assets/audio/sfx/trial_3star_fanfare.mp3', import.meta.url).href,
  trial_par_shot_bonus: new URL('../assets/audio/sfx/trial_par_shot_bonus.mp3', import.meta.url).href,
  // UI & Lifecycle
  ui_hover: new URL('../assets/audio/sfx/ui_hover.mp3', import.meta.url).href,
  ui_click: new URL('../assets/audio/sfx/ui_click.mp3', import.meta.url).href,
  ui_modal_open: new URL('../assets/audio/sfx/ui_modal_open.mp3', import.meta.url).href,
  ui_modal_close: new URL('../assets/audio/sfx/ui_modal_close.mp3', import.meta.url).href,
  ui_token_purchase: new URL('../assets/audio/sfx/ui_token_purchase.mp3', import.meta.url).href,
  ui_equip_cosmetic: new URL('../assets/audio/sfx/ui_equip_cosmetic.mp3', import.meta.url).href,
  ui_xp_tally_tick: new URL('../assets/audio/sfx/ui_xp_tally_tick.mp3', import.meta.url).href,
  ui_level_up: new URL('../assets/audio/sfx/ui_level_up.mp3', import.meta.url).href,
  ui_feat_unlocked: new URL('../assets/audio/sfx/ui_feat_unlocked.mp3', import.meta.url).href,
  match_countdown_beep: new URL('../assets/audio/sfx/match_countdown_beep.mp3', import.meta.url).href,
  match_start_cast: new URL('../assets/audio/sfx/match_start_cast.mp3', import.meta.url).href,
  match_victory: new URL('../assets/audio/sfx/match_victory.mp3', import.meta.url).href,
  match_game_over_sad: new URL('../assets/audio/sfx/match_game_over_sad.mp3', import.meta.url).href,
  // Killstreaks
  streak_double_kill: new URL('../assets/audio/sfx/streak_double_kill.mp3', import.meta.url).href,
  streak_triple_kill: new URL('../assets/audio/sfx/streak_triple_kill.mp3', import.meta.url).href,
  streak_mega_kill: new URL('../assets/audio/sfx/streak_mega_kill.mp3', import.meta.url).href,
  streak_rampage: new URL('../assets/audio/sfx/streak_rampage.mp3', import.meta.url).href,
  // Backward-compatible aliases
  conjure: new URL('../assets/audio/sfx/spell_conjure.mp3', import.meta.url).href,
  air: new URL('../assets/audio/sfx/spell_air_whistle.mp3', import.meta.url).href,
  fizzle: new URL('../assets/audio/sfx/spell_fizzle.mp3', import.meta.url).href,
  wallHit: new URL('../assets/audio/sfx/spell_hit_wall.mp3', import.meta.url).href,
  wizardHit: new URL('../assets/audio/sfx/spell_hit_wizard.mp3', import.meta.url).href
};

let sharedAudioContext: AudioContext | null = null;

function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext?.state === 'suspended') void sharedAudioContext.resume();
  return sharedAudioContext;
}

interface ActiveVoice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  priority: SfxPriority;
  startTime: number;
}

const MAX_ACTIVE_VOICES = 16;
const ASSET_CONCURRENCY_LIMITS: Record<string, number> = {
  spell_hit_wall: 3,
  spell_hit_wizard: 3,
  spell_conjure: 3,
  spell_air_whistle: 2,
  coin_pickup: 3,
  ui_hover: 1,
  heartbeat_low_health: 1
};

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume: number;
  private sfxVolume: number;
  private bufferCache = new Map<string, Promise<AudioBuffer>>();
  private lastPlayed = new Map<string, number>();
  private activeVoices = new Set<ActiveVoice>();

  constructor(masterVolume: number, sfxVolume: number) {
    this.masterVolume = masterVolume;
    this.sfxVolume = sfxVolume;
  }

  private init() {
    if (!this.ctx) {
      this.ctx = getAudioContext();
      if (this.ctx) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume * this.sfxVolume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
  }

  setLevels(masterVolume: number, sfxVolume: number) {
    this.masterVolume = clampVolume(masterVolume);
    this.sfxVolume = clampVolume(sfxVolume);
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume * this.sfxVolume, this.ctx.currentTime, 0.02);
    }
  }

  preload() {
    this.init();
    Object.keys(SFX_ASSETS).forEach((asset) => {
      void this.loadAsset(asset).catch(() => {});
    });
  }

  private loadAsset(asset: string): Promise<AudioBuffer> {
    let pending = this.bufferCache.get(asset);
    if (!pending) {
      const context = getAudioContext();
      if (!context) return Promise.reject(new Error('Web Audio unavailable'));
      const url = SFX_ASSETS[asset];
      if (!url) return Promise.reject(new Error(`Unknown SFX asset: ${asset}`));
      pending = fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to load ${asset}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data));
      this.bufferCache.set(asset, pending);
    }
    return pending;
  }

  /**
   * Core Audio Concurrency & Voice Limiter
   */
  private playAsset(
    asset: SfxAsset,
    volume = 1,
    cooldownMs = 40,
    rateVariance = 0.03,
    priority: SfxPriority = SfxPriority.MEDIUM
  ) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    const now = performance.now();
    const last = this.lastPlayed.get(asset) ?? -Infinity;
    if (now - last < cooldownMs) return;

    // Concurrency limit per specific asset
    const assetLimit = ASSET_CONCURRENCY_LIMITS[asset] ?? 4;
    let currentOfAsset = 0;
    for (const v of this.activeVoices) {
      if (v.id === asset) currentOfAsset++;
    }
    if (currentOfAsset >= assetLimit && priority < SfxPriority.CRITICAL) {
      return;
    }

    // Voice stealing if total active voices exceeds MAX_ACTIVE_VOICES
    if (this.activeVoices.size >= MAX_ACTIVE_VOICES) {
      let lowestVoice: ActiveVoice | null = null;
      for (const v of this.activeVoices) {
        if (!lowestVoice || v.priority < lowestVoice.priority || (v.priority === lowestVoice.priority && v.startTime < lowestVoice.startTime)) {
          lowestVoice = v;
        }
      }
      if (lowestVoice && (lowestVoice.priority < priority || priority === SfxPriority.CRITICAL)) {
        try {
          lowestVoice.gain.gain.setValueAtTime(lowestVoice.gain.gain.value, this.ctx.currentTime);
          lowestVoice.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.01);
          lowestVoice.source.stop(this.ctx.currentTime + 0.015);
        } catch {}
        this.activeVoices.delete(lowestVoice);
      } else if (priority < SfxPriority.HIGH) {
        return; // Drop voice
      }
    }

    this.lastPlayed.set(asset, now);

    void this.loadAsset(asset).then((buffer) => {
      if (!this.ctx || !this.masterGain) return;
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();

      source.buffer = buffer;
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateVariance;
      gain.gain.value = clampVolume(volume);

      source.connect(gain);
      gain.connect(this.masterGain);

      const voice: ActiveVoice = {
        id: asset,
        source,
        gain,
        priority,
        startTime: now
      };
      this.activeVoices.add(voice);

      source.onended = () => {
        this.activeVoices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    }).catch(() => {
      // Graceful fallback to synthetic audio if sample load failed
      this.fallbackSynth(asset, volume);
    });
  }

  /**
   * Spatial Audio with Distance Culling & Attenuation
   */
  playSpatial(
    asset: SfxAsset,
    sourceX: number,
    sourceY: number,
    listenerX: number,
    listenerY: number,
    maxDistance = 40,
    baseVolume = 1,
    priority: SfxPriority = SfxPriority.MEDIUM
  ) {
    const dx = sourceX - listenerX;
    const dy = sourceY - listenerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDistance) return; // Distance culling

    const attenuation = 1 / (1 + (dist / 12) ** 1.4);
    const volume = baseVolume * attenuation;
    if (volume < 0.02) return;

    this.playAsset(asset, volume, 45, 0.04, priority);
  }

  // ── COMBAT SOUNDS ──

  playShoot(volume = 1, isLocal = true) {
    this.playAsset('spell_conjure', volume * (isLocal ? 0.7 : 0.3), isLocal ? 40 : 80, 0.04, SfxPriority.LOW);
    if (isLocal) {
      this.playAsset('spell_air_whistle', volume * 0.2, 60, 0.05, SfxPriority.LOW);
    }
  }

  playSpellWhistle(volume = 0.5) {
    this.playAsset('spell_air_whistle', volume * 0.35, 120, 0.05, SfxPriority.LOW);
  }

  playWizardHit(volume = 1, isLocal = true) {
    this.playAsset('spell_hit_wizard', volume * (isLocal ? 0.85 : 0.4), 60, 0.03, SfxPriority.MEDIUM);
  }

  playWallHit(volume = 1, isLocal = true) {
    this.playAsset('spell_hit_wall', volume * (isLocal ? 0.75 : 0.3), 40, 0.05, SfxPriority.LOW);
  }

  playFizzle(volume = 1) {
    this.playAsset('spell_fizzle', volume * 0.5, 90, 0.04, SfxPriority.LOW);
  }

  playSpellClash(volume = 1) {
    this.playAsset('spell_clash', volume * 0.8, 80, 0.03, SfxPriority.HIGH);
  }

  playDash(volume = 1) {
    this.playAsset('dodge_dash', volume * 0.8, 150, 0.04, SfxPriority.HIGH);
  }

  playWizardDefeated(volume = 1) {
    this.playAsset('wizard_defeated', volume * 0.9, 100, 0.02, SfxPriority.HIGH);
  }

  playHeartbeat(volume = 1) {
    this.playAsset('heartbeat_low_health', volume * 0.6, 650, 0, SfxPriority.HIGH);
  }

  playCriticalHit(volume = 1) {
    this.playAsset('critical_hit', volume * 0.9, 80, 0.02, SfxPriority.HIGH);
  }

  // ── POWER-UPS ──

  playPowerupSpawn(volume = 1) {
    this.playAsset('powerup_spawn', volume * 0.6, 120, 0.02, SfxPriority.MEDIUM);
  }

  playPowerup(volume = 1) {
    this.playPowerupCollect(volume);
  }

  playPowerupCollect(volume = 1) {
    this.playAsset('powerup_collect', volume * 0.8, 60, 0.02, SfxPriority.MEDIUM);
  }

  playShieldOn(volume = 1) {
    this.playAsset('powerup_shield_on', volume * 0.8, 100, 0.02, SfxPriority.MEDIUM);
  }

  playShieldBreak(volume = 1) {
    this.playAsset('powerup_shield_break', volume * 0.85, 100, 0.02, SfxPriority.HIGH);
  }

  playHaste(volume = 1) {
    this.playAsset('powerup_haste', volume * 0.7, 100, 0.03, SfxPriority.MEDIUM);
  }

  playFreeze(volume = 1) {
    this.playAsset('powerup_freeze', volume * 0.8, 100, 0.02, SfxPriority.MEDIUM);
  }

  playBounce(volume = 1) {
    this.playAsset('powerup_bounce', volume * 0.65, 45, 0.04, SfxPriority.LOW);
  }

  playSplit(volume = 1) {
    this.playAsset('powerup_split', volume * 0.7, 60, 0.03, SfxPriority.MEDIUM);
  }

  playPierce(volume = 1) {
    this.playAsset('powerup_pierce', volume * 0.75, 60, 0.03, SfxPriority.MEDIUM);
  }

  playWallRun(volume = 1) {
    this.playAsset('powerup_wallrun', volume * 0.65, 80, 0.03, SfxPriority.MEDIUM);
  }

  // ── GAME MODES ──

  playCoinSpawn(volume = 1) {
    this.playAsset('coin_spawn', volume * 0.5, 80, 0.05, SfxPriority.LOW);
  }

  playCoinPickup(volume = 1) {
    this.playAsset('coin_pickup', volume * 0.75, 40, 0.06, SfxPriority.MEDIUM);
  }

  playVaultDeposit(volume = 1) {
    this.playAsset('vault_bank_deposit', volume * 0.9, 150, 0.02, SfxPriority.HIGH);
  }

  playCauldronCapturing(volume = 1) {
    this.playAsset('cauldron_capturing', volume * 0.6, 300, 0.02, SfxPriority.MEDIUM);
  }

  playCauldronCaptured(volume = 1) {
    this.playAsset('cauldron_captured', volume * 0.95, 400, 0, SfxPriority.HIGH);
  }

  playStormSiren(volume = 1) {
    this.playAsset('storm_warning_siren', volume * 0.8, 1000, 0, SfxPriority.HIGH);
  }

  playStormDamage(volume = 1) {
    this.playAsset('storm_damage_zap', volume * 0.7, 180, 0.04, SfxPriority.MEDIUM);
  }

  // ── HAZARDS ──

  playJumpPad(volume = 1) {
    this.playAsset('hazard_jumppad', volume * 0.8, 120, 0.03, SfxPriority.MEDIUM);
  }

  playPortal(volume = 1) {
    this.playAsset('hazard_portal_enter', volume * 0.85, 120, 0.02, SfxPriority.MEDIUM);
  }

  playPortcullis(volume = 1) {
    this.playAsset('hazard_portcullis_slam', volume * 0.85, 200, 0.02, SfxPriority.MEDIUM);
  }

  playUrnShatter(volume = 1) {
    this.playAsset('hazard_urn_shatter', volume * 0.75, 60, 0.04, SfxPriority.MEDIUM);
  }

  playCrystalPulse(volume = 1) {
    this.playAsset('hazard_crystal_pulse', volume * 0.75, 200, 0.02, SfxPriority.MEDIUM);
  }

  // ── TRICKSHOT TRIALS ──

  playDummyHit(volume = 1) {
    this.playAsset('dummy_target_hit', volume * 0.75, 50, 0.03, SfxPriority.MEDIUM);
  }

  playDummyDestroy(volume = 1) {
    this.playAsset('dummy_target_destroy', volume * 0.85, 100, 0.02, SfxPriority.HIGH);
  }

  playTrial3StarFanfare(volume = 1) {
    this.playAsset('trial_3star_fanfare', volume * 0.95, 500, 0, SfxPriority.CRITICAL);
  }

  playParBonus(volume = 1) {
    this.playAsset('trial_par_shot_bonus', volume * 0.8, 200, 0, SfxPriority.HIGH);
  }

  // ── UI & METAGAME ──

  playHover(volume = 1) {
    this.playAsset('ui_hover', volume * 0.35, 60, 0.02, SfxPriority.LOW);
  }

  playClick(volume = 1) {
    this.playAsset('ui_click', volume * 0.6, 50, 0.02, SfxPriority.LOW);
  }

  playModalOpen(volume = 1) {
    this.playAsset('ui_modal_open', volume * 0.6, 100, 0, SfxPriority.LOW);
  }

  playModalClose(volume = 1) {
    this.playAsset('ui_modal_close', volume * 0.5, 100, 0, SfxPriority.LOW);
  }

  playPurchase(volume = 1) {
    this.playAsset('ui_token_purchase', volume * 0.85, 150, 0, SfxPriority.MEDIUM);
  }

  playEquip(volume = 1) {
    this.playAsset('ui_equip_cosmetic', volume * 0.65, 80, 0.02, SfxPriority.LOW);
  }

  playXpTick(volume = 1) {
    this.playAsset('ui_xp_tally_tick', volume * 0.45, 30, 0.05, SfxPriority.LOW);
  }

  playLevelUp(volume = 1) {
    this.playAsset('ui_level_up', volume * 0.95, 500, 0, SfxPriority.CRITICAL);
  }

  playFeatUnlocked(volume = 1) {
    this.playAsset('ui_feat_unlocked', volume * 0.9, 400, 0, SfxPriority.CRITICAL);
  }

  playCountdown(cast = false) {
    if (cast) {
      this.playStart();
    } else {
      this.playAsset('match_countdown_beep', 0.65, 150, 0, SfxPriority.HIGH);
    }
  }

  playStart() {
    this.playAsset('match_start_cast', 0.9, 300, 0, SfxPriority.CRITICAL);
  }

  playVictory() {
    this.playAsset('match_victory', 1.0, 500, 0, SfxPriority.CRITICAL);
  }

  playSadGameOver() {
    this.playAsset('match_game_over_sad', 0.85, 400, 0, SfxPriority.CRITICAL);
  }

  playKillStreak(streakCount: number) {
    if (streakCount === 2) {
      this.playAsset('streak_double_kill', 0.85, 200, 0, SfxPriority.HIGH);
    } else if (streakCount === 3) {
      this.playAsset('streak_triple_kill', 0.9, 200, 0, SfxPriority.HIGH);
    } else if (streakCount === 4) {
      this.playAsset('streak_mega_kill', 0.95, 200, 0, SfxPriority.CRITICAL);
    } else {
      this.playAsset('streak_rampage', 1.0, 200, 0, SfxPriority.CRITICAL);
    }
  }

  playHit() {
    this.playWizardHit(0.7);
  }

  // ── Procedural Web Audio Synth Fallback (Robustness Guarantee) ──

  private fallbackSynth(asset: string, volume: number) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (asset.includes('hit') || asset.includes('wall')) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      gain.gain.setValueAtTime(0.2 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.005, time + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.08);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, time);
      osc.frequency.exponentialRampToValueAtTime(880, time + 0.1);
      gain.gain.setValueAtTime(0.15 * volume, time);
      gain.gain.exponentialRampToValueAtTime(0.005, time + 0.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.1);
    }
  }
}

interface StemPlayback {
  role: StemRole;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  baseGain: number;
}

interface CuePlayback {
  id: MusicCueId;
  stems: Record<StemRole, StemPlayback>;
  filter: BiquadFilterNode;
  bus: GainNode;
  mixReadyAt: number;
}

const STEM_ROLES: StemRole[] = ['drums', 'other', 'vocals'];

export class DynamicMusicPlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private current: CuePlayback | null = null;
  private retiring = new Set<CuePlayback>();
  private transitionId = 0;
  private desiredCue: MusicCueId = 'menu';
  private masterVolume: number;
  private musicVolume: number;
  private enabled: boolean;
  private lastSyncAt = 0;
  private healthRatio = 1;
  private dead = false;
  private danger = 0;

  constructor(masterVolume: number, musicVolume: number, enabled: boolean) {
    this.masterVolume = masterVolume;
    this.musicVolume = musicVolume;
    this.enabled = enabled;
  }

  setLevels(masterVolume: number, musicVolume: number) {
    this.masterVolume = clampVolume(masterVolume);
    this.musicVolume = clampVolume(musicVolume);
    if (this.context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.outputLevel(), this.context.currentTime, 0.04);
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.transitionId++;
      if (this.context && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
      }
      window.setTimeout(() => {
        if (!this.enabled) this.allPlaybacks().forEach((cue) => this.pauseCue(cue));
      }, 350);
      return;
    }

    this.ensureOutput();
    if (this.current) {
      this.resumeCue(this.current);
      if (this.context && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.outputLevel(), this.context.currentTime, 0.12);
      }
    } else {
      void this.transitionTo(this.desiredCue);
    }
  }

  play() {
    return this.playMenu();
  }

  playMenu() {
    return this.transitionTo('menu');
  }

  startMatch(mode: MusicMatchMode) {
    const cue: MusicCueId = mode === 'BATTLE_ROYALE' || mode === 'KING_OF_THE_CAULDRON' ? 'battleRoyale' : mode === 'TEAM_BATTLE' ? 'teamBattle' : 'goldRush';
    return this.transitionTo(cue);
  }

  playResult(won: boolean) {
    return this.transitionTo(won ? 'victory' : 'defeat');
  }

  pause() {
    this.allPlaybacks().forEach((cue) => this.pauseCue(cue));
  }

  updateGameplay(healthRatio: number, dead: boolean, danger = 0) {
    this.healthRatio = clampVolume(healthRatio);
    this.dead = dead;
    this.danger = clampVolume(danger);
    const cue = this.current;
    if (!cue || !this.isMatchCue(cue.id) || !this.context || this.context.currentTime < cue.mixReadyAt) return;

    const critical = clampVolume((0.5 - this.healthRatio) / 0.5);
    const definition = MUSIC_CUES[cue.id];

    let targetDrums = definition.gains.drums;
    let targetOther = definition.gains.other;
    let targetVocals = definition.gains.vocals;

    if (this.dead) {
      targetDrums *= 0.12;
      targetOther *= 0.7;
      targetVocals *= 0.2;
    } else {
      targetDrums *= 1 + this.danger * 0.25;
      targetVocals *= 1 + critical * 0.35;
    }

    this.setStemTarget(cue.stems.drums, targetDrums, 0.12);
    this.setStemTarget(cue.stems.other, targetOther, 0.12);
    this.setStemTarget(cue.stems.vocals, targetVocals, 0.12);
    this.synchronizeStems(cue);
  }

  private outputLevel() {
    return this.enabled ? this.masterVolume * this.musicVolume : 0;
  }

  private ensureOutput() {
    if (!this.context) {
      this.context = getAudioContext();
      if (this.context) {
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.outputLevel();
        this.masterGain.connect(this.context.destination);
      }
    }
  }

  private async transitionTo(id: MusicCueId) {
    this.desiredCue = id;
    if (!this.enabled) return;
    this.ensureOutput();
    if (!this.context || !this.masterGain) return;

    const transitionId = ++this.transitionId;
    if (this.current && this.current.id === id) {
      this.resumeCue(this.current);
      return;
    }

    const nextCue = await this.createCuePlayback(id);
    if (transitionId !== this.transitionId) {
      this.disposeCue(nextCue);
      return;
    }

    const previous = this.current;
    if (previous) {
      this.retiring.add(previous);
      const fadeOut = this.getFadeOutParams(previous.id, id);
      this.ramp(previous.bus.gain, 0.0001, fadeOut.delay, fadeOut.duration);
      window.setTimeout(() => {
        this.retiring.delete(previous);
        this.disposeCue(previous);
      }, (fadeOut.delay + fadeOut.duration + 0.1) * 1000);
    }

    this.current = nextCue;
    const fadeIn = this.getFadeInParams(id);
    this.ramp(nextCue.bus.gain, 1, fadeIn.delay, fadeIn.duration);
    nextCue.mixReadyAt = this.context.currentTime + fadeIn.delay + fadeIn.duration;
  }

  private async createCuePlayback(id: MusicCueId): Promise<CuePlayback> {
    this.ensureOutput();
    const context = this.context!;
    const bus = context.createGain();
    bus.gain.value = 0.0001;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 22000;
    bus.connect(filter);
    filter.connect(this.masterGain!);

    const definition = MUSIC_CUES[id];
    const stems = {} as Record<StemRole, StemPlayback>;

    for (const role of STEM_ROLES) {
      const audio = new Audio();
      audio.src = definition.stems[role];
      audio.loop = definition.loop;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = definition.gains[role];

      source.connect(gain);
      gain.connect(bus);

      stems[role] = {
        role,
        audio,
        source,
        gain,
        baseGain: definition.gains[role]
      };
    }

    STEM_ROLES.forEach((role) => {
      void stems[role].audio.play().catch(() => {});
    });

    return {
      id,
      stems,
      filter,
      bus,
      mixReadyAt: 0
    };
  }

  private getFadeInParams(id: MusicCueId) {
    if (id === 'victory' || id === 'defeat') return { delay: 0, duration: 0.2 };
    return { delay: 0.1, duration: 1.2 };
  }

  private getFadeOutParams(_from: MusicCueId, to: MusicCueId) {
    if (to === 'victory' || to === 'defeat') return { delay: 0, duration: 0.3 };
    return { delay: 0.4, duration: 4.8 };
  }

  private ramp(param: AudioParam, target: number, delay: number, duration: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    param.cancelAndHoldAtTime(now);
    const heldValue = param.value;
    param.setValueAtTime(heldValue, now + delay);
    param.linearRampToValueAtTime(target, now + delay + Math.max(0.01, duration));
  }

  private setStemTarget(stem: StemPlayback, target: number, timeConstant: number) {
    if (!this.context) return;
    stem.gain.gain.setTargetAtTime(Math.max(0, target), this.context.currentTime, timeConstant);
  }

  private synchronizeStems(cue: CuePlayback, force = false) {
    const now = performance.now();
    if (!force && now - this.lastSyncAt < 750) return;
    this.lastSyncAt = now;
    const reference = cue.stems.other.audio;
    if (!Number.isFinite(reference.duration) || reference.duration <= 0) return;
    STEM_ROLES.forEach((role) => {
      const audio = cue.stems[role].audio;
      if (audio === reference || !Number.isFinite(audio.duration)) return;
      let drift = audio.currentTime - reference.currentTime;
      if (drift > reference.duration / 2) drift -= reference.duration;
      if (drift < -reference.duration / 2) drift += reference.duration;
      if (force || Math.abs(drift) > 0.12) {
        audio.currentTime = reference.currentTime;
        audio.playbackRate = 1;
      } else {
        audio.playbackRate = 1 - Math.max(-0.004, Math.min(0.004, drift * 0.025));
      }
    });
  }

  private isMatchCue(id: MusicCueId) {
    return id === 'battleRoyale' || id === 'teamBattle' || id === 'goldRush';
  }

  private allPlaybacks() {
    return this.current ? [this.current, ...this.retiring] : [...this.retiring];
  }

  private pauseCue(cue: CuePlayback) {
    STEM_ROLES.forEach((role) => cue.stems[role].audio.pause());
  }

  private resumeCue(cue: CuePlayback) {
    this.synchronizeStems(cue, true);
    STEM_ROLES.forEach((role) => {
      void cue.stems[role].audio.play().catch(() => {});
    });
  }

  private disposeCue(cue: CuePlayback) {
    STEM_ROLES.forEach((role) => {
      const stem = cue.stems[role];
      stem.audio.pause();
      stem.audio.removeAttribute('src');
      stem.audio.load();
      stem.source.disconnect();
      stem.gain.disconnect();
    });
    cue.filter.disconnect();
    cue.bus.disconnect();
  }
}

export const sfx = new SoundSynthesizer(audioSettings.masterVolume, audioSettings.sfxVolume);
export const music = new DynamicMusicPlayer(audioSettings.masterVolume, audioSettings.musicVolume, audioSettings.musicEnabled);

export function getAudioSettings(): AudioSettings {
  return { ...audioSettings };
}

export function setMasterVolume(value: number) {
  audioSettings.masterVolume = clampVolume(value);
  sfx.setLevels(audioSettings.masterVolume, audioSettings.sfxVolume);
  music.setLevels(audioSettings.masterVolume, audioSettings.musicVolume);
  saveAudioSettings(audioSettings);
}

export function setMusicVolume(value: number) {
  audioSettings.musicVolume = clampVolume(value);
  music.setLevels(audioSettings.masterVolume, audioSettings.musicVolume);
  saveAudioSettings(audioSettings);
}

export function setSfxVolume(value: number) {
  audioSettings.sfxVolume = clampVolume(value);
  sfx.setLevels(audioSettings.masterVolume, audioSettings.sfxVolume);
  saveAudioSettings(audioSettings);
}

export function setMusicEnabled(enabled: boolean) {
  audioSettings.musicEnabled = enabled;
  music.setEnabled(enabled);
  saveAudioSettings(audioSettings);
}

let isAppMuted = false;
export function setMuted(muted: boolean) {
  if (isAppMuted === muted) return;
  isAppMuted = muted;
  if (muted) {
    sfx.setLevels(0, 0);
    music.setLevels(0, 0);
  } else {
    sfx.setLevels(audioSettings.masterVolume, audioSettings.sfxVolume);
    music.setLevels(audioSettings.masterVolume, audioSettings.musicVolume);
  }
}
