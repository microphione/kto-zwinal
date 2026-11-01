// Random inputs for property tests (rules v3): boards with heroes = n − 1, arbitrary and rook placements,
// and statements of every kind, true or false.
import { createRng } from '../src/rng.js';
import { generateBoard } from '../src/generator.js';
import { solve } from '../src/solver.js';
import { getBoard } from '../src/board.js';
import { HERO_ROSTER } from '../src/text.js';
import { refCandidates, refEval, refValid } from './reference.js';

// Heroes are always n − 1 (RULES.md §2).
export const SMALL = [
  { n: 4, zones: 2, obstacles: 0.15 },
  { n: 4, zones: 2, obstacles: 0.12 },
  { n: 5, zones: 3, obstacles: 0.18 },
  { n: 5, zones: 2, obstacles: 0.16 },
];
// Large boards exercise the high mask word (cells 32–63).
export const LARGE = [
  { n: 6, zones: 3, obstacles: 0.15 },
  { n: 7, zones: 4, obstacles: 0.15 },
  { n: 8, zones: 4, obstacles: 0.15 },
];

const PAIRS = ['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone'];
const SAFE = ['northOfSafe', 'southOfSafe', 'westOfSafe', 'eastOfSafe', 'sameZoneSafe', 'otherZoneSafe'];
const OBSTACLES = ['crate', 'barrel', 'rock'];

// Every v3 statement kind with random (often false) parameters.
export function randomStatement(rng, puzzle) {
  const k = puzzle.heroes.length;
  const who = rng.int(0, k - 1);
  let hero = rng.int(0, k - 2);
  if (hero >= who) hero++;
  const zone = rng.int(0, puzzle.zoneNames.length - 1);
  switch (rng.int(0, 10)) {
    case 0: return { type: rng.pick(['inZone', 'notInZone']), who, zone };
    case 1: return { type: 'on', who, cellType: rng.pick(['ground', 'bush', 'pad']) };
    case 2: return { type: rng.pick(['nextTo', 'notNextTo']), who, cellType: rng.pick(OBSTACLES) };
    case 3: return { type: 'sees', who, cellType: rng.pick(OBSTACLES) };
    case 4: return { type: rng.pick(['row', 'col']), who, n: rng.int(1, puzzle.n) };
    case 5:
    case 6: return { type: rng.pick(PAIRS), who, hero };
    case 7: return { type: 'alone', who };
    case 8: return { type: 'zoneCount', who, n: rng.int(2, k) };
    case 9: return { type: rng.pick(SAFE), who };
    default: return { type: 'alarm', zone };
  }
}

// A board with n − 1 named heroes and no statements. The rng continues for the caller's own draws.
export function randomBoardPuzzle(seed, sizes = SMALL) {
  const rng = createRng(`test3|${seed}|${sizes.length}`);
  const cfg = sizes[seed % sizes.length];
  const base = generateBoard(rng, cfg);
  const heroes = HERO_ROSTER.slice(0, cfg.n - 1).map(h => ({ ...h }));
  return { rng, puzzle: { ...base, heroes, statements: [] } };
}

// k cells anywhere on the grid (obstacles and repeated cells included): usually invalid.
export function randomAnyPlacement(rng, puzzle) {
  return Array.from({ length: puzzle.heroes.length }, () => rng.int(0, puzzle.n * puzzle.n - 1));
}

// k distinct walkable cells, rows and columns free to repeat.
export function randomWalkPlacement(rng, puzzle) {
  return rng.shuffle(getBoard(puzzle).walkCells).slice(0, puzzle.heroes.length);
}

// k cells in distinct rows and columns (so the safe exists); `walkable = false` allows obstacle cells.
export function randomRookPlacement(rng, puzzle, walkable = true) {
  const { n, walk } = getBoard(puzzle);
  for (;;) {
    const cols = rng.shuffle([...Array(n).keys()]);
    const rows = rng.shuffle([...Array(n).keys()]).slice(0, n - 1);
    const placement = rows.map((r, i) => r * n + cols[i]);
    if (!walkable || placement.every(c => walk[c])) return placement;
  }
}

// A valid placement (R0–R2) found by the randomised solver, or null if the board has none.
export function randomValidPlacement(rng, puzzle) {
  return solve({ ...puzzle, statements: [] }, 1, rng).solutions[0] ?? null;
}

// The reference solutions of `puzzle` with `statements` (candidates are enumerated once per board object).
export function refSolveWith(board, statements) {
  return refCandidates(board).filter(p => statements.every(st => refEval(board, p, st)));
}

// Brute force for boards too big to enumerate every candidate (n ≥ 7 has millions): depth-first over heroes,
// pruning with the reference predicate on statements whose heroes are all placed, then the full reference check
// at the leaves. Returns null when more than `budget` nodes or MAX_SPARSE solutions would be needed.
const PRUNABLE = new Set(['inZone', 'notInZone', 'on', 'nextTo', 'notNextTo', 'sees', 'row', 'col', 'northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone']);
export const MAX_SPARSE = 5000;
export function refSolveSparse(board, statements, budget = 3e6) {
  const { n } = board;
  const k = board.heroes.length;
  const walkable = [];
  for (let cell = 0; cell < n * n; cell++) if (['ground', 'bush', 'pad'].includes(board.cells[Math.floor(cell / n)][cell % n])) walkable.push(cell);
  const byLast = Array.from({ length: k }, () => []);
  for (const st of statements) {
    if (!PRUNABLE.has(st.type)) continue;
    byLast[Math.max(st.who, st.hero ?? 0)].push(st);
  }
  const placement = new Array(k).fill(undefined);
  const out = [];
  let nodes = 0;
  const place = h => {
    if (h === k) {
      if (refValid(board, placement) && statements.every(st => refEval(board, placement, st))) out.push(placement.slice());
      return out.length <= MAX_SPARSE;
    }
    for (const cell of walkable) {
      if (++nodes > budget) return false;
      if (placement.slice(0, h).some(x => Math.floor(x / n) === Math.floor(cell / n) || x % n === cell % n)) continue;
      placement[h] = cell;
      if (byLast[h].every(st => refEval(board, placement, st)) && !place(h + 1)) return false;
      placement[h] = undefined;
    }
    return true;
  };
  return place(0) ? out : null;
}

export const sortSolutions = list => list.map(p => p.join(',')).sort();
