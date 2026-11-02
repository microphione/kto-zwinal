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

// Settings of a case (RULES.md §1): zone catalogue with the prepositional phrase of each zone, the items a
// zone favours (generator bias, not a rule) and the zone noun of the population wordings.
const ROOM = {
  Salon: ['w salonie', 'armchair', 'rug'], Kuchnia: ['w kuchni', 'table'], Sypialnia: ['w sypialni', 'bed', 'wardrobe'],
  Łazienka: ['w łazience', 'plant'], Weranda: ['na werandzie', 'armchair', 'plant'], Strych: ['na strychu', 'wardrobe'],
  Hol: ['w holu', 'plant', 'rug'], Jadalnia: ['w jadalni', 'table'], Biblioteka: ['w bibliotece', 'armchair', 'wardrobe'],
  Gabinet: ['w gabinecie', 'table', 'armchair'], Izba: ['w izbie', 'table', 'rug'], Spiżarnia: ['w spiżarni', 'wardrobe'],
  Sień: ['w sieni', 'rug'], Przedpokój: ['w przedpokoju', 'wardrobe', 'rug'], 'Pokój dziecięcy': ['w pokoju dziecięcym', 'bed', 'rug'],
  Pracownia: ['w pracowni', 'table'],
};
const AREA = {
  Ogród: ['w ogrodzie', 'bush', 'bench'], Pomost: ['na pomoście', 'pond', 'bench'], Taras: ['na tarasie', 'bench'],
  Las: ['w lesie', 'tree', 'bush'], Polana: ['na polanie', 'bush'], Sad: ['w sadzie', 'tree'], Łąka: ['na łące', 'bush'],
  'Plac zabaw': ['na placu zabaw', 'bench'], Altana: ['w altanie', 'bench'], 'Ogród różany': ['w ogrodzie różanym', 'bush'],
  Staw: ['nad stawem', 'pond'],
};
const HOUSE_WORDS = { noun: 'pomieszczeniu', own: 'w swoim pomieszczeniu', ours: 'W moim pomieszczeniu', same: 'w tym samym pomieszczeniu' };
// A house with a garden (terrace, forest…): a room word would not fit someone standing outdoors.
const ESTATE_WORDS = { noun: 'części posesji', own: 'w swojej części posesji', ours: 'W mojej części posesji', same: 'w tej samej części posesji' };
export const SETTINGS = {
  domek: { title: 'Domek letniskowy', rooms: ['Salon', 'Kuchnia', 'Sypialnia', 'Łazienka', 'Weranda', 'Strych'], areas: ['Ogród', 'Pomost'] },
  willa: { title: 'Willa', rooms: ['Hol', 'Salon', 'Jadalnia', 'Biblioteka', 'Gabinet', 'Sypialnia', 'Kuchnia'], areas: ['Taras', 'Ogród'] },
  chatka: { title: 'Leśna chatka', rooms: ['Izba', 'Kuchnia', 'Sypialnia', 'Spiżarnia', 'Strych', 'Sień'], areas: ['Las', 'Polana'] },
  kamienica: { title: 'Mieszkanie w kamienicy', rooms: ['Przedpokój', 'Salon', 'Kuchnia', 'Sypialnia', 'Łazienka', 'Gabinet', 'Pokój dziecięcy', 'Pracownia'], areas: [] },
  park: {
    title: 'Park miejski', rooms: [], areas: ['Las', 'Polana', 'Sad', 'Łąka', 'Plac zabaw', 'Altana', 'Ogród różany', 'Staw'],
    words: { noun: 'części parku', own: 'w swojej części parku', ours: 'W mojej części parku', same: 'w tej samej części parku' },
  },
};
// Zone name → [phrase, ...favoured items].
export const ZONES = { ...ROOM, ...AREA };
const zonePhrase = (puzzle, z) => ZONES[puzzle.zoneNames[z]][0];
export const areaWords = puzzle => SETTINGS[puzzle.setting]?.words ?? (puzzle.zoneKinds.includes('out') ? ESTATE_WORDS : HOUSE_WORDS);

// Wording per cell type (RULES.md §5): verb (1st person m / f, 3rd person m), phrase after it, genitive after „obok”.
const STAND = ['Stałem', 'Stałam', 'stał'], LIE = ['Leżałem', 'Leżałam', 'leżał'], SIT = ['Siedziałem', 'Siedziałam', 'siedział'];
export const TYPE_TEXT = {
  floor: { verb: STAND, on: 'na gołej podłodze', name: 'Podłoga' },
  grass: { verb: STAND, on: 'na trawie', name: 'Trawa' },
  bed: { verb: LIE, on: 'na łóżku', gen: 'łóżka', name: 'Łóżko' },
  armchair: { verb: SIT, on: 'na fotelu', gen: 'fotela', name: 'Fotel' },
  rug: { verb: STAND, on: 'na dywanie', gen: 'dywanu', name: 'Dywan' },
  bush: { verb: STAND, on: 'w krzakach', gen: 'krzaków', name: 'Krzaki' },
  bench: { verb: SIT, on: 'na ławce', gen: 'ławki', name: 'Ławka' },
  table: { gen: 'stołu', name: 'Stół' },
  wardrobe: { gen: 'szafy', name: 'Szafa' },
  plant: { gen: 'kwiatka', name: 'Kwiatek' },
  tree: { gen: 'drzewa', name: 'Drzewo' },
  rock: { gen: 'skały', name: 'Skała' },
  pond: { gen: 'stawu', name: 'Staw' },
};
const DIRECTION = { northOf: 'na północ', southOf: 'na południe', westOf: 'na zachód', eastOf: 'na wschód' };
const lower = w => w[0].toLowerCase() + w.slice(1);

