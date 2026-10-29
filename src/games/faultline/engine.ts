export type Difficulty = 'relaxed' | 'normal' | 'hard';
export type Phase = 'mining' | 'wave' | 'won' | 'lost';
export type TileType = 'air' | 'rock' | 'iron' | 'crystal' | 'gold' | 'bedrock';
export type UpgradeId = 'drill' | 'cargo' | 'turret' | 'armor' | 'repair';
export interface Point {
  x: number;
  y: number;
}
export interface Tile {
  type: TileType;
  hp: number;
  maxHp: number;
  variant: number;
}
export interface Ore {
  type: 'iron' | 'crystal' | 'gold';
  value: number;
}
export interface Enemy extends Point {
  id: number;
  type: 'crawler' | 'spitter' | 'brute';
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackTimer: number;
  side: number;
}
export interface Projectile extends Point {
  vx: number;
  vy: number;
  owner: 'player' | 'enemy';
  damage: number;
  life: number;
}
export interface GameEvent extends Point {
  type: string;
  value: number;
  text?: string;
}
export interface Player extends Point {
  facing: number;
  mode: 'mine' | 'turret';
  cargo: Ore[];
  capacity: number;
  speed: number;
  drilling: boolean;
  drillTarget: (Point & { col: number; row: number }) | null;
  drillDirX: number;
  drillDirY: number;
  recallCooldown: number;
}
export interface GameState {
  version: number;
  seed: number;
  rng: number;
  difficulty: Difficulty;
  base: Point & { hp: number; maxHp: number };
  player: Player;
  phase: Phase;
  wave: number;
  waveTimer: number;
  totalTime: number;
  credits: number;
  upgrades: Record<UpgradeId, number>;
  kills: number;
  oreMined: number;
  tiles: Tile[][];
  enemies: Enemy[];
  projectiles: Projectile[];
  events: GameEvent[];
  waveRemaining: number;
  spawnTimer: number;
  fireCooldown: number;
  nextId: number;
  turretAngle: number;
}
export interface GameInput {
  dx?: number;
  dy?: number;
  drill?: boolean;
  fire?: boolean;
  recall?: boolean;
  aimX?: number;
  aimY?: number;
}
interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  max: number;
  costs: number[];
}

// Faultline simulation. Coordinates are world pixels; map cells are 48px.
export const COLS = 40;
export const ROWS = 26;
export const SURFACE = 6;
export const TILE = 48;
export const BASE_X = 14;
export const TURRET_HEIGHT = 186;
const RADIUS = 15;
const ACTIVE = new Set(['mining', 'wave']);
const TILE_HP = {
  air: 0,
  rock: 1,
  iron: 1.4,
  crystal: 2,
  gold: 2.6,
  bedrock: 9999,
};
const ORE_VALUE: Partial<Record<TileType, number>> = {
  iron: 3,
  crystal: 6,
  gold: 10,
};
const DIFFICULTIES = {
  relaxed: { hp: 220, preparation: 80, respite: 60, enemy: 0.8 },
  normal: { hp: 170, preparation: 65, respite: 50, enemy: 1 },
  hard: { hp: 140, preparation: 50, respite: 40, enemy: 1.2 },
};

