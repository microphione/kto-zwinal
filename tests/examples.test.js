// RULES.md §7 and §8: solver and independent reference agree with the documented answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { example1, example2 } from './fixtures/examples.js';
import { solveHidden } from '../src/solver.js';
import { withSafe } from '../src/board.js';
import { thiefOf } from '../src/statements.js';
import { refSolve, refThief } from './reference.js';

for (const [name, ex] of [['example 1', example1], ['example 2', example2]]) {
  test(`${name}: unique documented solution (safe and heroes) and thief`, () => {
    const truth = [{ safe: ex.safe, placement: ex.solution }];
    assert.deepEqual(solveHidden(ex, 10).solutions, truth);
    assert.deepEqual(refSolve(ex), truth);
    assert.equal(thiefOf(withSafe(ex, ex.safe), ex.solution), ex.thief);
    assert.equal(refThief(ex, ex.safe, ex.solution), ex.thief);
  });

  test(`${name}: every statement is necessary`, () => {
    ex.statements.forEach((_, i) => {
      const rest = { ...ex, statements: ex.statements.filter((__, j) => j !== i) };
      assert.ok(solveHidden(rest, 2).solutions.length >= 2, `statement ${i} is redundant`);
      assert.ok(refSolve(rest).length >= 2, `statement ${i} is redundant (reference)`);
    });
  });
}

test('example 2: candidates (safe + placement) without statements', () => {
  assert.equal(solveHidden({ ...example2, statements: [] }, Infinity).solutions.length, example2.bareSolutions);
  assert.equal(refSolve({ ...example2, statements: [] }).length, example2.bareSolutions);
});
