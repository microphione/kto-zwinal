// Human-style step solver (PLAN.md stages 3 and 8, RULES.md Q3): candidate cells per hero and for the hidden
// safe, sound techniques applied cheapest first, every step logged so it can be explained as a hint. Level 3
// ("trial") is a single assumption refuted by levels 1–2; it is never nested.
// Variables 0..k−1 are the heroes, variable k is the safe. Whatever depends on the safe is quantified over its
// remaining cells: a cell is removed only when no remaining safe cell allows it.
import { getBoard, droneScan, withSafe, safeCandidates } from './board.js';
import { UNARY, PAIR, SAFE_PAIR, unaryHolds, pairHolds, evaluate, isValidPlacement } from './statements.js';

export const LEVEL = { statements: 1, fixed: 1, thief: 1, drone: 1, pair: 2, sight: 2, hiding: 2, zone: 2, trial: 3 };

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
  const safes = safeCandidates(puzzle);
  const maps = new Map(safes.map(s => [s, getBoard(withSafe(puzzle, s))]));
  const safeDependent = s => s.type === 'sees' || SAFE_PAIR[s.type];
  const betweenCache = new Map();
  return {
    puzzle,
    board,
    k,
    S: k,
    safes,
    maps,
    nb: board.neighbours.map(list => new Set(list)),
    // Cells strictly between two cells of one row or column.
    between(x, y) {
      let b = betweenCache.get(x * 64 + y);
      if (!b) {
        const n = board.n;
        const [rx, cx, ry, cy] = [Math.floor(x / n), x % n, Math.floor(y / n), y % n];
        b = [];
        if (rx === ry) for (let c = Math.min(cx, cy) + 1; c < Math.max(cx, cy); c++) b.push(rx * n + c);
        else if (cx === cy) for (let r = Math.min(rx, ry) + 1; r < Math.max(rx, ry); r++) b.push(r * n + cx);
        betweenCache.set(x * 64 + y, b);
      }
      return b;
    },
    unary: st.filter(s => UNARY.has(s.type) && !safeDependent(s)),
    bySafe: st.filter(safeDependent), // true or false depending on where the safe is
    alarms: st.filter(s => s.type === 'alarm'),
    pairs: st.filter(s => PAIR.has(s.type)),
    zoneStatements: st.filter(s => s.type === 'alone' || s.type === 'zoneCount'),
    drones: st.filter(s => s.type === 'drone').map((s, i) => ({
      ...s,
      label: `D${i + 1}`,
      scans: new Map(safes.map(c => [c, new Set(droneScan(maps.get(c), s.side, s.index))])),
    })),
    alone: new Set(st.filter(s => s.type === 'alone').map(s => s.who)),
  };
}

const holdsAt = (ctx, st, x, s) => unaryHolds(ctx.maps.get(s), st, x);

// Heroes on x and y with the safe on s break neither R1 nor R2.
function okAt(ctx, s, x, y) {
  return x !== y && s !== x && s !== y && !ctx.maps.get(s).seesSet[x].has(y) && !(ctx.nb[x].has(s) && ctx.nb[y].has(s));
}

// Some remaining safe cell lets heroes stand on x and y together. The safe can only hide a line of sight by
// standing on it, so for cells in sight only the cells between them are tried.
function together(ctx, safeDom, x, y) {
  if (x === y) return false;
  const free = s => s !== x && s !== y && !(ctx.nb[x].has(s) && ctx.nb[y].has(s));
  if (ctx.board.seesSet[x].has(y)) return ctx.between(x, y).some(s => safeDom.has(s) && free(s));
  for (const s of safeDom) if (free(s)) return true;
  return false;
}

// Shared state of one propagation: domains plus (optionally) the step log.
class State {
  constructor(ctx, dom, log) {
    this.ctx = ctx;
    this.dom = dom;
    this.log = log;
    // Fixed variables whose consequences were applied, with the number of safe cells left at that time:
    // fewer safe cells can make a fixed hero's consequences stronger, so they are applied again.
    this.done = new Map();
    this.lastWrite = Array.from({ length: ctx.k + 1 }, () => []);
  }

