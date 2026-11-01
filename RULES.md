# Rules specification — "Kto zwinął?" (v3: rows and columns, safe on the last free cell)

Normative spec for the logic core. Every evaluator, solver and generator must match this file 1:1.
UI text is Polish; phrases are given per statement type. v3 (2026-11-01): nothing blocks sight, so no two
heroes share a row or a column; the safe stood on the only cell whose row and column are both free, and the
thief is the only hero diagonally next to it, in its zone.

## 1. Board

- Square grid `N × N`, `4 ≤ N ≤ 8` (`N = 4` only in the tutorial).
- Coordinates: `(r, c)`, rows `1..N` top to bottom, columns `1..N` left to right.
  North = up (smaller `r`), south = down, west = left (smaller `c`), east = right.
  Cell index (contract) = `(r − 1) · N + (c − 1)`.
- **Zones**: the grid is partitioned into at least 2 named zones (every cell, obstacles included, belongs to
  exactly one); each zone is a 4-connected set of cells containing at least one walkable cell. Zone borders
  are painted on the ground; they matter only for zone-based statements, neighbourhood and `thiefSpots`.
- **Cell types** shown on the map
  - walkable: `ground` (ziemia), `bush` (krzak), `pad` (wyrzutnia);
  - obstacles: `crate` (skrzynia), `barrel` (beczka), `rock` (skała). Nobody stands on an obstacle.
    Obstacles **do not block sight** (§3).
- The safe (sejf) is **not shown** on the map; its cell follows from the heroes' cells (§2).
- Two cells are **neighbours** when they are orthogonally adjacent **and in the same zone**.
  Diagonal cells are never neighbours.
- `thiefSpots(s)` = the cells of the grid diagonally adjacent to cell `s` (`|Δr| = |Δc| = 1`) that are
  walkable and in the same zone as `s` (a property of the map; who stands there is irrelevant).

## 2. Solution

- `k = N − 1` heroes, each with a unique name and a grammatical gender (Polish verb forms only; gender is
  never used by any rule or statement).
- A **placement** is an injective map from the (named) heroes to walkable cells; two placements that differ
  only by swapping heroes are different placements.
