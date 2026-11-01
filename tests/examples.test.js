// RULES.md §8: solver and independent reference agree with the documented answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { example1, example2 } from './fixtures/examples.js';
import { solve } from '../src/solver.js';
import { getBoard, safeOf } from '../src/board.js';
import { thiefOf } from '../src/statements.js';
import { refSolve, refThief } from './reference.js';

for (const [name, ex] of [['example 1', example1], ['example 2', example2]]) {
  test(`${name}: unique documented solution (safe and heroes) and thief`, () => {
    const truth = [ex.solution];
    assert.deepEqual(solve(ex, 10).solutions, truth);
    assert.deepEqual(refSolve(ex), truth);
    assert.equal(safeOf(getBoard(ex), ex.solution), ex.safe);
    assert.equal(thiefOf(ex, ex.solution), ex.thief);
    assert.equal(refThief(ex, ex.solution), ex.thief);
  });

  test(`${name}: every statement is necessary`, () => {
    ex.statements.forEach((_, i) => {
      const rest = { ...ex, statements: ex.statements.filter((__, j) => j !== i) };
      assert.ok(solve(rest, 2).solutions.length >= 2, `statement ${i} is redundant`);
      assert.ok(refSolve(rest).length >= 2, `statement ${i} is redundant (reference)`);
    });
  });
}

for (const [name, ex] of [['example 1', example1], ['example 2', example2]]) {
  test(`${name}: candidates without statements`, () => {
    assert.equal(solve({ ...ex, statements: [] }, Infinity).solutions.length, ex.bareSolutions);
    assert.equal(refSolve({ ...ex, statements: [] }).length, ex.bareSolutions);
  });
}
