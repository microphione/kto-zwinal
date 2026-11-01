// Human-style step solver (PLAN.md stages 3 and 9, RULES.md Q3): candidate cells per hero and for the safe,
// sound techniques applied cheapest first, every step logged so it can be explained as a hint. Level 3
// ("trial") is a single assumption refuted by levels 1–2; it is never nested.
// Variables 0..k−1 are the heroes, variable k is the safe: N pieces, one in every row and every column
// (R1 with k = N − 1 heroes, RULES.md §2).
import { getBoard, safeOf } from './board.js';
import { UNARY, PAIR, SAFE_PAIR, unaryHolds, pairHolds, evaluate, isValidPlacement } from './statements.js';
import { createRng } from './rng.js';

export const LEVEL = { statements: 1, fixed: 1, line: 1, thief: 1, pair: 2, block: 2, subset: 2, zone: 2, trial: 3 };

class Contradiction extends Error {
  constructor(reason) {
    super('contradiction');
    this.reason = reason;
  }
}

function setup(puzzle) {
  const board = getBoard(puzzle);
  const k = puzzle.heroes.length;
  const st = puzzle.statements.map((s, sid) => ({ ...s, sid })); // sid: position in puzzle.statements
  return {
    puzzle,
    board,
    k,
    S: k,
    n: board.n,
    spots: board.thiefSpots.map(list => new Set(list)),
    unary: st.filter(s => UNARY.has(s.type) && !SAFE_PAIR[s.type]),
    bySafe: st.filter(s => SAFE_PAIR[s.type]), // the speaker's cell against the safe's cell
    alarms: st.filter(s => s.type === 'alarm'),
    pairs: st.filter(s => PAIR.has(s.type)),
    zoneStatements: st.filter(s => s.type === 'alone' || s.type === 'zoneCount'),
    alone: new Set(st.filter(s => s.type === 'alone').map(s => s.who)),
  };
}

const rowOf = (ctx, x) => Math.floor(x / ctx.n);
const colOf = (ctx, x) => x % ctx.n;
// Two pieces on x and y break neither R1 nor the one-piece-per-line rule.
const apart = (ctx, x, y) => rowOf(ctx, x) !== rowOf(ctx, y) && colOf(ctx, x) !== colOf(ctx, y);

// Shared state of one propagation: domains plus (optionally) the step log.
class State {
  constructor(ctx, dom, log) {
    this.ctx = ctx;
    this.dom = dom;
    this.log = log;
    this.done = new Set(); // fixed variables whose consequences were applied
    this.lastWrite = Array.from({ length: ctx.k + 1 }, () => []);
  }

  clone() {
    const s = new State(this.ctx, this.dom.map(d => new Set(d)), null);
    s.done = new Set(this.done);
    return s;
  }

  // Applies one step: `changes` = [{ hero, keep: cell => bool }]. Returns true if anything changed.
  apply(step, changes, reads) {
    const effects = [];
    for (const { hero, keep } of changes) {
      const removed = [...this.dom[hero]].filter(c => !keep(c));
      if (!removed.length) continue;
      for (const c of removed) this.dom[hero].delete(c);
      effects.push({ hero, removed, left: [...this.dom[hero]] });
      if (this.dom[hero].size === 0) throw new Contradiction({ type: 'empty', hero });
    }
    if (!effects.length) return false;
    if (this.log) {
      const idx = this.log.length;
      const deps = new Set();
      // A step depends on what it read and on every earlier narrowing of the variables it narrows.
      for (const h of reads) for (const d of this.lastWrite[h]) deps.add(d);
      for (const e of effects) for (const d of this.lastWrite[e.hero]) deps.add(d);
      for (const e of effects) this.lastWrite[e.hero].push(idx);
      this.log.push({ ...step, level: LEVEL[step.tech], effects, deps: [...deps] });
    }
    return true;
  }
}

const HEROES = ctx => [...Array(ctx.k).keys()];
const PIECES = ctx => [...Array(ctx.k + 1).keys()];

function initialDomains(ctx, facts) {
  const { board } = ctx;
  const dom = HEROES(ctx).map(() => new Set(board.walkCells));
  // R0, and R2 needs at least one thief spot.
  dom.push(new Set(board.walkCells.filter(s => board.type[s] === 'ground' && ctx.spots[s].size > 0)));
  for (const { hero, cell } of facts) dom[hero] = new Set([cell]);
  return dom;
}

function applyStatements(state) {
  const { ctx } = state;
  const { S } = ctx;
  if (ctx.alarms.length) {
    state.apply({ tech: 'statements', hero: S, statements: ctx.alarms.map(s => s.sid) },
      [{ hero: S, keep: s => ctx.alarms.every(a => ctx.board.zone[s] === a.zone) }], []);
  }
  for (let h = 0; h < ctx.k; h++) {
    const own = ctx.unary.filter(s => s.who === h);
    if (!own.length) continue;
    state.apply({ tech: 'statements', hero: h, statements: own.map(s => s.sid) },
      [{ hero: h, keep: c => own.every(s => unaryHolds(ctx.board, s, c)) }], []);
  }
}

