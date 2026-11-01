// Statement semantics (RULES.md §5) and enumeration of the true statements for a placement. Every function
// here takes the puzzle on the map with the safe in place (board.js `withSafe`).
import { getBoard, droneScan, OBSTACLE_TYPES, BLOCKING_TYPES, SIDES } from './board.js';

// Hero vs the safe, as the direction / zone pair statement they mirror.
export const SAFE_PAIR = {
  northOfSafe: 'northOf', southOfSafe: 'southOf', westOfSafe: 'westOf', eastOfSafe: 'eastOf',
  sameZoneSafe: 'sameZone', otherZoneSafe: 'otherZone',
};
// Truth depends only on the subject's cell (and on the safe).
export const UNARY = new Set(['inZone', 'notInZone', 'on', 'nextTo', 'notNextTo', 'sees', 'row', 'col', ...Object.keys(SAFE_PAIR)]);
// Truth depends on the subject's and one other hero's cell.
export const PAIR = new Set(['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone']);
// Truth depends on every hero in the subject's zone.
export const ZONE = new Set(['alone', 'zoneCount']);

export function unaryHolds(board, st, cell) {
  switch (st.type) {
    case 'inZone': return board.zone[cell] === st.zone;
    case 'notInZone': return board.zone[cell] !== st.zone;
    case 'on': return board.type[cell] === st.cellType;
    case 'nextTo': return board.nextTypes[cell].has(st.cellType);
    case 'notNextTo': return !board.nextTypes[cell].has(st.cellType);
    case 'sees': return board.seenTypes[cell].has(st.cellType);
    case 'row': return board.row(cell) === st.n;
    case 'col': return board.col(cell) === st.n;
  }
  if (SAFE_PAIR[st.type]) return pairHolds(board, { type: SAFE_PAIR[st.type] }, cell, board.safe);
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
  if (st.type === 'drone') {
    const scan = droneScan(board, st.side, st.index);
    return placement.filter(cell => scan.includes(cell)).length === st.n;
  }
  if (st.type === 'alarm') return board.zone[board.safe] === st.zone;
  const cell = placement[st.who];
  if (UNARY.has(st.type)) return unaryHolds(board, st, cell);
  if (PAIR.has(st.type)) return pairHolds(board, st, cell, placement[st.hero]);
  const inZone = placement.filter(x => board.zone[x] === board.zone[cell]).length;
  if (st.type === 'alone') return inZone === 1;
  if (st.type === 'zoneCount') return inZone === st.n;
  throw new Error(`unknown statement: ${st.type}`);
}

// R1 + R2 + distinct walkable cells.
export function isValidPlacement(puzzle, placement) {
  const board = getBoard(puzzle);
  if (new Set(placement).size !== placement.length) return false;
  if (!placement.every(cell => board.walk[cell])) return false;
  for (let i = 0; i < placement.length; i++) {
    for (let j = i + 1; j < placement.length; j++) if (board.seesSet[placement[i]].has(placement[j])) return false;
  }
  return placement.filter(cell => board.safeSpot[cell]).length === 1;
}

export function thiefOf(puzzle, placement) {
  const board = getBoard(puzzle);
  return placement.findIndex(cell => board.safeSpot[cell]);
}

// Every statement true for `placement`, excluding ones that are true for every walkable cell or
// that the rules forbid (RULES.md §5 notes, Q5). Symmetric pairs are kept in both directions;
// the generator avoids picking both.
export function trueStatements(puzzle, placement) {
  const board = getBoard(puzzle);
  const k = placement.length;
  const zoneCount = puzzle.zoneNames.length;
  const out = [];
  const unaryCandidates = [];
  for (let z = 0; z < zoneCount; z++) unaryCandidates.push({ type: 'inZone', zone: z }, { type: 'notInZone', zone: z });
  for (const t of ['ground', 'bush', 'pad']) unaryCandidates.push({ type: 'on', cellType: t });
  for (const t of OBSTACLE_TYPES) unaryCandidates.push({ type: 'nextTo', cellType: t }, { type: 'notNextTo', cellType: t });
  for (const t of BLOCKING_TYPES) unaryCandidates.push({ type: 'sees', cellType: t });
  for (let x = 1; x <= board.n; x++) unaryCandidates.push({ type: 'row', n: x }, { type: 'col', n: x });
  for (const type of Object.keys(SAFE_PAIR)) unaryCandidates.push({ type });
  const informative = unaryCandidates.filter(st => {
    const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
    return hits > 0 && hits < board.walkCells.length;
  });

  for (let who = 0; who < k; who++) {
    const cell = placement[who];
    for (const st of informative) if (unaryHolds(board, st, cell)) out.push({ ...st, who });
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
  for (const side of SIDES) {
    for (let index = 1; index <= board.n; index++) {
      const scan = droneScan(board, side, index);
      if (scan.length === 0) continue;
      out.push({ type: 'drone', side, index, n: placement.filter(cell => scan.includes(cell)).length });
    }
  }
  out.push({ type: 'alarm', zone: board.zone[board.safe] });
  return out;
}

export function sameStatement(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}
