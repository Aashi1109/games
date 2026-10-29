export type TowerType = 'pea' | 'acorn' | 'dew';
export type BugType = 'ant' | 'runner' | 'beetle' | 'snail';
export interface Point {
  x: number;
  y: number;
}
export interface TowerDefinition {
  name: string;
  short: string;
  cost: number;
  damage: number;
  rate: number;
  range: number;
  color: string;
  description: string;
  splash?: number;
  slow?: number;
}
export interface Tower {
  id: number;
  plot: number;
  type: TowerType;
  level: number;
  invested: number;
  cooldown: number;
  angle: number;
}
export interface Enemy extends Point {
  id: number;
  type: BugType;
  hp: number;
  maxHp: number;
  distance: number;
  angle: number;
  speed: number;
  slowTimer: number;
  slowFactor: number;
}
export interface Projectile extends Point {
  target: number;
  type: TowerType;
  damage: number;
  splash: number;
  speed: number;
}
export interface Effect extends Point {
  type: TowerType;
  age: number;
  radius: number;
}
export interface GameState {
  phase: 'planning' | 'wave' | 'lost' | 'won';
  wave: number;
  sun: number;
  hearts: number;
  kills: number;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  effects: Effect[];
  queue: BugType[];
  spawnTimer: number;
  nextId: number;
  time: number;
}
export const isTowerType = (type: string): type is TowerType =>
  Object.hasOwn(TOWERS, type);
export const WIDTH = 800;
export const HEIGHT = 560;
export const PATH = [
  [-30, 130],
  [210, 130],
  [210, 370],
  [470, 370],
  [470, 210],
  [710, 210],
  [710, 500],
  [830, 500],
];
export const PLOTS = [
  { x: 105, y: 230, name: 'A · Burrow bend' },
  { x: 305, y: 225, name: 'B · Clover corner' },
  { x: 320, y: 460, name: 'C · South meadow' },
  { x: 390, y: 280, name: 'D · Middle patch' },
  { x: 575, y: 120, name: 'E · Orchard rise' },
  { x: 595, y: 315, name: 'F · Fern hollow' },
  { x: 600, y: 455, name: 'G · Garden gate' },
  { x: 765, y: 350, name: 'H · Last lookout' },
  { x: 110, y: 48, name: 'I · Morning hedge' },
];
export const TOWERS: Record<TowerType, TowerDefinition> = {
  pea: {
    name: 'Peashooter',
    short: 'Quick & precise',
    cost: 60,
    damage: 14,
    rate: 0.6,
    range: 138,
    color: '#4f8f4d',
    description: 'Fast single-target shots. A dependable first defender.',
  },
  acorn: {
    name: 'Acorn Mortar',
    short: 'A little crowd control',
    cost: 95,
    damage: 28,
    rate: 1.7,
    range: 165,
    splash: 58,
    color: '#b27740',
    description: 'Heavy acorns burst on impact, hitting bugs nearby.',
  },
  dew: {
    name: 'Dew Sprinkler',
    short: 'Slow their little feet',
    cost: 75,
    damage: 5,
    rate: 1.1,
    range: 133,
    slow: 0.48,
    color: '#558caf',
    description: 'Slows its target and nearby bugs for two seconds.',
  },
};
export const BUGS = {
  ant: { name: 'Ant', hp: 24, speed: 56, bounty: 9, leak: 1, color: '#ad684f' },
  runner: {
    name: 'Skipper',
    hp: 19,
    speed: 88,
    bounty: 10,
    leak: 1,
    color: '#609294',
  },
  beetle: {
    name: 'Beetle',
    hp: 72,
    speed: 36,
    bounty: 18,
    leak: 2,
    color: '#78617f',
  },
  snail: {
    name: 'Grand Snail',
    hp: 380,
    speed: 27,
    bounty: 90,
    leak: 5,
    color: '#b98549',
  },
};
export const WAVE_NAMES = [
  'An ant picnic',
  'Uninvited guests',
  'The quick little ones',
  'Beetles at the gate',
  'A very busy afternoon',
  'One last big bustle',
  'The grand garden parade',
];
export const MAX_WAVES = WAVE_NAMES.length;
const segments = PATH.slice(1).map((point, index) =>
  Math.hypot(point[0] - PATH[index][0], point[1] - PATH[index][1]),
);
export const PATH_LENGTH = segments.reduce((sum, length) => sum + length, 0);

