export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export interface TrafficCar {
  id: string;
  row: number;
  safeLane: number;
  lane: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: string;
  color: number;
  passed: boolean;
  hit: boolean;
  clearance: number;
}
export type GameEvent =
  | { type: 'damage'; health: number; x: number }
  | { type: 'loss' }
  | { type: 'near-miss' | 'pass'; points: number; x: number }
  | { type: 'finish'; points: number };
export interface GameState {
  phase: Phase;
  seed: number;
  initialSeed: number;
  time: number;
  distance: number;
  traveled: number;
  nextSpawnAt: number;
  rowIndex: number;
  safeLane: number;
  speed: number;
  brake: boolean;
  player: { x: number; lane: number };
  traffic: TrafficCar[];
  health: number;
  invulnerable: number;
  score: number;
  bonus: number;
  overtakes: number;
  nearMisses: number;
  events: GameEvent[];
}
export interface GameInput {
  lane?: number;
  brake?: boolean;
}
export const WIDTH = 600;
export const HEIGHT = 800;
export const LANES = [156, 300, 444];
export const PLAYER_Y = 655;
export const PLAYER_WIDTH = 64;
export const PLAYER_HEIGHT = 110;
export const TRAFFIC_WIDTH = 70;
export const MAX_TRAFFIC_HEIGHT = 132;
export const LANE_SPEED = 850;
export const BASE_SPEED = 210;
export const MAX_SPEED = 390;
export const ROW_SPACING = 450;
export const SPAWN_Y = -120;
export const RUN_SECONDS = 90;
export const RECOVERY_SECONDS = 1.6;
export const NEAR_CLEARANCE = 26;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function random(seed: number) {
  let value = seed >>> 0 || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return { seed: value >>> 0, value: (value >>> 0) / 4294967296 };
}

/** Adjacent safe lanes and fixed row spacing preserve a drivable corridor. */
export function generateWave(
  seed: number,
  previousSafe = 1,
  index = 0,
  elapsed = 0,
) {
  let next = random(seed);
  const options = [previousSafe - 1, previousSafe, previousSafe + 1].filter(
    (lane) => lane >= 0 && lane < 3,
  );
  const safeLane = options[Math.floor(next.value * options.length)];
  next = random(next.seed);
  let lanes = [0, 1, 2].filter((lane) => lane !== safeLane);
  if (elapsed < 12 || next.value < 0.2) lanes = [lanes[index % 2]];
  const cars = lanes.map((lane, order) => {
    next = random(next.seed);
    const van = next.value > 0.74;
    return {
      id: `${index}-${lane}`,
      row: index,
      safeLane,
      lane,
      x: LANES[lane],
      y: SPAWN_Y,
      width: TRAFFIC_WIDTH,
      height: van ? MAX_TRAFFIC_HEIGHT : 116,
      kind: van ? 'van' : 'coupe',
      color: (index + lane + order) % 4,
      passed: false,
      hit: false,
      clearance: Infinity,
    };
  });
  return { seed: next.seed, safeLane, cars };
}

export function createGame(seed = 481516): GameState {
  const normalizedSeed = Number.isFinite(seed) ? seed >>> 0 || 1 : 1;
  const first = generateWave(normalizedSeed, 1, 0, 0);
  // The opening car is safely to the left. It is already visible at the start.
  const traffic = [
    { ...first.cars[0], lane: 0, x: LANES[0], safeLane: 1, y: 90, color: 0 },
  ];
  return {
    phase: 'ready',
    seed: first.seed,
    initialSeed: normalizedSeed,
    time: 0,
    distance: 0,
    traveled: 0,
    nextSpawnAt: ROW_SPACING - (90 - SPAWN_Y),
    rowIndex: 1,
    safeLane: 1,
    speed: BASE_SPEED,
    brake: false,
    player: { x: LANES[1], lane: 1 },
    traffic,
    health: 3,
    invulnerable: 0,
    score: 0,
    bonus: 0,
    overtakes: 0,
    nearMisses: 0,
    events: [],
  };
}

export function startGame(seed = 481516): GameState {
  return { ...createGame(seed), phase: 'playing' };
}

export function moveLane(game: GameState, direction: number): GameState {
  if (
    game.phase !== 'playing' ||
    !Number.isFinite(direction) ||
    direction === 0
  )
    return game;
  const lane = clamp(game.player.lane + Math.sign(direction), 0, 2);
  return lane === game.player.lane
    ? game
    : { ...game, player: { ...game.player, lane } };
}

