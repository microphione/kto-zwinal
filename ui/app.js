// Mobile UI: mission list, board (SVG), hero cards, placement and checking. Logic lives in ../src.
import { getBoard, safeOf } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, UNARY, PAIR, SAFE_PAIR } from '../src/statements.js';
import { statementText, stepText, cellName, droneText } from '../src/text.js';
import { nextHint, nextDrone } from '../src/steps.js';
import { DIFFICULTIES } from '../src/generator.js';

// Fixed missions are frozen JSON (scripts/freeze-missions.js), so generator changes never alter them.
const MISSIONS = [
  { id: 'misja-1', difficulty: 'easy', title: 'Pierwszy skok' },
  { id: 'misja-2', difficulty: 'medium', title: 'Akcja w bazie' },
];
const DIFF_LABEL = { easy: 'Łatwa', medium: 'Średnia', hard: 'Trudna', expert: 'Ekspert' };
const HERO_COLORS = {
  Bobo: '#ff8c42', Mira: '#ff5d9e', Zyg: '#4cc9f0', Kora: '#9b5de5',
  Rufi: '#e63946', Tesa: '#06d6a0', Grot: '#8d6e63', Lumi: '#f4b400',
};
const ZONE_TINTS = ['#ffe8a3', '#c9ecff', '#d5f5b8', '#ffd4d4', '#e3d6ff', '#ffdcc2'];
const INK = '#1b1530';
const S = 100;
const M = 44;

const app = document.getElementById('app');
let game = null;

// ---------- storage ----------
// v3 (rows and columns, safe on the last free cell) uses its own namespace: progress and cases saved by
// v1/v2 no longer fit and are removed.
const NS = 'ktozwinal3';
for (const k of Object.keys(localStorage)) if (k.startsWith('ktozwinal:') || k.startsWith('ktozwinal2:')) localStorage.removeItem(k);
const key = (seed, difficulty) => `${NS}:${difficulty}:${seed}`;
const SOLVED = `${NS}:solved`;
const SEEN_RULES = `${NS}:seenRules`;
const solvedSet = () => new Set(JSON.parse(localStorage.getItem(SOLVED) || '[]'));
function markSolved(id) {
  const s = solvedSet();
  s.add(id);
  localStorage.setItem(SOLVED, JSON.stringify([...s]));
}
function save() {
  const history = game.history.map(h => ({ placement: h.placement, marks: [...h.marks] }));
  localStorage.setItem(key(game.seed, game.difficulty), JSON.stringify({ placement: game.placement, marks: [...game.marks], history, hints: game.hints, flown: game.flown }));
}
// The last random case is kept whole (puzzle included), so it can be resumed after leaving or a reload.
const CURRENT = `${NS}:current`;
const loadCurrent = () => JSON.parse(localStorage.getItem(CURRENT) || 'null');
function generateInWorker(seed, difficulty) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gen-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { worker.terminate(); resolve(e.data); };
    worker.onerror = e => { worker.terminate(); reject(e); };
    worker.postMessage({ seed, difficulty });
  });
}
// The old case is dropped only once the new one exists.
function storeRandom(current) {
  const old = loadCurrent();
  if (old) {
    const id = key(old.seed, old.puzzle.difficulty);
    localStorage.removeItem(id);
    const solved = solvedSet();
    if (solved.delete(id)) localStorage.setItem(SOLVED, JSON.stringify([...solved]));
  }
  localStorage.setItem(CURRENT, JSON.stringify(current));
}
// The daily case is stored with its date, so a later generator change cannot alter today's board.
const DAILY = `${NS}:daily`;
function today() {
  const d = new Date();
  const two = x => String(x).padStart(2, '0');
  return { iso: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, label: `${two(d.getDate())}.${two(d.getMonth() + 1)}` };
}
async function dailyCase() {
  const { iso, label } = today();
  const stored = JSON.parse(localStorage.getItem(DAILY) || 'null');
  if (stored?.date === iso) return stored;
  const seed = `dzien-${iso}`;
  const daily = { date: iso, seed, title: `Sprawa dnia ${label}`, puzzle: await generateInWorker(seed, 'medium') };
  if (stored) {
    const id = key(stored.seed, 'medium');
    localStorage.removeItem(id);
    const solved = solvedSet();
    if (solved.delete(id)) localStorage.setItem(SOLVED, JSON.stringify([...solved]));
  }
  localStorage.setItem(DAILY, JSON.stringify(daily));
  return daily;
}

// Unfinished = not solved and at least one hero or a cross on the board.
function unfinished(current) {
  const id = key(current.seed, current.puzzle.difficulty);
  if (solvedSet().has(id)) return false;
  const stored = JSON.parse(localStorage.getItem(id) || 'null');
  return Boolean(stored && (stored.placement.some(c => c >= 0) || stored.marks.length));
}

