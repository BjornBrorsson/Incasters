class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction to bypass browser policies
  }

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playShoot() {
    this.init();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(150, time + 0.15);

    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
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
    gain.connect(this.ctx.destination);

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
    gain.connect(this.ctx.destination);

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
    gain.connect(this.ctx.destination);

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
      gain.connect(this.ctx!.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.15);
    });
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
      gain.connect(this.ctx!.destination);

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
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.5);
  }
}

export const sfx = new SoundSynthesizer();
