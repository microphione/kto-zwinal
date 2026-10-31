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
