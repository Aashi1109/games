export interface Solution {
  word: string;
  path: number[];
}
export interface Board {
  seed: string;
  letters: string[];
  solutions: Solution[];
}
export type Assessment =
  { ok: false; reason: string } | { ok: true; word: string; score: number };
// An intentionally finite, hand-curated common-English wordbook, shown in full
// inside the game. It is not advertised as a complete English dictionary.
export const WORDS = [
  ...new Set(
    `
ace aces ache aches acid acre acres act acts actor add adds age aged ages ago aid aids aim aims air airs aisle alarm ale alert alien alive all alley allow almost alone along also alter always amber amid amp and angel anger angle angry ant ants any ape apes apple apt arc arch are area areas arm arms art arts ash ashes aside ask asks ate atom aunt auto autumn awake away axe axis
bad bag bags bake baked baker bakes bald bale ball balm band bank bar bare bark barn bars base basic basin bat bath bats bay bead beak beam bean beans bear bears beast beat beats bed beds bee beef been beer bees beet bell belt bend bent berry best bet bets better bib bid big bike bill bin bind bird birds bit bite bits bitter blade blame blank blast blaze bleed blend bless blew blind blink bliss block bloom blue blush boar boat boats body boil bold bolt bone bones book books boot bore born boss both bowl box boy brag brain bran brass brave bread break breeze brew brick bride brief bring broad broke brook brown brush bud buds bug bugs build built bulb bulbs bull bump bun burn burst bus bush busy but butter buy buzz
cab cage cake calm came camp can cane cap cape caps car card care cares cargo cars cart case cash cast cat cats cave cedar cell cent chain chair chalk charm chart chase chat cheap cheat check cheek cheer chest chick chief child chill chin chip chop chose city claim clam clap clash clasp class claw clay clean clear clerk cliff climb clip clock close cloth cloud clover coal coast coat code coil coin cold cone cook cool cop copper cord core cork corn cost cot couch could count court cove cow cows cozy crab crack craft crane crash crawl cream creep crew crib crisp crop cross crow crown crush cry cube cue cup cure curl cut cute cuts
dad daily dairy daisy dam damp dance dare dark dart dash data date dawn day days deal dear deer deep den desk dew dial dice did die dig dim dime dine dip dirt dish dive dock doe does dog dogs doll dome done door dot dots dove down dozen drag drain draw dream drew dried drift drill drink drip drive drop dry duck due dug dull dune dusk dust duty dye
each eagle ear ears earn earth ease east easy eat eaten eats edge eel egg eggs eight elder elf elm else end ends enter entry envy era erase eve even ever every eye eyes
face fact fade fair fairy fall fame fan far farm fast fat fate fault fawn fear feast feat fed fee feed feel feet fell felt fern few field fig file fill film fin find fine fire firm first fish fit five fix flag flame flap flash flat flaw flea fled flee fleet flesh flew flex flick flight flip float flock flood floor flora flour flow flower fly foam fog fold folk fond food fool foot for force fork form fort found four fox frame free fresh fret fried frog from frost fruit fry fuel full fun fur fuse
gale game gap garden gas gate gave gaze gear gel gem gems gentle get gift gig girl give glad glam glass gleam glide glow glue gnat goad goal goat goes gold golf gone good goose got gown grab grace grade grain grand grant grape graph grass grate gray great greed green grew grid grin grip grit groan grove grow grown grub guard guess guest guide guild gulf gum gun gush gust gut guy gym
had hail hair half hall halo ham hand hang hard hare harm harp has hat hatch hate haul have hay haze head heal heap hear heard heart heat hedge heel held hello help hem hen herb herd here hero hers hide high hike hill him hint hip hire his hive hoard hold hole home honey hook hop hope horn horse hose host hot hotel hour house how huge hum human hung hunt hush hut
ice icy idea idle ill imp inch ink inn input insect into iris iron island issue item its ivy
jam jar jaw jay jazz jet job jog join joke joy judge jug juice jump junk just
keen keep kept key kick kid kind king kiss kit kite knee knew knit knob knot know
lab lace lack lad lady laid lake lamb lamp land lane lap large last late later law lawn lay leaf lean leap learn lease least leave led left leg lend lens lent less let lets level liar lid lie life lift light like lime line link lion lip list lit little live load loaf loan lock log lone long look loom loop loose loot lord lore lose loss lost lot loud love low luck lump lung lure lush lust lute
made mail main make male mall man mane many map maple mark marsh mask mass mast mat mate math may maze mead meal mean meat meet melt men mend menu mere mess met metal mice mid mild mile milk mill mind mine mint mist mix moan moat mob mode moist mole mom monk mood moon moor more moss most moth move much mud mug mule muse mush must mute my
nail name nap near neat neck need nest net new next nice niece night nine nod node noise none noon nor north nose note noun now nut nuts
oak oar oat oats obey odd ode off offer oil old olive omen omit once one ones only onto open opera opt oral orb ore other otter our ours out outer oval oven over owe owl own owner
pace pack pad page paid pail pain paint pair pale palm pan pane pant paper par park part pass past pat patch path paw pay pea peace peach peak pear peas pebble peck peel peer pen pet petal pew pie pier pig pile pill pilot pin pine pink pint pipe pit place plain plan plane plant plate play plea plot plow pluck plum plus poem poet point poke pole pond pool poor pop pore port pose post pot pound pour pout power press price pride prime print prize probe proof prose proud prune pry pull pulp pulse pump pun pure push put
quail queen quest quick quiet quilt quite quiz quote
race rack rag rage raid rail rain raise rake ram ramp ran rang range rank rap rare rat rate rats raw ray read real reap rear reed reef reel rest rib rice rich rid ride ridge right rim rind ring ripe rise risk road roam roar robe rock rod rode role roll roof room root rope rose rosy rot round row rub ruby rude rug rule run rune rush rust rut
sad safe sage said sail sake sale salt same sand sang sap sat save saw say scale scan scar scare scene scent school scoop scope score sea seal seam search seat seed seek seem seen self sell send sent serve set seven sew shade shall shame shape share shark sharp shave shed sheep sheer sheet shelf shell shine ship shirt shock shoe shop shore short shot show shred shrub shy sick side sigh sign silk sill simple sin since sing sink sip sir sit site six size ski skill skin skip sky slab slam slap slate slave sled sleep slice slide slim slip slit slow slug sly small smart smile smoke smooth snap snow snug soap soar sock sod soft soil sold sole some son song soon soot sore sort soul sound soup sour sow spa space span spare spark speak spear speed spell spend spent spice spill spin spine spite split spoil spoke spoon sport spot spray spread spring sprout spun spur spy stack stage stain stair stake stale stalk stamp stand star stare start state stay stead steam steel stem step stern stew stick still sting stir stock stole stone stood stool stop store storm story stove strap straw stray stream street strip strong stuck study stump stun style such sugar suit sum sun sung sure surf surge swan swap sway sweet swift swim swing swirl syrup
tab table tack tag tail take tale talk tall tame tan tap tape tar task taste tea teach team tear tease tell ten tend tent term test than thank that the their them then there these thick thin thing think third this thorn those thread three threw thrift thrill throat throw thumb thus tick tide tie tiger tight tile till tilt time tin tiny tip tire toad toast toe toes toil told toll tone too took tool top tore torn toss total touch tour tow town toy trace track trade trail train trap tray tree trend trial tribe trick tried trim trip troll troop trot true trunk trust try tub tuck tune turn twig twin twist two type
udder ugly undo union unit unite until unto up upon upper upset urban urge use used user uses usual utter
vague vain vale valley van vary vase vast veil vein vent verb verse very vest vet via view vine violet visa visit vivid voice vote vow
wade wage wait wake walk wall wand want war ward warm warn warp was wash waste watch water wave wax way weak wear web weed week weep well went were west wet whale what wheat wheel when where which while whim whip white who whole whom whose why wick wide wife wild will wilt win wind wine wing wink wipe wire wise wish wit with woke wolf womb won wood wool word wore work worm worn worry worse worst worth would wound wrap wreck wren wrist write wrong wrote
yard yarn yawn year yell yes yet yew yield you young your youth
zebra zero zest zinc zip zone zoom
`
      .trim()
      .split(/\s+/),
  ),
]
  .filter((word) => word.length >= 3)
  .sort();

