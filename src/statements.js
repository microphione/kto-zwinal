// Statement semantics (RULES.md §5) and enumeration of the true statements for a placement. No statement
// mentions the safe; `nobodyOn` is the only statement without a subject `who`.
import { getBoard, safeOf, isPlain, WALKABLE_TYPES, SPECIAL_TYPES, NON_PLAIN_TYPES } from './board.js';

// Truth depends only on the subject's cell.
export const UNARY = new Set(['inZone', 'notInZone', 'on', 'notOn', 'nextTo', 'notNextTo', 'row', 'col']);
// Truth depends on the subject's and one other hero's cell.
export const PAIR = new Set(['northOf', 'southOf', 'westOf', 'eastOf', 'sameZone', 'otherZone']);
// Truth depends on every hero in the subject's zone.
export const ZONE = new Set(['alone', 'zoneCount']);
// Conjunctions of unary statements over the heroes (RULES.md §5 notes): see `unaryParts`.
export const COMPOSITE = new Set(['onlyOn', 'aloneIn', 'nobodyOn']);

// A composite statement as one unary statement per hero, for `k` heroes: [{ hero, st }].
export function unaryParts(st, k) {
  const each = (self, other) => Array.from({ length: k }, (_, hero) => ({ hero, st: hero === st.who ? self : other }));
  switch (st.type) {
    case 'onlyOn': return each({ type: 'on', cellType: st.cellType }, { type: 'notOn', cellType: st.cellType });
    case 'aloneIn': return each({ type: 'inZone', zone: st.zone }, { type: 'notInZone', zone: st.zone });
    case 'nobodyOn': return each(null, { type: 'notOn', cellType: st.cellType });
  }
  throw new Error(`not a composite statement: ${st.type}`);
}

export function unaryHolds(board, st, cell) {
  switch (st.type) {
    case 'inZone': return board.zone[cell] === st.zone;
    case 'notInZone': return board.zone[cell] !== st.zone;
    case 'on': return board.type[cell] === st.cellType;
    case 'notOn': return board.type[cell] !== st.cellType;
    case 'nextTo': return board.nextTypes[cell].has(st.cellType);
    case 'notNextTo': return !board.nextTypes[cell].has(st.cellType);
    case 'row': return board.row(cell) === st.n;
    case 'col': return board.col(cell) === st.n;
  }
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

// Parameter domains of RULES.md §5; anything outside them is ill-formed and rejected.
const ZONE_PARAM = new Set(['inZone', 'notInZone', 'aloneIn']);
const TYPE_PARAM = { on: WALKABLE_TYPES, notOn: SPECIAL_TYPES, onlyOn: SPECIAL_TYPES, nobodyOn: SPECIAL_TYPES, nextTo: NON_PLAIN_TYPES, notNextTo: NON_PLAIN_TYPES };
export function checkStatement(puzzle, st) {
  const k = puzzle.heroes.length;
  const hero = h => Number.isInteger(h) && h >= 0 && h < k;
  const ok = (st.type === 'nobodyOn' ? st.who === undefined : hero(st.who)) && (
    ZONE_PARAM.has(st.type) ? Number.isInteger(st.zone) && st.zone >= 0 && st.zone < puzzle.zoneNames.length
      : Object.hasOwn(TYPE_PARAM, st.type) ? TYPE_PARAM[st.type].includes(st.cellType)
        : st.type === 'row' || st.type === 'col' ? Number.isInteger(st.n) && st.n >= 1 && st.n <= puzzle.n
          : PAIR.has(st.type) ? hero(st.hero) && st.hero !== st.who
            : st.type === 'zoneCount' ? Number.isInteger(st.n) && st.n >= 2 && st.n <= k
              : st.type === 'alone');
  if (!ok) throw new Error(`ill-formed statement: ${JSON.stringify(st)}`);
}
export const checkStatements = puzzle => puzzle.statements.forEach(st => checkStatement(puzzle, st));

export function evaluate(puzzle, placement, st) {
  checkStatement(puzzle, st);
  const board = getBoard(puzzle);
  if (COMPOSITE.has(st.type)) {
    return unaryParts(st, placement.length).every(p => !p.st || unaryHolds(board, p.st, placement[p.hero]));
  }
  const cell = placement[st.who];
  if (UNARY.has(st.type)) return unaryHolds(board, st, cell);
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
  if (safe < 0 || !isPlain(board.type[safe])) return false;
  return placement.filter(cell => board.thiefSpots[safe].includes(cell)).length === 1;
}

export function thiefOf(puzzle, placement) {
  const board = getBoard(puzzle);
  const safe = safeOf(board, placement);
  return placement.findIndex(cell => board.thiefSpots[safe].includes(cell));
}

// Every statement true for `placement`, excluding unary ones that are true for every walkable cell (RULES.md §5
// notes, Q5) and `nextTo t` / `notNextTo t` for a subject standing on `t` (generator convention, RULES.md §6).
// Symmetric pairs are kept in both directions; the generator avoids picking both.
export function trueStatements(puzzle, placement) {
  const board = getBoard(puzzle);
  const k = placement.length;
  const zoneCount = puzzle.zoneNames.length;
  const out = [];
  const cellStatements = [];
  for (let z = 0; z < zoneCount; z++) cellStatements.push({ type: 'inZone', zone: z }, { type: 'notInZone', zone: z });
  for (const t of WALKABLE_TYPES) cellStatements.push({ type: 'on', cellType: t });
  for (const t of SPECIAL_TYPES) cellStatements.push({ type: 'notOn', cellType: t });
  for (const t of NON_PLAIN_TYPES) cellStatements.push({ type: 'nextTo', cellType: t }, { type: 'notNextTo', cellType: t });
  for (let x = 1; x <= board.n; x++) cellStatements.push({ type: 'row', n: x }, { type: 'col', n: x });
  const informative = cellStatements.filter(st => {
    const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
    return hits > 0 && hits < board.walkCells.length;
  });
  const typeOf = cell => board.type[cell];
  const onBoard = new Set(board.type);

  for (let who = 0; who < k; who++) {
    const cell = placement[who];
    for (const st of informative) {
      if ((st.type === 'nextTo' || st.type === 'notNextTo') && st.cellType === typeOf(cell)) continue;
      if (unaryHolds(board, st, cell)) out.push({ ...st, who });
    }
    for (let hero = 0; hero < k; hero++) {
      if (hero === who) continue;
      for (const type of PAIR) {
        const st = { type, who, hero };
        if (pairHolds(board, st, cell, placement[hero])) out.push(st);
      }
    }
    const inZone = placement.filter(x => board.zone[x] === board.zone[cell]).length;
    out.push(inZone === 1 ? { type: 'alone', who } : { type: 'zoneCount', who, n: inZone });
    if (inZone === 1) out.push({ type: 'aloneIn', who, zone: board.zone[cell] });
    if (SPECIAL_TYPES.includes(typeOf(cell)) && placement.filter(x => typeOf(x) === typeOf(cell)).length === 1) {
      out.push({ type: 'onlyOn', who, cellType: typeOf(cell) });
    }
  }
  for (const t of SPECIAL_TYPES) {
    if (onBoard.has(t) && !placement.some(x => typeOf(x) === t)) out.push({ type: 'nobodyOn', cellType: t });
  }
  return out;
}

export function sameStatement(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}
