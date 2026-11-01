// Production evaluators and solver cross-checked against the independent brute force (tests/reference.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, solveHidden } from '../src/solver.js';
import { withSafe, safeCandidates, getBoard } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, trueStatements } from '../src/statements.js';
import { refEval, refValid, refThief, refSolve, refCandidates, refInformative } from './reference.js';
import { randomBoardPuzzle, randomStatement, randomPlacement, randomSafe, randomValidSolution, sortSolutions, LARGE } from './helpers.js';

const BOARDS = 300;

test('evaluate / isValidPlacement / thiefOf match the reference on random candidates', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    for (let i = 0; i < 20; i++) {
      const safe = randomSafe(rng, puzzle);
      const placement = randomPlacement(rng, puzzle, safe);
      const map = withSafe(puzzle, safe);
      assert.equal(isValidPlacement(map, placement), refValid(puzzle, safe, placement), `board ${seed}`);
      if (refValid(puzzle, safe, placement)) assert.equal(thiefOf(map, placement), refThief(puzzle, safe, placement));
      for (let j = 0; j < 10; j++) {
        const st = randomStatement(rng, puzzle);
        assert.equal(evaluate(map, placement, st), refEval(puzzle, safe, placement, st), `board ${seed} ${JSON.stringify(st)}`);
      }
    }
  }
});

test('safeCandidates = ground cells with a walkable neighbour = safe cells of the reference candidates', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { puzzle } = randomBoardPuzzle(seed + 5000);
    const ref = new Set(refCandidates(puzzle).map(s => s.safe));
    assert.deepEqual(safeCandidates(puzzle).filter(s => ref.has(s)), safeCandidates(puzzle), `board ${seed}`);
  }
});

test('solveHidden returns exactly the reference solution set (random, possibly contradictory statements)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    const statements = Array.from({ length: rng.int(0, 4) }, () => randomStatement(rng, puzzle));
    const p = { ...puzzle, statements };
    assert.deepEqual(sortSolutions(solveHidden(p, Infinity).solutions), sortSolutions(refSolve(p)), `board ${seed}`);
  }
});

test('solveHidden matches the reference on satisfiable statement sets (true statements of a hidden solution)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 10000);
    const hidden = randomValidSolution(rng, puzzle);
    if (!hidden) continue;
    const statements = rng.shuffle(trueStatements(withSafe(puzzle, hidden.safe), hidden.placement)).slice(0, rng.int(1, 6));
    for (const st of statements) {
      assert.ok(refEval(puzzle, hidden.safe, hidden.placement, st), `trueStatements produced a false statement ${JSON.stringify(st)}`);
    }
    const p = { ...puzzle, statements };
    const ours = sortSolutions(solveHidden(p, Infinity).solutions);
    assert.deepEqual(ours, sortSolutions(refSolve(p)), `board ${seed}`);
    assert.ok(ours.includes(sortSolutions([hidden])[0]));
  }
});

test('large boards (6×6–8×8, high mask word): solver and evaluators match the reference', () => {
  for (let seed = 0; seed < 40; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, LARGE);
    for (let i = 0; i < 20; i++) {
      const safe = randomSafe(rng, puzzle);
      const placement = randomPlacement(rng, puzzle, safe);
      const map = withSafe(puzzle, safe);
      assert.equal(isValidPlacement(map, placement), refValid(puzzle, safe, placement), `large board ${seed}`);
      const st = randomStatement(rng, puzzle);
      assert.equal(evaluate(map, placement, st), refEval(puzzle, safe, placement, st), `large board ${seed} ${JSON.stringify(st)}`);
    }
    const hidden = randomValidSolution(rng, puzzle);
    const statements = hidden && seed % 2
      ? rng.shuffle(trueStatements(withSafe(puzzle, hidden.safe), hidden.placement)).slice(0, 3)
      : Array.from({ length: rng.int(2, 3) }, () => randomStatement(rng, puzzle));
    const p = { ...puzzle, statements };
    assert.deepEqual(sortSolutions(solveHidden(p, Infinity).solutions), sortSolutions(refSolve(p)), `large board ${seed}`);
  }
});

test('solve / solveHidden honour limit; budgeted searches are either aborted or identical to the full search', () => {
  for (let seed = 0; seed < 200; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 20000);
    const p = { ...puzzle, statements: Array.from({ length: rng.int(0, 2) }, () => randomStatement(rng, puzzle)) };
    const full = solveHidden(p, Infinity);
    for (const limit of [1, 2, 5]) {
      const r = solveHidden(p, limit);
      assert.equal(r.solutions.length, Math.min(limit, full.solutions.length));
      assert.equal(r.aborted, false);
    }
    const budget = solveHidden(p, Infinity, null, 50);
    if (!budget.aborted) assert.deepEqual(sortSolutions(budget.solutions), sortSolutions(full.solutions));
    else assert.ok(budget.nodes > 50);
    const safe = randomSafe(rng, puzzle);
    const one = solve(withSafe(p, safe), Infinity).solutions.map(placement => ({ safe, placement }));
    assert.deepEqual(sortSolutions(one), sortSolutions(full.solutions.filter(s => s.safe === safe)));
  }
});

test('candidates with a duplicate cell or a hero on the safe are invalid (production and reference)', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 30000);
    const safe = randomSafe(rng, puzzle);
    const placement = randomPlacement(rng, puzzle, safe);
    placement[1] = placement[0];
    assert.equal(isValidPlacement(withSafe(puzzle, safe), placement), false);
    assert.equal(refValid(puzzle, safe, placement), false);
    placement[1] = safe;
    assert.equal(isValidPlacement(withSafe(puzzle, safe), placement), false);
    assert.equal(refValid(puzzle, safe, placement), false);
  }
});

test('trueStatements: true, zoneCount only for 2..k heroes, one alarm; Q5 holds for the safe-relative kinds', () => {
  for (let seed = 0; seed < 150; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 40000);
    const hidden = randomValidSolution(rng, puzzle);
    if (!hidden) continue;
    const list = trueStatements(withSafe(puzzle, hidden.safe), hidden.placement);
    assert.equal(list.filter(st => st.type === 'alarm').length, 1);
    for (const st of list) {
      assert.ok(refEval(puzzle, hidden.safe, hidden.placement, st), JSON.stringify(st));
      if (st.type === 'zoneCount') assert.ok(st.n >= 2 && st.n <= puzzle.heroes.length, JSON.stringify(st));
    }
    if (seed % 10 === 0) {
      for (const st of list.filter(s => s.type.endsWith('Safe') || s.type === 'sees')) assert.ok(refInformative(puzzle, st), JSON.stringify(st));
    }
  }
});

test('the map with the safe in place: board.safe is the cell, it blocks, and the puzzle map has no safe', () => {
  const { rng, puzzle } = randomBoardPuzzle(1);
  assert.equal(getBoard(puzzle).safe, -1);
  const safe = randomSafe(rng, puzzle);
  const b = getBoard(withSafe(puzzle, safe));
  assert.equal(b.safe, safe);
  assert.equal(b.walk[safe], false);
  assert.equal(withSafe(puzzle, safe).cells, withSafe({ ...puzzle, statements: [] }, safe).cells);
});
