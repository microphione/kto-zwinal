# PLAN — grid deduction game "Kto zwinął?" (working title)

Original browser/mobile logic game, hosted on GitHub Pages. Genre: grid deduction with zones and
witness statements. Cartoon arena-brawler visual style (bright colours, chunky outlines, bold
type, original heroes). **Top priority: correct logic** — every puzzle has exactly one solution,
reachable by deduction without guessing.

Guardrails (IP): not a recreation of Murdoku (no rook rule, no "last empty cell", no
"same room as the victim", no polaroid look) and no Brawl Stars assets, names, logos, characters
or modes — only the general cartoon-arena style.

## Aggregate estimate

| | P50 | P80 |
|---|---|---|
| Calendar time (critical path 1 → 2 → 3 → 5 → 6 → 7) | 8 h | 12 h |
| Agent effort (sum) | 11 h | 16 h |

- Critical path: rules spec → logic core → deduction solver/grading → persistence/PWA → deploy → final verification.
- Parallel branch: stage 4 (UI) starts once the stage 2 API contract is frozen; runs alongside stage 3. Sync point: stage 5 start.
- P80 risks: (a) the "no one saw anyone" rule may yield puzzles that need too many statements or are too easy → generator tuning loop in stage 3; (b) deduction solver may not cover all needed techniques → puzzles rejected as "guess-only", generator yield drops; (c) mobile layout for 8×8 + hero tray on small screens.
- Excluded from estimates: waiting for user decisions, GitHub repo creation consent, phone playtest by the user.

## Stage 0 — Rules analysis `[x]`

Decisions (agreed 2026-10-31):

- [x] Core rule **"No one saw anyone"**: every hero on a different cell; no two heroes in the same row or column unless a wall or a blocking obstacle lies between them.
- [x] ~~Walls between zones block sight~~ → **changed 2026-10-31 (owner decision, stage 2 measurement)**: zone borders are painted and do not block sight; only blocking cells do. Neighbourhood (`nextTo`, safe spots) stays same-zone.
- [x] "Next to" = orthogonally adjacent, never through a wall.
- [x] Drone facts (former "cameras") only on medium/hard.
- [x] Lying thief variant postponed (possible hard mode later).
- [x] Heroes: original cartoon SVG avatars, arena-brawler style, own names.
- [x] Boards procedural; 1–2 handmade tutorial puzzles, also checked by the solver.
- [x] Theme changed from museum to cartoon arena (user request): the loot is stolen from the **safe**.

Theme mapping:

| Concept | Arena version |
|---|---|
| Halls | Zones of the map, separated by walls |
| Walkable cells | Ground, bush, jump pad |
| Blocking obstacles (block movement and sight) | Crate, barrel, rock |
| Stolen item | Safe (blocking cell). **The thief is the only hero orthogonally adjacent to the safe, inside its zone** — exactly one such hero in every solution |
| Cameras | Scout drones on the map edge, looking along a row/column, counting heroes until the first blocker |

Open for later (not v1): bushes as stealth (hero in a bush is invisible) — would change the core rule; decide after the v1 playtest.

## Stage 1 — Rules specification `[x]`

Estimate: P50 45 min, P80 1 h. Agents: main session (opus) writes; 1 `sonnet` worker reviews for ambiguity. Depends on: stage 0.

- [x] `RULES.md`: formal definition of the board, cell types, line of sight, adjacency, coordinates (row 1 = north/top, column 1 = west/left), thief rule.
- [x] Every statement type with exact semantics (17 types incl. drones; `nextTo hero` dropped — always false under R1).
- [x] 2 handmade example puzzles with the full deduction path (unique by a throwaway brute force).
- [x] Ambiguity review by a `sonnet` worker: no logic blocker; independent brute force confirmed both examples (1 solution each, every statement necessary) and the 135 120 count. 13 wording findings applied (drone scan start/index/direction, `n` bounds, `H ≠ S`, `otherZone` Polish text, zone walkability, Q4 counting, new Q5).

Verification: review report; examples later re-checked by the solver in stage 2.

## Stage 2 — Logic core `[ ]`

Estimate: P50 2 h, P80 3 h. Depends on: stage 1.

Files (ES modules, shared by browser and Node tests; `package.json` `"type": "module"`, `npm test` = `node --test`):
- `src/rng.js` — seeded RNG. `src/board.js` — board model, walls, sight graph, scans.
- `src/statements.js` — evaluators + candidate enumeration. `src/text.js` — Polish wording.
- `src/solver.js` — `solve(puzzle, limit)` backtracking with forward checking.
- `src/generator.js` — `generateBoard`, `generatePuzzle(seed, difficulty)`.
- `tests/reference.js` — independent brute force written only from `RULES.md` (no access to `src/`).
- `tests/*.test.js` — solver vs reference, generator properties, examples from `RULES.md`.

