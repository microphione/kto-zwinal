// Procedural boards and puzzles satisfying RULES.md Q1–Q5 (Q3 via the step solver, src/steps.js).
import { createRng } from './rng.js';
import { getBoard, withSafe, OBSTACLE_TYPES } from './board.js';
import { trueStatements, isValidPlacement, thiefOf, evaluate } from './statements.js';
import { solveHidden } from './solver.js';
import { stepSolve } from './steps.js';
import { HERO_ROSTER, ZONE_NAMES } from './text.js';

export const PUZZLE_VERSION = 2;

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

// Relative preference: qualitative clues over raw coordinates. The negative forms cut few placements,
// so they get a higher weight to appear at all (the design table lists them as clue kinds).
const WEIGHT = {
  inZone: 1, notInZone: 1.2, on: 1.2, nextTo: 1, notNextTo: 1, sees: 1, row: 0.3, col: 0.3,
  northOf: 0.8, southOf: 0.8, westOf: 0.8, eastOf: 0.8, sameZone: 0.7, otherZone: 1.2,
  alone: 0.8, zoneCount: 0.6, drone: 1,
  northOfSafe: 0.8, southOfSafe: 0.8, westOfSafe: 0.8, eastOfSafe: 0.8, sameZoneSafe: 0.9, otherZoneSafe: 1.1,
  alarm: 0.6,
};
// Zone clues cut few placements each; without this the greedy pick and Q2 would almost never keep them.
const DIVERSITY = 0.8;

