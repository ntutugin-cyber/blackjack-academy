import { cardValue, handValue } from './cards.js';
export const actionRu = { hit: 'Ещё', stand: 'Хватит', double: 'Удвоить' };
const upName = up => up === 11 ? 'туза' : String(up);

/** Базовая стратегия: 4 колоды, дилер стоит на всех 17 (S17), без сплита/сюррендера. */
export function decideByTotal(t, soft, up, canDouble) {
  const H = r => ({ action: 'hit', reason: r });
  const S = r => ({ action: 'stand', reason: r });
  const D = (r, fb = 'hit') => canDouble
    ? { action: 'double', reason: r }
    : { action: fb, reason: r + ' Удвоить сейчас нельзя, поэтому ' + (fb === 'hit' ? 'берём карту.' : 'стоим.') };
  if (soft) {
    if (t >= 19) return S(`Мягкие ${t} — почти максимум, стоим.`);
    if (t === 18) {
      if (up >= 9) return H(`Мягкие 18 против сильной карты (${upName(up)}): 18 обычно мало — добираем, туз подстрахует от перебора.`);
      if (up === 2 || up === 7 || up === 8) return S(`Мягкие 18 против ${upName(up)}: этого чаще всего хватает — стоим.`);
      return D(`Мягкие 18 против слабой ${upName(up)}: дилер уязвим — удваиваем.`, 'stand');
    }
    if (t === 17) return (up >= 3 && up <= 6) ? D(`Мягкие 17 против ${upName(up)}: безопасно удвоить против слабого дилера.`) : H('Мягкие 17 — слабая сумма, но брать карту безопасно: туз может стать единицей.');
    if (t === 15 || t === 16) return (up >= 4 && up <= 6) ? D(`Мягкие ${t} против ${upName(up)}: дилер часто перебирает — удваиваем.`) : H(`Мягкие ${t}: добираем без риска — перебор невозможен.`);
    if (t === 13 || t === 14) return (up === 5 || up === 6) ? D(`Мягкие ${t} против самой слабой ${upName(up)}: удваиваем.`) : H(`Мягкие ${t}: спокойно добираем.`);
    return H(`Мягкая рука ${t}: добираем — перебор невозможен.`);
  }
  if (t >= 17) return S(`Твёрдые ${t} — сильная рука, риск перебора слишком велик. Стоим.`);
  if (t >= 13) return up <= 6 ? S(`Твёрдые ${t} против слабой ${upName(up)} (2–6): пусть дилер добирает и перебирает.`) : H(`Твёрдые ${t} против сильной ${upName(up)} (7–A): дилер скорее соберёт 17+, догоняем.`);
  if (t === 12) return (up >= 4 && up <= 6) ? S(`12 против ${upName(up)}: дилер очень уязвим — ждём его перебор.`) : H(`12 против ${upName(up)}: ждать опасно — берём карту.`);
  if (t === 11) return up <= 10 ? D(`11 — лучшая стартовая сумма: любая десятка даёт 21. Удваиваем против ${upName(up)}.`) : H('11 против туза: туз силён, просто берём карту.');
  if (t === 10) return up <= 9 ? D(`10 против ${upName(up)}: шанс на 20 высок — удваиваем.`) : H(`10 против ${upName(up)}: дилер силён — просто берём.`);
  if (t === 9) return (up >= 3 && up <= 6) ? D(`9 против слабой ${upName(up)}: удваиваем.`) : H('9: берём карту.');
  return H(`Сумма ${t} мала — перебор невозможен, берём карту.`);
}

export function basicStrategy(playerCards, dealerUpCard, canDouble = false) {
  const hv = handValue(playerCards);
  return decideByTotal(hv.total, hv.soft, cardValue(dealerUpCard.rank), canDouble);
}