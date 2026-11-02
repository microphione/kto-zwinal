// RULES.md §8 (v4, houses and map clues) encoded in the puzzle JSON contract (RULES.md §9).
const grid = (rows, map) => rows.map(r => r.split(' ').map(x => map[x] ?? x));
const T = {
  '.': 'floor', b: 'bed', a: 'armchair', u: 'rug', T: 'table', W: 'wardrobe', P: 'plant',
  ',': 'grass', k: 'bush', l: 'bench', D: 'tree', R: 'rock', S: 'pond',
};
const hero = (name, gen, gender) => ({ name, gen, gender });

export const example1 = {
  version: 4,
  n: 4,
  setting: 'domek',
  cells: grid(['b . . W', '. P a .', '. u . .', 'T . . a'], T),
  zones: grid(['Y Y S S', 'Y Y S S', 'Y S S S', 'Y S S S'], { Y: 0, S: 1 }),
  zoneNames: ['Sypialnia', 'Salon'],
  zoneKinds: ['in', 'in'],
  heroes: [hero('Bobo', 'Bobo', 'm'), hero('Mira', 'Miry', 'f'), hero('Zyg', 'Zyga', 'm')],
  statements: [
    { type: 'onlyOn', cellType: 'armchair', who: 1 },
    { type: 'on', cellType: 'bed', who: 2 },
  ],
  // Bobo (4,2), Mira (2,3), Zyg (1,1); safe (3,4)
  safe: 11,
  solution: [13, 6, 0],
  thief: 1,
  bareSolutions: 78,
};

export const example2 = {
  version: 4,
  n: 5,
  setting: 'domek',
  cells: grid(['. . W , ,', 'T . . k ,', '. a . , D', 'b . . P l', '. . u . .'], T),
  zones: grid(['K K K O O', 'K K K O O', 'S S S O O', 'Y Y S S O', 'Y Y S S S'], { K: 0, O: 1, S: 2, Y: 3 }),
  zoneNames: ['Kuchnia', 'Ogród', 'Salon', 'Sypialnia'],
  zoneKinds: ['in', 'out', 'in', 'in'],
  heroes: [hero('Bobo', 'Bobo', 'm'), hero('Mira', 'Miry', 'f'), hero('Zyg', 'Zyga', 'm'), hero('Kora', 'Kory', 'f')],
  statements: [
    { type: 'onlyOn', cellType: 'bush', who: 0 },
    { type: 'nextTo', cellType: 'bed', who: 1 },
    { type: 'aloneIn', zone: 2, who: 3 },
    { type: 'on', cellType: 'armchair', who: 3 },
  ],
  // Bobo (2,4), Mira (5,1), Zyg (1,5), Kora (3,2); safe (4,3)
  safe: 17,
  solution: [8, 20, 4, 11],
  thief: 3,
  bareSolutions: 1392,
};
