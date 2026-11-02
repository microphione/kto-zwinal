// Production evaluators and solver (rules v4) cross-checked against the independent brute force (tests/reference.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solver.js';
import { stepSolve } from '../src/steps.js';
import { example1, example2 } from './fixtures/examples.js';
import { getBoard, safeOf, WALKABLE_TYPES, SPECIAL_TYPES, NON_PLAIN_TYPES } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, trueStatements, unaryParts, unaryHolds, UNARY, COMPOSITE, PAIR, ZONE } from '../src/statements.js';
import { refEval, refValid, refThief, refSafe, refInformative, refCandidates } from './reference.js';
import {
  randomBoardPuzzle, randomStatement, randomAnyPlacement, randomWalkPlacement, randomRookPlacement,
  randomValidPlacement, refSolveWith, refSolveSparse, MAX_SPARSE, sortSolutions, LARGE,
} from './helpers.js';

const BOARDS = 300;

// All kinds of placements: arbitrary, distinct walkable, rooks (obstacle cells allowed or not), valid.
function placements(rng, puzzle) {
  const out = [randomAnyPlacement(rng, puzzle), randomWalkPlacement(rng, puzzle), randomRookPlacement(rng, puzzle, false)];
  for (let i = 0; i < 6; i++) out.push(randomRookPlacement(rng, puzzle));
  const valid = randomValidPlacement(rng, puzzle);
  if (valid) out.push(valid);
  return out;
}

function checkPlacement(puzzle, placement, rng, at) {
  const board = getBoard(puzzle);
  assert.equal(safeOf(board, placement), refSafe(puzzle, placement), `${at}: safeOf ${placement}`);
  const valid = refValid(puzzle, placement);
  assert.equal(isValidPlacement(puzzle, placement), valid, `${at}: isValidPlacement ${placement}`);
  if (valid) assert.equal(thiefOf(puzzle, placement), refThief(puzzle, placement), `${at}: thiefOf ${placement}`);
  // No statement mentions the safe, so truth is compared on every placement, with or without a single safe cell.
  for (let j = 0; j < 12; j++) {
    const st = randomStatement(rng, puzzle);
    assert.equal(evaluate(puzzle, placement, st), refEval(puzzle, placement, st), `${at}: ${JSON.stringify(st)} on ${placement}`);
  }
  return valid;
}

test('safeOf / isValidPlacement / thiefOf / evaluate match the reference on random placements (valid and invalid)', () => {
  let valid = 0, total = 0;
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    for (const placement of placements(rng, puzzle)) {
      total++;
      if (checkPlacement(puzzle, placement, rng, `board ${seed}`)) valid++;
    }
    // A wrong number of heroes is never valid.
    const short = randomRookPlacement(rng, puzzle).slice(1);
    assert.equal(isValidPlacement(puzzle, short), false);
    assert.equal(refValid(puzzle, short), false);
  }
  assert.ok(valid > 100 && valid < total, `${valid}/${total} valid`);
});

test('composite statements equal the conjunction of their unaryParts (RULES §5 notes)', () => {
  let held = 0, total = 0;
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 3000);
    const board = getBoard(puzzle);
    const k = puzzle.heroes.length;
    for (const placement of placements(rng, puzzle)) {
      for (let who = 0; who < k; who++) {
        const sts = [
          ...SPECIAL_TYPES.flatMap(cellType => [{ type: 'onlyOn', who, cellType }, { type: 'nobodyOn', cellType }]),
          ...puzzle.zoneNames.map((_, zone) => ({ type: 'aloneIn', who, zone })),
        ];
        for (const st of sts) {
          assert.ok(COMPOSITE.has(st.type));
          const parts = unaryParts(st, k);
          assert.equal(parts.length, k);
          // The reference never sees unaryParts: it evaluates the literal wording of the table.
          const viaParts = parts.every(({ hero, st: u }) => !u || refEval(puzzle, placement, { ...u, who: hero }));
          const truth = refEval(puzzle, placement, st);
          assert.equal(truth, viaParts, `board ${seed}: ${JSON.stringify(st)} on ${placement}`);
          assert.equal(evaluate(puzzle, placement, st), truth, `board ${seed}: ${JSON.stringify(st)} on ${placement}`);
          total++;
          if (truth) held++;
        }
      }
    }
    assert.ok(board.n >= 4);
  }
  assert.ok(held > 50 && held < total, `${held}/${total} composite statements hold`);
});

