import { $, $$, fmt, store } from './utils/helpers.js';
import { Engine } from './core/engine.js';
import { Trainer } from './ai/trainer.js';
import { BotDealer, NNDealer } from './ai/dealerAI.js';
import { Sound } from './audio/sound.js';
import { initTable } from './ui/tableView.js';
import { initNN } from './ui/nnView.js';
import { initTutorial } from './ui/tutorialView.js';
import { isModalOpen, toast } from './ui/widgets.js';

const sound = new Sound();
const trainer = new Trainer();
const engine = new Engine();
const bot = new BotDealer(), nn = new NNDealer(trainer);
engine.opponent = engine.settings.opponent === 'nn' ? nn : bot;

/* роутер экранов */
let screen = 'game';
function goto(id) {
  screen = id;
  $$('.screen').forEach(s => { const on = s.id === 'screen-' + id; s.hidden = !on; s.classList.toggle('active', on); });
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.screen === id)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(t => t.addEventListener('click', () => { sound.play('tick'); goto(t.dataset.screen); }));

/* виды */
const table = initTable(engine, sound);
initNN(trainer, engine, sound);
const tut = initTutorial({ goto, sound, engine, onDone: () => $('#tutBadge').hidden = false });
if (store.get('bj-tut-done', false)) $('#tutBadge').hidden = false;

/* банк в шапке + актуальный соперник */
let lastBank = engine.bankroll;
engine.on('update', () => {
  $('#bankrollTop').textContent = fmt(engine.bankroll);
  if (engine.bankroll !== lastBank) {
    lastBank = engine.bankroll;
    const p = $('#bankPill'); p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
  }
  engine.opponent = engine.settings.opponent === 'nn' ? nn : bot;
});
$('#bankrollTop').textContent = fmt(engine.bankroll);

/* звук */
const soundBtn = $('#soundBtn');
function paintSound() {
  soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  $('.ic-on', soundBtn).hidden = !sound.enabled;
  $('.ic-off', soundBtn).hidden = sound.enabled;
  soundBtn.title = sound.enabled ? 'Звук включён (M)' : 'Звук выключен (M)';
}
soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled); paintSound(); if (sound.enabled) sound.play('tick'); });
paintSound();
const unlock = () => sound.unlock();
document.addEventListener('pointerdown', unlock, { once: false });
document.addEventListener('keydown', unlock, { once: false });

/* горячие клавиши */
document.addEventListener('keydown', e => {
  if (isModalOpen() || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'KeyM') { sound.setEnabled(!sound.enabled); paintSound(); return; }
  if (screen === 'tutorial') {
    if (e.code === 'ArrowRight') { e.preventDefault(); tut.next(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); tut.prev(); }
    return;
  }
  if (screen !== 'game') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (engine.state === 'betting') engine.deal();
    else if (engine.state === 'settled') engine.match.over ? table.openMatchReport() : engine.nextRound();
  }
  if (e.code === 'Digit1') engine.hit();
  if (e.code === 'Digit2') engine.stand();
  if (e.code === 'Digit3') engine.double();
});

/* первый визит — сразу в академию */
if (!store.get('bj-visited', false)) {
  store.set('bj-visited', true);
  if (!store.get('bj-tut-done', false)) { goto('tutorial'); toast('Добро пожаловать! Начнём с основ — это займёт ~10 минут.', 'info'); }
}

/* сохранение при уходе */
window.addEventListener('beforeunload', () => { trainer.save(); engine.persist(); });