export const UPGRADE_DEFS: Upgrade[] = [
  {
    id: 'drill',
    name: 'Drill torque',
    description: 'Cut through rock and ore 55% faster per level.',
    max: 3,
    costs: [12, 24, 42],
  },
  {
    id: 'cargo',
    name: 'Cargo harness',
    description: 'Carry three more ore pieces per level.',
    max: 3,
    costs: [10, 20, 34],
  },
  {
    id: 'turret',
    name: 'Coil cannon',
    description: 'Increase cannon damage and firing speed.',
    max: 3,
    costs: [16, 30, 48],
  },
  {
    id: 'armor',
    name: 'Shelter plating',
    description: 'Add 35 maximum hull and restore 35 hull.',
    max: 3,
    costs: [14, 26, 40],
  },
  {
    id: 'repair',
    name: 'Hull repair',
    description: 'Restore 45 hull. Can be purchased repeatedly.',
    max: 999,
    costs: [12],
  },
];

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const integer = (n: unknown, lo: number, hi: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
const number = (n: unknown, lo: number, hi: number): n is number =>
  finite(n) && n >= lo && n <= hi;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const tile = (type: TileType, variant = 0): Tile => ({
  type,
  hp: TILE_HP[type],
  maxHp: TILE_HP[type],
  variant,
});
function random(state: GameState) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let n = state.rng;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

export function createGame({
  seed = 104729,
  difficulty = 'normal',
}: { seed?: number; difficulty?: Difficulty } = {}): GameState {
  if (!integer(seed, 0, 0xffffffff)) seed = 104729;
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) difficulty = 'normal';
  const settings = DIFFICULTIES[difficulty];
  const state: GameState = {
    version: 1,
    seed,
    rng: seed,
    difficulty,
    base: {
      x: BASE_X * TILE,
      y: SURFACE * TILE,
      hp: settings.hp,
      maxHp: settings.hp,
    },
    player: {
      x: (BASE_X + 0.5) * TILE,
      y: 8.5 * TILE,
      facing: 1,
      mode: 'mine',
      cargo: [],
      capacity: 6,
      speed: 185,
      drilling: false,
      drillTarget: null,
      drillDirX: 0,
      drillDirY: 1,
      recallCooldown: 0,
    },
    phase: 'mining',
    wave: 0,
    waveTimer: settings.preparation,
    totalTime: 0,
    credits: 8,
    upgrades: { drill: 0, cargo: 0, turret: 0, armor: 0, repair: 0 },
    kills: 0,
    oreMined: 0,
    tiles: [],
    enemies: [],
    projectiles: [],
    events: [],
    waveRemaining: 0,
    spawnTimer: 0,
    fireCooldown: 0,
    nextId: 1,
    turretAngle: -Math.PI / 4,
  };
  for (let row = 0; row < ROWS; row++) {
    const cells = [];
    for (let col = 0; col < COLS; col++) {
      const roll = random(state);
      let type: TileType = 'air';
      if (row >= SURFACE) {
        type = 'rock';
        if (row > SURFACE) {
          if (roll < 0.05) type = 'air';
          else if (roll < 0.23) type = 'iron';
          else if (roll < 0.3 && row > 10) type = 'crystal';
          else if (roll < 0.34 && row > 16) type = 'gold';
        }
        if (row === ROWS - 1 || col === 0 || col === COLS - 1) type = 'bedrock';
        if ((col === BASE_X || col === BASE_X + 1) && row <= 11) type = 'air';
      }
      cells.push(tile(type, Math.floor(random(state) * 4)));
    }
    state.tiles.push(cells);
  }
  // Reachable starter deposits make the opening useful on every seed.
  for (const [row, col, type] of [
    [8, 13, 'iron'],
    [9, 13, 'iron'],
    [10, 13, 'iron'],
    [8, 16, 'iron'],
    [9, 16, 'iron'],
    [10, 16, 'crystal'],
    [12, 14, 'iron'],
    [12, 15, 'iron'],
  ] as const) {
    state.tiles[row][col] = tile(type, (row + col) % 4);
  }
  return state;
}

function emit(
  state: GameState,
  type: string,
  x: number,
  y: number,
  value = 0,
  text?: string,
) {
  state.events.push({ type, x, y, value, ...(text ? { text } : {}) });
}

export function nearBase(state: GameState) {
  return (
    distance(state.player, state.base) < 2 * TILE &&
    state.player.y < (SURFACE + 0.7) * TILE
  );
}

function deposit(state: GameState) {
  if (!nearBase(state) || !state.player.cargo.length) return;
  const value = state.player.cargo.reduce((sum, ore) => sum + ore.value, 0);
  state.credits += value;
  state.player.cargo.length = 0;
  emit(
    state,
    'deposit',
    state.base.x,
    state.base.y - TILE,
    value,
    `+${value} salvage deposited`,
  );
}

