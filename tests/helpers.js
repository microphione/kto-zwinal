// Random inputs for property tests: boards (hidden safe), candidates and arbitrary (possibly false) statements.
import { createRng } from '../src/rng.js';
import { generateBoard } from '../src/generator.js';
import { solveHidden } from '../src/solver.js';
import { getBoard, withSafe } from '../src/board.js';

export const SMALL = [
  { n: 4, heroes: 3, zones: 2, drones: 2, obstacles: 0.15 },
  { n: 4, heroes: 4, zones: 2, drones: 2, obstacles: 0.12 },
  { n: 5, heroes: 3, zones: 3, drones: 2, obstacles: 0.18 },
  { n: 5, heroes: 4, zones: 2, drones: 2, obstacles: 0.16 },
];

const PAIRS = ['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone'];
const SAFE = ['northOfSafe', 'southOfSafe', 'westOfSafe', 'eastOfSafe', 'sameZoneSafe', 'otherZoneSafe'];

export function randomStatement(rng, puzzle) {
  const k = puzzle.heroes.length;
  const who = rng.int(0, k - 1);
  let hero = rng.int(0, k - 2);
  if (hero >= who) hero++;
  const zone = rng.int(0, puzzle.zoneNames.length - 1);
  switch (rng.int(0, 11)) {
    case 0: return { type: rng.pick(['inZone', 'notInZone']), who, zone };
    case 1: return { type: 'on', who, cellType: rng.pick(['ground', 'bush', 'pad']) };
    case 2: return { type: rng.pick(['nextTo', 'notNextTo']), who, cellType: rng.pick(['crate', 'barrel', 'rock']) };
    case 3: return { type: 'sees', who, cellType: rng.pick(['crate', 'barrel', 'rock', 'safe']) };
    case 4: return { type: rng.pick(['row', 'col']), who, n: rng.int(1, puzzle.n) };
    case 5:
    case 6: return { type: rng.pick(PAIRS), who, hero };
    case 7: return { type: 'alone', who };
    case 8: return { type: 'zoneCount', who, n: rng.int(2, k) };
    case 9: return { type: rng.pick(SAFE), who };
    case 10: return { type: 'alarm', zone };
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

// Any ground cell for the safe (it may have no walkable neighbour).
export const randomSafe = (rng, puzzle) => rng.pick(getBoard(puzzle).walkCells.filter(c => getBoard(puzzle).type[c] === 'ground'));

// Any walkable-cell assignment on the map with the safe in place (not necessarily valid).
export function randomPlacement(rng, puzzle, safe) {
  return rng.shuffle(getBoard(withSafe(puzzle, safe)).walkCells).slice(0, puzzle.heroes.length);
}

// A valid candidate { safe, placement } (R1 + R2) chosen by a randomised search, or null if the board has none.
export function randomValidSolution(rng, puzzle) {
  return solveHidden({ ...puzzle, statements: [] }, 1, rng).solutions[0] ?? null;
}

export const sortSolutions = list => list.map(s => `${s.safe}|${s.placement.join(',')}`).sort();
