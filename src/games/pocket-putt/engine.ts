export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}
export interface Ellipse extends Point {
  rx: number;
  ry: number;
}
export interface Hole {
  name: string;
  par: number;
  tee: Point;
  cup: Point;
  walls: Rect[];
  sand: Ellipse[];
  water: Ellipse[];
  tip: string;
}
export interface Ball extends Point {
  vx: number;
  vy: number;
  status: 'ready' | 'rolling' | 'water' | 'sunk';
}
export interface Round {
  players: number;
  player: number;
  hole: number;
  scores: (number | null)[][];
  strokes: number;
  ball: Ball;
  lie: Point;
  phase: 'aiming' | 'rolling' | 'hole-complete' | 'complete';
  notice: string;
  result: string;
}
export const WIDTH = 900;
export const HEIGHT = 600;
export const BALL_RADIUS = 8;
export const CUP_RADIUS = 14;
export const MAX_STROKES = 8;
export const BOUNDS = { left: 52, right: 848, top: 64, bottom: 532 };
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
export const HOLES: Hole[] = [
  {
    name: 'Clover Walk',
    par: 2,
    tee: { x: 174, y: 409 },
    cup: { x: 722, y: 220 },
    walls: [],
    sand: [],
    water: [],
    tip: 'A gentle opening. Line up the cup, then find your touch.',
  },
  {
    name: 'The Secret Garden',
    par: 3,
    tee: { x: 169, y: 428 },
    cup: { x: 731, y: 426 },
    walls: [rect(414, 285, 62, 247)],
    sand: [],
    water: [],
    tip: 'Go around the flower bed. A bank off the top rail can help.',
  },
  {
    name: 'Fern Corner',
    par: 3,
    tee: { x: 153, y: 435 },
    cup: { x: 736, y: 161 },
    walls: [rect(270, 64, 35, 310), rect(450, 300, 398, 35)],
    sand: [],
    water: [],
    tip: 'Find the open corner, then turn toward the flag.',
  },
  {
    name: 'Sand & Sunshine',
    par: 3,
    tee: { x: 151, y: 294 },
    cup: { x: 737, y: 286 },
    walls: [rect(414, 64, 38, 130)],
    sand: [{ x: 461, y: 332, rx: 113, ry: 79 }],
    water: [],
    tip: 'Sand slows the ball. Add a little power, or take the long way.',
  },
  {
    name: 'Lily Crossing',
    par: 4,
    tee: { x: 146, y: 435 },
    cup: { x: 757, y: 170 },
    walls: [rect(640, 337, 35, 195)],
    sand: [],
    water: [{ x: 483, y: 330, rx: 99, ry: 129 }],
    tip: 'Give the lilies some room. Water costs one penalty stroke.',
  },
  {
    name: 'The Greenhouse',
    par: 4,
    tee: { x: 158, y: 443 },
    cup: { x: 742, y: 163 },
    walls: [rect(340, 285, 42, 247), rect(520, 64, 40, 246)],
    sand: [{ x: 433, y: 159, rx: 59, ry: 47 }],
    water: [{ x: 724, y: 411, rx: 69, ry: 52 }],
    tip: 'A garden zigzag. Go above the first bed and below the second.',
  },
];

export const insideEllipse = (point: Point, ellipse: Ellipse) =>
  ((point.x - ellipse.x) / ellipse.rx) ** 2 +
    ((point.y - ellipse.y) / ellipse.ry) ** 2 <
  1;
export const createBall = (point: Point): Ball => ({
  x: point.x,
  y: point.y,
  vx: 0,
  vy: 0,
  status: 'ready',
});
export const shotSpeed = (power: number) =>
  clamp(Number.isFinite(power) ? power : 0, 0, 100) * 6.2;

export function hitRectangle(ball: Ball, wall: Rect) {
  const x = clamp(ball.x, wall.x, wall.x + wall.w);
  const y = clamp(ball.y, wall.y, wall.y + wall.h);
  let dx = ball.x - x;
  let dy = ball.y - y;
  const distance = Math.hypot(dx, dy);
  if (distance >= BALL_RADIUS) return false;
  if (distance < 0.00001) {
    const sides = [
      { depth: ball.x - wall.x, nx: -1, ny: 0 },
      { depth: wall.x + wall.w - ball.x, nx: 1, ny: 0 },
      { depth: ball.y - wall.y, nx: 0, ny: -1 },
      { depth: wall.y + wall.h - ball.y, nx: 0, ny: 1 },
    ];
    sides.sort((a, b) => a.depth - b.depth);
    dx = sides[0].nx;
    dy = sides[0].ny;
    ball.x += dx * (sides[0].depth + BALL_RADIUS + 0.01);
    ball.y += dy * (sides[0].depth + BALL_RADIUS + 0.01);
  } else {
    dx /= distance;
    dy /= distance;
    ball.x += dx * (BALL_RADIUS - distance + 0.01);
    ball.y += dy * (BALL_RADIUS - distance + 0.01);
  }
  const normalSpeed = ball.vx * dx + ball.vy * dy;
  if (normalSpeed < 0) {
    ball.vx -= 1.8 * normalSpeed * dx;
    ball.vy -= 1.8 * normalSpeed * dy;
  }
  return true;
}

