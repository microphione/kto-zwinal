// Step solver (rules v4, PLAN.md stages 9 and 10): never eliminates a cell of any real solution (heroes and the safe),
// reports a contradiction only when there is no solution, solves every generated puzzle, hints lead to the
// solution one hero at a time, drone reports are true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepSolve, nextHint, nextDrone } from '../src/steps.js';
import { getBoard, safeOf } from '../src/board.js';
import { generatePuzzle, DIFFICULTIES } from '../src/generator.js';
import { trueStatements } from '../src/statements.js';
import { stepText, droneText } from '../src/text.js';
import { refSolve } from './reference.js';
import { randomBoardPuzzle, randomStatement, randomValidPlacement, refSolveWith, LARGE } from './helpers.js';

const BAD_TEXT = /undefined|NaN/;
// Techniques seen in the soundness runs: the composite technique (onlyOn / aloneIn / nobodyOn) must be exercised.
const techs = {};

// `solutions` = the reference solutions consistent with the facts. Returns the outcome class.
function assertSound(puzzle, solutions, result, at) {
  if (result.contradiction) {
    assert.equal(solutions.length, 0, `${at}: contradiction ${JSON.stringify(result.contradiction)} but ${solutions.length} solutions`);
    return 'contradiction';
  }
  const k = puzzle.heroes.length;
  const board = getBoard(puzzle);
  for (const placement of solutions) {
    placement.forEach((cell, h) => assert.ok(result.domains[h].has(cell), `${at}: hero ${h} lost solution cell ${cell}`));
    const safe = safeOf(board, placement);
    assert.ok(result.domains[k].has(safe), `${at}: the safe lost solution cell ${safe}`);
  }
  if (result.solved) {
    assert.equal(solutions.length, 1, `${at}: solved but ${solutions.length} solutions`);
    assert.deepEqual(result.placement, solutions[0], at);
    assert.equal(result.safe, safeOf(board, solutions[0]), at);
  }
  for (const s of result.steps) {
    techs[s.tech] = (techs[s.tech] ?? 0) + 1;
    assert.doesNotMatch(stepText(puzzle, s), BAD_TEXT, at);
  }
  return result.solved ? 'solved' : 'open';
}

test('step solver is sound on random, possibly contradictory statements', () => {
  const seen = { contradiction: 0, solved: 0, open: 0 };
  for (let seed = 0; seed < 500; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed);
    const p = { ...puzzle, statements: Array.from({ length: rng.int(1, 6) }, () => randomStatement(rng, puzzle)) };
    seen[assertSound(p, refSolveWith(puzzle, p.statements), stepSolve(p), `board ${seed}`)]++;
  }
  assert.ok(seen.contradiction > 20 && seen.solved + seen.open > 20, JSON.stringify(seen));
});

test('step solver is sound on satisfiable statements (random candidate; n = 4–6, variable statement count)', () => {
  const seen = { contradiction: 0, solved: 0, open: 0 };
  for (let seed = 0; seed < 600; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed, seed % 10 === 0 ? LARGE.slice(0, 1) : undefined);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const pool = trueStatements(puzzle, hidden);
    const p = { ...puzzle, statements: rng.shuffle(pool).slice(0, rng.int(3, 20)) };
    seen[assertSound(p, refSolveWith(puzzle, p.statements), stepSolve(p), `board ${seed}`)]++;
  }
  assert.equal(seen.contradiction, 0);
  assert.ok(seen.solved > 30 && seen.open > 30, JSON.stringify(seen));
});

test('step solver with facts keeps every solution consistent with them (heroes and the safe)', () => {
  let facts = 0;
  for (let seed = 0; seed < 300; seed++) {
    const { rng, puzzle } = randomBoardPuzzle(seed + 700);
    const hidden = randomValidPlacement(rng, puzzle);
    if (!hidden) continue;
    const k = puzzle.heroes.length;
    const p = { ...puzzle, statements: rng.shuffle(trueStatements(puzzle, hidden)).slice(0, rng.int(2, 10)) };
    const chosen = rng.shuffle([...Array(k).keys()]).slice(0, rng.int(1, k - 1));
    const given = chosen.map(hero => ({ hero, cell: hidden[hero] }));
    if (rng.int(0, 3) === 0) given.push({ hero: k, cell: safeOf(getBoard(p), hidden) });
    facts += given.length;
    const consistent = refSolveWith(puzzle, p.statements).filter(s => given.every(f => (f.hero === k ? safeOf(getBoard(p), s) : s[f.hero]) === f.cell));
    assertSound(p, consistent, stepSolve(p, { facts: given }), `board ${seed}`);
  }
  assert.ok(facts > 300);
  assert.ok(techs.composite > 20, `composite steps: ${techs.composite}; all techniques ${JSON.stringify(techs)}`);
});