Agents and parallelism:
- Main session (opus): `src/*`, tests. Worker A (`sonnet`): `tests/reference.js` from `RULES.md` only — runs in parallel, non-overlapping file. Sync point: both done → cross-check tests.
- Verification: two flows via Workflow (orchestrator `opus` + 2 workers `sonnet`/`haiku` each).

Puzzle JSON contract (frozen at the end of this stage): `{ version, seed, difficulty, n, cells[r][c]: type, zones[r][c]: zoneIdx, zoneNames[], heroes[{ name, gender }], statements[{ type, who?, zone?, cellType?, hero?, n?, side?, index? }], solution[heroIdx] = cellIdx (r*n+c, 0-based), thief: heroIdx }`.

- [x] Seeded RNG (reproducible puzzles, daily seed) — `src/rng.js`.
- [x] Board model + map generator (zones by balanced region growing, obstacles, bush/pad, safe with ≥ 2 safe spots) — `src/board.js`, `src/generator.js`.
- [x] Statement evaluators as pure functions — `src/statements.js`; Polish text — `src/text.js`.
- [x] Search solver: bitmask backtracking + forward checking + arc consistency on pair statements; re-checks every placement with the plain evaluators — `src/solver.js`.
- [x] Independent brute-force reference (Worker A, `sonnet`, only from `RULES.md`) — `tests/reference.js`.
- [x] Puzzle generator: hidden valid placement → candidate true statements → greedy pick by "alternatives eliminated × type weight" on a randomised sample of other solutions → exact uniqueness proof (`solve(limit 2)`) → Q2 minimisation.
- [x] API contract frozen (see above; statements also carry `who` = subject hero index; heroes carry `gen` = Polish genitive).

Tests (`npm test`, 13/13 pass, ~13 s):
- [x] Evaluators, validity, thief vs reference on 500 boards × 20 placements × 10 random statements.
- [x] Solver vs reference: identical solution sets on 500 boards with random (often contradictory) statements and 500 with satisfiable ones.
- [x] Generated puzzles (easy 40, medium 30, hard 20, expert 10): contract, valid hidden solution, all statements true (both implementations), unique (solver; reference for n ≤ 5), minimal, Q4, Q5, zones connected; deterministic per seed.
- [x] Examples §7, §8 (rewritten for the new sight rule) solve to the documented answer; every statement necessary; 53 640 bare placements.

Measurements (stage 2): R1 with sight-blocking zone walls saved only 0.5–1 statement per puzzle (decorative) → owner chose open sight; now R1 saves ~2 statements (~20 %). Statements needed ≈ 1.8 per hero (easy 5–7, medium 7–9, hard 8–12, expert 11–14). Generation time: easy/medium/hard < 0.4 s, expert ≤ 2 s (first version took 259 s for hard — fixed by diverse sampling + bitmask solver).

Verification: **full two-flow verification** (logic is the top priority): 2 orchestrators (`opus`) × 2 workers (`sonnet`/`haiku`), read-only, independent; main session reconciles.

Verification result (workflow `verify-stage2-logic`, 21 agents, both flows independent):
- [x] No logic defect: spec conformance (A: 907 099 comparisons vs reference, B: 48 000 cases + ~510 000 assertions), solver sound and complete in differential tests, 137 + 137 real puzzles of every difficulty pass Q1/Q2/Q4/Q5/truth/thief/determinism, Polish text matches §5, mutation testing kills every real logic mutant.
- [x] MAJOR fixed: heavy time tail of `generatePuzzle` (some hard/expert seeds took 2–3 min; cause: unbudgeted randomised `solve(limit 2)` in sampling). Fix: node budget + `aborted` flag; only complete searches count as proofs; an attempt without a proof within budget is abandoned. Now: worst reported seeds ≤ 0.6 s; 60 seeds — hard p95 0.16 s / max 0.23 s, expert p95 0.38 s / max 0.57 s (desktop).
- [x] MAJOR fixed: independent uniqueness check covered only easy → reference now also proves the shipped missions and medium seeds 1–8; examples' necessity and the 53 640 count checked by the reference too.
- [x] Minor fixed: per-test timeout; tests for `limit`/budget contract, duplicate cells, `zoneCount` bounds; dead fallback in `text.js` removed; fixed missions frozen as JSON (golden puzzles).
- [x] Re-verification of the fix — small-change review by 1 `sonnet` worker (diff ~100 lines, contained in budget logic): abort logic sound (54 000 budgeted calls, 0 violations), every generator return path needs a complete-search proof, 2000 production puzzles unique and minimal (easy all + 12 medium also by reference); timing p99/max: hard 286/509 ms, expert 805/1062 ms; frozen missions byte-identical; `npm test` 19/19. UI minor (mission fetch without error handling, double tap) fixed.
- Known gaps (accepted, recorded): reference cannot prove hard/expert uniqueness in reasonable time (production solver + differential tests only); boards with exactly 1 safe spot or a 1-cell zone are not generated and only covered by the tutorial example; zone names use nominative after „w strefie” (style, owner may decide); Q5 for multi-hero statements holds only via Q2 minimality.

