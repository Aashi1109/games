export type Phase = 'ready' | 'serve' | 'playing' | 'paused' | 'lost' | 'won';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Ball {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}
export interface Brick extends Rect {
  id: number;
  hp: number;
  maxHp: number;
  row: number;
}
export type GameEvent =
  | { type: 'serve' | 'lost' | 'paddle'; x: number; y: number }
  | { type: 'clear'; level: number }
  | {
      type: 'brick';
      x: number;
      y: number;
      row: number;
      destroyed: boolean;
      points: number;
    };
export interface GameState {
  phase: Phase;
  previousPhase: Phase | null;
  level: number;
  lives: number;
  score: number;
  rally: number;
  bestRally: number;
  hits: number;
  elapsed: number;
  bricks: Brick[];
  paddle: Rect & { vx: number };
  ball: Ball;
  events: GameEvent[];
  revision: number;
}
export interface Contact {
  time: number;
  nx: number;
  ny: number;
}
type Collision = Contact &
  (
    | { kind: 'brick'; brick: Brick }
    | { kind: 'wall' | 'loss' | 'paddle'; brick: null }
  );
export interface GameInput {
  targetX?: number;
  axis?: number;
}
export const WIDTH = 800;
export const HEIGHT = 600;
export const LEVELS = [
  {
    name: 'OPENING SET',
    rows: [
      '1111111111',
      '1111111111',
      '1111111111',
      '1111111111',
      '1111111111',
    ],
  },
  {
    name: 'SPLIT DECISION',
    rows: [
      '2200000022',
      '1211001121',
      '1122112211',
      '0111221110',
      '0011111100',
      '0001111000',
    ],
  },
  {
    name: 'HARD COURT',
    rows: [
      '2222222222',
      '1010110101',
      '1221221221',
      '0111111110',
      '1122112211',
      '1111111111',
    ],
  },
  {
    name: 'FINAL FORMATION',
    rows: [
      '0033333300',
      '0222222220',
      '2112112112',
      '1101111011',
      '1110110111',
      '0111221110',
      '0011111100',
    ],
  },
];
const EPS = 1e-7;
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function safeBest(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(999999999, Math.floor(value))
    : 0;
}
export function createBricks(index: number): Brick[] {
  const level = LEVELS[index];
  if (!level) return [];
  const gap = 7,
    width = 64,
    height = 23,
    left = (WIDTH - (10 * width + 9 * gap)) / 2;
  return level.rows.flatMap((row, r) =>
    [...row].flatMap((value, c) =>
      value === '0'
        ? []
        : [
            {
              id: r * 10 + c,
              x: left + c * (width + gap),
              y: 71 + r * 32,
              w: width,
              h: height,
              hp: Number(value),
              maxHp: Number(value),
              row: r,
            },
          ],
    ),
  );
}
function dock(s: GameState) {
  s.ball.x = s.paddle.x;
  s.ball.y = s.paddle.y - s.ball.r - 2;
  s.ball.vx = s.ball.vy = 0;
  s.rally = 0;
}
export function createGame(): GameState {
  const state: GameState = {
    phase: 'ready',
    previousPhase: null,
    level: 0,
    lives: 3,
    score: 0,
    rally: 0,
    bestRally: 0,
    hits: 0,
    elapsed: 0,
    bricks: createBricks(0),
    paddle: { x: WIDTH / 2, y: HEIGHT - 51, w: 120, h: 14, vx: 0 },
    ball: { x: WIDTH / 2, y: HEIGHT - 61, r: 7, vx: 0, vy: 0 },
    events: [],
    revision: 0,
  };
  dock(state);
  return state;
}
export function launch(s: GameState) {
  if (!['ready', 'serve'].includes(s.phase)) return false;
  const speed = 325 + s.level * 30,
    angle = s.level % 2 ? -0.32 : 0.32;
  s.ball.vx = Math.sin(angle) * speed;
  s.ball.vy = -Math.cos(angle) * speed;
  s.phase = 'playing';
  s.revision++;
  s.events.push({ type: 'serve', x: s.ball.x, y: s.ball.y });
  return true;
}
export function pauseGame(s: GameState) {
  if (!['ready', 'serve', 'playing'].includes(s.phase)) return false;
  s.previousPhase = s.phase;
  s.phase = 'paused';
  s.paddle.vx = 0;
  s.revision++;
  return true;
}
export function resumeGame(s: GameState) {
  if (s.phase !== 'paused') return false;
  s.phase = s.previousPhase ?? 'ready';
  s.previousPhase = null;
  s.revision++;
  return true;
}
export function movePaddle(s: GameState, x: number) {
  if (!['ready', 'serve', 'playing'].includes(s.phase) || !Number.isFinite(x))
    return false;
  s.paddle.x = clamp(x, 20 + s.paddle.w / 2, WIDTH - 20 - s.paddle.w / 2);
  if (s.phase !== 'playing') dock(s);
  return true;
}

