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

## Stage 2b — Alignment with the owner's design table `[x]` (requested 2026-10-31)

Owner's table (target = "our game" column; the Murdoku column is what the game must not be):

| Element | Murdoku (not us) | Kto zwinął? (target) |
|---|---|---|
| Placement rule | every person in a different row and column | "No one saw anyone": several people per row/column if an obstacle separates them |
| Goal | victim on the last free cell, deduced | no victim; the safe is a fixed, visible object |
| Culprit | person in the victim's room | the only hero right next to the safe (same zone) |
| Rooms and walls | rooms, windows on thick lines | zones with painted borders that do not block sight; no windows |
| Cells | stand on armchair/bed/rug; not on table/TV/plant/shelf/box | stand on ground/bush/pad; not on crate/barrel/rock/safe |
| Clue types | room, furniture, beside, row/column, exact offsets, gender, "alone/with a man" | zone/not zone, cell type, next to/not next to obstacle, "I saw X" (first obstacle in line), row/column, general direction ("somewhere north of"), people in zone, same/other zone, drones counting people in a line. No gender, no exact offsets |
| Clue count | usually 1 per suspect | 1–2 per hero, some stay silent, plus drone facts |
| Content | handmade cases in a book | procedural generator with proof of uniqueness and minimality, difficulty levels, random cases |
| Form | paper and pencil | mobile app with line-of-sight preview, "Check" button, undo, progress saving |

Estimate: P50 1.5 h, P80 2.5 h (P80 risk: the clue-diversity change slows the generator or breaks the
time bound → tuning round). Critical path: gap audit → implementation → two-flow verification → fixes.

Gap audit (1 `sonnet` worker, read-only; reconciled by the main session): no Murdoku mechanic leaked in
(no victim, windows, sight-blocking walls, last free cell, gender clues, exact offsets); rows 1–5 match.
Gaps and decisions:

- [x] **Progress saving (row "Form")**: a random case gets a new `Date.now()` seed each time and cannot be
  resumed → store the current random case (`ktozwinal:current`: puzzle + title), "Continue" button on
  the home screen; undo history saved with the state; a fully solved board shows the win state after reload. `ui/app.js`.
- [x] **Clue types (row "Clue types")**: on 25 seeds per level `zoneCount`/`otherZone` never appear
  above easy, `notInZone`/`alone` almost never (greedy weights + Q2 drop order remove them) → type
  diversity in `selectStatements`: novelty bonus for a type not yet chosen, Q2 drops the most repeated
  types first. Must keep Q1/Q2/Q4/Q5 and the time bound. `src/generator.js`.
- [x] **General direction wording**: "Stałem gdzieś na północ od X." (table wording) — `src/text.js`, `RULES.md` §5.
- [x] **Random generation feedback**: "Losuję…" label; generation runs in a module Web Worker
  (`ui/gen-worker.js`) so the UI never freezes (verification measured 1.2–3.9 s freezes at 4× CPU
  throttling with the synchronous generator). `ui/app.js`.
- Not changed (earlier owner decisions, not contradicted by the table): drones only on medium and above
  (stage 0); silent heroes are allowed, not forced (easy ~4 %, medium+ ~7–12 %); Q3 deducibility stays
  in stage 3; line-of-sight preview already exists for placed heroes (toggle).
- Frozen missions (`puzzles/*.json`) stay byte-identical (golden puzzles). The 2b generator no longer
  reproduces them from their seeds → `scripts/freeze-missions.js` now refuses to overwrite existing files.

Implementation evidence (main session):
- Diversity = novelty factor `1 / (1 + 0.8 × repeats of the clue kind)` in the greedy score; Q2 drops the
  most repeated kinds first. Kinds = table rows (directions one kind, `alone`/`zoneCount` one kind, …).
  Measured on 20 seeds `kinds1..20`, hard: zone-population clues 0 → 8, same/other zone 1 → 16; every
  level now has every kind (drones from medium). Timing (desktop, 12 seeds `dist*`): expert avg 302 ms,
  max 799 ms (before 221 / 729 ms). `otherZone`/`notInZone` stay rare (weak negative clues) — accepted.
- New test `every clue kind of the design table occurs` (≥ 3 per kind in 20 hard puzzles); it fails on the
  old generator (`alone/zoneCount: only 0`). `npm test` 20/20; `puzzles/*.json` unchanged (no diff).
