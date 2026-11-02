// Mobile UI: mission list, board (SVG), hero cards, placement and checking. Logic lives in ../src.
import { getBoard, safeOf, isPlain } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, unaryParts, unaryHolds, UNARY, PAIR, COMPOSITE } from '../src/statements.js';
import { statementText, stepText, cellName, droneText, areaWords, SETTINGS, TYPE_TEXT } from '../src/text.js';
import { nextHint, nextDrone } from '../src/steps.js';
import { DIFFICULTIES } from '../src/generator.js';

// Fixed missions are frozen JSON (scripts/freeze-missions.js), so generator changes never alter them.
const MISSIONS = [
  { id: 'misja-1', difficulty: 'easy', title: 'Pierwszy skok' },
  { id: 'misja-2', difficulty: 'medium', title: 'Nocna wizyta' },
];
const DIFF_LABEL = { easy: 'Łatwa', medium: 'Średnia', hard: 'Trudna', expert: 'Ekspert' };
const HERO_COLORS = {
  Bobo: '#ff8c42', Mira: '#ff5d9e', Zyg: '#4cc9f0', Kora: '#9b5de5',
  Rufi: '#e63946', Tesa: '#06d6a0', Grot: '#8d6e63', Lumi: '#f4b400',
};
// Floors per zone kind: wooden / tiled rooms, grass outdoors.
const FLOOR_TINTS = { in: ['#f3d9b1', '#dfe9f2', '#f6e3c4', '#efd9e3', '#e7dcc7', '#e2efd9', '#f1d3b6', '#e8e1f3'], out: ['#b9e39b', '#a7d98a', '#c6eaa3', '#b1df98'] };
const INK = '#1b1530';
const S = 100;
const M = 44;

const app = document.getElementById('app');
let game = null;

// ---------- storage ----------
// v4 (houses, map clues) uses its own namespace: progress and cases saved by v1–v3 no longer fit and are removed.
const NS = 'ktozwinal4';
for (const k of Object.keys(localStorage)) if (/^ktozwinal[23]?:/.test(k)) localStorage.removeItem(k);
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
  setTimeout(() => t.remove(), Math.max(2600, text.length * 45));
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

// Whether a statement is already false for good, whatever the unplaced heroes do.
function brokenNow(st) {
  const { puzzle, placement: p } = game;
  // A composite statement is one unary part per hero: any placed hero who breaks their part breaks it, even
  // before the subject is placed (another hero already on the only armchair).
  if (COMPOSITE.has(st.type)) {
    const board = getBoard(puzzle);
    return unaryParts(st, p.length).some(part => part.st && p[part.hero] >= 0 && !unaryHolds(board, part.st, p[part.hero]));
  }
  if (UNARY.has(st.type)) return p[st.who] >= 0 && !evaluate(puzzle, p, st);
  if (PAIR.has(st.type)) return p[st.who] >= 0 && p[st.hero] >= 0 && !evaluate(puzzle, p, st);
  if (p.every(c => c >= 0)) return !evaluate(puzzle, p, st);
  // `alone` / `zoneCount`: more heroes already in the subject's zone than the statement allows.
  if (p[st.who] < 0) return false;
  const board = getBoard(puzzle);
  const inZone = p.filter(c => c >= 0 && board.zone[c] === board.zone[p[st.who]]).length;
  return inZone > (st.type === 'alone' ? 1 : st.n);
}

function falseStatements() {
  return new Set(game.puzzle.statements.filter(brokenNow));
}