export function statementText(puzzle, st) {
  const tt = TYPE_TEXT[st.cellType];
  if (st.type === 'nobodyOn') return `Nikt nie ${tt.verb[2]} ${tt.on}.`;
  const f = puzzle.heroes[st.who].gender === 'f';
  const g = (m, fem) => (f ? fem : m);
  const verb = tt?.verb && g(tt.verb[0], tt.verb[1]);
  const other = st.hero !== undefined ? puzzle.heroes[st.hero] : null;
  const words = areaWords(puzzle);
  switch (st.type) {
    case 'inZone': return `${g('Byłem', 'Byłam')} ${zonePhrase(puzzle, st.zone)}.`;
    case 'notInZone': return `Nie ${g('byłem', 'byłam')} ${zonePhrase(puzzle, st.zone)}.`;
    case 'aloneIn': return `${g('Jako jedyny byłem', 'Jako jedyna byłam')} ${zonePhrase(puzzle, st.zone)}.`;
    case 'on': return `${verb} ${tt.on}.`;
    case 'notOn': return `Nie ${lower(verb)} ${tt.on}.`;
    case 'onlyOn': return `${g('Jako jedyny', 'Jako jedyna')} ${lower(verb)} ${tt.on}.`;
    case 'nextTo': return `${g('Byłem', 'Byłam')} obok ${tt.gen}.`;
    case 'notNextTo': return `Nie ${g('byłem', 'byłam')} obok ${tt.gen}.`;
    case 'row': return `${g('Byłem', 'Byłam')} w ${st.n}. rzędzie.`;
    case 'col': return `${g('Byłem', 'Byłam')} w ${st.n}. kolumnie.`;
    case 'northOf':
    case 'southOf':
    case 'westOf':
    case 'eastOf': return `${g('Byłem', 'Byłam')} gdzieś ${DIRECTION[st.type]} od ${other.gen}.`;
    case 'alone': return `${g('Byłem sam', 'Byłam sama')} ${words.own}.`;
    case 'zoneCount': return `${words.ours} było nas ${st.n}.`;
    case 'sameZone': return `${g('Byłem', 'Byłam')} ${words.same} co ${other.name}.`;
    case 'otherZone': return `Nie ${g('byłem', 'byłam')} ${words.same} co ${other.name}.`;
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
      if (st.who === undefined) return `zeznanie „${statementText(puzzle, st)}” byłoby fałszywe`;
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
      return `Zeznania ${hero(h).gen} → ${options}.`;
    }
    case 'composite':
      why = quote(step.statement);
      break;
    case 'fixed': {
      if (isSafe(puzzle, h)) {
        why = `Sejf stał na polu ${cellName(puzzle, step.cell)}, więc w jego rzędzie i kolumnie nikt nie stał`;
        break;
      }
      const his = isFemale(puzzle, h) ? 'jej' : 'jego';
      why = `${hero(h).name} stoi na polu ${cellName(puzzle, step.cell)}, więc w ${his} rzędzie i kolumnie nie stoi nikt inny ani sejf`;
      const words = areaWords(puzzle);
      if (step.alone) why += `, a w ${his} ${words.noun} nikt inny`;
      if (step.aloneOthers.length) why += ` (a kto był sam ${words.own}, nie stoi w ${his} ${words.noun})`;
      break;
    }
    case 'line':
      why = `W każdym rzędzie i każdej kolumnie stoi ktoś albo sejf, a w ${lineName(step.axis, step.index)} może już ${isSafe(puzzle, h) ? 'stać tylko sejf' : `stanąć tylko ${hero(h).name}`}`;
      break;
    case 'thief':
      why = step.kind === 'only'
        ? `Tylko ${hero(h).name} może stać po skosie przy sejfie, więc to ${isFemale(puzzle, h) ? 'ona' : 'on'} jest złodziejem`
        : step.kind === 'sure' ? `${hero(h).name} na pewno stoi po skosie przy sejfie, więc nikt inny tam nie stoi`
          : `Po skosie przy sejfie, w jego ${areaWords(puzzle).noun}, stała dokładnie jedna osoba (złodziej); gdyby sejf stał na tych polach, nie byłoby tam nikogo albo byłyby dwie osoby, albo ktoś nie miałby gdzie stanąć`;
      break;
    case 'pair':
      why = quote(step.statement);
      break;
    case 'zone':
      why = quote(step.statement) + (step.kind === 'subject' ? '' : ` (${zonePhrase(puzzle, step.zone)})`);
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
