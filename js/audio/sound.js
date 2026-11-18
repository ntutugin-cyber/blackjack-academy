import { store } from '../utils/helpers.js';

export class Sound {
  constructor() { this.enabled = store.get('bj-sound', true); this.ctx = null; this.master = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = .5; this.master.connect(this.ctx.destination);
    } catch {}
  }
  setEnabled(v) { this.enabled = v; store.set('bj-sound', v); if (v) this.unlock(); }
  _osc(type, f, dur, g = .12, { slide, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), v = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(v); v.connect(this.master); o.start(t); o.stop(t + dur + .03);
  }
  _noise(dur, f = 1800, g = .2, { delay = 0, type = 'bandpass' } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const v = this.ctx.createGain(); v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(fl); fl.connect(v); v.connect(this.master); src.start(t);
  }
  play(name) {
    if (!this.enabled || !this.ctx) return;
    try {
      switch (name) {
        case 'tick': this._osc('square', 880, .05, .045); break;
        case 'deal': this._noise(.09, 2000, .24); break;
        case 'flip': this._noise(.07, 1200, .18); this._osc('sine', 520, .12, .07, { slide: 300 }); break;
        case 'chip': this._osc('sine', 2400, .09, .11); this._osc('sine', 3150, .07, .07, { delay: .02 }); break;
        case 'think': this._osc('sine', 660, .06, .05); break;
        case 'shuffle': this._noise(.45, 900, .16, { type: 'lowpass' }); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, .22, .11, { delay: i * .09 })); break;
        case 'bigwin':
          [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this._osc('triangle', f, .26, .11, { delay: i * .09 }));
          this._noise(.5, 6000, .04, { delay: .15, type: 'highpass' }); break;
        case 'lose': this._osc('sawtooth', 180, .4, .1, { slide: 90 }); break;
        case 'push': this._osc('sine', 440, .15, .09); this._osc('sine', 440, .15, .09, { delay: .18 }); break;
      }
    } catch {}
  }
}