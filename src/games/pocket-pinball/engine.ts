export interface Point {
  x: number;
  y: number;
}
export interface Ball extends Point {
  vx: number;
  vy: number;
  inLane: boolean;
}
export interface Flipper extends Point {
  angle: number;
  length: number;
  omega: number;
}
export type GameEvent =
  | {
      type:
        | 'launch'
        | 'save'
        | 'over'
        | 'drain'
        | 'entry'
        | 'flip'
        | 'retry-launch';
    }
  | { type: 'score'; id: string; points: number; x: number; y: number }
  | { type: 'orbit'; points: number; x: number; y: number };
export interface GameState {
  phase: 'ready' | 'playing' | 'over' | 'ball-lost';
  ball: Ball;
  score: number;
  balls: number;
  ballNumber: number;
  multiplier: number;
  targets: boolean[];
  combo: number;
  comboTime: number;
  lastTarget: string;
  cooldowns: Record<string, number>;
  saveTime: number;
  saved: boolean;
  entered: boolean;
  delay: number;
  time: number;
  events: GameEvent[];
  flippers: Flipper[];
}
export interface GameInput {
  left?: boolean;
  right?: boolean;
}
export const WIDTH = 560;
export const HEIGHT = 800;
export const BALL_RADIUS = 10;
export const GRAVITY = 760;
export const MAX_SPEED = 1180;
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const segment = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind = 'rail',
  id = '',
) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, kind, id });

export const RAILS = [
  segment(43, 596, 43, 143),
  segment(43, 143, 94, 62),
  segment(94, 62, 495, 62),
  segment(495, 62, 536, 120),
  segment(536, 120, 536, 759),
  segment(491, 164, 491, 759),
  segment(43, 596, 125, 667),
  segment(491, 592, 417, 667),
  // Open toward the playfield at the bottom so a resting ball cannot wedge
  // between a guide and the outer wall.
  segment(83, 184, 105, 226),
  segment(467, 188, 449, 227),
];
export const SLINGS = [
  segment(91, 541, 133, 642, 'sling', 'left-sling'),
  segment(133, 642, 180, 623, 'sling', 'left-sling'),
  segment(180, 623, 91, 541, 'sling', 'left-sling'),
  segment(450, 541, 409, 642, 'sling', 'right-sling'),
  segment(409, 642, 362, 623, 'sling', 'right-sling'),
  segment(362, 623, 450, 541, 'sling', 'right-sling'),
];
export const BUMPERS = [
  { id: 'O', x: 194, y: 264, r: 31 },
  { id: 'R', x: 349, y: 264, r: 31 },
  { id: 'B', x: 271, y: 374, r: 34 },
];
export const TARGETS = [
  segment(81, 342, 108, 371, 'target', 'left-star'),
  segment(452, 342, 425, 371, 'target', 'right-star'),
];

const readyBall = () => ({ x: 514, y: 735, vx: 0, vy: 0, inLane: true });
export function createGame(): GameState {
  return {
    phase: 'ready',
    ball: readyBall(),
    score: 0,
    balls: 3,
    ballNumber: 1,
    multiplier: 1,
    targets: [false, false, false],
    combo: 0,
    comboTime: 0,
    lastTarget: '',
    cooldowns: {},
    saveTime: 0,
    saved: false,
    entered: false,
    delay: 0,
    time: 0,
    events: [],
    flippers: [
      { x: 165, y: 687, angle: 0.35, length: 86, omega: 0 },
      { x: 375, y: 687, angle: Math.PI - 0.35, length: 86, omega: 0 },
    ],
  };
}

export function launchBall(previous: GameState, power = 0.75): GameState {
  if (previous.phase !== 'ready') return previous;
  const charge = clamp(Number.isFinite(power) ? power : 0, 0, 1);
  return {
    ...previous,
    phase: 'playing',
    ball: { ...readyBall(), vy: -(910 + charge * 270) },
    events: [{ type: 'launch' }],
  };
}