- Headless Chrome 390×844 E2E (scratchpad script): Continue after menu and reload, undo after reload,
  win, Continue hidden when solved, orphaned state removed, solved mission stays won after reload,
  "gdzieś" wording, expert generate+render 169 ms — all OK; only console error = `favicon.ico` 404
  (pre-existing, icons belong to stage 5).

Verification: generator change touches a shared procedure → full two-flow verification (Workflow:
2 orchestrators `opus` × 2 workers `sonnet`/`haiku`, read-only), then the main session reconciles and
fixes; UI checked in headless Chrome (390×844) incl. reload/continue.

## Remaining work — owner go of 2026-10-31

Owner decisions (2026-10-31): a solved random case can be reopened — yes; starting a new random case
asks before discarding an unfinished one — yes; drones on easy — no (stays medium+); old browsers
without module workers — not important. Owner: "do all the changes and tell me when it is ready".
Commit/push is **not** included (not explicitly asked) — asked at the end.

| | P50 | P80 |
|---|---|---|
| Calendar time (critical path 2c → 3 → 5 → 7) | 5.5 h | 8.5 h |
| Agent effort (sum, incl. verification agents) | 7 h | 11 h |

- Sequential by design: the main session (opus) implements every stage; agents only analyse and verify
  (no agent runs alongside the main session's own work on the same scope).
- P80 risks: step solver too weak → generator yield/time drops (tuning round); hints wording for the
  trial technique; service-worker caching keeping stale files after a deploy.

## Stage 2c — Owner decisions in the UI `[x]`

Estimate: P50 30 min, P80 45 min. Agent: main session. Depends on: stage 2b. Files: `ui/app.js` (+ `css/style.css`).

- [x] Solved random case stays on the home screen (✔, opens in the won state) until a new one is drawn.
- [x] Drawing a new case while the current one is unfinished (has progress, not solved) asks first (in-app modal).
- [x] The replaced random id is pruned from `ktozwinal:solved`.
- [x] "Wyczyść" uses the same in-app question instead of the native `confirm()`.

Verification: E2E in headless Chrome now; covered again by the stage 7 two-flow verification.
Evidence: `e2e-keep.mjs` — "Ostatnia sprawa" ✔ after a win, reopens won, no question when solved, solved id
pruned, question on an unfinished case, "Wróć" keeps it, "Losuj nową" draws — all OK; `e2e2.mjs` all OK.
Elapsed ~20 min.

## Stage 3 — Deduction solver, difficulty, hints `[x]`

Estimate: P50 2.5 h, P80 4 h. Agents: main session (opus) designs and implements; design double-checked by
1 `sonnet` worker (read-only) before coding. Depends on: stage 2b.

Design (`src/steps.js`): state = candidate cells per hero + R1/R2 facts; repeat the cheapest technique that
changes something, log each step `{ technique, hero?, cells removed/kept, reason }`:

| Level | Technique | Rule (sound by R1/R2/statements) |
|---|---|---|
| 1 | statements | unary statements filter each hero's cells (start) |
| 1 | fixed hero | a hero with one cell stands there: remove that cell and every cell it sees from the others; on a safe spot → others leave the safe spots; `alone` → others leave its zone |
| 1 | thief | only one hero can still reach a safe spot → it is the thief (keeps only safe spots); a hero with only safe spots → the others leave them |
| 1 | drone | `0` → nobody in the scan; `1` with one possible hero → that hero is in the scan; a hero sure to be in the scan → the others leave it |
| 2 | pair clue | direction / same / other zone: drop cells with no partner cell left |
| 2 | sight | drop cell x of A when every cell of B is x or seen from x |
| 2 | zone count | `alone` / `zoneCount`: drop cells whose zone cannot hold the stated number (must / could counting) |
| 3 | trial | "if A stood on x, levels 1–2 lead to a contradiction" → drop x (one assumption, no nesting) |

- [x] Step solver + Polish step texts (hint wording) — `src/steps.js`, `src/text.js` (`stepText`, „reason → conclusion”).
- [x] Generator accepts only puzzles the step solver solves completely (Q3); level 3 allowed only on hard/expert.
- [x] `grade` added to generated puzzles: `{ level, steps }` (additive to the frozen contract).
- [x] Hint for the player's state (`nextHint`): first wrongly placed hero; otherwise the step solver is re-run with the
  correctly placed heroes as facts and the hint is the dependency chain of the first step that fixes another hero.
- [x] Tuning measured on ≥ 200 puzzles per difficulty: yield, time, steps, level mix.

Tests: step solver never removes the solution's cell (≥ 500 puzzles incl. random statements vs the exact
solver: every elimination is sound); every generated puzzle solved by the step solver to its unique
solution; examples §7/§8 and both frozen missions solved by the step solver.

