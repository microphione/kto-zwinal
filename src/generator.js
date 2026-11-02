// Procedural boards and puzzles satisfying RULES.md Q1–Q5 (Q3 via the step solver, src/steps.js).
import { createRng } from './rng.js';
import { getBoard, safeOf, isPlain, CELL_TYPES } from './board.js';
import { trueStatements, isValidPlacement, thiefOf, evaluate } from './statements.js';
import { solve } from './solver.js';
import { stepSolve } from './steps.js';
import { HERO_ROSTER, SETTINGS, ZONES } from './text.js';

export const PUZZLE_VERSION = 4;

// heroes = n − 1 (RULES.md §2). drones: drone hints the player may send (RULES.md §7, not statements).
// maxLevel: hardest step-solver technique allowed (3 = one refuted assumption, hard and expert only).
export const DIFFICULTIES = {
  easy: { n: 5, heroes: 4, zones: 3, drones: 0, obstacles: 0.16, maxLevel: 2 },
  medium: { n: 6, heroes: 5, zones: 4, drones: 1, obstacles: 0.17, maxLevel: 2 },
  hard: { n: 7, heroes: 6, zones: 5, drones: 2, obstacles: 0.18, maxLevel: 3 },
  expert: { n: 8, heroes: 7, zones: 6, drones: 2, obstacles: 0.18, maxLevel: 3 },
};

const MAX_PER_HERO = 2;
const SAMPLE_RUNS = 24;
// Node budgets keep every attempt bounded; an attempt that cannot finish a proof within
// PROOF_NODES is abandoned and the generator moves on to the next board (still deterministic).
const SAMPLE_NODES = 20000;
const PROOF_NODES = 400000;

// Relative preference: clues about the map (furniture, zones) over hero-relative ones and raw coordinates.
// The negative forms cut few placements, so they need a fair weight to appear at all.
const WEIGHT = {
  inZone: 1.1, notInZone: 1.5, aloneIn: 1.5, on: 1.4, notOn: 2.5, onlyOn: 1.6, nobodyOn: 1.3,
  nextTo: 1.2, notNextTo: 1, row: 0.3, col: 0.3,
  northOf: 0.5, southOf: 0.5, westOf: 0.5, eastOf: 0.5, sameZone: 0.6, otherZone: 0.9,
  alone: 0.7, zoneCount: 0.5,
};
// Zone clues cut few placements each; without this the greedy pick and Q2 would almost never keep them.
const DIVERSITY = 0.8;

// Clue kinds; directions count as one kind, so do zone population clues.
export const FAMILY = {
  inZone: 'zone', notInZone: 'zone', on: 'cell', notOn: 'cell', onlyOn: 'only', aloneIn: 'only', nobodyOn: 'nobody',
  nextTo: 'next', notNextTo: 'next', row: 'line', col: 'line', northOf: 'dir', southOf: 'dir', westOf: 'dir', eastOf: 'dir',
  sameZone: 'pair', otherZone: 'pair', alone: 'count', zoneCount: 'count',
};
const familyCount = (list, type) => list.filter(x => FAMILY[x.type] === FAMILY[type]).length;
// Each repeat of a kind lowers its score, so one puzzle mixes many clue kinds.
const novelty = (chosen, st) => 1 / (1 + DIVERSITY * familyCount(chosen, st.type));

function growZones(rng, n, count) {
  const zones = new Array(n * n).fill(-1);
  const sizes = [];
  for (const [z, cell] of rng.shuffle([...Array(n * n).keys()]).slice(0, count).entries()) {
    zones[cell] = z;
    sizes.push(1);
  }
  const freeNeighbours = z => {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      if (zones[i] !== z) continue;
      const r = Math.floor(i / n), c = i % n;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < n && nc < n && zones[nr * n + nc] < 0) out.push(nr * n + nc);
      }
    }
    return out;
  };
  let left = n * n - count;
  while (left > 0) {
    // Grow the smallest zone that still can, which keeps sizes balanced.
    const order = rng.shuffle([...Array(count).keys()]).sort((a, b) => sizes[a] - sizes[b]);
    for (const z of order) {
      const free = freeNeighbours(z);
      if (free.length === 0) continue;
      zones[rng.pick(free)] = z;
      sizes[z]++;
      left--;
      break;
    }
  }
  return zones;
}

const typesOf = (kind, walk) => Object.keys(CELL_TYPES).filter(t => CELL_TYPES[t].kind === kind && !CELL_TYPES[t].plain && !!CELL_TYPES[t].walk === walk);
const PALETTE = {
  in: { plain: 'floor', obstacles: typesOf('in', false), special: typesOf('in', true) },
  out: { plain: 'grass', obstacles: typesOf('out', false), special: typesOf('out', true) },
};
const SPECIAL_SHARE = 0.2;
const FAVOUR = 0.5;

