// Production evaluators and solver (rules v3) cross-checked against the independent brute force (tests/reference.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solver.js';
import { getBoard, safeOf } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, trueStatements, UNARY, SAFE_PAIR } from '../src/statements.js';
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
  // The reference defines statement truth where the safe exists.
  if (refSafe(puzzle, placement) >= 0) {
    for (let j = 0; j < 12; j++) {
      const st = randomStatement(rng, puzzle);
      assert.equal(evaluate(puzzle, placement, st), refEval(puzzle, placement, st), `${at}: ${JSON.stringify(st)} on ${placement}`);
    }
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

test('statements about the safe are false when the placement leaves no single safe cell', () => {
  const puzzle = { ...randomBoardPuzzle(0).puzzle };
  const board = getBoard(puzzle);
  const free = board.walkCells;
  // Two heroes in one row: the remaining rows/columns are not exactly one of each.
  const [a, b] = free.filter(c => board.row(c) === board.row(free[0]));
  assert.ok(b !== undefined, "board 0 has two walkable cells in one row");
  const placement = [a, b, ...free.filter(c => c !== a && c !== b)].slice(0, puzzle.heroes.length);
  assert.equal(safeOf(board, placement), -1);
  for (const type of Object.keys(SAFE_PAIR)) assert.equal(evaluate(puzzle, placement, { type, who: 0 }), false, type);
  assert.equal(evaluate(puzzle, placement, { type: 'alarm', zone: 0 }), false);
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
      for (let who = 0; who < k; who++) statements.push(...pool.filter(st => st.who === who && UNARY.has(st.type) && !SAFE_PAIR[st.type]).slice(0, 2));
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

test('trueStatements: all true, zoneCount in 2..k, exactly one alarm, Q5 for the non-safe kinds', () => {
  let checked = 0;
  for (let seed = 0; seed < 150; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 40000);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const list = trueStatements(puzzle, hidden);
    const alarms = list.filter(st => st.type === 'alarm');
    assert.equal(alarms.length, 1);
    assert.equal(alarms[0].zone, getBoard(puzzle).zone[safeOf(getBoard(puzzle), hidden)]);
    for (const st of list) {
      assert.ok(refEval(puzzle, hidden, st), JSON.stringify(st));
      assert.ok(evaluate(puzzle, hidden, st), JSON.stringify(st));
      if (st.type === 'zoneCount') assert.ok(st.n >= 2 && st.n <= puzzle.heroes.length, JSON.stringify(st));
      assert.notEqual(st.type, 'drone');
      if (st.type === 'sees') assert.ok(['crate', 'barrel', 'rock'].includes(st.cellType), JSON.stringify(st));
    }
    if (seed % 5 === 0) {
      // Own-cell statements except the safe-relative ones.
      for (const st of list.filter(s => UNARY.has(s.type) && !SAFE_PAIR[s.type])) {
        assert.ok(refInformative(puzzle, st), `board ${seed}: ${JSON.stringify(st)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} Q5 checks`);
});