// ---------- helpers ----------
const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const color = hero => HERO_COLORS[hero.name] || '#888';
const coord = (cell, n) => `${Math.floor(cell / n) + 1},${(cell % n) + 1}`;

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast">${esc(text)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function overlay(html) {
  const o = el(`<div class="overlay"><div class="modal">${html}</div></div>`);
  o.addEventListener('click', e => { if (e.target === o) o.remove(); });
  document.body.appendChild(o);
  return o;
}

// In-app yes/no question; tapping outside counts as "no".
function ask(question, yes, no) {
  return new Promise(resolve => {
    const o = overlay(`<p style="font-size:18px;font-weight:800;text-align:center">${esc(question)}</p>
      <div class="actions"><button class="btn ghost" data-a="no">${esc(no)}</button><button class="btn" data-a="yes">${esc(yes)}</button></div>`);
    const done = answer => { o.remove(); resolve(answer); };
    o.querySelector('[data-a="yes"]').onclick = () => done(true);
    o.querySelector('[data-a="no"]').onclick = () => done(false);
    o.addEventListener('click', e => { if (e.target === o) resolve(false); });
  });
}

// ---------- home ----------
function renderHome() {
  game = null;
  const solved = solvedSet();
  app.innerHTML = '';
  app.appendChild(el(`<h1 class="title">Kto zwinął?</h1>`));
  app.appendChild(el(`<p class="subtitle">Ktoś obrobił ukryty sejf. Ustal, kto gdzie stał, a sejf sam się znajdzie.</p>`));
  const tutorial = el(`<button class="btn mission"><span class="num">?</span><span class="meta">Samouczek<small>Pierwsza sprawa krok po kroku</small></span>${solved.has(key('samouczek', 'easy')) ? '<span class="done">✔</span>' : ''}</button>`);
  tutorial.onclick = () => openFixed(tutorial, 'samouczek', 'Samouczek', showTutorial);
  app.appendChild(tutorial);
  MISSIONS.forEach((m, i) => {
    const id = key(m.id, m.difficulty);
    const b = el(`<button class="btn mission"><span class="num">${i + 1}</span><span class="meta">${esc(m.title)}<small>Misja ${i + 1} · ${DIFF_LABEL[m.difficulty]}</small></span>${solved.has(id) ? '<span class="done">✔</span>' : ''}</button>`);
    b.onclick = () => openFixed(b, m.id, `Misja ${i + 1}: ${m.title}`);
    app.appendChild(b);
  });
  app.appendChild(el(`<div class="section-label">Sprawa dnia</div>`));
  const { iso, label } = today();
  const dailyDone = solved.has(key(`dzien-${iso}`, 'medium'));
  const daily = el(`<button class="btn mission"><span class="num">★</span><span class="meta">Sprawa dnia ${label}<small>Codziennie nowa · ${DIFF_LABEL.medium}</small></span>${dailyDone ? '<span class="done">✔</span>' : ''}</button>`);
  daily.onclick = async () => {
    if (daily.disabled) return;
    daily.disabled = true;
    daily.querySelector('small').textContent = 'Losuję…';
    try {
      const d = await dailyCase();
      if (daily.isConnected) startGame(d.puzzle, d.seed, d.title);
    } catch {
      daily.disabled = false;
      daily.querySelector('small').textContent = 'Spróbuj jeszcze raz';
      toast('Nie udało się przygotować sprawy dnia.');
    }
  };
  app.appendChild(daily);
  app.appendChild(el(`<div class="section-label">Losowa sprawa</div>`));
  const current = loadCurrent();
  if (current) {
    const done = solved.has(key(current.seed, current.puzzle.difficulty));
    const label = done ? 'Ostatnia sprawa' : 'Kontynuuj';
    const b = el(`<button class="btn mission"><span class="num">▶</span><span class="meta">${label}<small>${esc(current.title)}</small></span>${done ? '<span class="done">✔</span>' : ''}</button>`);
    b.onclick = () => startGame(current.puzzle, current.seed, current.title);
    app.appendChild(b);
  }
  const row = el(`<div class="random-row"></div>`);
  for (const d of Object.keys(DIFF_LABEL)) {
    const b = el(`<button class="btn secondary">${DIFF_LABEL[d]}</button>`);
    b.onclick = async () => {
      if (row.classList.contains('busy')) return;
      if (current && unfinished(current) && !(await ask('Masz niedokończoną sprawę. Porzucić ją i wylosować nową?', 'Losuj nową', 'Wróć'))) return;
      row.classList.add('busy');
      b.textContent = 'Losuję…';
      const seed = `losowa-${Date.now()}`;
      try {
        const current = { seed, title: `Losowa · ${DIFF_LABEL[d]}`, puzzle: await generateInWorker(seed, d) };
        // The player left the menu meanwhile: keep whatever they are playing, drop the new case.
        if (!row.isConnected) return;
        storeRandom(current);
        startGame(current.puzzle, current.seed, current.title);
      } catch {
        row.classList.remove('busy');
        b.textContent = DIFF_LABEL[d];
        toast('Nie udało się wylosować sprawy. Spróbuj jeszcze raz.');
      }
    };
    row.appendChild(b);
  }
  app.appendChild(row);
  const rules = el(`<button class="btn ghost" style="width:100%;margin-top:16px">Zasady gry</button>`);
  rules.onclick = showRules;
  app.appendChild(rules);
}

