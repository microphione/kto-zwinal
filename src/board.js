// Board geometry derived from a puzzle (RULES.md §1, §3, §5.1, §5.2). Cell index = r * n + c.
// Zone borders only limit neighbourhood; sight and drones are blocked by blocking cells alone.
// A puzzle's map has no safe (it is hidden); `withSafe` gives the map with the safe in place, on which
// every rule and statement is evaluated.
export const WALKABLE_TYPES = ['ground', 'bush', 'pad'];
export const OBSTACLE_TYPES = ['crate', 'barrel', 'rock'];
export const BLOCKING_TYPES = [...OBSTACLE_TYPES, 'safe'];
export const SIDES = ['N', 'S', 'W', 'E'];

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// Keyed by the cells array so `{ ...puzzle, statements }` copies share one board.
const cache = new WeakMap();
const safeMaps = new WeakMap();

// The puzzle on the map with the safe in place (RULES.md §1); copies of one puzzle share the map per cell.
export function withSafe(puzzle, safe) {
  let maps = safeMaps.get(puzzle.cells);
  if (!maps) safeMaps.set(puzzle.cells, maps = new Map());
  let cells = maps.get(safe);
  if (!cells) {
    const r = Math.floor(safe / puzzle.n), c = safe % puzzle.n;
    cells = puzzle.cells.map((row, i) => (i === r ? row.map((t, j) => (j === c ? 'safe' : t)) : row));
    maps.set(safe, cells);
  }
  return { ...puzzle, cells };
}

// Ground cells the safe can stand on: a cell without walkable neighbours admits no solution (R2).
export function safeCandidates(puzzle) {
  const board = getBoard(puzzle);
  return board.walkCells.filter(s => board.type[s] === 'ground' && getBoard(withSafe(puzzle, s)).safeSpots.length > 0);
}

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

  const neighbours = [];
  const nextTypes = [];
  const sees = [];
  const seenTypes = [];
  for (let i = 0; i < size; i++) {
    const r = Math.floor(i / n), c = i % n;
    const nb = [];
    const seen = [];
    const seenT = new Set();
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < n && nc < n && zone[nr * n + nc] === zone[i]) nb.push(nr * n + nc);
      // Sight scan: zone borders do not block; the first blocking cell or the grid edge ends the line.
      let rr = r, cc = c;
      for (;;) {
        const sr = rr + dr, sc = cc + dc;
        if (sr < 0 || sc < 0 || sr >= n || sc >= n) break;
        const j = sr * n + sc;
        if (!walk[j]) {
          seenT.add(type[j]);
          break;
        }
        seen.push(j);
        rr = sr;
        cc = sc;
      }
    }
    neighbours.push(nb);
    nextTypes.push(new Set(nb.map(j => type[j])));
    sees.push(seen);
    seenTypes.push(seenT);
  }

  const safe = type.indexOf('safe');
  const safeSpots = safe < 0 ? [] : neighbours[safe].filter(j => walk[j]);
  const safeSpot = new Array(size).fill(false);
  for (const j of safeSpots) safeSpot[j] = true;

  const seesSet = sees.map(list => new Set(list));
  const zoneCells = [];
  for (let i = 0; i < size; i++) (zoneCells[zone[i]] ||= []).push(i);

  return {
    zonesRef: puzzle.zones,
    n, size, type, zone, walk, walkCells, neighbours, nextTypes, sees, seesSet, seenTypes,
    safe, safeSpots, safeSpot, zoneCells,
    row: i => Math.floor(i / n) + 1,
    col: i => (i % n) + 1,
  };
}

// Cells scanned by a drone (RULES.md §5.2); empty if the first cell is blocking.
export function droneScan(board, side, index) {
  const { n, walk } = board;
  const i = index - 1;
  let r, c, dr, dc;
  if (side === 'W') [r, c, dr, dc] = [i, 0, 0, 1];
  else if (side === 'E') [r, c, dr, dc] = [i, n - 1, 0, -1];
  else if (side === 'N') [r, c, dr, dc] = [0, i, 1, 0];
  else [r, c, dr, dc] = [n - 1, i, -1, 0];
  const out = [];
  while (r >= 0 && c >= 0 && r < n && c < n) {
    const j = r * n + c;
    if (!walk[j]) break;
    out.push(j);
    r += dr;
    c += dc;
  }
  return out;
}
