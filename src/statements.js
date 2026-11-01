// Statement semantics (RULES.md §5) and enumeration of the true statements for a placement. The safe cell is
// derived from the placement (board.js `safeOf`); functions that need it take it as an argument.
import { getBoard, safeOf, OBSTACLE_TYPES } from './board.js';

// Hero vs the safe, as the direction / zone pair statement they mirror.
export const SAFE_PAIR = {
  northOfSafe: 'northOf', southOfSafe: 'southOf', westOfSafe: 'westOf', eastOfSafe: 'eastOf',
  sameZoneSafe: 'sameZone', otherZoneSafe: 'otherZone',
};
// Truth depends only on the subject's cell (the SAFE_PAIR kinds also on the safe).
export const UNARY = new Set(['inZone', 'notInZone', 'on', 'nextTo', 'notNextTo', 'sees', 'row', 'col', ...Object.keys(SAFE_PAIR)]);
// Truth depends on the subject's and one other hero's cell.
export const PAIR = new Set(['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone']);
// Truth depends on every hero in the subject's zone.
export const ZONE = new Set(['alone', 'zoneCount']);

export function unaryHolds(board, st, cell, safe = -1) {
  switch (st.type) {
    case 'inZone': return board.zone[cell] === st.zone;
    case 'notInZone': return board.zone[cell] !== st.zone;
    case 'on': return board.type[cell] === st.cellType;
    case 'nextTo': return board.nextTypes[cell].has(st.cellType);
    case 'notNextTo': return !board.nextTypes[cell].has(st.cellType);
    case 'sees': return board.lineTypes[cell].has(st.cellType);
    case 'row': return board.row(cell) === st.n;
    case 'col': return board.col(cell) === st.n;
  }
  if (SAFE_PAIR[st.type]) return pairHolds(board, { type: SAFE_PAIR[st.type] }, cell, safe);
  throw new Error(`not a unary statement: ${st.type}`);
}

export function pairHolds(board, st, a, b) {
  switch (st.type) {
    case 'northOf': return board.row(a) < board.row(b);
    case 'southOf': return board.row(a) > board.row(b);
    case 'westOf': return board.col(a) < board.col(b);
    case 'eastOf': return board.col(a) > board.col(b);
    case 'sameZone': return board.zone[a] === board.zone[b];
    case 'otherZone': return board.zone[a] !== board.zone[b];
  }
  throw new Error(`not a pair statement: ${st.type}`);
}

export function evaluate(puzzle, placement, st) {
  const board = getBoard(puzzle);
  const safe = safeOf(board, placement);
  if (st.type === 'alarm') return safe >= 0 && board.zone[safe] === st.zone;
  const cell = placement[st.who];
  if (SAFE_PAIR[st.type] && safe < 0) return false;
  if (UNARY.has(st.type)) return unaryHolds(board, st, cell, safe);
  if (PAIR.has(st.type)) return pairHolds(board, st, cell, placement[st.hero]);
  const inZone = placement.filter(x => board.zone[x] === board.zone[cell]).length;
  if (st.type === 'alone') return inZone === 1;
  if (st.type === 'zoneCount') return inZone === st.n;
  throw new Error(`unknown statement: ${st.type}`);
}

// Distinct walkable cells + R1 + R0 + R2 (RULES.md §2, §4).
export function isValidPlacement(puzzle, placement) {
  const board = getBoard(puzzle);
  if (placement.length !== board.n - 1) return false;
  if (new Set(placement).size !== placement.length) return false;
  if (!placement.every(cell => board.walk[cell])) return false;
  if (new Set(placement.map(board.row)).size !== placement.length) return false;
  if (new Set(placement.map(board.col)).size !== placement.length) return false;
  const safe = safeOf(board, placement);
  if (safe < 0 || board.type[safe] !== 'ground') return false;
  return placement.filter(cell => board.thiefSpots[safe].includes(cell)).length === 1;
}

export function thiefOf(puzzle, placement) {
  const board = getBoard(puzzle);
  const safe = safeOf(board, placement);
  return placement.findIndex(cell => board.thiefSpots[safe].includes(cell));
}

// Every statement true for `placement`, excluding ones that are true for every walkable cell (RULES.md §5
// notes, Q5). Symmetric pairs are kept in both directions; the generator avoids picking both.
export function trueStatements(puzzle, placement) {
  const board = getBoard(puzzle);
  const safe = safeOf(board, placement);
  const k = placement.length;
  const zoneCount = puzzle.zoneNames.length;
  const out = [];
  const cellStatements = [];
  for (let z = 0; z < zoneCount; z++) cellStatements.push({ type: 'inZone', zone: z }, { type: 'notInZone', zone: z });
  for (const t of ['ground', 'bush', 'pad']) cellStatements.push({ type: 'on', cellType: t });
  for (const t of OBSTACLE_TYPES) {
    cellStatements.push({ type: 'nextTo', cellType: t }, { type: 'notNextTo', cellType: t }, { type: 'sees', cellType: t });
  }
  for (let x = 1; x <= board.n; x++) cellStatements.push({ type: 'row', n: x }, { type: 'col', n: x });
  const informative = cellStatements.filter(st => {
    const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
    return hits > 0 && hits < board.walkCells.length;
  });

  for (let who = 0; who < k; who++) {
    const cell = placement[who];
    for (const st of informative) if (unaryHolds(board, st, cell)) out.push({ ...st, who });
    for (const type of Object.keys(SAFE_PAIR)) if (unaryHolds(board, { type }, cell, safe)) out.push({ type, who });
    for (let hero = 0; hero < k; hero++) {
      if (hero === who) continue;
      for (const type of PAIR) {
        const st = { type, who, hero };
        if (pairHolds(board, st, cell, placement[hero])) out.push(st);
      }
    }
    const inZone = placement.filter(x => board.zone[x] === board.zone[cell]).length;
    out.push(inZone === 1 ? { type: 'alone', who } : { type: 'zoneCount', who, n: inZone });
  }
  out.push({ type: 'alarm', zone: board.zone[safe] });
  return out;
}

export function sameStatement(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}