test('R0: a placement whose safe stands on a special cell is never valid (production and reference)', () => {
  let rejected = 0;
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 5000);
    const board = getBoard(puzzle);
    for (let i = 0; i < 20; i++) {
      const placement = randomRookPlacement(rng, puzzle);
      const safe = safeOf(board, placement);
      if (SPECIAL_TYPES.includes(board.type[safe]) || !board.walk[safe]) {
        assert.equal(isValidPlacement(puzzle, placement), false, `board ${seed}: ${placement}`);
        assert.equal(refValid(puzzle, placement), false, `board ${seed}: ${placement}`);
        rejected++;
      }
    }
  }
  assert.ok(rejected > 50, `only ${rejected} placements with the safe on a special or blocked cell`);
});

test('large boards (6×6–8×8, high mask word): evaluators match the reference', () => {
  for (let seed = 0; seed < 60; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, LARGE);
    for (const placement of placements(rng, puzzle)) checkPlacement(puzzle, placement, rng, `large board ${seed}`);
  }
});

test('solve returns exactly the reference solution set (random, possibly contradictory statements)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 1000);
    const statements = Array.from({ length: rng.int(0, 4) }, () => randomStatement(rng, puzzle));
    const ours = solve({ ...puzzle, statements }, Infinity);
    assert.equal(ours.aborted, false);
    assert.deepEqual(sortSolutions(ours.solutions), sortSolutions(refSolveWith(puzzle, statements)), `board ${seed}`);
  }
});

test('solve matches the reference on satisfiable statement sets (true statements of a random candidate)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 10000);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const statements = rng.shuffle(trueStatements(puzzle, hidden)).slice(0, rng.int(1, 8));
    const ours = sortSolutions(solve({ ...puzzle, statements }, Infinity).solutions);
    assert.deepEqual(ours, sortSolutions(refSolveWith(puzzle, statements)), `board ${seed}`);
    assert.ok(ours.includes(hidden.join(',')), `board ${seed}: the hidden placement is lost`);
  }
});

test('large boards: solve matches the reference (n = 6 by full enumeration, n = 7, 8 by pruned brute force)', () => {
  let sparse = 0;
  for (let seed = 0; seed < 36; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, LARGE);
    const hidden = randomValidPlacement(rng, puzzle);
    const k = puzzle.heroes.length;
    let statements;
    if (hidden && (seed % 2 || puzzle.n > 6)) {
      // Two true statements per hero (own-cell kinds first) keep the brute force affordable on n = 7, 8.
      const pool = rng.shuffle(trueStatements(puzzle, hidden));
      statements = [];
      for (let who = 0; who < k; who++) statements.push(...pool.filter(st => st.who === who && UNARY.has(st.type)).slice(0, 2));
      statements.push(...pool.filter(st => !statements.includes(st)).slice(0, 4));
    } else {
      statements = Array.from({ length: rng.int(2, 5) }, () => randomStatement(rng, puzzle));
    }
    const found = solve({ ...puzzle, statements }, MAX_SPARSE + 1).solutions;
    if (found.length > MAX_SPARSE) continue;
    const ours = sortSolutions(found);
    const ref = puzzle.n === 6 ? refSolveWith(puzzle, statements) : refSolveSparse(puzzle, statements);
    if (ref === null) continue;
    if (puzzle.n > 6) sparse++;
    assert.deepEqual(ours, sortSolutions(ref), `large board ${seed} (n=${puzzle.n})`);
    if (hidden && (seed % 2 || puzzle.n > 6)) assert.ok(ours.includes(hidden.join(',')), `large board ${seed}`);
  }
  assert.ok(sparse >= 6, `only ${sparse} n ≥ 7 comparisons fit the brute-force budget`);
});