Design review (1 `sonnet` worker, read-only, before coding): all rules sound; added from it — pair clues
checked together with R1 and distinct cells, zone forcing for `zoneCount` (must/could, subject counted),
`alone` in both directions, thief/drone contradictions, full statement check once everyone is fixed,
hints via re-solve with facts + dependency chain, trial ordered by the smallest candidate set.

Evidence:
- Bug found by the first probe and fixed: copying statements with `index` overwrote the drone's line index
  (field renamed `sid`); example 2 and mission 2 then solved.
- Generator: Q2/Q4 slots ran out under the clue-kind novelty in 87 % of expert attempts (420/480 →
  new boards); now the same board is retried once without novelty. Timing (desktop, Node; 200 seeds,
  expert 60): easy avg 8 / p95 23 / max 50 ms; medium 34 / 110 / 240 ms; hard 75 / 258 / 605 ms;
  expert 328 / 899 / 1077 ms (stage 2b had expert max 1.8 s). Levels: easy 1:18 2:182; medium 1:7 2:193;
  hard 1:5 2:142 3:53; expert 1:1 2:43 3:16. Avg steps 9.5 / 13.1 / 18.6 / 22.5.
- `tests/steps.test.js` (8 tests): soundness vs the exact solver on 500 random (often contradictory)
  and 600 satisfiable statement sets incl. 8×8 boards (no solution cell ever removed, contradiction ⇔ no
  solution); examples and missions solved without trial; 68 generated puzzles graded and solved; hint-only
  play solves every tested puzzle hero by hero; a wrong hero is reported first. Mutation check: 3 unsound
  mutants (zone off-by-one ×2, sight without `y ≠ x`) are killed; a weakening mutant (pair without R1)
  survives as expected (sound). Kinds test still passes (fallback keeps the mix). `npm test` 28/28.
- Elapsed ~1.5 h (P50 2.5 h).

## Stage 4 — Mobile UI `[x]`

Estimate: P50 2.5 h, P80 3.5 h. Agents: 1 `sonnet` worker implements under the main session; main reviews. Depends on: frozen API contract from stage 2. Parallel with stage 3.

- [x] Plain HTML/CSS/JS (ES modules, no build), portrait-first, touch-friendly.
- [x] Board render (SVG): zones, painted borders, obstacles, safe, drones; cartoon-arena style.
- [x] Hero tray with statements; select hero → tap cell to place; X mode; undo; clear.
- [x] Optional helper: show line of sight of placed heroes (toggle „Wzrok”).
- [x] Check; win screen names the thief and counts hints.

Verification: small-change review by one `sonnet` worker + manual run in a mobile viewport (Playwright screenshot).
Evidence: built as the early slice, then stages 2b/2c/5; headless Chrome 390×844 E2E scripts `e2e-keep.mjs`, `e2e2.mjs`, `e2e3.mjs` all OK.

## Stage 5 — Progress, levels, PWA `[x]`

Estimate: P50 1 h, P80 1.5 h. Agents: main session. Depends on: stages 3 and 4 (sync point).

Re-estimated 2026-10-31: P50 1.5 h, P80 2.5 h (main session).

- [x] Difficulty select and localStorage progress (stages 2b/2c).
- [x] Daily case: seed = local date, medium, generated in the worker, stored with its date (`ktozwinal:daily`), own home-screen entry with ✔.
- [x] Hint button wired to stage 3: modal with the last ≤ 3 chain steps and the conclusion, „Postaw” places the hero; a wrong hero → „Zdejmij”; hints counted (win screen).
- [x] Tutorial: example §7 as „Samouczek” (`puzzles/samouczek.json`, test: equals example 1, unique by the reference) with a short intro; hints walk through it.
- [x] PWA: `manifest.webmanifest`, `icons/` (SVG + PNG 192/512/180), favicon (404 gone), `sw.js` (shell precache,
  stale-while-revalidate for same-origin → a deploy shows on the next load; fonts cached on first use).