export function interact(state: GameState) {
  if (!ACTIVE.has(state.phase) || !nearBase(state)) return false;
  deposit(state);
  const p = state.player;
  p.mode = p.mode === 'turret' ? 'mine' : 'turret';
  p.x = state.base.x + (p.mode === 'mine' ? 40 : 0);
  p.y = SURFACE * TILE - TILE / 2;
  p.drilling = false;
  p.drillTarget = null;
  emit(
    state,
    'interact',
    p.x,
    p.y,
    0,
    p.mode === 'turret' ? 'Cannon linked' : 'Cannon on autopilot',
  );
  return true;
}

export function buyUpgrade(state: GameState, id: string) {
  if (!ACTIVE.has(state.phase) || !nearBase(state)) return false;
  const def = UPGRADE_DEFS.find((upgrade) => upgrade.id === id);
  if (!def) return false;
  const level = state.upgrades[def.id];
  const cost = def.costs[Math.min(level, def.costs.length - 1)];
  if (
    level >= def.max ||
    state.credits < cost ||
    (id === 'repair' && state.base.hp >= state.base.maxHp)
  )
    return false;
  state.credits -= cost;
  state.upgrades[def.id]++;
  if (id === 'cargo') state.player.capacity += 3;
  if (id === 'armor') {
    state.base.maxHp += 35;
    state.base.hp += 35;
  }
  if (id === 'repair')
    state.base.hp = Math.min(state.base.maxHp, state.base.hp + 45);
  emit(state, 'upgrade', state.base.x, state.base.y - TILE, cost, def.name);
  return true;
}

function collides(state: GameState, x: number, y: number) {
  for (
    let row = Math.floor((y - RADIUS) / TILE);
    row <= Math.floor((y + RADIUS) / TILE);
    row++
  ) {
    for (
      let col = Math.floor((x - RADIUS) / TILE);
      col <= Math.floor((x + RADIUS) / TILE);
      col++
    ) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
      if (state.tiles[row][col].type === 'air') continue;
      const nx = clamp(x, col * TILE, (col + 1) * TILE);
      const ny = clamp(y, row * TILE, (row + 1) * TILE);
      if ((x - nx) ** 2 + (y - ny) ** 2 < RADIUS ** 2 - 0.01) return true;
    }
  }
  return false;
}

function move(state: GameState, dx: number, dy: number, dt: number) {
  const p = state.player;
  const magnitude = Math.hypot(dx, dy);
  if (!magnitude) return;
  if (magnitude > 1) {
    dx /= magnitude;
    dy /= magnitude;
  }
  p.drillDirX = dx;
  p.drillDirY = dy;
  if (dx) p.facing = dx < 0 ? -1 : 1;
  for (const [axis, amount] of [
    ['x', dx],
    ['y', dy],
  ] as const) {
    const start = p[axis];
    const end = clamp(
      start + amount * p.speed * dt,
      axis === 'x' ? RADIUS : SURFACE * TILE - TILE / 2,
      axis === 'x' ? COLS * TILE - RADIUS : ROWS * TILE - RADIUS,
    );
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 9; i++) {
      const t = (lo + hi) / 2;
      const pos = start + (end - start) * t;
      if (collides(state, axis === 'x' ? pos : p.x, axis === 'y' ? pos : p.y))
        hi = t;
      else lo = t;
    }
    p[axis] = start + (end - start) * lo;
  }
}

function drill(state: GameState, dt: number) {
  const p = state.player;
  const magnitude = Math.hypot(p.drillDirX, p.drillDirY) || 1;
  const dx = p.drillDirX / magnitude,
    dy = p.drillDirY / magnitude;
  for (const reach of [18, 25, 33, 41, 49]) {
    const col = Math.floor((p.x + dx * reach) / TILE);
    const row = Math.floor((p.y + dy * reach) / TILE);
    const cell = state.tiles[row]?.[col];
    if (!cell || cell.type === 'air') continue;
    if (cell.type === 'bedrock' || row <= SURFACE) return;
    const x = (col + 0.5) * TILE,
      y = (row + 0.5) * TILE;
    p.drillTarget = { col, row, x, y };
    if (ORE_VALUE[cell.type] && p.cargo.length >= p.capacity) {
      emit(state, 'full', x, y, 0, 'Cargo full — return to the shelter');
      return;
    }
    p.drilling = true;
    cell.hp = Math.max(
      0,
      cell.hp - dt * 1.8 * (1 + state.upgrades.drill * 0.55),
    );
    if (cell.hp === 0) {
      if (ORE_VALUE[cell.type]) {
        p.cargo.push({
          type: cell.type as Ore['type'],
          value: ORE_VALUE[cell.type]!,
        });
        state.oreMined++;
      }
      emit(state, 'mine', x, y, ORE_VALUE[cell.type] || 0, cell.type);
      state.tiles[row][col] = tile('air', cell.variant);
    }
    return;
  }
}

