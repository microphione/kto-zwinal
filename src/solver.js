// Exact solver: backtracking with forward checking on 64-bit cell masks (two int32 words, n ≤ 8).
// Every placement it returns is re-checked with the plain evaluators (isValidPlacement + evaluate).
// `solve` works on the map with the safe in place; `solveHidden` branches over the hidden safe's cell.
import { getBoard, droneScan, withSafe, safeCandidates } from './board.js';
import { UNARY, PAIR, unaryHolds, pairHolds, evaluate, isValidPlacement } from './statements.js';

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

// Masks that depend only on the map (and the statement kind), kept per board: `solveHidden` builds the same
// tables for every safe cell again and again while the generator samples.
const tables = new WeakMap();
function boardTables(board) {
  let t = tables.get(board);
  if (!t) {
    const { size } = board;
    // Cells that become unavailable to everyone else once a hero stands on `i` (itself + its sight).
    const blockLo = new Int32Array(size), blockHi = new Int32Array(size);
    for (let i = 0; i < size; i++) [blockLo[i], blockHi[i]] = maskOf([i, ...board.sees[i]]);
    const [safeLo, safeHi] = maskOf(board.safeSpots);
    const zoneLo = [], zoneHi = [];
    for (const cells of board.zoneCells) {
      const [lo, hi] = maskOf(cells);
      zoneLo.push(lo);
      zoneHi.push(hi);
    }
    t = { blockLo, blockHi, safeLo, safeHi, zoneLo, zoneHi, all: maskOf(board.walkCells), unary: new Map(), pair: new Map() };
    tables.set(board, t);
  }
  return t;
}

// Walkable cells where a unary statement holds (its subject is irrelevant).
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

