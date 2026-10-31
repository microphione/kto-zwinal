// Exact solver: backtracking with forward checking on 64-bit cell masks (two int32 words, n ≤ 8).
// Every placement it returns is re-checked with the plain evaluators (isValidPlacement + evaluate).
import { getBoard, droneScan } from './board.js';
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

// `rng` (optional) randomises the cell order, used by the generator to sample diverse solutions.
// `maxNodes` bounds the search; `aborted: true` means the result is incomplete (proves nothing).
export function solve(puzzle, limit = 2, rng = null, maxNodes = Infinity) {
  const board = getBoard(puzzle);
  const { size } = board;
  const k = puzzle.heroes.length;
  const statements = puzzle.statements;

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

  const domLo = new Int32Array(k), domHi = new Int32Array(k);
  for (let h = 0; h < k; h++) {
    const unary = statements.filter(st => st.who === h && UNARY.has(st.type));
    [domLo[h], domHi[h]] = maskOf(board.walkCells.filter(cell => unary.every(st => unaryHolds(board, st, cell))));
  }

  // links[h * k + g]: tables T with T[x] = cells allowed for g when h stands on x.
  const links = Array.from({ length: k * k }, () => []);
  for (const st of statements) {
    if (!PAIR.has(st.type)) continue;
    const fwdLo = new Int32Array(size), fwdHi = new Int32Array(size);
    const bwdLo = new Int32Array(size), bwdHi = new Int32Array(size);
    for (const x of board.walkCells) {
      [fwdLo[x], fwdHi[x]] = maskOf(board.walkCells.filter(y => pairHolds(board, st, x, y)));
      [bwdLo[x], bwdHi[x]] = maskOf(board.walkCells.filter(y => pairHolds(board, st, y, x)));
    }
    links[st.who * k + st.hero].push({ lo: fwdLo, hi: fwdHi });
    links[st.hero * k + st.who].push({ lo: bwdLo, hi: bwdHi });
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

export function countSolutions(puzzle, limit = 2) {
  return solve(puzzle, limit).solutions.length;
}
