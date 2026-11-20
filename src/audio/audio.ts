import type { SurfaceId } from '../config/surfaces';
import { clamp } from '../core/math';

/**
 * All sound is synthesised with WebAudio — no audio files, nothing to license.
 * The context is created lazily on the first user gesture (mobile autoplay rules).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private wobbleGain!: GainNode;
  private wobbleOsc!: OscillatorNode;
  private wobbleLfo!: OscillatorNode;
  private sfxVol = 0.8;
  private musicVol = 0.5;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private step = 0;
  private musicOn = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.musicVol * 0.5;
      this.music.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.setupLoops();
      if (this.musicOn) this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.ctx) {
      this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
      this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private setupLoops(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 400;
    this.rollFilter.Q.value = 0.8;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.sfx);
    src.start();
    // Wobble: low rattle with tremolo.
    this.wobbleOsc = ctx.createOscillator();
    this.wobbleOsc.type = 'triangle';
    this.wobbleOsc.frequency.value = 70;
    this.wobbleLfo = ctx.createOscillator();
    this.wobbleLfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    this.wobbleGain = ctx.createGain();
    this.wobbleGain.gain.value = 0;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    this.wobbleLfo.connect(lfoGain).connect(trem.gain);
    this.wobbleOsc.connect(trem).connect(this.wobbleGain).connect(this.sfx);
    this.wobbleOsc.start();
    this.wobbleLfo.start();
  }

  /** Continuous sounds for the player's racer. */
  updateRolling(speed: number, surface: SurfaceId, wobble: number, active: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = active ? clamp(speed / 12, 0, 1) : 0;
    const freq: Record<SurfaceId, number> = { paved: 900, dirt: 380, gravel: 1500, grass: 260, mud: 180 };
    const loud: Record<SurfaceId, number> = { paved: 0.08, dirt: 0.14, gravel: 0.2, grass: 0.08, mud: 0.12 };
    this.rollFilter.frequency.setTargetAtTime(freq[surface] * (0.7 + v * 0.6), t, 0.08);
    this.rollGain.gain.setTargetAtTime(loud[surface] * v, t, 0.08);
    this.wobbleGain.gain.setTargetAtTime(active ? clamp((wobble - 0.35) * 0.25, 0, 0.12) : 0, t, 0.05);
    this.wobbleLfo.frequency.setTargetAtTime(6 + wobble * 10, t, 0.1);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, type: OscillatorType, peak: number, decay: number, when = 0, slideTo?: number, dest?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + decay);
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, decay);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private burst(filterFreq: number, q: number, peak: number, decay: number, when = 0, type: BiquadFilterType = 'bandpass', dest?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.003, decay);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random());
    src.stop(t + decay + 0.05);
  }

  /** Stick tapping the tyre. */
  tap(intensity = 1): void {
    this.burst(2400, 4, 0.18 * intensity, 0.05);
    this.tone(520 + Math.random() * 60, 'triangle', 0.06 * intensity, 0.06);
  }
  footstep(surface: SurfaceId): void {
    this.burst(surface === 'paved' ? 1400 : 600, 1.2, 0.05, 0.05);
  }
  bump(impact: number): void {
    const v = clamp(impact / 6, 0.2, 1);
    this.burst(300, 1, 0.5 * v, 0.18, 0, 'lowpass');
    this.tone(110, 'sine', 0.35 * v, 0.2, 0, 60);
  }
  fall(): void {
    this.tone(500, 'square', 0.08, 0.45, 0, 120);
    this.burst(250, 0.8, 0.5, 0.35, 0.12, 'lowpass');
    this.tone(90, 'sine', 0.4, 0.3, 0.12, 50);
  }
  recover(): void {
    this.tone(330, 'triangle', 0.12, 0.12);
    this.tone(495, 'triangle', 0.12, 0.12, 0.08);
    this.tone(660, 'triangle', 0.12, 0.2, 0.16);
  }
  countdown(n: number): void {
    if (n > 0) this.tone(660, 'square', 0.12, 0.25);
    else { this.tone(1320, 'square', 0.14, 0.5); this.tone(990, 'square', 0.08, 0.5); }
  }
  lap(final: boolean): void {
    const notes = final ? [784, 988, 1175, 1568] : [659, 784, 988];
    notes.forEach((f, i) => this.tone(f, 'triangle', 0.14, 0.18, i * 0.08));
  }
  finish(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047, 784, 1047, 1319] : [523, 659, 784, 659];
    notes.forEach((f, i) => { this.tone(f, 'square', 0.08, 0.22, i * 0.12); this.tone(f / 2, 'triangle', 0.1, 0.22, i * 0.12); });
  }
  click(): void {
    this.tone(880, 'sine', 0.1, 0.06, 0, 1200);
  }
  wrongWay(): void {
    this.tone(220, 'sawtooth', 0.06, 0.25);
  }
  /** Rising wobble warning when the tyre turns UNSTABLE. */
  wobbleWarn(): void {
    this.tone(300, 'triangle', 0.07, 0.12, 0, 520);
    this.tone(300, 'triangle', 0.07, 0.12, 0.13, 520);
  }
  whoosh(k = 0.6): void {
    this.burst(900, 0.6, 0.18 * k, 0.35, 0, 'bandpass');
  }
  land(k = 0.6): void {
    this.burst(220, 0.8, 0.45 * k, 0.16, 0, 'lowpass');
    this.tone(95, 'sine', 0.3 * k, 0.15, 0, 55);
  }
  splash(): void {
    this.burst(1200, 0.5, 0.4, 0.5, 0, 'bandpass');
    this.burst(400, 0.7, 0.3, 0.6, 0.05, 'lowpass');
  }
  catchTyre(): void {
    this.tone(660, 'triangle', 0.06, 0.06);
    this.burst(2500, 3, 0.08, 0.04, 0.02);
  }
  boost(): void {
    this.tone(330, 'sawtooth', 0.06, 0.45, 0, 990);
    this.tone(495, 'square', 0.04, 0.4, 0.03, 1320);
  }
  /** Rolling through dog poo. */
  squish(): void {
    this.tone(160, 'sine', 0.2, 0.18, 0, 70);
    this.burst(500, 2, 0.15, 0.12, 0.02, 'lowpass');
  }
  clean(): void {
    [1047, 1319, 1568].forEach((f, i) => this.tone(f, 'sine', 0.08, 0.12, i * 0.06));
  }
  /** Cartoon bonk + birdies. */
  stun(): void {
    this.tone(700, 'square', 0.1, 0.25, 0, 180);
    [1800, 2200, 1900, 2400].forEach((f, i) => this.tone(f, 'sine', 0.04, 0.08, 0.25 + i * 0.1));
  }
  clunk(): void {
    this.burst(350, 1.2, 0.35, 0.12, 0, 'lowpass');
    this.tone(140, 'triangle', 0.15, 0.1, 0, 90);
  }
  thunk(): void {
    this.tone(180, 'triangle', 0.25, 0.14, 0, 110);
    this.burst(700, 2, 0.12, 0.06);
  }
  /** A friendly street-dog bark: two short noisy tones. */
  bark(): void {
    for (const t of [0, 0.22]) {
      this.tone(520, 'sawtooth', 0.12, 0.1, t, 300);
      this.burst(900, 1.5, 0.18, 0.09, t, 'bandpass');
    }
  }

  /** Double-tap dash: quick rising swish. */
  dash(): void {
    this.burst(1600, 0.8, 0.22, 0.22, 0, 'bandpass');
    this.tone(260, 'triangle', 0.08, 0.2, 0, 620);
  }
  /** Ramp landing bonus: bright arpeggio + sparkle. */
  niceCatch(): void {
    [784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 'triangle', 0.11, 0.14, i * 0.055));
    this.burst(5000, 2, 0.06, 0.25, 0.2, 'highpass');
  }
  /** Pickup collected: roulette ticks then a ding. */
  pickup(): void {
    for (let i = 0; i < 7; i++) this.tone(900 + (i % 2) * 300, 'square', 0.035, 0.04, i * 0.13);
    this.tone(1320, 'sine', 0.12, 0.3, 0.95);
  }
  /** Item used — each snack has its own sound. */
  itemUse(id: string): void {
    switch (id) {
      case 'skyflakes':
        this.burst(2900, 2, 0.2, 0.11);
        this.tone(730, 'triangle', 0.12, 0.11, 0, 400);
        break;
      case 'saging':
        this.tone(285, 'triangle', 0.18, 0.15, 0, 610);
        break;
      case 'buko': // hollow coconut knock
        this.tone(420, 'sine', 0.2, 0.18, 0, 380);
        this.tone(420, 'sine', 0.16, 0.18, 0.16, 380);
        break;
      case 'turon': // golden shimmer
        [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 'sine', 0.07, 0.25, i * 0.04));
        break;
    }
  }
  itemHit(): void {
    this.tone(520, 'sine', 0.18, 0.25, 0, 260);
    this.burst(3000, 3, 0.1, 0.1);
  }
  /** Basketball bounce on the court (positional volume from the caller). */
  dribble(vol: number): void {
    this.tone(110, 'sine', 0.25 * vol, 0.09, 0, 70);
    this.burst(500, 2, 0.08 * vol, 0.04, 0, 'lowpass');
  }
  /** Cartoon "whoa!" when brushing past a pedestrian. */
  oops(): void {
    this.tone(700, 'triangle', 0.08, 0.22, 0, 420);
    this.tone(500, 'triangle', 0.06, 0.18, 0.12, 300);
  }

  // ------------------------------------------------------------------ music
  /**
   * Original procedural tune: a bouncy 2/4 "rondalla"-flavoured loop — plucked bandurria-like
   * melody over strummed chords, bass, shaker and woodblock.
   */
  startMusic(): void {
    this.musicOn = true;
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 50);
  }
  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  private pluck(freq: number, when: number, peak: number, decay: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = freq * 2.003;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, when);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + decay);
    const g = ctx.createGain();
    this.env(g, when, peak, 0.004, decay);
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(this.music);
    o.start(when); o2.start(when);
    o.stop(when + decay + 0.05); o2.stop(when + decay + 0.05);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const bpm = 124;
    const sixteenth = 60 / bpm / 4;
    // C - F - G - C | Am - F - G - C  (one chord per bar of 8 sixteenths in 2/4)
    const chords = [[261.6, 329.6, 392.0], [349.2, 440.0, 523.3], [392.0, 493.9, 587.3], [261.6, 329.6, 392.0],
      [220.0, 261.6, 329.6], [349.2, 440.0, 523.3], [392.0, 493.9, 587.3], [261.6, 329.6, 392.0]];
    const bass = [130.8, 174.6, 196.0, 130.8, 110.0, 174.6, 196.0, 130.8];
    // Melody in C major pentatonic-ish, 64 steps (8 bars × 8 sixteenths). 0 = rest.
    const mel = [
      784, 0, 659, 0, 784, 880, 784, 0, 698, 0, 880, 0, 1047, 0, 880, 0,
      988, 0, 784, 0, 880, 0, 988, 0, 1047, 0, 784, 659, 784, 0, 0, 0,
      659, 0, 784, 0, 880, 0, 784, 659, 698, 0, 659, 0, 587, 0, 523, 0,
      587, 0, 659, 0, 784, 0, 587, 0, 523, 0, 659, 784, 1047, 0, 0, 0,
    ];
    while (this.nextNote < ctx.currentTime + 0.2) {
      const s = this.step % 64;
      const bar = Math.floor(s / 8);
      const inBar = s % 8;
      const t = this.nextNote;
      if (inBar === 0 || inBar === 4) this.pluck(bass[bar] / 2, t, 0.35, 0.3);
      if (inBar === 2 || inBar === 6) chords[bar].forEach((f, i) => this.pluck(f, t + i * 0.012, 0.09, 0.22));
      if (mel[s]) this.pluck(mel[s], t, 0.12, 0.28);
      // shaker on every 16th, accent off-beats
      this.burst(7000, 1, inBar % 2 ? 0.04 : 0.02, 0.04, t - ctx.currentTime, 'highpass', this.music);
      if (inBar === 3 || inBar === 7) this.tone(1200, 'sine', 0.05, 0.05, t - ctx.currentTime, undefined, this.music);
      this.nextNote += sixteenth;
      this.step++;
    }
  }
}