test('with no statements solve returns exactly the reference candidates', () => {
  for (let seed = 0; seed < 40; seed++) {
    const { puzzle } = randomBoardPuzzle(seed + 4000);
    assert.deepEqual(sortSolutions(solve(puzzle, Infinity).solutions), sortSolutions(refCandidates(puzzle)), `board ${seed}`);
  }
});

test('heroes ≠ n − 1: no solutions', () => {
  for (let seed = 0; seed < 40; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 6000);
    for (const count of [puzzle.n - 2, puzzle.n]) {
      const heroes = Array.from({ length: count }, (_, i) => ({ name: `H${i}`, gender: 'm' }));
      const p = { ...puzzle, heroes, statements: [] };
      const r = solve(p, 5);
      assert.deepEqual(r.solutions, [], `board ${seed}, ${count} heroes`);
      if (count < puzzle.n - 1) assert.equal(isValidPlacement(p, randomRookPlacement(rng, puzzle).slice(0, count)), false);
    }
  }
});

test('solve honours limit; budgeted searches are either aborted or identical to the full search', () => {
  for (let seed = 0; seed < 200; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 20000);
    const p = { ...puzzle, statements: Array.from({ length: rng.int(0, 2) }, () => randomStatement(rng, puzzle)) };
    const full = solve(p, Infinity);
    for (const limit of [1, 2, 5]) {
      const r = solve(p, limit);
      assert.equal(r.solutions.length, Math.min(limit, full.solutions.length));
      assert.equal(r.aborted, false);
    }
    const budget = solve(p, Infinity, null, 50);
    if (!budget.aborted) assert.deepEqual(sortSolutions(budget.solutions), sortSolutions(full.solutions));
    else assert.ok(budget.nodes > 50);
    // A randomised order finds the same set.
    assert.deepEqual(sortSolutions(solve(p, Infinity, rng).solutions), sortSolutions(full.solutions));
  }
});

// Kinds that can be true in every candidate (they exclude placements instead of fixing one).
const NEGATIVE = new Set(['notOn', 'notInZone', 'notNextTo', 'nobodyOn', 'otherZone']);

test('trueStatements: all true, well-formed, conventional, Q5 on the reference', () => {
  let informative = 0, uninformative = 0;
  const kinds = new Set();
  for (let seed = 0; seed < 150; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 40000);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const board = getBoard(puzzle);
    const list = trueStatements(puzzle, hidden);
    for (const st of list) {
      kinds.add(st.type);
      assert.ok(refEval(puzzle, hidden, st), JSON.stringify(st)); // also rejects ill-formed statements
      assert.ok(evaluate(puzzle, hidden, st), JSON.stringify(st));
      if (st.type === 'zoneCount') assert.ok(st.n >= 2 && st.n <= puzzle.heroes.length, JSON.stringify(st));
      if (st.type === 'nobodyOn') assert.equal(st.who, undefined, JSON.stringify(st));
      else assert.ok(st.who >= 0 && st.who < puzzle.heroes.length, JSON.stringify(st));
      assert.ok(UNARY.has(st.type) || PAIR.has(st.type) || ZONE.has(st.type) || COMPOSITE.has(st.type), st.type);
      assert.ok(!['sees', 'alarm', 'drone'].includes(st.type) && !/Safe$/.test(st.type), st.type);
      if (st.type === 'on') assert.ok(WALKABLE_TYPES.includes(st.cellType), JSON.stringify(st));
      if (['notOn', 'onlyOn', 'nobodyOn'].includes(st.type)) assert.ok(SPECIAL_TYPES.includes(st.cellType), JSON.stringify(st));
      if (['nextTo', 'notNextTo'].includes(st.type)) {
        assert.ok(NON_PLAIN_TYPES.includes(st.cellType), JSON.stringify(st));
        assert.notEqual(board.type[hidden[st.who]], st.cellType, `board ${seed}: ${JSON.stringify(st)} for a subject standing on that type`);
      }
      // A type that is not on the map would make notOn / nobodyOn / notNextTo true everywhere (Q5).
      if (['nobodyOn', 'notOn', 'notNextTo'].includes(st.type)) assert.ok(board.type.includes(st.cellType), `board ${seed}: ${JSON.stringify(st)}`);
    }
    if (seed % 5 === 0) {
      // Q5 relative to the candidates is only guaranteed by Q1 + Q2, not by this pool: a negative clue such as
      // `notOn armchair` is true in every candidate when no candidate can use the armchair (the generator's Q2
      // then drops it). The pool itself filters what is true on every walkable cell.
      for (const st of list) {
        if (UNARY.has(st.type)) {
          const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
          assert.ok(hits > 0 && hits < board.walkCells.length, `board ${seed}: ${JSON.stringify(st)}`);
        }
        if (refInformative(puzzle, st)) informative++;
        else {
          assert.ok(NEGATIVE.has(st.type), `board ${seed}: ${JSON.stringify(st)} is true in every candidate`);
          uninformative++;
        }
      }
    }
  }
  for (const type of ['onlyOn', 'aloneIn', 'nobodyOn', 'notOn']) assert.ok(kinds.has(type), `${type} never listed`);
  assert.ok(informative > 100, `only ${informative} informative statements checked (${uninformative} uninformative)`);
});

