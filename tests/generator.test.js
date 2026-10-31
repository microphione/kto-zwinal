// Generated puzzles satisfy RULES.md Q1, Q2, Q4, Q5 and the JSON contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, DIFFICULTIES, FAMILY } from '../src/generator.js';
import { solve } from '../src/solver.js';
import { getBoard, droneScan } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, UNARY, unaryHolds } from '../src/statements.js';
import { refEval, refValid, refThief, refSolve } from './reference.js';
import { statementText } from '../src/text.js';

const PER_DIFFICULTY = { easy: 40, medium: 30, hard: 20, expert: 10 };

for (const [difficulty, count] of Object.entries(PER_DIFFICULTY)) {
  test(`${difficulty}: ${count} generated puzzles are valid, unique and minimal`, () => {
    const cfg = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= count; seed++) {
      const p = generatePuzzle(seed, difficulty);
      const at = `${difficulty} seed ${seed}`;
      // Contract
      assert.equal(p.version, 1);
      assert.equal(p.n, cfg.n);
      assert.equal(p.heroes.length, cfg.heroes);
      assert.equal(p.zoneNames.length, cfg.zones);
      assert.equal(p.cells.flat().filter(t => t === 'safe').length, 1, at);
      assert.equal(p.solution.length, cfg.heroes);
      // Hidden solution is valid; thief per R2 (production and reference)
      assert.ok(isValidPlacement(p, p.solution) && refValid(p, p.solution), at);
      assert.equal(p.thief, thiefOf(p, p.solution));
      assert.equal(p.thief, refThief(p, p.solution));
      // Every statement true (production and reference) and has Polish text
      for (const st of p.statements) {
        assert.ok(evaluate(p, p.solution, st) && refEval(p, p.solution, st), `${at} ${JSON.stringify(st)}`);
        assert.ok(statementText(p, st).length > 0);
      }
      // Q1 unique
      assert.deepEqual(solve(p, 2).solutions, [p.solution], at);
      // Independent uniqueness proof: all easy puzzles and the first 8 medium ones (~1 s each).
      if (cfg.n <= 5 || (difficulty === 'medium' && seed <= 8)) assert.deepEqual(refSolve(p, 2), [p.solution], at);
      // Q2 minimal
      p.statements.forEach((_, i) => {
        const rest = { ...p, statements: p.statements.filter((__, j) => j !== i) };
        assert.ok(solve(rest, 2).solutions.length >= 2, `${at}: statement ${i} redundant`);
      });
      // Q4 readable
      const per = new Map();
      for (const st of p.statements) if (st.who !== undefined) per.set(st.who, (per.get(st.who) ?? 0) + 1);
      assert.ok([...per.values()].every(v => v <= 2), at);
      assert.ok(p.statements.filter(st => st.type === 'drone').length <= Math.min(2, cfg.drones), at);
      for (const st of p.statements) {
        if (st.type === 'sameZone' || st.type === 'otherZone') {
          assert.ok(!p.statements.some(x => x.type === st.type && x.who === st.hero && x.hero === st.who), at);
        }
      }
      // Q5 informative: no drone with an empty scan, no unary statement true/false for every walkable cell
      const board = getBoard(p);
      for (const st of p.statements) {
        if (st.type === 'drone') assert.ok(droneScan(board, st.side, st.index).length > 0, at);
        if (UNARY.has(st.type)) {
          const hits = board.walkCells.filter(cell => unaryHolds(board, st, cell)).length;
          assert.ok(hits > 0 && hits < board.walkCells.length, `${at}: uninformative ${JSON.stringify(st)}`);
        }
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

// Owner's design table (PLAN.md stage 2b): every clue kind actually shows up in generated cases.
// Without the diversity rule, hard puzzles had 0 zone-population and 1 same/other-zone clue in 20 seeds.
test('every clue kind of the design table occurs in generated puzzles', () => {
  const types = [];
  for (let seed = 1; seed <= 40; seed++) types.push(...generatePuzzle(`kinds${seed}`, 'hard').statements.map(st => st.type));
  for (const kind of new Set(Object.values(FAMILY))) {
    const count = types.filter(t => FAMILY[t] === kind).length;
    assert.ok(count >= 3, `${kind}: only ${count} in 40 hard puzzles`);
  }
  for (const negative of ['notInZone', 'notNextTo', 'otherZone']) {
    const count = types.filter(t => t === negative).length;
    // 7 / 16 / 20 now; the pre-fix weights give 0 / 0 / 4.
    assert.ok(count >= 5, `${negative}: only ${count} in 40 hard puzzles`);
  }
});