Evidence: `e2e3.mjs` — tutorial intro, hint chain + „Postaw” ×4 solves it, win shows „Podpowiedzi: 4”, ✔ on home;
wrong hero → hint „stoi w złym miejscu” + „Zdejmij”; daily stored as `dzien-2026-10-31`, solved, ✔; page controlled
by the service worker; offline: home, random easy case (worker + modules from cache) and mission 2 load; 0 console
errors. Regression `e2e-keep.mjs`, `e2e2.mjs` all OK (now 0 console errors); `npm test` 29/29. Elapsed ~45 min.

## Stage 6 — GitHub Pages deploy `[x]` (pulled ahead on owner request)

Estimate: P50 20 min, P80 40 min. **Requires user consent** (create repo, commit, push). Depends on: stage 5.

- [x] `git init`, public repo `microphione/kto-zwinal`, Pages from `main` root, live at https://microphione.github.io/kto-zwinal/ — headless Chrome (390×844) walkthrough of mission 1 to the win screen on the live site, 0 console errors.

## Stage 7 — Final verification and phone test `[ ]`

Estimate: P50 1 h, P80 1.5 h. Agents: two-flow verification of the whole app (logic re-run + UI). Depends on: stage 6.

- [x] Test suite green; two-flow report reconciled; corrections applied (re-verification below).
- [x] Deployed on owner request (2026-10-31): commit `0a00366` pushed to `main`, Pages build `built`; live E2E on
  https://microphione.github.io/kto-zwinal/ (tutorial + hints, wrong-hero hint, daily case, service worker, offline,
  random/expert cases, save/continue) all OK, 0 console errors.
- [ ] User plays on a phone; feedback recorded here.

Two-flow verification (workflow `verify-stage7-final`, 9 agents, 2026-10-31): 0 BLOCKER. Logic PASS —
soundness of every technique vs the independent reference (3000 small + 600 large differential cases,
adversarial sets on §7/§8, oracle mutants killed), Q1–Q5 + Q3 on 395 production puzzles, determinism,
hints always point to the solution (5706 calls), 9723 production texts without `undefined`.
Fixed:
- MAJOR: hint chains did not justify the cell in 48–64 % of hints (deps ignored earlier narrowing of the
  narrowed hero) → deps include it; new test replays the chain and must leave exactly the hinted cell (fails on
  the old code). Chains now p50 6 / p90 10 / max 20 steps → the modal shows all steps up to 6, otherwise the
  last 4 and „Pokaż wszystkie kroki (N)”.
- MAJOR: service-worker updates could arrive ~10 min + 2 launches late and mix files of two deploys
  (stale-while-revalidate through the HTTP cache) → same-origin network-first with `cache: 'no-cache'`, cache
  only offline; install precaches with `cache: 'reload'`. E2E on a copy: a changed file is served on the next
  load; offline still works.
- MINOR: „zostało 24 pola” → „zostały 24 pola”; comma before a repeated „ani”; a trial that knocks out
  its own cell now reads „zasady i zeznania by się wykluczały”; `maxLevel` comment; old daily state and
  solved id pruned; `tests/pwa.test.js` checks that `sw.js` precaches exactly the shipped files.
- Expert timing correction: the flows found rare desktop seeds of 2.0–2.4 s (p95 ~1.0–1.3 s); off the main
  thread (worker), „Losuję…” shown.
Known gaps (recorded, not fixed): daily label stays yesterday's if the menu is left open over midnight (the
case itself is today's); long „fixed” texts (~250 chars) wrap on 390 px; no real-phone / iOS Safari run;
hard/expert uniqueness rests on the production solver (reference infeasible for n > 6).
Evidence after fixes: `npm test` 30/30; E2E `e2e-keep`, `e2e2`, `e2e3`, `e2e4` (SW update + folded hint) all
OK, 0 console errors; `git diff -- puzzles` empty.
Re-verification of the fixes (1 `sonnet` worker, read-only): 0 BLOCKER, 0 MAJOR; 1337 hints on 60 fresh puzzles
(empty and partly correct boards) all point to the solution and every chain replay leaves exactly the hinted cell;
180/180 wrong-hero boards reported; 1672 texts clean (verb agreement, comma, no self-referential trial); `sw.js`
reviewed; all four E2E suites OK. MINOR: one run of the 4×-throttle timing check stalled 403 ms (> 250 ms) right after
other E2E runs, 3 reruns OK (72–182 ms) — machine noise, recorded. Stages 2c–7 done except the owner's phone test.
Elapsed for the owner go (2c → 7): ~4.5 h (P50 5.5 h).