// Setting, zone names and kinds (RULES.md §6 conventions): a house has at most one outdoor zone, the park only
// outdoor zones.
function pickZones(rng, count) {
  const id = rng.pick(Object.keys(SETTINGS));
  const { rooms, areas } = SETTINGS[id];
  const outdoor = rooms.length === 0 ? count : areas.length && rng.next() < 0.5 ? 1 : 0;
  const names = [...rng.shuffle(rooms).slice(0, count - outdoor), ...rng.shuffle(areas).slice(0, outdoor)];
  return { setting: id, zoneNames: names, zoneKinds: names.map(name => (rooms.includes(name) ? 'in' : 'out')) };
}

// A type from `list`, often one the zone favours (bedroom → bed, kitchen → table).
function pickType(rng, list, favoured) {
  const liked = list.filter(t => favoured.includes(t));
  return liked.length && rng.next() < FAVOUR ? rng.pick(liked) : rng.pick(list);
}

export function generateBoard(rng, cfg) {
  const { n } = cfg;
  for (;;) {
    const zones = growZones(rng, n, cfg.zones);
    const { setting, zoneNames, zoneKinds } = pickZones(rng, cfg.zones);
    const palette = i => PALETTE[zoneKinds[zones[i]]];
    const favoured = i => ZONES[zoneNames[zones[i]]].slice(1);
    const types = Array.from({ length: n * n }, (_, i) => palette(i).plain);
    const cells = rng.shuffle([...Array(n * n).keys()]);
    const obstacles = Math.round(n * n * cfg.obstacles);
    for (const cell of cells.slice(0, obstacles)) types[cell] = pickType(rng, palette(cell).obstacles, favoured(cell));
    const free = cells.slice(obstacles);
    for (const cell of free.slice(0, Math.round(free.length * SPECIAL_SHARE))) types[cell] = pickType(rng, palette(cell).special, favoured(cell));

    const rows = arr => Array.from({ length: n }, (_, r) => arr.slice(r * n, r * n + n));
    const puzzle = { n, setting, cells: rows(types), zones: rows(zones), zoneNames, zoneKinds };
    const board = getBoard(puzzle);
    // Zones keep 3 walkable cells, so the safe on one of them still leaves the zone a place to stand, and one
    // plain cell, where the UI writes the zone name without hiding an object.
    if (board.zoneCells.every(list => list.filter(cell => board.walk[cell]).length >= 3 && list.some(cell => isPlain(board.type[cell])))) return puzzle;
  }
}

const PLACE_TRIES = 200;
// Random N pieces, one per row and column, on walkable cells; one of them is the safe (plain, at least 2
// thief spots) and exactly one hero stands on a thief spot (R0–R2). Returns the hero placement or null.
export function placeHeroes(rng, puzzle) {
  const board = getBoard(puzzle);
  const { n } = board;
  for (let i = 0; i < PLACE_TRIES; i++) {
    const cols = rng.shuffle([...Array(n).keys()]);
    const cells = cols.map((c, r) => r * n + c);
    if (!cells.every(cell => board.walk[cell])) continue;
    for (const safe of rng.shuffle(cells)) {
      const spots = board.thiefSpots[safe];
      if (!isPlain(board.type[safe]) || spots.length < 2) continue;
      const placement = cells.filter(cell => cell !== safe);
      if (placement.filter(cell => spots.includes(cell)).length === 1) return rng.shuffle(placement);
    }
  }
  return null;
}

// The subject's own type / zone when the statement fixes it.
const ownType = x => (x.type === 'on' || x.type === 'onlyOn' ? x.cellType : null);
const ownZone = x => (x.type === 'inZone' || x.type === 'aloneIn' ? x.zone : null);
// One statement of the same subject implies the other (RULES.md §6 conventions).
function implies(a, b) {
  if (ownType(a) && (ownType(b) || b.type === 'notOn')) return true;
  if (ownZone(a) !== null && (ownZone(b) !== null || b.type === 'notInZone')) return true;
  return a.type === 'aloneIn' && b.type === 'alone';
}

function allowed(chosen, st) {
  if (st.type === 'nobodyOn') return !chosen.some(x => x.type === 'nobodyOn' || (x.type === 'notOn' && x.cellType === st.cellType));
  if (st.type === 'notOn' && chosen.some(x => x.type === 'nobodyOn' && x.cellType === st.cellType)) return false;
  const own = chosen.filter(x => x.who === st.who);
  if (own.length >= MAX_PER_HERO) return false;
  if (own.some(x => implies(x, st) || implies(st, x))) return false;
  if ((st.type === 'sameZone' || st.type === 'otherZone') && chosen.some(x => x.type === st.type && x.who === st.hero && x.hero === st.who)) return false;
  return true;
}

