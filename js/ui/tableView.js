import { $, $$, fmt, fmtSign, clamp } from '../utils/helpers.js';
import { handValue } from '../core/cards.js';
import { CHIPS, MIN_BET } from '../core/engine.js';
import { actionRu } from '../core/strategy.js';
import { buildMatchReport, OUTCOME_RU } from '../core/report.js';
import { renderHand, setHole } from './cardkit.js';
import { toast, modal, confirmModal } from './widgets.js';

class FX {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.ps = []; this.raf = 0;
    this.ro = new ResizeObserver(() => this._size()); this.ro.observe(canvas.parentElement); this._size();
  }
  _size() {
    const r = this.c.parentElement.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0); this.w = r.width; this.h = r.height;
  }
  burst(kind) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = kind === 'bj' ? ['#e8b64c', '#f6d488', '#ffffff', '#38d6c4'] : ['#e8b64c', '#3ecf8e', '#f6d488'];
    const n = kind === 'bj' ? 170 : 100;
    for (let i = 0; i < n; i++) this.ps.push({
      x: this.w / 2, y: this.h * .42, vx: (Math.random() - .5) * 10, vy: -Math.random() * 9 - 2,
      g: .24, s: Math.random() * 5 + 3, c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6.3, vr: (Math.random() - .5) * .3, life: 1, decay: .011 + Math.random() * .012, rect: Math.random() < .55,
    });
    if (!this.raf) this._run();
  }
  _run() {
    const step = () => {
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.ps = this.ps.filter(p => p.life > 0 && p.y < this.h + 30);
      for (const p of this.ps) {
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= .985; p.rot += p.vr; p.life -= p.decay;
        this.ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        this.ctx.fillStyle = p.c;
        this.ctx.save(); this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rot);
        if (p.rect) this.ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6);
        else { this.ctx.beginPath(); this.ctx.arc(0, 0, p.s / 2, 0, 6.3); this.ctx.fill(); }
        this.ctx.restore();
      }
      this.ctx.globalAlpha = 1;
      if (this.ps.length) this.raf = requestAnimationFrame(step);
      else { this.raf = 0; this.ctx.clearRect(0, 0, this.w, this.h); }
    };
    this.raf = requestAnimationFrame(step);
  }
}

