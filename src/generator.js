// Procedural boards and puzzles satisfying RULES.md Q1, Q2, Q4, Q5 (Q3 is added in stage 3).
import { createRng } from './rng.js';
import { getBoard, OBSTACLE_TYPES } from './board.js';
import { trueStatements, isValidPlacement, thiefOf, evaluate } from './statements.js';
import { solve } from './solver.js';
import { HERO_ROSTER, ZONE_NAMES } from './text.js';

export const PUZZLE_VERSION = 1;

export const DIFFICULTIES = {
  easy: { n: 5, heroes: 4, zones: 3, drones: 0, obstacles: 0.16 },
  medium: { n: 6, heroes: 5, zones: 4, drones: 1, obstacles: 0.17 },
  hard: { n: 7, heroes: 6, zones: 5, drones: 2, obstacles: 0.18 },
  expert: { n: 8, heroes: 7, zones: 6, drones: 2, obstacles: 0.18 },
};

const MAX_PER_HERO = 2;
const SAMPLE_RUNS = 24;
// Node budgets keep every attempt bounded; an attempt that cannot finish a proof within
// PROOF_NODES is abandoned and the generator moves on to the next board (still deterministic).
const SAMPLE_NODES = 20000;
const PROOF_NODES = 400000;

// Relative preference: qualitative clues over raw coordinates.
const WEIGHT = {
  inZone: 1, notInZone: 0.8, on: 1.2, nextTo: 1, notNextTo: 0.6, sees: 1, row: 0.3, col: 0.3,
  northOf: 0.8, southOf: 0.8, westOf: 0.8, eastOf: 0.8, sameZone: 0.7, otherZone: 0.6,
  alone: 0.8, zoneCount: 0.6, drone: 1,
};

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
    types[cells[obstacles]] = 'safe';
    const free = cells.slice(obstacles + 1);
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
    const zoneOk = board.zoneCells.every(list => list.filter(cell => board.walk[cell]).length >= 2);
    if (zoneOk && board.safeSpots.length >= 2) return puzzle;
  }
}

// Random greedy hidden placement satisfying R1 and R2, or null (the caller retries).
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
  if (chosen.filter(x => x.who === st.who).length >= MAX_PER_HERO) return false;
  if ((st.type === 'sameZone' || st.type === 'otherZone') && chosen.some(x => x.type === st.type && x.who === st.hero && x.hero === st.who)) return false;
  return true;
}

// Placements other than the hidden solution, found by budgeted randomised searches. Returns [] only
// when a complete (non-aborted) search proved the solution unique, null when no proof fits the budget.
function sampleOthers(puzzle, statements, rng) {
  const truth = puzzle.solution.join();
  const found = new Map();
  for (let i = 0; i < SAMPLE_RUNS; i++) {
    const { solutions, aborted } = solve({ ...puzzle, statements }, 2, rng, SAMPLE_NODES);
    for (const p of solutions) if (p.join() !== truth) found.set(p.join(), p);
    if (found.size === 0 && !aborted) return [];
  }
  if (found.size > 0) return [...found.values()];
  const exact = solve({ ...puzzle, statements }, 2, null, PROOF_NODES);
  if (exact.aborted) return null;
  return exact.solutions.filter(p => p.join() !== truth);
}

// true / false when proven within the budget, null otherwise.
function provenUnique(puzzle, statements) {
  const { solutions, aborted } = solve({ ...puzzle, statements }, 2, null, PROOF_NODES);
  return aborted ? null : solutions.length === 1;
}

export function selectStatements(rng, puzzle, cfg) {
  const candidates = trueStatements(puzzle, puzzle.solution);
  let chosen = [];
  let sample = sampleOthers(puzzle, chosen, rng);
  if (!sample) return null;
  while (sample.length > 0) {
    let best = null;
    for (const st of candidates) {
      if (chosen.includes(st) || !allowed(chosen, st, cfg)) continue;
      const cut = sample.filter(p => !evaluate(puzzle, p, st)).length;
      if (cut === 0) continue;
      const score = (cut / sample.length) * WEIGHT[st.type] * (0.5 + rng.next());
      if (!best || score > best.score) best = { st, score };
    }
    if (!best) return null;
    chosen.push(best.st);
    sample = sample.filter(p => evaluate(puzzle, p, best.st));
    if (sample.length < SAMPLE_RUNS / 3) {
      const keys = new Set(sample.map(p => p.join()));
      const more = sampleOthers(puzzle, chosen, rng);
      if (!more) return null;
      for (const p of more) if (!keys.has(p.join())) sample.push(p);
    }
  }
  // Q2: drop every statement that is not needed, trying the least preferred first.
  for (const st of [...chosen].sort((a, b) => WEIGHT[a.type] - WEIGHT[b.type])) {
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
    const placement = placeHeroes(rng, base, cfg.heroes);
    if (!placement) continue;
    const heroes = rng.shuffle(HERO_ROSTER).slice(0, cfg.heroes).map(h => ({ ...h }));
    const puzzle = { version: PUZZLE_VERSION, seed: String(seed), difficulty, ...base, heroes, statements: [], solution: placement };
    if (!isValidPlacement(puzzle, placement)) throw new Error('generator produced an invalid placement');
    const statements = selectStatements(rng, puzzle, cfg);
    if (!statements) continue;
    puzzle.statements = statements.sort(statementOrder);
    puzzle.thief = thiefOf(puzzle, placement);
    return puzzle;
  }
}
