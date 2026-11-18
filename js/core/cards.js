export const SUITS = [
  { ch: '♠', color: 'black', ru: 'пики' }, { ch: '♥', color: 'red', ru: 'червы' },
  { ch: '♦', color: 'red', ru: 'бубны' }, { ch: '♣', color: 'black', ru: 'трефы' },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RU_RANK = { A: 'туз', J: 'валет', Q: 'дама', K: 'король' };
let _id = 0;

export const makeCard = (rank, suit) => ({ rank, suit: suit.ch, color: suit.color, id: 'c' + (++_id) });
export const cardValue = r => r === 'A' ? 11 : (r === 'J' || r === 'Q' || r === 'K') ? 10 : parseInt(r, 10);
export const cardLabel = c => c.rank + c.suit;
export const cardNameRu = c => (RU_RANK[c.rank] || c.rank) + c.suit;
export const parseCard = str => makeCard(str.slice(0, -1), SUITS.find(s => str.endsWith(s.ch)));

export class Shoe {
  constructor(decks = 4) { this.decks = decks; this.cards = []; this.refill(); }
  refill() {
    this.cards = [];
    for (let d = 0; d < this.decks; d++) for (const s of SUITS) for (const r of RANKS) this.cards.push(makeCard(r, s));
    for (let i = this.cards.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]]; }
    this.total = this.cards.length;
  }
  draw() { if (!this.cards.length) this.refill(); return this.cards.pop(); }
  get remaining() { return this.cards.length; }
  get low() { return this.cards.length < this.total * 0.25; }
}

export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardValue(c.rank); if (c.rank === 'A') aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0, bust: total > 21, blackjack: cards.length === 2 && total === 21 };
}