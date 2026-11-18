export function createCardNode(card, { down = false } = {}) {
  const el = document.createElement('div');
  el.className = `card ${card.color}${down ? ' is-down' : ''}`;
  el.dataset.cid = card.id;
  const face = 'JQK'.includes(card.rank);
  el.innerHTML = `<div class="card-inner">
    <div class="card-face card-front">
      <span class="corner tl"><b>${card.rank}</b><i>${card.suit}</i></span>
      <span class="pip${face ? ' face' : ''}">${face ? card.rank + '<i>' + card.suit + '</i>' : card.suit}</span>
      <span class="corner br"><b>${card.rank}</b><i>${card.suit}</i></span>
    </div><div class="card-face card-back"></div></div>`;
  return el;
}

/** Идемпотентный рендер: новые карты прилетают с анимацией, существующие не трогаются. */
export function renderHand(container, cards, { hideIndex = -1 } = {}) {
  const seen = new Set();
  cards.forEach((c, i) => {
    seen.add(c.id);
    let node = container.querySelector(`[data-cid="${c.id}"]`);
    if (!node) {
      node = createCardNode(c, { down: i === hideIndex });
      node.classList.add('dealing');
      container.appendChild(node);
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('dealing')));
    }
  });
  Array.from(container.children).forEach(n => { if (!seen.has(n.dataset.cid)) n.remove(); });
}

export function setHole(container, hidden) {
  const n = container.children[1];
  if (n) n.classList.toggle('is-down', hidden);
}