export function collideSegment(
  ball: Point & { vx: number; vy: number },
  a: Point,
  b: Point,
  radius = 5,
  restitution = 0.83,
  surfaceVelocity: ((x: number, y: number) => Point) | null = null,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp(
    ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  let nx = ball.x - x;
  let ny = ball.y - y;
  const distance = Math.hypot(nx, ny);
  const minimum = BALL_RADIUS + radius;
  if (distance >= minimum) return null;
  if (distance < 0.00001) {
    const length = Math.hypot(dx, dy) || 1;
    nx = dy / length;
    ny = -dx / length;
  } else {
    nx /= distance;
    ny /= distance;
  }
  ball.x += nx * (minimum - distance + 0.015);
  ball.y += ny * (minimum - distance + 0.015);
  const velocity = surfaceVelocity ? surfaceVelocity(x, y) : { x: 0, y: 0 };
  const normalSpeed = (ball.vx - velocity.x) * nx + (ball.vy - velocity.y) * ny;
  if (normalSpeed < 0) {
    ball.vx -= (1 + restitution) * normalSpeed * nx;
    ball.vy -= (1 + restitution) * normalSpeed * ny;
  }
  return { nx, ny, incoming: normalSpeed < -12, x, y };
}

export function awardTarget(
  game: GameState,
  id: string,
  base: number,
  x = 270,
  y = 200,
) {
  if ((game.cooldowns[id] || 0) > 0) return false;
  game.cooldowns[id] = 0.16;
  game.combo =
    game.comboTime > 0 && game.lastTarget !== id
      ? Math.min(8, game.combo + 1)
      : 1;
  game.comboTime = 2.8;
  game.lastTarget = id;
  const points = base * game.multiplier + (game.combo - 1) * 25;
  game.score += points;
  game.events.push({ type: 'score', id, points, x, y });
  const target = BUMPERS.findIndex((bumper) => bumper.id === id);
  if (target >= 0) {
    game.targets[target] = true;
    if (game.targets.every(Boolean)) {
      const bonus = 1000 * game.multiplier;
      game.score += bonus;
      game.multiplier = Math.min(5, game.multiplier + 1);
      game.targets.fill(false);
      game.events.push({ type: 'orbit', points: bonus, x: 271, y: 457 });
    }
  }
  return true;
}

export function drainBall(game: GameState) {
  if (game.phase !== 'playing') return game;
  if (game.saveTime > 0 && !game.saved) {
    game.saved = true;
    game.saveTime = 0;
    game.phase = 'ready';
    game.ball = readyBall();
    game.events.push({ type: 'save' });
  } else {
    game.balls--;
    game.combo = 0;
    game.comboTime = 0;
    game.saveTime = 0;
    if (game.balls === 0) {
      game.phase = 'over';
      game.events.push({ type: 'over' });
    } else {
      game.ballNumber++;
      game.phase = 'ball-lost';
      game.delay = 1.05;
      game.events.push({ type: 'drain' });
    }
  }
  return game;
}

function updateFlippers(game: GameState, input: GameInput, dt: number) {
  game.flippers.forEach((flipper, index) => {
    const up = index === 0 ? input.left : input.right;
    const target =
      index === 0 ? (up ? -0.48 : 0.35) : up ? Math.PI + 0.48 : Math.PI - 0.35;
    const previous = flipper.angle;
    flipper.angle += clamp(target - flipper.angle, -16 * dt, 16 * dt);
    flipper.omega = dt > 0 ? (flipper.angle - previous) / dt : 0;
  });
}

export function stepGame(
  previous: GameState,
  input: GameInput = {},
  seconds = 1 / 60,
) {
  if (previous.phase === 'over' || !Number.isFinite(seconds) || seconds <= 0)
    return previous;
  const duration = clamp(seconds, 0, 0.1);
  const game: GameState = {
    ...previous,
    ball: { ...previous.ball },
    targets: [...previous.targets],
    cooldowns: { ...previous.cooldowns },
    flippers: previous.flippers.map((flipper) => ({ ...flipper })),
    events: [],
  };
  game.time += duration;
  game.comboTime = Math.max(0, game.comboTime - duration);
  if (game.comboTime === 0) game.combo = 0;
  for (const key of Object.keys(game.cooldowns))
    game.cooldowns[key] = Math.max(0, game.cooldowns[key] - duration);
  if (game.phase === 'ball-lost') {
    game.delay -= duration;
    if (game.delay <= 0) {
      game.phase = 'ready';
      game.ball = readyBall();
      game.saved = false;
      game.entered = false;
    }
  }
  const steps = Math.max(1, Math.ceil(duration * 240));
  const dt = duration / steps;
  for (let step = 0; step < steps; step++) {
    updateFlippers(game, input, dt);
    if (game.phase !== 'playing') continue;
    const ball = game.ball;
    if (game.entered) game.saveTime = Math.max(0, game.saveTime - dt);
    ball.vy += GRAVITY * dt;
    ball.vx *= Math.exp(-0.035 * dt);
    ball.vy *= Math.exp(-0.012 * dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.inLane && ball.y < 140) {
      ball.inLane = false;
      ball.vx = -255;
      ball.vy = Math.min(ball.vy, -130);
      if (!game.entered) {
        game.entered = true;
        game.saveTime = game.saved ? 0 : 4;
      }
      game.events.push({ type: 'entry' });
    }
    for (const rail of RAILS) collideSegment(ball, rail.a, rail.b, 5, 0.82);
    for (const target of TARGETS) {
      const hit = collideSegment(ball, target.a, target.b, 5, 0.88);
      if (hit?.incoming) awardTarget(game, target.id, 250, hit.x, hit.y);
    }
    for (const sling of SLINGS) {
      const hit = collideSegment(ball, sling.a, sling.b, 5, 0.88);
      if (hit?.incoming && awardTarget(game, sling.id, 50, hit.x, hit.y)) {
        ball.vx += hit.nx * 160;
        ball.vy += hit.ny * 160;
      }
    }
    for (const bumper of BUMPERS) {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= bumper.r + BALL_RADIUS) continue;
      const nx = distance > 0.001 ? dx / distance : 0;
      const ny = distance > 0.001 ? dy / distance : -1;
      ball.x = bumper.x + nx * (bumper.r + BALL_RADIUS + 0.05);
      ball.y = bumper.y + ny * (bumper.r + BALL_RADIUS + 0.05);
      const impact = ball.vx * nx + ball.vy * ny;
      if (impact < 0) {
        ball.vx -= 1.85 * impact * nx;
        ball.vy -= 1.85 * impact * ny;
      }
      if (awardTarget(game, bumper.id, 100, bumper.x, bumper.y)) {
        ball.vx += nx * 220;
        ball.vy += ny * 220;
      }
    }
    for (const flipper of game.flippers) {
      const tip = {
        x: flipper.x + Math.cos(flipper.angle) * flipper.length,
        y: flipper.y + Math.sin(flipper.angle) * flipper.length,
      };
      const hit = collideSegment(ball, flipper, tip, 9, 0.48, (x, y) => ({
        x: -flipper.omega * (y - flipper.y),
        y: flipper.omega * (x - flipper.x),
      }));
      if (hit?.incoming && Math.abs(flipper.omega) > 1)
        game.events.push({ type: 'flip' });
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) {
      ball.vx *= MAX_SPEED / speed;
      ball.vy *= MAX_SPEED / speed;
    }
    // An under-powered plunge safely settles back in the shooter lane.
    if (ball.x > 499 && ball.y > 735 && ball.vy > 0) {
      game.phase = 'ready';
      game.ball = readyBall();
      game.events.push({ type: 'retry-launch' });
    } else if (ball.y > 785) drainBall(game);
    // Numeric guard at the outside of the physical frame, never a ball save.
    if (ball.x < 16) {
      ball.x = 16;
      ball.vx = Math.abs(ball.vx) * 0.8;
    }
    if (ball.x > 544) {
      ball.x = 544;
      ball.vx = -Math.abs(ball.vx) * 0.8;
    }
    if (ball.y < 20) {
      ball.y = 20;
      ball.vy = Math.abs(ball.vy) * 0.8;
    }
  }
  return game;
}