// Exact swept circle/rectangle contact: straight faces plus four circular corners.
// Expanded AABB alone would report false hits in the square space outside a corner.
export function sweepCircleRect(
  ball: Ball,
  rect: Rect,
  maxTime: number,
): Contact | null {
  const { x, y, vx, vy, r } = ball;
  const candidates: Contact[] = [];
  function add(t: number, nx: number, ny: number) {
    if (t >= -EPS && t <= maxTime + EPS && vx * nx + vy * ny < -EPS)
      candidates.push({ time: Math.max(0, t), nx, ny });
  }
  if (vx > EPS) {
    const t = (rect.x - r - x) / vx,
      at = y + vy * t;
    if (at >= rect.y - EPS && at <= rect.y + rect.h + EPS) add(t, -1, 0);
  }
  if (vx < -EPS) {
    const t = (rect.x + rect.w + r - x) / vx,
      at = y + vy * t;
    if (at >= rect.y - EPS && at <= rect.y + rect.h + EPS) add(t, 1, 0);
  }
  if (vy > EPS) {
    const t = (rect.y - r - y) / vy,
      at = x + vx * t;
    if (at >= rect.x - EPS && at <= rect.x + rect.w + EPS) add(t, 0, -1);
  }
  if (vy < -EPS) {
    const t = (rect.y + rect.h + r - y) / vy,
      at = x + vx * t;
    if (at >= rect.x - EPS && at <= rect.x + rect.w + EPS) add(t, 0, 1);
  }
  const a = vx * vx + vy * vy;
  if (a > EPS)
    for (const [cx, cy, sx, sy] of [
      [rect.x, rect.y, -1, -1],
      [rect.x + rect.w, rect.y, 1, -1],
      [rect.x, rect.y + rect.h, -1, 1],
      [rect.x + rect.w, rect.y + rect.h, 1, 1],
    ]) {
      const dx = x - cx,
        dy = y - cy,
        b = 2 * (dx * vx + dy * vy),
        c = dx * dx + dy * dy - r * r,
        disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a),
        px = x + vx * t - cx,
        py = y + vy * t - cy;
      if (px * sx >= -EPS && py * sy >= -EPS) add(t, px / r, py / r);
    }
  return candidates.sort((a, b) => a.time - b.time)[0] ?? null;
}
function loseBall(s: GameState) {
  s.lives--;
  s.revision++;
  s.events.push({ type: 'lost', x: s.ball.x, y: HEIGHT - 15 });
  if (s.lives <= 0) {
    s.phase = 'lost';
    s.ball.vx = s.ball.vy = 0;
  } else {
    s.phase = 'serve';
    dock(s);
  }
}
function clearLevel(s: GameState) {
  s.score += 500 * (s.level + 1);
  s.events.push({ type: 'clear', level: s.level });
  s.revision++;
  if (s.level === LEVELS.length - 1) {
    s.phase = 'won';
    s.score += s.lives * 300;
    s.ball.vx = s.ball.vy = 0;
  } else {
    s.level++;
    s.bricks = createBricks(s.level);
    s.paddle.w = Math.max(100, 120 - s.level * 5);
    s.phase = 'serve';
    dock(s);
  }
}
function flight(s: GameState, dt: number) {
  const ball = s.ball;
  let left = dt;
  for (
    let iteration = 0;
    iteration < 16 && left > EPS && s.phase === 'playing';
    iteration++
  ) {
    let first = left + 1;
    let contacts: Collision[] = [];
    const consider = (
      hit: Contact | null,
      kind: Collision['kind'],
      brick: Brick | null = null,
    ) => {
      if (
        !hit ||
        (kind === 'brick' && !brick) ||
        hit.time < -EPS ||
        hit.time > left + EPS
      )
        return;
      if (hit.time < first - EPS) {
        first = Math.max(0, hit.time);
        contacts = [
          kind === 'brick'
            ? { ...hit, kind, brick: brick! }
            : { ...hit, kind, brick: null },
        ];
      } else if (Math.abs(hit.time - first) <= EPS)
        contacts.push(
          kind === 'brick'
            ? { ...hit, kind, brick: brick! }
            : { ...hit, kind, brick: null },
        );
    };
    if (ball.vx < -EPS)
      consider(
        { time: (20 + ball.r - ball.x) / ball.vx, nx: 1, ny: 0 },
        'wall',
      );
    if (ball.vx > EPS)
      consider(
        { time: (WIDTH - 20 - ball.r - ball.x) / ball.vx, nx: -1, ny: 0 },
        'wall',
      );
    if (ball.vy < -EPS)
      consider(
        { time: (21 + ball.r - ball.y) / ball.vy, nx: 0, ny: 1 },
        'wall',
      );
    if (ball.vy > EPS) {
      consider(
        { time: (HEIGHT + ball.r - ball.y) / ball.vy, nx: 0, ny: -1 },
        'loss',
      );
      if (ball.y <= s.paddle.y + EPS)
        consider(
          sweepCircleRect(
            ball,
            {
              x: s.paddle.x - s.paddle.w / 2,
              y: s.paddle.y,
              w: s.paddle.w,
              h: s.paddle.h,
            },
            left,
          ),
          'paddle',
        );
    }
    for (const brick of s.bricks)
      if (brick.hp > 0)
        consider(sweepCircleRect(ball, brick, left), 'brick', brick);
    if (!contacts.length) {
      ball.x += ball.vx * left;
      ball.y += ball.vy * left;
      return;
    }
    ball.x += ball.vx * first;
    ball.y += ball.vy * first;
    left -= first;
    if (contacts.some((c) => c.kind === 'loss')) {
      loseBall(s);
      return;
    }
    const paddle = contacts.find((c) => c.kind === 'paddle' && c.ny < -0.2);
    let nx = 0,
      ny = 0;
    for (const hit of contacts) {
      nx += hit.nx;
      ny += hit.ny;
      if (hit.kind === 'brick') {
        const brick = hit.brick;
        brick.hp--;
        s.hits++;
        s.rally++;
        s.bestRally = Math.max(s.bestRally, s.rally);
        const points =
          brick.hp === 0
            ? 50 * brick.maxHp + Math.min(150, (s.rally - 1) * 10)
            : 20;
        s.score += points;
        s.revision++;
        s.events.push({
          type: 'brick',
          x: brick.x + brick.w / 2,
          y: brick.y + brick.h / 2,
          row: brick.row,
          destroyed: brick.hp === 0,
          points,
        });
      }
    }
    if (paddle) {
      const speed = Math.min(
          535,
          Math.max(325 + s.level * 30, Math.hypot(ball.vx, ball.vy)),
        ),
        offset = clamp((ball.x - s.paddle.x) / (s.paddle.w / 2), -1, 1);
      let vx = Math.sin(offset * 1.08) * speed + s.paddle.vx * 0.06;
      if (Math.abs(vx) < 24) vx = 24 * (ball.vx >= 0 ? 1 : -1);
      ball.vx = clamp(vx, -speed * 0.88, speed * 0.88);
      ball.vy = -Math.sqrt(speed * speed - ball.vx * ball.vx);
      s.rally = 0;
      nx = 0;
      ny = -1;
      s.events.push({ type: 'paddle', x: ball.x, y: s.paddle.y });
    } else {
      const length = Math.hypot(nx, ny) || 1;
      nx /= length;
      ny /= length;
      const dot = ball.vx * nx + ball.vy * ny;
      // Meeting two perpendicular faces reflects each component. Averaging
      // their normals would incorrectly exchange unequal x/y speeds.
      if (
        contacts.some((c) => c.nx !== 0 && c.ny === 0) &&
        contacts.some((c) => c.ny !== 0 && c.nx === 0)
      ) {
        ball.vx = -ball.vx;
        ball.vy = -ball.vy;
      } else {
        ball.vx -= 2 * dot * nx;
        ball.vy -= 2 * dot * ny;
      }
      if (contacts.some((c) => c.kind === 'brick')) {
        const old = Math.hypot(ball.vx, ball.vy),
          speed = Math.min(535, old * 1.006);
        ball.vx *= speed / old;
        ball.vy *= speed / old;
      }
    }
    ball.x += nx * 0.002;
    ball.y += ny * 0.002;
    if (!s.bricks.some((brick) => brick.hp > 0)) {
      clearLevel(s);
      return;
    }
  }
}
export function stepGame(s: GameState, dt: number, input: GameInput = {}) {
  if (
    !['playing', 'ready', 'serve'].includes(s.phase) ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return;
  let left = Math.min(dt, 0.25);
  while (left > EPS && ['playing', 'ready', 'serve'].includes(s.phase)) {
    const part = Math.min(left, 1 / 120),
      previousX = s.paddle.x;
    if (typeof input.targetX === 'number' && Number.isFinite(input.targetX))
      movePaddle(s, input.targetX);
    else if (typeof input.axis === 'number' && Number.isFinite(input.axis))
      movePaddle(s, s.paddle.x + clamp(input.axis, -1, 1) * 610 * part);
    s.paddle.vx = clamp((s.paddle.x - previousX) / part, -610, 610);
    if (s.phase === 'playing') {
      s.elapsed += part;
      flight(s, part);
    }
    left -= part;
  }
}