// Hints place one hero at a time; the safe is never a target (it appears by itself).
function playWithHints(p, at) {
  const k = p.heroes.length;
  const board = getBoard(p);
  const placement = p.solution.map(() => -1);
  for (let i = 0; i < k; i++) {
    const h = nextHint(p, placement);
    assert.equal(h.kind, 'step', `${at}: hint ${i} is ${h.kind}`);
    assert.ok(h.hero >= 0 && h.hero < k, `${at}: the safe is not a hint target`);
    assert.equal(h.cell, p.solution[h.hero], `${at}: hint points to a wrong cell`);
    assert.equal(placement[h.hero], -1, `${at}: hint for a placed hero`);
    assert.ok(h.chain.length > 0);
    for (const s of h.chain) assert.doesNotMatch(stepText(p, s), BAD_TEXT, at);
    // The chain alone justifies the cell: replaying its eliminations leaves exactly that cell.
    const left = new Set(board.walkCells);
    for (const s of h.chain) for (const e of s.effects) if (e.hero === h.hero) for (const c of e.removed) left.delete(c);
    assert.deepEqual([...left], [h.cell], `${at}: hint chain does not justify the cell`);
    placement[h.hero] = h.cell;
  }
  assert.deepEqual(nextHint(p, placement), { kind: 'done' }, at);
}

function checkDrones(p, placement, at) {
  const { n } = p;
  const k = p.heroes.length;
  const flown = [];
  for (let i = 0; i < 2 * n; i++) {
    const report = nextDrone(p, placement, flown);
    assert.ok(report, `${at}: no drone left after ${i} flights`);
    const { axis, index, hero } = report;
    assert.ok(axis === 'row' || axis === 'col', at);
    assert.ok(index >= 0 && index < n, at);
    assert.ok(!flown.some(f => f.axis === axis && f.index === index), `${at}: line flown twice`);
    const inLine = c => (axis === 'row' ? Math.floor(c / n) : c % n) === index;
    // The report is true: exactly one piece stands in the line (R1) — a hero, or the safe (hero −1).
    const heroesThere = p.solution.map((c, h) => (inLine(c) ? h : -1)).filter(h => h >= 0);
    if (hero < 0) {
      assert.deepEqual(heroesThere, [], `${at}: drone says safe, but a hero stands in ${axis} ${index}`);
      assert.ok(inLine(p.safe), `${at}: drone says safe, but it is elsewhere`);
    } else {
      assert.ok(hero < k, at);
      assert.deepEqual(heroesThere, [hero], `${at}: drone report ${axis} ${index} ${hero}`);
    }
    assert.doesNotMatch(droneText(p, report), BAD_TEXT, at);
    flown.push({ axis, index });
  }
  assert.equal(nextDrone(p, placement, flown), null, `${at}: all lines flown`);
}

test('generated puzzles: graded, solved by the step solver, hints and drones behave', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const cfg = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= (difficulty === 'expert' ? 6 : 16); seed++) {
      const p = generatePuzzle(`steps${seed}`, difficulty);
      const at = `${difficulty} ${seed}`;
      const r = stepSolve(p, { maxLevel: cfg.maxLevel });
      assert.ok(r.solved, at);
      assert.deepEqual(r.placement, p.solution, at);
      assert.equal(r.safe, p.safe, at);
      assert.deepEqual(p.grade, { level: r.level, steps: r.steps.length }, at);
      assert.ok(p.grade.level <= cfg.maxLevel, at);
      for (const s of r.steps) assert.doesNotMatch(stepText(p, s), BAD_TEXT, at);
      playWithHints(p, at);
      // A wrong hero is reported before anything else.
      const wrong = p.solution.slice();
      wrong[0] = p.solution[1];
      wrong[1] = -1;
      const hint = nextHint(p, wrong);
      assert.equal(hint.kind, 'wrong', at);
      assert.equal(hint.hero, 0, at);
      // Drone reports: nothing placed, a partial board, the solved board.
      checkDrones(p, p.solution.map(() => -1), at);
      checkDrones(p, p.solution.map((c, h) => (h % 2 ? c : -1)), at);
      checkDrones(p, p.solution, at);
    }
  }
});

test('nextDrone prefers lines of heroes (or the safe) the player has not settled yet', () => {
  for (const difficulty of ['medium', 'hard']) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = generatePuzzle(`drone${seed}`, difficulty);
      // Everything placed except hero 0: the safe's lines count as open too, so the report is about hero 0 or the safe.
      const placement = p.solution.map((c, h) => (h === 0 ? -1 : c));
      const flown = [];
      for (let i = 0; i < 4; i++) {
        const report = nextDrone(p, placement, flown);
        assert.ok(report.hero === 0 || report.hero === -1, `${difficulty} ${seed}: flight ${i} reports hero ${report.hero}`);
        flown.push(report);
      }
      // Fully placed: nothing is open, but every line can still be flown.
      assert.ok(nextDrone(p, p.solution, []));
    }
  }
});

test('refSolve agrees: generated medium puzzle has the unique solution the step solver finds', () => {
  const p = generatePuzzle('steps2', 'medium');
  assert.deepEqual(refSolve(p), [p.solution]);
});
