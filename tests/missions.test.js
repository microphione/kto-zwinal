// Frozen missions shipped to the browser (puzzles/*.json) are valid, unique and minimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSIONS } from '../scripts/freeze-missions.js';
import { solve } from '../src/solver.js';
import { getBoard, safeOf } from '../src/board.js';
import { refSolve, refEval, refValid, refThief } from './reference.js';

const load = id => JSON.parse(readFileSync(new URL(`../puzzles/${id}.json`, import.meta.url), 'utf8'));

for (const m of MISSIONS) {
  test(`mission ${m.id}: valid, unique, minimal`, () => {
    const p = load(m.id);
    assert.equal(p.version, 4);
    assert.equal(p.difficulty, m.difficulty);
    assert.ok(refValid(p, p.solution));
    assert.equal(safeOf(getBoard(p), p.solution), p.safe);
    assert.equal(refThief(p, p.solution), p.thief);
    for (const st of p.statements) assert.ok(refEval(p, p.solution, st), JSON.stringify(st));
    const truth = [p.solution];
    assert.deepEqual(solve(p, 2).solutions, truth);
    // The brute force proves uniqueness on the 5×5 mission (the 6×6 one would take minutes).
    if (p.n <= 5) assert.deepEqual(refSolve(p), truth);
    p.statements.forEach((_, i) => {
      const rest = { ...p, statements: p.statements.filter((__, j) => j !== i) };
      assert.ok(solve(rest, 2).solutions.length >= 2, `statement ${i} redundant`);
    });
  });
}

// The tutorial is RULES.md §8 example 1 shipped as frozen JSON.
test('tutorial: equals example 1, unique (reference), solved by the step solver without trial', async () => {
  const { example1 } = await import('./fixtures/examples.js');
  const { stepSolve } = await import('../src/steps.js');
  const p = load('samouczek');
  for (const f of ['version', 'n', 'setting', 'cells', 'zones', 'zoneNames', 'zoneKinds', 'statements', 'safe', 'solution', 'thief']) assert.deepEqual(p[f], example1[f], f);
  assert.deepEqual(p.heroes, example1.heroes);
  assert.deepEqual(refSolve(p), [p.solution]);
  const r = stepSolve(p, { maxLevel: 2 });
  assert.deepEqual(r.placement, p.solution);
  assert.equal(r.safe, p.safe);
  assert.deepEqual(p.grade, { level: r.level, steps: r.steps.length });
});