  clone() {
    const s = new State(this.ctx, this.dom.map(d => new Set(d)), null);
    s.done = new Map(this.done);
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

const ALL = ctx => [...Array(ctx.k).keys()];

function initialDomains(ctx, facts) {
  const dom = ALL(ctx).map(() => new Set(ctx.board.walkCells));
  dom.push(new Set(ctx.safes));
  for (const { hero, cell } of facts) dom[hero] = new Set([cell]);
  return dom;
}

function applyStatements(state) {
  const { ctx, dom } = state;
  const { S } = ctx;
  if (ctx.alarms.length) {
    state.apply({ tech: 'statements', hero: S, statements: ctx.alarms.map(s => s.sid) },
      [{ hero: S, keep: s => ctx.alarms.every(a => ctx.board.zone[s] === a.zone) }], []);
  }
  for (let h = 0; h < ctx.k; h++) {
    const own = ctx.unary.filter(s => s.who === h);
    const bySafe = ctx.bySafe.filter(s => s.who === h);
    if (!own.length && !bySafe.length) continue;
    const keep = c => own.every(s => unaryHolds(ctx.board, s, c)) &&
      (!bySafe.length || [...dom[S]].some(s => s !== c && bySafe.every(st => holdsAt(ctx, st, c, s))));
    state.apply({ tech: 'statements', hero: h, statements: [...own, ...bySafe].map(s => s.sid) },
      [{ hero: h, keep }], bySafe.length ? [S] : []);
  }
}

// ---------- level 1 ----------
function fixed(state) {
  const { ctx, dom } = state;
  const { board, S, nb } = ctx;
  for (let h = 0; h <= ctx.k; h++) {
    if (dom[h].size !== 1 || state.done.get(h) === dom[S].size) continue;
    state.done.set(h, dom[S].size);
    const [x] = dom[h];
    if (h === S) {
      if (state.apply({ tech: 'fixed', hero: S, cell: x }, ALL(ctx).map(g => ({ hero: g, keep: c => c !== x })), [S])) return true;
      continue;
    }
    const z = board.zone[x];
    const changes = ALL(ctx).filter(g => g !== h).map(g => ({
      hero: g,
      keep: c => together(ctx, dom[S], x, c) && !((ctx.alone.has(h) || ctx.alone.has(g)) && board.zone[c] === z),
    }));
    changes.push({ hero: S, keep: s => s !== x });
    const safe = [...dom[S]].every(s => nb[x].has(s)); // surely next to the safe: nobody else is
    const aloneOthers = ALL(ctx).filter(g => g !== h && ctx.alone.has(g));
    if (state.apply({ tech: 'fixed', hero: h, cell: x, safe, alone: ctx.alone.has(h), aloneOthers }, changes, [h, S])) return true;
  }
  return false;
}

// R2: exactly one hero stands next to the safe.
function thief(state) {
  const { ctx, dom } = state;
  const { S, nb } = ctx;
  const safes = [...dom[S]];
  const nextToSome = c => safes.some(s => nb[c].has(s));
  const nextToEvery = c => safes.every(s => nb[c].has(s));
  const can = ALL(ctx).filter(h => [...dom[h]].some(nextToSome));
  if (can.length === 0) throw new Contradiction({ type: 'noThief' });
  const sure = ALL(ctx).filter(h => [...dom[h]].every(nextToEvery));
  if (sure.length > 1) throw new Contradiction({ type: 'twoThieves', heroes: sure });
  if (can.length === 1 && state.apply({ tech: 'thief', kind: 'only', hero: can[0] }, [{ hero: can[0], keep: nextToSome }], [...ALL(ctx), S])) return true;
  if (sure.length === 1) {
    const h = sure[0];
    const changes = ALL(ctx).filter(g => g !== h).map(g => ({ hero: g, keep: c => !nextToEvery(c) }));
    if (state.apply({ tech: 'thief', kind: 'sure', hero: h }, changes, [h, S])) return true;
  }
  // The safe stood where someone can stand next to it, and not where two heroes surely do.
  const keepSafe = s => {
    let could = 0, must = 0;
    for (const h of ALL(ctx)) {
      const cells = [...dom[h]].filter(c => c !== s);
      if (!cells.length) return false;
      const next = cells.filter(c => nb[c].has(s)).length;
      if (next) could++;
      if (next === cells.length) must++;
    }
    return could > 0 && must <= 1;
  };
  return state.apply({ tech: 'thief', kind: 'safe' }, [{ hero: S, keep: keepSafe }], ALL(ctx));
}

// Every two cells of one scan see each other (the scan is an unbroken line), so it holds at most one hero.
// The safe ends a scan, so each safe cell has its own scan.
function drone(state) {
  const { ctx, dom } = state;
  const { S } = ctx;
  for (const d of ctx.drones) {
    const safes = [...dom[S]];
    const inSome = c => safes.some(s => d.scans.get(s).has(c));
    const inEvery = c => safes.every(s => d.scans.get(s).has(c));
    const info = { tech: 'drone', drone: d.label, statement: d.sid };
    // Heroes that could / surely would be in the scan with the safe on s.
    const counts = s => {
      const scan = d.scans.get(s);
      let could = 0, must = 0;
      for (const h of ALL(ctx)) {
        const cells = [...dom[h]].filter(c => c !== s);
        if (!cells.length) return null;
        if (cells.some(c => scan.has(c))) could++;
        if (cells.every(c => scan.has(c))) must++;
      }
      return { could, must };
    };
    if (d.n === 0) {
      const changes = ALL(ctx).map(g => ({ hero: g, keep: c => !inEvery(c) }));
      if (state.apply({ ...info, kind: 'empty' }, changes, [S])) return true;
      if (state.apply({ ...info, kind: 'safe' }, [{ hero: S, keep: s => counts(s)?.must === 0 }], ALL(ctx))) return true;
      continue;
    }
    const can = ALL(ctx).filter(h => [...dom[h]].some(inSome));
    if (can.length === 0) throw new Contradiction({ type: 'drone', drone: d.label });
    const sure = ALL(ctx).filter(h => [...dom[h]].every(inEvery));
    if (sure.length > 1) throw new Contradiction({ type: 'drone', drone: d.label });
    if (can.length === 1 && state.apply({ ...info, kind: 'only', hero: can[0] }, [{ hero: can[0], keep: inSome }], [...ALL(ctx), S])) return true;
    if (sure.length === 1) {
      const h = sure[0];
      const changes = ALL(ctx).filter(g => g !== h).map(g => ({ hero: g, keep: c => !inEvery(c) }));
      if (state.apply({ ...info, kind: 'sure', hero: h }, changes, [h, S])) return true;
    }
    const keepSafe = s => {
      const c = counts(s);
      return c !== null && c.could >= 1 && c.must <= 1;
    };
    if (state.apply({ ...info, kind: 'safe' }, [{ hero: S, keep: keepSafe }], ALL(ctx))) return true;
  }
  return false;
}

// ---------- level 2 ----------
// A partner cell must satisfy the statement and be compatible (R1, R2) for some remaining safe cell.
function pair(state) {
  const { ctx, dom } = state;
  const { board, S } = ctx;
  for (const s of ctx.pairs) {
    const a = s.who, b = s.hero;
    const keepA = x => [...dom[b]].some(y => pairHolds(board, s, x, y) && together(ctx, dom[S], x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: a }, [{ hero: a, keep: keepA }], [b, S])) return true;
    const keepB = y => [...dom[a]].some(x => pairHolds(board, s, x, y) && together(ctx, dom[S], x, y));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: b }, [{ hero: b, keep: keepB }], [a, S])) return true;
  }
  // Statements about the safe tie the speaker's cell and the safe's cell.
  for (const s of ctx.bySafe) {
    const h = s.who;
    const keepH = x => [...dom[S]].some(c => c !== x && holdsAt(ctx, s, x, c));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: h }, [{ hero: h, keep: keepH }], [S])) return true;
    const keepS = c => [...dom[h]].some(x => x !== c && holdsAt(ctx, s, x, c));
    if (state.apply({ tech: 'pair', statement: s.sid, hero: S }, [{ hero: S, keep: keepS }], [h])) return true;
  }
  return false;
}

