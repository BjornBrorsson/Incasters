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
type SfxAsset = 'conjure' | 'air' | 'fizzle' | 'wallHit' | 'wizardHit';

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

const SFX_ASSETS: Record<SfxAsset, string> = {
  conjure: new URL('../assets/audio/sfx/conjure_Fireball_sfx.wav', import.meta.url).href,
  air: new URL('../assets/audio/sfx/fireball_air.wav', import.meta.url).href,
  fizzle: new URL('../assets/audio/sfx/fireball_fizzle_out.wav', import.meta.url).href,
  wallHit: new URL('../assets/audio/sfx/fireball_wall_hit.wav', import.meta.url).href,
  wizardHit: new URL('../assets/audio/sfx/fireball_wizard_hit.wav', import.meta.url).href
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

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterVolume: number;
  private sfxVolume: number;
  private bufferCache = new Map<SfxAsset, Promise<AudioBuffer>>();
  private lastPlayed = new Map<SfxAsset, number>();

  constructor(masterVolume: number, sfxVolume: number) {
    this.masterVolume = masterVolume;
    this.sfxVolume = sfxVolume;
    // AudioContext will be initialized on first user interaction to bypass browser policies
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
    (Object.keys(SFX_ASSETS) as SfxAsset[]).forEach((asset) => {
      void this.loadAsset(asset).catch(() => {});
    });
  }

  private loadAsset(asset: SfxAsset) {
    let pending = this.bufferCache.get(asset);
    if (!pending) {
      const context = getAudioContext();
      if (!context) return Promise.reject(new Error('Web Audio unavailable'));
      pending = fetch(SFX_ASSETS[asset])
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to load ${asset}`);
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data));
      this.bufferCache.set(asset, pending);
    }
    return pending;
  }

  private playAsset(asset: SfxAsset, volume: number, cooldownMs: number, rateVariance = 0) {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(asset) ?? -Infinity) < cooldownMs) return;
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
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    }).catch(() => {});
  }

  playShoot(volume = 1) {
    this.playAsset('conjure', volume * 0.62, 45, 0.025);
    this.playAsset('air', volume * 0.24, 45, 0.035);
  }

  playWizardHit(volume = 1) {
    this.playAsset('wizardHit', volume * 0.72, 70, 0.025);
  }

  playWallHit(volume = 1) {
    this.playAsset('wallHit', volume * 0.72, 45, 0.04);
  }

  playFizzle(volume = 1) {
    this.playAsset('fizzle', volume * 0.45, 100, 0.035);
  }

  playSpellClash(volume = 1) {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    // Resonant crystal sparkle + impact burst
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(880, time);
    osc1.frequency.exponentialRampToValueAtTime(1760, time + 0.06);
    osc1.frequency.exponentialRampToValueAtTime(440, time + 0.18);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, time);
    osc2.frequency.exponentialRampToValueAtTime(2200, time + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(660, time + 0.18);

    gain.gain.setValueAtTime(0.18 * volume, time);
    gain.gain.exponentialRampToValueAtTime(0.005, time + 0.18);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain!);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.18);
    osc2.stop(time + 0.18);
  }

  playHeartbeat() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    // Low sub-bass thud pulse (lub-dub)
    const playThud = (offset: number, freq: number, dur: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time + offset);
      osc.frequency.exponentialRampToValueAtTime(35, time + offset + dur);
      gain.gain.setValueAtTime(0.22, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, time + offset + dur);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(time + offset);
      osc.stop(time + offset + dur);
    };

    playThud(0, 75, 0.1);
    playThud(0.13, 65, 0.12);
  }

  playKillStreak(streakCount: number) {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const chords: number[][] = [
      [523.25, 659.25],          // 2x: C5 + E5
      [523.25, 659.25, 783.99],  // 3x: C5 + E5 + G5
      [659.25, 783.99, 1046.50], // 4x: E5 + G5 + C6
      [783.99, 987.77, 1318.51]  // 5x+: G5 + B5 + E6 Rampage!
    ];
    const notes = chords[Math.min(streakCount - 2, chords.length - 1)] || chords[0];

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time + idx * 0.04);

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, time);
      filter.frequency.exponentialRampToValueAtTime(500, time + 0.3);

      gain.gain.setValueAtTime(0.12, time + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.005, time + idx * 0.04 + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(time + idx * 0.04);
      osc.stop(time + idx * 0.04 + 0.28);
    });
  }

  playHit() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    // Create noise buffer
    const bufferSize = this.ctx.sampleRate * 0.1; // 0.1 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    noise.start(time);
    noise.stop(time + 0.1);
  }

  playBounce() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, time);
    osc.frequency.setValueAtTime(900, time + 0.04);

    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(time);
    osc.stop(time + 0.08);
  }

  playDash() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);

    noise.start(time);
    noise.stop(time + 0.15);
  }

  playPowerup() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const noteTime = time + idx * 0.06;
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.setValueAtTime(0.08, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.005, noteTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    });
  }

  playCountdown(cast = false) {
    if (cast) {
      this.playStart();
      return;
    }
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, time);
    osc.frequency.exponentialRampToValueAtTime(620, time + 0.12);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.005, time + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  playStart() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const notes = [329.63, 392.00, 523.25, 659.25]; // E4, G4, C5, E5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.value = freq;

      const noteTime = time + idx * 0.08;
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.setValueAtTime(0.1, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.005, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    });
  }

  playSadGameOver() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.linearRampToValueAtTime(110, time + 0.5);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(time);
    osc.stop(time + 0.5);
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

class DynamicMusicPlayer {
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
    const drums = this.dead ? 0.04 : Math.min(1.05, definition.gains.drums * (1 + critical * 0.22 + this.danger * 0.16));
    const other = definition.gains.other * (this.dead ? 0.65 : 1 - critical * 0.16 - this.danger * 0.08);
    const vocals = definition.gains.vocals * (this.dead ? 0.28 : 1 - critical * 0.32 - this.danger * 0.12);
    this.setStemTarget(cue.stems.drums, drums, this.dead ? 0.16 : 0.35);
    this.setStemTarget(cue.stems.other, other, this.dead ? 0.5 : 0.8);
    this.setStemTarget(cue.stems.vocals, vocals, this.dead ? 0.7 : 1.1);
    cue.filter.frequency.setTargetAtTime(this.dead ? 1150 : 18000, this.context.currentTime, this.dead ? 0.22 : 0.8);
    cue.bus.gain.setTargetAtTime(this.dead ? 0.72 : 1, this.context.currentTime, this.dead ? 0.25 : 0.7);
    this.synchronizeStems(cue);
  }

  private ensureOutput() {
    if (!this.context) this.context = getAudioContext();
    if (this.context && !this.masterGain) {
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.enabled ? this.outputLevel() : 0;
      this.masterGain.connect(this.context.destination);
    }
    return this.context;
  }

  private outputLevel() {
    return clampVolume(this.masterVolume * this.musicVolume);
  }

  private async transitionTo(id: MusicCueId) {
    this.desiredCue = id;
    if (!this.enabled) return;
    const context = this.ensureOutput();
    if (!context || !this.masterGain) return;
    if (this.current?.id === id) {
      this.resumeCue(this.current);
      this.masterGain.gain.setTargetAtTime(this.outputLevel(), context.currentTime, 0.1);
      return;
    }

    const transitionId = ++this.transitionId;
    const next = await this.createCue(id, transitionId);
    if (!next || transitionId !== this.transitionId || !this.enabled) {
      if (next) this.disposeCue(next);
      return;
    }

    const previous = this.current;
    this.current = next;
    const now = context.currentTime;
    let latestAttack = 0;
    STEM_ROLES.forEach((role) => {
      const timing = this.attackTiming(id, role);
      const stem = next.stems[role];
      latestAttack = Math.max(latestAttack, timing.delay + timing.duration);
      this.ramp(stem.gain.gain, stem.baseGain, timing.delay, timing.duration);
    });
    next.mixReadyAt = now + latestAttack;

    if (previous) {
      this.retiring.add(previous);
      STEM_ROLES.forEach((role) => {
        const duration = role === 'drums' ? 1.35 : role === 'other' ? 3.1 : 4.2;
        this.ramp(previous.stems[role].gain.gain, 0, 0, duration);
      });
      window.setTimeout(() => {
        this.retiring.delete(previous);
        this.disposeCue(previous);
      }, 4400);
    }
  }

  private async createCue(id: MusicCueId, transitionId: number) {
    const context = this.ensureOutput();
    if (!context || !this.masterGain) return null;
    const definition = MUSIC_CUES[id];
    const filter = context.createBiquadFilter();
    const bus = context.createGain();
    const stems = {} as Record<StemRole, StemPlayback>;
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    bus.gain.value = 1;
    filter.connect(bus);
    bus.connect(this.masterGain);

    const ready: Promise<void>[] = [];
    STEM_ROLES.forEach((role) => {
      const audio = new Audio(definition.stems[role]);
      audio.preload = 'auto';
      audio.loop = definition.loop;
      audio.currentTime = 0;
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(filter);
      stems[role] = { role, audio, source, gain, baseGain: definition.gains[role] };
      ready.push(this.waitUntilPlayable(audio));
      void audio.play().catch(() => {});
    });

    await Promise.all(ready);
    if (transitionId !== this.transitionId || !this.enabled) {
      const abandoned = { id, stems, filter, bus, mixReadyAt: 0 };
      this.disposeCue(abandoned);
      return null;
    }

    STEM_ROLES.forEach((role) => {
      const audio = stems[role].audio;
      audio.pause();
      audio.currentTime = 0;
    });
    await Promise.all(STEM_ROLES.map((role) => stems[role].audio.play().catch(() => {})));
    return { id, stems, filter, bus, mixReadyAt: 0 };
  }

  private waitUntilPlayable(audio: HTMLAudioElement) {
    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('canplay', finish);
        audio.removeEventListener('error', finish);
        resolve();
      };
      audio.addEventListener('canplay', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      window.setTimeout(finish, 8000);
      audio.load();
    });
  }

  private attackTiming(id: MusicCueId, role: StemRole) {
    if (id === 'defeat') {
      if (role === 'drums') return { delay: 1.8, duration: 3.8 };
      if (role === 'other') return { delay: 0, duration: 2.2 };
      return { delay: 0.5, duration: 4.2 };
    }
    if (id === 'victory') {
      if (role === 'drums') return { delay: 0, duration: 1.0 };
      if (role === 'other') return { delay: 0, duration: 1.8 };
      return { delay: 0.35, duration: 3.2 };
    }
    if (id === 'menu') {
      if (role === 'drums') return { delay: 0.6, duration: 2.4 };
      if (role === 'other') return { delay: 0, duration: 2.0 };
      return { delay: 0.8, duration: 4.5 };
    }
    if (role === 'drums') return { delay: 1.25, duration: 1.15 };
    if (role === 'other') return { delay: 0, duration: 2.8 };
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
