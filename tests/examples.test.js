// RULES.md §7 and §8: solver and independent reference agree with the documented answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { example1, example2 } from './fixtures/examples.js';
import { solve } from '../src/solver.js';
import { thiefOf } from '../src/statements.js';
import { refSolve, refThief } from './reference.js';

for (const [name, ex] of [['example 1', example1], ['example 2', example2]]) {
  test(`${name}: unique documented solution and thief`, () => {
    assert.deepEqual(solve(ex, 10).solutions, [ex.solution]);
    assert.deepEqual(refSolve(ex, 10), [ex.solution]);
    assert.equal(thiefOf(ex, ex.solution), ex.thief);
    assert.equal(refThief(ex, ex.solution), ex.thief);
  });

  test(`${name}: every statement is necessary`, () => {
    ex.statements.forEach((_, i) => {
      const rest = { ...ex, statements: ex.statements.filter((__, j) => j !== i) };
      assert.ok(solve(rest, 2).solutions.length >= 2, `statement ${i} is redundant`);
    });
  });
}

test('example 2: valid placements without statements', () => {
  assert.equal(solve({ ...example2, statements: [] }, Infinity).solutions.length, example2.bareSolutions);
});
