// RULES.md §8 (v3, rows and columns) encoded in the puzzle JSON contract.
const grid = (rows, map) => rows.map(r => r.split(' ').map(x => map[x] ?? x));
const T = { '.': 'ground', b: 'bush', p: 'pad', C: 'crate', B: 'barrel', R: 'rock' };
const hero = (name, gender) => ({ name, gender });

export const example1 = {
  version: 3,
  n: 4,
  cells: grid(['R . . .', '. . . R', '. b . .', '. . b p'], T),
  zones: grid(['R R R R', 'B R R R', 'B B B B', 'B B B B'], { R: 0, B: 1 }),
  zoneNames: ['Ruiny', 'Baza'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm')],
  statements: [
    { type: 'on', cellType: 'pad', who: 0 },
    { type: 'southOf', who: 2, hero: 1 },
    { type: 'northOfSafe', who: 2 },
  ],
  // Bobo (4,4), Mira (1,2), Zyg (2,1); safe (3,3)
  safe: 10,
  solution: [15, 1, 4],
  thief: 0,
  bareSolutions: 126,
};

export const example2 = {
  version: 3,
  n: 5,
  cells: grid(['. R . p .', 'C b . . .', '. . C b .', 'b . . . .', '. . . C .'], T),
  zones: grid(['B B K K O', 'B B B K O', 'B B B K O', 'B K K K O', 'K K O O O'], { B: 0, O: 1, K: 2 }),
  zoneNames: ['Baza', 'Oaza', 'Kanion'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm'), hero('Kora', 'f')],
  statements: [
    { type: 'nextTo', cellType: 'rock', who: 0 },
    { type: 'on', cellType: 'bush', who: 2 },
    { type: 'otherZone', who: 1, hero: 2 },
    { type: 'northOf', who: 3, hero: 0 },
  ],
  // Bobo (2,2), Mira (5,5), Zyg (3,4), Kora (1,1); safe (4,3)
  safe: 17,
  solution: [6, 24, 13, 0],
  thief: 2,
  bareSolutions: 1104,
};
