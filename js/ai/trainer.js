import { MLP } from './network.js';
import { makeFeatures } from './dealerAI.js';
import { Shoe, handValue } from '../core/cards.js';
import { basicStrategy } from '../core/strategy.js';
import { Emitter, store } from '../utils/helpers.js';

const KEY = 'bj-nn-v1';

export class Trainer extends Emitter {
  constructor() {
    super();
    this.net = new MLP([7, 16, 12, 2], { lr: .003 });
    this.gamma = 1; this.batchSize = 32; this.replay = []; this.replayCap = 20000;
    this.episodes = 0; this.steps = 0; this.epsilon = 1; this.lossMA = 0;
    this.wins = 0; this.losses = 0; this.pushes = 0;
    this.history = []; this.recent = []; this.window = [];
    this.running = false; this.target = 0;
    this.online = store.get('bj-online', true);
    this.shoe = new Shoe(4);
    this._load();
    this.baseline = this._measureBaseline(1200);
  }
  get winRate() { const n = this.wins + this.losses + this.pushes; return n ? this.wins / n : 0; }
  setOnline(v) { this.online = v; store.set('bj-online', v); }

  _measureBaseline(n) {
    let w = 0;
    for (let i = 0; i < n; i++) if (this.simulate('bot').outcome === 'dealer') w++;
    return w / n;
  }
  /** Одна симулированная раздача: игрок по базовой стратегии, дилер — bot/nn. */
  simulate(policy) {
    if (this.shoe.low) this.shoe.refill();
    const p = [this.shoe.draw(), this.shoe.draw()], d = [this.shoe.draw(), this.shoe.draw()];
    const pbj = handValue(p).blackjack, dbj = handValue(d).blackjack;
    if (pbj || dbj) return { outcome: pbj && dbj ? 'push' : pbj ? 'player' : 'dealer', transitions: [] };
    let guard = 0;
    while (guard++ < 12) {
      const rec = basicStrategy(p, d[0], p.length === 2);
      if (rec.action === 'double') { p.push(this.shoe.draw()); break; }
      if (rec.action === 'hit') { p.push(this.shoe.draw()); if (handValue(p).bust) break; }
      else break;
    }
    const phv = handValue(p);
    if (phv.bust) return { outcome: 'dealer', transitions: [] };
    const trans = []; guard = 0;
    while (guard++ < 12) {
      const dhv = handValue(d);
      let action;
      if (policy === 'bot') action = dhv.total < 17 ? 'hit' : 'stand';
      else {
        const s = makeFeatures(d, p), q = this.net.forward(s);
        action = Math.random() < this.epsilon ? (Math.random() < .5 ? 'hit' : 'stand') : (q[0] >= q[1] ? 'hit' : 'stand');
        trans.push({ s, a: action === 'hit' ? 0 : 1 });
      }
      if (action === 'stand') break;
      d.push(this.shoe.draw());
      if (handValue(d).bust) return { outcome: 'player', transitions: trans };
    }
    const dt = handValue(d).total, pt = phv.total;
    return { outcome: dt > pt ? 'dealer' : dt < pt ? 'player' : 'push', transitions: trans };
  }
  _learn(trans, reward) {
    if (!trans.length) return;
    for (let i = 0; i < trans.length; i++) {
      const target = i === trans.length - 1 ? reward : this.gamma * Math.max(...this.net.forward(trans[i + 1].s));
      this.replay.push({ s: trans[i].s, a: trans[i].a, target });
    }
    if (this.replay.length > this.replayCap) this.replay.splice(0, this.replay.length - this.replayCap);
    const n = Math.min(trans.length, 4);
    for (let k = 0; k < n; k++) {
      const batch = [];
      for (let j = 0; j < this.batchSize; j++) batch.push(this.replay[(Math.random() * this.replay.length) | 0]);
      const loss = this.net.trainBatch(batch);
      this.steps++;
      this.lossMA = this.lossMA ? this.lossMA * .95 + loss * .05 : loss;
    }
  }
  learnFromRound(trans, reward) {
    if (!this.online || !trans.length) return;
    this._learn(trans, reward); this.emit('stats');
  }
  train(n) {
    if (this.running) { this.target += n; this.emit('run'); return; }
    this.running = true; this.target = this.episodes + n; this.emit('run'); this._chunk();
  }
  stop() { this.target = this.episodes; }
  _chunk() {
    if (!this.running) return;
    const end = Math.min(this.target, this.episodes + 40);
    while (this.episodes < end) {
      const r = this.simulate('nn');
      this.episodes++;
      if (r.outcome === 'dealer') this.wins++; else if (r.outcome === 'player') this.losses++; else this.pushes++;
      this.recent.push(r.outcome); if (this.recent.length > 60) this.recent.shift();
      this.window.push(r.outcome); if (this.window.length > 200) this.window.shift();
      this._learn(r.transitions, r.outcome === 'dealer' ? 1 : r.outcome === 'player' ? -1 : 0);
      this.epsilon = Math.max(.05, Math.exp(-this.episodes / 2000));
      if (this.episodes % 20 === 0) this.history.push({ ep: this.episodes, win: this._maWin(), eps: this.epsilon, loss: this.lossMA });
      if (this.history.length > 1200) this.history.splice(0, this.history.length - 1200);
    }
    this.emit('stats');
    if (this.episodes >= this.target) { this.running = false; this.emit('run'); this.save(); this.emit('saved'); return; }
    if (this.episodes % 500 < 40) { this.save(); this.emit('saved'); }
    setTimeout(() => this._chunk(), 0);
  }
  _maWin() { return this.window.length ? this.window.filter(o => o === 'dealer').length / this.window.length : 0; }

  serialize() {
    return {
      app: 'blackjack-academy', kind: 'blackjack-nn', version: 1, savedAt: new Date().toISOString(),
      ...this.net.toJSON(),
      training: { episodes: this.episodes, steps: this.steps, epsilon: this.epsilon, gamma: this.gamma, wins: this.wins, losses: this.losses, pushes: this.pushes, loss: this.lossMA, history: this.history.slice(-400) },
    };
  }
  adopt(json, silent = false) {
    if (json?.kind !== 'blackjack-nn' || json?.version !== 1) throw new Error('Это не файл весов Блэкджек Академии.');
    const net = MLP.fromJSON(json);
    this.net = net;
    const t = json.training || {};
    this.episodes = t.episodes | 0; this.steps = t.steps | 0;
    this.wins = t.wins | 0; this.losses = t.losses | 0; this.pushes = t.pushes | 0;
    this.epsilon = typeof t.epsilon === 'number' ? Math.max(.05, Math.min(1, t.epsilon)) : Math.max(.05, Math.exp(-this.episodes / 2000));
    this.lossMA = typeof t.loss === 'number' ? t.loss : 0;
    this.history = Array.isArray(t.history) ? t.history.filter(p => p && typeof p.ep === 'number').slice(-400) : [];
    this.replay = []; this.recent = []; this.window = [];
    this.save();
    if (!silent) { this.emit('adopted'); this.emit('stats'); }
  }
  reset() {
    this.net = new MLP([7, 16, 12, 2], { lr: .003 });
    this.episodes = 0; this.steps = 0; this.epsilon = 1; this.lossMA = 0;
    this.wins = 0; this.losses = 0; this.pushes = 0;
    this.history = []; this.recent = []; this.window = []; this.replay = [];
    this.save(); this.emit('adopted'); this.emit('stats'); this.emit('saved');
  }
  save() { store.set(KEY, this.serialize()); }
  _load() { const d = store.get(KEY, null); if (d) { try { this.adopt(d, true); } catch {} } }
}