import { cardLabel } from './cards.js';
import { actionRu } from './strategy.js';
import { fmt, fmtSign } from '../utils/helpers.js';

export const OUTCOME_RU = { win: 'Победа', lose: 'Поражение', push: 'Ничья' };
const KIND_SHORT = { bust: 'Ваш перебор', dealerBust: 'Перебор дилера', blackjack: 'Ваш блэкджек', dealerBlackjack: 'Блэкджек дилера', push: 'Ничья', compare: 'Сравнение сумм' };
const cw = c => `<b class="cw ${c.color}">${cardLabel(c)}</b>`;
const list = cards => cards.map(cw).join(' + ');

function handLine(label, cards, hv) {
  let note = '';
  if (hv.bust) note = ' — <span class="bad">перебор (больше 21)</span>';
  else if (hv.soft) note = ' — туз считается за 11, рука «мягкая»';
  else if (cards.some(c => c.rank === 'A')) note = ' — туз сброшен до 1 очка, чтобы избежать перебора';
  return `<p><b>${label}:</b> ${list(cards)} = <b>${hv.total}</b>${note}</p>`;
}

export function buildRoundReport(r, opponentKind) {
  const { kind, outcome, delta, bet, bet0, returned, playerHV: ph, dealerHV: dh } = r;
  const tone = outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'push';
  let title, headline;
  if (kind === 'blackjack') { title = 'БЛЭКДЖЕК!'; headline = `Туз + десятка первыми двумя картами — старшая комбинация игры. Выплата 3:2: вы получаете ${fmt(bet * 1.5)} фишек выигрыша сверх ставки.`; }
  else if (kind === 'bust') { title = 'ПЕРЕБОР'; headline = `Вы набрали ${ph.total} — больше 21. По правилам это мгновенный проигрыш: дилеру даже не нужно добирать карты.`; }
  else if (kind === 'dealerBust') { title = 'ПОБЕДА'; headline = `Дилер перебрал (${dh.total} > 21). По правилам он проигрывает всем, кто остался в игре без перебора, — ваша ставка возвращается вдвое.`; }
  else if (kind === 'dealerBlackjack') { title = 'БЛЭКДЖЕК ДИЛЕРА'; headline = 'У дилера туз + десятка первыми двумя. При открытой 10/A он проверяет закрытую карту — блэкджек нашёлся, и раздача завершилась досрочно.'; }
  else if (kind === 'push' && ph.blackjack && dh.blackjack) { title = 'НИЧЬЯ'; headline = 'Блэкджек у обоих! Редчайший случай: комбинации равны по силе, ставка полностью возвращается.'; }
  else if (outcome === 'push') { title = 'НИЧЬЯ'; headline = `Суммы равны: ${ph.total} против ${dh.total}. Это «push» — никто не выиграл, ставка возвращается на баланс.`; }
  else if (outcome === 'win') { title = 'ПОБЕДА'; headline = `Ваши ${ph.total} против ${dh.total} у дилера: ваша сумма ближе к 21 и не превышает его. Победа платит 1:1.`; }
  else { title = 'ПОРАЖЕНИЕ'; headline = `У дилера ${dh.total} против ваших ${ph.total}: его сумма ближе к 21 без перебора. Ставка остаётся у дилера.`; }

  const sections = [];
  sections.push({ h: 'Что произошло', html: `<p>${headline}</p>` });
  sections.push({ h: 'Подсчёт очков', html: handLine('Вы', r.playerCards, ph) + handLine('Дилер', r.dealerCards, dh) });

  const steps = [];
  steps.push(`<li>Ставка: <b>${fmt(bet0)}</b> фишек${r.doubled ? ` → удвоение → итоговая ставка <b>${fmt(bet)}</b>` : ''}.</li>`);
  steps.push(`<li>Раздача: вам ${list(r.playerCards.slice(0, 2))} (${handValueOf2(r.playerCards)}), дилеру ${cw(r.dealerCards[0])} и закрытая карта.</li>`);
  if (r.peeked) steps.push(`<li>Открытая карта дилера — ${cw(r.dealerCards[0])}: он проверил закрытую на блэкджек. ${kind === 'dealerBlackjack' || (kind === 'push' && dh.blackjack) ? 'Блэкджек есть — раздача закончена сразу.' : 'Блэкджека нет — игра продолжается.'}</li>`);
  for (const a of r.playerActions) {
    const verdict = a.correct ? '<span class="ok">✓ по стратегии</span>' : `<span class="bad">✗ совет был «${actionRu[a.rec]}»</span>`;
    steps.push(`<li>Вы: <b>${actionRu[a.action]}</b>${a.auto ? ' (авто — 21)' : ''}${a.card ? ` → пришла ${cw(a.card)}, стало <b>${a.totalAfter}</b>` : ` — остановились на ${a.totalAfter}`}. ${verdict}</li>`);
  }
  let di = 2;
  for (const s of r.dealerSteps) {
    const drew = s.action === 'hit' ? ` → берёт ${cw(r.dealerCards[di++])}` : '';
    steps.push(`<li>Дилер (${s.total}): ${s.reason}${drew}</li>`);
  }
  if (!r.dealerSteps.length && kind !== 'dealerBlackjack' && !(kind === 'push' && dh.blackjack))
    steps.push('<li class="dim">Дилер не добирал карты: исход решился до его хода.</li>');
  steps.push(`<li><b>${headline}</b></li>`);
  sections.push({ h: 'Ход раздачи', html: `<ol>${steps.join('')}</ol>` });

  const money = [];
  if (r.doubled) money.push(`<p>Ставка ${fmt(bet0)} удвоена → <b>${fmt(bet)}</b> фишек в игре.</p>`);
  if (kind === 'blackjack') money.push(`<p>Блэкджек платит <b>3:2</b>: выигрыш = ${fmt(bet)} × 1,5 = <b>${fmt(bet * 1.5)}</b>. Возврат на баланс: ${fmt(bet)} + ${fmt(bet * 1.5)} = <b>${fmt(returned)}</b>.</p>`);
  else if (outcome === 'win') money.push(`<p>Победа платит <b>1:1</b>: возврат ставки ${fmt(bet)} + выигрыш ${fmt(bet)} = <b>${fmt(returned)}</b>.</p>`);
  else if (outcome === 'push') money.push(`<p>Ничья: ставка <b>${fmt(bet)}</b> полностью возвращается.</p>`);
  else money.push(`<p>Поражение: ставка <b>${fmt(bet)}</b> остаётся у дилера, возврат 0.</p>`);
  money.push(`<p class="money-line">Чистый итог раздачи: ${fmtSign(delta)} фишек.</p>`);
  sections.push({ h: 'Математика выплаты', html: money.join('') });

  const wrong = r.playerActions.filter(a => !a.correct);
  const tips = [];
  if (r.playerActions.length) {
    tips.push(`<p>Ваших решений: <b>${r.playerActions.length}</b>, по базовой стратегии: <b class="${wrong.length ? 'bad' : 'ok'}">${r.playerActions.length - wrong.length}</b>.</p>`);
    for (const a of wrong) tips.push(`<p>На ${a.before ? handSum(a.before) : a.totalAfter} стоило «<b>${actionRu[a.rec]}</b>»: ${a.recReason}</p>`);
    if (!wrong.length) tips.push('<p class="ok">Идеальная раздача по стратегии — даже если карты сегодня не на вашей стороне. Так и растёт мастерство.</p>');
  }
  if (kind === 'bust') tips.push('<p class="dim">Запомните: против слабой открытой карты дилера (2–6) на твёрдых 12–16 выгоднее остановиться и дать ему шанс перебрать.</p>');
  if (opponentKind === 'nn') tips.push('<p class="dim">Нейросеть-дилер учится и на этой раздаче тоже — её политика станет чуть точнее.</p>');
  sections.push({ h: 'Работа над ошибками', html: tips.join('') || '<p class="dim">Решений не было — исход определила раздача.</p>' });

  return {
    outcome, tone, title, headline, money: fmtSign(delta),
    icon: outcome === 'win' ? (kind === 'blackjack' ? '♠' : '★') : outcome === 'lose' ? '✕' : '≡',
    sections, kindShort: KIND_SHORT[kind] || KIND_SHORT.compare,
    compact: `${ph.bust ? ph.total + '💥' : ph.blackjack ? 'BJ' : ph.total} vs ${dh.bust ? dh.total + '💥' : dh.blackjack ? 'BJ' : dh.total}`,
  };
}
const handSum = cards => cards.reduce((s, c) => s + (c.rank === 'A' ? 11 : c.rank === 'J' || c.rank === 'Q' || c.rank === 'K' ? 10 : +c.rank), 0);
const handValueOf2 = cards => { const hv = handSum(cards); return hv > 21 ? 12 : hv; };

