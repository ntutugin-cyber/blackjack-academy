import { clamp } from '../utils/helpers.js';
const zerosLike = W => W.map(r => r.map(() => 0));

/** MLP: tanh на скрытых слоях, линейный выход (Q-значения). Adam, backprop. */
export class MLP {
  constructor(sizes = [7, 16, 12, 2], opts = {}) {
    this.sizes = [...sizes]; this.lr = opts.lr ?? 0.003; this.activation = 'tanh'; this.t = 0;
    this.layers = [];
    for (let l = 1; l < sizes.length; l++) {
      const nIn = sizes[l - 1], nOut = sizes[l], lim = Math.sqrt(6 / (nIn + nOut));
      const W = [], b = new Array(nOut).fill(0);
      for (let o = 0; o < nOut; o++) { const row = []; for (let i = 0; i < nIn; i++) row.push((Math.random() * 2 - 1) * lim); W.push(row); }
      this.layers.push({ W, b, mW: zerosLike(W), vW: zerosLike(W), mB: b.map(() => 0), vB: b.map(() => 0) });
    }
  }
  forward(x, cache = false) {
    let a = x; const acts = [x];
    for (let l = 0; l < this.layers.length; l++) {
      const { W, b } = this.layers[l];
      const z = new Array(W.length);
      for (let o = 0; o < W.length; o++) { let s = b[o]; const row = W[o]; for (let i = 0; i < a.length; i++) s += row[i] * a[i]; z[o] = s; }
      a = l === this.layers.length - 1 ? z : z.map(Math.tanh);
      acts.push(a);
    }
    return cache ? { out: a, acts } : a;
  }
  trainBatch(batch) {
    if (!batch.length) return 0;
    const L = this.layers.length;
    const gW = this.layers.map(l => zerosLike(l.W)), gB = this.layers.map(l => l.b.map(() => 0));
    let loss = 0;
    for (const { s, a: ai, target } of batch) {
      const { out, acts } = this.forward(s, true);
      const err = out[ai] - target; loss += err * err;
      let delta = new Array(out.length).fill(0);
      delta[ai] = clamp(err, -1, 1);
      for (let l = L - 1; l >= 0; l--) {
        const aPrev = acts[l];
        for (let o = 0; o < delta.length; o++) {
          const dv = delta[o]; if (!dv) continue;
          gB[l][o] += dv; const gr = gW[l][o];
          for (let i = 0; i < aPrev.length; i++) gr[i] += dv * aPrev[i];
        }
        if (l > 0) {
          const W = this.layers[l].W, prev = new Array(aPrev.length).fill(0);
          for (let o = 0; o < delta.length; o++) { const dv = delta[o]; if (!dv) continue; const row = W[o]; for (let i = 0; i < aPrev.length; i++) prev[i] += row[i] * dv; }
          for (let i = 0; i < prev.length; i++) prev[i] *= 1 - aPrev[i] * aPrev[i];
          delta = prev;
        }
      }
    }
    const B = batch.length; this.t++;
    const b1 = .9, b2 = .999, eps = 1e-8, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t), lr = this.lr;
    for (let l = 0; l < L; l++) {
      const lay = this.layers[l];
      for (let o = 0; o < lay.b.length; o++) {
        for (let i = 0; i < lay.W[o].length; i++) {
          const g = gW[l][o][i] / B;
          lay.mW[o][i] = b1 * lay.mW[o][i] + (1 - b1) * g;
          lay.vW[o][i] = b2 * lay.vW[o][i] + (1 - b2) * g * g;
          lay.W[o][i] -= lr * (lay.mW[o][i] / c1) / (Math.sqrt(lay.vW[o][i] / c2) + eps);
        }
        const g = gB[l][o] / B;
        lay.mB[o] = b1 * lay.mB[o] + (1 - b1) * g;
        lay.vB[o] = b2 * lay.vB[o] + (1 - b2) * g * g;
        lay.b[o] -= lr * (lay.mB[o] / c1) / (Math.sqrt(lay.vB[o] / c2) + eps);
      }
    }
    return loss / B;
  }
  toJSON() { return { architecture: [...this.sizes], activation: this.activation, lr: this.lr, layers: this.layers.map(l => ({ W: l.W, b: l.b })) }; }
  static fromJSON(data) {
    const arch = data?.architecture;
    if (!Array.isArray(arch) || arch.length < 4 || arch[0] !== 7 || arch[arch.length - 1] !== 2 || arch.some(n => !Number.isInteger(n) || n < 1))
      throw new Error('Архитектура должна быть [7, …минимум 2 скрытых слоя…, 2].');
    if (!Array.isArray(data.layers) || data.layers.length !== arch.length - 1) throw new Error('Число слоёв не совпадает с архитектурой.');
    const fin = v => typeof v === 'number' && Number.isFinite(v);
    data.layers.forEach((l, i) => {
      if (!Array.isArray(l.W) || l.W.length !== arch[i + 1] || !Array.isArray(l.b) || l.b.length !== arch[i + 1]) throw new Error(`Неверные размерности слоя ${i + 1}.`);
      if (l.b.some(v => !fin(v)) || l.W.some(r => !Array.isArray(r) || r.length !== arch[i] || r.some(v => !fin(v)))) throw new Error(`В слое ${i + 1} есть нечисловые веса.`);
    });
    const net = new MLP(arch, { lr: fin(data.lr) ? clamp(data.lr, 1e-5, .05) : .003 });
    net.layers.forEach((l, i) => { l.W = data.layers[i].W.map(r => [...r]); l.b = [...data.layers[i].b]; });
    return net;
  }
}