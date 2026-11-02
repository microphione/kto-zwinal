# Rules specification — "Kto zwinął?" (v4: map clues, furniture, houses and outdoor settings)

Normative spec for the logic core. Every evaluator, solver and generator must match this file 1:1.
UI text is Polish; phrases are given per statement type. v4 (2026-11-01): cases take place in houses (rooms)
or outdoors; statements are about the map and the other heroes, never about the safe; `sees` and the alarm
are gone; new map clues `notOn`, `onlyOn`, `aloneIn` and the shared statement `nobodyOn`. Unchanged from v3:
nothing blocks sight, no two heroes share a row or a column, the safe stood on the only cell whose row and
column are both free, and the thief is the only hero standing on a `thiefSpots(safe)` cell (§1).

## 1. Board

- Square grid `N × N`, `4 ≤ N ≤ 8` (`N = 4` only in the tutorial).
- Coordinates: `(r, c)`, rows `1..N` top to bottom, columns `1..N` left to right.
  North = up (smaller `r`), south = down, west = left (smaller `c`), east = right.
  Cell index (contract) = `(r − 1) · N + (c − 1)`.
- **Setting** (`setting`): the kind of place of the case — a house (`domek`, `willa`, `chatka`, `kamienica`)
  or outdoors (`park`). It only chooses names, tiles and art; no rule depends on it.
- **Zones**: the grid is partitioned into at least 2 named zones (every cell, obstacles included, belongs to
  exactly one); each zone is a 4-connected set of cells containing at least one walkable cell. A zone is a
  room (kind `in`) or an outdoor area (kind `out`, `zoneKinds`); the kind only chooses tiles and art. Zone
  borders (walls, hedges) matter only for zone-based statements, neighbourhood and `thiefSpots`; they do not
  block sight (§3).
- **Cell types** shown on the map:

  | type | kind | walkable | plain | Polish |
  |---|---|---|---|---|
  | `floor` | in | yes | yes | goła podłoga |
  | `bed` | in | yes | | łóżko (leży się na nim) |
  | `armchair` | in | yes | | fotel (siedzi się na nim) |
  | `rug` | in | yes | | dywan |
  | `table` | in | | | stół |
  | `wardrobe` | in | | | szafa |
  | `plant` | in | | | kwiatek (w doniczce) |
  | `grass` | out | yes | yes | trawa |
  | `bush` | out | yes | | krzaki |
  | `bench` | out | yes | | ławka (siedzi się na niej) |
  | `tree` | out | | | drzewo |
  | `rock` | out | | | skała |
  | `pond` | out | | | staw |

  Nobody stands on an obstacle (a non-walkable type). The kind column is a generator convention (§6); the
  rules use only walkable and plain. **Plain** = exactly `floor` and `grass` (obstacles are not plain). **Special** types = walkable and not plain (`bed`, `armchair`, `rug`,
  `bush`, `bench`).
- The safe (sejf) is **not shown** on the map; its cell follows from the heroes' cells (§2).
- Two cells are **neighbours** when they are orthogonally adjacent **and in the same zone** (obstacle cells
  included). Diagonal cells are never neighbours.
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
  every statement of the puzzle. No statement mentions the safe.

## 3. Line of sight

Two different cells **see each other** when they lie in the same row or the same column. Nothing blocks
sight: not obstacles, not furniture, not walls or zone borders, not the safe. Sight only explains R1 and the
drone hint; no statement refers to it.

## 4. Global rules (hold in every valid solution)

- **R1 — No one saw anyone ("Nikt nikogo nie widział")**: no two heroes stand in the same row or in the
  same column.
- **R0 — The safe**: the safe cell (§2) is plain (`floor` or `grass`) („Sejf stał na gołej podłodze albo na
  trawie”).
- **R2 — The thief**: exactly one hero stands on a cell of `thiefSpots(safe)`. That hero is the thief.

## 5. Statements

