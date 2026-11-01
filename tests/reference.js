// Independent brute-force reference for RULES.md v2 (hidden safe). Shares no code with src/.
// Clarity over speed: every predicate is a literal reading of the spec.

const OBSTACLES = ['crate', 'barrel', 'rock'];

// Type of a cell on the map with the safe in place.
function typeAt(puzzle, safe, idx) {
  if (idx === safe) return 'safe';
  const n = puzzle.n;
  return puzzle.cells[Math.floor(idx / n)][idx % n];
}

function isBlocking(puzzle, safe, idx) {
  const t = typeAt(puzzle, safe, idx);
  return t === 'safe' || OBSTACLES.includes(t);
}

const isWalkable = (puzzle, safe, idx) => !isBlocking(puzzle, safe, idx);
const rowOf = (puzzle, idx) => Math.floor(idx / puzzle.n);
const colOf = (puzzle, idx) => idx % puzzle.n;
const zoneOf = (puzzle, idx) => puzzle.zones[rowOf(puzzle, idx)][colOf(puzzle, idx)];

// Orthogonally adjacent AND same zone (diagonals never).
function neighbours(puzzle, idx) {
  const n = puzzle.n;
  const r = rowOf(puzzle, idx);
  const c = colOf(puzzle, idx);
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
    if (puzzle.zones[rr][cc] === puzzle.zones[r][c]) out.push(rr * n + cc);
  }
  return out;
}

// §3: same row/column and every cell strictly between is walkable.
function sees(puzzle, safe, a, b) {
  if (a === b) return false;
  const ra = rowOf(puzzle, a), ca = colOf(puzzle, a);
  const rb = rowOf(puzzle, b), cb = colOf(puzzle, b);
  if (ra !== rb && ca !== cb) return false;
  const dr = Math.sign(rb - ra);
  const dc = Math.sign(cb - ca);
  let r = ra + dr;
  let c = ca + dc;
  while (r !== rb || c !== cb) {
    if (isBlocking(puzzle, safe, r * puzzle.n + c)) return false;
    r += dr;
    c += dc;
  }
  return true;
}

function safeSpots(puzzle, safe) {
  return neighbours(puzzle, safe).filter((i) => isWalkable(puzzle, safe, i));
}

