// Generated puzzles (rules v4) satisfy RULES.md Q1, Q2, Q4, Q5, the generator conventions and the JSON contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, DIFFICULTIES, FAMILY, PUZZLE_VERSION } from '../src/generator.js';
import { solve } from '../src/solver.js';
import { getBoard, safeOf, isPlain, CELL_TYPES } from '../src/board.js';
import { evaluate, isValidPlacement, thiefOf, UNARY, unaryHolds, sameStatement } from '../src/statements.js';
import { refEval, refValid, refThief, refSafe, refSolve, refInformative } from './reference.js';
import { statementText, SETTINGS } from '../src/text.js';
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

// One statement of the same subject implies the other (RULES.md §6): `on t` with `onlyOn t` or `notOn t'`,
// `inZone z` with `aloneIn z` or `notInZone z'`, `alone` with `aloneIn z`; `onlyOn` / `aloneIn` also imply the
// weaker kinds. Checked in both directions.
function implies(a, b) {
  const sameSubject = a.who === b.who;
  if (!sameSubject) return false;
  const typed = (st, type) => st.type === type;
  if ((typed(a, 'on') || typed(a, 'onlyOn')) && typed(b, 'notOn') && b.cellType !== a.cellType) return true;
  if (typed(a, 'onlyOn') && typed(b, 'on') && a.cellType === b.cellType) return true;
  if ((typed(a, 'inZone') || typed(a, 'aloneIn')) && typed(b, 'notInZone') && b.zone !== a.zone) return true;
  if (typed(a, 'aloneIn') && typed(b, 'inZone') && a.zone === b.zone) return true;
  return typed(a, 'aloneIn') && typed(b, 'alone');
}