async function openFixed(button, id, title, intro) {
  if (button.disabled) return;
  button.disabled = true;
  try {
    const res = await fetch(`puzzles/${id}.json`);
    if (!res.ok) throw new Error(res.status);
    startGame(await res.json(), id, title, intro);
  } catch {
    button.disabled = false;
    toast('Nie udało się wczytać sprawy. Sprawdź połączenie.');
  }
}

// ---------- game ----------
function startGame(puzzle, seed, title, intro = null) {
  const { difficulty } = puzzle;
  const stored = JSON.parse(localStorage.getItem(key(seed, difficulty)) || 'null');
  game = {
    seed, difficulty, title, puzzle,
    placement: stored?.placement ?? new Array(puzzle.heroes.length).fill(-1),
    marks: new Set(stored?.marks ?? []),
    selected: 0,
    mode: 'place',
    showSight: true,
    checked: false,
    history: (stored?.history ?? []).map(h => ({ placement: h.placement, marks: new Set(h.marks) })),
    hints: stored?.hints ?? 0,
    flown: stored?.flown ?? [], // drone reports (RULES.md §7)
    won: false,
  };
  game.selected = Math.max(0, game.placement.indexOf(-1));
  game.won = complete() && isSolved();
  renderGame();
  if (intro) {
    localStorage.setItem(SEEN_RULES, '1');
    intro();
  } else if (!localStorage.getItem(SEEN_RULES)) {
    localStorage.setItem(SEEN_RULES, '1');
    showRules();
  }
}

const complete = () => game.placement.every(c => c >= 0);
// Heroes who share a row or a column (R1).
function conflicts() {
  const { placement, puzzle } = game;
  const n = puzzle.n;
  const bad = new Set();
  placement.forEach((a, i) => placement.forEach((b, j) => {
    if (i < j && a >= 0 && b >= 0 && (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n)) { bad.add(i); bad.add(j); }
  }));
  return bad;
}
// The safe appears by itself once every hero stands in a row and a column of their own: on the last free crossing.
const shownSafe = () => (complete() && conflicts().size === 0 ? safeOf(getBoard(game.puzzle), game.placement) : -1);
const droneCount = () => DIFFICULTIES[game.difficulty]?.drones ?? 0;
// The next unplaced hero.
function nextSelection(skip) {
  const next = game.placement.findIndex((c, i) => c < 0 && i !== skip);
  return next >= 0 ? next : skip;
}

function snapshot() {
  game.history.push({ placement: game.placement.slice(), marks: new Set(game.marks) });
  if (game.history.length > 200) game.history.shift();
}

function onCell(cell) {
  if (game.won) return;
  const { placement } = game;
  const board = getBoard(game.puzzle);
  const here = placement.indexOf(cell);
  if (game.mode === 'mark') {
    if (here >= 0 || !board.walk[cell]) return;
    snapshot();
    if (game.marks.has(cell)) game.marks.delete(cell);
    else game.marks.add(cell);
    return afterChange();
  }
  if (here >= 0) {
    if (here === game.selected) {
      snapshot();
      placement[here] = -1;
      return afterChange();
    }
    game.selected = here;
    return renderGame();
  }
  if (!board.walk[cell]) return toast('Tu nie da się stanąć.');
  // R1 like sudoku: a placed hero takes their whole row and column; only the selected hero may move within them.
  const n = board.n;
  const blocker = placement.findIndex((c, h) => h !== game.selected && c >= 0 &&
    (Math.floor(c / n) === Math.floor(cell / n) || c % n === cell % n));
  if (blocker >= 0) return toast(`W tym rzędzie albo kolumnie stoi już ${game.puzzle.heroes[blocker].name}.`);
  snapshot();
  placement[game.selected] = cell;
  game.marks.delete(cell);
  game.selected = nextSelection(game.selected);
  afterChange();
}

function afterChange() {
  game.checked = false;
  save();
  const all = complete();
  if (all && isSolved()) {
    game.won = true;
    markSolved(key(game.seed, game.difficulty));
    document.querySelector('.toast')?.remove();
    renderGame();
    return showWin();
  }
  renderGame();
  if (all) toast('Wszystko rozstawione, ale coś się nie zgadza. Stuknij „Sprawdź”.');
}

// All statements true + R0–R2 ⇔ the unique solution (the generator guarantees it).
function isSolved() {
  return isValidPlacement(game.puzzle, game.placement) && game.puzzle.statements.every(st => evaluate(game.puzzle, game.placement, st));
}

