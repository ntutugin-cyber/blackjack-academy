import { $, store } from '../utils/helpers.js';
import { parseCard, handValue, SUITS } from '../core/cards.js';
import { decideByTotal, actionRu } from '../core/strategy.js';
import { createCardNode, renderHand, setHole } from './cardkit.js';
import { toast } from './widgets.js';

const cw = c => `<b class="cw ${c.color}">${c.rank}${c.suit}</b>`;

export function initTutorial({ goto, sound, engine, onDone }) {
  let idx = 0, stageCleanup = null;
  const quiz = { answered: 0, correct: 0 };
  let practiceDone = store.get('bj-tut-done', false);

  /* ── визуальные сцены ── */
  function sceneCards(stage) {
    stage.innerHTML = `<span class="stage-title">Карты в руке</span><div class="demo-hand" id="vFan"></div>
      <p class="demo-note">4 масти × 13 достоинств = 52 карты. Масть на силу карты не влияет.</p>`;
    const fan = $('#vFan', stage);
    ['A♠', 'K♥', 'Q♦', 'J♣', '10♠', '7♥'].forEach(s => fan.appendChild(createCardNode(parseCard(s))));
  }
  function sceneAdder(stage) {
    stage.innerHTML = `<span class="stage-title">Соберите руку — сумма считается сама</span>
      <div class="card-pick" id="vPick"></div><div class="demo-hand" id="vHand"></div>
      <div class="demo-total">Сумма: <span class="hbadge" id="vTotal">0</span><button class="btn btn-ghost btn-sm" id="vReset">↺ Сброс</button></div>
      <p class="demo-note" id="vNote">Кликайте карты выше. Попробуйте туз + девятку, а потом добавьте ещё карту.</p>`;
    const hand = [];
    const paint = () => {
      renderHand($('#vHand', stage), hand);
      const hv = handValue(hand), b = $('#vTotal', stage);
      b.textContent = hand.length ? hv.total : '0';
      b.className = 'hbadge' + (hv.bust ? ' bust' : hv.total === 21 ? ' twentyone' : hv.soft && hand.length ? ' soft' : '');
      $('#vNote', stage).textContent = !hand.length ? 'Кликайте карты выше.'
        : hv.bust ? 'Перебор! Больше 21 — в игре это мгновенный проигрыш. Нажмите сброс.'
        : hv.soft ? `Мягкая рука: туз считается за 11. Можно брать карту без риска перебора.`
        : hand.some(c => c.rank === 'A') ? 'Туз автоматически сброшен до 1, чтобы спасти руку от перебора.'
        : hv.total === 21 ? '21! Идеальная сумма.' : 'Твёрдая рука — тузов, считающихся за 11, нет.';
    };
    ['A♠', 'K♥', '9♦', '7♣', '2♠', 'Q♣'].forEach(s => {
      const c = parseCard(s), b = document.createElement('button');
      b.textContent = s; if (c.color === 'red') b.classList.add('red');
      b.addEventListener('click', () => {
        if (hand.length >= 6) { toast('Максимум 6 карт в демо — нажмите сброс.', 'warning'); return; }
        hand.push(parseCard(s)); sound.play('deal'); paint();
      });
      $('#vPick', stage).appendChild(b);
    });
    $('#vReset', stage).addEventListener('click', () => { hand.length = 0; sound.play('tick'); paint(); });
    paint();
  }
  function sceneSoft(stage) {
    stage.innerHTML = `<span class="stage-title">Одна шестёрка — две разные руки</span>
      <div class="vs-cards">
        <div class="vs-card nn"><b>A♥ + 6♣ = мягкие 17</b>Туз = 11. Возьмём 9 → станет 16 (туз упадёт до 1), а не 26. Перебор невозможен!</div>
        <div class="vs-card"><b>10♠ + 7♦ = твёрдые 17</b>Туза нет. Любая карта 5+ даст перебор. Играть осторожно.</div>
      </div><p class="demo-note">Мягкие руки позволяют рисковать там, где твёрдые вынуждены стоять.</p>`;
  }
  function sceneOutcomes(stage) {
    stage.innerHTML = `<span class="stage-title">Четыре исхода раздачи</span>
      <ul class="flow-list">
        <li class="on">🏆 Ваша сумма больше, ≤21 → <b>победа, выплата 1:1</b></li>
        <li class="on">💥 Дилер перебрал, вы нет → <b>победа, выплата 1:1</b></li>
        <li>💀 Вы перебрали (>21) → <b>поражение сразу</b></li>
        <li>≡ Суммы равны → <b>ничья, ставка возвращается</b></li>
      </ul><p class="demo-note">21 — не обязательная цель! 13 очков выигрывают, если дилер перебрал.</p>`;
  }
  function sceneFlow(stage) {
    const stages = [
      ['Ставка', 'Вы кладёте фишки на стол — это ваша ставка в этой раздаче.'],
      ['Раздача', 'Вам две открытые карты. Дилеру две: одна открыта, вторая закрыта.'],
      ['Ваш ход', 'Ещё / Хватит / Удвоить — решаете вы, сколько угодно раз, пока ≤21.'],
      ['Ход дилера', 'Он открывает закрытую карту и добирает по правилам (или по решению сети).'],
      ['Сравнение', 'Кто ближе к 21 без перебора — тот и победил. Перебор проигрывает всегда.'],
      ['Выплата', 'Победа 1:1, блэкджек 3:2, ничья — возврат. Круг замкнулся!'],
    ];
    let i = 0;
    stage.innerHTML = `<span class="stage-title">Анатомия раздачи — листайте этапы</span><ol class="flow-list" id="vFlow"></ol>
      <button class="btn btn-primary btn-sm" id="vFlowBtn">Следующий этап ▶</button>`;
    const paint = () => {
      $('#vFlow', stage).innerHTML = stages.map((s, k) => `<li class="${k === i ? 'on' : ''}"><span><b>${s[0]}.</b> ${s[1]}</span></li>`).join('');
      $('#vFlowBtn', stage).textContent = i === stages.length - 1 ? '↺ Сначала' : 'Следующий этап ▶';
    };
    $('#vFlowBtn', stage).addEventListener('click', () => { i = (i + 1) % stages.length; sound.play('tick'); paint(); });
    paint();
  }
  function sceneActions(stage) {
    stage.innerHTML = `<span class="stage-title">Три кнопки — три судьбы</span>
      <div class="vs-cards">
        <div class="vs-card nn"><b>Ещё (Hit)</b>Взять одну карту. Можно повторять, пока сумма ≤ 21.</div>
        <div class="vs-card"><b>Хватит (Stand)</b>Зафиксировать сумму и передать ход дилеру.</div>
      </div>
      <div class="vs-card" style="border-color:rgba(177,140,255,.5)"><b style="color:var(--violet)">Удвоить (Double)</b>Ставка ×2, ровно одна карта, ход автоматически заканчивается. Только на первых двух картах. Сильный ход, когда вы фаворит: например 11 против 6 у дилера.</div>`;
  }
  function sceneOpponents(stage) {
    stage.innerHTML = `<span class="stage-title">Кто сидит напротив</span>
      <div class="vs-cards">
        <div class="vs-card"><b>🤖 Бот</b>Робот по правилам казино: обязан брать при &lt;17 и стоять на 17+. Никаких решений — предсказуем. При открытой 10/A проверяет блэкджек.</div>
        <div class="vs-card nn"><b>🧠 Нейросеть</b>Свободный игрок: 2 скрытых слоя решают «Ещё/Хватит» сами. Учится на тысячах раздач и на ваших партиях, чтобы побеждать чаще бота.</div>
      </div><p class="demo-note">Переключайте соперника на экране «Игра». Против сети интереснее наблюдать, как она догоняет ваш счёт.</p>`;
  }
  function sceneBJ(stage) {
    stage.innerHTML = `<span class="stage-title">Старшая комбинация</span>
      <div class="demo-hand" id="vBJ"></div>
      <p class="demo-note">Туз + любая десятка (10/J/Q/K) первыми двумя = блэкджек. Ставка 100 → выигрыш 150, возврат 250. Бьёт «обычные» 21 из трёх карт. У обоих — ничья.</p>`;
    const h = $('#vBJ', stage);
    ['A♠', 'K♥'].forEach(s => h.appendChild(createCardNode(parseCard(s))));
  }
  function sceneChips(stage) {
    stage.innerHTML = `<span class="stage-title">Фишки и выплаты</span>
      <div class="card-pick">${[10, 20, 50, 100, 200, 500].map(v => `<span class="chip" data-v="${v}"><b>${v}</b></span>`).join('')}</div>
      <table class="payout-table"><tr><th>Исход</th><th>Выплата</th></tr>
        <tr><td>Победа по очкам</td><td>1:1</td></tr><tr><td>Блэкджек</td><td>3:2</td></tr>
        <tr><td>Ничья</td><td>возврат</td></tr><tr><td>Поражение / перебор</td><td>−ставка</td></tr></table>
      <p class="demo-note">Старт: 1 000 фишек, мин. ставка 10. Закончились — бесплатная докупка: мы учимся, а не рискуем.</p>`;
  }
  function quizScene(q, options, stage) {
    stage.innerHTML = `<span class="stage-title">Проверка понимания</span><p class="quiz-q">${q}</p><div class="quiz-opts" id="vQuiz"></div><div id="vWhy"></div>`;
    const box = $('#vQuiz', stage);
    options.forEach(o => {
      const b = document.createElement('button'); b.textContent = o.t;
      b.addEventListener('click', () => {
        quiz.answered++; if (o.ok) quiz.correct++;
        Array.from(box.children).forEach((btn, i) => { btn.disabled = true; if (options[i].ok) btn.classList.add('right'); });
        if (!o.ok) b.classList.add('wrong');
        sound.play(o.ok ? 'win' : 'lose');
        $('#vWhy', stage).innerHTML = `<p class="quiz-why">${o.ok ? '✅ Верно! ' : '❌ Не совсем. '}${o.why}</p>`;
      });
      box.appendChild(b);
    });
  }
  function sceneStrategy(stage) {
    const ups = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const L = { hit: ['В', 'h'], stand: ['С', 's'], double: ['У', 'd'] };
    const row = (label, t, soft) => `<tr><td class="rowlab">${label}</td>${ups.map(u => { const a = decideByTotal(t, soft, u, true).action; return `<td class="${L[a][1]}">${L[a][0]}</td>`; }).join('')}</tr>`;
    let hard = '', soft = '';
    for (let t = 17; t >= 8; t--) hard += row('тв. ' + t, t, false);
    for (let t = 18; t >= 13; t--) soft += row('мягк. ' + t, t, true);
    stage.innerHTML = `<span class="stage-title">Шпаргалка базовой стратегии (S17)</span>
      <div class="grid-scroll"><table class="strat-table"><tr><th>Рука \ Дилер</th>${ups.map(u => `<th>${u === 11 ? 'A' : u}</th>`).join('')}</tr>${hard}${soft}</table></div>
      <div class="strat-legend"><span class="h">В — взять</span><span class="s">С — стоять</span><span class="d">У — удвоить (иначе взять; мягк.18 → стоять)</span></div>`;
  }
  function scenePractice(stage) {
    let alive = true, step = 0;
    stage.innerHTML = `<span class="stage-title">Тренировочная раздача — следуйте подсказке</span>
      <div class="felt mini">
        <div class="zone"><div class="zlabel">Дилер <span class="hbadge" id="prD">9 + ?</span></div><div class="hand" id="prDH"></div></div>
        <div class="zone"><div class="zlabel">Вы <span class="hbadge" id="prP">16</span></div><div class="hand" id="prPH"></div></div>
      </div>
      <p class="pr-caption" id="prCap"></p>
      <div class="pr-actions">
        <button class="btn act-btn hit" id="prHit"><b>Ещё</b></button>
        <button class="btn act-btn stand" id="prStand"><b>Хватит</b></button>
        <button class="btn act-btn dbl" id="prDbl" disabled title="В этой тренировке следуем подсказке"><b>Удвоить</b></button>
      </div>
      <div class="pr-foot"><button class="btn btn-ghost btn-sm" id="prReset">↺ Заново</button><span id="prState"></span></div>`;
    const P = [parseCard('10♠'), parseCard('6♦')], D = [parseCard('9♣'), parseCard('7♥')];
    const cap = t => $('#prCap', stage).textContent = t;
    const buttons = (hit, stand) => { $('#prHit', stage).disabled = !hit; $('#prStand', stage).disabled = !stand; };
    renderHand($('#prPH', stage), P); renderHand($('#prDH', stage), D, { hideIndex: 1 });
    cap('Вам 10♠ и 6♦ — твёрдые 16. У дилера открыта 9♣ — сильная карта: он, скорее всего, соберёт 17–20. Стоять на 16 против 9 плохо. По стратегии — «Ещё». Нажмите её.');
    buttons(true, false);
    $('#prHit', stage).addEventListener('click', () => {
      if (step !== 0 || !alive) return;
      step = 1; P.push(parseCard('5♠')); renderHand($('#prPH', stage), P); sound.play('deal');
      const b = $('#prP', stage); b.textContent = '21'; b.className = 'hbadge twentyone';
      cap('Пришла 5♠ — 21! Лучшая сумма без блэкджека. Больше брать нельзя — перебор. Жмите «Хватит».');
      buttons(false, true);
    });
    $('#prStand', stage).addEventListener('click', () => {
      if (step !== 1 || !alive) return;
      step = 2; buttons(false, false);
      setHole($('#prDH', stage), false); sound.play('flip');
      const db = $('#prD', stage); db.textContent = '16';
      cap('Дилер открыл 7♥: 9+7=16. По правилам он обязан брать (16 < 17)…');
      setTimeout(() => {
        if (!alive || !stage.isConnected) return;
        D.push(parseCard('2♣')); renderHand($('#prDH', stage), D); sound.play('deal');
        db.textContent = '18';
        cap('Пришла 2♣ — 18 ≥ 17, дилер стоит. Ваши 21 против его 18…');
        setTimeout(() => {
          if (!alive || !stage.isConnected) return;
          cap('🏆 Победа! 21 ближе к 21, чем 18 — ставка вернулась бы вдвое. Вот и весь цикл раздачи: ставка → карты → решения → дилер → сравнение → выплата.');
          $('#prState', stage).textContent = '✓ Практика пройдена';
          sound.play('win'); practiceDone = true;
        }, 1400);
      }, 1200);
    });
    $('#prReset', stage).addEventListener('click', () => { alive = false; scenePractice(stage); });
    stageCleanup = () => { alive = false; };
  }
  function sceneFinal(stage) {
    stage.innerHTML = `<span class="stage-title">Ваш пропуск за стол</span>
      <div class="emblem">21</div>
      <ul class="final-list">
        <li><span class="tick">✓</span> Правила, цель и перебор — понятны</li>
        <li><span class="tick">✓</span> Карты, тузы и мягкие руки — освоены</li>
        <li><span class="tick">✓</span> Квизы: ${quiz.correct} из ${quiz.answered || 3} верно</li>
        <li><span class="tick">${practiceDone ? '✓' : '○'}</span> Практическая раздача ${practiceDone ? 'пройдена' : '— можно вернуться на шаг 15'}</li>
      </ul>
      <div class="cta-row">
        <button class="btn btn-primary" id="ctaBot">🤖 Играть с ботом</button>
        <button class="btn btn-primary" id="ctaNN">🧠 Играть с нейросетью</button>
        <button class="btn btn-ghost" id="ctaTrain">📈 Тренировать сеть</button>
      </div>`;
    $('#ctaBot', stage).addEventListener('click', () => { engine.setOpponent('bot'); goto('game'); });
    $('#ctaNN', stage).addEventListener('click', () => { engine.setOpponent('nn'); goto('game'); });
    $('#ctaTrain', stage).addEventListener('click', () => goto('nn'));
  }
  const emblem = t => stage => { stage.innerHTML = `<div class="emblem">${t}</div><p class="demo-note" style="text-align:center">Читайте материал слева — здесь будут интерактивы.</p>`; };

  /* ── шаги ── */
  const steps = [
    { title: 'Что такое блэкджек?', visual: emblem('21'), html: `
      <p class="lead">Блэкджек (он же «двадцать одно») — самая популярная карточная игра казино в мире. И теперь вы поймёте почему.</p>
      <p>Играют обычной колодой из 52 карт. Вы сидите за столом <b>один на один против дилера</b> — «ведущего банка». В казино это сотрудник заведения, у нас — бот или нейросеть. Другие игроки вам не соперники: единственная задача — <b>обыграть дилера</b>.</p>
      <p><b>Зачем в это играть?</b> В отличие от рулетки или автоматов, здесь исход зависит не только от удачи. Каждое ваше решение — взять карту или остановиться — математически меняет шансы. Существует доказанная «базовая стратегия», которая снижает преимущество заведения примерно до 0,5%. Этой стратегии академия и учит.</p>
      <p class="note">Правило одной строкой: <b>наберите сумму очков ближе к 21, чем у дилера, но не больше 21.</b> Всё остальное — детали, которые мы разберём по шагам.</p>` },
    { title: 'Колода: из чего состоит', visual: sceneCards, html: `
      <p>Стандартная колода — <b>52 карты</b>: 4 масти по 13 достоинств.</p>
      <ul><li><b>Масти:</b> ♠ пики, ♥ червы, ♦ бубны, ♣ трефы. Червы и бубны — красные, пики и трефы — чёрные. В блэкджеке масть <b>не влияет на силу карты</b> — только на внешний вид.</li>
      <li><b>Достоинства:</b> туз (A), числа 2–10 и три «картинки» — валет (J), дама (Q), король (K).</li></ul>
      <p>В нашей игре используется <b>шуз</b> («башмак») из <b>4 колод — 208 карт</b>, как в настоящих казино. Когда остаётся меньше четверти, шуз автоматически перемешивается. Индикатор справа сверху на столе показывает запас карт.</p>
      <p class="note">Справа — веер карт. Наведите взгляд: туз, картинки и числа. На следующем шаге узнаем, сколько каждая стоит.</p>` },
    { title: 'Сколько стоит каждая карта', visual: sceneAdder, html: `
      <p>Сумма вашей «руки» — просто сумма очков карт:</p>
      <ul><li><b>Числа 2–10</b> — по номиналу: семёрка = 7, десятка = 10.</li>
      <li><b>Картинки J, Q, K</b> — все стоят <b>10</b>. Валет, дама и король равноценны.</li>
      <li><b>Туз A</b> — <b>1 или 11</b>, автоматически выбирается выгодный вариант. Это самая гибкая карта в игре.</li></ul>
      <p>Примеры: 7+5 = <b>12</b> · K+Q = <b>20</b> · A+9 = <b>20</b> (туз за 11).</p>
      <p class="note">👉 Интерактив справа: кликайте карты и собирайте руки — сумма, мягкость и перебор подсвечиваются сами. Попробуйте A + 9, затем добавьте семёрку и посмотрите, как туз «спасает» руку.</p>` },
    { title: 'Мягкая и твёрдая рука', visual: sceneSoft, html: `
      <p>Ключевое понятие, которое путает даже опытных новичков:</p>
      <ul><li><b>Мягкая рука</b> — туз считается за <b>11</b> и рука не перебирает. A+6 = «мягкие 17».</li>
      <li><b>Твёрдая рука</b> — туза нет, или туз уже сброшен до 1. 10+7 = «твёрдые 17», A+6+9 = «твёрдые 16».</li></ul>
      <p><b>Почему это важно?</b> Мягкую руку <b>невозможно перебрать одной картой</b>: если сумма превысит 21, туз просто станет единицей. A+6+9 — это 16, а не 26. Поэтому с мягкими руками играют смелее: чаще берут и удваивают.</p>
      <p>Твёрдые 17 — совсем другое дело: любая карта от 5 и выше убивает руку. Одинаковое число «17», а тактика противоположная.</p>
      <p class="note">Бейдж суммы у стола помечает мягкие руки точкой «●мягк» — вы всегда видите, какая у вас рука.</p>` },
    { title: 'Цель игры и перебор', visual: sceneOutcomes, html: `
      <p>Вы играете <b>только против дилера</b>. Возможны четыре исхода:</p>
      <ol><li><b>Победа:</b> ваша сумма больше, чем у дилера, и не превышает 21.</li>
      <li><b>Победа:</b> дилер перебрал (набрал больше 21), а вы — нет.</li>
      <li><b>Поражение:</b> у вас <b>перебор</b> — сумма больше 21. Проигрыш наступает <b>мгновенно</b>, дилеру даже не нужно ходить. Это главное правило!</li>
      <li><b>Ничья («push»):</b> суммы равны — ставка возвращается, никто не выиграл.</li></ol>
      <p class="note warn">⚠️ Важнейший нюанс: <b>21 — не обязательная цель.</b> Достаточно 13 очков, если дилер перебрал. Вся стратегия строится на том, чтобы заставить дилера рисковать, когда самому рисковать опасно.</p>` },
    { title: 'Как проходит раздача', visual: sceneFlow, html: `
      <p>Каждая раздача — маленький спектакль из шести актов:</p>
      <ol><li><b>Ставка.</b> Вы кладёте фишки — сколько уверены поставить.</li>
      <li><b>Раздача.</b> Вам — две открытые карты. Дилеру — две: одна открыта для всех, вторая закрыта («hole card», «карта в дырке»).</li>
      <li><b>Ваш ход.</b> Вы решаете: брать карты, остановиться или удвоить.</li>
      <li><b>Ход дилера.</b> Он открывает закрытую карту и добирает по правилам.</li>
      <li><b>Сравнение.</b> Чья сумма ближе к 21 без перебора?</li>
      <li><b>Выплата.</b> Победа 1:1, блэкджек 3:2, ничья — возврат ставки.</li></ol>
      <p>Закрытая карта дилера — источник интриги: вы принимаете решения, видя лишь половину его руки. Открытая карта — ваша главная подсказка.</p>
      <p class="note">👉 Справа — интерактивный степпер: пролистайте все шесть этапов.</p>` },
    { title: 'Три ваших действия', visual: sceneActions, html: `
      <p>В свой ход вы управляете раздачей тремя кнопками:</p>
      <ul><li><b>Ещё (Hit)</b> — взять одну карту. Повторяйте сколько угодно, пока сумма ≤ 21. Перебрали — раздача сразу проиграна.</li>
      <li><b>Хватит (Stand)</b> — зафиксировать сумму. Ход переходит дилеру, и вы уже ничего не меняете.</li>
      <li><b>Удвоить (Double)</b> — удвоить ставку, получить <b>ровно одну</b> карту и автоматически закончить ход. Доступно только на первых двух картах и если хватает фишек. Это ход фаворита: например, ваши 11 против слабой 6 дилера.</li></ul>
      <p class="note">Честная сноска: в казино есть ещё «сплит» (разделение пары) и «страховка». Мы намеренно оставили за учебным столом три главных действия — на них строится 95% решений. Остальное — следующий уровень, когда основы станут рефлексом.</p>` },
    { title: 'Дилер: правила или нейросеть', visual: sceneOpponents, html: `
      <p><b>Режим «Бот».</b> Дилер не принимает решений вообще — он связан правилами казино:</p>
      <ul><li>Сумма <b>меньше 17</b> — обязан брать карту.</li><li><b>17 и больше</b> — обязан стоять. Даже против ваших 20!</li>
      <li>Если открыта десятка или туз, он проверяет закрытую карту на блэкджек («peek»). Есть блэкджек — раздача заканчивается сразу.</li></ul>
      <p><b>Режим «Нейросеть».</b> Дилер-сеть правил не имеет: она видит вашу итоговую сумму (как настоящий дилер, ходящий вторым) и <b>сама решает</b>, брать или стоять. На вкладке «Нейросеть» её можно тренировать, смотреть график прогресса и сохранять веса. Она быстро понимает: «позади игрока — догоняй, впереди — стой».</p>
      <p class="note">Против бота проще учиться: его поведение предсказуемо. Против сети — интереснее: она адаптируется и наказывает за ошибки.</p>` },
    { title: 'Блэкджек — старшая комбинация', visual: sceneBJ, html: `
      <p><b>Блэкджек («натуральные 21»)</b> — туз + любая десятка (10, J, Q, K) <b>первыми двумя картами</b>.</p>
      <ul><li>Платит <b>3:2</b>: ставка 100 → выигрыш 150, на баланс возвращается 250.</li>
      <li>Бьёт любые «обычные» 21 — например, 7+7+7 проигрывает блэкджеку.</li>
      <li>Блэкджек у обоих — ничья, ставка возвращается.</li>
      <li>21, набранные после добора или удвоения, — просто 21, не блэкджек, платят 1:1.</li></ul>
      <p>Если у вас блэкджек, а у дилера нет — выплата происходит сразу, дилер не добирает. Именно повышенная выплата 3:2 делает блэкджек математически честным против правил дилера.</p>` },
    { title: 'Фишки, ставки и банк', visual: sceneChips, html: `
      <p>Ваш стартовый банк — <b>1 000 фишек</b>. Минимальная ставка — 10, максимальная — 1 000.</p>
      <p>Перед раздачей кликайте фишки (10/20/50/100/200/500), набирая ставку. Кнопки «Сброс», «Повтор» (прошлая ставка) и «Макс» ускоряют процесс. Затем — «Раздать карты».</p>
      <ul><li>Победа платит <b>1:1</b> · блэкджек <b>3:2</b> · ничья — возврат · поражение — ставка сгорает.</li>
      <li>Удвоение умножает и ставку, и все выплаты на два.</li>
      <li>Фишки закончились? Докупка 1 000 — бесплатна и не портит статистику «чистого итога».</li></ul>
      <p class="note">Игра идёт <b>матчами до N побед</b> (3/5/7/10 — выбирается на экране «Игра»). Ничьи в счёт не идут. В конце матча — подробный отчёт по каждой раздаче.</p>` },
    { title: 'Квиз 1 · Стоимость карт', visual: s => quizScene('Король + семёрка. Сколько очков в руке?', [
      { t: '17', ok: true, why: 'Король — картинка, стоит 10. 10 + 7 = 17.' },
      { t: '27', ok: false, why: 'Король стоит 10, а не 20. Все картинки (J/Q/K) — десятки: 10 + 7 = 17.' },
      { t: '19', ok: false, why: 'Король — это ровно 10 очков. 10 + 7 = 17.' },
    ], s), html: `<p>Первая проверка. Отвечайте честно — разбор объяснит любой вариант.</p><p>Подсказка из шага 3: все «картинки» — валет, дама, король — стоят одинаково.</p><p class="note">Вопрос справа 👉</p>` },
    { title: 'Квиз 2 · Мягкая рука', visual: s => quizScene('Туз + шестёрка — это…', [
      { t: 'Твёрдые 7', ok: false, why: 'Туз может быть единицей, но выгоднее считать его за 11: рука — мягкие 17, и брать карту безопасно.' },
      { t: 'Мягкие 17', ok: true, why: 'Туз = 11, 11 + 6 = 17. Рука мягкая: при переборе туз упадёт до 1.' },
      { t: 'Игрок сам выбирает 7 или 17', ok: false, why: 'В нашей игре (и в казино) сумма считается автоматически по лучшему варианту. Выбирать вручную не нужно.' },
    ], s), html: `<p>Мягкие руки — суперсила новичка, который знает правила.</p><p>Вспомните: A+6+9 не перебирает, а превращается в 16.</p><p class="note">Вопрос справа 👉</p>` },
    { title: 'Квиз 3 · Перебор', visual: s => quizScene('Вы набрали 22 очка. Что произойдёт?', [
      { t: 'Ждём дилера — вдруг у него больше', ok: false, why: 'Нет: перебор проигрывает мгновенно, ещё до хода дилера. Даже если дилер потом тоже переберёт.' },
      { t: 'Ничья', ok: false, why: 'Ничья — только при равных sums без перебора. 22 — это bust.' },
      { t: 'Перебор — мгновенный проигрыш', ok: true, why: 'Именно так. Это правило — причина, по которой игрок ходит первым и почему стратегия так важна.' },
    ], s), html: `<p>Самое важное правило игры — на закрепление.</p><p class="note">Вопрос справа 👉</p>` },
    { title: 'Базовая стратегия: шпаргалка', visual: sceneStrategy, html: `
      <p>Базовая стратегия — математически лучшее действие для каждой пары «ваша рука × открытая карта дилера». Её сердце:</p>
      <ul><li><b>Дилер слаб (открыто 2–6):</b> он часто перебирает. Стойте на твёрдых 12–16 и дайте ему погибнуть самому. Удваивайте 9–11.</li>
      <li><b>Дилер силён (7–A):</b> он, скорее всего, соберёт 17–20. Твёрдые 12–16 придётся догонять до 17+, как бы страшно ни было.</li>
      <li><b>Твёрдые 17+</b> — всегда стоять. <b>Мягкие 18 и ниже</b> — играть смелее: туз страхует.</li></ul>
      <p>Справа — полная цветная таблица. Не зубрите: за столом включены <b>«Подсказки стратегии»</b> — совет и причина появляются прямо у руки, а разбор каждой раздачи проверяет ваши решения.</p>
      <p class="note">После ~50 раздач с подсказками таблица начинает вспоминаться сама. Это и есть цель академии.</p>` },
    { title: 'Тренировочная раздача', visual: scenePractice, html: `
      <p>Теория без практики мертва. Справа — настоящая раздача с заранее известными картами и пошаговым тренером.</p>
      <ol><li>Оцените свою руку и открытую карту дилера.</li><li>Следуйте подсказке в подписи под столом.</li><li>Понаблюдайте, как дилер добирает по правилам.</li><li>Прочитайте, почему исход именно такой.</li></ol>
      <p>Ситуация: у вас <b>твёрдые 16</b>, у дилера открыта <b>9</b>. Классический «страшный» выбор, который стратегия решает однозначно.</p>
      <p class="note">Кнопки разблокируются по очереди — ошибиться нельзя, можно только понять. «↺ Заново» перезапускает тренировку.</p>` },
    { title: 'Вы готовы!', visual: sceneFinal, html: `
      <p class="lead">Курс окончен. Вы знаете то, чего не знает большинство садящихся за стол.</p>
      <p>Теперь у вас есть: понимание цели и перебора, счёт карт и тузов, три действия, правила дилера, выплаты, шпаргалка стратегии и первая сыгранная раздача.</p>
      <p><b>Как расти дальше:</b></p>
      <ul><li>Играйте с подсказками и следите за «точностью решений» в статистике — цельтесь в 90%+.</li>
      <li>Читайте разбор каждой раздачи: там ваша персональная работа над ошибками.</li>
      <li>Натренируйте нейросеть на 2–5 тысяч раздач и попробуйте её обыграть — она уже не подарок.</li></ul>
      <p class="note">Кнопки справа ведут прямо к столу. Удачи — и помните: стратегия побеждает на дистанции, а не в каждой раздаче.</p>` },
  ];

  const dots = $('#tutDots');
  steps.forEach((_, i) => {
    const b = document.createElement('button'); b.title = `Шаг ${i + 1}`;
    b.addEventListener('click', () => { idx = i; render(); });
    dots.appendChild(b);
  });
  function render() {
    stageCleanup?.(); stageCleanup = null;
    const s = steps[idx];
    $('#tutTitle').textContent = s.title;
    $('#tutContent').innerHTML = s.html;
    $('#tutStepLabel').textContent = `Шаг ${idx + 1} из ${steps.length}`;
    $('#tutProgressBar').style.width = ((idx + 1) / steps.length * 100) + '%';
    $('#tutPrev').disabled = idx === 0;
    $('#tutNext').textContent = idx === steps.length - 1 ? 'К столу ♠' : 'Дальше →';
    Array.from(dots.children).forEach((d, i) => { d.className = i === idx ? 'cur' : i < idx ? 'done' : ''; });
    const stage = $('#tutStage'); stage.innerHTML = '';
    s.visual(stage);
    $('#tutContent').scrollTop = 0;
    if (idx === steps.length - 1) { store.set('bj-tut-done', true); onDone?.(); }
  }
  const next = () => { if (idx === steps.length - 1) { goto('game'); return; } idx++; sound.play('tick'); render(); };
  const prev = () => { if (idx > 0) { idx--; sound.play('tick'); render(); } };
  $('#tutNext').addEventListener('click', next);
  $('#tutPrev').addEventListener('click', prev);
  render();
  return { next, prev };
}