# Rules specification — "Kto zwinął?"

Normative spec for the logic core. Every evaluator, solver and generator must match this file 1:1.
UI text is Polish; phrases are given per statement type.

## 1. Board

- Square grid `N × N`, `5 ≤ N ≤ 8` (the tutorial may use `N = 4`).
- Coordinates: `(r, c)`, rows `1..N` top to bottom, columns `1..N` left to right.
  North = up (smaller `r`), south = down, west = left (smaller `c`), east = right.
- **Zones**: the grid is partitioned into named zones; each zone is a 4-connected set of cells
  containing at least one walkable cell.
- **Zone border**: the line between two orthogonally adjacent cells of different zones. Borders
  are painted on the ground: they **do not block sight** (§3) and matter only for zone-based
  statements and for neighbourhood.
- **Cell types**
  - walkable: `ground` (ziemia), `bush` (krzak), `pad` (wyrzutnia);
  - blocking: `crate` (skrzynia), `barrel` (beczka), `rock` (skała), `safe` (sejf).
  - Exactly one `safe` per board.
- Two cells are **neighbours** when they are orthogonally adjacent **and in the same zone**.
  Diagonal cells are never neighbours.
- `safeSpots` = walkable neighbours of the safe. A valid board has `|safeSpots| ≥ 1`.

## 2. Heroes and placement

- `k` heroes (`3 ≤ k ≤ 8`), each with a unique name and a grammatical gender (Polish verb forms
  only; gender is never used by any rule or statement).
- A **placement** assigns every hero to a distinct walkable cell.

## 3. Line of sight

Cells `A ≠ B` **see each other** when they lie in the same row or the same column and every cell
strictly between `A` and `B` is walkable. Zones and zone borders play no role in sight; only
blocking cells (obstacles and the safe) block it.

Heroes never block sight (irrelevant in valid placements, see R1). Orthogonally adjacent cells
always see each other. The definition applies to any two cells (`B` may be blocking); heroes only
occupy walkable cells.

## 4. Global rules (hold in every valid placement)

- **R1 — No one saw anyone ("Nikt nikogo nie widział")**: no two heroes stand on cells that see
  each other.
- **R2 — The thief**: exactly one hero stands on a cell of `safeSpots`. That hero is the thief.

## 5. Statements