// Whether a statement can already be judged: its heroes are placed, and the safe has appeared if the truth
// depends on it.
function evaluable(st) {
  const p = game.placement;
  if (st.type === 'alarm') return shownSafe() >= 0;
  if (SAFE_PAIR[st.type]) return shownSafe() >= 0;
  if (UNARY.has(st.type)) return p[st.who] >= 0;
  if (PAIR.has(st.type)) return p[st.who] >= 0 && p[st.hero] >= 0;
  return p.every(c => c >= 0);
}

function falseStatements() {
  return new Set(game.puzzle.statements.filter(st => evaluable(st) && !evaluate(game.puzzle, game.placement, st)));
}

function check() {
  game.checked = true;
  const problems = [];
  if (conflicts().size) problems.push('ktoś stoi w jednym rzędzie albo kolumnie z kimś');
  const safe = shownSafe();
  if (safe >= 0) {
    const board = getBoard(game.puzzle);
    const thieves = game.placement.filter(c => board.thiefSpots[safe].includes(c)).length;
    if (board.type[safe] !== 'ground') problems.push('sejf stał na gołej ziemi, a ostatnie wolne pole nie jest gołą ziemią');
    else if (thieves > 1) problems.push('po skosie przy sejfie, w jego strefie, stoi więcej niż jedna osoba');
    else if (thieves === 0) problems.push('nikt nie stoi po skosie przy sejfie w jego strefie');
  }
  const wrong = falseStatements().size;
  const few = wrong % 10 >= 2 && wrong % 10 <= 4 && (wrong % 100 < 12 || wrong % 100 > 14);
  if (wrong) problems.push(`${wrong} ${wrong === 1 ? 'zeznanie się nie zgadza' : few ? 'zeznania się nie zgadzają' : 'zeznań się nie zgadza'}`);
  renderGame();
  toast(problems.length ? `Problem: ${problems.join(', ')}.` : 'Na razie wszystko się zgadza.');
}

function undo() {
  const last = game.history.pop();
  if (!last) return toast('Nie ma czego cofnąć.');
  game.placement = last.placement;
  game.marks = last.marks;
  game.won = false;
  game.checked = false;
  save();
  renderGame();
}

function clearAll() {
  snapshot();
  game.placement = game.placement.map(() => -1);
  game.marks.clear();
  game.selected = 0;
  game.won = false;
  afterChange();
}

function hint() {
  if (game.won) return toast('Sprawa jest już rozwiązana.');
  const { puzzle } = game;
  const h = nextHint(puzzle, game.placement);
  const name = puzzle.heroes[h.hero]?.name;
  if (h.kind === 'none') return toast('Brak podpowiedzi dla tego ustawienia.');
  game.hints++;
  save();
  if (h.kind === 'wrong') {
    const o = overlay(`<h2>Podpowiedź</h2><p style="font-size:18px;text-align:center"><b>${esc(name)}</b> stoi w złym miejscu.</p>
      <div class="actions"><button class="btn ghost" data-a="ok">OK</button><button class="btn" data-a="go">Zdejmij</button></div>`);
    o.querySelector('[data-a="ok"]').onclick = () => o.remove();
    o.querySelector('[data-a="go"]').onclick = () => {
      o.remove();
      snapshot();
      game.placement[h.hero] = -1;
      game.selected = h.hero;
      afterChange();
    };
    return;
  }
  // The full chain justifies the cell; long chains start folded to their last steps.
  const SHORT = 6;
  const folded = h.chain.length > SHORT ? h.chain.length - 4 : 0;
  const items = h.chain.map((st, i) => `<li${i < folded ? ' hidden' : ''}>${esc(stepText(puzzle, st))}</li>`).join('');
  const o = overlay(`<h2>Podpowiedź</h2>
    ${folded ? `<button class="btn small ghost hint-more" data-a="all">Pokaż wszystkie kroki (${h.chain.length})</button>` : ''}
    <ol class="hint-steps">${items}</ol>
    <p style="font-size:18px;text-align:center">Więc <b>${esc(name)}</b> stoi na polu <b>${cellName(puzzle, h.cell)}</b>.</p>
    <div class="actions"><button class="btn ghost" data-a="ok">OK</button><button class="btn" data-a="go">Postaw</button></div>`);
  o.querySelector('[data-a="all"]')?.addEventListener('click', e => {
    o.querySelectorAll('.hint-steps li[hidden]').forEach(li => { li.hidden = false; });
    e.target.remove();
  });
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
  o.querySelector('[data-a="go"]').onclick = () => {
    o.remove();
    snapshot();
    game.placement[h.hero] = h.cell;
    game.marks.delete(h.cell);
    game.selected = nextSelection(h.hero);
    afterChange();
  };
}