// §5.1: first blocking cell in each of the 4 directions; its type, or null.
function seenTypes(puzzle, safe, cell) {
  const n = puzzle.n;
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let r = rowOf(puzzle, cell) + dr;
    let c = colOf(puzzle, cell) + dc;
    while (r >= 0 && r < n && c >= 0 && c < n) {
      const idx = r * n + c;
      if (isBlocking(puzzle, safe, idx)) {
        out.push(typeAt(puzzle, safe, idx));
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return out;
}

// §5.2: cells covered by a drone scan.
function droneCells(puzzle, safe, side, index) {
  const n = puzzle.n;
  const i = index - 1;
  let r, c, dr, dc;
  if (side === 'W') { r = i; c = 0; dr = 0; dc = 1; }
  else if (side === 'E') { r = i; c = n - 1; dr = 0; dc = -1; }
  else if (side === 'N') { r = 0; c = i; dr = 1; dc = 0; }
  else { r = n - 1; c = i; dr = -1; dc = 0; }
  const cells = [];
  while (r >= 0 && r < n && c >= 0 && c < n && !isBlocking(puzzle, safe, r * n + c)) {
    cells.push(r * n + c);
    r += dr;
    c += dc;
  }
  return cells;
}

export function refEval(puzzle, safe, placement, st) {
  const P = puzzle;
  const k = placement.length;
  // Global statements first (no subject).
  if (kindOf(st) === 'drone') {
    const cells = droneCells(P, safe, st.side, st.index);
    let count = 0;
    for (const h of placement) if (cells.includes(h)) count++;
    return count === st.n;
  }
  if (kindOf(st) === 'alarm') return zoneOf(P, safe) === st.zone;

  const me = placement[st.who];
  const heroesInZone = (z) => placement.filter((h) => zoneOf(P, h) === z).length;
  switch (kindOf(st)) {
    case 'inZone': return zoneOf(P, me) === st.zone;
    case 'notInZone': return zoneOf(P, me) !== st.zone;
    case 'on': return typeAt(P, safe, me) === st.cellType;
    case 'nextTo':
      return neighbours(P, me).some((i) => typeAt(P, safe, i) === st.cellType);
    case 'notNextTo':
      return !neighbours(P, me).some((i) => typeAt(P, safe, i) === st.cellType);
    case 'sees': return seenTypes(P, safe, me).includes(st.cellType);
    case 'row': return rowOf(P, me) + 1 === st.n;
    case 'col': return colOf(P, me) + 1 === st.n;
    case 'northOf': return rowOf(P, me) < rowOf(P, placement[st.hero]);
    case 'southOf': return rowOf(P, me) > rowOf(P, placement[st.hero]);
    case 'westOf': return colOf(P, me) < colOf(P, placement[st.hero]);
    case 'eastOf': return colOf(P, me) > colOf(P, placement[st.hero]);
    case 'alone': return heroesInZone(zoneOf(P, me)) === 1;
    case 'zoneCount': return heroesInZone(zoneOf(P, me)) === st.n;
    case 'sameZone': return zoneOf(P, me) === zoneOf(P, placement[st.hero]);
    case 'otherZone': return zoneOf(P, me) !== zoneOf(P, placement[st.hero]);
    case 'northOfSafe': return rowOf(P, me) < rowOf(P, safe);
    case 'southOfSafe': return rowOf(P, me) > rowOf(P, safe);
    case 'westOfSafe': return colOf(P, me) < colOf(P, safe);
    case 'eastOfSafe': return colOf(P, me) > colOf(P, safe);
    case 'sameZoneSafe': return zoneOf(P, me) === zoneOf(P, safe);
    case 'otherZoneSafe': return zoneOf(P, me) !== zoneOf(P, safe);
    default: throw new Error(`refEval: unknown statement type ${kindOf(st)} (k=${k})`);
  }
}

export function refValid(puzzle, safe, placement) {
  if (typeAt(puzzle, -1, safe) !== 'ground') return false;
  if (new Set(placement).size !== placement.length) return false;
  for (const h of placement) {
    if (!Number.isInteger(h) || h < 0 || h >= puzzle.n * puzzle.n) return false;
    if (!isWalkable(puzzle, safe, h)) return false;
  }
  for (let a = 0; a < placement.length; a++) {
    for (let b = a + 1; b < placement.length; b++) {
      if (sees(puzzle, safe, placement[a], placement[b])) return false; // R1
    }
  }
  const spots = safeSpots(puzzle, safe);
  return placement.filter((h) => spots.includes(h)).length === 1; // R2
}

export function refThief(puzzle, safe, placement) {
  const spots = safeSpots(puzzle, safe);
  return placement.findIndex((h) => spots.includes(h));
}

// Enumerate every (safe, placement) satisfying R1 and R2, calling visit(safe, placement).
function forEachCandidate(puzzle, visit) {
  const total = puzzle.n * puzzle.n;
  const k = puzzle.heroes.length;
  for (let safe = 0; safe < total; safe++) {
    if (typeAt(puzzle, -1, safe) !== 'ground') continue;
    const spots = safeSpots(puzzle, safe);
    if (spots.length === 0) continue;
    const walkable = [];
    for (let i = 0; i < total; i++) if (isWalkable(puzzle, safe, i)) walkable.push(i);
    const placement = [];
    const rec = () => {
      if (placement.length === k) {
        if (placement.filter((h) => spots.includes(h)).length === 1) {
          visit(safe, placement.slice());
        }
        return;
      }
      for (const cell of walkable) {
        if (placement.includes(cell)) continue;
        if (placement.some((o) => sees(puzzle, safe, o, cell))) continue; // R1 prune
        placement.push(cell);
        rec();
        placement.pop();
      }
    };
    rec();
  }
}

export function refSolve(puzzle) {
  const out = [];
  forEachCandidate(puzzle, (safe, placement) => {
    if (puzzle.statements.every((st) => refEval(puzzle, safe, placement, st))) {
      out.push({ safe, placement });
    }
  });
  return out;
}

export function refCandidates(puzzle) {
  const out = [];
  forEachCandidate(puzzle, (safe, placement) => out.push({ safe, placement }));
  return out;
}

// Q5: truth value is not constant over Cand.
export function refInformative(puzzle, st) {
  let seenTrue = false;
  let seenFalse = false;
  for (const { safe, placement } of refCandidates(puzzle)) {
    if (refEval(puzzle, safe, placement, st)) seenTrue = true;
    else seenFalse = true;
    if (seenTrue && seenFalse) return true;
  }
  return false;
}

// The spec does not name the key holding the statement id; accept the usual spellings.
function kindOf(st) {
  return st.type ?? st.kind ?? st.id ?? st.t;
}
