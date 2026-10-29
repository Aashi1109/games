export interface Point {
  x: number;
  y: number;
}
export interface Motion extends Point {
  vx: number;
  vy: number;
}
export interface Ship extends Motion {
  angle: number;
  alive: boolean;
  shield: number;
  cooldown: number;
  respawn: number;
  thrust: boolean;
}
export interface Rock extends Motion {
  id: number;
  size: number;
  radius: number;
  angle: number;
  spin: number;
  vertices: number[];
}
export interface Bullet extends Motion {
  life: number;
}
export interface Particle extends Bullet {
  kind: string;
}
export interface GameInput {
  left?: boolean;
  right?: boolean;
  thrust?: boolean;
  fire?: boolean;
}
export interface GameState {
  seed: number;
  randomState: number;
  nextId: number;
  phase: 'ready' | 'playing' | 'between' | 'won' | 'lost' | 'paused';
  sector: number;
  hulls: number;
  score: number;
  elapsed: number;
  shots: number;
  hits: number;
  transition: number;
  ship: Ship;
  rocks: Rock[];
  bullets: Bullet[];
  particles: Particle[];
  events: string[];
}
export const WIDTH = 960;
export const HEIGHT = 640;
export const SECTORS = 4;
export const ROCK_RADII = [0, 13, 25, 45];
export const ROCK_POINTS = [0, 200, 100, 50];
const TAU = Math.PI * 2;

export function wrap(value: number, size: number) {
  return ((value % size) + size) % size;
}

export function torusDelta(from: number, to: number, size: number) {
  return wrap(to - from + size / 2, size) - size / 2;
}

export function segmentHitsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / length))
    : 0;
  return (x1 + t * dx - cx) ** 2 + (y1 + t * dy - cy) ** 2 <= radius ** 2;
}

function random(state: GameState) {
  state.randomState =
    (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function distance(a: Point, b: Point) {
  return Math.hypot(torusDelta(a.x, b.x, WIDTH), torusDelta(a.y, b.y, HEIGHT));
}

function makeRock(
  state: GameState,
  size: number,
  x: number,
  y: number,
  vx?: number,
  vy?: number,
): Rock {
  const speed =
    (30 + state.sector * 9 + (3 - size) * 18) * (0.8 + random(state) * 0.4);
  const direction = random(state) * TAU;
  return {
    id: state.nextId++,
    size,
    radius: ROCK_RADII[size],
    x: wrap(x, WIDTH),
    y: wrap(y, HEIGHT),
    vx: vx ?? Math.cos(direction) * speed,
    vy: vy ?? Math.sin(direction) * speed,
    angle: random(state) * TAU,
    spin: (random(state) - 0.5) * 0.7,
    vertices: Array.from({ length: 10 }, () => 0.77 + random(state) * 0.23),
  };
}

function populateSector(state: GameState) {
  state.rocks = [];
  for (let i = 0; i < state.sector + 1; i++) {
    let x = random(state) * WIDTH;
    let y = random(state) * HEIGHT;
    for (
      let attempts = 0;
      distance({ x, y }, state.ship) < 220 && attempts < 30;
      attempts++
    ) {
      x = random(state) * WIDTH;
      y = random(state) * HEIGHT;
    }
    if (distance({ x, y }, state.ship) < 220) {
      x = wrap(state.ship.x + WIDTH / 2, WIDTH);
      y = wrap(state.ship.y + HEIGHT / 2, HEIGHT);
    }
    state.rocks.push(makeRock(state, 3, x, y));
  }
}

function newShip(): Ship {
  return {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    alive: true,
    shield: 2.8,
    cooldown: 0,
    respawn: 0,
    thrust: false,
  };
}

export function createGame(seed = Date.now()): GameState {
  const numericSeed = Number.isFinite(seed) ? seed >>> 0 : 1;
  const state: GameState = {
    seed: numericSeed,
    randomState: numericSeed,
    nextId: 1,
    phase: 'ready',
    sector: 1,
    hulls: 3,
    score: 0,
    elapsed: 0,
    shots: 0,
    hits: 0,
    transition: 0,
    ship: newShip(),
    rocks: [],
    bullets: [],
    particles: [],
    events: [],
  };
  populateSector(state);
  return state;
}

export function startGame(state: GameState) {
  if (state.phase === 'ready') state.phase = 'playing';
  return state;
}

export function restartGame(state: GameState, seed = state.seed) {
  Object.assign(state, createGame(seed));
  return state;
}

function burst(
  state: GameState,
  x: number,
  y: number,
  count: number,
  kind: string,
) {
  for (let i = 0; i < count; i++) {
    const angle = random(state) * TAU;
    const speed = 25 + random(state) * 100;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + random(state) * 0.4,
      kind,
    });
  }
}

function destroyRock(state: GameState, index: number) {
  const [rock] = state.rocks.splice(index, 1);
  state.score += ROCK_POINTS[rock.size];
  state.hits++;
  state.events.push('rock');
  burst(state, rock.x, rock.y, 7, 'rock');
  if (rock.size > 1) {
    const angle = random(state) * TAU;
    const size = rock.size - 1;
    const kick = 38 + state.sector * 4;
    for (const sign of [-1, 1]) {
      const dx = Math.cos(angle) * sign;
      const dy = Math.sin(angle) * sign;
      state.rocks.push(
        makeRock(
          state,
          size,
          rock.x + dx * ROCK_RADII[size] * 0.7,
          rock.y + dy * ROCK_RADII[size] * 0.7,
          rock.vx * 0.8 + dx * kick,
          rock.vy * 0.8 + dy * kick,
        ),
      );
    }
  }
}