// Drone hint (RULES.md §7): a true report about one row or column of the solution; it counts as a hint.
function sendDrone() {
  if (game.won) return toast('Sprawa jest już rozwiązana.');
  if (game.flown.length >= droneCount()) return toast('Nie masz już dronów.');
  const report = nextDrone(game.puzzle, game.placement, game.flown);
  if (!report) return toast('Dron nie ma już czego nagrać.');
  game.flown.push(report);
  game.hints++;
  save();
  renderGame();
  const o = overlay(`<h2>Dron D${game.flown.length}</h2><p style="font-size:18px;text-align:center">${esc(droneText(game.puzzle, report))}</p>
    <div class="actions"><button class="btn" data-a="ok">OK</button></div>`);
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
}

// ---------- drawing ----------
const ART = {
  crate: `<rect x="12" y="12" width="76" height="76" rx="8" fill="#d08a3c" stroke="${INK}" stroke-width="6"/><rect x="22" y="22" width="56" height="56" rx="3" fill="none" stroke="#8a5420" stroke-width="5"/><path d="M24 24 L76 76" stroke="#8a5420" stroke-width="7"/>`,
  barrel: `<rect x="22" y="10" width="56" height="80" rx="22" fill="#c2532d" stroke="${INK}" stroke-width="6"/><path d="M24 34 H76 M24 66 H76" stroke="#7a2f17" stroke-width="6"/><ellipse cx="50" cy="22" rx="14" ry="5" fill="#e07a4f"/>`,
  rock: `<path d="M16 76 L26 38 L50 18 L78 28 L88 68 L66 88 L30 88 Z" fill="#9aa3ad" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M34 40 L50 28 L66 34" fill="none" stroke="#d3d8de" stroke-width="5" stroke-linecap="round"/>`,
  safe: `<rect x="6" y="6" width="88" height="88" rx="14" fill="none" stroke="#ffc531" stroke-width="5" stroke-dasharray="10 7"/><rect x="14" y="14" width="72" height="72" rx="10" fill="#4f5d75" stroke="${INK}" stroke-width="6"/><circle cx="50" cy="50" r="17" fill="#ffc531" stroke="${INK}" stroke-width="5"/><path d="M50 37 V50 H60" stroke="${INK}" stroke-width="4" fill="none"/>`,
  bush: `<circle cx="32" cy="62" r="20" fill="#47b862" stroke="#1e6b34" stroke-width="4"/><circle cx="68" cy="62" r="20" fill="#47b862" stroke="#1e6b34" stroke-width="4"/><circle cx="50" cy="42" r="22" fill="#5ccf74" stroke="#1e6b34" stroke-width="4"/>`,
  pad: `<circle cx="50" cy="50" r="33" fill="#7b6cff" stroke="${INK}" stroke-width="5"/><circle cx="50" cy="50" r="20" fill="none" stroke="#c9c2ff" stroke-width="4"/><path d="M38 56 L50 42 L62 56" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
};

function heroToken(hero, x, y, { selected, conflict }) {
  const ring = conflict ? `<circle cx="${x}" cy="${y}" r="44" fill="none" stroke="#e63946" stroke-width="8"/>` : '';
  const sel = selected ? `<circle cx="${x}" cy="${y}" r="45" fill="none" stroke="#ffc531" stroke-width="7"><animate attributeName="r" values="41;47;41" dur="1.2s" repeatCount="indefinite"/></circle>` : '';
  return `${ring}${sel}<circle cx="${x}" cy="${y + 4}" r="35" fill="${INK}"/><circle cx="${x}" cy="${y}" r="35" fill="${color(hero)}" stroke="${INK}" stroke-width="6"/>` +
    `<text x="${x}" y="${y + 14}" text-anchor="middle" font-family="Lilita One, Arial Black, sans-serif" font-size="40" fill="#fff" stroke="${INK}" stroke-width="2.5" paint-order="stroke">${esc(hero.name[0])}</text>`;
}

function safeToken(x, y) {
  return `<g transform="translate(${x - S / 2} ${y - S / 2})">${ART.safe}</g>`;
}

function boardSvg() {
  const { puzzle, placement } = game;
  const board = getBoard(puzzle);
  const n = puzzle.n;
  const W = n * S + 2 * M;
  const parts = [];
  const x0 = c => M + c * S;
  const y0 = r => M + r * S;

  // floor per zone
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    const tint = ZONE_TINTS[board.zone[i] % ZONE_TINTS.length];
    parts.push(`<rect x="${x0(c)}" y="${y0(r)}" width="${S}" height="${S}" fill="${tint}"/>`);
    if ((r + c) % 2) parts.push(`<rect x="${x0(c)}" y="${y0(r)}" width="${S}" height="${S}" fill="#fff" opacity="0.22"/>`);
  }
  // sight shading of placed heroes: their whole row and column (nothing blocks sight)
  if (game.showSight) {
    const seen = new Set();
    placement.forEach(cell => {
      if (cell < 0) return;
      for (let x = 0; x < n; x++) seen.add(Math.floor(cell / n) * n + x).add(x * n + (cell % n));
    });
    for (const cell of placement) seen.delete(cell);
    for (const j of seen) {
      parts.push(`<rect x="${x0(j % n)}" y="${y0(Math.floor(j / n))}" width="${S}" height="${S}" fill="url(#seen)"/>`);
    }
  }
  // grid
  for (let k = 1; k < n; k++) {
    parts.push(`<path d="M${x0(k)} ${M} V${M + n * S} M${M} ${y0(k)} H${M + n * S}" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>`);
  }
  // painted zone borders
  const segs = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    if (c + 1 < n && board.zone[i] !== board.zone[i + 1]) segs.push(`M${x0(c + 1)} ${y0(r)} V${y0(r + 1)}`);
    if (r + 1 < n && board.zone[i] !== board.zone[i + n]) segs.push(`M${x0(c)} ${y0(r + 1)} H${x0(c + 1)}`);
  }
  parts.push(`<path d="${segs.join(' ')}" stroke="${INK}" stroke-opacity="0.55" stroke-width="12" stroke-linecap="round"/>`);
  parts.push(`<path d="${segs.join(' ')}" stroke="#fff" stroke-width="6" stroke-dasharray="16 10" stroke-linecap="round"/>`);
  // objects of the map
  for (let i = 0; i < n * n; i++) {
    const art = ART[board.type[i]];
    if (art) parts.push(`<g transform="translate(${x0(i % n)} ${y0(Math.floor(i / n))})">${art}</g>`);
  }
  // zone names (first cell of each zone)
  board.zoneCells.forEach((cells, z) => {
    const i = cells[0];
    const label = puzzle.zoneNames[z];
    const w = label.length * 11 + 14;
    parts.push(`<g transform="translate(${x0(i % n) + 4} ${y0(Math.floor(i / n)) + 4})"><rect width="${w}" height="24" rx="12" fill="#fff" stroke="${INK}" stroke-width="3"/><text x="${w / 2}" y="17" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="800" font-size="15" fill="${INK}">${esc(label)}</text></g>`);
  });
  // the safe, once it has appeared on the last free crossing
  const safe = shownSafe();
  if (safe >= 0) parts.push(safeToken(x0(safe % n) + S / 2, y0(Math.floor(safe / n)) + S / 2));
  // marks
  for (const j of game.marks) {
    const x = x0(j % n), y = y0(Math.floor(j / n));
    parts.push(`<path d="M${x + 28} ${y + 28} L${x + 72} ${y + 72} M${x + 72} ${y + 28} L${x + 28} ${y + 72}" stroke="${INK}" stroke-width="9" stroke-linecap="round" opacity="0.75"/>`);
  }
  // heroes
  const bad = game.checked ? conflicts() : new Set();
  placement.forEach((cell, h) => {
    if (cell < 0) return;
    const x = x0(cell % n) + S / 2, y = y0(Math.floor(cell / n)) + S / 2;
    parts.push(heroToken(puzzle.heroes[h], x, y, { selected: h === game.selected, conflict: bad.has(h) }));
  });
  // outer frame, coordinates, drones
  parts.push(`<rect x="${M}" y="${M}" width="${n * S}" height="${n * S}" rx="6" fill="none" stroke="${INK}" stroke-width="8"/>`);
  for (let k = 0; k < n; k++) {
    parts.push(`<text x="${x0(k) + S / 2}" y="${M - 12}" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="26" fill="${INK}" opacity="0.6">${k + 1}</text>`);
    parts.push(`<text x="${M / 2}" y="${y0(k) + S / 2 + 9}" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="26" fill="${INK}" opacity="0.6">${k + 1}</text>`);
  }
  // drones sent: a badge over the row (east side) or column (south side) they recorded
  game.flown.forEach((d, i) => {
    const pos = d.axis === 'col' ? [x0(d.index) + S / 2, M + n * S + M / 2] : [M + n * S + M / 2, y0(d.index) + S / 2];
    parts.push(`<g transform="translate(${pos[0]} ${pos[1]})"><rect x="-22" y="-17" width="44" height="34" rx="10" fill="#59c3c3" stroke="${INK}" stroke-width="4"/><text y="9" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="22" fill="${INK}">D${i + 1}</text></g>`);
  });
  // tap targets
  for (let i = 0; i < n * n; i++) {
    parts.push(`<rect class="cell" data-cell="${i}" x="${x0(i % n)}" y="${y0(Math.floor(i / n))}" width="${S}" height="${S}" fill="transparent"/>`);
  }
  const defs = `<defs><pattern id="seen" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#ff5d73" opacity="0.12"/><rect width="8" height="22" fill="#e63946" opacity="0.45"/></pattern></defs>`;
  return `<svg class="board" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">${defs}${parts.join('')}</svg>`;
}

