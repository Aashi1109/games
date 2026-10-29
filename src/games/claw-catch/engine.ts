export interface Fish {
  id: string;
  name: string;
  title: string;
  points: number;
  color: string;
  accent: string;
  length: string;
}
export interface Progress {
  best: number;
  collection: Record<string, number>;
}
export interface Trip {
  phase: 'ready' | 'shore' | 'casting' | 'reeling' | 'decision' | 'ended';
  paused: boolean;
  casts: number;
  banked: number;
  basket: { id: string; points: number }[];
  collection: Record<string, number>;
  best: number;
  landed: number;
  lost: number;
  marker: number;
  target: number;
  castTime: number;
  fish: Fish | null;
  quality: number;
  tension: number;
  distance: number;
  reelTime: number;
  slack: number;
  held: boolean;
  surge: boolean;
  rng: () => number;
  revision: number;
  message: string;
}
export const FISH: Fish[] = [
  {
    id: 'medaka',
    name: 'Little Medaka',
    title: 'A small beginning',
    points: 60,
    color: '#c5a266',
    accent: '#ead7a0',
    length: '4 cm',
  },
  {
    id: 'goldfish',
    name: 'Amber Goldfish',
    title: 'A pocket of sunshine',
    points: 90,
    color: '#d98c45',
    accent: '#f2c27b',
    length: '12 cm',
  },
  {
    id: 'perch',
    name: 'Moss Perch',
    title: 'Keeper of the reeds',
    points: 120,
    color: '#7b9270',
    accent: '#bdc4a3',
    length: '19 cm',
  },
  {
    id: 'koi',
    name: 'Painted Koi',
    title: 'A little living painting',
    points: 160,
    color: '#ede7cb',
    accent: '#c16b52',
    length: '26 cm',
  },
  {
    id: 'catfish',
    name: 'River Whisker',
    title: 'A familiar kind of face',
    points: 210,
    color: '#708990',
    accent: '#b6c6c0',
    length: '34 cm',
  },
  {
    id: 'moonfish',
    name: 'Moon Carp',
    title: 'The pond’s quiet secret',
    points: 280,
    color: '#c4b579',
    accent: '#f1e5b3',
    length: '42 cm',
  },
];
export function safeProgress(value: unknown): Progress {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const best =
    typeof source.best === 'number' &&
    Number.isFinite(source.best) &&
    source.best >= 0
      ? Math.floor(source.best)
      : 0;
  const collection: Record<string, number> = {};
  const storedCollection =
    source.collection && typeof source.collection === 'object'
      ? (source.collection as Record<string, unknown>)
      : {};
  for (const fish of FISH) {
    const n = storedCollection[fish.id];
    collection[fish.id] =
      typeof n === 'number' && Number.isFinite(n) && n > 0
        ? Math.min(1000000, Math.floor(n))
        : 0;
  }
  return { best, collection };
}
export function createTrip(progress: unknown = {}, rng = Math.random): Trip {
  const saved = safeProgress(progress);
  return {
    phase: 'ready',
    paused: false,
    casts: 8,
    banked: 0,
    basket: [],
    collection: { ...saved.collection },
    best: saved.best,
    landed: 0,
    lost: 0,
    marker: 0,
    target: 0.68,
    castTime: 0,
    fish: null,
    quality: 0,
    tension: 0.26,
    distance: 0,
    reelTime: 0,
    slack: 0,
    held: false,
    surge: false,
    rng,
    revision: 0,
    message: 'A quiet pond. Eight casts. Something lovely beneath the surface.',
  };
}
export function startTrip(s: Trip) {
  if (s.phase !== 'ready') return false;
  s.phase = 'shore';
  s.message =
    'Cast your line. Tap again when the marker reaches the green water.';
  s.revision++;
  return true;
}
export function pauseTrip(s: Trip) {
  if (s.phase === 'ready' || s.phase === 'ended') return false;
  s.paused = !s.paused;
  s.held = false;
  s.revision++;
  return true;
}
export function castLine(s: Trip) {
  if (s.paused || s.phase !== 'shore' || s.casts <= 0) return false;
  s.casts--;
  s.phase = 'casting';
  s.castTime = 0;
  s.marker = 0;
  s.fish = null;
  s.held = false;
  s.message = 'Watch the marker. Set the hook in the green zone.';
  s.revision++;
  return true;
}
function endIfSpent(s: Trip) {
  if (s.casts === 0) {
    s.phase = 'ended';
    s.best = Math.max(s.best, s.banked);
  } else s.phase = 'shore';
}
function lose(s: Trip, reason: string) {
  const lost = s.basket.length;
  s.basket = [];
  s.lost++;
  s.held = false;
  s.message = `${reason}${lost ? ` Your ${lost} unbanked ${lost === 1 ? 'catch slipped' : 'catches slipped'} back into the pond.` : ' Breathe. There is always another ripple.'}`;
  endIfSpent(s);
  s.revision++;
}
export function hookFish(s: Trip) {
  if (s.paused || s.phase !== 'casting') return false;
  s.quality = Math.max(0, 1 - Math.abs(s.marker - s.target) / 0.29);
  if (s.quality < 0.25) {
    lose(s, 'The nibble got away.');
    return false;
  }
  const index = Math.min(
    FISH.length - 1,
    Math.floor(s.quality * 3.5) + Math.floor(s.rng() * 3),
  );
  s.fish = FISH[index];
  s.phase = 'reeling';
  s.tension = 0.26;
  s.distance = 0;
  s.reelTime = 0;
  s.slack = 0;
  s.held = false;
  s.surge = false;
  s.message =
    'A bite! Hold to reel. Let go before the tension reaches the top.';
  s.revision++;
  return true;
}
export function setReeling(s: Trip, held: boolean) {
  s.held = !s.paused && s.phase === 'reeling' && Boolean(held);
}
export function bankBasket(s: Trip) {
  if (s.paused || !['decision', 'shore'].includes(s.phase) || !s.basket.length)
    return false;
  const points = s.basket.reduce((sum, catchItem) => sum + catchItem.points, 0),
    count = s.basket.length;
  for (const catchItem of s.basket)
    s.collection[catchItem.id] = Math.min(
      1000000,
      s.collection[catchItem.id] + 1,
    );
  s.banked += points;
  s.basket = [];
  s.best = Math.max(s.best, s.banked);
  s.message = `${count} ${count === 1 ? 'catch' : 'catches'} safely in your journal. +${points} points.`;
  endIfSpent(s);
  s.revision++;
  return true;
}
export function riskBasket(s: Trip) {
  if (s.paused || s.phase !== 'decision' || s.casts <= 0) return false;
  s.phase = 'shore';
  s.message = `Basket carried forward. Next catch earns ×${(1 + s.basket.length * 0.25).toFixed(2)}. A miss or broken line loses the basket.`;
  s.revision++;
  return true;
}
export function advanceTrip(s: Trip, dt: number) {
  if (s.paused || !Number.isFinite(dt) || dt <= 0) return;
  if (s.phase === 'casting') {
    s.castTime += dt;
    const cycle = (s.castTime * 0.82) % 2;
    s.marker = cycle <= 1 ? cycle : 2 - cycle;
    if (s.castTime >= 8) lose(s, 'The ripple faded before you set the hook.');
  } else if (s.phase === 'reeling' && s.fish) {
    s.reelTime += dt;
    s.surge = Math.sin(s.reelTime * 2.1 + FISH.indexOf(s.fish)) > 0.45;
    s.tension = Math.max(
      0,
      s.tension +
        dt *
          (s.held
            ? 0.27 + (s.surge ? 0.21 : 0) + s.basket.length * 0.018
            : -0.38),
    );
    s.distance = Math.max(
      0,
      s.distance + dt * (s.held ? 0.19 - (s.surge ? 0.065 : 0) : -0.026),
    );
    s.slack = s.tension < 0.08 ? s.slack + dt : Math.max(0, s.slack - dt);
    if (s.tension >= 1) {
      lose(s, 'Snap! A little too much tension.');
      return;
    }
    if (s.slack >= 2.6 || s.reelTime >= 26) {
      lose(s, 'The fish found its way off the hook.');
      return;
    }
    if (s.distance >= 1) {
      const points = Math.round(
        (s.fish.points + s.quality * 30) * (1 + s.basket.length * 0.25),
      );
      s.basket.push({ id: s.fish.id, points });
      s.landed++;
      s.distance = 1;
      s.held = false;
      s.phase = 'decision';
      s.message = `${s.fish.name}, landed. ${s.fish.title}. Bank your basket or risk it for a bigger catch.`;
      s.revision++;
      if (s.casts === 0) bankBasket(s);
    }
  }
}
