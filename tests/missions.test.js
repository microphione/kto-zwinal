// Frozen missions shipped to the browser (puzzles/*.json) are valid, unique and minimal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MISSIONS } from '../scripts/freeze-missions.js';
import { solve } from '../src/solver.js';
import { refSolve, refEval, refValid, refThief } from './reference.js';

for (const m of MISSIONS) {
  test(`mission ${m.id}: valid, unique (reference), minimal`, () => {
    const p = JSON.parse(readFileSync(new URL(`../puzzles/${m.id}.json`, import.meta.url), 'utf8'));
    assert.equal(p.difficulty, m.difficulty);
    assert.ok(refValid(p, p.solution));
    assert.equal(refThief(p, p.solution), p.thief);
    for (const st of p.statements) assert.ok(refEval(p, p.solution, st), JSON.stringify(st));
    assert.deepEqual(refSolve(p, 2), [p.solution]);
    p.statements.forEach((_, i) => {
      const rest = { ...p, statements: p.statements.filter((__, j) => j !== i) };
      assert.ok(solve(rest, 2).solutions.length >= 2, `statement ${i} redundant`);
    });
  });
}

// The tutorial is RULES.md §7 (example 1) shipped as frozen JSON.
test('tutorial: equals example 1, unique (reference), solved by the step solver without trial', async () => {
  const { example1 } = await import('./fixtures/examples.js');
  const { stepSolve } = await import('../src/steps.js');
  const p = JSON.parse(readFileSync(new URL('../puzzles/samouczek.json', import.meta.url), 'utf8'));
  for (const f of ['n', 'cells', 'zones', 'zoneNames', 'statements', 'solution', 'thief']) assert.deepEqual(p[f], example1[f], f);
  assert.deepEqual(p.heroes.map(h => [h.name, h.gender]), example1.heroes.map(h => [h.name, h.gender]));
  assert.deepEqual(refSolve(p, 2), [p.solution]);
  const r = stepSolve(p, { maxLevel: 2 });
  assert.deepEqual(r.placement, p.solution);
  assert.deepEqual(p.grade, { level: r.level, steps: r.steps.length });
});