function check() {
  game.checked = true;
  const problems = [];
  if (conflicts().size) problems.push('ktoś stoi w jednym rzędzie albo kolumnie z kimś');
  const safe = shownSafe();
  if (safe >= 0) {
    const board = getBoard(game.puzzle);
    const thieves = game.placement.filter(c => board.thiefSpots[safe].includes(c)).length;
    const noun = areaWords(game.puzzle).noun;
    const plain = game.puzzle.setting === 'park' ? 'na trawie' : 'na gołej podłodze albo na trawie';
    if (!isPlain(board.type[safe])) problems.push(`sejf musi stać ${plain}, a ostatnie wolne pole to ${TYPE_TEXT[board.type[safe]].name.toLowerCase()}`);
    else if (thieves > 1) problems.push(`po skosie przy sejfie, w jego ${noun}, stoi więcej niż jedna osoba`);
    else if (thieves === 0) problems.push(`nikt nie stoi po skosie przy sejfie w jego ${noun}`);
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
  // the hero whose move is undone becomes the selected one again (unchanged when only marks are undone)
  const moved = last.placement.findIndex((c, h) => c !== game.placement[h]);
  if (moved >= 0) game.selected = moved;
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
  bed: `<rect x="10" y="6" width="80" height="88" rx="10" fill="#f7f3ea" stroke="${INK}" stroke-width="5"/><rect x="18" y="12" width="64" height="20" rx="8" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M10 40 H90 V84 a10 10 0 0 1 -10 10 H20 a10 10 0 0 1 -10 -10 Z" fill="#6c8cff" stroke="${INK}" stroke-width="5"/><path d="M10 52 H90" stroke="#4a63c9" stroke-width="4"/>`,
  armchair: `<rect x="12" y="8" width="76" height="34" rx="12" fill="#e0565b" stroke="${INK}" stroke-width="5"/><rect x="6" y="30" width="20" height="58" rx="9" fill="#c94347" stroke="${INK}" stroke-width="5"/><rect x="74" y="30" width="20" height="58" rx="9" fill="#c94347" stroke="${INK}" stroke-width="5"/><rect x="24" y="38" width="52" height="50" rx="8" fill="#ef7a7e" stroke="${INK}" stroke-width="4"/>`,
  rug: `<rect x="8" y="14" width="84" height="72" rx="6" fill="#c75b7a" stroke="${INK}" stroke-width="5"/><rect x="18" y="24" width="64" height="52" rx="4" fill="none" stroke="#ffd166" stroke-width="4"/><path d="M50 30 L66 50 L50 70 L34 50 Z" fill="none" stroke="#ffd166" stroke-width="4"/><path d="M14 10 v-4 M26 10 v-4 M38 10 v-4 M50 10 v-4 M62 10 v-4 M74 10 v-4 M86 10 v-4 M14 90 v4 M26 90 v4 M38 90 v4 M50 90 v4 M62 90 v4 M74 90 v4 M86 90 v4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  table: `<rect x="10" y="18" width="80" height="64" rx="10" fill="#b5763c" stroke="${INK}" stroke-width="6"/><rect x="20" y="28" width="60" height="44" rx="6" fill="#f4f1e8" stroke="#8a5420" stroke-width="3"/><circle cx="50" cy="50" r="9" fill="#ffcf5c" stroke="${INK}" stroke-width="3"/>`,
  wardrobe: `<rect x="14" y="6" width="72" height="88" rx="6" fill="#8d5a34" stroke="${INK}" stroke-width="6"/><path d="M50 10 V90" stroke="${INK}" stroke-width="4"/><circle cx="43" cy="52" r="4" fill="#ffd166" stroke="${INK}" stroke-width="2"/><circle cx="57" cy="52" r="4" fill="#ffd166" stroke="${INK}" stroke-width="2"/><path d="M22 16 H42 M58 16 H78" stroke="#b07a4c" stroke-width="4"/>`,
  plant: `<path d="M50 56 C30 50 20 30 26 14 C40 22 48 36 50 56 C52 36 60 22 74 14 C80 30 70 50 50 56 Z" fill="#3fae5a" stroke="#1e6b34" stroke-width="4"/><path d="M50 56 C44 40 46 24 50 10 C54 24 56 40 50 56 Z" fill="#5ccf74" stroke="#1e6b34" stroke-width="3"/><path d="M30 56 H70 L64 90 H36 Z" fill="#d9734e" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
  bush: `<circle cx="32" cy="62" r="20" fill="#47b862" stroke="#1e6b34" stroke-width="4"/><circle cx="68" cy="62" r="20" fill="#47b862" stroke="#1e6b34" stroke-width="4"/><circle cx="50" cy="42" r="22" fill="#5ccf74" stroke="#1e6b34" stroke-width="4"/><circle cx="38" cy="38" r="3" fill="#ff5d73"/><circle cx="64" cy="58" r="3" fill="#ff5d73"/>`,
  bench: `<path d="M16 62 V86 M84 62 V86" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><rect x="6" y="14" width="88" height="14" rx="5" fill="#c98a4b" stroke="${INK}" stroke-width="4"/><rect x="6" y="34" width="88" height="14" rx="5" fill="#c98a4b" stroke="${INK}" stroke-width="4"/><rect x="6" y="54" width="88" height="14" rx="5" fill="#d99b5c" stroke="${INK}" stroke-width="4"/>`,
  tree: `<rect x="42" y="58" width="16" height="34" rx="4" fill="#8d5a34" stroke="${INK}" stroke-width="5"/><circle cx="50" cy="40" r="32" fill="#2f9e4f" stroke="#1b5e2f" stroke-width="5"/><circle cx="38" cy="32" r="10" fill="#4fc06a"/><circle cx="62" cy="46" r="7" fill="#4fc06a"/>`,
  rock: `<path d="M16 76 L26 38 L50 18 L78 28 L88 68 L66 88 L30 88 Z" fill="#9aa3ad" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M34 40 L50 28 L66 34" fill="none" stroke="#d3d8de" stroke-width="5" stroke-linecap="round"/>`,
  pond: `<ellipse cx="50" cy="52" rx="42" ry="34" fill="#4cb3e6" stroke="${INK}" stroke-width="6"/><path d="M28 46 q8 -6 16 0 M54 62 q8 -6 16 0" stroke="#bfe9ff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="66" cy="40" r="8" fill="#5ccf74" stroke="#1e6b34" stroke-width="3"/>`,
  safe: `<rect x="6" y="6" width="88" height="88" rx="14" fill="none" stroke="#ffc531" stroke-width="5" stroke-dasharray="10 7"/><rect x="14" y="14" width="72" height="72" rx="10" fill="#4f5d75" stroke="${INK}" stroke-width="6"/><circle cx="50" cy="50" r="17" fill="#ffc531" stroke="${INK}" stroke-width="5"/><path d="M50 37 V50 H60" stroke="${INK}" stroke-width="4" fill="none"/>`,
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

  // floor per zone: planks indoors, grass tufts outdoors
  const kindOf = i => puzzle.zoneKinds[board.zone[i]];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    const tints = FLOOR_TINTS[kindOf(i)];
    const tint = tints[board.zone[i] % tints.length];
    parts.push(`<rect x="${x0(c)}" y="${y0(r)}" width="${S}" height="${S}" fill="${tint}"/>`);
    if (kindOf(i) === 'in') {
      const shift = (r % 2) * 50;
      parts.push(`<path d="M${x0(c)} ${y0(r) + 25} h${S} M${x0(c)} ${y0(r) + 50} h${S} M${x0(c)} ${y0(r) + 75} h${S} M${x0(c) + 30 + shift / 2} ${y0(r)} v25 M${x0(c) + 70 - shift / 3} ${y0(r) + 50} v25" stroke="#7a5230" stroke-opacity="0.13" stroke-width="2"/>`);
    } else if ((r * 7 + c * 3) % 3 === 0) {
      parts.push(`<path d="M${x0(c) + 18} ${y0(r) + 82} l4 -10 l4 10 M${x0(c) + 74} ${y0(r) + 24} l4 -10 l4 10" stroke="#3f8a35" stroke-opacity="0.45" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    }
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
  // zone borders: walls next to a room, hedges between two outdoor zones (neither blocks sight)
  const walls = [], hedges = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    const border = (j, seg) => {
      if (board.zone[i] === board.zone[j]) return;
      (kindOf(i) === 'out' && kindOf(j) === 'out' ? hedges : walls).push(seg);
    };
    if (c + 1 < n) border(i + 1, `M${x0(c + 1)} ${y0(r)} V${y0(r + 1)}`);
    if (r + 1 < n) border(i + n, `M${x0(c)} ${y0(r + 1)} H${x0(c + 1)}`);
  }
  if (walls.length) {
    parts.push(`<g clip-path="url(#inside)"><path d="${walls.join(' ')}" stroke="${INK}" stroke-width="14" stroke-linecap="square"/>` +
      `<path d="${walls.join(' ')}" stroke="#a88b6a" stroke-width="6" stroke-linecap="square"/></g>`);
  }
  if (hedges.length) {
    parts.push(`<g clip-path="url(#inside)"><path d="${hedges.join(' ')}" stroke="#2f6b2a" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="${hedges.join(' ')}" stroke="#5cb84f" stroke-width="6" stroke-dasharray="10 8" stroke-linecap="round"/></g>`);
  }
  // objects of the map
  for (let i = 0; i < n * n; i++) {
    const art = ART[board.type[i]];
    if (art) parts.push(`<g transform="translate(${x0(i % n)} ${y0(Math.floor(i / n))})">${art}</g>`);
  }
  // Zone names on the longest run of plain cells in a row of each zone (first such run), so a pill wide enough
  // to read on an 8×8 phone board covers no furniture and no other zone; heroes, the safe and marks draw over it.
  board.zoneCells.forEach((cells, z) => {
    let i = cells[0], run = 0;
    for (const j of cells) {
      if (!isPlain(board.type[j]) || (j % n && board.zone[j - 1] === z && isPlain(board.type[j - 1]))) continue;
      let len = 1;
      while ((j + len) % n && board.zone[j + len] === z && isPlain(board.type[j + len])) len++;
      if (len > run) { i = j; run = len; }
    }
    const room = Math.max(run, 1) * S - 8;
    // Two-word names take two lines when one does not fit; a name still too wide is squeezed.
    const label = puzzle.zoneNames[z];
    const CHAR = 0.69; // average glyph width of Nunito 800, in font sizes
    const lines = label.length * 20 * CHAR + 12 > room && label.includes(' ') ? label.split(' ') : [label];
    const longest = Math.max(...lines.map(l => l.length));
    const fs = Math.max(13, Math.min(20, (room - 12) / (longest * CHAR)));
    const w = Math.min(longest * fs * CHAR + 12, room);
    const lh = fs + 2;
    const text = lines.map((l, j) => `<text x="${w / 2}" y="${4 + fs * 0.95 + j * lh}" text-anchor="middle"${l.length * fs * CHAR + 12 > w ? ` textLength="${w - 12}" lengthAdjust="spacingAndGlyphs"` : ''} font-family="Nunito, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}" fill="${INK}">${esc(l)}</text>`).join('');
    parts.push(`<g transform="translate(${x0(i % n) + 4} ${y0(Math.floor(i / n)) + 4})"><rect width="${w.toFixed(1)}" height="${(8 + lines.length * lh).toFixed(1)}" rx="11" fill="#fff" stroke="${INK}" stroke-width="3"/>${text}</g>`);
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
  const defs = `<defs><clipPath id="inside"><rect x="${M}" y="${M}" width="${n * S}" height="${n * S}"/></clipPath><pattern id="seen" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#ff5d73" opacity="0.12"/><rect width="8" height="22" fill="#e63946" opacity="0.45"/></pattern></defs>`;
  return `<svg class="board" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">${defs}${parts.join('')}</svg>`;
}

function renderGame() {
  const { puzzle, placement } = game;
  const wrong = game.checked ? falseStatements() : new Set();
  app.innerHTML = '';
  const top = el(`<div class="topbar"><button class="btn small ghost" data-act="home">Menu</button><h2>${esc(game.title)}</h2><button class="btn small ghost" data-act="rules">?</button></div>`);
  app.appendChild(top);

  app.appendChild(el(`<p class="scene">${esc(SETTINGS[puzzle.setting].title)} · ${esc(puzzle.zoneNames.join(', '))}</p>`));
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
  const shared = puzzle.statements.filter(st => st.who === undefined);
  if (shared.length) {
    cards.appendChild(el(`<div class="card shared"><div class="avatar">!</div><div class="body"><div class="hero-name">Wszyscy zgodnie</div>${shared.map(st => `<p class="stmt ${wrong.has(st) ? 'bad' : ''}">„${esc(statementText(puzzle, st))}”</p>`).join('')}</div></div>`));
  }
  const safe = shownSafe();
  const safeLines = safe < 0 ? `<p class="stmt silent">Pojawi się sam na jedynym wolnym polu, gdy ustawisz wszystkich.</p>` : '';
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
    <p><b>Cel:</b> ustal, gdzie był każdy bohater. Sejf sam się wtedy znajdzie, a z nim złodziej.</p>
    <ul>
      <li>Każda sprawa dzieje się w innym domu, czasem z ogrodem, albo w parku. Mapa dzieli się na pomieszczenia; ogród, taras czy las przy domu to osobna część posesji (w parku: części parku).</li>
      <li>Każdy był na innym polu: na podłodze, na łóżku (leżał), na fotelu (siedział), na dywanie, na trawie, w krzakach albo na ławce (siedział). Na stole, szafie, kwiatku, drzewie, skale i stawie nikt nie stał.</li>
      <li><b>Nikt nikogo nie widział:</b> w każdym rzędzie i każdej kolumnie stoi najwyżej jedna osoba. Nic nie zasłania widoku: ani meble, ani ściany.</li>
      <li><b>Sejf</b> stał na jedynym polu, którego rząd i kolumna są wolne od ludzi. To pole to goła podłoga albo trawa.</li>
      <li><b>Złodziej</b> to jedyna osoba stojąca po skosie przy sejfie, w tej samej części mapy co sejf (pomieszczeniu, ogrodzie, części parku).</li>
      <li>„Obok” = tuż nad, pod, z lewej lub z prawej, w tej samej części mapy.</li>
      <li>„Jako jedyny siedziałem na fotelu” = siedział na fotelu, a nikt inny nie siedział na żadnym fotelu. „Jako jedyna byłam w kuchni” = w kuchni nie było nikogo innego.</li>
      <li>„Wszyscy zgodnie: nikt nie leżał na łóżku” = żadne łóżko nie było zajęte.</li>
      <li>„Gdzieś na północ od” = w dowolnym rzędzie wyżej (kolumna bez znaczenia).</li>
      <li>Dron (od poziomu średniego) to dodatkowa podpowiedź: mówi, kto stał w jednym rzędzie albo kolumnie.</li>
      <li>Wszystkie zeznania są prawdziwe. Rozwiązanie jest dokładnie jedno i da się do niego dojść bez dronów.</li>
    </ul>
    <div class="legend">
      ${icon('bed')}<span>Łóżko: można leżeć</span>
      ${icon('armchair')}<span>Fotel: można siedzieć</span>
      ${icon('rug')}<span>Dywan: można stać</span>
      ${icon('bush')}<span>Krzaki: można stać</span>
      ${icon('bench')}<span>Ławka: można siedzieć</span>
      ${icon('table')}<span>Stół: przeszkoda</span>
      ${icon('wardrobe')}<span>Szafa: przeszkoda</span>
      ${icon('plant')}<span>Kwiatek: przeszkoda</span>
      ${icon('tree')}<span>Drzewo: przeszkoda</span>
      ${icon('rock')}<span>Skała: przeszkoda</span>
      ${icon('pond')}<span>Staw: przeszkoda</span>
      ${icon('safe')}<span>Sejf: pojawia się sam, gdy ustawisz wszystkich</span>
    </div>
    <p><b>Sterowanie:</b> wybierz bohatera z listy i stuknij pole. Stuknij jeszcze raz, żeby zdjąć. Tryb „Krzyżyk” zaznacza pola wykluczone. Czerwone pola to rzędy i kolumny zajęte przez postawionych bohaterów: nie da się tam postawić nikogo innego.</p>
    <div class="actions"><button class="btn" data-a="ok">Gramy!</button></div>`);
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
}

function showTutorial() {
  const o = overlay(`<h2>Samouczek</h2>
    <p>Ktoś obrobił sejf w domku letniskowym. Były tam 3 osoby, a Twoim zadaniem jest ustalić, kto gdzie był.</p>
    <ul>
      <li><b>Nikt nikogo nie widział:</b> w każdym rzędzie i każdej kolumnie stoi najwyżej jedna osoba. Nic nie zasłania widoku.</li>
      <li><b>Sejf jest ukryty:</b> stał na jedynym polu, którego rząd i kolumna zostały wolne. Zawsze na gołej podłodze. Pojawi się sam, gdy ustawisz wszystkich.</li>
      <li>Złodziej to jedyna osoba stojąca po skosie przy sejfie, w tym samym pomieszczeniu.</li>
      <li>Każde zeznanie jest prawdziwe. Zacznij od Zyga: leżał na łóżku, a łóżko jest tylko jedno.</li>
      <li>Nie wiesz, co dalej? Stuknij „Podpowiedź”: zobaczysz tok rozumowania krok po kroku.</li>
    </ul>
    <div class="actions"><button class="btn ghost" data-a="rules">Pełne zasady</button><button class="btn" data-a="ok">Zaczynam!</button></div>`);
  o.querySelector('[data-a="ok"]').onclick = () => o.remove();
  o.querySelector('[data-a="rules"]').onclick = () => { o.remove(); showRules(); };
}

renderHome();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
