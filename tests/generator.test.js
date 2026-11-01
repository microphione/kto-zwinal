// Generated puzzles satisfy RULES.md Q1, Q2, Q4, Q5 and the JSON contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, DIFFICULTIES, FAMILY } from '../src/generator.js';
import { solveHidden } from '../src/solver.js';
import { getBoard, droneScan, withSafe } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, UNARY, unaryHolds } from '../src/statements.js';
import { refEval, refValid, refThief, refSolve, refInformative } from './reference.js';
import { statementText } from '../src/text.js';

const PER_DIFFICULTY = { easy: 40, medium: 30, hard: 20, expert: 10 };

for (const [difficulty, count] of Object.entries(PER_DIFFICULTY)) {
  test(`${difficulty}: ${count} generated puzzles are valid, unique and minimal`, () => {
    const cfg = DIFFICULTIES[difficulty];
    for (let seed = 1; seed <= count; seed++) {
      const p = generatePuzzle(seed, difficulty);
      const at = `${difficulty} seed ${seed}`;
      // Contract (v2: the map has no safe, `safe` is its hidden cell)
      assert.equal(p.version, 2);
      assert.equal(p.n, cfg.n);
      assert.equal(p.heroes.length, cfg.heroes);
      assert.equal(p.zoneNames.length, cfg.zones);
      assert.equal(p.cells.flat().filter(t => t === 'safe').length, 0, at);
      assert.equal(p.cells[Math.floor(p.safe / p.n)][p.safe % p.n], 'ground', at);
      assert.equal(p.solution.length, cfg.heroes);
      const map = withSafe(p, p.safe);
      // Hidden solution is valid; thief per R2 (production and reference)
      assert.ok(isValidPlacement(map, p.solution) && refValid(p, p.safe, p.solution), at);
      assert.equal(p.thief, thiefOf(map, p.solution));
      assert.equal(p.thief, refThief(p, p.safe, p.solution));
      // Every statement true (production and reference) and has Polish text
      for (const st of p.statements) {
        assert.ok(evaluate(map, p.solution, st) && refEval(p, p.safe, p.solution, st), `${at} ${JSON.stringify(st)}`);
        assert.ok(statementText(p, st).length > 0);
      }
      // Q1 unique
      const truth = [{ safe: p.safe, placement: p.solution }];
      assert.deepEqual(solveHidden(p, 2).solutions, truth, at);
      // Independent uniqueness proof (brute force): easy puzzles.
      if (cfg.n <= 5) assert.deepEqual(refSolve(p), truth, at);
      // Q2 minimal
      p.statements.forEach((_, i) => {
        const rest = { ...p, statements: p.statements.filter((__, j) => j !== i) };
        assert.ok(solveHidden(rest, 2).solutions.length >= 2, `${at}: statement ${i} redundant`);
      });
      // Q4 readable
      const per = new Map();
      for (const st of p.statements) if (st.who !== undefined) per.set(st.who, (per.get(st.who) ?? 0) + 1);
      assert.ok([...per.values()].every(v => v <= 2), at);
      assert.ok(p.statements.filter(st => st.type === 'drone').length <= Math.min(2, cfg.drones), at);
      assert.ok(p.statements.filter(st => st.type === 'alarm').length <= 1, at);
      for (const st of p.statements) {
        if (st.type === 'sameZone' || st.type === 'otherZone') {
          assert.ok(!p.statements.some(x => x.type === st.type && x.who === st.hero && x.hero === st.who), at);
        }
      }
      // Q5 informative (implied by Q1 + Q2; checked by the brute force on a few easy puzzles) and the
      // generator convention: no drone whose scan is empty in the solution
      const board = getBoard(p);
      const mapBoard = getBoard(map);
      for (const st of p.statements) {
        if (st.type === 'drone') assert.ok(droneScan(mapBoard, st.side, st.index).length > 0, at);
        if (UNARY.has(st.type)) {
          const hits = mapBoard.walkCells.filter(cell => unaryHolds(mapBoard, st, cell)).length;
          assert.ok(hits > 0, `${at}: uninformative ${JSON.stringify(st)}`);
        }
        if (cfg.n <= 5 && seed <= 5) assert.ok(refInformative(p, st), `${at}: uninformative ${JSON.stringify(st)}`);
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
