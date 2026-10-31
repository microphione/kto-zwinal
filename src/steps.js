// Human-style step solver (PLAN.md stage 3, RULES.md Q3): candidate cells per hero, sound techniques
// applied cheapest first, every step logged so it can be explained as a hint. Level 3 ("trial") is a
// single assumption refuted by levels 1–2; it is never nested.
import { getBoard, droneScan } from './board.js';
import { UNARY, PAIR, unaryHolds, pairHolds, evaluate, isValidPlacement } from './statements.js';

export const LEVEL = { statements: 1, fixed: 1, thief: 1, drone: 1, pair: 2, sight: 2, zone: 2, trial: 3 };

class Contradiction extends Error {
  constructor(reason) {
    super('contradiction');
    this.reason = reason;
  }
}

function setup(puzzle) {
  const board = getBoard(puzzle);
  const st = puzzle.statements.map((s, sid) => ({ ...s, sid })); // sid: position in puzzle.statements
  return {
    puzzle,
    board,
    k: puzzle.heroes.length,
    unary: st.filter(s => UNARY.has(s.type)),
    pairs: st.filter(s => PAIR.has(s.type)),
    zoneStatements: st.filter(s => s.type === 'alone' || s.type === 'zoneCount'),
    drones: st.filter(s => s.type === 'drone').map((s, i) => ({ ...s, label: `D${i + 1}`, scan: new Set(droneScan(board, s.side, s.index)) })),
    alone: new Set(st.filter(s => s.type === 'alone').map(s => s.who)),
  };
}

// Shared state of one propagation: domains plus (optionally) the step log.
class State {
  constructor(ctx, dom, log) {
    this.ctx = ctx;
    this.dom = dom;
    this.log = log;
    this.done = new Set(); // fixed heroes whose consequences were already applied
    this.lastWrite = Array.from({ length: ctx.k }, () => []);
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
      // A step depends on what it read and on every earlier narrowing of the heroes it narrows.
      for (const h of reads) for (const d of this.lastWrite[h]) deps.add(d);
      for (const e of effects) for (const d of this.lastWrite[e.hero]) deps.add(d);
      for (const e of effects) this.lastWrite[e.hero].push(idx);
      this.log.push({ ...step, level: LEVEL[step.tech], effects, deps: [...deps] });
    }
    return true;
  }
}

const ALL = ctx => [...Array(ctx.k).keys()];

function initialDomains(ctx, facts) {
  const { board, k } = ctx;
  const dom = Array.from({ length: k }, () => new Set(board.walkCells));
  for (const { hero, cell } of facts) dom[hero] = new Set([cell]);
  return dom;
}

function applyStatements(state) {
  const { ctx } = state;
  for (let h = 0; h < ctx.k; h++) {
    const own = ctx.unary.filter(s => s.who === h);
    if (!own.length) continue;
    state.apply({ tech: 'statements', hero: h, statements: own.map(s => s.sid) },
      [{ hero: h, keep: c => own.every(s => unaryHolds(ctx.board, s, c)) }], []);
  }
}

// ---------- level 1 ----------
function fixed(state) {
  const { ctx, dom } = state;
  const { board } = ctx;
  for (let h = 0; h < ctx.k; h++) {
    if (dom[h].size !== 1 || state.done.has(h)) continue;
    state.done.add(h);
    const [x] = dom[h];
    const z = board.zone[x];
    const changes = ALL(ctx).filter(g => g !== h).map(g => ({
      hero: g,
      keep: c => c !== x && !board.seesSet[x].has(c) && !(board.safeSpot[x] && board.safeSpot[c]) &&
        !((ctx.alone.has(h) || ctx.alone.has(g)) && board.zone[c] === z),
    }));
    const aloneOthers = ALL(ctx).filter(g => g !== h && ctx.alone.has(g));
    if (state.apply({ tech: 'fixed', hero: h, cell: x, safe: board.safeSpot[x], alone: ctx.alone.has(h), aloneOthers }, changes, [h])) return true;
  }
  return false;
}

function thief(state) {
  const { ctx, dom } = state;
  const { safeSpot } = ctx.board;
  const can = ALL(ctx).filter(h => [...dom[h]].some(c => safeSpot[c]));
  if (can.length === 0) throw new Contradiction({ type: 'noThief' });
  const sure = ALL(ctx).filter(h => [...dom[h]].every(c => safeSpot[c]));
  if (sure.length > 1) throw new Contradiction({ type: 'twoThieves', heroes: sure });
  if (can.length === 1 && state.apply({ tech: 'thief', kind: 'only', hero: can[0] }, [{ hero: can[0], keep: c => safeSpot[c] }], ALL(ctx))) return true;
  if (sure.length === 1) {
    const h = sure[0];
    const changes = ALL(ctx).filter(g => g !== h).map(g => ({ hero: g, keep: c => !safeSpot[c] }));
    if (state.apply({ tech: 'thief', kind: 'sure', hero: h }, changes, [h])) return true;
  }
  return false;
}