function renderGame() {
  const { puzzle, placement } = game;
  const wrong = game.checked ? falseStatements() : new Set();
  app.innerHTML = '';
  const top = el(`<div class="topbar"><button class="btn small ghost" data-act="home">Menu</button><h2>${esc(game.title)}</h2><button class="btn small ghost" data-act="rules">?</button></div>`);
  app.appendChild(top);

  const wrap = el(`<div class="board-wrap">${boardSvg()}</div>`);
  wrap.querySelector('svg').addEventListener('click', e => {
    const t = e.target.closest('[data-cell]');
    if (t) onCell(Number(t.dataset.cell));
  });
  app.appendChild(wrap);

  const tools = el(`<div class="toolbar">
    <button class="btn small ${game.mode === 'place' ? 'active' : ''}" data-act="place">Postaw</button>
    <button class="btn small ${game.mode === 'mark' ? 'active' : ''}" data-act="mark">Krzyżyk</button>
    <button class="btn small secondary" data-act="undo">Cofnij</button>
    <button class="btn small" data-act="check">Sprawdź</button>
  </div>`);
  app.appendChild(tools);

  const cards = el(`<div class="cards"></div>`);
  puzzle.heroes.forEach((hero, h) => {
    const own = puzzle.statements.filter(st => st.who === h);
    const lines = own.length
      ? own.map(st => `<p class="stmt ${wrong.has(st) ? 'bad' : ''}">„${esc(statementText(puzzle, st))}”</p>`).join('')
      : `<p class="stmt silent">Milczy.</p>`;
    const where = placement[h] >= 0 ? `<span class="where">pole ${coord(placement[h], puzzle.n)}</span>` : '';
    const card = el(`<div class="card ${h === game.selected ? 'selected' : ''} ${placement[h] >= 0 ? 'placed' : ''}">
      <div class="avatar" style="background:${color(hero)}">${esc(hero.name[0])}</div>
      <div class="body"><div class="hero-name">${esc(hero.name)}${where}</div>${lines}</div></div>`);
    card.onclick = () => { game.selected = h; game.mode = 'place'; renderGame(); };
    cards.appendChild(card);
  });
  const alarms = puzzle.statements.filter(st => st.type === 'alarm');
  const safe = shownSafe();
  const safeLines = alarms.map(st => `<p class="stmt ${wrong.has(st) ? 'bad' : ''}">${esc(statementText(puzzle, st))}</p>`).join('') +
    (safe < 0 ? `<p class="stmt silent">Pojawi się sam na jedynym wolnym polu, gdy ustawisz wszystkich.</p>` : '');
  const safeWhere = safe >= 0 ? `<span class="where">pole ${coord(safe, puzzle.n)}</span>` : '';
  cards.appendChild(el(`<div class="card safe ${safe >= 0 ? 'placed' : ''}">
    <div class="avatar safe-avatar">${icon('safe')}</div>
    <div class="body"><div class="hero-name">Sejf${safeWhere}</div>${safeLines}</div></div>`));
  game.flown.forEach((d, i) => {
    cards.appendChild(el(`<div class="card drone"><div class="avatar">D${i + 1}</div><div class="body"><div class="hero-name">Nagranie z drona</div><p class="stmt">${esc(droneText(puzzle, d))}</p></div></div>`));
  });
  app.appendChild(cards);

  const drones = droneCount();
  const extra = el(`<div class="toolbar" style="grid-template-columns:${drones ? '1.1fr 1fr 1fr 1fr' : '1.3fr 1fr 1fr'}">
    <button class="btn small ghost" data-act="sight">Wzrok: ${game.showSight ? 'wł.' : 'wył.'}</button>
    <button class="btn small secondary" data-act="hint">Podpowiedź</button>
    ${drones ? `<button class="btn small secondary" data-act="drone" ${game.flown.length >= drones ? 'disabled' : ''}>Dron (${drones - game.flown.length})</button>` : ''}
    <button class="btn small danger" data-act="clear">Wyczyść</button>
  </div>`);
  app.appendChild(extra);

  app.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => ({
      home: renderHome,
      rules: showRules,
      place: () => { game.mode = 'place'; renderGame(); },
      mark: () => { game.mode = 'mark'; renderGame(); },
      undo,
      check,
      hint,
      drone: sendDrone,
      sight: () => { game.showSight = !game.showSight; renderGame(); },
      clear: async () => { if (await ask('Wyczyścić planszę?', 'Wyczyść', 'Anuluj')) clearAll(); },
    })[b.dataset.act]();
  });
}

