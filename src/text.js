// Polish wording of statements (RULES.md §5 table).
export const HERO_ROSTER = [
  { name: 'Bobo', gen: 'Bobo', gender: 'm' },
  { name: 'Mira', gen: 'Miry', gender: 'f' },
  { name: 'Zyg', gen: 'Zyga', gender: 'm' },
  { name: 'Kora', gen: 'Kory', gender: 'f' },
  { name: 'Rufi', gen: 'Rufiego', gender: 'm' },
  { name: 'Tesa', gen: 'Tesy', gender: 'f' },
  { name: 'Grot', gen: 'Grota', gender: 'm' },
  { name: 'Lumi', gen: 'Lumi', gender: 'f' },
];

export const ZONE_NAMES = ['Kanion', 'Oaza', 'Las', 'Ruiny', 'Plaża', 'Kopalnia', 'Baza', 'Wulkan'];

const ON = { ground: 'na gołej ziemi', bush: 'w krzakach', pad: 'na wyrzutni' };
const GENITIVE = { crate: 'skrzyni', barrel: 'beczki', rock: 'skały' };
const ACCUSATIVE = { crate: 'skrzynię', barrel: 'beczkę', rock: 'skałę', safe: 'sejf' };
const DIRECTION = { northOf: 'na północ', southOf: 'na południe', westOf: 'na zachód', eastOf: 'na wschód' };

export const droneLabel = st => `D${st.side}${st.index}`;

export function statementText(puzzle, st) {
  if (st.type === 'drone') {
    return st.n === 0 ? `Dron ${droneLabel(st)} nikogo nie nagrał.` : `Dron ${droneLabel(st)} nagrał jednego bohatera.`;
  }
  const f = puzzle.heroes[st.who].gender === 'f';
  const g = (m, fem) => (f ? fem : m);
  const other = st.hero !== undefined ? puzzle.heroes[st.hero] : null;
  switch (st.type) {
    case 'inZone': return `${g('Byłem', 'Byłam')} w strefie ${puzzle.zoneNames[st.zone]}.`;
    case 'notInZone': return `Nie ${g('byłem', 'byłam')} w strefie ${puzzle.zoneNames[st.zone]}.`;
    case 'on': return `${g('Stałem', 'Stałam')} ${ON[st.cellType]}.`;
    case 'nextTo': return `${g('Stałem', 'Stałam')} obok ${GENITIVE[st.cellType]}.`;
    case 'notNextTo': return `Nie ${g('stałem', 'stałam')} obok ${GENITIVE[st.cellType]}.`;
    case 'sees': return `${g('Widziałem', 'Widziałam')} ${ACCUSATIVE[st.cellType]}.`;
    case 'row': return `${g('Byłem', 'Byłam')} w ${st.n}. rzędzie.`;
    case 'col': return `${g('Byłem', 'Byłam')} w ${st.n}. kolumnie.`;
    case 'northOf':
    case 'southOf':
    case 'westOf':
    case 'eastOf': return `${g('Stałem', 'Stałam')} ${DIRECTION[st.type]} od ${other.gen}.`;
    case 'alone': return g('Byłem sam w swojej strefie.', 'Byłam sama w swojej strefie.');
    case 'zoneCount': return `W mojej strefie było nas ${st.n}.`;
    case 'sameZone': return `${g('Byłem', 'Byłam')} w tej samej strefie co ${other.name}.`;
    case 'otherZone': return `Nie ${g('byłem', 'byłam')} w tej samej strefie co ${other.name}.`;
  }
  throw new Error(`unknown statement: ${st.type}`);
}