const solutionKey = placement => placement.join();
const holds = (puzzle, placement, st) => evaluate(puzzle, placement, st);

// Solutions (placements) other than the hidden one, found by budgeted randomised searches. Returns [] only
// when a complete (non-aborted) search proved the solution unique, null when no proof fits the budget.
function sampleOthers(puzzle, statements, rng) {
  const truth = solutionKey(puzzle.solution);
  const found = new Map();
  for (let i = 0; i < SAMPLE_RUNS; i++) {
    const { solutions, aborted } = solve({ ...puzzle, statements }, 2, rng, SAMPLE_NODES);
    for (const s of solutions) if (solutionKey(s) !== truth) found.set(solutionKey(s), s);
    if (found.size === 0 && !aborted) return [];
  }
  if (found.size > 0) return [...found.values()];
  const exact = solve({ ...puzzle, statements }, 2, null, PROOF_NODES);
  if (exact.aborted) return null;
  return exact.solutions.filter(s => solutionKey(s) !== truth);
}

// true / false when proven within the budget, null otherwise.
function provenUnique(puzzle, statements) {
  const { solutions, aborted } = solve({ ...puzzle, statements }, 2, null, PROOF_NODES);
  return aborted ? null : solutions.length === 1;
}

// `diverse = false` drops the clue-kind novelty: weak kinds can fill the Q4 slots (2 per hero) before the
// solution is unique; the same board is then retried without it instead of being thrown away.
export function selectStatements(rng, puzzle, diverse = true) {
  const candidates = trueStatements(puzzle, puzzle.solution);
  let chosen = [];
  let sample = sampleOthers(puzzle, chosen, rng);
  if (!sample) return null;
  while (sample.length > 0) {
    let best = null;
    for (const st of candidates) {
      if (chosen.includes(st) || !allowed(chosen, st)) continue;
      const cut = sample.filter(s => !holds(puzzle, s, st)).length;
      if (cut === 0) continue;
      const score = (cut / sample.length) * WEIGHT[st.type] * (diverse ? novelty(chosen, st) : 1) * (0.5 + rng.next());
      if (!best || score > best.score) best = { st, score };
    }
    if (!best) return null;
    chosen.push(best.st);
    sample = sample.filter(s => holds(puzzle, s, best.st));
    if (sample.length < SAMPLE_RUNS / 3) {
      const keys = new Set(sample.map(solutionKey));
      const more = sampleOthers(puzzle, chosen, rng);
      if (!more) return null;
      for (const s of more) if (!keys.has(solutionKey(s))) sample.push(s);
    }
  }
  // Q2: drop every statement that is not needed, trying the most repeated types first, then the least preferred.
  const repeats = st => familyCount(chosen, st.type);
  for (const st of [...chosen].sort((a, b) => repeats(b) - repeats(a) || WEIGHT[a.type] - WEIGHT[b.type])) {
    const rest = chosen.filter(x => x !== st);
    const unique = provenUnique(puzzle, rest);
    if (unique === null) return null;
    if (unique) chosen = rest;
  }
  return provenUnique(puzzle, chosen) ? chosen : null;
}

function statementOrder(a, b) {
  const wa = a.who ?? 99, wb = b.who ?? 99;
  return wa - wb;
}

export function generatePuzzle(seed, difficulty = 'easy') {
  const cfg = DIFFICULTIES[difficulty];
  const rng = createRng(`${seed}|${difficulty}`);
  for (;;) {
    const base = generateBoard(rng, cfg);
    const placement = placeHeroes(rng, base);
    if (!placement) continue;
    const safe = safeOf(getBoard(base), placement);
    const heroes = rng.shuffle(HERO_ROSTER).slice(0, cfg.heroes).map(h => ({ ...h }));
    const puzzle = { version: PUZZLE_VERSION, seed: String(seed), difficulty, ...base, heroes, statements: [], safe, solution: placement };
    if (!isValidPlacement(puzzle, placement)) throw new Error('generator produced an invalid placement');
    const statements = selectStatements(rng, puzzle) ?? selectStatements(rng, puzzle, false);
    if (!statements) continue;
    puzzle.statements = statements.sort(statementOrder);
    // Q3: the step solver must reach the solution with the techniques allowed for this difficulty.
    const graded = stepSolve(puzzle, { maxLevel: cfg.maxLevel });
    if (!graded.solved) continue;
    if (graded.safe !== safe || graded.placement.join() !== placement.join()) throw new Error('step solver disagrees with the unique solution');
    puzzle.thief = thiefOf(puzzle, placement);
    puzzle.grade = { level: graded.level, steps: graded.steps.length };
    return puzzle;
  }
}