function showWin() {
  const { puzzle, placement } = game;
  const thief = puzzle.heroes[thiefOf(puzzle, placement)];
  const o = overlay(`<h2>Sprawa rozwiązana!</h2>
    <div class="avatar win-avatar" style="background:${color(thief)}">${esc(thief.name[0])}</div>
    <p style="text-align:center;font-size:20px;font-weight:800">Sejf stał na polu ${cellName(puzzle, safeOf(getBoard(puzzle), placement))}. ${thief.gender === 'f' ? 'Obrobiła' : 'Obrobił'} go <b>${esc(thief.name)}</b>!</p>
    <p style="text-align:center;font-weight:800">${game.hints ? `Podpowiedzi: ${game.hints}` : 'Bez żadnej podpowiedzi!'}</p>
    <div class="actions"><button class="btn ghost" data-a="stay">Zobacz planszę</button><button class="btn" data-a="home">Menu</button></div>`);
  o.querySelector('[data-a="stay"]').onclick = () => o.remove();
  o.querySelector('[data-a="home"]').onclick = () => { o.remove(); renderHome(); };
}

function icon(type) {
  return `<svg viewBox="0 0 100 100" width="36" height="36">${ART[type] || '<rect x="10" y="10" width="80" height="80" rx="8" fill="#ffe8a3" stroke="#1b1530" stroke-width="5"/>'}</svg>`;
}

