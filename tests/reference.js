// Independent brute-force reference for RULES.md v3 (rows and columns, safe on the last free cell).
// Shares no code with src/. Clarity over speed: every predicate is a literal reading of the spec.
// Cell index = r * n + c (0-based); RULES rows/columns (`row`/`col` parameters) are 1-based.


function rowOf(puzzle, cell) { return Math.floor(cell / puzzle.n); }
function colOf(puzzle, cell) { return cell % puzzle.n; }
function typeOf(puzzle, cell) { return puzzle.cells[rowOf(puzzle, cell)][colOf(puzzle, cell)]; }
function zoneOf(puzzle, cell) { return puzzle.zones[rowOf(puzzle, cell)][colOf(puzzle, cell)]; }
function isWalkable(puzzle, cell) {
  const t = typeOf(puzzle, cell);
  return t === 'ground' || t === 'bush' || t === 'pad';
}

// Orthogonally adjacent cells in the same zone (§1).
function neighbours(puzzle, cell) {
  const r = rowOf(puzzle, cell), c = colOf(puzzle, cell);
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= puzzle.n || cc < 0 || cc >= puzzle.n) continue;
    const other = rr * puzzle.n + cc;
    if (zoneOf(puzzle, other) === zoneOf(puzzle, cell)) out.push(other);
  }
  return out;
}

// Diagonally adjacent, walkable, same zone as `cell` (§1).
function thiefSpots(puzzle, cell) {
  const r = rowOf(puzzle, cell), c = colOf(puzzle, cell);
  const out = [];
  for (const dr of [-1, 1]) {
    for (const dc of [-1, 1]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= puzzle.n || cc < 0 || cc >= puzzle.n) continue;
      const other = rr * puzzle.n + cc;
      if (isWalkable(puzzle, other) && zoneOf(puzzle, other) === zoneOf(puzzle, cell)) out.push(other);
    }
  }
  return out;
}

// §2: the crossing of the only hero-free row and the only hero-free column, else -1.
export function refSafe(puzzle, placement) {
  const n = puzzle.n;
  const freeRows = [];
  const freeCols = [];
  for (let r = 0; r < n; r++) {
    if (!placement.some((cell) => rowOf(puzzle, cell) === r)) freeRows.push(r);
  }
  for (let c = 0; c < n; c++) {
    if (!placement.some((cell) => colOf(puzzle, cell) === c)) freeCols.push(c);
  }
  if (freeRows.length !== 1 || freeCols.length !== 1) return -1;
  return freeRows[0] * n + freeCols[0];
}

// Heroes standing on a thiefSpot of the safe.
function heroesOnSpots(puzzle, placement, safe) {
  const spots = thiefSpots(puzzle, safe);
  const out = [];
  for (let h = 0; h < placement.length; h++) {
    if (spots.includes(placement[h])) out.push(h);
  }
  return out;
}

// Candidate test: injective on walkable cells, k = n - 1, R1, R0, R2.
export function refValid(puzzle, placement) {
  const n = puzzle.n;
  const k = puzzle.heroes.length;
  if (placement.length !== k || k !== n - 1) return false;
  for (const cell of placement) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= n * n) return false;
    if (!isWalkable(puzzle, cell)) return false;
  }
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      if (placement[a] === placement[b]) return false; // distinct cells
      // R1: no two heroes in the same row or column
      if (rowOf(puzzle, placement[a]) === rowOf(puzzle, placement[b])) return false;
      if (colOf(puzzle, placement[a]) === colOf(puzzle, placement[b])) return false;
    }
  }
  const safe = refSafe(puzzle, placement);
  if (safe === -1) return false;
  if (typeOf(puzzle, safe) !== 'ground') return false; // R0
  if (heroesOnSpots(puzzle, placement, safe).length !== 1) return false; // R2
  return true;
}

// R2: the one hero standing on a thiefSpot of the safe (assumes a valid placement).
export function refThief(puzzle, placement) {
  const safe = refSafe(puzzle, placement);
  return heroesOnSpots(puzzle, placement, safe)[0];
}

function zoneHeroes(puzzle, placement, hero) {
  const z = zoneOf(puzzle, placement[hero]);
  return placement.filter((cell) => zoneOf(puzzle, cell) === z).length;
}

