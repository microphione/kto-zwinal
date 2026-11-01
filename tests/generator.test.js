// Generated puzzles (rules v3) satisfy RULES.md Q1, Q2, Q4, Q5, the generator conventions and the JSON contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, DIFFICULTIES, FAMILY, PUZZLE_VERSION } from '../src/generator.js';
import { solve } from '../src/solver.js';
import { getBoard, safeOf } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, UNARY, SAFE_PAIR, unaryHolds, sameStatement } from '../src/statements.js';
import { refEval, refValid, refThief, refSafe, refSolve, refInformative } from './reference.js';
import { statementText } from '../src/text.js';
import { refSolveSparse } from './helpers.js';

const PER_DIFFICULTY = { easy: 40, medium: 30, hard: 20, expert: 10 };
const HINTS = { easy: 0, medium: 1, hard: 2, expert: 2 };
// refSolve enumerates every candidate: affordable up to 6×6 (60k); 7×7 and 8×8 (millions) use the pruned brute force.
const refUnique = (p, seed) => (p.n <= 6 ? refSolve(p) : seed <= 10 ? refSolveSparse(p, p.statements, 3e7) : undefined);

// Statements that say the same thing about the same heroes (RULES.md §6, generator conventions).
const MIRROR = { northOf: 'southOf', southOf: 'northOf', westOf: 'eastOf', eastOf: 'westOf', sameZone: 'sameZone', otherZone: 'otherZone' };
function equivalent(a, b) {
  if (sameStatement(a, b)) return true;
  return MIRROR[a.type] === b.type && a.who === b.hero && a.hero === b.who;
}

for (const [difficulty, count] of Object.entries(PER_DIFFICULTY)) {
  test(`${difficulty}: ${count} generated puzzles are valid, unique, minimal and conventional`, () => {
    const cfg = DIFFICULTIES[difficulty];
    assert.equal(cfg.heroes, cfg.n - 1);
    assert.equal(cfg.drones, HINTS[difficulty]);
    for (let seed = 1; seed <= count; seed++) {
      const p = generatePuzzle(seed, difficulty);
      const at = `${difficulty} seed ${seed}`;
      const board = getBoard(p);
      // Contract v3: version, solution = placement, safe derived, thief, grade; the map has no safe.
      assert.equal(p.version, 3);
      assert.equal(PUZZLE_VERSION, 3);
      assert.equal(p.n, cfg.n);
      assert.equal(p.heroes.length, cfg.heroes);
      assert.equal(p.zoneNames.length, cfg.zones);
      assert.equal(p.cells.flat().filter(t => t === 'safe').length, 0, at);
      assert.equal(p.solution.length, cfg.heroes);
      assert.equal(p.safe, safeOf(board, p.solution), at);
      assert.equal(p.safe, refSafe(p, p.solution), at);
      assert.equal(p.cells[Math.floor(p.safe / p.n)][p.safe % p.n], 'ground', at);
      // Pinned literally: easy and medium never need a trial step.
      assert.equal(cfg.maxLevel, { easy: 2, medium: 2, hard: 3, expert: 3 }[difficulty], at);
      assert.ok(Number.isInteger(p.grade.level) && p.grade.level <= cfg.maxLevel && p.grade.steps > 0, at);
      // The solution is valid; thief per R2 (production and reference)
      assert.ok(isValidPlacement(p, p.solution) && refValid(p, p.solution), at);
      assert.equal(p.thief, thiefOf(p, p.solution), at);
      assert.equal(p.thief, refThief(p, p.solution), at);
      // Every statement true (production and reference) and has Polish text
      for (const st of p.statements) {
        assert.ok(evaluate(p, p.solution, st) && refEval(p, p.solution, st), `${at} ${JSON.stringify(st)}`);
        assert.doesNotMatch(statementText(p, st), /undefined|NaN/, at);
        assert.ok(st.type in FAMILY, `${at}: unknown kind ${st.type}`);
        if (st.type === 'sees') assert.ok(['crate', 'barrel', 'rock'].includes(st.cellType), at);
      }
      // Q1 unique (solver; the independent brute force where affordable)
      assert.deepEqual(solve(p, 2).solutions, [p.solution], at);
      const refSolutions = refUnique(p, seed);
      if (refSolutions !== undefined) assert.deepEqual(refSolutions, [p.solution], at);
      // Q2 minimal: every statement is necessary
      p.statements.forEach((_, i) => {
        const rest = { ...p, statements: p.statements.filter((__, j) => j !== i) };
        assert.ok(solve(rest, 2).solutions.length >= 2, `${at}: statement ${i} redundant`);
      });
      // Q4 readable: at most 2 statements per subject, at most 1 alarm
      const per = new Map();
      for (const st of p.statements) if (st.who !== undefined) per.set(st.who, (per.get(st.who) ?? 0) + 1);
      assert.ok([...per.values()].every(v => v <= 2), at);
      assert.ok(p.statements.filter(st => st.type === 'alarm').length <= 1, at);
      // Conventions: no equivalent statements
      p.statements.forEach((a, i) => p.statements.forEach((b, j) => {
        if (i < j) assert.ok(!equivalent(a, b), `${at}: equivalent statements ${JSON.stringify(a)} ${JSON.stringify(b)}`);
      }));
      // Conventions: the safe has at least 2 thief spots, every zone has at least 3 walkable cells
      assert.ok(board.thiefSpots[p.safe].length >= 2, `${at}: safe with ${board.thiefSpots[p.safe].length} thief spots`);
      for (const cells of board.zoneCells) {
        assert.ok(cells.filter(c => board.walk[c]).length >= 3, `${at}: zone with fewer than 3 walkable cells`);
      }
      // Q5 informative: an own-cell statement is not true on every walkable cell; implied by Q1 + Q2 and also
      // checked by the brute force where affordable
      for (const st of p.statements) {
        if (UNARY.has(st.type) && !SAFE_PAIR[st.type]) {
          const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
          assert.ok(hits > 0 && hits < board.walkCells.length, `${at}: uninformative ${JSON.stringify(st)}`);
        }
        if (seed <= 4 && cfg.n <= 6) assert.ok(refInformative(p, st), `${at}: uninformative ${JSON.stringify(st)}`);
      }
      // §1: zones are 4-connected and contain a walkable cell
      for (const cells of board.zoneCells) {
        assert.ok(cells.some(c => board.walk[c]), at);
        const seen = new Set([cells[0]]);
        const queue = [cells[0]];
        while (queue.length) {
          const c = queue.pop();
          const r = Math.floor(c / p.n), col = c % p.n;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = r + dr, nc = col + dc, j = nr * p.n + nc;
            if (nr >= 0 && nc >= 0 && nr < p.n && nc < p.n && board.zone[j] === board.zone[c] && !seen.has(j)) { seen.add(j); queue.push(j); }
          }
        }
        assert.equal(seen.size, cells.length, `${at}: zone not connected`);
      }
    }
  });
}

