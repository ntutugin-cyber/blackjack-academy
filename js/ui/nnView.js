import { $, fmt, download, nowTime, clamp } from '../utils/helpers.js';
import { toast, confirmModal } from './widgets.js';

function drawMain(canvas, history, baseline) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const padL = 36, padR = 10, padT = 10, padB = 22, iw = w - padL - padR, ih = h - padT - padB;
  x.font = '10px "JetBrains Mono", monospace';
  x.strokeStyle = 'rgba(232,182,76,.09)'; x.fillStyle = '#6f8276';
  for (let v = 0; v <= 100; v += 25) {
    const y = padT + ih * (1 - v / 100);
    x.beginPath(); x.moveTo(padL, y); x.lineTo(w - padR, y); x.stroke();
    x.fillText(v + '%', 3, y + 3);
  }
  if (!history.length) {
    x.fillStyle = '#9db0a4'; x.font = '12px Manrope, sans-serif'; x.textAlign = 'center';
    x.fillText('Запустите тренировку — кривая обучения появится здесь', w / 2, h / 2);
    return;
  }
  const maxEp = Math.max(1, history[history.length - 1].ep);
  const X = ep => padL + iw * (ep / maxEp), Y = v => padT + ih * (1 - clamp(v, 0, 100) / 100);
  x.fillStyle = '#6f8276';
  x.fillText('0', padL, h - 6); x.textAlign = 'center'; x.fillText(fmt(maxEp / 2) + ' раздач', padL + iw / 2, h - 6);
  x.textAlign = 'right'; x.fillText(fmt(maxEp), w - padR, h - 6); x.textAlign = 'left';
  if (baseline != null) {
    const y = Y(baseline * 100);
    x.setLineDash([5, 5]); x.strokeStyle = 'rgba(229,72,77,.55)';
    x.beginPath(); x.moveTo(padL, y); x.lineTo(w - padR, y); x.stroke(); x.setLineDash([]);
    x.fillStyle = 'rgba(229,72,77,.85)'; x.fillText('бот ' + (baseline * 100).toFixed(1) + '%', padL + 5, y - 4);
  }
  const step = Math.max(1, Math.ceil(history.length / 300));
  const series = (key, color) => {
    x.beginPath(); let first = true;
    for (let i = 0; i < history.length; i += step) {
      const p = history[i], px = X(p.ep), py = Y((p[key] || 0) * 100);
      first ? x.moveTo(px, py) : x.lineTo(px, py); first = false;
    }
    const last = history[history.length - 1];
    x.lineTo(X(last.ep), Y((last[key] || 0) * 100));
    x.strokeStyle = color; x.lineWidth = 2; x.shadowColor = color; x.shadowBlur = 6; x.stroke(); x.shadowBlur = 0;
  };
  series('win', '#e8b64c'); series('eps', '#38d6c4');
}
function drawLoss(canvas, history) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x = canvas.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const max = Math.max(.01, ...history.map(p => p.loss || 0));
  x.beginPath();
  history.forEach((p, i) => {
    const px = 2 + (w - 4) * i / (history.length - 1), py = h - 3 - (h - 6) * ((p.loss || 0) / max);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  });
  x.strokeStyle = '#e5484d'; x.lineWidth = 1.5; x.stroke();
}