export function stepBall(previous: Ball, hole: Hole, seconds: number) {
  if (previous.status !== 'rolling') return previous;
  const ball = { ...previous };
  const duration = clamp(seconds, 0, 0.1);
  const count = Math.max(1, Math.ceil(duration * 240));
  const dt = duration / count;
  for (let i = 0; i < count; i++) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < BOUNDS.left + BALL_RADIUS) {
      ball.x = BOUNDS.left + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.82;
    }
    if (ball.x > BOUNDS.right - BALL_RADIUS) {
      ball.x = BOUNDS.right - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.82;
    }
    if (ball.y < BOUNDS.top + BALL_RADIUS) {
      ball.y = BOUNDS.top + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.82;
    }
    if (ball.y > BOUNDS.bottom - BALL_RADIUS) {
      ball.y = BOUNDS.bottom - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.82;
    }
    for (const wall of hole.walls) hitRectangle(ball, wall);
    if (hole.water.some((pool) => insideEllipse(ball, pool))) {
      ball.status = 'water';
      ball.vx = ball.vy = 0;
      break;
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    const cupDistance = Math.hypot(ball.x - hole.cup.x, ball.y - hole.cup.y);
    if (cupDistance < CUP_RADIUS && speed < 160) {
      ball.x = hole.cup.x;
      ball.y = hole.cup.y;
      ball.vx = ball.vy = 0;
      ball.status = 'sunk';
      break;
    }
    const friction = hole.sand.some((patch) => insideEllipse(ball, patch))
      ? 330
      : 115;
    const nextSpeed = Math.max(0, speed - friction * dt);
    if (nextSpeed < 5) {
      ball.vx = ball.vy = 0;
      ball.status = 'ready';
      break;
    }
    ball.vx *= nextSpeed / speed;
    ball.vy *= nextSpeed / speed;
  }
  return ball;
}

export function createRound(players = 1): Round {
  return {
    players: players === 2 ? 2 : 1,
    player: 0,
    hole: 0,
    scores: Array.from({ length: players === 2 ? 2 : 1 }, () =>
      HOLES.map(() => null),
    ),
    strokes: 0,
    ball: createBall(HOLES[0].tee),
    lie: { ...HOLES[0].tee },
    phase: 'aiming',
    notice: '',
    result: '',
  };
}

export function takeShot(round: Round, angle: number, power: number): Round {
  if (
    round.phase !== 'aiming' ||
    !Number.isFinite(angle) ||
    shotSpeed(power) < 1
  )
    return round;
  const speed = shotSpeed(power);
  return {
    ...round,
    strokes: round.strokes + 1,
    lie: { x: round.ball.x, y: round.ball.y },
    notice: '',
    phase: 'rolling',
    ball: {
      ...round.ball,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      status: 'rolling',
    },
  };
}

function finishHole(round: Round, score: number, result: string): Round {
  const scores = round.scores.map((row) => [...row]);
  scores[round.player][round.hole] = score;
  return { ...round, scores, phase: 'hole-complete', result };
}

export function tickRound(round: Round, seconds: number) {
  if (round.phase !== 'rolling') return round;
  const ball = stepBall(round.ball, HOLES[round.hole], seconds);
  let next = { ...round, ball };
  if (ball.status === 'sunk') return finishHole(next, next.strokes, 'sunk');
  if (ball.status === 'water')
    next = {
      ...next,
      ball: createBall(round.lie),
      strokes: next.strokes + 1,
      notice: 'Water hazard · +1 penalty stroke. Back to your last lie.',
    };
  if (ball.status === 'ready' || ball.status === 'water') {
    if (next.strokes >= MAX_STROKES)
      return finishHole(next, MAX_STROKES + 1, 'pickup');
    next.phase = 'aiming';
  }
  return next;
}

export function nextTurn(round: Round): Round {
  if (round.phase !== 'hole-complete') return round;
  const player = (round.player + 1) % round.players;
  const hole = round.hole + Number(player === 0);
  if (hole >= HOLES.length) return { ...round, phase: 'complete' };
  return {
    ...round,
    player,
    hole,
    strokes: 0,
    ball: createBall(HOLES[hole].tee),
    lie: { ...HOLES[hole].tee },
    phase: 'aiming',
    result: '',
    notice: '',
  };
}

export const totalScore = (row: (number | null)[]) =>
  row.reduce<number>((total, n) => total + (n ?? 0), 0);
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'Hole in one!';
  const delta = strokes - par;
  return delta <= -2
    ? 'An eagle. Beautiful.'
    : delta === -1
      ? 'A lovely birdie.'
      : delta === 0
        ? 'Right on par.'
        : delta === 1
          ? 'A perfectly good bogey.'
          : 'In the cup. On we go.';
}