// §5: truth of one statement in a placement (assumes a valid placement).
export function refEval(puzzle, placement, st) {
  if (st.type === 'alarm') {
    return zoneOf(puzzle, refSafe(puzzle, placement)) === st.zone;
  }
  const s = placement[st.who];
  const sr = rowOf(puzzle, s) + 1; // 1-based as in RULES
  const sc = colOf(puzzle, s) + 1;
  const h = st.hero === undefined ? undefined : placement[st.hero];
  const safe = refSafe(puzzle, placement);
  switch (st.type) {
    case 'inZone': return zoneOf(puzzle, s) === st.zone;
    case 'notInZone': return zoneOf(puzzle, s) !== st.zone;
    case 'on': return typeOf(puzzle, s) === st.cellType;
    case 'nextTo': return neighbours(puzzle, s).some((x) => typeOf(puzzle, x) === st.cellType);
    case 'notNextTo': return !neighbours(puzzle, s).some((x) => typeOf(puzzle, x) === st.cellType);
    case 'sees': {
      for (let cell = 0; cell < puzzle.n * puzzle.n; cell++) {
        if (typeOf(puzzle, cell) !== st.cellType) continue;
        if (rowOf(puzzle, cell) + 1 === sr || colOf(puzzle, cell) + 1 === sc) return true;
      }
      return false;
    }
    case 'row': return sr === st.n;
    case 'col': return sc === st.n;
    case 'northOf': return sr < rowOf(puzzle, h) + 1;
    case 'southOf': return sr > rowOf(puzzle, h) + 1;
    case 'westOf': return sc < colOf(puzzle, h) + 1;
    case 'eastOf': return sc > colOf(puzzle, h) + 1;
    case 'alone': return zoneHeroes(puzzle, placement, st.who) === 1;
    case 'zoneCount': return zoneHeroes(puzzle, placement, st.who) === st.n;
    case 'sameZone': return zoneOf(puzzle, s) === zoneOf(puzzle, h);
    case 'otherZone': return zoneOf(puzzle, s) !== zoneOf(puzzle, h);
    case 'northOfSafe': return sr < rowOf(puzzle, safe) + 1;
    case 'southOfSafe': return sr > rowOf(puzzle, safe) + 1;
    case 'westOfSafe': return sc < colOf(puzzle, safe) + 1;
    case 'eastOfSafe': return sc > colOf(puzzle, safe) + 1;
    case 'sameZoneSafe': return zoneOf(puzzle, s) === zoneOf(puzzle, safe);
    case 'otherZoneSafe': return zoneOf(puzzle, s) !== zoneOf(puzzle, safe);
    default: throw new Error(`unknown statement type ${st.type}`);
  }
}

const candidateCache = new WeakMap();

// All placements satisfying R1 + R0 + R2: depth-first over hero -> walkable cell, rejecting a cell as soon
// as it shares a cell, row or column with an earlier hero (that is exactly R1 + injectivity), and testing
// every complete placement with refValid. Cached per puzzle object (map and heroes must not change).
export function refCandidates(puzzle) {
  if (candidateCache.has(puzzle)) return candidateCache.get(puzzle);
  const n = puzzle.n;
  const k = puzzle.heroes.length;
  const walkable = [];
  for (let cell = 0; cell < n * n; cell++) if (isWalkable(puzzle, cell)) walkable.push(cell);
  const result = [];
  const placement = [];
  function place(h) {
    if (h === k) {
      if (refValid(puzzle, placement)) result.push(placement.slice());
      return;
    }
    for (const cell of walkable) {
      let clash = false;
      for (let g = 0; g < h; g++) {
        if (placement[g] === cell
          || rowOf(puzzle, placement[g]) === rowOf(puzzle, cell)
          || colOf(puzzle, placement[g]) === colOf(puzzle, cell)) { clash = true; break; }
      }
      if (clash) continue;
      placement[h] = cell;
      place(h + 1);
    }
    placement.length = h;
  }
  place(0);
  candidateCache.set(puzzle, result);
  return result;
}

// Candidates satisfying every statement of the puzzle.
export function refSolve(puzzle) {
  return refCandidates(puzzle).filter((p) => puzzle.statements.every((st) => refEval(puzzle, p, st)));
}

// Q5: false iff `st` is true in every candidate (no statement applied).
export function refInformative(puzzle, st) {
  return !refCandidates(puzzle).every((p) => refEval(puzzle, p, st));
}