test('generation is deterministic per seed and difficulty', () => {
  assert.deepEqual(generatePuzzle('abc', 'medium'), generatePuzzle('abc', 'medium'));
  assert.notDeepEqual(generatePuzzle('abc', 'medium'), generatePuzzle('abd', 'medium'));
});

test('the drone is a hint, not a statement: no drone statements or kinds exist', () => {
  assert.ok(!('drone' in FAMILY));
  for (let seed = 1; seed <= 10; seed++) {
    for (const st of generatePuzzle(`nodrone${seed}`, 'hard').statements) assert.notEqual(st.type, 'drone');
  }
});

// Owner's design table (PLAN.md stage 2b): every clue kind actually shows up in generated cases.
// Row / column clues carry weight 0.3 (raw coordinates) and in v3 rarely beat the rook rule, so that family
// is counted over hard and medium puzzles together (measured 2026-11-01: 1 in 40 hard, 4 in 40 medium).
test('every clue kind of the design table occurs in generated puzzles', () => {
  const kinds = difficulty => {
    const types = [];
    for (let seed = 1; seed <= 40; seed++) types.push(...generatePuzzle(`kinds${seed}`, difficulty).statements.map(st => st.type));
    return types;
  };
  const hard = kinds('hard');
  const medium = kinds('medium');
  for (const kind of new Set(Object.values(FAMILY))) {
    const count = hard.filter(t => FAMILY[t] === kind).length;
    if (kind === 'line') {
      const both = count + medium.filter(t => FAMILY[t] === kind).length;
      assert.ok(both >= 2, `${kind}: only ${both} in 40 hard + 40 medium puzzles`);
    } else {
      assert.ok(count >= 3, `${kind}: only ${count} in 40 hard puzzles`);
    }
  }
  for (const negative of ['notInZone', 'notNextTo', 'otherZone']) {
    const count = hard.filter(t => t === negative).length;
    assert.ok(count >= 5, `${negative}: only ${count} in 40 hard puzzles`);
  }
});
