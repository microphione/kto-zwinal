// Exact solver: backtracking with forward checking on 64-bit cell masks (two int32 words, n ≤ 8).
// The safe is searched as one more piece (index k): heroes and the safe are N pieces in N rows and N columns,
// one per row and column (RULES.md §2, R1). Every placement returned is re-checked with the plain evaluators
// (isValidPlacement + evaluate).
import { getBoard } from './board.js';
import { UNARY, PAIR, SAFE_PAIR, unaryHolds, pairHolds, evaluate, isValidPlacement } from './statements.js';

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

function cellsOf(lo, hi) {
  const out = [];
  for (let m = lo; m !== 0; m &= m - 1) out.push(31 - Math.clz32(m & -m));
  for (let m = hi; m !== 0; m &= m - 1) out.push(32 + 31 - Math.clz32(m & -m));
  return out;
}

function maskOf(cells) {
  let lo = 0, hi = 0;
  for (const i of cells) {
    if (i < 32) lo |= 1 << i;
    else hi |= 1 << (i - 32);
  }
  return [lo, hi];
}

// Masks that depend only on the map (and the statement kind), kept per board.
const tables = new WeakMap();
function boardTables(board) {
  let t = tables.get(board);
  if (!t) {
    const { size, n } = board;
    // Cells unavailable to every other piece once a piece stands on `i`: its row and column.
    const blockLo = new Int32Array(size), blockHi = new Int32Array(size);
    const spotLo = new Int32Array(size), spotHi = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      const r = Math.floor(i / n), c = i % n;
      const line = [];
      for (let x = 0; x < n; x++) line.push(r * n + x, x * n + c);
      [blockLo[i], blockHi[i]] = maskOf(line);
      [spotLo[i], spotHi[i]] = maskOf(board.thiefSpots[i]);
    }
    const zoneLo = [], zoneHi = [];
    for (const cells of board.zoneCells) {
      const [lo, hi] = maskOf(cells);
      zoneLo.push(lo);
      zoneHi.push(hi);
    }
    // R0 + R2: the safe stands on ground with at least one thief spot.
    const safeCells = board.walkCells.filter(s => board.type[s] === 'ground' && board.thiefSpots[s].length > 0);
    t = { blockLo, blockHi, spotLo, spotHi, zoneLo, zoneHi, all: maskOf(board.walkCells), safeCells, unary: new Map(), pair: new Map() };
    tables.set(board, t);
  }
  return t;
}

// Walkable cells where a statement about the subject's own cell holds.
function unaryMask(board, t, st) {
  const id = `${st.type}|${st.zone}|${st.cellType}|${st.n}`;
  let m = t.unary.get(id);
  if (!m) t.unary.set(id, m = maskOf(board.walkCells.filter(cell => unaryHolds(board, st, cell))));
  return m;
}

// Pair tables per statement kind: fwd[x] = cells y with st(x, y), bwd[x] = cells y with st(y, x).
function pairTables(board, t, type) {
  let p = t.pair.get(type);
  if (!p) {
    const { size } = board;
    const st = { type };
    const fwdLo = new Int32Array(size), fwdHi = new Int32Array(size);
    const bwdLo = new Int32Array(size), bwdHi = new Int32Array(size);
    for (const x of board.walkCells) {
      [fwdLo[x], fwdHi[x]] = maskOf(board.walkCells.filter(y => pairHolds(board, st, x, y)));
      [bwdLo[x], bwdHi[x]] = maskOf(board.walkCells.filter(y => pairHolds(board, st, y, x)));
    }
    t.pair.set(type, p = { fwd: { lo: fwdLo, hi: fwdHi }, bwd: { lo: bwdLo, hi: bwdHi } });
  }
  return p;
}