## Stage 8 — Hidden safe `[x]` (owner request 2026-11-01; deployed 2026-11-01 on the owner's go)

Owner: the safe's location must be deduced too, not only the thief. Owner asked to copy Murdoku's exact
rules from murdoku.com — declined (the game must stay an original design, not a recreation); offered two
original variants, owner chose **"Ukryty sejf (skrytka)"**: the safe is not shown, it stood on one empty
cell and, as a blocking object, hid the view — so its position changes who could see whom. This replaces
the design-table row "the safe is a fixed, visible object".

Rules (normative text goes to `RULES.md` v2):
- The hidden safe stands on exactly one `ground` cell; nobody stands on it; it blocks sight and drone scans.
- R1 on the board with the safe in place; R2: exactly one hero is a neighbour (same zone) of the safe → thief.
- Solution = hero placement + safe cell. The player places the heroes and the safe token.
- New statements: hero vs safe direction (`northOfSafe` … „gdzieś na północ od sejfu”), `sameZoneSafe` /
  `otherZoneSafe`, global `alarm` („Alarm: sejf stał w strefie Z”, ≤ 1 per puzzle). `sees safe` and drones
  now depend on the hidden safe. Still no `nextTo safe` (would name the thief).
- Puzzle contract v2: `version: 2`, `cells` without `safe`, `safe` = hidden cell, `solution`, `thief`, `grade`.
  Storage namespace bumped so v1 progress is ignored; missions, tutorial and RULES examples are rebuilt.

| | P50 | P80 |
|---|---|---|
| Calendar time (critical path 8a → 8b → 8c → 8d → 8e → 8f) | 7 h | 10 h |
| Agent effort (incl. review, reference and verification agents) | 9 h | 13 h |

P80 risks: generation time (every uniqueness proof now runs over all candidate safe cells), step solver
needing the trial technique too often for easy/medium, rewriting the examples and tutorial by hand.
Sequential: no agent runs alongside the main session on the same scope.

- [x] **8a Spec** — `RULES.md` v2 (main session); review for ambiguity by 1 `sonnet` worker (read-only).
  Evidence: review returned 18 items (9 MUST); all applied: "map with the safe in place" defines walkable,
  safe cells without `safeSpots` admit no solution, drone truth `= n` (value ≥ 2 → false), parameter ranges,
  `Cand` defines Q5 (implied by Q1 + Q2), generator conventions moved to §6 (empty-scan drone is a design
  choice, not implied by Q2), Q3 marked outside the reference semantics. §7 examples removed until 8e.
- [x] **8b Independent reference** — `tests/reference.js` rewritten from `RULES.md` v2 only by 1 `sonnet`
  worker (no access to `src/`), brute force over safe cell + placements. Evidence: worker self-check 38 hand
  cases `ALL OK`; API `refEval/refValid/refThief(puzzle, safe, placement, …)`, `refSolve`, `refCandidates`,
  `refInformative`; worst enumeration 8×8 / 3 heroes ≈ 0.5 s.
- [x] **8c Logic core** — `board.js` `withSafe` (cached map per safe cell, so boards are cached too) and
  `safeCandidates`; `statements.js` `SAFE_PAIR` kinds as unary on the map with the safe, `alarm`;
  `solver.js` `solveHidden` (shared node budget); generator v2 (`version: 2`, `safe` field, `placeSafe` with
  ≥ 2 safe spots, zones keep ≥ 3 walkable cells, ≤ 1 alarm, families `safeDir`/`safeZone`/`alarm`).
  Evidence: `node --test tests/solver.test.js` 9/9 vs the reference (random candidates, solution sets on
  300 small + 40 large boards, limits/budgets, Q5 of the safe kinds); `tests/generator.test.js` 6/6 (Q1 via
  `solveHidden` + brute force for all easy, Q2, Q4, Q5 via `refInformative` on easy seeds 1–5, every clue
  family ≥ 3 in 40 hard puzzles). Generation (5 seeds): easy median 95 ms, medium 186 ms, hard 1.2 s,
  expert 1.8 s (max 5.2 s).