A puzzle lists statements; **every statement is true** in the solution (v1 has no liars).
Most statements have a subject hero `S` (shown on that hero's card); drone facts are global.
`cell(X)` = the cell of hero `X`, `zone(X)` = its zone,
`zoneHeroes(X)` = number of heroes in `zone(X)` including `X`.

| id | parameters | true when | Polish wording (m / f) |
|---|---|---|---|
| `inZone` | zone `z` | `zone(S) = z` | „Byłem/Byłam w strefie Z.” |
| `notInZone` | zone `z` | `zone(S) ≠ z` | „Nie byłem/byłam w strefie Z.” |
| `on` | type `t ∈ {ground, bush, pad}` | `type(cell(S)) = t` | „Stałem/Stałam w krzakach / na wyrzutni / na gołej ziemi.” |
| `nextTo` | type `t ∈ {crate, barrel, rock}` | some neighbour of `cell(S)` has type `t` | „Stałem/Stałam obok skrzyni / beczki / skały.” |
| `notNextTo` | type `t ∈ {crate, barrel, rock}` | no neighbour of `cell(S)` has type `t` | „Nie stałem/stałam obok …” |
| `sees` | type `t ∈ {crate, barrel, rock, safe}` | in at least one of the 4 directions the first blocking cell reached from `cell(S)` (see §5.1) has type `t` | „Widziałem/Widziałam skrzynię / beczkę / skałę / sejf.” |
| `row` | `n` | `r(S) = n` | „Byłem/Byłam w n. rzędzie.” |
| `col` | `n` | `c(S) = n` | „Byłem/Byłam w n. kolumnie.” |
| `northOf` | hero `H ≠ S` | `r(S) < r(H)` | „Stałem/Stałam gdzieś na północ od H.” |
| `southOf` | hero `H ≠ S` | `r(S) > r(H)` | „… gdzieś na południe od H.” |
| `westOf` | hero `H ≠ S` | `c(S) < c(H)` | „… gdzieś na zachód od H.” |
| `eastOf` | hero `H ≠ S` | `c(S) > c(H)` | „… gdzieś na wschód od H.” |
| `alone` | — | `zoneHeroes(S) = 1` | „Byłem sam / Byłam sama w swojej strefie.” |
| `zoneCount` | `2 ≤ n ≤ k` | `zoneHeroes(S) = n` | „W mojej strefie było nas n.” |
| `sameZone` | hero `H ≠ S` | `zone(S) = zone(H)` | „Byłem/Byłam w tej samej strefie co H.” |
| `otherZone` | hero `H ≠ S` | `zone(S) ≠ zone(H)` | „Nie byłem/byłam w tej samej strefie co H.” |
| `drone` (global) | side `∈ {N, S, W, E}`, index `i`, count `n ∈ {0, 1}` | see §5.2 | „Dron D nikogo nie nagrał.” / „Dron D nagrał jednego bohatera.” |

Notes:

- Directions in `northOf` etc. are strict and ignore the other axis ("anywhere in a row above").
- `nextTo` never looks across a zone border. `nextTo safe` and `notNextTo safe` do not exist (they would
  name or exclude the thief directly).
- `nextTo hero` does not exist: two heroes that are neighbours always see each other (R1).
- `sees safe` is always true for the thief, but also for any hero with a clear line to the safe, so
  it narrows the state without naming the thief.
- `sameZone`/`otherZone` are symmetric: a puzzle never contains both `X sameZone Y` and `Y sameZone X`
  (same for `otherZone`).

### 5.1 `sees` scan

From `cell(S)` in each direction: step to the next cell; stop without a result if the step leaves
the grid; if the next cell is blocking, it is the result for that direction; otherwise continue
(zone borders are ignored). `sees t` is true if any direction's result has type `t`. A blocking cell
directly adjacent counts, whatever its zone. Equivalently (§3): some cell of type `t` sees `cell(S)`.

### 5.2 Drones

A drone hangs outside the grid and looks inward along one row or column:

- Sides `W`/`E`: `i` is a **row** index; `W` scans from column 1 eastwards, `E` from column `N`
  westwards.
- Sides `N`/`S`: `i` is a **column** index; `N` scans from row 1 southwards, `S` from row `N`
  northwards.

The scan starts at the first grid cell (the outer border in front of it is ignored). If that cell is
blocking, the scan is empty. Otherwise it includes that cell and continues cell by cell, stopping
before the first blocking cell (zone borders are ignored). Its value = number of
heroes on the scanned cells; by R1 it is always `0` or `1`. Label: `D` + side letter + index
(e.g. `DE1` = east side, row 1). Generators never use drones whose scan is empty.

## 6. Puzzle quality requirements

- **Q1 Unique**: exactly one placement satisfies R1, R2 and all statements.
- **Q2 Minimal**: removing any single statement yields ≥ 2 placements.
- **Q3 Deducible**: the step solver (`src/steps.js`, techniques in `PLAN.md` stage 3) reaches the
  solution without guessing. Easy and medium use levels 1–2 only; hard and expert may also need level 3
  (one assumption refuted by levels 1–2, never nested).
- **Q4 Readable**: at most 2 statements per hero as subject `S` (being the referenced hero `H`
  does not count); heroes without a statement are allowed („Milczy.”); at most 2 drone facts per
  puzzle.
- **Q5 Informative**: no statement that is true or false in every placement of the board (e.g.
  `notNextTo t` when the board has no `t`, `sameZone` with a zone of one walkable cell).

The goal of the player: place every hero; the game then reveals the thief (R2).

## 7. Example 1 — tutorial (4 × 4, 4 heroes)

```
      c1  c2  c3  c4
r1    .   .   C   .     zone Kanion = rows 1–2
r2    .   S   .   .
      ···············   zone border (painted, does not block sight)
r3    b   .   R   .     zone Oaza = rows 3–4
r4    .   .   .   b
```
Legend: `.` ground, `b` bush, `p` pad, `C` crate, `B` barrel, `R` rock, `S` safe.

Statements: Mira — `on bush`; Bobo — `westOf Mira`; Kora — `westOf Bobo`;
Zyg — `notInZone Kanion`.

Deduction:
1. Kora is west of Bobo, Bobo west of Mira → Mira is in column ≥ 3. Her bushes are `(3,1)` and `(4,4)` → Mira `(4,4)`.
2. Mira sees all of row 4 and all of column 4 → nobody else there.
3. Zyg is in Oaza (rows 3–4): row 4 and `(3,4)` are excluded, `(3,3)` is a rock → Zyg `(3,1)` or `(3,2)`.
4. Bobo is in column 2 or 3 (west of Mira, east of Kora): column 2 gives `(1,2)`, `(3,2)` (`(2,2)` is the safe, `(4,2)` is seen by Mira); column 3 gives only `(2,3)`. If Bobo stood on `(3,2)`, Zyg would have to be on `(3,1)` — adjacent, they would see each other (R1). So Bobo is on `(1,2)` or `(2,3)`, both safe spots (`safeSpots = {(1,2), (2,1), (2,3)}`) → **Bobo is the thief**, and Kora is not on a safe spot (R2).
5. If Bobo were on `(1,2)`: Kora (column 1) cannot be on `(1,1)` (adjacent to Bobo), nor `(2,1)` (safe spot), nor `(4,1)` (Mira) → Kora `(3,1)`, and then Zyg has only `(3,2)`, adjacent to Kora. Contradiction → Bobo `(2,3)`.
6. Kora (column 1 or 2, not a safe spot): `(1,1)`, `(3,1)` or `(3,2)`. Zyg is in row 3, so Kora in row 3 would be adjacent to him or on his only other cell → Kora `(1,1)`. Kora sees column 1 → Zyg `(3,2)`.

Solution: Bobo `(2,3)` (thief), Mira `(4,4)`, Zyg `(3,2)`, Kora `(1,1)`. Unique; every statement is
necessary (checked by the solver and the independent reference).

## 8. Example 2 — with a drone (5 × 5, 5 heroes)

```
      c1  c2  c3 : c4  c5
r1    .   .   B  : .   .      Kanion (K): rows 1–3, cols 1–3
r2    .   p   .  : R   .      Las (L):    rows 1–4, cols 4–5
r3    C   .   .  : .   b      Oaza (O):   row 4 cols 1–3, row 5 all
      ···········:
r4    .   .   S  : .   .
                 :·······
r5    b   .   .   B   .
```
Dotted lines are painted zone borders (they do not block sight).

Statements: Bobo — `inZone Kanion`, `southOf Kora`; Mira — `sameZone Bobo`;
Rufi — `westOf Bobo`; Kora — `southOf Zyg`; drone `DW2` (west side, row 2) — `1`.

Deduction:
1. Bobo and Mira are in Kanion.
2. Zyg is north of Kora, Kora north of Bobo → Bobo is in row ≥ 3; Kanion ends at row 3 → Bobo in row 3, Kora in row 2, Zyg in row 1.
3. R2: `safeSpots = {(4,2), (5,3)}`, both in Oaza. Bobo and Mira are in Kanion, Kora in row 2, Zyg in row 1 → **Rufi is the thief**. Rufi is west of Bobo (column ≤ 3), so Rufi's column is ≤ 2 → Rufi `(4,2)` and Bobo is in column 3 → Bobo `(3,3)`.
4. Rufi sees up column 2: `(3,2)`, `(2,2)`, `(1,2)`. Bobo sees `(3,2)`, `(3,4)`, `(3,5)` and `(2,3)`.
5. Kora (row 2) is left with `(2,1)` or `(2,5)`; Mira (Kanion) with `(1,1)` or `(2,1)`.
6. `DW2` scans `(2,1)`, `(2,2)`, `(2,3)` and stops at the rock `(2,4)` → exactly one hero there; `(2,2)` and `(2,3)` are excluded → somebody stands on `(2,1)`. If Mira were on `(1,1)`, that somebody would be Kora on `(2,1)`, adjacent to Mira. Contradiction → Mira `(2,1)`, Kora `(2,5)`.
7. Zyg (row 1): `(1,1)` is adjacent to Mira, `(1,2)` is seen by Rufi, `(1,5)` is adjacent to Kora → Zyg `(1,4)`.

Solution: Bobo `(3,3)`, Mira `(2,1)`, Zyg `(1,4)`, Kora `(2,5)`, Rufi `(4,2)` (thief). Unique;
every statement is necessary.

Observation: without statements this board admits 53 640 valid placements (with sight-blocking
zone walls it was 135 120; the change was made so that R1 carries real weight).