## Stage 3 — Deduction solver, difficulty, hints `[ ]`

Estimate: P50 1.5 h, P80 2.5 h. Agents: main session (opus). Depends on: stage 2. Parallel with stage 4.

- [ ] Human-style step solver: candidates per hero, techniques (direct statement filter, only-candidate, line-of-sight elimination, thief-at-safe, zone counting, pair/rectangle elimination), no guessing.
- [ ] Generator accepts only puzzles fully solvable by the step solver.
- [ ] Difficulty = board size, hero count, hardest technique used, number of steps → easy / medium / hard.
- [ ] Hint = next deduction step in words ("Bobo can't be in row 2: he would see Mira").
- [ ] Generator tuning: clue counts and solve depth measured on 200 puzzles per difficulty.

Tests: every accepted puzzle solved by the step solver to the same unique solution; step solver never makes a false elimination (checked against the search solver on ≥ 500 puzzles).

## Stage 4 — Mobile UI `[ ]` (early slice live, see below)

Estimate: P50 2.5 h, P80 3.5 h. Agents: 1 `sonnet` worker implements under the main session; main reviews. Depends on: frozen API contract from stage 2. Parallel with stage 3.

- [ ] Plain HTML/CSS/JS (ES modules, no build), portrait-first, touch-friendly.
- [ ] Board render (SVG): zones, walls, obstacles, safe, drones; cartoon-arena style.
- [ ] Hero tray with statements; select hero → tap cell to place; X mode; undo; clear.
- [ ] Optional helper: show line of sight of a placed hero.
- [ ] Check / accuse the thief; win screen.

Verification: small-change review by one `sonnet` worker + manual run in a mobile viewport (Playwright screenshot).

## Stage 5 — Progress, levels, PWA `[ ]`

Estimate: P50 1 h, P80 1.5 h. Agents: main session. Depends on: stages 3 and 4 (sync point).

- [ ] Difficulty select, daily puzzle (date seed), localStorage progress, hint button wired to stage 3.
- [ ] Tutorial with the handmade puzzles.
- [ ] PWA: manifest, icons, service worker (offline).

## Stage 6 — GitHub Pages deploy `[x]` (pulled ahead on owner request)

Estimate: P50 20 min, P80 40 min. **Requires user consent** (create repo, commit, push). Depends on: stage 5.

- [x] `git init`, public repo `microphione/kto-zwinal`, Pages from `main` root, live at https://microphione.github.io/kto-zwinal/ — headless Chrome (390×844) walkthrough of mission 1 to the win screen on the live site, 0 console errors.

## Stage 7 — Final verification and phone test `[ ]`

Estimate: P50 1 h, P80 1.5 h. Agents: two-flow verification of the whole app (logic re-run + UI). Depends on: stage 6.

- [ ] Test suite green; two-flow report reconciled; corrections re-verified.
- [ ] User plays on a phone; feedback recorded here.

## Checkpoint log

- 2026-10-31 — Stage 0 done; plan created. Next: stage 1 (`RULES.md`).
- 2026-10-31 — Stage 1 in progress: `RULES.md` written (spec + 2 examples, both unique by a throwaway
  brute force). Finding: R1+R2 alone leave 135 120 placements on the 5×5 example → statements carry
  most information; ~1–2 statements per hero expected (affects stage 2/3 generator tuning). Ambiguity
  review delegated to 1 `sonnet` worker (read-only), waiting for its report.
- 2026-10-31 — Stage 1 done (review reconciled, see stage 1). Elapsed ~1 h (P50 45 min; variance:
  slow first brute force for example 2).
- 2026-10-31 — Stage 2 implementation done, tests green (13/13). Rule change (open sight) approved by
  the owner; spec, examples and reference updated. Elapsed ~3 h (P50 2 h; variance: generator
  performance rework + rule change and new examples). Next: two-flow verification of stage 2.
- 2026-10-31 — Owner asked for 2 sample missions on GitHub Pages to test on a phone: early UI slice
  (stage 4 subset: board, hero cards, place/X/undo/check, win screen, rules, 2 frozen missions + random
  by difficulty) and stage 6 deploy done. Stage 2 two-flow verification: no logic defect; 2 majors and
  the cheap minors fixed (see stage 2), tests 19/19. Next: reconcile the re-verification of the budget
  fix, then stage 3 (step solver, difficulty, hints); stage 4 remainder after the owner's phone test.