// Returns { solutions: [placement], nodes, aborted }; the safe cell of a solution is `safeOf(board, placement)`.
// `rng` (optional) randomises the cell order, used by the generator to sample diverse solutions.
// `maxNodes` bounds the search; `aborted: true` means the result is incomplete (proves nothing).
export function solve(puzzle, limit = 2, rng = null, maxNodes = Infinity) {
  const board = getBoard(puzzle);
  const k = puzzle.heroes.length;
  const S = k;
  const pieces = k + 1;
  const statements = puzzle.statements;

  const t = boardTables(board);
  const { blockLo, blockHi, spotLo, spotHi, zoneLo, zoneHi } = t;
  const [allLo, allHi] = t.all;
  const domLo = new Int32Array(pieces), domHi = new Int32Array(pieces);
  for (let h = 0; h < k; h++) {
    let lo = allLo, hi = allHi;
    for (const st of statements) {
      if (st.who !== h || !UNARY.has(st.type) || SAFE_PAIR[st.type]) continue;
      const m = unaryMask(board, t, st);
      lo &= m[0];
      hi &= m[1];
    }
    domLo[h] = lo;
    domHi[h] = hi;
  }
  const alarms = statements.filter(st => st.type === 'alarm');
  [domLo[S], domHi[S]] = maskOf(t.safeCells.filter(s => alarms.every(st => board.zone[s] === st.zone)));

  // links[a * pieces + b]: tables T with T[x] = cells allowed for b when a stands on x.
  const links = Array.from({ length: pieces * pieces }, () => []);
  const link = (type, a, b) => {
    const { fwd, bwd } = pairTables(board, t, type);
    links[a * pieces + b].push(fwd);
    links[b * pieces + a].push(bwd);
  };
  for (const st of statements) {
    if (PAIR.has(st.type)) link(st.type, st.who, st.hero);
    else if (SAFE_PAIR[st.type]) link(SAFE_PAIR[st.type], st.who, S);
  }
  const linked = [];
  for (let a = 0; a < pieces; a++) for (let b = 0; b < pieces; b++) if (a !== b && links[a * pieces + b].length) linked.push([a, b]);

  const alone = new Array(pieces).fill(false);
  for (const st of statements) if (st.type === 'alone') alone[st.who] = true;
  const zoneCounts = statements.filter(st => st.type === 'zoneCount');

  const assigned = new Array(pieces).fill(-1);
  const solutions = [];
  let nodes = 0;
  let aborted = false;

  // Heroes surely / possibly on the cells of a mask.
  const countIn = (lo, hi, dLo, dHi) => {
    let have = 0, could = 0;
    for (let h = 0; h < k; h++) {
      const x = assigned[h];
      if (x >= 0) {
        if (x < 32 ? lo & (1 << x) : hi & (1 << (x - 32))) have++;
      } else if ((dLo[h] & lo) | (dHi[h] & hi)) could++;
    }
    return [have, could];
  };

  const feasible = (dLo, dHi) => {
    const s = assigned[S];
    if (s >= 0) {
      const [thieves, could] = countIn(spotLo[s], spotHi[s], dLo, dHi);
      if (thieves > 1 || thieves + could === 0) return false;
    }
    for (const st of zoneCounts) {
      const cell = assigned[st.who];
      if (cell < 0) continue;
      const z = board.zone[cell];
      const [have, could] = countIn(zoneLo[z], zoneHi[z], dLo, dHi);
      if (have > st.n || have + could < st.n) return false;
    }
    return true;
  };

  // One pass of arc consistency over pair statements between unplaced pieces.
  const revise = (dLo, dHi) => {
    for (const [a, b] of linked) {
      if (assigned[a] >= 0 || assigned[b] >= 0) continue;
      let lo = 0, hi = 0;
      for (const x of cellsOf(dLo[a], dHi[a])) {
        let ok = true;
        for (const tb of links[a * pieces + b]) {
          if (((tb.lo[x] & dLo[b]) | (tb.hi[x] & dHi[b])) === 0) { ok = false; break; }
        }
        if (ok) {
          if (x < 32) lo |= 1 << x;
          else hi |= 1 << (x - 32);
        }
      }
      if ((lo | hi) === 0) return false;
      dLo[a] = lo;
      dHi[a] = hi;
    }
    return true;
  };

  const search = (dLo, dHi) => {
    let h = -1, best = Infinity;
    for (let g = 0; g < pieces; g++) {
      if (assigned[g] >= 0) continue;
      const size2 = popcount(dLo[g]) + popcount(dHi[g]);
      if (size2 < best) { best = size2; h = g; }
    }
    if (h < 0) {
      const placement = assigned.slice(0, k);
      if (isValidPlacement(puzzle, placement) && statements.every(st => evaluate(puzzle, placement, st))) solutions.push(placement);
      return;
    }
    const order = cellsOf(dLo[h], dHi[h]);
    for (const x of rng ? rng.shuffle(order) : order) {
      if (++nodes > maxNodes) { aborted = true; return; }
      const z = board.zone[x];
      if (h < k && alone[h] && assigned.some((y, g) => g !== h && g < k && y >= 0 && board.zone[y] === z)) continue;
      assigned[h] = x;
      const nLo = dLo.slice(), nHi = dHi.slice();
      let ok = true;
      for (let g = 0; g < pieces && ok; g++) {
        if (assigned[g] >= 0) continue;
        let lo = nLo[g] & ~blockLo[x], hi = nHi[g] & ~blockHi[x];
        if (h < k && g < k && (alone[h] || alone[g])) { lo &= ~zoneLo[z]; hi &= ~zoneHi[z]; }
        for (const tb of links[h * pieces + g]) { lo &= tb.lo[x]; hi &= tb.hi[x]; }
        if ((lo | hi) === 0) ok = false;
        nLo[g] = lo;
        nHi[g] = hi;
      }
      if (ok && revise(nLo, nHi) && feasible(nLo, nHi)) search(nLo, nHi);
      assigned[h] = -1;
      if (solutions.length >= limit || aborted) return;
    }
  };

  if (pieces === board.n && (domLo[S] | domHi[S]) !== 0 && feasible(domLo, domHi)) search(domLo, domHi);
  return { solutions, nodes, aborted };
}

export function countSolutions(puzzle, limit = 2) {
  return solve(puzzle, limit).solutions.length;
}
