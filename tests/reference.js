// Independent brute-force reference for RULES.md v4 (map clues, furniture, houses and outdoor settings).
// Shares no code with src/. Clarity over speed: every predicate is a literal reading of the spec.
// Cell index = r * n + c (0-based); RULES rows/columns (`row`/`col` parameters) are 1-based.


// §1 table: the catalogue of cell types with their walkable / plain flags.
const WALKABLE_TYPES = ['floor', 'bed', 'armchair', 'rug', 'grass', 'bush', 'bench'];
const OBSTACLE_TYPES = ['table', 'wardrobe', 'plant', 'tree', 'rock', 'pond'];
const PLAIN_TYPES = ['floor', 'grass'];
const ALL_TYPES = [...WALKABLE_TYPES, ...OBSTACLE_TYPES];
const SPECIAL_TYPES = WALKABLE_TYPES.filter((t) => !PLAIN_TYPES.includes(t)); // walkable and not plain
const NON_PLAIN_TYPES = ALL_TYPES.filter((t) => !PLAIN_TYPES.includes(t)); // obstacles + special

function rowOf(puzzle, cell) { return Math.floor(cell / puzzle.n); }
function colOf(puzzle, cell) { return cell % puzzle.n; }
function typeOf(puzzle, cell) {
  const t = puzzle.cells[rowOf(puzzle, cell)][colOf(puzzle, cell)];
  if (!ALL_TYPES.includes(t)) throw new Error(`unknown cell type ${t}`);
  return t;
}
function zoneOf(puzzle, cell) { return puzzle.zones[rowOf(puzzle, cell)][colOf(puzzle, cell)]; }
function isWalkable(puzzle, cell) { return WALKABLE_TYPES.includes(typeOf(puzzle, cell)); }
function isPlain(puzzle, cell) { return PLAIN_TYPES.includes(typeOf(puzzle, cell)); }

// Orthogonally adjacent cells in the same zone (§1; obstacle cells included).
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
  if (!isPlain(puzzle, safe)) return false; // R0: the safe stands on floor or grass
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

// §5: a hero parameter (subject or referenced hero) must be a hero of the puzzle.
function checkHero(puzzle, h, what) {
  if (!Number.isInteger(h) || h < 0 || h >= puzzle.heroes.length) throw new Error(`ill-formed statement: bad ${what} ${h}`);
}

// §5: a statement whose parameter is outside the domain of its row is ill-formed -> throw.
function checkWellFormed(puzzle, st) {
  const n = puzzle.n;
  const k = puzzle.heroes.length;
  const needZone = () => {
    if (!Number.isInteger(st.zone) || st.zone < 0 || st.zone >= puzzle.zoneNames.length) {
      throw new Error(`ill-formed statement: bad zone ${st.zone} in ${st.type}`);
    }
  };
  const needType = (domain, label) => {
    if (!domain.includes(st.cellType)) throw new Error(`ill-formed statement: ${st.type} ${st.cellType} is not a ${label} type`);
  };
  const needRange = (lo, hi) => {
    if (!Number.isInteger(st.n) || st.n < lo || st.n > hi) throw new Error(`ill-formed statement: ${st.type} n=${st.n} outside ${lo}..${hi}`);
  };
  const needOtherHero = () => {
    checkHero(puzzle, st.hero, 'hero');
    if (st.hero === st.who) throw new Error(`ill-formed statement: ${st.type} names its own subject`);
  };
  if (st.type !== 'nobodyOn') checkHero(puzzle, st.who, 'subject');
  switch (st.type) {
    case 'inZone': case 'notInZone': case 'aloneIn': needZone(); break;
    case 'on': needType(WALKABLE_TYPES, 'walkable'); break;
    case 'notOn': case 'onlyOn': case 'nobodyOn': needType(SPECIAL_TYPES, 'special'); break;
    case 'nextTo': case 'notNextTo': needType(NON_PLAIN_TYPES, 'non-plain'); break;
    case 'row': case 'col': needRange(1, n); break;
    case 'northOf': case 'southOf': case 'westOf': case 'eastOf': case 'sameZone': case 'otherZone': needOtherHero(); break;
    case 'alone': break;
    case 'zoneCount': needRange(2, k); break;
    default: throw new Error(`unknown statement type ${st.type}`);
  }
}

// §5: truth of one statement in a placement (assumes a valid placement). Throws on an ill-formed statement.
export function refEval(puzzle, placement, st) {
  checkWellFormed(puzzle, st);
  if (st.type === 'nobodyOn') {
    // no hero stands on any cell of type t
    return placement.every((cell) => typeOf(puzzle, cell) !== st.cellType);
  }
  const s = placement[st.who];
  const sr = rowOf(puzzle, s) + 1; // 1-based as in RULES
  const sc = colOf(puzzle, s) + 1;
  const h = st.hero === undefined ? undefined : placement[st.hero];
  const others = placement.filter((_, i) => i !== st.who); // others(S): cells of every hero except S
  switch (st.type) {
    case 'inZone': return zoneOf(puzzle, s) === st.zone;
    case 'notInZone': return zoneOf(puzzle, s) !== st.zone;
    case 'aloneIn': return zoneOf(puzzle, s) === st.zone && !others.some((x) => zoneOf(puzzle, x) === st.zone);
    case 'on': return typeOf(puzzle, s) === st.cellType;
    case 'notOn': return typeOf(puzzle, s) !== st.cellType;
    case 'onlyOn': return typeOf(puzzle, s) === st.cellType && !others.some((x) => typeOf(puzzle, x) === st.cellType);
    case 'nextTo': return neighbours(puzzle, s).some((x) => typeOf(puzzle, x) === st.cellType);
    case 'notNextTo': return !neighbours(puzzle, s).some((x) => typeOf(puzzle, x) === st.cellType);
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

// Q5: false iff `st` (with its own subject and parameters, `nobodyOn` included) is true in every candidate
// (no statement applied).
export function refInformative(puzzle, st) {
  return !refCandidates(puzzle).every((p) => refEval(puzzle, p, st));
}