function showRules() {
  const o = overlay(`<h2>Zasady</h2>
    <p><b>Cel:</b> ustal, gdzie stał każdy bohater. Sejf sam się wtedy znajdzie, a z nim złodziej.</p>
    <ul>
      <li>Każdy stał na innym wolnym polu: na ziemi, w krzakach albo na wyrzutni.</li>
      <li><b>Nikt nikogo nie widział:</b> w każdym rzędzie i każdej kolumnie stoi najwyżej jedna osoba. Nic nie zasłania widoku: ani przeszkody, ani granice stref.</li>
      <li><b>Sejf</b> stał na jedynym polu, którego rząd i kolumna są wolne od ludzi. To pole musi być gołą ziemią.</li>
      <li><b>Złodziej</b> to jedyna osoba stojąca po skosie przy sejfie, w tej samej strefie co sejf.</li>
      <li>„Obok” = tuż nad, pod, z lewej lub z prawej, w tej samej strefie.</li>
      <li>„Widziałem X” = w moim rzędzie albo kolumnie był X.</li>
      <li>„Gdzieś na północ od” = w dowolnym rzędzie wyżej (kolumna bez znaczenia).</li>
      <li>„Gdzieś na północ od sejfu” = w dowolnym rzędzie wyżej niż sejf.</li>
      <li>Alarm podaje strefę, w której stał sejf.</li>
      <li>Dron (od poziomu średniego) to dodatkowa podpowiedź: mówi, kto stał w jednym rzędzie albo kolumnie.</li>
      <li>Wszystkie zeznania są prawdziwe. Rozwiązanie jest dokładnie jedno i da się do niego dojść bez dronów.</li>
    </ul>
    <div class="legend">
      ${icon('bush')}<span>Krzaki: można stanąć</span>
      ${icon('pad')}<span>Wyrzutnia: można stanąć</span>
      ${icon('crate')}<span>Skrzynia: przeszkoda</span>
      ${icon('barrel')}<span>Beczka: przeszkoda</span>
      ${icon('rock')}<span>Skała: przeszkoda</span>
      ${icon('safe')}<span>Sejf: pojawia się sam, gdy ustawisz wszystkich</span>
    </div>
    <p><b>Sterowanie:</b> wybierz bohatera z listy i stuknij pole. Stuknij jeszcze raz, żeby zdjąć. Tryb „Krzyżyk” zaznacza pola wykluczone. Czerwone pola to rzędy i kolumny zajęte przez postawionych bohaterów: nie da się tam postawić nikogo innego.</p>
    <div class="actions"><button class="btn" data-a="ok">Gramy!</button></div>`);
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
}

function showTutorial() {
  const o = overlay(`<h2>Samouczek</h2>
    <p>Ktoś obrobił sejf. Na mapie stały 3 osoby, a Twoim zadaniem jest ustalić, kto gdzie stał.</p>
    <ul>
      <li><b>Nikt nikogo nie widział:</b> w każdym rzędzie i każdej kolumnie stoi najwyżej jedna osoba. Nic nie zasłania widoku.</li>
      <li><b>Sejf jest ukryty:</b> stał na jedynym polu, którego rząd i kolumna zostały wolne. Zawsze na gołej ziemi. Pojawi się sam, gdy ustawisz wszystkich.</li>
      <li>Złodziej to jedyna osoba stojąca po skosie przy sejfie, w tej samej strefie.</li>
      <li>Każde zeznanie jest prawdziwe. Zacznij od Bobo: stał na wyrzutni, a wyrzutnia jest tylko jedna.</li>
      <li>Nie wiesz, co dalej? Stuknij „Podpowiedź”: zobaczysz tok rozumowania krok po kroku.</li>
    </ul>
    <div class="actions"><button class="btn ghost" data-a="rules">Pełne zasady</button><button class="btn" data-a="ok">Zaczynam!</button></div>`);
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
  o.querySelector('[data-a="rules"]').onclick = () => { o.remove(); showRules(); };
}

renderHome();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