const DICTIONARY = new Set(WORDS);
const PREFIXES = new Set(
  WORDS.flatMap((word) =>
    Array.from({ length: word.length }, (_, index) => word.slice(0, index + 1)),
  ),
);

export function randomFrom(seed: string | number) {
  let state = 2166136261;
  for (const char of String(seed))
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function adjacent(a: number, b: number, size = 4) {
  return (
    a !== b &&
    Math.abs((a % size) - (b % size)) <= 1 &&
    Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1
  );
}

export function validPath(path: number[], size = 4) {
  return (
    path.length > 0 &&
    path.every(
      (index, position) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < size * size &&
        path.indexOf(index) === position &&
        (position === 0 || adjacent(path[position - 1], index, size)),
    )
  );
}

export function extendPath(path: number[], index: number, size = 4) {
  if (!Number.isInteger(index) || index < 0 || index >= size * size)
    return null;
  if (!path.length) return [index];
  if (path.at(-1) === index) return [...path];
  if (path.at(-2) === index) return path.slice(0, -1);
  if (path.includes(index) || !adjacent(path.at(-1)!, index, size)) return null;
  return [...path, index];
}

export function findWords(letters: string[]) {
  const size = Math.sqrt(letters.length);
  if (!Number.isInteger(size)) return [];
  const found = new Map<string, number[]>();
  const visit = (index: number, text: string, path: number[], used: number) => {
    const word = text + letters[index].toLowerCase();
    if (!PREFIXES.has(word)) return;
    const next = [...path, index];
    if (DICTIONARY.has(word) && !found.has(word)) found.set(word, next);
    for (let neighbor = 0; neighbor < letters.length; neighbor += 1) {
      if (
        !(used & (1 << neighbor)) &&
        neighbor !== index &&
        adjacent(index, neighbor, size)
      )
        visit(neighbor, word, next, used | (1 << index));
    }
  };
  letters.forEach((_, index) => visit(index, '', [], 0));
  return [...found]
    .map(([word, path]) => ({ word, path }))
    .sort(
      (a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word),
    );
}

export function makeBoard(seed: string | number) {
  const random = randomFrom(seed);
  const pool =
    'AAAAAAAEEEEEEEEEEEIIIIIOOOOOUUUBBCCDDDDFFGGHHHLLLLLMMMNNNNNNPPPRRRRRRSSSSSSSTTTTTTTTVWWY';
  let best = {
    letters: [...'CATSREANLIDOTEGS'],
    solutions: findWords([...'CATSREANLIDOTEGS']),
  };
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const letters = Array.from(
      { length: 16 },
      () => pool[Math.floor(random() * pool.length)],
    );
    const solutions = findWords(letters);
    if (solutions.length > best.solutions.length) best = { letters, solutions };
    if (
      solutions.length >= 24 &&
      solutions.filter((item) => item.word.length >= 5).length >= 3
    )
      return { seed: String(seed), letters, solutions };
  }
  return { seed: String(seed), ...best };
}

export function wordScore(word: string) {
  return word.length < 3
    ? 0
    : word.length <= 4
      ? word.length - 2
      : word.length * 2 - 5;
}

export function assessWord(
  board: Board,
  path: number[],
  found: Set<string> = new Set(),
): Assessment {
  if (!validPath(path))
    return {
      ok: false,
      reason: 'Link neighboring letters without using a tile twice.',
    };
  const word = path
    .map((index) => board.letters[index])
    .join('')
    .toLowerCase();
  if (word.length < 3)
    return {
      ok: false,
      reason: 'Let it grow a little: words need at least 3 letters.',
    };
  if (found.has(word))
    return { ok: false, reason: 'Already gathered. Try another little path.' };
  if (!DICTIONARY.has(word))
    return {
      ok: false,
      reason: 'Not in this edition’s curated wordbook. Try another word.',
    };
  return { ok: true, word, score: wordScore(word) };
}
