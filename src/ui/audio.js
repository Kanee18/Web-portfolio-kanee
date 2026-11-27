import bgmUrl from '../BGM/cosmos-bgm.mp3';

/**
 * SOUNDTRACK
 * ──────────
 * • The background music (src/BGM/cosmos-bgm.mp3) is one exact musical cycle of
 *   your track (186.059646 s, measured by cross-correlating the source file) plus
 *   0.5 s of identical margin on both sides. Looping between those two points with
 *   an AudioBufferSourceNode is sample-accurate → no gap, no click, ever — and it
 *   stays seamless whatever encoder padding the browser's MP3 decoder adds.
 * • The file is fetched + decoded while the loader runs (OfflineAudioContext, so no
 *   autoplay warnings); the real AudioContext is only created by the Start click.
 * • On Start the music begins muffled and opens up with the big bang. Scrolling fast
 *   (hyperspace) adds a soft whoosh and a gentle low-pass, glass buttons ping.
 */
const LOOP_START = 0.5;
const LOOP_LENGTH = 186.059646;
const MASTER = 0.5; // ≈ −20 LUFS — sits under the visuals

export class Soundtrack {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.enabled = false;
    this.opened = false;
    this.listeners = [];
    this.ready = this.preload();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled) this.ctx.resume();
    });
  }

  onChange(cb) {
    this.listeners.push(cb);
  }
  emit() {
    this.listeners.forEach((cb) => cb(this.enabled));
  }

  async preload() {
    try {
      const res = await fetch(bgmUrl);
      const data = await res.arrayBuffer();
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const decoder = new OAC(2, 1, 44100);
      this.buffer = await new Promise((resolve, reject) => decoder.decodeAudioData(data, resolve, reject));
      return true;
    } catch (err) {
      console.warn('[cosmos] soundtrack unavailable', err);
      return false;
    }
  }

  /** Build the graph. Must first be called from a user gesture. */
  context() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try {
      ctx = new AC({ latencyHint: 'playback' });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.4;
    this.master.connect(comp).connect(ctx.destination);

    // music path: source → tone (low-pass) → music gain → master
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.6;
    this.music = ctx.createGain();
    this.music.gain.value = 1;
    this.tone.connect(this.music).connect(this.master);

    // hyperspace "wind": looped brown noise through a sweeping band-pass
    const len = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 500;
    this.band.Q.value = 0.7;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    noise.connect(this.band).connect(this.wind).connect(this.master);
    noise.start();
    return ctx;
  }

  /** Start the music (call synchronously inside the click that unlocks audio). */
  start({ bangIn = 1.25 } = {}) {
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.enabled = true;
    this.emit();
    const go = () => {
      if (!this.buffer || this.source || !this.enabled) return;
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.loop = true;
      // the measured cycle only applies to the bundled track; any other file loops whole
      const tuned = Math.abs(this.buffer.duration - (LOOP_LENGTH + 2 * LOOP_START)) < 0.1;
      src.loopStart = tuned ? LOOP_START : 0;
      src.loopEnd = tuned ? LOOP_START + LOOP_LENGTH : this.buffer.duration;
      src.connect(this.tone);
      const t = ctx.currentTime + 0.04;
      src.start(t, src.loopStart);
      this.source = src;
      // muffled while the singularity collapses, opening up with the bang
      const f = this.tone.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(260, t);
      f.setValueAtTime(260, t + bangIn);
      f.exponentialRampToValueAtTime(18000, t + bangIn + 3.2);
      setTimeout(() => (this.opened = true), (bangIn + 3.4) * 1000);
      this.fade(1, 2.4);
    };
    if (this.buffer) go();
    else this.ready.then(go);
  }

  /** Header toggle. Returns the new state. */
  toggle() {
    if (!this.source) {
      this.start({ bangIn: 0 });
      return true;
    }
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.ctx.resume();
      this.fade(1, 1.4);
    } else {
      this.fade(0, 0.7);
      setTimeout(() => !this.enabled && this.ctx.suspend(), 800);
    }
    this.emit();
    return this.enabled;
  }

  fade(v, dur) {
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v * MASTER, t + dur);
  }

  /** warp 0..1 — called every frame */
  update(warp) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.band.frequency.setTargetAtTime(420 + warp * 2600, t, 0.12);
    this.wind.gain.setTargetAtTime(warp * 0.22, t, 0.15);
    if (this.opened) this.tone.frequency.setTargetAtTime(18000 - warp * 11000, t, 0.25);
  }

  ping(pitch = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1568 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(2349 * pitch, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }
}