export function pauseGame(game: GameState, paused = true): GameState {
  if (paused && game.phase === 'playing')
    return { ...game, phase: 'paused', brake: false };
  if (!paused && game.phase === 'paused') return { ...game, phase: 'playing' };
  return game;
}

export function speedAt(time: number, braking = false) {
  const speed =
    BASE_SPEED + (MAX_SPEED - BASE_SPEED) * clamp(time / RUN_SECONDS, 0, 1);
  return speed * (braking ? 0.64 : 1);
}

export function demoLane(game: GameState) {
  const next = game.traffic
    .filter(
      (car) => car.y < PLAYER_Y + (MAX_TRAFFIC_HEIGHT + PLAYER_HEIGHT) / 2 + 12,
    )
    .sort((a, b) => b.y - a.y)[0];
  return next ? next.safeLane : game.player.lane;
}

export function stepGame(
  previous: GameState,
  input: GameInput = {},
  seconds = 1 / 60,
): GameState {
  if (previous.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0)
    return previous;
  const duration = Math.min(seconds, 0.1, RUN_SECONDS - previous.time);
  const game: GameState = {
    ...previous,
    player: { ...previous.player },
    traffic: previous.traffic.map((car) => ({ ...car })),
    events: [],
  };
  if (typeof input.lane === 'number' && Number.isInteger(input.lane))
    game.player.lane = clamp(input.lane, 0, 2);
  game.brake = Boolean(input.brake);
  const steps = Math.max(1, Math.ceil(duration * 120));
  const dt = duration / steps;
  for (let i = 0; i < steps && game.phase === 'playing'; i++) {
    game.time += dt;
    game.invulnerable = Math.max(0, game.invulnerable - dt);
    game.speed = speedAt(game.time, game.brake);
    game.traveled += game.speed * dt;
    game.distance += (game.speed / 6) * dt;
    const target = LANES[game.player.lane];
    game.player.x += clamp(
      target - game.player.x,
      -LANE_SPEED * dt,
      LANE_SPEED * dt,
    );
    for (const car of game.traffic) car.y += game.speed * dt;
    while (game.traveled >= game.nextSpawnAt) {
      const wave = generateWave(
        game.seed,
        game.safeLane,
        game.rowIndex++,
        game.time,
      );
      game.seed = wave.seed;
      game.safeLane = wave.safeLane;
      for (const car of wave.cars) car.y += game.traveled - game.nextSpawnAt;
      game.traffic.push(...wave.cars);
      game.nextSpawnAt += ROW_SPACING;
    }
    for (const car of game.traffic) {
      const vertical = (PLAYER_HEIGHT + car.height) / 2;
      if (Math.abs(car.y - PLAYER_Y) < vertical && !car.passed) {
        const clearance =
          Math.abs(car.x - game.player.x) - (PLAYER_WIDTH + car.width) / 2;
        if (clearance < 0 && !car.hit) {
          car.hit = true;
          if (game.invulnerable <= 0) {
            game.health--;
            game.invulnerable = RECOVERY_SECONDS;
            game.events.push({
              type: 'damage',
              health: game.health,
              x: game.player.x,
            });
            if (game.health === 0) {
              game.phase = 'lost';
              game.events.push({ type: 'loss' });
            }
          }
        } else if (!car.hit && clearance >= 0)
          car.clearance = Math.min(car.clearance, clearance);
      }
      if (car.y > PLAYER_Y + vertical && !car.passed) {
        car.passed = true;
        if (!car.hit) {
          game.overtakes++;
          const near = car.clearance <= NEAR_CLEARANCE;
          if (near) game.nearMisses++;
          const points = near ? 125 : 25;
          game.bonus += points;
          game.events.push({
            type: near ? 'near-miss' : 'pass',
            points,
            x: car.x,
          });
        }
      }
    }
    game.traffic = game.traffic.filter(
      (car) => car.y < HEIGHT + MAX_TRAFFIC_HEIGHT,
    );
  }
  if (game.phase === 'playing' && game.time >= RUN_SECONDS - 0.000001) {
    game.time = RUN_SECONDS;
    game.phase = 'won';
    const points = 1000 + game.health * 250;
    game.bonus += points;
    game.events.push({ type: 'finish', points });
  }
  game.score = Math.floor(game.distance) + game.bonus;
  return game;
}
