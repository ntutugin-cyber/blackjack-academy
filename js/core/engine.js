import { Shoe, handValue, cardValue } from './cards.js';
import { basicStrategy } from './strategy.js';
import { buildRoundReport } from './report.js';
import { Emitter, store, clamp, sleep } from '../utils/helpers.js';

export const MIN_BET = 10, MAX_BET = 1000, START_BANK = 1000, CHIPS = [10, 20, 50, 100, 200, 500];
const KEY = 'bj-academy-save-v1';
const floor10 = n => Math.floor(n / 10) * 10;

export class Engine extends Emitter {
  constructor() {
    super();
    const saved = store.get(KEY, {});
    this.bankroll = saved.bankroll ?? START_BANK;
    this.stats = Object.assign({ rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, net: 0, bestStreak: 0, streak: 0, decisions: 0, correct: 0, reloads: 0 }, saved.stats);
    this.settings = Object.assign({ opponent: 'bot', hints: true, target: 5 }, saved.settings);
    this.shoe = new Shoe(4);
    this.match = { target: this.settings.target, pWins: 0, dWins: 0, rounds: [], over: false, winner: null };
    this.state = 'betting'; this.busy = false;
    this.bet = 0; this.lastBet = 50;
    this.player = []; this.dealer = []; this.holeHidden = true;
    this.round = null; this.lastReport = null; this.opponent = null;
  }
  persist() { store.set(KEY, { bankroll: this.bankroll, stats: this.stats, settings: this.settings }); }
  get canDouble() { return this.state === 'player' && this.player.length === 2 && this.bankroll >= this.bet; }
  get hint() { return this.state === 'player' ? basicStrategy(this.player, this.dealer[0], this.canDouble) : null; }

  setOpponent(kind) {
    if (this.state !== 'betting' && this.state !== 'settled') return false;
    this.settings.opponent = kind; this.persist(); this.emit('update'); return true;
  }
  setTarget(n) {
    if (this.state !== 'betting') return;
    this.settings.target = n;
    if (!this.match.rounds.length) this.match.target = n;
    else this.emit('toast', { msg: 'Новая длина матча применится со следующего матча.', tone: 'info' });
    this.persist(); this.emit('update');
  }
  setHints(v) { this.settings.hints = v; this.persist(); this.emit('update'); }
  addChip(v) { if (this.state !== 'betting') return; this.bet = clamp(this.bet + v, 0, floor10(Math.min(this.bankroll, MAX_BET))); this.emit('update'); this.emit('chip'); }
  clearBet() { if (this.state === 'betting') { this.bet = 0; this.emit('update'); } }
  maxBet() { if (this.state === 'betting') { this.bet = floor10(Math.min(this.bankroll, MAX_BET)); this.emit('update'); this.emit('chip'); } }
  repeatBet() { if (this.state === 'betting') { this.bet = Math.min(this.lastBet, floor10(Math.min(this.bankroll, MAX_BET))); this.emit('update'); this.emit('chip'); } }

  async deal() {
    if (this.state !== 'betting' || this.busy || this.bet < MIN_BET) return;
    this.busy = true; this.state = 'dealing';
    this.player = []; this.dealer = []; this.holeHidden = true; this.opponent.reset();
    this.round = { n: this.match.rounds.length + 1, bet0: this.bet, bet: this.bet, playerActions: [], dealerSteps: [], peeked: false, doubled: false };
    this.lastBet = this.bet; this.bankroll -= this.bet; this.emit('update');
    if (this.shoe.low) { this.shoe.refill(); this.emit('shuffle'); await sleep(750); }
    for (const [side, hidden] of [['player', false], ['dealer', false], ['player', false], ['dealer', true]]) {
      const c = this.shoe.draw(); this[side].push(c); this.emit('card', { side, card: c, hidden }); await sleep(300);
    }
    this.emit('update');
    const phv = handValue(this.player), dhv = handValue(this.dealer);
    if (cardValue(this.dealer[0].rank) >= 10) {
      this.round.peeked = true;
      if (dhv.blackjack) { await sleep(450); await this._reveal(); this._settle(phv.blackjack ? 'push' : 'dealerBlackjack'); return; }
    }
    if (phv.blackjack) { await sleep(450); await this._reveal(); this._settle('blackjack'); return; }
    this.state = 'player'; this.busy = false; this.emit('update');
  }

