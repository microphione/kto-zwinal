# Rules specification — "Kto zwinął?" (v2: hidden safe)

Normative spec for the logic core. Every evaluator, solver and generator must match this file 1:1.
UI text is Polish; phrases are given per statement type. v2 (2026-11-01): the safe is hidden — its cell is
part of the solution, like the heroes' cells.

## 1. Board

- Square grid `N × N`, `4 ≤ N ≤ 8` (`N = 4` only in the tutorial).
- Coordinates: `(r, c)`, rows `1..N` top to bottom, columns `1..N` left to right.
  North = up (smaller `r`), south = down, west = left (smaller `c`), east = right.
  Cell index (contract) = `(r − 1) · N + (c − 1)`.
- **Zones**: the grid is partitioned into named zones; each zone is a 4-connected set of cells
  containing at least one walkable cell.
- **Zone border**: the line between two orthogonally adjacent cells of different zones. Borders
  are painted on the ground: they **do not block sight** (§3) and matter only for zone-based
  statements and for neighbourhood.
- **Cell types** shown on the map
  - walkable: `ground` (ziemia), `bush` (krzak), `pad` (wyrzutnia);
  - obstacles (blocking): `crate` (skrzynia), `barrel` (beczka), `rock` (skała).
- **The hidden safe** (sejf): not shown on the map. It stood on exactly one cell whose map type is `ground`;
  that cell is called `safe`. **The map with the safe in place** is the map with the type of the safe cell
  replaced by `safe`. On that map `safe` is a **blocking** type (like the obstacles): it ends sight (§3),
  `sees` scans (§5.1) and drone scans (§5.2). In everything below, "walkable" and "blocking" refer to the
  map with the safe in place, so the safe cell is never walkable.
- Two cells are **neighbours** when they are orthogonally adjacent **and in the same zone**.
  Diagonal cells are never neighbours.
- `safeSpots` = walkable neighbours of the safe cell (they depend on where the safe is). A safe cell
  whose `safeSpots` is empty admits no solution (R2 cannot hold).

## 2. Solution

- `k` heroes (`3 ≤ k ≤ 8`), each with a unique name and a grammatical gender (Polish verb forms
  only; gender is never used by any rule or statement).
- A **candidate** is a pair: the safe cell (a cell of map type `ground`) and a **placement** that assigns
  every hero to a distinct walkable cell of the map with the safe in place (so never the safe cell).
- Rules (§4) and statements (§5) are evaluated on the map with the safe in place. A **solution** is a
  candidate satisfying R1, R2 and every statement of the puzzle.

## 3. Line of sight

Cells `A ≠ B` **see each other** when they lie in the same row or the same column and every cell
strictly between `A` and `B` is walkable (on the map with the safe in place: not an obstacle and not the
safe). Zones and zone borders play no role in sight.

Heroes never block sight (irrelevant in valid solutions, see R1). Orthogonally adjacent cells
always see each other. The definition applies to any two cells (`B` may be blocking).

## 4. Global rules (hold in every valid solution)

- **R1 — No one saw anyone ("Nikt nikogo nie widział")**: no two heroes stand on cells that see
  each other (with the safe blocking sight).
- **R2 — The thief**: exactly one hero stands on a cell of `safeSpots`. That hero is the thief.

## 5. Statements