// Every two cells of one scan see each other (the scan is an unbroken line), so it holds at most one hero.
function drone(state) {
  const { ctx, dom } = state;
  for (const d of ctx.drones) {
    const inScan = h => [...dom[h]].some(c => d.scan.has(c));
    if (d.n === 0) {
      const changes = ALL(ctx).map(g => ({ hero: g, keep: c => !d.scan.has(c) }));
      if (state.apply({ tech: 'drone', kind: 'empty', drone: d.label, statement: d.sid }, changes, [])) return true;
      continue;
    }
    const can = ALL(ctx).filter(inScan);
    if (can.length === 0) throw new Contradiction({ type: 'drone', drone: d.label });
    const sure = ALL(ctx).filter(h => [...dom[h]].every(c => d.scan.has(c)));
    if (sure.length > 1) throw new Contradiction({ type: 'drone', drone: d.label });
    if (can.length === 1 && state.apply({ tech: 'drone', kind: 'only', drone: d.label, statement: d.sid, hero: can[0] },
      [{ hero: can[0], keep: c => d.scan.has(c) }], ALL(ctx))) return true;
    if (sure.length === 1) {
      const h = sure[0];
      const changes = ALL(ctx).filter(g => g !== h).map(g => ({ hero: g, keep: c => !d.scan.has(c) }));
      if (state.apply({ tech: 'drone', kind: 'sure', drone: d.label, statement: d.sid, hero: h }, changes, [h])) return true;
    }
  }
  return false;
}

// ---------- level 2 ----------
// A partner cell must satisfy the statement, be another cell and not be in sight (R1).
function pair(state) {
  const { ctx, dom } = state;
  const { board } = ctx;
  const compatible = (x, y) => x !== y && !board.seesSet[x].has(y);
  for (const s of ctx.pairs) {
    const a = s.who, b = s.hero;
    const keepA = x => [...dom[b]].some(y => compatible(x, y) && pairHolds(board, s, x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: a }, [{ hero: a, keep: keepA }], [b])) return true;
    const keepB = y => [...dom[a]].some(x => compatible(x, y) && pairHolds(board, s, x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: b }, [{ hero: b, keep: keepB }], [a])) return true;
  }
  return false;
}

function sight(state) {
  const { ctx, dom } = state;
  const { board } = ctx;
  for (let a = 0; a < ctx.k; a++) {
    for (let b = 0; b < ctx.k; b++) {
      if (a === b || dom[b].size === 1) continue; // a fixed hero is the 'fixed' technique
      const keep = x => [...dom[b]].some(y => y !== x && !board.seesSet[x].has(y));
      if (state.apply({ tech: 'sight', hero: a, other: b }, [{ hero: a, keep }], [b])) return true;
    }
  }
  return false;
}

// `alone` / `zoneCount` count the subject, so a zone needs exactly n − 1 other heroes.
function zone(state) {
  const { ctx, dom } = state;
  const { board } = ctx;
  for (const s of ctx.zoneStatements) {
    const subject = s.who;
    const need = s.type === 'alone' ? 0 : s.n - 1;
    const others = ALL(ctx).filter(g => g !== subject);
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
    if (state.apply({ tech: 'zone', kind: 'subject', statement: s.sid, hero: subject }, [{ hero: subject, keep }], ALL(ctx))) return true;
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
      if (state.apply({ tech: 'zone', kind: 'full', statement: s.sid, hero: subject, zone: z }, changes, ALL(ctx))) return true;
    } else if (could > 0 && must + could === need) {
      const changes = maybe.map(g => ({ hero: g, keep: c => board.zone[c] === z }));
      if (state.apply({ tech: 'zone', kind: 'fill', statement: s.sid, hero: subject, zone: z }, changes, ALL(ctx))) return true;
    }
  }
  return false;
}

// When everyone is fixed, R1/R2 and every statement are checked directly.
function checkComplete(state) {
  const { ctx, dom } = state;
  if (!dom.every(d => d.size === 1)) return;
  const placement = dom.map(d => [...d][0]);
  if (!isValidPlacement(ctx.puzzle, placement)) throw new Contradiction({ type: 'rules' });
  const bad = ctx.puzzle.statements.findIndex(s => !evaluate(ctx.puzzle, placement, s));
  if (bad >= 0) throw new Contradiction({ type: 'statement', statement: bad });
}

const TECHNIQUES = [fixed, thief, drone, pair, sight, zone];

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
// Heroes with the fewest cells first ("either here or there"), as a person would try.
function trial(state) {
  const { ctx, dom } = state;
  const order = ALL(ctx).filter(h => dom[h].size > 1).sort((a, b) => dom[a].size - dom[b].size || a - b);
  for (const h of order) {
    for (const x of [...dom[h]]) {
      const test = state.clone();
      test.dom[h] = new Set([x]);
      try {
        propagate(test);
      } catch (e) {
        if (!(e instanceof Contradiction)) throw e;
        state.apply({ tech: 'trial', hero: h, cell: x, reason: e.reason }, [{ hero: h, keep: c => c !== x }], ALL(ctx));
        return true;
      }
    }
  }
  return false;
}

// Solves with levels 1–2, plus level 3 (trial) when `maxLevel` is 3. `facts` = [{ hero, cell }] taken as known.
// Returns { solved, placement, level, steps, contradiction }.
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
    placement: solved ? state.dom.map(d => [...d][0]) : null,
    level: Math.max(0, ...state.log.map(s => s.level)),
    steps: state.log,
    domains: state.dom,
  };
}

// Hint for the player's board (PLAN.md stage 3): a wrongly placed hero first; otherwise the chain of steps
// (from the correctly placed heroes) that fixes the next hero.
export function nextHint(puzzle, placement) {
  const wrong = placement.findIndex((c, h) => c >= 0 && c !== puzzle.solution[h]);
  if (wrong >= 0) return { kind: 'wrong', hero: wrong };
  if (placement.every(c => c >= 0)) return { kind: 'done' };
  const facts = placement.map((cell, hero) => ({ hero, cell })).filter(f => f.cell >= 0);
  const { steps } = stepSolve(puzzle, { facts });
  const known = new Set(facts.map(f => f.hero));
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