// Setting conventions (RULES.md §1, §6): zone names from the setting's catalogue, kinds in step with the names,
// a house has at most one outdoor zone, the park only outdoor zones, tiles of the zone's kind.
function checkSetting(p, at) {
  const setting = SETTINGS[p.setting];
  assert.ok(setting, `${at}: unknown setting ${p.setting}`);
  assert.equal(p.zoneKinds.length, p.zoneNames.length, at);
  assert.equal(new Set(p.zoneNames).size, p.zoneNames.length, `${at}: duplicate zone names`);
  p.zoneNames.forEach((name, z) => {
    const kind = p.zoneKinds[z];
    assert.ok(kind === 'in' || kind === 'out', `${at}: zone kind ${kind}`);
    assert.ok((kind === 'in' ? setting.rooms : setting.areas).includes(name), `${at}: ${name} is not a ${kind} zone of ${p.setting}`);
  });
  const outZones = p.zoneKinds.filter(k => k === 'out').length;
  if (p.setting === 'park') assert.equal(outZones, p.zoneKinds.length, `${at}: indoor zone in the park`);
  else assert.ok(outZones <= 1, `${at}: ${outZones} outdoor zones in a house`);
  const board = getBoard(p);
  for (let cell = 0; cell < p.n * p.n; cell++) {
    const type = board.type[cell];
    assert.ok(type in CELL_TYPES, `${at}: unknown cell type ${type}`);
    assert.equal(CELL_TYPES[type].kind, p.zoneKinds[board.zone[cell]], `${at}: ${type} in a ${p.zoneKinds[board.zone[cell]]} zone`);
  }
  // Every zone has a plain cell for its name label (RULES §6 conventions).
  board.zoneCells.forEach((cells, z) => assert.ok(cells.some(cell => isPlain(board.type[cell])), `${at}: zone ${z} has no plain cell`));
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
      // Contract v4: version, setting, solution = placement, safe derived, thief, grade; the map has no safe.
      assert.equal(p.version, 4);
      assert.equal(PUZZLE_VERSION, 4);
      checkSetting(p, at);
      assert.equal(p.n, cfg.n);
      assert.equal(p.heroes.length, cfg.heroes);
      assert.equal(p.zoneNames.length, cfg.zones);
      assert.equal(p.cells.flat().filter(t => t === 'safe').length, 0, at);
      assert.equal(p.solution.length, cfg.heroes);
      assert.equal(p.safe, safeOf(board, p.solution), at);
      assert.equal(p.safe, refSafe(p, p.solution), at);
      // R0: the safe stands on a plain cell (floor or grass).
      assert.ok(isPlain(p.cells[Math.floor(p.safe / p.n)][p.safe % p.n]), at);
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
        // Zone words fit the setting: no room word where a zone is outdoors (RULES §5).
        if (p.zoneKinds.includes('out')) assert.doesNotMatch(statementText(p, st), /pomieszcz/, at);
        assert.ok(st.type in FAMILY, `${at}: unknown kind ${st.type}`);
        // Only the shared statement has no subject.
        assert.equal(st.who === undefined, st.type === 'nobodyOn', `${at}: ${JSON.stringify(st)}`);
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
      // Q4 readable: at most 2 statements per subject, at most 1 shared statement
      const per = new Map();
      for (const st of p.statements) if (st.who !== undefined) per.set(st.who, (per.get(st.who) ?? 0) + 1);
      assert.ok([...per.values()].every(v => v <= 2), at);
      assert.ok(p.statements.filter(st => st.type === 'nobodyOn').length <= 1, at);
      // Conventions: no equivalent statements, no implication within one subject
      p.statements.forEach((a, i) => p.statements.forEach((b, j) => {
        if (i < j) assert.ok(!equivalent(a, b), `${at}: equivalent statements ${JSON.stringify(a)} ${JSON.stringify(b)}`);
        if (i !== j) assert.ok(!implies(a, b), `${at}: ${JSON.stringify(a)} implies ${JSON.stringify(b)}`);
      }));
      // Conventions: no nextTo t / notNextTo t for a subject who stands on t
      for (const st of p.statements) {
        if (st.type === 'nextTo' || st.type === 'notNextTo') {
          assert.notEqual(board.type[p.solution[st.who]], st.cellType, `${at}: ${JSON.stringify(st)} for a subject standing on it`);
        }
      }
      // Conventions: the safe has at least 2 thief spots, every zone has at least 3 walkable cells
      assert.ok(board.thiefSpots[p.safe].length >= 2, `${at}: safe with ${board.thiefSpots[p.safe].length} thief spots`);
      for (const cells of board.zoneCells) {
        assert.ok(cells.filter(c => board.walk[c]).length >= 3, `${at}: zone with fewer than 3 walkable cells`);
      }
      // Q5 informative: an own-cell statement is not true on every walkable cell; implied by Q1 + Q2 and also
      // checked by the brute force where affordable
      for (const st of p.statements) {
        if (UNARY.has(st.type)) {
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

test('the drone is a hint, not a statement; sees, *Safe and alarm are gone in v4', () => {
  for (const gone of ['drone', 'sees', 'alarm', 'northOfSafe', 'sameZoneSafe']) assert.ok(!(gone in FAMILY), gone);
  assert.deepEqual([...new Set(Object.values(FAMILY))].sort(), ['cell', 'count', 'dir', 'line', 'next', 'nobody', 'only', 'pair', 'zone']);
  for (let seed = 1; seed <= 10; seed++) {
    for (const st of generatePuzzle(`nodrone${seed}`, 'hard').statements) assert.notEqual(st.type, 'drone');
  }
});

// Owner's design table (PLAN.md stages 2b and 10): every clue kind actually shows up in generated cases.
// Measured 2026-11-01 over seeds 1–40 (kinds1…): every family has at least 6 statements in 40 hard puzzles
// (rarest: count 6, nobody 9, zone 41, line 26), so one threshold covers all families. Individual statement
// types are rarer: `notOn` is the weakest clue (1 in 40 hard, 1 in 40 medium, 1 in 20 expert) and `otherZone` has
// 4 in 40 hard, hence the lower thresholds below.
test('every clue kind of the design table occurs in generated puzzles', () => {
  const kinds = (difficulty, count) => {
    const types = [];
    for (let seed = 1; seed <= count; seed++) types.push(...generatePuzzle(`kinds${seed}`, difficulty).statements.map(st => st.type));
    return types;
  };
  const hard = kinds('hard', 40);
  const medium = kinds('medium', 40);
  const expert = kinds('expert', 20);
  for (const kind of new Set(Object.values(FAMILY))) {
    const count = hard.filter(t => FAMILY[t] === kind).length;
    assert.ok(count >= 3, `${kind}: only ${count} in 40 hard puzzles`);
  }
  for (const [negative, atLeast] of [['notInZone', 5], ['notNextTo', 5], ['otherZone', 2]]) {
    const count = hard.filter(t => t === negative).length;
    assert.ok(count >= atLeast, `${negative}: only ${count} in 40 hard puzzles`);
  }
  // Every statement type appears somewhere (hard + medium + expert).
  const all = [...hard, ...medium, ...expert];
  for (const type of Object.keys(FAMILY)) assert.ok(all.includes(type), `${type} never generated in 100 puzzles`);
});

test('hard and expert puzzles are graded within their maxLevel (level 3 still occurs)', () => {
  // Measured 2026-11-01: hard 14 × level 2 / 26 × level 3 of 40, expert 12 / 8 of 20. The spec only caps the level.
  for (const difficulty of ['hard', 'expert']) {
    const levels = new Set();
    for (let seed = 1; seed <= 12; seed++) levels.add(generatePuzzle(`levels${seed}`, difficulty).grade.level);
    assert.ok([...levels].every(l => l >= 1 && l <= DIFFICULTIES[difficulty].maxLevel), `${difficulty}: ${[...levels]}`);
    assert.ok(levels.has(3), `${difficulty}: no puzzle needs a trial step in 12`);
  }
});

test('every setting of the catalogue is picked, with outdoor zones in houses and in the park', () => {
  const settings = new Set();
  let houseWithOut = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const p = generatePuzzle(`setting${seed}`, 'medium');
    settings.add(p.setting);
    if (p.setting !== 'park' && p.zoneKinds.includes('out')) houseWithOut++;
  }
  assert.deepEqual([...settings].sort(), Object.keys(SETTINGS).sort());
  assert.ok(houseWithOut > 0, 'no house with an outdoor zone in 40 puzzles');
});