A puzzle lists statements; **every statement is true** in the solution (no liars).
Most statements have a subject hero `S` (shown on that hero's card); drone facts and the alarm are global.
`cell(X)` = the cell of hero `X`, `zone(X)` = its zone, `zoneHeroes(X)` = number of heroes in `zone(X)`
including `X`; `r(…)`, `c(…)` = row and column; `safe` = the safe cell.

| id | parameters | true when | Polish wording (m / f) |
|---|---|---|---|
| `inZone` | zone `z` | `zone(S) = z` | „Byłem/Byłam w strefie Z.” |
| `notInZone` | zone `z` | `zone(S) ≠ z` | „Nie byłem/byłam w strefie Z.” |
| `on` | type `t ∈ {ground, bush, pad}` | `type(cell(S)) = t` | „Stałem/Stałam w krzakach / na wyrzutni / na gołej ziemi.” |
| `nextTo` | type `t ∈ {crate, barrel, rock}` | some neighbour of `cell(S)` has type `t` | „Stałem/Stałam obok skrzyni / beczki / skały.” |
| `notNextTo` | type `t ∈ {crate, barrel, rock}` | no neighbour of `cell(S)` has type `t` | „Nie stałem/stałam obok …” |
| `sees` | type `t ∈ {crate, barrel, rock, safe}` | in at least one of the 4 directions the first blocking cell reached from `cell(S)` (§5.1, the safe included) has type `t` | „Widziałem/Widziałam skrzynię / beczkę / skałę / sejf.” |
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
| `drone` (global) | side `∈ {N, S, W, E}`, index `1 ≤ i ≤ N`, count `n ∈ {0, 1}` | value of the scan (§5.2) `= n` | „Dron D nikogo nie nagrał.” / „Dron D nagrał jednego bohatera.” |
| `alarm` (global) | zone `z` | `zone(safe) = z` | „Alarm: sejf stał w strefie Z.” |

Zone parameters `z` are zones of the board; hero parameters `H` are heroes of the puzzle.

Notes:

- Directions (`northOf`, `northOfSafe`, …) are strict and ignore the other axis ("anywhere in a row above").
- `nextTo` never looks across a zone border. The safe cell has type `safe`, not an obstacle type, so it
  never makes `nextTo t` true or `notNextTo t` false. `nextTo safe` and `notNextTo safe` do not exist
  (they would name or exclude the thief directly).
- `nextTo hero` does not exist: two heroes that are neighbours always see each other (R1).
- `sees safe` is true for the thief, but also for any hero with a clear line to the safe, including a hero
  directly adjacent to the safe across a zone border (who is not a neighbour of the safe, so not the thief).
- `sameZoneSafe` is true for the thief and for every other hero in the safe's zone.
- `zoneCount 1` is not used; that case is `alone`.

### 5.1 `sees` scan

From `cell(S)` in each direction: step to the next cell; stop without a result if the step leaves
the grid; if the next cell is blocking (an obstacle or the safe), it is the result for that direction;
otherwise continue (zone borders are ignored). `sees t` is true if any direction's result has type `t`.
A blocking cell directly adjacent counts, whatever its zone. Equivalently (§3): some cell of type `t`
sees `cell(S)`.

### 5.2 Drones

A drone hangs outside the grid and looks inward along one row or column:

- Sides `W`/`E`: `i` is a **row** index; `W` scans from column 1 eastwards, `E` from column `N`
  westwards.
- Sides `N`/`S`: `i` is a **column** index; `N` scans from row 1 southwards, `S` from row `N`
  northwards.

The scan starts at the first grid cell (the outer border in front of it is ignored). If that cell is
blocking (an obstacle or the safe), the scan is empty. Otherwise it includes that cell and continues
cell by cell, stopping before the first blocking cell (zone borders are ignored). Its value = number of
heroes on the scanned cells. Every two scanned cells see each other, so in a candidate satisfying R1 the
value is `0` or `1`; in other candidates it may be larger and then the statement is false. Label in the UI:
`D1`, `D2`, … in statement order.

## 6. Puzzle quality requirements

- **Q1 Unique**: exactly one solution (safe cell + placement) satisfies R1, R2 and all statements.
- **Q2 Minimal**: removing any single statement yields ≥ 2 solutions.
- **Q3 Deducible**: the step solver (`src/steps.js`, techniques in `PLAN.md` stages 3 and 8) reaches the
  solution without guessing. Easy and medium use levels 1–2 only; hard and expert may also need level 3
  (one assumption refuted by levels 1–2, never nested). Q3 is a property of the step solver, outside the
  truth semantics of §1–§5 (an independent reference checks Q1, Q2, Q4 and Q5).
- **Q4 Readable**: at most 2 statements per hero as subject `S` (being the referenced hero `H`
  does not count; drone facts and the alarm have no subject); heroes without a statement are allowed
  („Milczy.”); at most 2 drone facts and at most 1 alarm per puzzle.
- **Q5 Informative**: let `Cand` = the candidates (§2) satisfying R1 and R2, with no statement applied. No
  statement (with its own subject and parameters) has the same truth value in every member of `Cand`
  (e.g. `notNextTo t` when the board has no `t`). For a statement true in the solution this follows from
  Q1 + Q2: if it held in all of `Cand`, removing it would leave the single solution.
- **Generator conventions**:
  - the safe has at least 2 `safeSpots` in the solution, and every zone has at least 3 walkable cells on the
    map without the safe;
  - no drone whose scan is empty in the solution (a design choice: such a drone can still exclude other
    candidates, so Q2 alone does not forbid it);
  - no two equivalent statements: `X sameZone Y` / `Y sameZone X`, `X otherZone Y` / `Y otherZone X`,
    `X northOf Y` / `Y southOf X`, `X westOf Y` / `Y eastOf X`, or the same statement twice (implied by Q2:
    either one could be removed without changing the solutions).

The goal of the player: place every hero and the safe; the game then reveals the thief (R2).

## 7. Example 1 — tutorial (4 × 4, 4 heroes)

```
      c1  c2  c3  c4
r1    .   .   C   .     zone Kanion = rows 1–2
r2    .   .   .   .
      ···············   zone border (painted, does not block sight)
r3    b   .   R   .     zone Oaza = rows 3–4
r4    .   .   .   b
```
Legend: `.` ground, `b` bush, `p` pad, `C` crate, `B` barrel, `R` rock. The safe is not shown.

Statements: Mira — `on bush`; Zyg — `nextTo rock`, `sees safe`; Kora — `westOf Mira`, `northOfSafe`;
`alarm Kanion`. Bobo is silent.

Deduction:
1. Alarm: the safe stood in Kanion (rows 1–2), on one of its 7 ground cells.
2. Kora is north of the safe, which is in row 1 or 2 → Kora is in row 1. Mira is in a bush, `(3,1)` or
   `(4,4)`; Kora is west of her, so Mira is not in column 1 → Mira `(4,4)`, and Kora is `(1,1)` or `(1,2)`.
3. Zyg is next to the rock `(3,3)` in his zone Oaza: `(3,2)`, `(3,4)` or `(4,3)`. From `(4,3)` nothing in
   Kanion is in view (the rock is above), so he would not see the safe; `(3,4)` is in Mira's column → Zyg `(3,2)`.
4. From `(3,2)` the only line into Kanion is column 2 upwards, so the safe is the first blocking cell there:
   `(2,2)` or `(1,2)`. The safe is south of Kora (row ≥ 2) → **the safe stood on `(2,2)`**.
5. Bobo is not in Zyg's or Mira's sight: rows 3–4 and column 4 are out (Zyg sees `(3,1)`, Mira the rest),
   so Bobo is in Kanion on `(1,1)`, `(1,2)`, `(2,1)` or `(2,3)`. `safeSpots = {(1,2), (2,1), (2,3)}` (`(3,2)`
   is across the zone border).
6. If Kora stood on `(1,2)` she would be next to the safe, and Bobo (not on her cell, not at `(1,1)` in her
   row) would be on `(2,1)` or `(2,3)`, also next to the safe: two people at the safe (R2). So Kora `(1,1)`;
   she sees `(1,2)` and `(2,1)` → Bobo `(2,3)`, next to the safe → **Bobo is the thief**.

Solution: safe `(2,2)`; Bobo `(2,3)` (thief), Mira `(4,4)`, Zyg `(3,2)`, Kora `(1,1)`. Zyg sees the safe
directly above him. Unique; every statement is necessary (checked by the
solver and the independent reference). Without statements the board admits 5 208 candidates (safe +
placement satisfying R1 and R2).

## 8. Example 2 — with a drone (5 × 5, 5 heroes)

```
      c1  c2  c3 : c4  c5
r1    .   .   B  : .   .      Kanion (K): rows 1–3, cols 1–3
r2    .   p   .  : R   .      Las (L):    rows 1–4, cols 4–5
r3    C   .   .  : .   b      Oaza (O):   row 4 cols 1–3, row 5 all
      ···········:
r4    .   .   .  : .   .
                 :·······
r5    b   .   .   B   .
```
Dotted lines are painted zone borders (they do not block sight).

Statements: Bobo — `inZone Kanion`, `sees barrel`; Mira — `nextTo crate`; Kora — `northOf Bobo`,
`southOf Zyg`; Rufi — `row 4`; drone `D1` (south side, column 3) — `0`.

Deduction:
1. Zyg is north of Kora and Kora north of Bobo → Bobo is in row ≥ 3. Bobo is in Kanion (rows 1–3) and sees
   a barrel: from Kanion only the barrel `(1,3)` can be seen, along row 1 or up column 3 → Bobo `(3,3)`
   (looking up column 3; so the safe is not on `(2,3)`). Kora is in row 2, Zyg in row 1.
2. `D1` looks up column 3 from `(5,3)`. Bobo stands on `(3,3)` and the drone recorded nobody, so a blocking
   cell lies below him in column 3: the safe stood on `(4,3)` or `(5,3)`.
3. Bobo sees `(3,2)`, `(3,4)`, `(3,5)` and `(2,3)`. Mira is next to the crate `(3,1)` within Kanion:
   `(2,1)` or `(3,2)` → Mira `(2,1)`.
4. Kora (row 2): `(2,2)` is next to Mira, `(2,3)` is seen by Bobo, `(2,4)` is a rock → Kora `(2,5)`.
5. Rufi (row 4): `(4,5)` is in Kora's column, `(4,3)` is next to Bobo (the safe or in his sight) → Rufi on
   `(4,1)`, `(4,2)` or `(4,4)`. R2: whichever cell the safe took, its spots are in Oaza (`(4,2)`, `(5,3)` for `(4,3)`;
   `(5,2)`, `(4,3)` for `(5,3)`), and nobody but Rufi can be in Oaza → **Rufi is the thief**. Of his cells
   only `(4,2)` is a spot, next to `(4,3)` → Rufi `(4,2)` and **the safe stood on `(4,3)`**.
6. Rufi sees up column 2: `(3,2)`, `(2,2)`, `(1,2)`. Zyg (row 1): `(1,1)` is in Mira's column, `(1,2)` is seen
   by Rufi, `(1,3)` is a barrel, `(1,5)` is in Kora's column → Zyg `(1,4)`.

Solution: safe `(4,3)`; Bobo `(3,3)`, Mira `(2,1)`, Zyg `(1,4)`, Kora `(2,5)`, Rufi `(4,2)` (thief). The drone's
scan is only `(5,3)`: the safe ends it. Unique; every statement is necessary.

Observation: without statements this board admits 569 640 candidates (safe + placement satisfying R1 and R2).
