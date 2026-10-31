// Production evaluators and solver cross-checked against the independent brute force (tests/reference.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solver.js';
import { evaluate, isValidPlacement, thiefOf } from '../src/statements.js';
import { refEval, refValid, refThief, refSolve } from './reference.js';
import { randomBoardPuzzle, randomStatement, randomPlacement, randomValidPlacement, sortPlacements, LARGE } from './helpers.js';
import { trueStatements } from '../src/statements.js';

const BOARDS = 500;

test('evaluate / isValidPlacement / thiefOf match the reference on random placements', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    for (let i = 0; i < 20; i++) {
      const placement = randomPlacement(rng, puzzle);
      assert.equal(isValidPlacement(puzzle, placement), refValid(puzzle, placement), `board ${seed}`);
      if (refValid(puzzle, placement)) assert.equal(thiefOf(puzzle, placement), refThief(puzzle, placement));
      for (let j = 0; j < 10; j++) {
        const st = randomStatement(rng, puzzle);
        assert.equal(evaluate(puzzle, placement, st), refEval(puzzle, placement, st), `board ${seed} ${JSON.stringify(st)}`);
      }
    }
  }
});

test('solver returns exactly the reference solution set (random, possibly contradictory statements)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    const statements = Array.from({ length: rng.int(0, 4) }, () => randomStatement(rng, puzzle));
    const p = { ...puzzle, statements };
    assert.deepEqual(sortPlacements(solve(p, Infinity).solutions), sortPlacements(refSolve(p)), `board ${seed}`);
  }
});

test('solver matches the reference on satisfiable statement sets (true statements of a hidden placement)', () => {
  for (let seed = 0; seed < BOARDS; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 10000);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const statements = rng.shuffle(trueStatements(puzzle, hidden)).slice(0, rng.int(1, 6));
    for (const st of statements) assert.ok(refEval(puzzle, hidden, st), `trueStatements produced a false statement ${JSON.stringify(st)}`);
    const p = { ...puzzle, statements };
    const ours = sortPlacements(solve(p, Infinity).solutions);
    assert.deepEqual(ours, sortPlacements(refSolve(p)), `board ${seed}`);
    assert.ok(ours.includes(hidden.join(',')));
  }
});

test('large boards (6×6–8×8, high mask word): solver and evaluators match the reference', () => {
  for (let seed = 0; seed < 60; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, LARGE);
    for (let i = 0; i < 20; i++) {
      const placement = randomPlacement(rng, puzzle);
      assert.equal(isValidPlacement(puzzle, placement), refValid(puzzle, placement), `large board ${seed}`);
      const st = randomStatement(rng, puzzle);
      assert.equal(evaluate(puzzle, placement, st), refEval(puzzle, placement, st), `large board ${seed} ${JSON.stringify(st)}`);
    }
    const hidden = randomValidPlacement(rng, puzzle);
    const statements = hidden && seed % 2
      ? rng.shuffle(trueStatements(puzzle, hidden)).slice(0, 2)
      : Array.from({ length: rng.int(1, 2) }, () => randomStatement(rng, puzzle));
    const p = { ...puzzle, statements };
    assert.deepEqual(sortPlacements(solve(p, Infinity).solutions), sortPlacements(refSolve(p)), `large board ${seed}`);
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
    if (!budget.aborted) assert.deepEqual(sortPlacements(budget.solutions), sortPlacements(full.solutions));
    else assert.ok(budget.nodes > 50);
  }
});

test('placements with a duplicate cell are invalid (production and reference)', () => {
  for (let seed = 0; seed < 100; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 30000);
    const placement = randomPlacement(rng, puzzle);
    placement[1] = placement[0];
    assert.equal(isValidPlacement(puzzle, placement), false);
    assert.equal(refValid(puzzle, placement), false);
  }
});

test('trueStatements: zoneCount only for 2..k heroes, alone exactly when the hero is alone', () => {
  for (let seed = 0; seed < 300; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 40000);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    for (const st of trueStatements(puzzle, hidden)) {
      if (st.type === 'zoneCount') assert.ok(st.n >= 2 && st.n <= puzzle.heroes.length, JSON.stringify(st));
      if (st.type === 'alone') assert.ok(refEval(puzzle, hidden, st));
    }
  }
});