// ---------- level 1 ----------
// A placed piece takes its row and column from everyone else (and its zone, for `alone`).
function fixed(state) {
  const { ctx, dom } = state;
  const { board, S } = ctx;
  for (const h of PIECES(ctx)) {
    if (dom[h].size !== 1 || state.done.has(h)) continue;
    state.done.add(h);
    const [x] = dom[h];
    const z = board.zone[x];
    const zoneBound = g => h !== S && g !== S && (ctx.alone.has(h) || ctx.alone.has(g));
    const changes = PIECES(ctx).filter(g => g !== h).map(g => ({
      hero: g,
      keep: c => apart(ctx, x, c) && !(zoneBound(g) && board.zone[c] === z),
    }));
    const aloneOthers = h === S ? [] : HEROES(ctx).filter(g => g !== h && ctx.alone.has(g));
    if (state.apply({ tech: 'fixed', hero: h, cell: x, alone: h !== S && ctx.alone.has(h), aloneOthers }, changes, [h])) return true;
  }
  return false;
}

// Every row and every column holds exactly one piece: a line that only one piece can still reach is its.
function line(state) {
  const { ctx, dom } = state;
  for (const axis of ['row', 'col']) {
    const of = axis === 'row' ? rowOf : colOf;
    for (let i = 0; i < ctx.n; i++) {
      const can = PIECES(ctx).filter(h => [...dom[h]].some(c => of(ctx, c) === i));
      if (can.length === 0) throw new Contradiction({ type: 'line', axis, index: i });
      if (can.length === 1 && state.apply({ tech: 'line', axis, index: i, hero: can[0] },
        [{ hero: can[0], keep: c => of(ctx, c) === i }], PIECES(ctx))) return true;
    }
  }
  return false;
}

// R2: exactly one hero stands on a thief spot of the safe (diagonal, same zone).
function thief(state) {
  const { ctx, dom } = state;
  const { S, spots } = ctx;
  const safes = [...dom[S]];
  const spotOfSome = c => safes.some(s => spots[s].has(c));
  const spotOfEvery = c => safes.every(s => spots[s].has(c));
  const can = HEROES(ctx).filter(h => [...dom[h]].some(spotOfSome));
  if (can.length === 0) throw new Contradiction({ type: 'noThief' });
  const sure = HEROES(ctx).filter(h => [...dom[h]].every(spotOfEvery));
  if (sure.length > 1) throw new Contradiction({ type: 'twoThieves', heroes: sure });
  if (can.length === 1 && state.apply({ tech: 'thief', kind: 'only', hero: can[0] }, [{ hero: can[0], keep: spotOfSome }], [...HEROES(ctx), S])) return true;
  if (sure.length === 1) {
    const h = sure[0];
    const changes = HEROES(ctx).filter(g => g !== h).map(g => ({ hero: g, keep: c => !spotOfEvery(c) }));
    if (state.apply({ tech: 'thief', kind: 'sure', hero: h }, changes, [h, S])) return true;
  }
  // The safe stood where someone can still be its thief, and not where two heroes surely are on its spots.
  const keepSafe = s => {
    let could = 0, must = 0;
    for (const h of HEROES(ctx)) {
      const cells = [...dom[h]].filter(c => apart(ctx, s, c));
      if (!cells.length) return false;
      const next = cells.filter(c => spots[s].has(c)).length;
      if (next) could++;
      if (next === cells.length) must++;
    }
    return could > 0 && must <= 1;
  };
  return state.apply({ tech: 'thief', kind: 'safe' }, [{ hero: S, keep: keepSafe }], HEROES(ctx));
}

// ---------- level 2 ----------
// A partner cell must satisfy the statement and lie in another row and column.
function pair(state) {
  const { ctx, dom } = state;
  const { board, S } = ctx;
  const ties = [
    ...ctx.pairs.map(s => ({ s, a: s.who, b: s.hero, type: s.type })),
    ...ctx.bySafe.map(s => ({ s, a: s.who, b: S, type: SAFE_PAIR[s.type] })),
  ];
  for (const { s, a, b, type } of ties) {
    const st = { type };
    const keepA = x => [...dom[b]].some(y => apart(ctx, x, y) && pairHolds(board, st, x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: a }, [{ hero: a, keep: keepA }], [b])) return true;
    const keepB = y => [...dom[a]].some(x => apart(ctx, x, y) && pairHolds(board, st, x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: b }, [{ hero: b, keep: keepB }], [a])) return true;
  }
  return false;
}

