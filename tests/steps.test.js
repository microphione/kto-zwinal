// Step solver (PLAN.md stage 3): never eliminates a cell of any real solution, reports a contradiction only
// when there is no solution, solves every shipped puzzle, and hints lead to the solution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepSolve, nextHint } from '../src/steps.js';
import { getBoard } from '../src/board.js';
import { solve } from '../src/solver.js';
import { generatePuzzle, DIFFICULTIES } from '../src/generator.js';
import { trueStatements } from '../src/statements.js';
import { stepText, HERO_ROSTER } from '../src/text.js';
import { MISSIONS } from '../scripts/freeze-missions.js';
import { example1, example2 } from './fixtures/examples.js';
import { randomBoardPuzzle, randomStatement, randomValidPlacement, LARGE } from './helpers.js';

function assertSound(puzzle, at) {
  const result = stepSolve(puzzle);
  const { solutions } = solve(puzzle, Infinity);
  if (result.contradiction) {
    assert.equal(solutions.length, 0, `${at}: contradiction ${JSON.stringify(result.contradiction)} but ${solutions.length} solutions`);
    return 'contradiction';
  }
  for (const s of solutions) {
    s.forEach((cell, h) => assert.ok(result.domains[h].has(cell), `${at}: hero ${h} lost solution cell ${cell}`));
  }
  if (result.solved) assert.deepEqual(solutions, [result.placement], at);
  return result.solved ? 'solved' : 'open';
}

test('step solver is sound on random, possibly contradictory statements', () => {
  const seen = { contradiction: 0, solved: 0, open: 0 };
  for (let seed = 0; seed < 500; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    const statements = Array.from({ length: rng.int(1, 6) }, () => randomStatement(rng, puzzle));
    seen[assertSound({ ...puzzle, statements }, `board ${seed}`)]++;
  }
  // Both outcomes must actually be exercised.
  assert.ok(seen.contradiction > 20 && seen.solved + seen.open > 20, JSON.stringify(seen));
});

test('step solver is sound on satisfiable statements (small and large boards)', () => {
  const seen = { contradiction: 0, solved: 0, open: 0 };
  for (let seed = 0; seed < 600; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, seed % 3 === 0 ? LARGE : undefined);
    const placement = randomValidPlacement(rng, puzzle);
    if (!placement) continue;
    const pool = trueStatements(puzzle, placement);
    const statements = rng.shuffle(pool).slice(0, rng.int(3, 16));
    seen[assertSound({ ...puzzle, statements }, `board ${seed}`)]++;
  }
  assert.equal(seen.contradiction, 0);
  assert.ok(seen.solved > 30 && seen.open > 30, JSON.stringify(seen));
});

const named = ex => ({ ...ex, heroes: ex.heroes.map(h => ({ ...h, ...HERO_ROSTER.find(r => r.name === h.name) })) });
const shipped = [
  ['example 1', named(example1)],
  ['example 2', named(example2)],
  ...MISSIONS.map(m => [m.id, JSON.parse(readFileSync(new URL(`../puzzles/${m.id}.json`, import.meta.url), 'utf8'))]),
];

for (const [name, p] of shipped) {
  test(`${name}: solved by the step solver without trial, every step has text`, () => {
    const r = stepSolve(p, { maxLevel: 2 });
    assert.ok(r.solved, name);
    assert.deepEqual(r.placement, p.solution);
    for (const s of r.steps) assert.doesNotMatch(stepText(p, s), /undefined|NaN/);
  });
}

function playWithHints(p, at) {
  const placement = p.solution.map(() => -1);
  for (let i = 0; i < p.heroes.length; i++) {
    const h = nextHint(p, placement);
    assert.equal(h.kind, 'step', `${at}: hint ${i} is ${h.kind}`);
    assert.equal(h.cell, p.solution[h.hero], `${at}: hint points to a wrong cell`);
    assert.equal(placement[h.hero], -1, `${at}: hint for a placed hero`);
    assert.ok(h.chain.length > 0);
    for (const s of h.chain) assert.doesNotMatch(stepText(p, s), /undefined|NaN/, at);
    // The chain alone justifies the cell: replaying its eliminations leaves exactly that cell.
    const left = new Set(getBoard(p).walkCells);
    for (const s of h.chain) for (const e of s.effects) if (e.hero === h.hero) for (const c of e.removed) left.delete(c);
    assert.deepEqual([...left], [h.cell], `${at}: hint chain does not justify the cell`);
    placement[h.hero] = h.cell;
  }
  assert.equal(nextHint(p, placement).kind, 'done');
}

test('generated puzzles: graded, solved by the step solver, hints solve them one hero at a time', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const cfg = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= (difficulty === 'expert' ? 8 : 20); seed++) {
      const p = generatePuzzle(`steps${seed}`, difficulty);
      const at = `${difficulty} ${seed}`;
      const r = stepSolve(p, { maxLevel: cfg.maxLevel });
      assert.ok(r.solved, at);
      assert.deepEqual(r.placement, p.solution, at);
      assert.deepEqual(p.grade, { level: r.level, steps: r.steps.length }, at);
      assert.ok(p.grade.level <= cfg.maxLevel, at);
      playWithHints(p, at);
      // A wrong hero is reported before anything else.
      const wrong = p.solution.slice();
      wrong[0] = p.solution[1];
      wrong[1] = -1;
      assert.deepEqual(nextHint(p, wrong), { kind: 'wrong', hero: 0 }, at);
    }
  }
});

test('shipped puzzles: hints solve them one hero at a time', () => {
  for (const [name, p] of shipped) playWithHints(p, name);
});
