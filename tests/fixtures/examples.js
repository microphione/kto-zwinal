// RULES.md §7 and §8 (v2, hidden safe) encoded in the puzzle JSON contract.
const grid = (rows, map) => rows.map(r => r.split(' ').map(x => map[x] ?? x));
const T = { '.': 'ground', b: 'bush', p: 'pad', C: 'crate', B: 'barrel', R: 'rock' };
const hero = (name, gender) => ({ name, gender });

export const example1 = {
  version: 2,
  n: 4,
  cells: grid(['. . C .', '. . . .', 'b . R .', '. . . b'], T),
  zones: grid(['0 0 0 0', '0 0 0 0', '1 1 1 1', '1 1 1 1'], { 0: 0, 1: 1 }),
  zoneNames: ['Kanion', 'Oaza'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm'), hero('Kora', 'f')],
  statements: [
    { type: 'on', cellType: 'bush', who: 1 },
    { type: 'nextTo', cellType: 'rock', who: 2 },
    { type: 'sees', cellType: 'safe', who: 2 },
    { type: 'westOf', who: 3, hero: 1 },
    { type: 'northOfSafe', who: 3 },
    { type: 'alarm', zone: 0 },
  ],
  // Safe (2,2); Bobo (2,3), Mira (4,4), Zyg (3,2), Kora (1,1)
  safe: 5,
  solution: [6, 15, 9, 0],
  thief: 0,
};

export const example2 = {
  version: 2,
  n: 5,
  cells: grid(['. . B . .', '. p . R .', 'C . . . b', '. . . . .', 'b . . B .'], T),
  zones: grid(['K K K L L', 'K K K L L', 'K K K L L', 'O O O L L', 'O O O O O'], { K: 0, L: 1, O: 2 }),
  zoneNames: ['Kanion', 'Las', 'Oaza'],
  heroes: [hero('Bobo', 'm'), hero('Mira', 'f'), hero('Zyg', 'm'), hero('Kora', 'f'), hero('Rufi', 'm')],
  statements: [
    { type: 'inZone', zone: 0, who: 0 },
    { type: 'sees', cellType: 'barrel', who: 0 },
    { type: 'nextTo', cellType: 'crate', who: 1 },
    { type: 'northOf', who: 3, hero: 0 },
    { type: 'southOf', who: 3, hero: 2 },
    { type: 'row', n: 4, who: 4 },
    { type: 'drone', side: 'S', index: 3, n: 0 },
  ],
  // Safe (4,3); Bobo (3,3), Mira (2,1), Zyg (1,4), Kora (2,5), Rufi (4,2)
  safe: 17,
  solution: [12, 5, 3, 9, 16],
  thief: 4,
  bareSolutions: 569640,
};