// A cell is out when it would take every remaining cell of another piece (all in its row or column).
function block(state) {
  const { ctx, dom } = state;
  for (const a of PIECES(ctx)) {
    for (const b of PIECES(ctx)) {
      if (a === b || dom[b].size === 1) continue; // a fixed piece is the 'fixed' technique
      const keep = x => [...dom[b]].some(y => apart(ctx, x, y));
      if (state.apply({ tech: 'block', hero: a, other: b }, [{ hero: a, keep }], [b])) return true;
    }
  }
  return false;
}

// m pieces whose cells all lie in the same m rows (columns) fill those lines; nobody else can stand there.
const MAX_SUBSET = 3;
function subset(state) {
  const { ctx, dom } = state;
  const open = PIECES(ctx).filter(h => dom[h].size > 1);
  for (const axis of ['row', 'col']) {
    const of = axis === 'row' ? rowOf : colOf;
    const lines = h => new Set([...dom[h]].map(c => of(ctx, c)));
    for (let mask = 1; mask < 1 << open.length; mask++) {
      const group = open.filter((_, i) => mask & (1 << i));
      if (group.length < 2 || group.length > MAX_SUBSET) continue;
      const union = new Set(group.flatMap(h => [...lines(h)]));
      if (union.size < group.length) throw new Contradiction({ type: 'subset', axis, heroes: group });
      if (union.size > group.length) continue;
      const changes = PIECES(ctx).filter(g => !group.includes(g)).map(g => ({ hero: g, keep: c => !union.has(of(ctx, c)) }));
      const step = { tech: 'subset', axis, heroes: group, lines: [...union].sort((p, q) => p - q) };
      if (state.apply(step, changes, group)) return true;
    }
  }
  return false;
}

// `alone` / `zoneCount` count the subject, so a zone needs exactly n − 1 other heroes (the safe is no hero).
function zone(state) {
  const { ctx, dom } = state;
  const { board } = ctx;
  for (const s of ctx.zoneStatements) {
    const subject = s.who;
    const need = s.type === 'alone' ? 0 : s.n - 1;
    const others = HEROES(ctx).filter(g => g !== subject);
    const count = z => {
      let must = 0, could = 0;
      for (const g of others) {
        const cells = [...dom[g]];
        if (cells.every(c => board.zone[c] === z)) must++;
        else if (cells.some(c => board.zone[c] === z)) could++;
      }
      return { must, could };
    };
    const keep = x => {
      const { must, could } = count(board.zone[x]);
      return must <= need && must + could >= need;
    };
    if (state.apply({ tech: 'zone', kind: 'subject', statement: s.sid, hero: subject }, [{ hero: subject, keep }], HEROES(ctx))) return true;
    const zones = new Set([...dom[subject]].map(c => board.zone[c]));
    if (zones.size !== 1) continue;
    const [z] = zones;
    const { must, could } = count(z);
    const maybe = others.filter(g => {
      const cells = [...dom[g]];
      return cells.some(c => board.zone[c] === z) && !cells.every(c => board.zone[c] === z);
    });
    if (could > 0 && must === need) {
      const changes = maybe.map(g => ({ hero: g, keep: c => board.zone[c] !== z }));
      if (state.apply({ tech: 'zone', kind: 'full', statement: s.sid, hero: subject, zone: z }, changes, HEROES(ctx))) return true;
    } else if (could > 0 && must + could === need) {
      const changes = maybe.map(g => ({ hero: g, keep: c => board.zone[c] === z }));
      if (state.apply({ tech: 'zone', kind: 'fill', statement: s.sid, hero: subject, zone: z }, changes, HEROES(ctx))) return true;
    }
  }
  return false;
}

// When everything is fixed, the rules and every statement are checked directly.
function checkComplete(state) {
  const { ctx, dom } = state;
  if (!dom.every(d => d.size === 1)) return;
  const [safe] = dom[ctx.S];
  const placement = dom.slice(0, ctx.k).map(d => [...d][0]);
  if (safeOf(ctx.board, placement) !== safe) throw new Contradiction({ type: 'rules' });
  const thieves = placement.filter(c => ctx.spots[safe].has(c)).length;
  if (thieves === 0) throw new Contradiction({ type: 'noThief' });
  if (thieves > 1) throw new Contradiction({ type: 'twoThieves' });
  if (!isValidPlacement(ctx.puzzle, placement)) throw new Contradiction({ type: 'rules' });
  const bad = ctx.puzzle.statements.findIndex(s => !evaluate(ctx.puzzle, placement, s));
  if (bad >= 0) throw new Contradiction({ type: 'statement', statement: bad });
}

const TECHNIQUES = [fixed, line, thief, pair, block, subset, zone];

function propagate(state) {
  for (;;) {
    let changed = false;
    for (const t of TECHNIQUES) {
      if (t(state)) { changed = true; break; }
    }
    if (!changed) return checkComplete(state);
  }
}

