import { handValue, cardValue } from '../core/cards.js';

export function makeFeatures(dealerCards, playerCards) {
  const d = handValue(dealerCards), p = handValue(playerCards);
  return [d.total / 21, d.soft ? 1 : 0, p.total / 21, p.soft ? 1 : 0, cardValue(dealerCards[0].rank) / 11, dealerCards.length / 8, playerCards.length / 8];
}
const softmax = q => { const e = q.map(v => Math.exp(clampT(v * 3))); const s = e[0] + e[1]; return e.map(v => v / s); };
const clampT = v => Math.max(-20, Math.min(20, v));

export class BotDealer {
  constructor() { this.kind = 'bot'; this.name = 'Бот · классические правила'; }
  decide(dealerCards) {
    const hv = handValue(dealerCards);
    return hv.total < 17
      ? { action: 'hit', reason: `${hv.total} < 17 — по правилам дилер обязан взять карту.` }
      : { action: 'stand', reason: `${hv.total} ≥ 17 — по правилам дилер обязан остановиться.` };
  }
  reset() {}
  drain() { return []; }
}

export class NNDealer {
  constructor(trainer) { this.kind = 'nn'; this.name = 'Нейросеть · учится'; this.trainer = trainer; this.transitions = []; this.last = null; }
  decide(d, p) {
    const s = makeFeatures(d, p);
    const q = this.trainer.net.forward(s);
    const action = q[0] >= q[1] ? 'hit' : 'stand';
    const probs = softmax(q);
    this.transitions.push({ s, a: action === 'hit' ? 0 : 1 });
    this.last = { q: [...q], probs, action };
    const dhv = handValue(d), phv = handValue(p);
    const context = dhv.total < phv.total ? 'Дилер позади — нужно догонять.' : dhv.total > phv.total ? 'Дилер впереди — выгодно стоять.' : 'Счёт равный — ничья уже в кармане.';
    return { action, probs, q, reason: `Сеть: Q(Ещё)=${q[0].toFixed(2)}, Q(Хватит)=${q[1].toFixed(2)} → ${action === 'hit' ? 'берёт карту' : 'останавливается'}. ${context}` };
  }
  reset() { this.transitions = []; this.last = null; }
  drain() { const t = this.transitions; this.transitions = []; return t; }
}