export function initNN(trainer, engine, sound) {
  const chart = $('#chartMain'), lossC = $('#chartLoss');
  function buildDiagram() {
    const el = $('#nnDiagram'); el.innerHTML = '';
    const sizes = trainer.net.sizes;
    const labels = ['Входы', ...sizes.slice(1, -1).map((_, i) => `Скрытый ${i + 1}`), 'Выходы'];
    sizes.forEach((n, l) => {
      if (l) { const link = document.createElement('span'); link.className = 'nn-link'; el.appendChild(link); }
      const col = document.createElement('div'); col.className = 'nn-layer';
      const nodes = document.createElement('div'); nodes.className = 'nn-nodes';
      for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.className = 'nn-node'; s.style.setProperty('--i', i + l * 3); nodes.appendChild(s); }
      const lab = document.createElement('i'); lab.textContent = `${labels[l]} · ${n}`;
      col.appendChild(nodes); col.appendChild(lab); el.appendChild(col);
    });
    $('#pLr').textContent = trainer.net.lr;
  }
  function tiles() {
    $('#tEp').textContent = fmt(trainer.episodes);
    const n = trainer.wins + trainer.losses + trainer.pushes;
    $('#tWin').textContent = n ? (trainer.winRate * 100).toFixed(1) + '%' : '—';
    $('#tReward').textContent = n ? ((trainer.wins - trainer.losses) / n).toFixed(3) : '—';
    $('#tLoss').textContent = trainer.lossMA ? trainer.lossMA.toFixed(4) : '—';
    $('#tSteps').textContent = fmt(trainer.steps);
    $('#tEps').textContent = trainer.epsilon.toFixed(2);
    $('#pBuf').textContent = fmt(trainer.replay.length) + ' / 20k';
    const strip = $('#outStrip'); strip.innerHTML = '';
    trainer.recent.forEach(o => {
      const b = document.createElement('b');
      b.className = o === 'player' ? 'w' : o === 'dealer' ? 'l' : 'p';
      b.title = o === 'player' ? 'Победа игрока' : o === 'dealer' ? 'Победа дилера' : 'Ничья';
      strip.appendChild(b);
    });
  }
  function charts() { drawMain(chart, trainer.history, trainer.baseline); drawLoss(lossC, trainer.history); }
  function runState() {
    $('#btnStop').hidden = !trainer.running;
    $('#nnLiveDot').className = 'live-dot' + (trainer.running ? ' on' : '');
    $('#nnDiagram').classList.toggle('training', trainer.running);
    $('#btnTrain500').textContent = trainer.running ? '▶ +500 ещё' : '▶ +500 раздач';
    $('#btnTrain2000').textContent = trainer.running ? '⏩ +2 000 ещё' : '⏩ +2 000 раздач';
    if (trainer.running) $('#nnLiveNote').textContent = 'Идёт самоигра: сеть играет дилером против базовой стратегии и обновляет веса…';
  }
  trainer.on('stats', () => { tiles(); charts(); });
  trainer.on('run', runState);
  trainer.on('adopted', () => { buildDiagram(); tiles(); charts(); });
  trainer.on('saved', () => $('#nnSavedAt').textContent = 'сохранено в браузере · ' + nowTime());
  engine.on('thinking', dec => {
    if (!dec.probs) return;
    $('#nnOutHit').style.width = (dec.probs[0] * 100).toFixed(1) + '%';
    $('#nnOutStand').style.width = (dec.probs[1] * 100).toFixed(1) + '%';
    $('#nnOutHitVal').textContent = 'Q ' + dec.q[0].toFixed(2);
    $('#nnOutStandVal').textContent = 'Q ' + dec.q[1].toFixed(2);
    $('#nnLiveNote').textContent = dec.reason;
  });
  $('#btnTrain500').addEventListener('click', () => { sound.play('tick'); trainer.train(500); });
  $('#btnTrain2000').addEventListener('click', () => { sound.play('tick'); trainer.train(2000); });
  $('#btnStop').addEventListener('click', () => { trainer.stop(); toast('Тренировка остановлена. Прогресс сохранён.', 'success'); });
  $('#onlineToggle').checked = trainer.online;
  $('#onlineToggle').addEventListener('change', e => { trainer.setOnline(e.target.checked); toast(e.target.checked ? 'Сеть будет дообучаться на ваших партиях.' : 'Онлайн-дообучение выключено.', 'info'); });
  $('#btnSaveNet').addEventListener('click', () => {
    const d = new Date().toISOString().slice(0, 10);
    download(`blackjack-nn-weights-${d}.json`, JSON.stringify(trainer.serialize(), null, 1));
    trainer.save();
    toast('Веса сети сохранены в JSON-файл.', 'success'); sound.play('chip');
  });
  $('#btnLoadNet').addEventListener('click', () => $('#nnFile').click());
  $('#nnFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      trainer.adopt(json);
      toast(`Сеть загружена: ${fmt(trainer.episodes)} раздач опыта, архитектура ${trainer.net.sizes.join('→')}.`, 'success');
      sound.play('win');
    } catch (err) { toast('Не удалось загрузить: ' + err.message, 'danger'); }
  });
  $('#btnResetNet').addEventListener('click', () => confirmModal('Сбросить нейросеть?', 'Веса и весь прогресс обучения будут обнулены. Если сеть ценна — сначала сохраните её в JSON.', () => { trainer.reset(); toast('Сеть сброшена к случайным весам.', 'warning'); }, 'Сбросить'));
  new ResizeObserver(charts).observe(chart.parentElement);
  new ResizeObserver(() => drawLoss(lossC, trainer.history)).observe(lossC.parentElement);
  buildDiagram(); tiles(); charts(); runState();
  if (trainer.episodes) $('#nnSavedAt').textContent = `загружена сеть · ${fmt(trainer.episodes)} раздач`;
}