- [x] **8d Step solver** — variable k = the safe; hero–safe statements as pairs with the safe; `together`
  (some remaining safe cell hides the line and is not next to both); `fixed` re-applied when the safe's
  domain shrinks; R2 narrows the safe (`thief:safe`); per-safe drone scans (`drone:safe`); new `hiding`
  (L2: two heroes with ≤ 16 cell pairs → the safe must hide them); trial over the safe too; `nextHint(…, safe)`
  returns hero k for the safe. Texts in `text.js`. Evidence: `tests/steps.test.js` soundness on random and
  satisfiable sets (heroes and the safe never lose a solution cell, contradiction only without solutions),
  generated puzzles solved + graded + hint play for heroes and the safe — pass; shipped puzzles fail until
  8e rebuilds them (v1 data).
- [x] **8e UI and data** — `ui/app.js`: "Sejf" card (alarm shown on it), safe token placed only on ground
  (toast otherwise), second tap removes it, undo/clear/save include it; sight shading, conflicts, drones and
  the check on the map with the placed safe; statements needing the safe are judged only once it is placed;
  check says „sejf nie jest jeszcze postawiony”; hints for the safe (wrong safe → „Zdejmij”, „Więc sejf stał
  na polu …”); win „Sejf stał na polu X. Obrobił(a) go Y!”; rules and tutorial texts; storage namespace
  `ktozwinal2:` (v1 keys removed on load); SW cache `ktozwinal-v2`. Data: RULES §7/§8 rebuilt (hidden safe,
  hand deduction checked against the step log), `tests/fixtures/examples.js`, `puzzles/samouczek.json`
  (= example 1, grade 2/14), missions re-frozen as v2 from the same seeds (v1 files deleted on purpose).
  Solver speed-up: per-board caches of block/zone masks, unary masks and pair tables (expert generation
  median 1.8 s → 0.5 s, identical output). Evidence: `npm test` 32/32 (50 s); E2E
  `scratchpad/e2e-safe.mjs` in Chrome 25/25 OK, no console errors (safe refused on bush/crate, sight shading
  2 cells with the safe vs 4 without, undo, win text, wrong-safe hint, medium/expert solved by hints with a
  reload in between). Deploy only on the owner's go.