A puzzle lists statements; **every statement is true** in the solution (no liars).
Every statement has a subject hero `S` (shown on that hero's card) except the **shared** statement
`nobodyOn`, which has no subject (shown on its own card, „Wszyscy zgodnie”).
`cell(X)` = the cell of hero `X`, `zone(X)` = its zone, `zoneHeroes(X)` = number of heroes in `zone(X)`
including `X` (the safe is not a hero and is never counted); `r(…)`, `c(…)` = row and column;
`others(S)` = every hero except `S`.

| id | parameters | true when | Polish wording (m / f) |
|---|---|---|---|
| `inZone` | zone `z` | `zone(S) = z` | „Byłem/Byłam w kuchni.” (locative of `z`) |
| `notInZone` | zone `z` | `zone(S) ≠ z` | „Nie byłem/byłam na strychu.” |
| `aloneIn` | zone `z` | `zone(S) = z` and no hero of `others(S)` is in `z` | „Jako jedyny byłem / Jako jedyna byłam w lesie.” |
| `on` | walkable type `t` | `type(cell(S)) = t` | per type: „Leżałem/Leżałam na łóżku.”, „Siedziałem/Siedziałam na fotelu / na ławce.”, „Stałem/Stałam na dywanie / w krzakach / na gołej podłodze / na trawie.” |
| `notOn` | special type `t` | `type(cell(S)) ≠ t` | „Nie leżałem/leżałam na łóżku.”, „Nie siedziałem/siedziałam na fotelu.”, … |
| `onlyOn` | special type `t` | `type(cell(S)) = t` and no hero of `others(S)` stands on `t` | „Jako jedyny leżałem / Jako jedyna leżałam na łóżku.”, „Jako jedyny siedziałem na fotelu.”, … |
| `nobodyOn` (shared) | special type `t` | no hero stands on `t` | „Nikt nie leżał na łóżku.”, „Nikt nie siedział na fotelu.”, „Nikt nie stał na dywanie / w krzakach.” |
| `nextTo` | non-plain type `t` | some neighbour of `cell(S)` has type `t` | „Byłem/Byłam obok łóżka / fotela / dywanu / stołu / szafy / kwiatka / krzaków / ławki / drzewa / skały / stawu.” |
| `notNextTo` | non-plain type `t` | no neighbour of `cell(S)` has type `t` | „Nie byłem/byłam obok …” |
| `row` | `1 ≤ n ≤ N` | `r(S) = n` | „Byłem/Byłam w n. rzędzie.” |
| `col` | `1 ≤ n ≤ N` | `c(S) = n` | „Byłem/Byłam w n. kolumnie.” |
| `northOf` | hero `H ≠ S` | `r(S) < r(H)` | „Byłem/Byłam gdzieś na północ od H.” (H in the genitive: „od Miry”) |
| `southOf` | hero `H ≠ S` | `r(S) > r(H)` | „… gdzieś na południe od H.” |
| `westOf` | hero `H ≠ S` | `c(S) < c(H)` | „… gdzieś na zachód od H.” |
| `eastOf` | hero `H ≠ S` | `c(S) > c(H)` | „… gdzieś na wschód od H.” |
| `alone` | — | `zoneHeroes(S) = 1` | „Byłem sam / Byłam sama w swoim pomieszczeniu.” (house with an outdoor zone: „w swojej części posesji”; park: „w swojej części parku”) |
| `zoneCount` | `2 ≤ n ≤ k` | `zoneHeroes(S) = n` | „W moim pomieszczeniu było nas n.” („W mojej części posesji / parku …”) |
| `sameZone` | hero `H ≠ S` | `zone(S) = zone(H)` | „Byłem/Byłam w tym samym pomieszczeniu co H.” („w tej samej części posesji / parku”) |
| `otherZone` | hero `H ≠ S` | `zone(S) ≠ zone(H)` | „Nie byłem/byłam w tym samym pomieszczeniu co H.” („w tej samej części posesji / parku”) |

Zone parameters `z` are zones of the board; type parameters `t` are types of the catalogue (§1); hero
parameters `H` are heroes of the puzzle. A type parameter covers **every** cell of that type on the map
(„Nikt nie siedział na fotelu” = on no armchair of the map). A statement whose parameter is outside the domain
given in its row (e.g. `notOn floor`, `nextTo grass`, `zoneCount 1`, `H = S`) is **ill-formed**: no puzzle contains
one, and evaluators reject it with an error instead of judging it. `sameZone` / `otherZone` name `H` in
the nominative („co Mira”).

Wording per type (`on`, `notOn`, `onlyOn`, `nobodyOn` use the verb and the phrase; `nextTo` / `notNextTo` use
„obok” + the genitive):

| type | verb | phrase | genitive |
|---|---|---|---|
| `floor` | stać | na gołej podłodze | — |
| `grass` | stać | na trawie | — |
| `bed` | leżeć | na łóżku | łóżka |
| `armchair` | siedzieć | na fotelu | fotela |
| `rug` | stać | na dywanie | dywanu |
| `bush` | stać | w krzakach | krzaków |
| `bench` | siedzieć | na ławce | ławki |
| `table` | — | — | stołu |
| `wardrobe` | — | — | szafy |
| `plant` | — | — | kwiatka |
| `tree` | — | — | drzewa |
| `rock` | — | — | skały |
| `pond` | — | — | stawu |

Each zone name of the setting catalogue comes with its full prepositional phrase (`w kuchni`, `na strychu`,
`w lesie`, `na tarasie`); texts insert it verbatim. The zone-population and same-zone wordings name a zone
„pomieszczenie” in a house without an outdoor zone, „część posesji” in a house with one („Byłam sama w swojej
części posesji”, „W mojej części posesji było nas 2”, „w tej samej części posesji co Mira”) and „część parku” in
the park; the wording never changes the truth.

Notes:

- Directions (`northOf`, …) are strict and ignore the other axis ("anywhere in a row above"). In a candidate no
  two heroes share a row or column, so for any two heroes exactly one of `northOf` / `southOf` holds, and
  exactly one of `westOf` / `eastOf`.
- `nextTo` never looks across a zone border and includes walkable types („obok łóżka” holds for a hero on the
  floor next to a bed, and also for a hero lying on a bed next to another bed — the generator avoids that
  case, §6). `nextTo hero` does not exist: an
  orthogonally adjacent cell is in the same row or column (R1).
- `notNextTo t` is true for a cell without neighbours.
- `onlyOn t` = `on t` for `S` plus `notOn t` for every other hero; `aloneIn z` = `inZone z` for `S` plus
  `notInZone z` for every other hero; `nobodyOn t` = `notOn t` for every hero. The safe is never on a special
  type (R0), so it plays no part in them.
- `alone` and `aloneIn z` differ: `alone` does not name the zone.
- `zoneCount 1` is not used; that case is `alone`.

## 6. Puzzle quality requirements

- **Q1 Unique**: exactly one solution (placement; the safe cell follows) satisfies R1, R0, R2 and all
  statements.
- **Q2 Minimal**: removing any single statement yields ≥ 2 solutions.
- **Q3 Deducible**: the step solver (`src/steps.js`, techniques in `PLAN.md` stage 9) reaches the solution
  without guessing. Easy and medium use levels 1–2 only; hard and expert may also need level 3 (one assumption
  refuted by levels 1–2, never nested). Q3 is a property of the step solver, outside the truth semantics of
  §1–§5 (an independent reference checks Q1, Q2, Q4 and Q5).
- **Q4 Readable**: at most 2 statements per hero as subject `S` (being the referenced hero `H` does not count);
  heroes without a statement are allowed („Milczy.”); at most 1 shared statement (`nobodyOn`) per puzzle.
- **Q5 Informative**: let `Cand` = the candidates (§2), with no statement applied. No statement of the
  puzzle (with its own subject and parameters) is true in every member of `Cand` (e.g. `notNextTo t` or
  `nobodyOn t` when the board has no `t`); one false in every member is already excluded by Q1. For a
  statement true in the solution this follows from Q1 + Q2: if it held in all of `Cand`, removing it would
  leave the single solution.
- **Generator conventions** (design choices of the generator, not checked by the reference):
  - indoor types only in `in` zones, outdoor types only in `out` zones; a house has at most one `out` zone,
    the park only `out` zones; zone names come from the setting's catalogue;
  - the safe has at least 2 `thiefSpots` in the solution, and every zone has at least 3 walkable cells and at least one plain cell
    (the UI writes the zone name there);
  - no two equivalent statements: `X sameZone Y` / `Y sameZone X`, `X otherZone Y` / `Y otherZone X`,
    `X northOf Y` / `Y southOf X`, `X westOf Y` / `Y eastOf X`, or the same statement twice (implied by Q2:
    either one could be removed without changing the solutions; likewise `inZone z` / `notInZone z'` on a
    board with exactly 2 zones);
  - one subject never gets two statements where one implies the other: `on t` with `onlyOn t` or `notOn t'`,
    `inZone z` with `aloneIn z` or `notInZone z'`, `alone` with `aloneIn z` (Q2 removes the weaker one anyway;
    the convention keeps the generator from spending a Q4 slot on it);
  - no `nextTo t` / `notNextTo t` for a subject who stands on `t` in the solution (true, but reads oddly:
    „Byłem obok dywanu” while standing on a rug).

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
Legend: `.` floor, `b` bed, `a` armchair, `u` rug, `T` table, `W` wardrobe, `P` plant; outdoors `,` grass,
`k` bush, `l` bench, `D` tree, `R` rock, `S` pond. The safe is not shown.

### 8.1 Example 1 — tutorial (4 × 4, 3 heroes, Domek letniskowy)

```
      c1  c2  c3  c4
r1    b   .   .   W     Sypialnia = (1,1)–(1,2), (2,1)–(2,2), (3,1), (4,1)
r2    .   P   a   .
r3    .   u   .   .     Salon = the rest
r4    T   .   .   a
```

Statements: Mira — `onlyOn armchair` („Jako jedyna siedziałam na fotelu.”); Zyg — `on bed` („Leżałem na
łóżku.”); Bobo is silent.

Deduction:
1. The only bed is `(1,1)` → Zyg `(1,1)`; row 1 and column 1 are his.
2. Mira sits on an armchair, `(2,3)` or `(4,4)`; Bobo on neither.
3. The safe is on bare floor outside row 1 and column 1: `(2,4)`, `(3,3)`, `(3,4)`, `(4,2)` or `(4,3)`.
   - `(2,4)` and `(4,3)` would take the row or column of both armchairs → Mira would have nowhere to sit.
   - `(3,3)` leaves Mira only `(4,4)`; Bobo would then need row 2 and column 2, i.e. the plant.
   - `(4,2)` leaves Mira `(2,3)` and Bobo `(3,4)`; its only thief spot in its zone is `(3,3)`, empty → no thief (R2).
   → **the safe stood on `(3,4)`**.
4. Column 4 is the safe's → Mira `(2,3)`, a thief spot of the safe → **Mira is the thief**; Bobo takes the last
   row and column: `(4,2)`.

Solution: Bobo `(4,2)`, Mira `(2,3)` (thief), Zyg `(1,1)`; safe `(3,4)`. Without statements the board admits
78 candidates.

### 8.2 Example 2 (5 × 5, 4 heroes, Domek letniskowy with a garden)

```
      c1  c2  c3  c4  c5
r1    .   .   W   ,   ,      Kuchnia (K):   rows 1–2, columns 1–3
r2    T   .   .   k   ,      Ogród (O):     rows 1–3, columns 4–5, and (4,5)
r3    .   a   .   ,   D      Salon (S):     (3,1)–(3,3), (4,3)–(4,4), (5,3)–(5,5)
r4    b   .   .   P   l      Sypialnia (Y): rows 4–5, columns 1–2
r5    .   .   u   .   .
```

Statements: Bobo — `onlyOn bush` („Jako jedyny stałem w krzakach.”); Mira — `nextTo bed` („Byłam obok
łóżka.”); Kora — `aloneIn Salon` („Jako jedyna byłam w salonie.”), `on armchair` („Siedziałam na fotelu.”);
Zyg is silent.

Deduction:
1. The only armchair is `(3,2)` → Kora `(3,2)`, and nobody else stood in the Salon.
2. The bed `(4,1)` has two neighbours in its zone: `(4,2)` and `(5,1)` (`(3,1)` is in the Salon). `(4,2)` is in
   Kora's column → Mira `(5,1)`.
3. The only bush is `(2,4)` → Bobo `(2,4)`.
4. Rows 2, 3, 5 and columns 1, 2, 4 are taken, so Zyg and the safe share rows 1, 4 and columns 3, 5. Zyg is not
   in the Salon and not on the wardrobe → `(1,5)` or `(4,5)`. With Zyg on `(4,5)` the safe would stand on the
   wardrobe `(1,3)` → **Zyg `(1,5)`, the safe `(4,3)`**.
5. The thief spots of `(4,3)` in the Salon are `(3,2)` and `(5,4)`; Kora stands on `(3,2)` → **Kora is the thief**.

Solution: Bobo `(2,4)`, Mira `(5,1)`, Zyg `(1,5)`, Kora `(3,2)` (thief); safe `(4,3)`. Without statements the board
admits 1 392 candidates.

## 9. Data contract (puzzle JSON, version 4)

```
{ version: 4, seed, difficulty, n, setting: 'domek'|'willa'|'chatka'|'kamienica'|'park',
  cells: n×n type ids (§1), zones: n×n zone indices 0..Z−1, zoneNames: [Z names], zoneKinds: [Z × 'in'|'out'],
  heroes: [{ name, gen, gender: 'm'|'f' }] (k = n − 1),
  statements: [{ type, who?, zone?, cellType?, hero?, n? }],   // `nobodyOn` has no `who`
  solution: [k cell indices], safe: cell index, thief: hero index, grade: { level, steps } }
```

Statement fields: `who` = subject hero index (absent only for `nobodyOn`); `zone` for `inZone`, `notInZone`,
`aloneIn`; `cellType` for `on`, `notOn`, `onlyOn`, `nobodyOn`, `nextTo`, `notNextTo`; `n` for `row`, `col`,
`zoneCount`; `hero` for the hero directions, `sameZone`, `otherZone`. `safe`, `thief`, `grade` are derived
and stored for the UI; the rules recompute them from `solution`. Mission files (`puzzles/misja-*.json`) also
carry `id` and `title` (UI only).
