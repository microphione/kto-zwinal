// Board geometry derived from a puzzle (RULES.md §1–§3). Cell index = r * n + c.
// Nothing blocks sight: two cells see each other when they share a row or a column. Zone borders only
// limit neighbourhood and thief spots. The safe is not on the map; `safeOf` derives it from a placement.

// Cell catalogue (RULES.md §1). `kind` is a generator convention: indoor types in rooms, outdoor in outdoor zones.
export const CELL_TYPES = {
  floor: { kind: 'in', walk: true, plain: true },
  bed: { kind: 'in', walk: true },
  armchair: { kind: 'in', walk: true },
  rug: { kind: 'in', walk: true },
  table: { kind: 'in' },
  wardrobe: { kind: 'in' },
  plant: { kind: 'in' },
  grass: { kind: 'out', walk: true, plain: true },
  bush: { kind: 'out', walk: true },
  bench: { kind: 'out', walk: true },
  tree: { kind: 'out' },
  rock: { kind: 'out' },
  pond: { kind: 'out' },
};
const typesWhere = test => Object.keys(CELL_TYPES).filter(t => test(CELL_TYPES[t]));
export const WALKABLE_TYPES = typesWhere(d => d.walk);
export const PLAIN_TYPES = typesWhere(d => d.plain);
// Walkable and not plain: the parameters of `notOn`, `onlyOn`, `nobodyOn`.
export const SPECIAL_TYPES = typesWhere(d => d.walk && !d.plain);
export const OBSTACLE_TYPES = typesWhere(d => !d.walk);
// The parameters of `nextTo` / `notNextTo`.
export const NON_PLAIN_TYPES = typesWhere(d => !d.plain);
export const isPlain = t => PLAIN_TYPES.includes(t);

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
// Keyed by the cells array so `{ ...puzzle, statements }` copies share one board.
const cache = new WeakMap();

export function getBoard(puzzle) {
  let b = cache.get(puzzle.cells);
  if (!b || b.zonesRef !== puzzle.zones) {
    b = buildBoard(puzzle);
    cache.set(puzzle.cells, b);
  }
  return b;
}

function buildBoard(puzzle) {
  const n = puzzle.n;
  const size = n * n;
  const type = new Array(size);
  const zone = new Array(size);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      type[r * n + c] = puzzle.cells[r][c];
      zone[r * n + c] = puzzle.zones[r][c];
    }
  }
  const walk = type.map(t => WALKABLE_TYPES.includes(t));
  const walkCells = [];
  for (let i = 0; i < size; i++) if (walk[i]) walkCells.push(i);

  const inside = (r, c) => r >= 0 && c >= 0 && r < n && c < n;
  const neighbours = [];
  const nextTypes = [];
  const thiefSpots = [];
  for (let i = 0; i < size; i++) {
    const r = Math.floor(i / n), c = i % n;
    const nb = [];
    for (const [dr, dc] of DIRS) {
      const j = (r + dr) * n + c + dc;
      if (inside(r + dr, c + dc) && zone[j] === zone[i]) nb.push(j);
    }
    neighbours.push(nb);
    nextTypes.push(new Set(nb.map(j => type[j])));
    const spots = [];
    for (const [dr, dc] of DIAGONALS) {
      const j = (r + dr) * n + c + dc;
      if (inside(r + dr, c + dc) && walk[j] && zone[j] === zone[i]) spots.push(j);
    }
    thiefSpots.push(spots);
  }

  const zoneCells = [];
  for (let i = 0; i < size; i++) (zoneCells[zone[i]] ||= []).push(i);

  return {
    zonesRef: puzzle.zones,
    n, size, type, zone, walk, walkCells, neighbours, nextTypes, thiefSpots, zoneCells,
    row: i => Math.floor(i / n) + 1,
    col: i => (i % n) + 1,
  };
}

// The crossing of the only row and the only column without a hero (RULES.md §2), or −1 when there is not
// exactly one of each.
export function safeOf(board, placement) {
  const { n } = board;
  const rows = new Array(n).fill(false), cols = new Array(n).fill(false);
  for (const cell of placement) {
    if (cell < 0) continue;
    rows[Math.floor(cell / n)] = true;
    cols[cell % n] = true;
  }
  const r = rows.indexOf(false), c = cols.indexOf(false);
  if (r < 0 || c < 0 || rows.indexOf(false, r + 1) >= 0 || cols.indexOf(false, c + 1) >= 0) return -1;
  return r * n + c;
}
