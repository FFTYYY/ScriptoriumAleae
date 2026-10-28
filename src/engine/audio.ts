/**
 * Synthesised foley: every clack is generated from the impulse the physics solver
 * actually applied, so loud bounces sound loud and a die settling on felt barely whispers.
 */

export type Surface = 'felt' | 'wood' | 'die';
export type Body = 'resin' | 'stone' | 'metal';

export class DiceAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private voices = 0;
  enabled = true;
  private vol = 0.7;

  get volume() {
    return this.vol;
  }

  set volume(v: number) {
    this.vol = v;
    if (this.master) this.master.gain.value = v * 0.9;
  }

  /** Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.vol * 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      this.master.connect(comp).connect(ctx.destination);
      this.dry = ctx.createGain();
      this.dry.gain.value = 1;
      this.dry.connect(this.master);
      const conv = ctx.createConvolver();
      conv.buffer = this.impulse(1.1, 3.2);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.22;
      this.wet.connect(conv).connect(this.master);
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (t < 0.01 ? t / 0.01 : 1);
      }
    }
    return buf;
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.dry);
    p.connect(this.wet);
    return p;
  }

  private burst(dest: AudioNode, t: number, type: BiquadFilterType, f: number, q: number, gain: number, decay: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(flt).connect(g).connect(dest);
    src.start(t, Math.random() * 0.8, decay + 0.05);
    this.voices++;
    src.onended = () => this.voices--;
  }

  private tone(dest: AudioNode, t: number, f: number, gain: number, decay: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.92, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.02);
    this.voices++;
    o.onended = () => this.voices--;
  }

  /** intensity 0‥1 (normalised impact speed), size ≈ die radius in cm, pan −1‥1 */
  hit(surface: Surface, body: Body, intensity: number, size: number, pan: number) {
    const ctx = this.ready();
    if (!ctx || this.voices > 40) return;
    const t = ctx.currentTime + 0.002;
    const g = Math.pow(Math.min(1, intensity), 1.25);
    if (g < 0.004) return;
    const dest = this.out(pan);
    const pitch = (1.3 / Math.max(0.8, size)) * (0.88 + Math.random() * 0.24);
    const metal = body === 'metal';
    const stone = body === 'stone';
    switch (surface) {
      case 'die': {
        this.burst(dest, t, 'bandpass', (metal ? 3600 : stone ? 4300 : 3200) * pitch, metal ? 14 : 7, g * 0.9, metal ? 0.09 : 0.035);
        this.tone(dest, t, (metal ? 2650 : stone ? 3400 : 2300) * pitch, g * 0.16, metal ? 0.38 : stone ? 0.06 : 0.04);
        if (metal) {
          this.tone(dest, t, 2650 * 2.76 * pitch, g * 0.06, 0.22);
          this.tone(dest, t, 2650 * 5.4 * pitch, g * 0.03, 0.12);
        }
        break;
      }
      case 'wood': {
        this.burst(dest, t, 'bandpass', 1100 * pitch, 3.5, g * 1.0, 0.07);
        this.tone(dest, t, 210 * pitch, g * 0.35, 0.07);
        this.burst(dest, t, 'highpass', 3800, 0.7, g * (metal ? 0.35 : 0.22), 0.02);
        if (metal) this.tone(dest, t, 2400 * pitch, g * 0.08, 0.25);
        break;
      }
      case 'felt': {
        this.burst(dest, t, 'lowpass', 650 * pitch, 0.8, g * 0.65, 0.055);
        this.tone(dest, t, 130 * pitch, g * 0.22, 0.05);
        if (metal || stone) this.burst(dest, t, 'bandpass', 2600 * pitch, 4, g * 0.12, 0.03);
        break;
      }
    }
  }

  /** A few dice knocking together inside a closed hand. */
  rattle(strength: number, body: Body) {
    const ctx = this.ready();
    if (!ctx) return;
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + Math.random() * 0.03;
      const dest = this.out((Math.random() - 0.5) * 0.4);
      const g = strength * (0.25 + Math.random() * 0.3);
      this.burst(dest, t, 'bandpass', (body === 'metal' ? 3800 : 3000) * (0.85 + Math.random() * 0.3), 6, g, 0.03);
      // muffled by the palm
      this.burst(dest, t, 'lowpass', 900, 0.7, g * 0.4, 0.04);
    }
  }

  ui(kind: 'tick' | 'page' | 'seal' | 'chime') {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.002;
    const dest = this.out(0);
    switch (kind) {
      case 'tick':
        this.burst(dest, t, 'bandpass', 2400, 5, 0.07, 0.02);
        this.tone(dest, t, 900, 0.025, 0.03);
        break;
      case 'page': {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.2;
        f.frequency.setValueAtTime(700, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        src.connect(f).connect(g).connect(dest);
        src.start(t, Math.random() * 0.5, 0.35);
        break;
      }
      case 'seal':
        this.tone(dest, t, 95, 0.22, 0.18);
        this.burst(dest, t, 'lowpass', 500, 0.8, 0.16, 0.08);
        break;
      case 'chime':
        [1, 1.5, 2.01, 3].forEach((m, i) => this.tone(dest, t + i * 0.035, 660 * m, 0.04 / (i + 1), 1.4 - i * 0.2));
        break;
    }
  }
}