// Clue kinds of the design table; directions count as one kind, so do zone population clues.
export const FAMILY = {
  inZone: 'zone', notInZone: 'zone', on: 'cell', nextTo: 'next', notNextTo: 'next', sees: 'sees',
  row: 'line', col: 'line', northOf: 'dir', southOf: 'dir', westOf: 'dir', eastOf: 'dir',
  sameZone: 'pair', otherZone: 'pair', alone: 'count', zoneCount: 'count', drone: 'drone',
  northOfSafe: 'safeDir', southOfSafe: 'safeDir', westOfSafe: 'safeDir', eastOfSafe: 'safeDir',
  sameZoneSafe: 'safeZone', otherZoneSafe: 'safeZone', alarm: 'alarm',
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

export function generateBoard(rng, cfg) {
  const { n } = cfg;
  for (;;) {
    const zones = growZones(rng, n, cfg.zones);
    const types = new Array(n * n).fill('ground');
    const cells = rng.shuffle([...Array(n * n).keys()]);
    const obstacles = Math.round(n * n * cfg.obstacles);
    for (const cell of cells.slice(0, obstacles)) types[cell] = rng.pick(OBSTACLE_TYPES);
    const free = cells.slice(obstacles);
    for (const cell of free.slice(0, Math.round(free.length * 0.12))) types[cell] = 'bush';
    for (const cell of free.slice(Math.round(free.length * 0.12), Math.round(free.length * 0.18))) types[cell] = 'pad';

    const rows = arr => Array.from({ length: n }, (_, r) => arr.slice(r * n, r * n + n));
    const puzzle = {
      n,
      cells: rows(types),
      zones: rows(zones),
      zoneNames: rng.shuffle(ZONE_NAMES).slice(0, cfg.zones),
    };
    const board = getBoard(puzzle);
    // Zones keep 3 walkable cells, so the safe on one of them still leaves the zone a place to stand.
    if (board.zoneCells.every(list => list.filter(cell => board.walk[cell]).length >= 3)) return puzzle;
  }
}

// The hidden safe's cell: ground with at least two walkable neighbours, so R2 picks among several cells.
export function placeSafe(rng, puzzle) {
  const board = getBoard(puzzle);
  const cells = board.walkCells.filter(s => board.type[s] === 'ground' && getBoard(withSafe(puzzle, s)).safeSpots.length >= 2);
  return cells.length ? rng.pick(cells) : -1;
}

// Random greedy placement satisfying R1 and R2 on the map with the safe in place, or null (the caller retries).
export function placeHeroes(rng, puzzle, k) {
  const board = getBoard(puzzle);
  const placement = [rng.pick(board.safeSpots)];
  for (const cell of rng.shuffle(board.walkCells)) {
    if (placement.length === k) break;
    if (board.safeSpot[cell] || placement.includes(cell)) continue;
    if (placement.some(p => board.seesSet[p].has(cell))) continue;
    placement.push(cell);
  }
  return placement.length === k ? rng.shuffle(placement) : null;
}

function allowed(chosen, st, cfg) {
  if (st.type === 'drone') return chosen.filter(x => x.type === 'drone').length < cfg.drones;
  if (st.type === 'alarm') return !chosen.some(x => x.type === 'alarm');
  if (chosen.filter(x => x.who === st.who).length >= MAX_PER_HERO) return false;
  if ((st.type === 'sameZone' || st.type === 'otherZone') && chosen.some(x => x.type === st.type && x.who === st.hero && x.hero === st.who)) return false;
  return true;
}

const solutionKey = s => `${s.safe}|${s.placement.join()}`;
const holds = (puzzle, s, st) => evaluate(withSafe(puzzle, s.safe), s.placement, st);

// Solutions { safe, placement } other than the hidden one, found by budgeted randomised searches. Returns []
// only when a complete (non-aborted) search proved the solution unique, null when no proof fits the budget.
function sampleOthers(puzzle, statements, rng) {
  const truth = solutionKey({ safe: puzzle.safe, placement: puzzle.solution });
  const found = new Map();
  for (let i = 0; i < SAMPLE_RUNS; i++) {
    const { solutions, aborted } = solveHidden({ ...puzzle, statements }, 2, rng, SAMPLE_NODES);
    for (const s of solutions) if (solutionKey(s) !== truth) found.set(solutionKey(s), s);
    if (found.size === 0 && !aborted) return [];
  }
  if (found.size > 0) return [...found.values()];
  const exact = solveHidden({ ...puzzle, statements }, 2, null, PROOF_NODES);
  if (exact.aborted) return null;
  return exact.solutions.filter(s => solutionKey(s) !== truth);
}

// true / false when proven within the budget, null otherwise.
function provenUnique(puzzle, statements) {
  const { solutions, aborted } = solveHidden({ ...puzzle, statements }, 2, null, PROOF_NODES);
  return aborted ? null : solutions.length === 1;
}

// `diverse = false` drops the clue-kind novelty: weak kinds can fill the Q4 slots (2 per hero) before the
// solution is unique; the same board is then retried without it instead of being thrown away.
export function selectStatements(rng, puzzle, cfg, diverse = true) {
  const candidates = trueStatements(withSafe(puzzle, puzzle.safe), puzzle.solution);
  let chosen = [];
  let sample = sampleOthers(puzzle, chosen, rng);
  if (!sample) return null;
  while (sample.length > 0) {
    let best = null;
    for (const st of candidates) {
      if (chosen.includes(st) || !allowed(chosen, st, cfg)) continue;
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
    const safe = placeSafe(rng, base);
    if (safe < 0) continue;
    const placement = placeHeroes(rng, withSafe(base, safe), cfg.heroes);
    if (!placement) continue;
    const heroes = rng.shuffle(HERO_ROSTER).slice(0, cfg.heroes).map(h => ({ ...h }));
    const puzzle = { version: PUZZLE_VERSION, seed: String(seed), difficulty, ...base, heroes, statements: [], safe, solution: placement };
    if (!isValidPlacement(withSafe(puzzle, safe), placement)) throw new Error('generator produced an invalid placement');
    const statements = selectStatements(rng, puzzle, cfg) ?? selectStatements(rng, puzzle, cfg, false);
    if (!statements) continue;
    puzzle.statements = statements.sort(statementOrder);
    // Q3: the step solver must reach the solution with the techniques allowed for this difficulty.
    const graded = stepSolve(puzzle, { maxLevel: cfg.maxLevel });
    if (!graded.solved) continue;
    if (graded.safe !== safe || graded.placement.join() !== placement.join()) throw new Error('step solver disagrees with the unique solution');
    puzzle.thief = thiefOf(withSafe(puzzle, safe), placement);
    puzzle.grade = { level: graded.level, steps: graded.steps.length };
    return puzzle;
  }
}