// `rng` (optional) randomises the cell order, used by the generator to sample diverse solutions.
// `maxNodes` bounds the search; `aborted: true` means the result is incomplete (proves nothing).
export function solve(puzzle, limit = 2, rng = null, maxNodes = Infinity) {
  const board = getBoard(puzzle);
  const k = puzzle.heroes.length;
  const statements = puzzle.statements;
  if (statements.some(st => st.type === 'alarm' && board.zone[board.safe] !== st.zone)) return { solutions: [], nodes: 0, aborted: false };

  const t = boardTables(board);
  const { blockLo, blockHi, safeLo, safeHi, zoneLo, zoneHi } = t;
  const [allLo, allHi] = t.all;
  const domLo = new Int32Array(k), domHi = new Int32Array(k);
  for (let h = 0; h < k; h++) {
    let lo = allLo, hi = allHi;
    for (const st of statements) {
      if (st.who !== h || !UNARY.has(st.type)) continue;
      const m = unaryMask(board, t, st);
      lo &= m[0];
      hi &= m[1];
    }
    domLo[h] = lo;
    domHi[h] = hi;
  }

  // links[h * k + g]: tables T with T[x] = cells allowed for g when h stands on x.
  const links = Array.from({ length: k * k }, () => []);
  for (const st of statements) {
    if (!PAIR.has(st.type)) continue;
    const { fwd, bwd } = pairTables(board, t, st.type);
    links[st.who * k + st.hero].push(fwd);
    links[st.hero * k + st.who].push(bwd);
  }
  const linked = [];
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b && links[a * k + b].length) linked.push([a, b]);

  const alone = new Array(k).fill(false);
  for (const st of statements) if (st.type === 'alone') alone[st.who] = true;
  const zoneCounts = statements.filter(st => st.type === 'zoneCount');
  const drones = statements.filter(st => st.type === 'drone').map(st => {
    const [lo, hi] = maskOf(droneScan(board, st.side, st.index));
    return { n: st.n, lo, hi };
  });

  const assigned = new Array(k).fill(-1);
  const solutions = [];
  let nodes = 0;
  let aborted = false;

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
    const [thieves, couldSteal] = countIn(safeLo, safeHi, dLo, dHi);
    if (thieves === 0 && couldSteal === 0) return false;
    for (const st of zoneCounts) {
      const cell = assigned[st.who];
      if (cell < 0) continue;
      const z = board.zone[cell];
      const [have, could] = countIn(zoneLo[z], zoneHi[z], dLo, dHi);
      if (have > st.n || have + could < st.n) return false;
    }
    for (const dr of drones) {
      const [have, could] = countIn(dr.lo, dr.hi, dLo, dHi);
      if (have > dr.n || have + could < dr.n) return false;
    }
    return true;
  };

  // One pass of arc consistency over pair statements between unplaced heroes.
  const revise = (dLo, dHi) => {
    for (const [a, b] of linked) {
      if (assigned[a] >= 0 || assigned[b] >= 0) continue;
      let lo = 0, hi = 0;
      for (const x of cellsOf(dLo[a], dHi[a])) {
        let ok = true;
        for (const t of links[a * k + b]) {
          if (((t.lo[x] & dLo[b]) | (t.hi[x] & dHi[b])) === 0) { ok = false; break; }
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
    for (let g = 0; g < k; g++) {
      if (assigned[g] >= 0) continue;
      const size2 = popcount(dLo[g]) + popcount(dHi[g]);
      if (size2 < best) { best = size2; h = g; }
    }
    if (h < 0) {
      const placement = assigned.slice();
      if (isValidPlacement(puzzle, placement) && statements.every(st => evaluate(puzzle, placement, st))) solutions.push(placement);
      return;
    }
    const order = cellsOf(dLo[h], dHi[h]);
    for (const x of rng ? rng.shuffle(order) : order) {
      if (++nodes > maxNodes) { aborted = true; return; }
      const z = board.zone[x];
      if (alone[h] && assigned.some((y, g) => g !== h && y >= 0 && board.zone[y] === z)) continue;
      assigned[h] = x;
      const nLo = dLo.slice(), nHi = dHi.slice();
      let ok = true;
      for (let g = 0; g < k && ok; g++) {
        if (assigned[g] >= 0) continue;
        let lo = nLo[g] & ~blockLo[x], hi = nHi[g] & ~blockHi[x];
        if (board.safeSpot[x]) { lo &= ~safeLo; hi &= ~safeHi; }
        if (alone[h] || alone[g]) { lo &= ~zoneLo[z]; hi &= ~zoneHi[z]; }
        for (const t of links[h * k + g]) { lo &= t.lo[x]; hi &= t.hi[x]; }
        if ((lo | hi) === 0) ok = false;
        nLo[g] = lo;
        nHi[g] = hi;
      }
      if (ok && revise(nLo, nHi) && feasible(nLo, nHi)) search(nLo, nHi);
      assigned[h] = -1;
      if (solutions.length >= limit || aborted) return;
    }
  };

  if (feasible(domLo, domHi)) search(domLo, domHi);
  return { solutions, nodes, aborted };
}

// Solutions { safe, placement } of a puzzle with a hidden safe (RULES.md §2); the node budget is shared by
// all safe cells. `rng` also randomises the order of the safe cells.
export function solveHidden(puzzle, limit = 2, rng = null, maxNodes = Infinity) {
  const alarms = puzzle.statements.filter(st => st.type === 'alarm');
  const board = getBoard(puzzle);
  const safes = safeCandidates(puzzle).filter(s => alarms.every(st => board.zone[s] === st.zone));
  const solutions = [];
  let nodes = 0;
  for (const safe of rng ? rng.shuffle(safes) : safes) {
    const res = solve(withSafe(puzzle, safe), limit - solutions.length, rng, maxNodes - nodes);
    nodes += res.nodes;
    for (const placement of res.solutions) solutions.push({ safe, placement });
    if (res.aborted) return { solutions, nodes, aborted: true };
    if (solutions.length >= limit) break;
  }
  return { solutions, nodes, aborted: false };
}

export function countSolutions(puzzle, limit = 2) {
  return solveHidden(puzzle, limit).solutions.length;
}