  _logPlayer(action, card, before, extra = {}) {
    const rec = basicStrategy(before, this.dealer[0], action === 'double' ? true : before.length === 2 && this.bankroll >= this.bet);
    this.round.playerActions.push({ action, card, before, totalAfter: handValue(this.player).total, rec: rec.action, recReason: rec.reason, correct: rec.action === action, ...extra });
  }
  async hit() {
    if (this.state !== 'player' || this.busy) return;
    this.busy = true; this.emit('update');
    const before = [...this.player];
    const c = this.shoe.draw(); this.player.push(c); this._logPlayer('hit', c, before);
    this.emit('card', { side: 'player', card: c }); await sleep(320);
    const hv = handValue(this.player);
    if (hv.bust) { await this._reveal(); this._settle('bust'); return; }
    if (hv.total === 21) { this._logPlayer('stand', null, [...this.player], { auto: true, correct: true }); await this._dealerTurn(); return; }
    this.busy = false; this.emit('update');
  }
  async stand() {
    if (this.state !== 'player' || this.busy) return;
    this.busy = true; this._logPlayer('stand', null, [...this.player]);
    await this._dealerTurn();
  }
  async double() {
    if (!this.canDouble || this.busy) return;
    this.busy = true;
    const before = [...this.player];
    this.bankroll -= this.bet; this.bet *= 2; this.round.bet = this.bet; this.round.doubled = true;
    const c = this.shoe.draw(); this.player.push(c); this._logPlayer('double', c, before);
    this.emit('chip'); this.emit('update'); this.emit('card', { side: 'player', card: c }); await sleep(430);
    if (handValue(this.player).bust) { await this._reveal(); this._settle('bust'); return; }
    await this._dealerTurn();
  }
  async _dealerTurn() {
    this.state = 'dealer'; this.emit('update'); await this._reveal();
    let guard = 0;
    while (guard++ < 10) {
      const dec = this.opponent.decide(this.dealer, this.player);
      this.round.dealerSteps.push({ action: dec.action, total: handValue(this.dealer).total, reason: dec.reason, probs: dec.probs || null });
      this.emit('thinking', dec); await sleep(760);
      if (dec.action === 'stand') break;
      const c = this.shoe.draw(); this.dealer.push(c); this.emit('card', { side: 'dealer', card: c }); await sleep(430);
      if (handValue(this.dealer).bust) { this._settle('dealerBust'); return; }
    }
    this._settle('compare');
  }
  async _reveal() { if (!this.holeHidden) return; this.holeHidden = false; this.emit('flip'); await sleep(650); }

  _settle(kind) {
    const phv = handValue(this.player), dhv = handValue(this.dealer);
    let outcome, returned = 0;
    if (kind === 'blackjack') { outcome = 'win'; returned = this.bet * 2.5; }
    else if (kind === 'dealerBust') { outcome = 'win'; returned = this.bet * 2; }
    else if (kind === 'push') { outcome = 'push'; returned = this.bet; }
    else if (kind === 'bust' || kind === 'dealerBlackjack') outcome = 'lose';
    else { outcome = phv.total > dhv.total ? 'win' : phv.total < dhv.total ? 'lose' : 'push'; returned = outcome === 'win' ? this.bet * 2 : outcome === 'push' ? this.bet : 0; }
    const delta = returned - this.bet;
    this.bankroll += returned;
    Object.assign(this.round, { kind, outcome, delta, returned, playerHV: phv, dealerHV: dhv, playerCards: [...this.player], dealerCards: [...this.dealer] });
    const report = buildRoundReport(this.round, this.opponent.kind);
    this.round.report = report; this.lastReport = report; this.match.rounds.push(this.round);
    const s = this.stats; s.rounds++; s.net += delta;
    if (outcome === 'win') { s.wins++; s.streak = Math.max(0, s.streak) + 1; s.bestStreak = Math.max(s.bestStreak, s.streak); this.match.pWins++; if (kind === 'blackjack') s.blackjacks++; }
    else if (outcome === 'lose') { s.losses++; s.streak = Math.min(0, s.streak) - 1; this.match.dWins++; }
    else s.pushes++;
    for (const a of this.round.playerActions) { s.decisions++; if (a.correct) s.correct++; }
    if (this.opponent.kind === 'nn') {
      const reward = outcome === 'win' ? -1 : outcome === 'lose' ? 1 : 0;
      this.opponent.trainer.learnFromRound(this.opponent.drain(), reward);
    }
    if (this.match.pWins >= this.match.target || this.match.dWins >= this.match.target) {
      this.match.over = true; this.match.winner = this.match.pWins > this.match.dWins ? 'player' : 'dealer';
    }
    this.state = 'settled'; this.busy = false; this.persist();
    this.emit('settle', { round: this.round, report, outcome, delta, kind });
    this.emit('update');
    if (this.match.over) this.emit('matchend', this.match);
    else if (this.bankroll < MIN_BET) this.emit('bankrupt');
  }
  nextRound() {
    if (this.state !== 'settled') return;
    if (this.match.over) this.match = { target: this.settings.target, pWins: 0, dWins: 0, rounds: [], over: false, winner: null };
    this.player = []; this.dealer = []; this.holeHidden = true; this.round = null;
    this.bet = Math.min(this.lastBet, floor10(Math.min(this.bankroll, MAX_BET)));
    if (this.bet < MIN_BET) this.bet = 0;
    this.state = 'betting'; this.emit('update');
    if (this.bankroll < MIN_BET) this.emit('bankrupt');
  }
  reload() { this.bankroll += 1000; this.stats.reloads++; this.persist(); this.emit('update'); this.emit('toast', { msg: 'Вы купили 1 000 фишек. Это учебный стол — рискуем только временем!', tone: 'success' }); }
  resetStats() {
    this.stats = { rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, net: 0, bestStreak: 0, streak: 0, decisions: 0, correct: 0, reloads: 0 };
    this.persist(); this.emit('update');
  }
}