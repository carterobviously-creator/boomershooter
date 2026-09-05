/** Procedural 16-bit SFX + drone. Unlocked on first gesture. */

type Bus = { master: GainNode; sfx: GainNode; music: GainNode };

class AudioSys {
  ctx: AudioContext | null = null;
  bus: Bus | null = null;
  noise: AudioBuffer | null = null;
  stepCd = 0;
  musicNodes: AudioNode[] = [];
  volume = 0.8;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      const master = this.ctx.createGain();
      const sfx = this.ctx.createGain();
      const music = this.ctx.createGain();
      sfx.gain.value = 0.9;
      music.gain.value = 0.22;
      sfx.connect(master);
      music.connect(master);
      master.connect(this.ctx.destination);
      this.bus = { master, sfx, music };
      this.noise = this.makeNoise();
      this.setVolume(this.volume);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.musicNodes.length === 0) this.startDrone();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.bus) this.bus.master.gain.setTargetAtTime(v * v, this.ctx!.currentTime, 0.02);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private envGain(peak: number, attack: number, decay: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private osc(type: OscillatorType, freq: number, dur: number, peak: number, detune = 0) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = this.envGain(peak, 0.008, dur);
    o.connect(g);
    g.connect(this.bus.sfx);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private noiseBurst(dur: number, peak: number, hp = 400, lp = 4000) {
    if (!this.ctx || !this.bus || !this.noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = (hp + lp) / 2;
    filter.Q.value = 0.7;
    const g = this.envGain(peak, 0.004, dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.bus.sfx);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  shotgun() {
    this.unlock();
    this.noiseBurst(0.18, 0.9, 200, 1800);
    this.osc("sawtooth", 90, 0.16, 0.4);
    this.osc("square", 42, 0.22, 0.35);
  }

  orb() {
    this.unlock();
    this.osc("sine", 520 + Math.random() * 40, 0.12, 0.22);
    this.osc("triangle", 780, 0.1, 0.12);
  }

  melee() {
    this.unlock();
    this.noiseBurst(0.08, 0.4, 800, 3000);
    this.osc("sawtooth", 140, 0.08, 0.2);
  }

  hit() {
    this.unlock();
    this.osc("square", 880 + Math.random() * 80, 0.05, 0.16);
    this.noiseBurst(0.06, 0.25, 1200, 5000);
  }

  hurt() {
    this.unlock();
    this.osc("sawtooth", 110, 0.2, 0.3);
    this.osc("sine", 55, 0.28, 0.25);
  }

  pickup() {
    this.unlock();
    this.osc("sine", 660, 0.08, 0.18);
    this.osc("sine", 990, 0.12, 0.14, 8);
  }

  explode() {
    this.unlock();
    this.noiseBurst(0.32, 0.7, 80, 900);
    this.osc("sawtooth", 48, 0.3, 0.4);
  }

  empty() {
    this.unlock();
    this.osc("square", 140, 0.06, 0.08);
  }

  heal() {
    this.unlock();
    this.osc("sine", 523, 0.14, 0.16);
    this.osc("sine", 659, 0.18, 0.14);
    this.osc("sine", 784, 0.22, 0.12);
  }

  wave() {
    this.unlock();
    this.osc("triangle", 196, 0.25, 0.18);
    this.osc("triangle", 247, 0.32, 0.14);
    this.osc("triangle", 311, 0.4, 0.12);
  }

  step(dt: number, moving: boolean) {
    if (!moving) {
      this.stepCd = 0;
      return;
    }
    this.stepCd -= dt;
    if (this.stepCd > 0) return;
    this.stepCd = 0.36;
    this.unlock();
    this.noiseBurst(0.05, 0.12, 200, 600);
  }

  block() {
    this.unlock();
    this.osc("triangle", 320, 0.08, 0.18);
    this.noiseBurst(0.07, 0.2, 400, 1400);
  }

  private startDrone() {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const make = (freq: number, type: OscillatorType, gain: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lg = ctx.createGain();
      lg.gain.value = freq * 0.012;
      lfo.connect(lg);
      lg.connect(o.frequency);
      o.connect(g);
      g.connect(this.bus!.music);
      o.start();
      lfo.start();
      this.musicNodes.push(o, g, lfo, lg);
    };
    make(55, "sine", 0.35);
    make(82.4, "triangle", 0.12);
    make(110, "sine", 0.08);
  }
}

export const audio = new AudioSys();
