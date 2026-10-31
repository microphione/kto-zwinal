// RULES.md §7 and §8 encoded in the puzzle JSON contract.
const grid = (rows, map) => rows.map(r => r.split(' ').map(x => map[x] ?? x));
const T = { '.': 'ground', b: 'bush', p: 'pad', C: 'crate', B: 'barrel', R: 'rock', S: 'safe' };
const hero = (name, gender) => ({ name, gender });

export const example1 = {
  n: 4,
  cells: grid(['. . C .', '. S . .', 'b . R .', '. . . b'], T),
  zones: grid(['0 0 0 0', '0 0 0 0', '1 1 1 1', '1 1 1 1'], { 0: 0, 1: 1 }),
  zoneNames: ['Kanion', 'Oaza'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm'), hero('Kora', 'f')],
  statements: [
    { type: 'westOf', who: 0, hero: 1 },
    { type: 'on', who: 1, cellType: 'bush' },
    { type: 'notInZone', who: 2, zone: 0 },
    { type: 'westOf', who: 3, hero: 0 },
  ],
  // Bobo (2,3), Mira (4,4), Zyg (3,2), Kora (1,1)
  solution: [6, 15, 9, 0],
  thief: 0,
};

export const example2 = {
  n: 5,
  cells: grid(['. . B . .', '. p . R .', 'C . . . b', '. . S . .', 'b . . B .'], T),
  zones: grid(['K K K L L', 'K K K L L', 'K K K L L', 'O O O L L', 'O O O O O'], { K: 0, L: 1, O: 2 }),
  zoneNames: ['Kanion', 'Las', 'Oaza'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm'), hero('Kora', 'f'), hero('Rufi', 'm')],
  statements: [
    { type: 'inZone', who: 0, zone: 0 },
    { type: 'southOf', who: 0, hero: 3 },
    { type: 'sameZone', who: 1, hero: 0 },
    { type: 'southOf', who: 3, hero: 2 },
    { type: 'westOf', who: 4, hero: 0 },
    { type: 'drone', side: 'W', index: 2, n: 1 },
  ],
  // Bobo (3,3), Mira (2,1), Zyg (1,4), Kora (2,5), Rufi (4,2)
  solution: [12, 5, 3, 9, 16],
  thief: 4,
  bareSolutions: 53640,
};
