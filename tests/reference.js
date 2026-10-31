// Independent reference implementation of RULES.md. Deliberately naive: written from the spec only,
// no shared code with src/. Intended for small boards (<= 5x5, <= 5 heroes).

const WALKABLE = new Set(['ground', 'bush', 'pad']);

const rowOf = (p, i) => Math.floor(i / p.n);
const colOf = (p, i) => i % p.n;
const typeOf = (p, i) => p.cells[rowOf(p, i)][colOf(p, i)];
const zoneOf = (p, i) => p.zones[rowOf(p, i)][colOf(p, i)];
const isWalkable = (p, i) => WALKABLE.has(typeOf(p, i));
const isBlocking = (p, i) => !isWalkable(p, i);

function allCells(p) {
  const out = [];
  for (let i = 0; i < p.n * p.n; i++) out.push(i);
  return out;
}

// Neighbours: orthogonally adjacent, inside the grid, same zone (zone border = not a neighbour).
function neighbours(p, i) {
  const r = rowOf(p, i);
  const c = colOf(p, i);
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= p.n || cc < 0 || cc >= p.n) continue;
    const j = rr * p.n + cc;
    if (zoneOf(p, j) === zoneOf(p, i)) out.push(j);
  }
  return out;
}

function safeCell(p) {
  const found = allCells(p).filter((i) => typeOf(p, i) === 'safe');
  if (found.length !== 1) throw new Error('board must contain exactly one safe');
  return found[0];
}

function safeSpots(p) {
  return neighbours(p, safeCell(p)).filter((j) => isWalkable(p, j));
}

// §3 line of sight.
export function refSees(p, a, b) {
  if (a === b) return false;
  const ra = rowOf(p, a);
  const ca = colOf(p, a);
  const rb = rowOf(p, b);
  const cb = colOf(p, b);
  if (ra !== rb && ca !== cb) return false;
  // Zones and zone borders play no role; only blocking cells strictly between block sight.
  const dr = Math.sign(rb - ra);
  const dc = Math.sign(cb - ca);
  let r = ra + dr;
  let c = ca + dc;
  while (!(r === rb && c === cb)) {
    if (isBlocking(p, r * p.n + c)) return false;
    r += dr;
    c += dc;
  }
  return true;
}

// Number of heroes in the zone of cell(x), including x.
function zoneHeroes(p, placement, x) {
  const z = zoneOf(p, placement[x]);
  return placement.filter((cell) => zoneOf(p, cell) === z).length;
}

// §5.2 drone scan -> cells scanned.
function droneCells(p, side, index) {
  const n = p.n;
  const i = index - 1;
  let r;
  let c;
  let dr = 0;
  let dc = 0;
  if (side === 'W') { r = i; c = 0; dc = 1; }
  else if (side === 'E') { r = i; c = n - 1; dc = -1; }
  else if (side === 'N') { r = 0; c = i; dr = 1; }
  else if (side === 'S') { r = n - 1; c = i; dr = -1; }
  else throw new Error('bad drone side ' + side);
  const first = r * n + c;
  if (isBlocking(p, first)) return [];
  const cells = [first];
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || r >= n || c < 0 || c >= n) break;
    const j = r * n + c;
    if (isBlocking(p, j)) break;
    cells.push(j);
  }
  return cells;
}

// §5 truth of one statement on a full placement.
export function refEval(p, placement, st) {
  if (st.type === 'drone') {
    const cells = droneCells(p, st.side, st.index);
    const count = placement.filter((cell) => cells.includes(cell)).length;
    return count === st.n;
  }
  const s = st.who;
  const cell = placement[s];
  switch (st.type) {
    case 'inZone': return zoneOf(p, cell) === st.zone;
    case 'notInZone': return zoneOf(p, cell) !== st.zone;
    case 'on': return typeOf(p, cell) === st.cellType;
    case 'nextTo': return neighbours(p, cell).some((j) => typeOf(p, j) === st.cellType);
    case 'notNextTo': return !neighbours(p, cell).some((j) => typeOf(p, j) === st.cellType);
    case 'sees': // §5.1 equivalent: some cell of type t sees cell(S)
      return allCells(p).some((j) => typeOf(p, j) === st.cellType && refSees(p, j, cell));
    case 'row': return rowOf(p, cell) + 1 === st.n;
    case 'col': return colOf(p, cell) + 1 === st.n;
    case 'northOf': return rowOf(p, cell) < rowOf(p, placement[st.hero]);
    case 'southOf': return rowOf(p, cell) > rowOf(p, placement[st.hero]);
    case 'westOf': return colOf(p, cell) < colOf(p, placement[st.hero]);
    case 'eastOf': return colOf(p, cell) > colOf(p, placement[st.hero]);
    case 'alone': return zoneHeroes(p, placement, s) === 1;
    case 'zoneCount': return zoneHeroes(p, placement, s) === st.n;
    case 'sameZone': return zoneOf(p, cell) === zoneOf(p, placement[st.hero]);
    case 'otherZone': return zoneOf(p, cell) !== zoneOf(p, placement[st.hero]);
    default: throw new Error('unknown statement type ' + st.type);
  }
}

// Distinct walkable cells, R1, R2.
export function refValid(p, placement) {
  for (let a = 0; a < placement.length; a++) {
    if (!isWalkable(p, placement[a])) return false;
    for (let b = a + 1; b < placement.length; b++) {
      if (placement[a] === placement[b]) return false;
      if (refSees(p, placement[a], placement[b])) return false; // R1
    }
  }
  const spots = safeSpots(p);
  return placement.filter((cell) => spots.includes(cell)).length === 1; // R2
}

// Hero index standing on a safe spot (assumes a valid placement).
export function refThief(p, placement) {
  const spots = safeSpots(p);
  const idx = placement.findIndex((cell) => spots.includes(cell));
  return idx;
}

// Exhaustive search. Partial assignments are pruned only by distinctness and R1.
export function refSolve(p, limit = Infinity) {
  const k = p.heroes.length;
  const walkable = allCells(p).filter((i) => isWalkable(p, i));
  const solutions = [];
  const placement = [];

  function rec(h) {
    if (solutions.length >= limit) return;
    if (h === k) {
      if (refValid(p, placement) && (p.statements || []).every((st) => refEval(p, placement, st))) {
        solutions.push(placement.slice());
      }
      return;
    }
    for (const cell of walkable) {
      if (placement.includes(cell)) continue;
      if (placement.some((other) => refSees(p, other, cell))) continue;
      placement.push(cell);
      rec(h + 1);
      placement.pop();
      if (solutions.length >= limit) return;
    }
  }

  rec(0);
  return solutions;
}