- For a placement satisfying R1 (§4) exactly one row and exactly one column hold no hero; their crossing is
  the **safe cell** `safe` (the safe is never on a hero's cell, row or column). R0 and R2 never choose the
  safe cell, they only reject placements.
- A **candidate** is a placement satisfying R1, R0 and R2 (§4). A **solution** is a candidate satisfying
  every statement of the puzzle. Statements that mention the safe use the safe cell of that placement.

## 3. Line of sight

Two different cells **see each other** when they lie in the same row or the same column. Nothing blocks
sight: not obstacles, not zone borders, not the safe.

## 4. Global rules (hold in every valid solution)

- **R1 — No one saw anyone ("Nikt nikogo nie widział")**: no two heroes stand in the same row or in the
  same column.
- **R0 — The safe**: the safe cell (§2) has map type `ground` („Sejf stał na gołej ziemi”).
- **R2 — The thief**: exactly one hero stands on a cell of `thiefSpots(safe)`. That hero is the thief.

## 5. Statements

A puzzle lists statements; **every statement is true** in the solution (no liars).
Most statements have a subject hero `S` (shown on that hero's card); the alarm is global.
`cell(X)` = the cell of hero `X`, `zone(X)` = its zone, `zoneHeroes(X)` = number of heroes in `zone(X)`
including `X` (the safe is not a hero and is never counted); `r(…)`, `c(…)` = row and column;
`safe` = the safe cell (§2).

| id | parameters | true when | Polish wording (m / f) |
|---|---|---|---|
| `inZone` | zone `z` | `zone(S) = z` | „Byłem/Byłam w strefie Z.” |
| `notInZone` | zone `z` | `zone(S) ≠ z` | „Nie byłem/byłam w strefie Z.” |
| `on` | type `t ∈ {ground, bush, pad}` | `type(cell(S)) = t` | „Stałem/Stałam w krzakach / na wyrzutni / na gołej ziemi.” |
| `nextTo` | type `t ∈ {crate, barrel, rock}` | some neighbour of `cell(S)` has type `t` | „Stałem/Stałam obok skrzyni / beczki / skały.” |
| `notNextTo` | type `t ∈ {crate, barrel, rock}` | no neighbour of `cell(S)` has type `t` | „Nie stałem/stałam obok …” |
| `sees` | type `t ∈ {crate, barrel, rock}` | some cell of type `t` lies in row `r(S)` or column `c(S)` | „Widziałem/Widziałam skrzynię / beczkę / skałę.” |
| `row` | `1 ≤ n ≤ N` | `r(S) = n` | „Byłem/Byłam w n. rzędzie.” |
| `col` | `1 ≤ n ≤ N` | `c(S) = n` | „Byłem/Byłam w n. kolumnie.” |
| `northOf` | hero `H ≠ S` | `r(S) < r(H)` | „Stałem/Stałam gdzieś na północ od H.” |
| `southOf` | hero `H ≠ S` | `r(S) > r(H)` | „… gdzieś na południe od H.” |
| `westOf` | hero `H ≠ S` | `c(S) < c(H)` | „… gdzieś na zachód od H.” |
| `eastOf` | hero `H ≠ S` | `c(S) > c(H)` | „… gdzieś na wschód od H.” |
| `alone` | — | `zoneHeroes(S) = 1` | „Byłem sam / Byłam sama w swojej strefie.” |
| `zoneCount` | `2 ≤ n ≤ k` | `zoneHeroes(S) = n` | „W mojej strefie było nas n.” |
| `sameZone` | hero `H ≠ S` | `zone(S) = zone(H)` | „Byłem/Byłam w tej samej strefie co H.” |
| `otherZone` | hero `H ≠ S` | `zone(S) ≠ zone(H)` | „Nie byłem/byłam w tej samej strefie co H.” |
| `northOfSafe` | — | `r(S) < r(safe)` | „Stałem/Stałam gdzieś na północ od sejfu.” |
| `southOfSafe` | — | `r(S) > r(safe)` | „… gdzieś na południe od sejfu.” |
| `westOfSafe` | — | `c(S) < c(safe)` | „… gdzieś na zachód od sejfu.” |
| `eastOfSafe` | — | `c(S) > c(safe)` | „… gdzieś na wschód od sejfu.” |
| `sameZoneSafe` | — | `zone(S) = zone(safe)` | „Byłem/Byłam w strefie, w której stał sejf.” |
| `otherZoneSafe` | — | `zone(S) ≠ zone(safe)` | „Nie byłem/byłam w strefie, w której stał sejf.” |
| `alarm` (global) | zone `z` | `zone(safe) = z` | „Alarm: sejf stał w strefie Z.” |

Zone parameters `z` are zones of the board; hero parameters `H` are heroes of the puzzle.

Notes:

- Directions (`northOf`, `northOfSafe`, …) are strict and ignore the other axis ("anywhere in a row above").
  In a candidate no two heroes share a row or column and no hero shares the safe's row or column, so for any
  two of them exactly one of `northOf` / `southOf` holds, and exactly one of `westOf` / `eastOf`.
- `nextTo` never looks across a zone border. `nextTo hero` and `nextTo safe` do not exist: an orthogonally
  adjacent cell is in the same row or column (R1, §2).
- `sees t` looks along the whole row and column, through everything; it names obstacle types only.
- `notNextTo t` is true for a cell without neighbours.
- `sameZoneSafe` is true for the thief and for every other hero in the safe's zone.
- `zoneCount 1` is not used; that case is `alone`.

## 6. Puzzle quality requirements

- **Q1 Unique**: exactly one solution (placement; the safe cell follows) satisfies R1, R0, R2 and all
  statements.
- **Q2 Minimal**: removing any single statement yields ≥ 2 solutions.
- **Q3 Deducible**: the step solver (`src/steps.js`, techniques in `PLAN.md` stage 9) reaches the solution
  without guessing. Easy and medium use levels 1–2 only; hard and expert may also need level 3 (one assumption
  refuted by levels 1–2, never nested). Q3 is a property of the step solver, outside the truth semantics of
  §1–§5 (an independent reference checks Q1, Q2, Q4 and Q5).
- **Q4 Readable**: at most 2 statements per hero as subject `S` (being the referenced hero `H` does not count;
  the alarm has no subject); heroes without a statement are allowed („Milczy.”); at most 1 alarm per puzzle.
- **Q5 Informative**: let `Cand` = the candidates (§2), with no statement applied. No statement of the
  puzzle (with its own subject and parameters) is true in every member of `Cand` (e.g. `notNextTo t` when
  the board has no `t`); one false in every member is already excluded by Q1. For a statement true in the solution this follows from Q1 + Q2: if it held in all of
  `Cand`, removing it would leave the single solution.
- **Generator conventions** (design choices of the generator, not checked by the reference):
  - the safe has at least 2 `thiefSpots` in the solution, and every zone has at least 3 walkable cells;
  - no two equivalent statements: `X sameZone Y` / `Y sameZone X`, `X otherZone Y` / `Y otherZone X`,
    `X northOf Y` / `Y southOf X`, `X westOf Y` / `Y eastOf X`, or the same statement twice (implied by Q2:
    either one could be removed without changing the solutions; likewise `inZone z` / `notInZone z'` on a
    board with exactly 2 zones).

The goal of the player: place every hero; the safe then appears on the last free cell and the game reveals
the thief (R2).

## 7. Drone hint (UI, not a rule)

On medium and harder cases the player may send a limited number of drones (medium 1, hard 2, expert 2,
none on easy). A drone flies over one row or column of the solution and reports who stood there
(„Dron nad 3. kolumną nagrał: Mira.”) or, for the safe's row or column, that it recorded nobody
(„… nikogo nie nagrał — tam stał sejf.”). Its report is always true and is shown with the statements; it
counts as a hint. Every case is solvable without drones (Q1–Q3 do not use them).

## 8. Examples

Both are unique and every statement is necessary (checked by the solver and the independent reference).
Legend: `.` ground, `b` bush, `p` pad, `C` crate, `B` barrel, `R` rock. The safe is not shown.

### 8.1 Example 1 — tutorial (4 × 4, 3 heroes)

```
      c1  c2  c3  c4
r1    R   .   .   .     zone Ruiny = row 1 and (2,2)–(2,4)
r2    .   .   .   R
r3    .   b   .   .     zone Baza = (2,1) and rows 3–4
r4    .   .   b   p
```

Statements: Bobo — `on pad`; Zyg — `southOf Mira`, `northOfSafe`.

Deduction:
1. The only pad is `(4,4)` → Bobo `(4,4)`; row 4 and column 4 are his.
2. Mira is north of Zyg and Zyg north of the safe; the three of them use rows 1–3 (row 4 is Bobo's) → Mira
   row 1, Zyg row 2, the safe row 3.
3. The safe is on ground in row 3, outside column 4: `(3,1)` or `(3,3)`. The only thief spot of `(3,1)` is
   `(4,2)` (`(2,2)` is in Ruiny), in Bobo's row, so nobody could be its thief (R2) → **the safe stood on
   `(3,3)`**. Its thief spots are `(4,2)` and `(4,4)`; Bobo stands on `(4,4)` → **Bobo is the thief**.
4. Columns 3 and 4 are taken → Mira `(1,2)` (`(1,1)` is a rock), Zyg `(2,1)`.

Solution: Bobo `(4,4)` (thief), Mira `(1,2)`, Zyg `(2,1)`; safe `(3,3)`. Without statements the board admits
126 candidates.

### 8.2 Example 2 (5 × 5, 4 heroes)

```
      c1  c2  c3  c4  c5
r1    .   R   .   p   .      Baza (B):   (1,1)–(1,2), (2,1)–(2,3), (3,1)–(3,3), (4,1)
r2    C   b   .   .   .      Kanion (K): (1,3)–(1,4), (2,4), (3,4), (4,2)–(4,4), (5,1)–(5,2)
r3    .   .   C   b   .      Oaza (O):   column 5 rows 1–4, (5,3)–(5,5)
r4    b   .   .   .   .
r5    .   .   .   C   .
```

Statements: Bobo — `nextTo rock`; Zyg — `on bush`; Mira — `otherZone Zyg`; Kora — `northOf Bobo`.

Deduction:
1. The rock `(1,2)` has two neighbours in its zone Baza: `(1,1)` and `(2,2)`. Kora is north of Bobo, so Bobo
   is not in row 1 → Bobo `(2,2)`, Kora in row 1.
2. Zyg is in a bush other than Bobo's: `(3,4)` or `(4,1)`.
3. The safe is in rows 3–5 (rows 1–2 are Kora's and Bobo's), on ground outside column 2, with a thief spot.
   Only three such cells have one: `(3,1)` (spot `(2,2)`), `(4,3)` (spots `(3,4)`, `(5,2)`) and `(5,1)`
   (spot `(4,2)`).
   - `(5,1)`: its only spot is in Bobo's column → no thief.
   - `(3,1)`: it would take row 3 and column 1, i.e. both of Zyg's bushes → Zyg would have nowhere to stand.
   → **the safe stood on `(4,3)`**.
4. Row 4 is the safe's → Zyg `(3,4)`, a thief spot of the safe → **Zyg is the thief**.
5. Rows 1–4 are taken → Mira row 5; columns 2–4 are taken → Kora and Mira use columns 1 and 5. Mira is not in
   Zyg's zone Kanion, so not `(5,1)` → Mira `(5,5)`, Kora `(1,1)`.

Solution: Bobo `(2,2)`, Mira `(5,5)`, Zyg `(3,4)` (thief), Kora `(1,1)`; safe `(4,3)`. Without statements the
board admits 1 104 candidates.