- [x] **8f Verification** — two independent flows (opus orchestrators × 2 workers), fixes, re-verification, E2E.
  - [x] Two flows (Workflow `verify-hidden-safe`, 9 agents: 2 × (opus split + 2 sonnet workers + opus consolidate) +
    opus comparison; flow B independent until the comparison). Both: no logic defect — evaluators vs reference
    ≈ 1.6 M + 62 k cases, `solveHidden` = brute force (700 + 51 large boards), step solver sound on > 18 k runs,
    1 990 hints all justified, shipped puzzles unique (misja-2 by brute force), `npm test` 32/32.
  - [x] Fixes after reconciling both reports: (1, medium) `ui/app.js` `conflicts()` reported heroes hidden by the not
    yet placed safe as „ktoś kogoś widzi” (5/20 generated cases) → before the safe is placed a pair counts only if no
    free safe candidate lies between them; (2) placed safe drawn twice → objects drawn from the map without the
    safe; (3) plural „N zeznań się nie zgadza”; (4) drone label `D1, D2…` in `statementText` (was `DS3`), RULES §8;
    (5) step text: effects as sentences, safe-only `fixed` step „X stoi na polu …, więc sejf tam nie stał”;
    (6) RULES §6 documents ≥ 2 safe spots and ≥ 3 walkable cells per zone; (7) freeze script comment.
    Rejected: `stepSolve` TypeError for a non-candidate safe fact (unreachable: `nextHint` returns `wrong` first;
    no validation for impossible input), `hiding`/`between` text (flow B disproved it), reverse direction pairs in
    `allowed` (Q2 removes them). Evidence: `npm test` 32/32; E2E 30/30 OK incl. the hidden-pair case `vA2-4`
    (no false conflict, solved after placing the safe), a real adjacent conflict still reported, safe drawn once.
  - [x] Re-verification of the fixes (Workflow `reverify-hidden-safe-fixes`: opus orchestrator + 2 sonnet workers):
    F1–F7 correct (conflicts: 10 720 placements × safe states, 0 violations, mutants caught; plurals N = 1..30;
    drone labels on generated + shipped puzzles; 7 528 step texts + 5 530 hint-chain texts clean). Remaining notes:
    before the safe is placed the check judges each pair separately, so two pairs needing two different hiding
    cells are not reported (no false reports; the win check is exact) — accepted; redundant safe-only step text
    shortened to „X stoi na polu …”. `tests/steps.test.js` 8/8 after that edit.
  - [x] Deploy (owner's go 2026-11-01): commit `7b06f26` pushed to `main`, Pages build `built`, live `sw.js` CACHE `ktozwinal-v2`; E2E against the live site 30/30 OK, no console errors (live copy waits for network idle before closing overlays).
  - [ ] Real-phone test by the owner.

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
- 2026-10-31 — Stage 2b (owner's design table) added and implemented: random-case save/continue, undo
  history saved, won state after reload, "Losuję…", clue-kind diversity, "gdzieś na …" wording. Tests 20/20,
  E2E OK. Elapsed ~45 min so far (P50 1.5 h). Next: two-flow verification, then fixes.
- 2026-10-31 — Stage 2b two-flow verification (workflow `verify-stage2b-alignment`, 9 agents): 0 BLOCKER,
  0 MAJOR; Q1/Q2/Q4/Q5/truth/determinism clean on 630 + 290 production puzzles, UI checked in headless
  Chrome. Fixed: (1) expert tail slower (p99/max ~1.2–1.6 s desktop, single seeds up to 20×) → generation
  moved to a Web Worker; DIVERSITY 0.5 measured, not faster on 80 seeds, kept 0.8; (2) negative clues
  (`notInZone`, `otherZone`, `notNextTo`) almost absent → weights 1.2 / 1.2 / 1.0; on 80 hard puzzles now
  14 / 21 / 24 (before 3 / 0 / 7); (3) old random progress was deleted before generating → stored only
  after the new case exists; worker failure → toast, buttons restored; (4) test derives kinds from exported `FAMILY`, 40 seeds,
  also asserts each negative type ≥ 2; (5) freeze script guard. Timing after fixes (desktop, Node):
  expert 80 seeds avg 388 ms, p95 1.0 s, max 1.8 s; hard 120 seeds avg 75 ms, p95 239 ms, max 455 ms —
  off the main thread now. E2E: all checks OK, main-thread stall ≤ 147 ms at 4× throttling, navigation
  race OK. During the fixes the frozen missions were overwritten twice by a chained
  `node scripts/freeze-missions.js` after a failed edit; restored from `HEAD` (`git diff -- puzzles` empty),
  then the script was guarded.
  Known gaps (owner decisions, not done): a solved random case cannot be reopened; starting a new random
  case discards an unfinished one without asking; solved random ids accumulate in `ktozwinal:solved`
  (~35 B each); `ktozwinal:current` is not shape-checked (only reachable by manual edits); hard/expert
  uniqueness rests on the production solver; Q3 (deducibility) is stage 3; browsers without module
  workers (Firefox < 114, Safari < 15) get the "could not generate" toast for random cases.
- 2026-10-31 — Re-verification of the fixes (1 `sonnet` worker, read-only): 0 BLOCKER, 0 MAJOR; 215 fresh
  production puzzles pass Q1/Q2/Q4/Q5/truth/determinism (easy + 10 medium also by the reference); the kinds
  test fails when the `otherZone`/`notInZone` weights are reverted. 2 MINOR fixed: (a) a random case that
  finished after the player had left the menu replaced `ktozwinal:current` and deleted the progress of
  the case being played → now dropped when the menu is gone; (b) negative-clue threshold 2 → 5 (now
  7 / 16 / 20 on the test seeds; reverted weights give 0 / 0 / 4, so each revert fails). Final evidence:
  `npm test` 20/20; E2E `e2e-keep.mjs` all OK (only `favicon.ico` 404), `e2e2.mjs` all OK (main-thread
  stall ≤ 150 ms at 4× throttling, late case dropped, kept case progress intact); `git diff -- puzzles`
  empty. Stage 2b done, elapsed ~2 h (P50 1.5 h, P80 2.5 h; variance: verification fixes + worker).
  Not deployed: GitHub Pages still serves the previous commit until the owner asks to commit and push.
  Next: stage 3 (step solver, difficulty, hints).
