// Step solver (PLAN.md stages 3 and 8): never eliminates a cell of any real solution (heroes and the hidden
// safe), reports a contradiction only when there is no solution, solves every shipped puzzle, and hints lead
// to the solution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stepSolve, nextHint } from '../src/steps.js';
import { getBoard, withSafe, safeCandidates } from '../src/board.js';
import { solveHidden } from '../src/solver.js';
import { generatePuzzle, DIFFICULTIES } from '../src/generator.js';
import { trueStatements } from '../src/statements.js';
import { stepText, HERO_ROSTER } from '../src/text.js';
import { MISSIONS } from '../scripts/freeze-missions.js';
import { example1, example2 } from './fixtures/examples.js';
import { randomBoardPuzzle, randomStatement, randomValidSolution, LARGE } from './helpers.js';

function assertSound(puzzle, at) {
  const result = stepSolve(puzzle);
  const { solutions } = solveHidden(puzzle, Infinity);
  if (result.contradiction) {
    assert.equal(solutions.length, 0, `${at}: contradiction ${JSON.stringify(result.contradiction)} but ${solutions.length} solutions`);
    return 'contradiction';
  }
  const k = puzzle.heroes.length;
  for (const s of solutions) {
    s.placement.forEach((cell, h) => assert.ok(result.domains[h].has(cell), `${at}: hero ${h} lost solution cell ${cell}`));
    assert.ok(result.domains[k].has(s.safe), `${at}: the safe lost solution cell ${s.safe}`);
  }
  if (result.solved) assert.deepEqual(solutions, [{ safe: result.safe, placement: result.placement }], at);
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
    const hidden = randomValidSolution(rng, puzzle);
    if (!hidden) continue;
    const pool = trueStatements(withSafe(puzzle, hidden.safe), hidden.placement);
    const statements = rng.shuffle(pool).slice(0, rng.int(4, 24));
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
    assert.equal(r.safe, p.safe);
    for (const s of r.steps) assert.doesNotMatch(stepText(p, s), /undefined|NaN/);
  });
}

// Hero k of a hint is the safe.
function playWithHints(p, at) {
  const k = p.heroes.length;
  const placement = p.solution.map(() => -1);
  let safe = -1;
  for (let i = 0; i <= k; i++) {
    const h = nextHint(p, placement, safe);
    assert.equal(h.kind, 'step', `${at}: hint ${i} is ${h.kind}`);
    assert.equal(h.cell, h.hero === k ? p.safe : p.solution[h.hero], `${at}: hint points to a wrong cell`);
    assert.equal(h.hero === k ? safe : placement[h.hero], -1, `${at}: hint for a placed hero`);
    assert.ok(h.chain.length > 0);
    for (const s of h.chain) assert.doesNotMatch(stepText(p, s), /undefined|NaN/, at);
    // The chain alone justifies the cell: replaying its eliminations leaves exactly that cell.
    const left = new Set(h.hero === k ? safeCandidates(p) : getBoard(p).walkCells);
    for (const s of h.chain) for (const e of s.effects) if (e.hero === h.hero) for (const c of e.removed) left.delete(c);
    assert.deepEqual([...left], [h.cell], `${at}: hint chain does not justify the cell`);
    if (h.hero === k) safe = h.cell;
    else placement[h.hero] = h.cell;
  }
  assert.equal(nextHint(p, placement, safe).kind, 'done');
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
      assert.equal(r.safe, p.safe, at);
      assert.deepEqual(p.grade, { level: r.level, steps: r.steps.length }, at);
      assert.ok(p.grade.level <= cfg.maxLevel, at);
      playWithHints(p, at);
      // A wrong hero is reported before anything else.
      const wrong = p.solution.slice();
      wrong[0] = p.solution[1];
      wrong[1] = -1;
      assert.deepEqual(nextHint(p, wrong), { kind: 'wrong', hero: 0 }, at);
      // A wrong safe too, once the heroes are right.
      const off = safeCandidates(p).find(c => c !== p.safe);
      assert.deepEqual(nextHint(p, p.solution.map(() => -1), off), { kind: 'wrong', hero: p.heroes.length }, at);
    }
  }
});

test('shipped puzzles: hints solve them one hero at a time', () => {
  for (const [name, p] of shipped) playWithHints(p, name);
});