function startWave(state: GameState) {
  state.phase = 'wave';
  state.wave++;
  state.waveTimer = 0;
  state.waveRemaining = [0, 6, 9, 12, 16][state.wave];
  state.spawnTimer = 0;
  emit(
    state,
    'wave',
    state.base.x,
    state.base.y - 100,
    state.wave,
    `Wave ${state.wave} incoming`,
  );
}

function spawnEnemy(state: GameState) {
  const count = [0, 6, 9, 12, 16][state.wave];
  const index = count - state.waveRemaining;
  const type =
    state.wave === 4 && index === 0
      ? 'brute'
      : state.wave >= 2 && index % 3 === 2
        ? 'spitter'
        : 'crawler';
  const stats = {
    crawler: {
      hp: [0, 29, 38, 130, 200][state.wave],
      speed: state.wave >= 3 ? 56 : 34 + state.wave * 3,
      damage: 7,
    },
    spitter: {
      hp: [0, 39, 49, 160, 230][state.wave],
      speed: state.wave >= 3 ? 42 : 29,
      damage: 9,
    },
    brute: { hp: 950, speed: 35, damage: 17 },
  }[type];
  const side = index % 2 === 0 ? -1 : 1;
  const hp = Math.round(stats.hp * DIFFICULTIES[state.difficulty].enemy);
  state.enemies.push({
    id: state.nextId++,
    type,
    x: side < 0 ? -35 : COLS * TILE + 35,
    y: SURFACE * TILE - (type === 'brute' ? 35 : 20),
    hp,
    maxHp: hp,
    speed: stats.speed,
    damage: stats.damage * DIFFICULTIES[state.difficulty].enemy,
    attackTimer: 0.5 + random(state) * 0.6,
    side,
  });
  state.waveRemaining--;
  state.spawnTimer += state.wave === 4 ? 1.35 : 2.1;
}

function shoot(state: GameState, target: Point, manual: boolean) {
  const x = state.base.x,
    y = state.base.y - TURRET_HEIGHT;
  const angle = Math.atan2(target.y - y, target.x - x);
  state.turretAngle = angle;
  state.projectiles.push({
    x,
    y,
    vx: Math.cos(angle) * 780,
    vy: Math.sin(angle) * 780,
    owner: 'player',
    damage: 12 + state.upgrades.turret * 5,
    life: 2.8,
  });
  // Retain this frame's timer overrun so low frame rates do not weaken the gun.
  state.fireCooldown +=
    (manual ? 0.3 : 1.15) / (1 + state.upgrades.turret * 0.16);
  emit(state, 'shoot', x, y, manual ? 1 : 0);
}