function respawn(state: GameState) {
  const positions = [{ x: WIDTH / 2, y: HEIGHT / 2 }];
  for (let y = 80; y < HEIGHT; y += 160) {
    for (let x = 80; x < WIDTH; x += 160) positions.push({ x, y });
  }
  const clearance = (position: Point) =>
    Math.min(
      ...state.rocks.map((rock) => distance(position, rock) - rock.radius),
      Infinity,
    );
  positions.sort((a, b) => clearance(b) - clearance(a));
  state.ship = { ...newShip(), ...positions[0] };
}

function tick(state: GameState, dt: number, input: GameInput) {
  state.elapsed += dt;
  state.particles = state.particles.filter((particle) => {
    particle.life -= dt;
    particle.x = wrap(particle.x + particle.vx * dt, WIDTH);
    particle.y = wrap(particle.y + particle.vy * dt, HEIGHT);
    return particle.life > 0;
  });
  if (state.phase === 'between') {
    state.transition -= dt;
    if (state.transition <= 0) {
      state.sector++;
      populateSector(state);
      state.ship.shield = Math.max(1.8, state.ship.shield);
      state.phase = 'playing';
      state.events.push('sector');
    }
    return;
  }
  const ship = state.ship;
  if (!ship.alive) {
    ship.respawn -= dt;
    if (ship.respawn <= 0) respawn(state);
  } else {
    ship.shield = Math.max(0, ship.shield - dt);
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    ship.angle += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 3.7 * dt;
    ship.thrust = !!input.thrust;
    if (input.thrust) {
      ship.vx += Math.cos(ship.angle) * 225 * dt;
      ship.vy += Math.sin(ship.angle) * 225 * dt;
    }
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > 280) {
      ship.vx *= 280 / speed;
      ship.vy *= 280 / speed;
    }
    ship.vx *= Math.exp(-0.18 * dt);
    ship.vy *= Math.exp(-0.18 * dt);
    ship.x = wrap(ship.x + ship.vx * dt, WIDTH);
    ship.y = wrap(ship.y + ship.vy * dt, HEIGHT);
    if (input.fire && ship.cooldown <= 0) {
      state.bullets.push({
        x: wrap(ship.x + Math.cos(ship.angle) * 19, WIDTH),
        y: wrap(ship.y + Math.sin(ship.angle) * 19, HEIGHT),
        vx: Math.cos(ship.angle) * 580 + ship.vx,
        vy: Math.sin(ship.angle) * 580 + ship.vy,
        life: 1.25,
      });
      ship.cooldown = 0.16;
      state.shots++;
      state.events.push('fire');
    }
  }
  for (const rock of state.rocks) {
    rock.x = wrap(rock.x + rock.vx * dt, WIDTH);
    rock.y = wrap(rock.y + rock.vy * dt, HEIGHT);
    rock.angle += rock.spin * dt;
  }
  for (const bullet of state.bullets) {
    const nx = bullet.x + bullet.vx * dt;
    const ny = bullet.y + bullet.vy * dt;
    const index = state.rocks.findIndex((rock) =>
      segmentHitsCircle(
        bullet.x,
        bullet.y,
        nx,
        ny,
        bullet.x + torusDelta(bullet.x, rock.x, WIDTH),
        bullet.y + torusDelta(bullet.y, rock.y, HEIGHT),
        rock.radius * 0.9 + 2,
      ),
    );
    if (index >= 0) {
      destroyRock(state, index);
      bullet.life = 0;
    } else {
      bullet.x = wrap(nx, WIDTH);
      bullet.y = wrap(ny, HEIGHT);
      bullet.life -= dt;
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0);
  if (
    state.ship.alive &&
    state.ship.shield <= 0 &&
    state.rocks.some(
      (rock) => distance(state.ship, rock) < rock.radius * 0.78 + 8,
    )
  ) {
    state.hulls--;
    state.ship.alive = false;
    state.ship.thrust = false;
    state.ship.respawn = 0.85;
    burst(state, state.ship.x, state.ship.y, 22, 'ship');
    state.events.push('hit');
    if (state.hulls <= 0) {
      state.phase = 'lost';
      state.events.push('lost');
    }
  }
  if (state.phase === 'playing' && state.rocks.length === 0) {
    state.bullets = [];
    if (state.sector === SECTORS) {
      state.phase = 'won';
      state.score += state.hulls * 500;
      state.events.push('won');
    } else {
      state.phase = 'between';
      state.transition = 1.5;
      if (!state.ship.alive) respawn(state);
      state.events.push('clear');
    }
  }
}

export function stepGame(
  state: GameState,
  delta: number,
  input: GameInput = {},
) {
  state.events = [];
  if (
    !Number.isFinite(delta) ||
    delta <= 0 ||
    !['playing', 'between'].includes(state.phase)
  )
    return state;
  let remaining = Math.min(delta, 0.25);
  while (remaining > 0.000001 && ['playing', 'between'].includes(state.phase)) {
    const dt = Math.min(remaining, 1 / 120);
    tick(state, dt, input);
    remaining -= dt;
  }
  return state;
}

export function autopilot(state: GameState): GameInput {
  const ship = state.ship;
  if (!state.rocks.length || !ship.alive) return {};
  const nearest = state.rocks.reduce((best, rock) =>
    distance(ship, rock) < distance(ship, best) ? rock : best,
  );
  const d = distance(ship, nearest);
  const lead = d / 580;
  const dx = torusDelta(ship.x, nearest.x + nearest.vx * lead, WIDTH);
  const dy = torusDelta(ship.y, nearest.y + nearest.vy * lead, HEIGHT);
  const aim = Math.atan2(dy, dx);
  const delta = torusDelta(ship.angle, aim, TAU);
  return {
    left: delta < -0.04,
    right: delta > 0.04,
    fire: Math.abs(delta) < 0.22,
    thrust: d < 160 || state.elapsed % 5 < 0.75,
  };
}