export function buildMatchReport(match, oppName) {
  const won = match.winner === 'player';
  const sum = match.rounds.reduce((s, r) => s + r.delta, 0);
  const w = match.rounds.filter(r => r.outcome === 'win').length;
  const l = match.rounds.filter(r => r.outcome === 'lose').length;
  const p = match.rounds.filter(r => r.outcome === 'push').length;
  const bj = match.rounds.filter(r => r.kind === 'blackjack').length;
  let dec = 0, ok = 0;
  match.rounds.forEach(r => r.playerActions.forEach(a => { dec++; if (a.correct) ok++; }));
  const acc = dec ? Math.round(ok / dec * 100) : null;
  const rows = match.rounds.map((r, i) => `<tr>
    <td class="num">${i + 1}</td><td class="num">${r.playerHV.bust ? r.playerHV.total + '💥' : r.playerHV.blackjack ? 'BJ' : r.playerHV.total}</td>
    <td class="num">${r.dealerHV.bust ? r.dealerHV.total + '💥' : r.dealerHV.blackjack ? 'BJ' : r.dealerHV.total}</td>
    <td><span class="m-badge ${r.outcome}">${OUTCOME_RU[r.outcome]}</span></td>
    <td>${r.report.kindShort}</td><td class="num">${fmtSign(r.delta)}</td>
    <td><button class="link-btn" data-round="${i}">разбор</button></td></tr>`).join('');
  const verdict = won
    ? `Вы обыграли ${oppName} со счётом ${match.pWins}:${match.dWins}. ${acc != null && acc >= 85 ? 'Точность решений ' + acc + '% — стратегия работает на вас.' : 'Совет: включите подсказки и поднимите точность решений — победы станут стабильнее.'}`
    : `${oppName} взял матч ${match.dWins}:${match.pWins}. ${acc != null && acc < 70 ? 'Главный резерв — базовая стратегия: точность решений всего ' + acc + '%. Загляните в шпаргалку на шаге 14 обучения.' : 'Карты бывают неблагосклонны даже к идеальной игре — на дистанции стратегия побеждает.'}`;
  return {
    title: won ? '🏆 Матч выигран!' : 'Матч за дилером',
    html: `<p><b>${verdict}</b></p>
      <div class="match-sum">
        <div class="stat ${sum >= 0 ? 'win' : 'lose'}"><i>Итог матча, фишек</i><b>${fmtSign(sum)}</b></div>
        <div class="stat"><i>П / П / Н</i><b>${w} / ${l} / ${p}</b></div>
        <div class="stat gold"><i>Блэкджеков</i><b>${bj}</b></div>
        <div class="stat"><i>Точность решений</i><b>${acc == null ? '—' : acc + '%'}</b></div>
      </div>
      <table class="match-table"><thead><tr><th>№</th><th>Вы</th><th>Дилер</th><th>Исход</th><th>Причина</th><th>Δ фишек</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="dim" style="color:var(--muted);font-size:12px">Ничьи в счёт матча не идут. Нажмите «разбор», чтобы увидеть полную логику любой раздачи.</p>`,
  };
}