function updateCombat(state: GameState, input: GameInput, dt: number) {
  state.fireCooldown = Math.max(-dt, state.fireCooldown - dt);
  if (state.phase === 'wave' && state.waveRemaining > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) spawnEnemy(state);
  }
  let target: Enemy | null = null;
  for (const enemy of state.enemies) {
    if (
      !target ||
      Math.abs(enemy.x - state.base.x) < Math.abs(target.x - state.base.x)
    )
      target = enemy;
  }
  const manual = state.player.mode === 'turret';
  const aimed =
    number(input.aimX, -TILE, (COLS + 1) * TILE) &&
    number(input.aimY, 0, ROWS * TILE);
  if (manual && aimed)
    state.turretAngle = Math.atan2(
      input.aimY! - (state.base.y - TURRET_HEIGHT),
      input.aimX! - state.base.x,
    );
  if (state.fireCooldown <= 0) {
    if (manual && input.fire)
      shoot(
        state,
        aimed
          ? { x: input.aimX!, y: input.aimY! }
          : target || { x: state.base.x + 400, y: state.base.y - 30 },
        true,
      );
    else if (!manual && target && Math.abs(target.x - state.base.x) < 620)
      shoot(state, target, false);
  }
  state.fireCooldown = Math.max(0, state.fireCooldown);
  for (const enemy of state.enemies) {
    const reach =
      enemy.type === 'spitter' ? 235 : enemy.type === 'brute' ? 65 : 47;
    if (Math.abs(enemy.x - state.base.x) > reach)
      enemy.x += Math.sign(state.base.x - enemy.x) * enemy.speed * dt;
    else {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer += enemy.type === 'spitter' ? 2.4 : 1.5;
        if (enemy.type === 'spitter') {
          const angle = Math.atan2(
            state.base.y - 38 - enemy.y,
            state.base.x - enemy.x,
          );
          state.projectiles.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * 250,
            vy: Math.sin(angle) * 250,
            owner: 'enemy',
            damage: enemy.damage,
            life: 3,
          });
        } else {
          state.base.hp = Math.max(0, state.base.hp - enemy.damage);
          emit(
            state,
            'base-hit',
            state.base.x,
            state.base.y - 30,
            enemy.damage,
          );
        }
      }
    }
  }
  for (const shot of state.projectiles) {
    const oldX = shot.x,
      oldY = shot.y;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    const segmentDistance = (x: number, y: number) => {
      const vx = shot.x - oldX,
        vy = shot.y - oldY;
      const t = clamp(
        ((x - oldX) * vx + (y - oldY) * vy) / (vx * vx + vy * vy || 1),
        0,
        1,
      );
      return Math.hypot(x - oldX - t * vx, y - oldY - t * vy);
    };
    if (shot.owner === 'player') {
      for (const enemy of state.enemies) {
        if (
          enemy.hp > 0 &&
          segmentDistance(enemy.x, enemy.y) < (enemy.type === 'brute' ? 37 : 23)
        ) {
          enemy.hp = Math.max(0, enemy.hp - shot.damage);
          shot.life = 0;
          emit(state, 'hit', enemy.x, enemy.y, shot.damage);
          if (enemy.hp === 0) {
            state.kills++;
            state.credits += enemy.type === 'brute' ? 8 : 0;
            emit(
              state,
              'kill',
              enemy.x,
              enemy.y,
              enemy.type === 'brute' ? 8 : 0,
              enemy.type,
            );
          }
          break;
        }
      }
    } else if (segmentDistance(state.base.x, state.base.y - 38) < 43) {
      state.base.hp = Math.max(0, state.base.hp - shot.damage);
      shot.life = 0;
      emit(state, 'base-hit', state.base.x, state.base.y - 30, shot.damage);
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  state.projectiles = state.projectiles.filter(
    (shot) =>
      shot.life > 0 &&
      shot.x > -100 &&
      shot.x < COLS * TILE + 100 &&
      shot.y > -100 &&
      shot.y < ROWS * TILE,
  );
}

export function step(state: GameState, input: GameInput = {}, dt = 0) {
  state.events = [];
  if (!ACTIVE.has(state.phase) || !finite(dt) || dt <= 0) return state;
  dt = Math.min(dt, 0.1);
  if (!object(input)) input = {};
  state.totalTime += dt;
  const p = state.player;
  p.drilling = false;
  p.drillTarget = null;
  p.recallCooldown = Math.max(0, p.recallCooldown - dt);
  if (input.recall && p.recallCooldown === 0) {
    p.x = state.base.x + 24;
    p.y = SURFACE * TILE - TILE / 2;
    p.mode = 'mine';
    p.recallCooldown = 25;
    emit(state, 'recall', p.x, p.y, 0, 'Recall complete');
  }
  if (p.mode === 'mine') {
    const dx = finite(input.dx) ? clamp(input.dx, -1, 1) : 0;
    const dy = finite(input.dy) ? clamp(input.dy, -1, 1) : 0;
    move(state, dx, dy, dt);
    if (input.drill) drill(state, dt);
  }
  deposit(state);
  if (state.phase === 'mining') {
    state.waveTimer = Math.max(0, state.waveTimer - dt);
    if (state.waveTimer === 0) startWave(state);
  }
  updateCombat(state, input, dt);
  if (state.base.hp === 0) {
    state.phase = 'lost';
    emit(state, 'lost', state.base.x, state.base.y, state.wave, 'Shelter lost');
  } else if (
    state.phase === 'wave' &&
    state.waveRemaining === 0 &&
    state.enemies.length === 0
  ) {
    state.projectiles = [];
    if (state.wave === 4) {
      state.phase = 'won';
      emit(
        state,
        'won',
        state.base.x,
        state.base.y,
        state.kills,
        'Extraction secured',
      );
    } else {
      state.phase = 'mining';
      state.waveTimer = DIFFICULTIES[state.difficulty].respite;
      state.credits += 5;
      emit(
        state,
        'wave-clear',
        state.base.x,
        state.base.y - 90,
        5,
        'Wave cleared · +5 salvage',
      );
    }
  }
  return state;
}

export function serialize(state: GameState) {
  return JSON.stringify(state);
}

// Saves are untrusted input. Validate every persisted collection and reconstruct
// the public schema so unexpected properties never enter the running simulation.
export function restore(source: unknown): GameState | null {
  if (typeof source !== 'string' || source.length > 500000) return null;
  let s: GameState;
  try {
    s = JSON.parse(source, (key, value) => {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor')
        throw new Error('Unsafe save key');
      return value;
    });
  } catch {
    return null;
  }
  if (
    !object(s) ||
    s.version !== 1 ||
    !integer(s.seed, 0, 0xffffffff) ||
    !integer(s.rng, 0, 0xffffffff) ||
    !Object.hasOwn(DIFFICULTIES, s.difficulty) ||
    !['mining', 'wave', 'won', 'lost'].includes(s.phase) ||
    !integer(s.wave, 0, 4) ||
    !number(s.waveTimer, 0, 100) ||
    !number(s.totalTime, 0, 1e8) ||
    !integer(s.credits, 0, 1e7) ||
    !integer(s.kills, 0, 10000) ||
    !integer(s.oreMined, 0, COLS * ROWS) ||
    !integer(s.waveRemaining, 0, 16) ||
    !number(s.spawnTimer, -0.1, 3) ||
    !number(s.fireCooldown, 0, 2) ||
    !integer(s.nextId, 1, 100000) ||
    !number(s.turretAngle, -Math.PI, Math.PI) ||
    !object(s.base) ||
    !object(s.player) ||
    !object(s.upgrades)
  )
    return null;
  if (
    (s.phase === 'wave' && s.wave === 0) ||
    (s.phase === 'mining' && s.wave === 4) ||
    (s.phase === 'won' && s.wave !== 4)
  )
    return null;
  for (const def of UPGRADE_DEFS)
    if (!integer(s.upgrades[def.id], 0, def.max)) return null;
  const maxHp = DIFFICULTIES[s.difficulty].hp + s.upgrades.armor * 35;
  if (
    s.base.x !== BASE_X * TILE ||
    s.base.y !== SURFACE * TILE ||
    s.base.maxHp !== maxHp ||
    !number(s.base.hp, 0, maxHp) ||
    (s.phase === 'lost') !== (s.base.hp === 0)
  )
    return null;
  const p = s.player;
  if (
    !number(p.x, RADIUS, COLS * TILE - RADIUS) ||
    !number(p.y, SURFACE * TILE - TILE / 2, ROWS * TILE - RADIUS) ||
    ![-1, 1].includes(p.facing) ||
    !['mine', 'turret'].includes(p.mode) ||
    p.capacity !== 6 + s.upgrades.cargo * 3 ||
    p.speed !== 185 ||
    !number(p.recallCooldown, 0, 25) ||
    !number(p.drillDirX, -1, 1) ||
    !number(p.drillDirY, -1, 1) ||
    !Array.isArray(p.cargo) ||
    p.cargo.length > p.capacity
  )
    return null;
  for (const ore of p.cargo)
    if (
      !object(ore) ||
      !Object.hasOwn(ORE_VALUE, ore.type) ||
      ore.value !== ORE_VALUE[ore.type]
    )
      return null;
  if (!Array.isArray(s.tiles) || s.tiles.length !== ROWS) return null;
  for (let row = 0; row < ROWS; row++) {
    if (!Array.isArray(s.tiles[row]) || s.tiles[row].length !== COLS)
      return null;
    for (let col = 0; col < COLS; col++) {
      const cell = s.tiles[row][col];
      if (
        !object(cell) ||
        !Object.hasOwn(TILE_HP, cell.type) ||
        cell.maxHp !== TILE_HP[cell.type] ||
        !number(
          cell.hp,
          cell.type === 'air' ? 0 : Number.MIN_VALUE,
          cell.maxHp,
        ) ||
        !integer(cell.variant, 0, 3)
      )
        return null;
      if (row < SURFACE && cell.type !== 'air') return null;
      if (row === ROWS - 1 && cell.type !== 'bedrock') return null;
    }
  }
  if (
    !Array.isArray(s.enemies) ||
    s.enemies.length > 50 ||
    !Array.isArray(s.projectiles) ||
    s.projectiles.length > 150
  )
    return null;
  const ids = new Set();
  for (const e of s.enemies) {
    if (
      !object(e) ||
      !integer(e.id, 1, s.nextId - 1) ||
      ids.has(e.id) ||
      !['crawler', 'spitter', 'brute'].includes(e.type) ||
      !number(e.x, -50, COLS * TILE + 50) ||
      !number(e.y, 200, SURFACE * TILE) ||
      !number(e.maxHp, 1, 1500) ||
      !number(e.hp, Number.MIN_VALUE, e.maxHp) ||
      !number(e.speed, 1, 100) ||
      !number(e.damage, 1, 30) ||
      !number(e.attackTimer, -0.1, 3) ||
      ![-1, 1].includes(e.side)
    )
      return null;
    ids.add(e.id);
  }
  for (const shot of s.projectiles) {
    if (
      !object(shot) ||
      !number(shot.x, -100, COLS * TILE + 100) ||
      !number(shot.y, -100, ROWS * TILE) ||
      !number(shot.vx, -800, 800) ||
      !number(shot.vy, -800, 800) ||
      !['player', 'enemy'].includes(shot.owner) ||
      !number(shot.damage, 1, 100) ||
      !number(shot.life, Number.MIN_VALUE, 3)
    )
      return null;
  }
  const copy = <T, K extends keyof T>(target: T, source: T, key: K) => {
    target[key] = source[key];
  };
  const clean = createGame({ seed: s.seed, difficulty: s.difficulty });
  for (const key of [
    'rng',
    'phase',
    'wave',
    'waveTimer',
    'totalTime',
    'credits',
    'kills',
    'oreMined',
    'waveRemaining',
    'spawnTimer',
    'fireCooldown',
    'nextId',
    'turretAngle',
  ] as const)
    copy(clean, s, key);
  clean.base.hp = s.base.hp;
  clean.base.maxHp = maxHp;
  for (const def of UPGRADE_DEFS) clean.upgrades[def.id] = s.upgrades[def.id];
  for (const key of [
    'x',
    'y',
    'facing',
    'mode',
    'capacity',
    'recallCooldown',
    'drillDirX',
    'drillDirY',
  ] as const)
    copy(clean.player, p, key);
  clean.player.cargo = p.cargo.map(({ type, value }) => ({ type, value }));
  clean.tiles = s.tiles.map((row) =>
    row.map(({ type, hp, maxHp, variant }) => ({ type, hp, maxHp, variant })),
  );
  clean.enemies = s.enemies.map(
    ({ id, type, x, y, hp, maxHp, speed, damage, attackTimer, side }) => ({
      id,
      type,
      x,
      y,
      hp,
      maxHp,
      speed,
      damage,
      attackTimer,
      side,
    }),
  );
  clean.projectiles = s.projectiles.map(
    ({ x, y, vx, vy, owner, damage, life }) => ({
      x,
      y,
      vx,
      vy,
      owner,
      damage,
      life,
    }),
  );
  if (collides(clean, p.x, p.y) || (p.mode === 'turret' && !nearBase(clean)))
    return null;
  if (
    ['mining', 'won'].includes(s.phase) &&
    (s.waveRemaining || s.enemies.length)
  )
    return null;
  return clean;
}