function sight(state) {
  const { ctx, dom } = state;
  const { S } = ctx;
  for (let a = 0; a < ctx.k; a++) {
    for (let b = 0; b < ctx.k; b++) {
      if (a === b || dom[b].size === 1) continue; // a fixed hero is the 'fixed' technique
      const keep = x => [...dom[b]].some(y => together(ctx, dom[S], x, y));
      if (state.apply({ tech: 'sight', hero: a, other: b }, [{ hero: a, keep }], [b, S])) return true;
    }
  }
  return false;
}

// Two heroes with few cells left limit the safe: it must hide them from each other and not stand next to both.
const HIDING_PAIRS = 16;
function hiding(state) {
  const { ctx, dom } = state;
  const { S } = ctx;
  for (let a = 0; a < ctx.k; a++) {
    for (let b = a + 1; b < ctx.k; b++) {
      if (dom[a].size * dom[b].size > HIDING_PAIRS) continue;
      const A = [...dom[a]], B = [...dom[b]];
      const keep = s => A.some(x => B.some(y => okAt(ctx, s, x, y)));
      const between = A.length === 1 && B.length === 1 && ctx.board.seesSet[A[0]].has(B[0]);
      if (state.apply({ tech: 'hiding', hero: a, other: b, between }, [{ hero: S, keep }], [a, b])) return true;
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

// When everything is fixed, R1/R2 and every statement are checked directly on the map with the safe in place.
function checkComplete(state) {
  const { ctx, dom } = state;
  if (!dom.every(d => d.size === 1)) return;
  const [safe] = dom[ctx.S];
  const placement = dom.slice(0, ctx.k).map(d => [...d][0]);
  const map = withSafe(ctx.puzzle, safe);
  const thieves = placement.filter(c => ctx.maps.get(safe).safeSpot[c]).length;
  if (thieves === 0) throw new Contradiction({ type: 'noThief' });
  if (thieves > 1) throw new Contradiction({ type: 'twoThieves' });
  if (!isValidPlacement(map, placement)) throw new Contradiction({ type: 'rules' });
  const bad = ctx.puzzle.statements.findIndex(s => !evaluate(map, placement, s));
  if (bad >= 0) throw new Contradiction({ type: 'statement', statement: bad });
}

const TECHNIQUES = [fixed, thief, drone, pair, sight, hiding, zone];

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
  const order = [...ALL(ctx), ctx.S].filter(h => dom[h].size > 1).sort((a, b) => dom[a].size - dom[b].size || a - b);
  for (const h of order) {
    for (const x of [...dom[h]]) {
      const test = state.clone();
      test.dom[h] = new Set([x]);
      try {
        propagate(test);
      } catch (e) {
        if (!(e instanceof Contradiction)) throw e;
        state.apply({ tech: 'trial', hero: h, cell: x, reason: e.reason }, [{ hero: h, keep: c => c !== x }], [...ALL(ctx), ctx.S]);
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

// Hint for the player's board (PLAN.md stages 3 and 8): a wrongly placed hero or safe first; otherwise the
// chain of steps (from what is placed correctly) that fixes the next hero or the safe (hero k).
export function nextHint(puzzle, placement, safe = -1) {
  const k = puzzle.heroes.length;
  const wrong = placement.findIndex((c, h) => c >= 0 && c !== puzzle.solution[h]);
  if (wrong >= 0) return { kind: 'wrong', hero: wrong };
  if (safe >= 0 && safe !== puzzle.safe) return { kind: 'wrong', hero: k };
  if (placement.every(c => c >= 0) && safe >= 0) return { kind: 'done' };
  const facts = placement.map((cell, hero) => ({ hero, cell })).filter(f => f.cell >= 0);
  if (safe >= 0) facts.push({ hero: k, cell: safe });
  const { steps } = stepSolve(puzzle, { facts });
  const known = new Set(facts.map(f => f.hero));
  // Replays the log to find the first step that leaves an unplaced variable a single cell.
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