export function initTable(engine, sound) {
  const root = $('#gameRoot'), fx = new FX($('#fx'));
  const els = {
    pHand: $('#playerHand'), dHand: $('#dealerHand'), pBadge: $('#playerBadge'), dBadge: $('#dealerBadge'),
    msg: $('#tableMsg'), think: $('#dealerThink'), hint: $('#hintChip'), betChips: $('#betChips'), betAmount: $('#betAmount'),
    deal: $('#btnDeal'), hit: $('#btnHit'), stand: $('#btnStand'), dbl: $('#btnDouble'),
    next: $('#btnNext'), matchDone: $('#btnMatchDone'), newMatch: $('#btnNewMatch'),
    result: $('#resultPanel'), rbTitle: $('#rbTitle'), rbHead: $('#rbHead'), rbMoney: $('#rbMoney'), rbIcon: $('#rbIcon'), rBody: $('#resultBody'),
  };
  const history = [];
  let matchTimer = 0, bankruptOpen = false;

  // фишки ставки
  CHIPS.forEach(v => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.v = v; b.innerHTML = `<b>${v}</b>`;
    b.title = `Добавить ${v} к ставке`;
    b.addEventListener('click', () => { sound.play('tick'); engine.addChip(v); });
    $('#chipRow').appendChild(b);
  });

  const MSG = {
    betting: 'Соберите ставку фишками и раздавайте карты', dealing: 'Раздача…',
    player: 'Ваш ход: Ещё, Хватит или Удвоить', dealer: 'Дилер играет…', settled: 'Раздача завершена — подробный разбор ниже',
  };
  function badge(el, hv, hidden, upCard) {
    el.className = 'hbadge';
    if (hidden) { el.textContent = handValue([upCard]).total + ' + ?'; return; }
    if (!hv) { el.textContent = '—'; return; }
    el.textContent = hv.blackjack ? 'BJ ♠' : String(hv.total);
    if (hv.soft && !hv.bust) el.classList.add('soft');
    if (hv.bust) el.classList.add('bust');
    else if (hv.total === 21) el.classList.add('twentyone');
  }
  function renderBetChips() {
    els.betChips.innerHTML = '';
    let rest = engine.bet, shown = 0;
    for (const v of [...CHIPS].reverse()) while (rest >= v && shown < 9) {
      rest -= v; shown++;
      const c = document.createElement('span'); c.className = 'chip'; c.dataset.v = v; c.innerHTML = `<b>${v}</b>`;
      els.betChips.appendChild(c);
    }
    els.betAmount.textContent = fmt(engine.bet);
  }
  function sync() {
    root.dataset.state = engine.state;
    const m = engine.match;
    $('#scoreYou').textContent = m.pWins; $('#scoreDealer').textContent = m.dWins;
    $$('.ms-side').forEach(s => s.classList.remove('lead'));
    if (m.pWins > m.dWins) $('.ms-side.you').classList.add('lead');
    if (m.dWins > m.pWins) $('.ms-side.dealer').classList.add('lead');
    $('#matchInfo').textContent = `Матч до ${m.target} побед`;
    $('#roundInfo').textContent = engine.round ? `Раздача №${engine.round.n}` : (m.over ? 'Матч завершён' : 'Сделайте ставку');
    $('#shoeMeter').style.width = clamp(engine.shoe.remaining / engine.shoe.total * 100, 4, 100) + '%';
    $('#shoeCount').textContent = engine.shoe.remaining;
    $('#dealerName').textContent = 'Дилер · ' + (engine.opponent?.name ?? '');
    $('#feltRule').textContent = engine.settings.opponent === 'nn' ? 'НЕЙРОСЕТЬ ИГРАЕТ СВОБОДНО И УЧИТСЯ' : 'ДИЛЕР ОБЯЗАН СТОЯТЬ НА 17';
    els.msg.textContent = MSG[engine.state];
    renderHand(els.pHand, engine.player);
    renderHand(els.dHand, engine.dealer, { hideIndex: engine.holeHidden ? 1 : -1 });
    badge(els.pBadge, engine.player.length ? handValue(engine.player) : null, false);
    badge(els.dBadge, engine.dealer.length ? handValue(engine.dealer) : null, engine.holeHidden && engine.dealer.length > 1, engine.dealer[0]);
    renderBetChips();
    els.deal.disabled = engine.bet < MIN_BET || engine.busy;
    els.hit.disabled = els.stand.disabled = engine.state !== 'player' || engine.busy;
    els.dbl.disabled = !engine.canDouble || engine.busy;
    els.dbl.title = engine.canDouble ? 'Удвоить ставку и получить ровно одну карту' : 'Доступно только на первых двух картах при достатке фишек';
    $$('#chipRow .chip').forEach(c => c.disabled = engine.state !== 'betting');
    $('#btnClear').disabled = $('#btnRepeat').disabled = $('#btnMax').disabled = engine.state !== 'betting';
    $('#btnReloadMini').hidden = engine.bankroll >= MIN_BET;
    els.next.hidden = m.over; els.matchDone.hidden = !m.over; els.newMatch.hidden = !m.over;
    const hint = engine.settings.hints ? engine.hint : null;
    els.hint.hidden = !hint;
    if (hint) els.hint.textContent = `💡 Совет: ${actionRu[hint.action]} — ${hint.reason}`;
    $$('#oppSeg button').forEach(b => {
      b.classList.toggle('on', b.dataset.opp === engine.settings.opponent);
      b.disabled = !['betting', 'settled'].includes(engine.state);
    });
    $('#targetSel').value = String(engine.settings.target);
    $('#targetSel').disabled = engine.state !== 'betting';
    $('#hintsToggle').checked = engine.settings.hints;
    const s = engine.stats;
    $('#stRounds').textContent = s.rounds; $('#stWin').textContent = s.wins; $('#stLoss').textContent = s.losses;
    $('#stPush').textContent = s.pushes; $('#stBJ').textContent = s.blackjacks; $('#stStreak').textContent = s.bestStreak;
    $('#stAcc').textContent = s.decisions ? Math.round(s.correct / s.decisions * 100) + '%' : '—';
    $('#stNet').textContent = fmtSign(s.net);
    $('#stNetWrap').className = 'stat ' + (s.net > 0 ? 'win' : s.net < 0 ? 'lose' : '');
    if (engine.state !== 'settled') els.result.hidden = true;
    if (engine.state === 'betting') { clearTimeout(matchTimer); els.think.hidden = true; }
  }

  function chipFly() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = $('.bet-spot').getBoundingClientRect(), to = $('#bankPill').getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('div'); c.className = 'fly-chip';
      c.style.left = from.left + 20 + 'px'; c.style.top = from.top + 'px';
      document.body.appendChild(c);
      c.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(.5)`, opacity: .2 },
      ], { duration: 650, delay: i * 110, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => c.remove();
    }
    $('#bankPill').classList.remove('pulse'); void $('#bankPill').offsetWidth; $('#bankPill').classList.add('pulse');
  }
  function renderHistory() {
    const box = $('#historyList'); box.innerHTML = '';
    if (!history.length) { box.innerHTML = '<p class="empty">Сыграйте первую раздачу — здесь появится лента с разборами.</p>'; return; }
    history.slice(0, 30).forEach((r, i) => {
      const b = document.createElement('button'); b.className = 'h-item';
      b.innerHTML = `<span class="h-dot ${r.outcome}"></span><i>№${r.n} · <b>${r.report.compact}</b> · ${r.report.kindShort}</i><span class="h-money ${r.outcome}">${fmtSign(r.delta)}</span>`;
      b.addEventListener('click', () => openRoundReport(r));
      box.appendChild(b);
    });
  }
  function reportHtml(report) {
    return `<div class="report-body">${report.sections.map(s => `<section><h4>${s.h}</h4>${s.html}</section>`).join('')}</div>`;
  }
  function openRoundReport(r, back) {
    const actions = back ? [{ label: '← К итогам матча', tone: 'ghost', onClick: () => openMatchReport() }] : [];
    actions.push({ label: 'Закрыть', tone: 'primary' });
    modal({ title: `Раздача №${r.n} · ${OUTCOME_RU[r.outcome]}`, html: reportHtml(r.report), actions, wide: true });
  }
  function openMatchReport() {
    const m = engine.match;
    if (!m.rounds.length) { toast('Матч только начался — сыграйте хотя бы одну раздачу.', 'info'); return; }
    const rep = buildMatchReport(m, engine.opponent.name);
    const api = modal({
      title: rep.title, html: rep.html, wide: true,
      actions: m.over
        ? [{ label: 'Закрыть', tone: 'ghost' }, { label: '♠ Новый матч', tone: 'primary', onClick: () => { sound.play('chip'); engine.nextRound(); } }]
        : [{ label: 'Закрыть', tone: 'primary' }],
    });
    api.el.querySelectorAll('[data-round]').forEach(b => b.addEventListener('click', () => openRoundReport(m.rounds[+b.dataset.round], true)));
  }

  // события движка
  engine.on('update', sync);
  engine.on('card', () => { sound.play('deal'); sync(); });
  engine.on('flip', () => { sound.play('flip'); setHole(els.dHand, false); setTimeout(sync, 350); });
  engine.on('chip', () => { sound.play('chip'); $('.bet-spot').classList.remove('pulse'); void $('.bet-spot').offsetWidth; $('.bet-spot').classList.add('pulse'); });
  engine.on('shuffle', () => { sound.play('shuffle'); toast('Шуз перемешан — свежие 208 карт.', 'info'); });
  engine.on('toast', ({ msg, tone }) => toast(msg, tone));
  engine.on('thinking', dec => {
    sound.play('think');
    els.think.hidden = false;
    els.think.className = 'think-badge' + (dec.probs ? '' : ' bot');
    els.think.textContent = dec.probs
      ? `🧠 Ещё ${(dec.probs[0] * 100).toFixed(0)}% / Хватит ${(dec.probs[1] * 100).toFixed(0)}% → ${dec.action === 'hit' ? 'берёт' : 'стоит'}`
      : '🤖 ' + dec.reason;
    els.think.title = dec.reason;
  });
  engine.on('settle', ({ round, report, outcome, kind }) => {
    history.unshift(round); renderHistory();
    els.result.hidden = false;
    els.result.className = 'result-card ' + report.tone;
    els.rbIcon.textContent = report.icon; els.rbTitle.textContent = report.title;
    els.rbHead.textContent = report.headline; els.rbMoney.textContent = report.money + ' фишек';
    els.rBody.innerHTML = report.sections.map(s => `<section><h4>${s.h}</h4>${s.html}</section>`).join('');
    $('#resultDetails').open = true;
    if (outcome === 'win') { sound.play(kind === 'blackjack' ? 'bigwin' : 'win'); fx.burst(kind === 'blackjack' ? 'bj' : 'win'); chipFly(); }
    else sound.play(outcome === 'lose' ? 'lose' : 'push');
    setTimeout(() => els.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
  });
  engine.on('matchend', () => { clearTimeout(matchTimer); matchTimer = setTimeout(openMatchReport, 1100); });
  engine.on('bankrupt', () => {
    if (bankruptOpen) return; bankruptOpen = true;
    modal({
      title: 'Фишки закончились', dismissable: true,
      html: '<p>Банк меньше минимальной ставки (10). Это учебный стол, поэтому докупка бесплатная и не влияет на «чистый итог» в статистике. Продолжаем обучение!</p>',
      actions: [{ label: 'Позже', tone: 'ghost' }, { label: '🪙 Купить 1 000 фишек', tone: 'primary', onClick: () => engine.reload() }],
    });
    setTimeout(() => bankruptOpen = false, 400);
  });

  // контролы
  els.deal.addEventListener('click', () => { sound.play('chip'); engine.deal(); });
  els.hit.addEventListener('click', () => { sound.play('tick'); engine.hit(); });
  els.stand.addEventListener('click', () => { sound.play('tick'); engine.stand(); });
  els.dbl.addEventListener('click', () => { sound.play('chip'); engine.double(); });
  els.next.addEventListener('click', () => { sound.play('tick'); engine.nextRound(); });
  els.newMatch.addEventListener('click', () => { sound.play('chip'); engine.nextRound(); });
  els.matchDone.addEventListener('click', openMatchReport);
  $('#btnClear').addEventListener('click', () => { sound.play('tick'); engine.clearBet(); });
  $('#btnRepeat').addEventListener('click', () => engine.repeatBet());
  $('#btnMax').addEventListener('click', () => engine.maxBet());
  $('#btnReloadMini').addEventListener('click', () => engine.reload());
  $('#btnMatchReport').addEventListener('click', openMatchReport);
  $('#btnResetStats').addEventListener('click', () => confirmModal('Сбросить статистику?', 'Обнулится статистика сессии (банк и матч останутся).', () => { engine.resetStats(); toast('Статистика обнулена.', 'success'); }, 'Сбросить'));
  $$('#oppSeg button').forEach(b => b.addEventListener('click', () => {
    if (!engine.setOpponent(b.dataset.opp)) toast('Сменить соперника можно между раздачами.', 'warning');
    else { sound.play('tick'); toast(b.dataset.opp === 'nn' ? 'За столом нейросеть. Она учится на каждой раздаче!' : 'За столом бот: строгие правила дилера.', 'info'); }
  }));
  $('#targetSel').addEventListener('change', e => engine.setTarget(+e.target.value));
  $('#hintsToggle').addEventListener('change', e => engine.setHints(e.target.checked));
  els.hint.addEventListener('click', () => toast(engine.hint?.reason ?? '', 'info'));

  sync();
  return { openMatchReport };
}