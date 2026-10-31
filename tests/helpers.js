// Random inputs for property tests: boards, valid placements and arbitrary (possibly false) statements.
import { createRng } from '../src/rng.js';
import { generateBoard } from '../src/generator.js';
import { solve } from '../src/solver.js';
import { getBoard } from '../src/board.js';

export const SMALL = [
  { n: 4, heroes: 3, zones: 2, drones: 2, obstacles: 0.15 },
  { n: 4, heroes: 4, zones: 3, drones: 2, obstacles: 0.12 },
  { n: 5, heroes: 3, zones: 3, drones: 2, obstacles: 0.18 },
  { n: 5, heroes: 4, zones: 2, drones: 2, obstacles: 0.16 },
];

const CELL_TYPES = ['ground', 'bush', 'pad', 'crate', 'barrel', 'rock', 'safe'];
const PAIRS = ['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone'];

export function randomStatement(rng, puzzle) {
  const k = puzzle.heroes.length;
  const who = rng.int(0, k - 1);
  let hero = rng.int(0, k - 2);
  if (hero >= who) hero++;
  switch (rng.int(0, 9)) {
    case 0: return { type: rng.pick(['inZone', 'notInZone']), who, zone: rng.int(0, puzzle.zoneNames.length - 1) };
    case 1: return { type: 'on', who, cellType: rng.pick(['ground', 'bush', 'pad']) };
    case 2: return { type: rng.pick(['nextTo', 'notNextTo']), who, cellType: rng.pick(['crate', 'barrel', 'rock']) };
    case 3: return { type: 'sees', who, cellType: rng.pick(['crate', 'barrel', 'rock', 'safe']) };
    case 4: return { type: rng.pick(['row', 'col']), who, n: rng.int(1, puzzle.n) };
    case 5:
    case 6: return { type: rng.pick(PAIRS), who, hero };
    case 7: return { type: 'alone', who };
    case 8: return { type: 'zoneCount', who, n: rng.int(2, k) };
    default: return { type: 'drone', side: rng.pick(['N', 'S', 'W', 'E']), index: rng.int(1, puzzle.n), n: rng.int(0, 1) };
  }
}

// Large boards exercise the high mask word (cells 32–63); 3 heroes keep the brute force feasible.
export const LARGE = [
  { n: 6, heroes: 3, zones: 3, drones: 2, obstacles: 0.15 },
  { n: 7, heroes: 3, zones: 4, drones: 2, obstacles: 0.15 },
  { n: 8, heroes: 3, zones: 4, drones: 2, obstacles: 0.15 },
];

export function randomBoardPuzzle(seed, sizes = SMALL) {
  const rng = createRng(`test|${seed}|${sizes.length}`);
  const cfg = sizes[seed % sizes.length];
  const base = generateBoard(rng, cfg);
  const heroes = Array.from({ length: cfg.heroes }, (_, i) => ({ name: `H${i}`, gender: i % 2 ? 'f' : 'm' }));
  return { rng, puzzle: { ...base, heroes, statements: [] } };
}

// Any walkable-cell assignment (not necessarily valid), for evaluator cross-checks.
export function randomPlacement(rng, puzzle) {
  return rng.shuffle(getBoard(puzzle).walkCells).slice(0, puzzle.heroes.length);
}

// A valid placement (R1 + R2) chosen by a randomised search, or null if the board has none.
export function randomValidPlacement(rng, puzzle) {
  return solve({ ...puzzle, statements: [] }, 1, rng).solutions[0] ?? null;
}

export const sortPlacements = list => list.map(p => p.join(',')).sort();

export { CELL_TYPES };
