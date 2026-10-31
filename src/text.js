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
    case 'eastOf': return `${g('Stałem', 'Stałam')} gdzieś ${DIRECTION[st.type]} od ${other.gen}.`;
    case 'alone': return g('Byłem sam w swojej strefie.', 'Byłam sama w swojej strefie.');
    case 'zoneCount': return `W mojej strefie było nas ${st.n}.`;
    case 'sameZone': return `${g('Byłem', 'Byłam')} w tej samej strefie co ${other.name}.`;
    case 'otherZone': return `Nie ${g('byłem', 'byłam')} w tej samej strefie co ${other.name}.`;
  }
  throw new Error(`unknown statement: ${st.type}`);
}

// ---------- step and hint wording (src/steps.js) ----------
export const cellName = (puzzle, cell) => `${Math.floor(cell / puzzle.n) + 1},${(cell % puzzle.n) + 1}`;

const few = n => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const fields = n => (n === 1 ? 'pole' : few(n) ? 'pola' : 'pól');
const leftCount = n => `${few(n) ? 'zostały' : 'zostało'} ${n} ${fields(n)}`;

function cellList(puzzle, cells) {
  const names = cells.map(c => cellName(puzzle, c));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join('; ')} i ${names[names.length - 1]}`;
}

function effectText(puzzle, e) {
  const name = puzzle.heroes[e.hero].name;
  if (e.left.length === 1) return `${name} może stać tylko na polu ${cellName(puzzle, e.left[0])}`;
  if (e.removed.length <= 4) return `${name} nie stoi na ${e.removed.length === 1 ? 'polu' : 'polach'} ${cellList(puzzle, e.removed)}`;
  return `${name}: ${e.left.length <= 4 ? `zostają pola ${cellList(puzzle, e.left)}` : leftCount(e.left.length)}`;
}

function contradictionText(puzzle, reason, assumed) {
  const hero = h => puzzle.heroes[h];
  const g = (h, m, f) => (hero(h).gender === 'f' ? f : m);
  switch (reason.type) {
    case 'empty':
      // The assumption knocked out its own cell: phrase it as a clash instead of "X would have nowhere to stand".
      if (reason.hero === assumed) return 'zasady i zeznania by się wykluczały';
      return `${hero(reason.hero).name} nie ${g(reason.hero, 'miałby', 'miałaby')} gdzie stanąć`;
    case 'noThief': return 'nikt nie mógłby stać przy sejfie';
    case 'twoThieves': return 'przy sejfie stałyby dwie osoby';
    case 'drone': return `nagranie drona ${reason.drone} by się nie zgadzało`;
    case 'rules': return 'ktoś kogoś by widział';
    case 'statement': {
      const st = puzzle.statements[reason.statement];
      return st.type === 'drone' ? 'nagranie drona by się nie zgadzało' : `zeznanie ${hero(st.who).gen} byłoby fałszywe`;
    }
  }
  throw new Error(`unknown contradiction: ${reason.type}`);
}

// One logged step of the step solver as a Polish sentence „reason → conclusion” (used by hints).
export function stepText(puzzle, step) {
  const hero = h => puzzle.heroes[h];
  const f = h => hero(h).gender === 'f';
  const quote = i => `Zeznanie ${hero(puzzle.statements[i].who).gen}: „${statementText(puzzle, puzzle.statements[i])}”`;
  const effects = step.effects.map(e => effectText(puzzle, e)).join('; ');
  const h = step.hero;
  let why;
  switch (step.tech) {
    case 'statements': {
      const { left } = step.effects[0];
      return `Zeznania ${hero(h).gen} → ${left.length <= 4 ? `${left.length === 1 ? 'możliwe pole' : 'możliwe pola'}: ${cellList(puzzle, left)}` : leftCount(left.length)}.`;
    }
    case 'fixed': {
      const his = f(h) ? 'jej' : 'jego';
      why = `${hero(h).name} stoi na polu ${cellName(puzzle, step.cell)}, więc nikt inny nie stoi w ${his} linii wzroku`;
      if (step.safe) why += ' ani przy sejfie';
      if (step.alone) why += `${step.safe ? ',' : ''} ani w ${his} strefie`;
      if (step.aloneOthers.length) why += ` (a kto był sam w swojej strefie, nie stoi w ${his} strefie)`;
      break;
    }
    case 'thief':
      why = step.kind === 'only'
        ? `Tylko ${hero(h).name} może stać przy sejfie, więc to ${f(h) ? 'ona' : 'on'} jest złodziejem`
        : `${hero(h).name} na pewno stoi przy sejfie, więc nikt inny tam nie stoi`;
      break;
    case 'drone':
      why = step.kind === 'empty' ? `Dron ${step.drone} nikogo nie nagrał, więc w jego linii nikt nie stoi`
        : step.kind === 'only' ? `Dron ${step.drone} nagrał jedną osobę, a może to być tylko ${hero(h).name}`
          : `${hero(h).name} na pewno jest w linii drona ${step.drone}, a dron nagrał tylko jedną osobę`;
      break;
    case 'pair':
      why = quote(step.statement);
      break;
    case 'zone':
      why = quote(step.statement) + (step.kind === 'subject' ? '' : ` (strefa ${puzzle.zoneNames[step.zone]})`);
      break;
    case 'sight':
      why = `Z tych pól ${hero(h).name} ${f(h) ? 'widziałaby' : 'widziałby'} każde możliwe miejsce ${hero(step.other).gen}`;
      break;
    case 'trial':
      why = `Gdyby ${hero(h).name} ${f(h) ? 'stała' : 'stał'} na polu ${cellName(puzzle, step.cell)}, ${contradictionText(puzzle, step.reason, h)}`;
      break;
    default:
      throw new Error(`unknown step: ${step.tech}`);
  }
  return `${why} → ${effects}.`;
}
