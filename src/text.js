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
const ACCUSATIVE = { crate: 'skrzynię', barrel: 'beczkę', rock: 'skałę' };
const DIRECTION = { northOf: 'na północ', southOf: 'na południe', westOf: 'na zachód', eastOf: 'na wschód' };

export function statementText(puzzle, st) {
  if (st.type === 'alarm') return `Alarm: sejf stał w strefie ${puzzle.zoneNames[st.zone]}.`;
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
    case 'northOfSafe':
    case 'southOfSafe':
    case 'westOfSafe':
    case 'eastOfSafe': return `${g('Stałem', 'Stałam')} gdzieś ${DIRECTION[st.type.slice(0, -4)]} od sejfu.`;
    case 'sameZoneSafe': return `${g('Byłem', 'Byłam')} w strefie, w której stał sejf.`;
    case 'otherZoneSafe': return `Nie ${g('byłem', 'byłam')} w strefie, w której stał sejf.`;
  }
  throw new Error(`unknown statement: ${st.type}`);
}

// Drone hint report (RULES.md §7, src/steps.js `nextDrone`).
export function droneText(puzzle, report) {
  const line = `${report.index + 1}. ${report.axis === 'row' ? 'rzędem' : 'kolumną'}`;
  return report.hero < 0
    ? `Dron nad ${line} nikogo nie nagrał — tam stał sejf.`
    : `Dron nad ${line} nagrał: ${puzzle.heroes[report.hero].name}.`;
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

const nameList = names => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} i ${names[names.length - 1]}`);

// Variable index k (after the heroes) is the safe (src/steps.js).
const isSafe = (puzzle, h) => h === puzzle.heroes.length;
const pieceName = (puzzle, h) => (isSafe(puzzle, h) ? 'sejf' : puzzle.heroes[h].name);
const pieceGen = (puzzle, h) => (isSafe(puzzle, h) ? 'sejfu' : puzzle.heroes[h].gen);
const isFemale = (puzzle, h) => !isSafe(puzzle, h) && puzzle.heroes[h].gender === 'f';
const lineName = (axis, i) => `${i + 1}. ${axis === 'row' ? 'rzędzie' : 'kolumnie'}`;

function effectText(puzzle, e) {
  const safe = isSafe(puzzle, e.hero);
  const name = pieceName(puzzle, e.hero);
  const where = e.removed.length === 1 ? 'polu' : 'polach';
  if (e.left.length === 1) return safe ? `sejf mógł stać tylko na polu ${cellName(puzzle, e.left[0])}` : `${name} może stać tylko na polu ${cellName(puzzle, e.left[0])}`;
  if (e.removed.length <= 4) return safe ? `sejf nie stał na ${where} ${cellList(puzzle, e.removed)}` : `${name} nie stoi na ${where} ${cellList(puzzle, e.removed)}`;
  return `${name}: ${e.left.length <= 4 ? `zostają pola ${cellList(puzzle, e.left)}` : leftCount(e.left.length)}`;
}

const capital = s => s[0].toUpperCase() + s.slice(1);

function contradictionText(puzzle, reason, assumed) {
  switch (reason.type) {
    case 'empty':
      // The assumption knocked out its own cell: phrase it as a clash instead of "X would have nowhere to stand".
      if (reason.hero === assumed) return 'zasady i zeznania by się wykluczały';
      if (isSafe(puzzle, reason.hero)) return 'sejf nie miałby gdzie stać';
      return `${pieceName(puzzle, reason.hero)} nie ${isFemale(puzzle, reason.hero) ? 'miałaby' : 'miałby'} gdzie stanąć`;
    case 'noThief': return 'nikt nie stałby po skosie przy sejfie';
    case 'twoThieves': return 'po skosie przy sejfie stałyby dwie osoby';
    case 'line': return `w ${lineName(reason.axis, reason.index)} nie stałby nikt ani sejf`;
    case 'subset': return `zabrakłoby ${reason.axis === 'row' ? 'rzędów' : 'kolumn'} dla: ${nameList(reason.heroes.map(h => pieceName(puzzle, h)))}`;
    case 'rules': return 'ktoś stałby w jednej linii z kimś';
    case 'statement': {
      const st = puzzle.statements[reason.statement];
      if (st.type === 'alarm') return 'alarm by się nie zgadzał';
      return `zeznanie ${puzzle.heroes[st.who].gen} byłoby fałszywe`;
    }
  }
  throw new Error(`unknown contradiction: ${reason.type}`);
}

// One logged step of the step solver as a Polish sentence „reason → conclusion” (used by hints).
export function stepText(puzzle, step) {
  const hero = h => puzzle.heroes[h];
  const quote = i => {
    const st = puzzle.statements[i];
    const text = `„${statementText(puzzle, st)}”`;
    return st.who === undefined ? text : `Zeznanie ${hero(st.who).gen}: ${text}`;
  };
  // Cell lists use '; ', so separate effects as sentences.
  const effects = step.effects.map(e => capital(effectText(puzzle, e))).join('. ');
  const h = step.hero;
  let why;
  switch (step.tech) {
    case 'statements': {
      const { left } = step.effects[0];
      const options = left.length <= 4 ? `${left.length === 1 ? 'możliwe pole' : 'możliwe pola'}: ${cellList(puzzle, left)}` : leftCount(left.length);
      return isSafe(puzzle, h) ? `Alarm → sejf: ${options}.` : `Zeznania ${hero(h).gen} → ${options}.`;
    }
    case 'fixed': {
      if (isSafe(puzzle, h)) {
        why = `Sejf stał na polu ${cellName(puzzle, step.cell)}, więc w jego rzędzie i kolumnie nikt nie stał`;
        break;
      }
      const his = isFemale(puzzle, h) ? 'jej' : 'jego';
      why = `${hero(h).name} stoi na polu ${cellName(puzzle, step.cell)}, więc w ${his} rzędzie i kolumnie nie stoi nikt inny ani sejf`;
      if (step.alone) why += `, a w ${his} strefie nikt inny`;
      if (step.aloneOthers.length) why += ` (a kto był sam w swojej strefie, nie stoi w ${his} strefie)`;
      break;
    }
    case 'line':
      why = `W każdym rzędzie i każdej kolumnie stoi ktoś albo sejf, a w ${lineName(step.axis, step.index)} może już ${isSafe(puzzle, h) ? 'stać tylko sejf' : `stanąć tylko ${hero(h).name}`}`;
      break;
    case 'thief':
      why = step.kind === 'only'
        ? `Tylko ${hero(h).name} może stać po skosie przy sejfie, więc to ${isFemale(puzzle, h) ? 'ona' : 'on'} jest złodziejem`
        : step.kind === 'sure' ? `${hero(h).name} na pewno stoi po skosie przy sejfie, więc nikt inny tam nie stoi`
          : 'Po skosie przy sejfie, w jego strefie, stała dokładnie jedna osoba (złodziej); gdyby sejf stał na tych polach, nie byłoby tam nikogo albo byłyby dwie osoby, albo ktoś nie miałby gdzie stanąć';
      break;
    case 'pair':
      why = quote(step.statement);
      break;
    case 'zone':
      why = quote(step.statement) + (step.kind === 'subject' ? '' : ` (strefa ${puzzle.zoneNames[step.zone]})`);
      break;
    case 'block':
      why = `Z tych pól ${pieceName(puzzle, h)} ${isFemale(puzzle, h) ? 'zajęłaby' : 'zająłby'} rząd albo kolumnę każdego możliwego miejsca ${pieceGen(puzzle, step.other)}`;
      break;
    case 'subset': {
      const lines = step.lines.map(i => i + 1).join(step.lines.length === 2 ? ' i ' : ', ');
      why = `${capital(nameList(step.heroes.map(g => pieceName(puzzle, g))))} mogą stać tylko w ${step.axis === 'row' ? 'rzędach' : 'kolumnach'} ${lines}, więc nikt inny tam nie stoi`;
      break;
    }
    case 'trial':
      why = `Gdyby ${pieceName(puzzle, h)} ${isFemale(puzzle, h) ? 'stała' : 'stał'} na polu ${cellName(puzzle, step.cell)}, ${contradictionText(puzzle, step.reason, h)}`;
      break;
    default:
      throw new Error(`unknown step: ${step.tech}`);
  }
  return `${why} → ${effects}.`;
}
