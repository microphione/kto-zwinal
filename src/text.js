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

// D1, D2, … in statement order (RULES.md §5.2), as on the board.
const droneLabel = (puzzle, st) => `D${puzzle.statements.filter(s => s.type === 'drone').indexOf(st) + 1}`;

export function statementText(puzzle, st) {
  if (st.type === 'drone') {
    return st.n === 0 ? `Dron ${droneLabel(puzzle, st)} nikogo nie nagrał.` : `Dron ${droneLabel(puzzle, st)} nagrał jednego bohatera.`;
  }
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

// ---------- step and hint wording (src/steps.js) ----------
export const cellName = (puzzle, cell) => `${Math.floor(cell / puzzle.n) + 1},${(cell % puzzle.n) + 1}`;

const few = n => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
const fields = n => (n === 1 ? 'pole' : few(n) ? 'pola' : 'pól');
const leftCount = n => `${few(n) ? 'zostały' : 'zostało'} ${n} ${fields(n)}`;

function cellList(puzzle, cells) {
  const names = cells.map(c => cellName(puzzle, c));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join('; ')} i ${names[names.length - 1]}`;
}

// Variable index k (after the heroes) is the hidden safe (src/steps.js).
const isSafe = (puzzle, h) => h === puzzle.heroes.length;

function effectText(puzzle, e) {
  const safe = isSafe(puzzle, e.hero);
  const name = safe ? 'sejf' : puzzle.heroes[e.hero].name;
  const where = e.removed.length === 1 ? 'polu' : 'polach';
  if (e.left.length === 1) return safe ? `sejf mógł stać tylko na polu ${cellName(puzzle, e.left[0])}` : `${name} może stać tylko na polu ${cellName(puzzle, e.left[0])}`;
  if (e.removed.length <= 4) return safe ? `sejf nie stał na ${where} ${cellList(puzzle, e.removed)}` : `${name} nie stoi na ${where} ${cellList(puzzle, e.removed)}`;
  return `${name}: ${e.left.length <= 4 ? `zostają pola ${cellList(puzzle, e.left)}` : leftCount(e.left.length)}`;
}

const capital = s => s[0].toUpperCase() + s.slice(1);

function contradictionText(puzzle, reason, assumed) {
  const hero = h => puzzle.heroes[h];
  const g = (h, m, f) => (hero(h).gender === 'f' ? f : m);
  switch (reason.type) {
    case 'empty':
      // The assumption knocked out its own cell: phrase it as a clash instead of "X would have nowhere to stand".
      if (reason.hero === assumed) return 'zasady i zeznania by się wykluczały';
      if (isSafe(puzzle, reason.hero)) return 'sejf nie miałby gdzie stać';
      return `${hero(reason.hero).name} nie ${g(reason.hero, 'miałby', 'miałaby')} gdzie stanąć`;
    case 'noThief': return 'nikt nie mógłby stać przy sejfie';
    case 'twoThieves': return 'przy sejfie stałyby dwie osoby';
    case 'drone': return `nagranie drona ${reason.drone} by się nie zgadzało`;
    case 'rules': return 'ktoś kogoś by widział';
    case 'statement': {
      const st = puzzle.statements[reason.statement];
      if (st.type === 'drone') return 'nagranie drona by się nie zgadzało';
      if (st.type === 'alarm') return 'alarm by się nie zgadzał';
      return `zeznanie ${hero(st.who).gen} byłoby fałszywe`;
    }
  }
  throw new Error(`unknown contradiction: ${reason.type}`);
}

// One logged step of the step solver as a Polish sentence „reason → conclusion” (used by hints).
export function stepText(puzzle, step) {
  const hero = h => puzzle.heroes[h];
  const f = h => hero(h).gender === 'f';
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
        why = `Sejf stał na polu ${cellName(puzzle, step.cell)}, więc nikt tam nie stał`;
        break;
      }
      // Only the safe lost a cell: the hero's own cell.
      if (step.effects.every(e => isSafe(puzzle, e.hero))) {
        why = `${hero(h).name} stoi na polu ${cellName(puzzle, step.cell)}`;
        break;
      }
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
        : step.kind === 'sure' ? `${hero(h).name} na pewno stoi przy sejfie, więc nikt inny tam nie stoi`
          : 'Przy sejfie stała dokładnie jedna osoba (złodziej), a tam nie mógłby stać nikt albo musiałyby stać dwie osoby';
      break;
    case 'drone':
      why = step.kind === 'empty' ? `Dron ${step.drone} nikogo nie nagrał, więc w jego linii nikt nie stoi`
        : step.kind === 'only' ? `Dron ${step.drone} nagrał jedną osobę, a może to być tylko ${hero(h).name}`
          : step.kind === 'sure' ? `${hero(h).name} na pewno jest w linii drona ${step.drone}, a dron nagrał tylko jedną osobę`
            : `Sejf przerywa linię drona ${step.drone}, a tam nagranie by się nie zgadzało`;
      break;
    case 'hiding':
      why = step.between
        ? `${hero(h).name} i ${hero(step.other).name} stoją w jednej linii, więc sejf musiał ich zasłaniać`
        : `${hero(h).name} i ${hero(step.other).name} nie mogli się widzieć ani oboje stać przy sejfie`;
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
      why = `Gdyby ${isSafe(puzzle, h) ? 'sejf' : hero(h).name} ${!isSafe(puzzle, h) && f(h) ? 'stała' : 'stał'} na polu ${cellName(puzzle, step.cell)}, ${contradictionText(puzzle, step.reason, h)}`;
      break;
    default:
      throw new Error(`unknown step: ${step.tech}`);
  }
  return `${why} → ${effects}.`;
}