export function pointOnPath(distance: number): Point & { angle: number } {
  let remaining = Math.max(0, Math.min(PATH_LENGTH, distance));
  for (let index = 0; index < segments.length; index += 1) {
    if (remaining <= segments[index] || index === segments.length - 1) {
      const a = PATH[index],
        b = PATH[index + 1],
        ratio = remaining / segments[index];
      return {
        x: a[0] + (b[0] - a[0]) * ratio,
        y: a[1] + (b[1] - a[1]) * ratio,
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    remaining -= segments[index];
  }
  throw new Error('The garden path requires at least two points.');
}

export function createGame(): GameState {
  return {
    phase: 'planning',
    wave: 0,
    sun: 150,
    hearts: 12,
    kills: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    effects: [],
    queue: [],
    spawnTimer: 0,
    nextId: 1,
    time: 0,
  };
}

export function towerStats(tower: Tower) {
  const base = TOWERS[tower.type];
  return {
    ...base,
    damage: Math.round(base.damage * (1 + (tower.level - 1) * 0.65)),
    range: base.range + (tower.level - 1) * 17,
    rate: base.rate * 0.88 ** (tower.level - 1),
    splash: base.splash ? base.splash + (tower.level - 1) * 7 : 0,
  };
}

export function upgradeCost(tower: Tower) {
  return Math.round(
    TOWERS[tower.type].cost * (0.75 + (tower.level - 1) * 0.35),
  );
}
export function sellValue(tower: Tower) {
  return Math.floor(tower.invested * 0.7);
}
const canManage = (state: GameState) =>
  ['planning', 'wave'].includes(state.phase);

export function buildTower(state: GameState, plot: number, type: string) {
  if (!isTowerType(type)) return false;
  const base = TOWERS[type];
  if (
    !canManage(state) ||
    !Number.isInteger(plot) ||
    !PLOTS[plot] ||
    !base ||
    state.sun < base.cost ||
    state.towers.some((tower) => tower.plot === plot)
  )
    return false;
  state.sun -= base.cost;
  state.towers.push({
    id: state.nextId++,
    plot,
    type,
    level: 1,
    invested: base.cost,
    cooldown: 0,
    angle: 0,
  });
  return true;
}

export function upgradeTower(state: GameState, plot: number) {
  const tower = state.towers.find((item) => item.plot === plot);
  if (!canManage(state) || !tower || tower.level >= 3) return false;
  const cost = upgradeCost(tower);
  if (state.sun < cost) return false;
  state.sun -= cost;
  tower.invested += cost;
  tower.level += 1;
  return true;
}

export function sellTower(state: GameState, plot: number) {
  const index = state.towers.findIndex((item) => item.plot === plot);
  if (!canManage(state) || index < 0) return false;
  state.sun += sellValue(state.towers[index]);
  state.towers.splice(index, 1);
  return true;
}

export function waveRecipe(wave: number): BugType[] {
  if (!Number.isInteger(wave) || wave < 1 || wave > MAX_WAVES) return [];
  const count = [8, 11, 14, 15, 18, 21, 24][wave - 1];
  return Array.from({ length: count }, (_, index) => {
    if (wave === 7 && index === 9) return 'snail';
    if (wave >= 4 && index % 3 === 0) return 'beetle';
    if (wave >= 3 && index % 3 === 1) return 'runner';
    return 'ant';
  });
}

export function startWave(state: GameState) {
  if (state.phase !== 'planning' || state.wave >= MAX_WAVES) return false;
  state.wave += 1;
  state.queue = waveRecipe(state.wave);
  state.spawnTimer = 0.3;
  state.phase = 'wave';
  return true;
}

function hit(state: GameState, projectile: Projectile, target: Enemy) {
  const targets =
    projectile.type === 'acorn'
      ? state.enemies.filter(
          (enemy) =>
            enemy.hp > 0 &&
            Math.hypot(enemy.x - target.x, enemy.y - target.y) <=
              projectile.splash,
        )
      : [target];
  for (const enemy of targets) enemy.hp -= projectile.damage;
  if (projectile.type === 'dew') {
    for (const enemy of state.enemies) {
      if (
        enemy.hp > 0 &&
        Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 40
      ) {
        enemy.slowTimer = 2;
        enemy.slowFactor = 0.48;
      }
    }
  }
  state.effects.push({
    x: target.x,
    y: target.y,
    type: projectile.type,
    age: 0,
    radius: projectile.type === 'acorn' ? projectile.splash : 15,
  });
}

function frame(state: GameState, dt: number) {
  state.time += dt;
  state.spawnTimer -= dt;
  while (state.queue.length && state.spawnTimer <= 0) {
    const type = state.queue.shift()!;
    const base = BUGS[type];
    const hp = Math.round(base.hp * (1 + (state.wave - 1) * 0.23));
    state.enemies.push({
      id: state.nextId++,
      type,
      hp,
      maxHp: hp,
      distance: 0,
      ...pointOnPath(0),
      speed: base.speed * (1 + (state.wave - 1) * 0.035),
      slowTimer: 0,
      slowFactor: 1,
    });
    state.spawnTimer += Math.max(0.47, 1.1 - state.wave * 0.08);
  }
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    const speed = enemy.speed * (enemy.slowTimer > 0 ? enemy.slowFactor : 1);
    enemy.distance += speed * dt;
    Object.assign(enemy, pointOnPath(enemy.distance));
  }
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    const stats = towerStats(tower),
      point = PLOTS[tower.plot];
    const target = state.enemies
      .filter(
        (enemy) =>
          enemy.hp > 0 &&
          enemy.distance < PATH_LENGTH &&
          Math.hypot(point.x - enemy.x, point.y - enemy.y) <= stats.range,
      )
      .sort((a, b) => b.distance - a.distance)[0];
    if (target)
      tower.angle = Math.atan2(target.y - point.y, target.x - point.x);
    if (target && tower.cooldown <= 0) {
      state.projectiles.push({
        x: point.x,
        y: point.y,
        target: target.id,
        type: tower.type,
        damage: stats.damage,
        splash: stats.splash,
        speed: tower.type === 'acorn' ? 245 : 370,
      });
      tower.cooldown = stats.rate;
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => {
    const target = state.enemies.find(
      (enemy) =>
        enemy.id === projectile.target &&
        enemy.hp > 0 &&
        enemy.distance < PATH_LENGTH,
    );
    if (!target) return false;
    const dx = target.x - projectile.x,
      dy = target.y - projectile.y,
      distance = Math.hypot(dx, dy);
    if (distance <= projectile.speed * dt) {
      hit(state, projectile, target);
      return false;
    }
    projectile.x += (dx / distance) * projectile.speed * dt;
    projectile.y += (dy / distance) * projectile.speed * dt;
    return true;
  });
  state.enemies = state.enemies.filter((enemy) => {
    if (enemy.hp <= 0) {
      state.kills += 1;
      state.sun += BUGS[enemy.type].bounty;
      return false;
    }
    if (enemy.distance >= PATH_LENGTH) {
      state.hearts = Math.max(0, state.hearts - BUGS[enemy.type].leak);
      return false;
    }
    return true;
  });
  for (const effect of state.effects) effect.age += dt;
  state.effects = state.effects.filter((effect) => effect.age < 0.4);
  if (state.hearts <= 0) {
    state.phase = 'lost';
    state.queue = [];
    state.projectiles = [];
  } else if (!state.queue.length && !state.enemies.length) {
    state.sun += 30 + state.wave * 8;
    state.projectiles = [];
    state.effects = [];
    state.phase = state.wave === MAX_WAVES ? 'won' : 'planning';
  }
}

export function stepGame(state: GameState, seconds: number) {
  if (state.phase !== 'wave' || !Number.isFinite(seconds) || seconds <= 0)
    return state;
  let remaining = Math.min(seconds, 1);
  while (remaining > 0.000001 && state.phase === 'wave') {
    const dt = Math.min(0.05, remaining);
    frame(state, dt);
    remaining -= dt;
  }
  return state;
}

export function gameScore(state: GameState) {
  return (
    state.kills * 20 +
    state.wave * 150 +
    state.hearts * 60 +
    Math.floor(state.sun)
  );
}