// ---------- level 3 ----------
// Variables with the fewest cells first ("either here or there"), as a person would try.
function trial(state) {
  const { ctx, dom } = state;
  const order = PIECES(ctx).filter(h => dom[h].size > 1).sort((a, b) => dom[a].size - dom[b].size || a - b);
  for (const h of order) {
    for (const x of [...dom[h]]) {
      const test = state.clone();
      test.dom[h] = new Set([x]);
      try {
        propagate(test);
      } catch (e) {
        if (!(e instanceof Contradiction)) throw e;
        state.apply({ tech: 'trial', hero: h, cell: x, reason: e.reason }, [{ hero: h, keep: c => c !== x }], PIECES(ctx));
        return true;
      }
    }
  }
  return false;
}

// Solves with levels 1–2, plus level 3 (trial) when `maxLevel` is 3. `facts` = [{ hero, cell }] taken as known
// (hero k = the safe). Returns { solved, placement, safe, level, steps, domains, contradiction }.
export function stepSolve(puzzle, { maxLevel = 3, facts = [] } = {}) {
  const ctx = setup(puzzle);
  const state = new State(ctx, initialDomains(ctx, facts), []);
  try {
    applyStatements(state);
    for (;;) {
      propagate(state);
      if (state.dom.every(d => d.size === 1)) break;
      if (maxLevel < 3 || !trial(state)) break;
    }
  } catch (e) {
    if (!(e instanceof Contradiction)) throw e;
    return { solved: false, contradiction: e.reason, steps: state.log, level: 0, domains: state.dom };
  }
  const solved = state.dom.every(d => d.size === 1);
  return {
    solved,
    placement: solved ? state.dom.slice(0, ctx.k).map(d => [...d][0]) : null,
    safe: solved ? [...state.dom[ctx.S]][0] : -1,
    level: Math.max(0, ...state.log.map(s => s.level)),
    steps: state.log,
    domains: state.dom,
  };
}

// Hint for the player's board: a wrongly placed hero first; otherwise the chain of steps (from the heroes
// placed correctly) that fixes the next hero. The safe is never a target: it appears by itself.
export function nextHint(puzzle, placement) {
  const wrong = placement.findIndex((c, h) => c >= 0 && c !== puzzle.solution[h]);
  if (wrong >= 0) return { kind: 'wrong', hero: wrong };
  if (placement.every(c => c >= 0)) return { kind: 'done' };
  const facts = placement.map((cell, hero) => ({ hero, cell })).filter(f => f.cell >= 0);
  const { steps } = stepSolve(puzzle, { facts });
  const known = new Set(facts.map(f => f.hero));
  known.add(puzzle.heroes.length);
  // Replays the log to find the first step that leaves an unplaced hero a single cell.
  const remaining = initialDomains(setup(puzzle), facts);
  for (let i = 0; i < steps.length; i++) {
    for (const e of steps[i].effects) {
      for (const c of e.removed) remaining[e.hero].delete(c);
      if (!known.has(e.hero) && remaining[e.hero].size === 1) {
        const hero = e.hero;
        return { kind: 'step', hero, cell: [...remaining[hero]][0], chain: chainOf(steps, i) };
      }
    }
  }
  return { kind: 'none' };
}

// Steps the target depends on (transitively), oldest first.
function chainOf(steps, target) {
  const keep = new Set([target]);
  const todo = [target];
  while (todo.length) for (const d of steps[todo.pop()].deps) if (!keep.has(d)) { keep.add(d); todo.push(d); }
  return [...keep].sort((a, b) => a - b).map(i => steps[i]);
}

// Drone hint (RULES.md §7): one row or column of the solution not flown over yet, preferring lines whose
// hero the player has not placed correctly. Returns { axis, index (0-based), hero (−1 = the safe) } or null.
export function nextDrone(puzzle, placement, flown) {
  const { n } = puzzle;
  const k = puzzle.heroes.length;
  const pieces = [...puzzle.solution, puzzle.safe];
  const lines = [];
  for (const axis of ['row', 'col']) {
    for (let index = 0; index < n; index++) {
      if (flown.some(f => f.axis === axis && f.index === index)) continue;
      const p = pieces.findIndex(c => (axis === 'row' ? Math.floor(c / n) : c % n) === index);
      const hero = p === k ? -1 : p;
      lines.push({ axis, index, hero, open: hero < 0 ? placement.some(c => c < 0) : placement[hero] !== puzzle.solution[hero] });
    }
  }
  const useful = lines.filter(l => l.open);
  const pool = useful.length ? useful : lines;
  if (!pool.length) return null;
  const { axis, index, hero } = createRng(`${puzzle.seed}|drone|${flown.length}`).pick(pool);
  return { axis, index, hero };
}