test('ill-formed statements (RULES §5 domains) are rejected by evaluate, solve and stepSolve', () => {
  const p = example1;
  const ill = [
    { type: 'notOn', who: 0, cellType: 'floor' }, { type: 'nextTo', who: 0, cellType: 'grass' },
    { type: 'on', who: 0, cellType: 'table' }, { type: 'onlyOn', who: 0, cellType: 'floor' },
    { type: 'nobodyOn', cellType: 'bed', who: 0 }, { type: 'inZone', who: 0, zone: 2 },
    { type: 'row', who: 0, n: 0 }, { type: 'col', who: 0, n: 5 }, { type: 'zoneCount', who: 0, n: 1 },
    { type: 'zoneCount', who: 0, n: 4 }, { type: 'northOf', who: 1, hero: 1 }, { type: 'sameZone', who: 0, hero: 3 },
    { type: 'inZone', who: 3, zone: 0 }, { type: 'sees', who: 0, hero: 1 }, { type: 'alarm' },
    { type: 'nobodyOn', cellType: 'floor' }, { type: 'notInZone', who: 0, zone: -1 }, { type: 'aloneIn', who: 0, zone: 99 },
    { type: 'toString', who: 0 }, { type: 'onlyOn', who: 0, cellType: 'table' }, { type: 'zoneCount', who: 0, n: 2.5 },
  ];
  for (const st of ill) {
    assert.throws(() => evaluate(p, p.solution, st), /ill-formed/, JSON.stringify(st));
    assert.throws(() => solve({ ...p, statements: [st] }), /ill-formed/, JSON.stringify(st));
    assert.throws(() => stepSolve({ ...p, statements: [st] }), /ill-formed/, JSON.stringify(st));
  }
  for (const ex of [example1, example2]) for (const st of ex.statements) assert.equal(evaluate(ex, ex.solution, st), true);
  // Domain boundaries are accepted.
  for (const st of [{ type: 'row', who: 0, n: p.n }, { type: 'col', who: 2, n: 1 }, { type: 'zoneCount', who: 0, n: p.heroes.length },
    { type: 'zoneCount', who: 0, n: 2 }, { type: 'nobodyOn', cellType: 'bed' }, { type: 'aloneIn', who: 2, zone: 1 }, { type: 'alone', who: 1 }]) {
    assert.doesNotThrow(() => evaluate(p, p.solution, st), JSON.stringify(st));
  }
});
