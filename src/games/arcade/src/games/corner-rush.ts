interface Point {
  x: number;
  y: number;
}
interface Gate extends Point {
  angle: number;
}
interface Course {
  points: (Point & { distance: number })[];
  length: number;
  width: number;
  checkpoints: Gate[];
}
interface Progress {
  laps: number;
  nextGate: number;
  gates: number;
}
interface Car extends Gate {
  speed: number;
  offRoad: boolean;
}
import type { ArcadeApi } from '../lib/types.ts';
import {
  animate,
  clamp,
  createCanvas,
  daySeed,
  drawText,
  listen,
  roundRect,
  seeded,
} from '../lib/core.ts';

export const RACE_LAPS = 3;
export const TIME_LIMIT = 150;
const ROAD_WIDTH = 94;
const TAU = Math.PI * 2;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function catmull(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3)
  );
}

export function pointAlongCourse(course: Course, fraction: number) {
  const target = (((fraction % 1) + 1) % 1) * course.length;
  let index = 0;
  while (
    index < course.points.length - 1 &&
    course.points[index + 1].distance <= target
  )
    index++;
  const a = course.points[index];
  const b = course.points[(index + 1) % course.points.length];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const t = length > 0 ? (target - a.distance) / length : 0;
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

export function makeCourse(seed: string | number) {
  const rng = seeded(`corner-rush:${seed}`);
  const anchors = Array.from({ length: 12 }, (_, i) => {
    const angle = Math.PI / 2 + (i / 12) * TAU;
    return {
      x: 480 + Math.cos(angle) * (332 + (rng() - 0.5) * 39),
      y: 309 + Math.sin(angle) * (173 + (rng() - 0.5) * 26),
    };
  });
  const points = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[(i + 11) % 12];
    const b = anchors[i];
    const c = anchors[(i + 1) % 12];
    const d = anchors[(i + 2) % 12];
    for (let step = 0; step < 20; step++) {
      const t = step / 20;
      points.push({
        x: catmull(a.x, b.x, c.x, d.x, t),
        y: catmull(a.y, b.y, c.y, d.y, t),
        distance: 0,
      });
    }
  }
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    points[i].distance = length;
    const next = points[(i + 1) % points.length];
    length += Math.hypot(next.x - points[i].x, next.y - points[i].y);
  }
  const course: Course = { points, length, width: ROAD_WIDTH, checkpoints: [] };
  course.checkpoints = Array.from({ length: 8 }, (_, i) =>
    pointAlongCourse(course, i / 8),
  );
  return course;
}

export function nearestTrackPoint(course: Course, x: number, y: number) {
  let best = { distance: Infinity, x: 0, y: 0, angle: 0, fraction: 0 };
  for (let i = 0; i < course.points.length; i++) {
    const a = course.points[i];
    const b = course.points[(i + 1) % course.points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq > 0
        ? clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSq, 0, 1)
        : 0;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const distance = Math.hypot(x - px, y - py);
    if (distance < best.distance)
      best = {
        distance,
        x: px,
        y: py,
        angle: Math.atan2(dy, dx),
        fraction: (a.distance + Math.sqrt(lengthSq) * t) / course.length,
      };
  }
  return best;
}

export function crossedGate(
  previous: Point,
  next: Point,
  gate: Gate,
  halfWidth = ROAD_WIDTH / 2,
) {
  const tx = Math.cos(gate.angle);
  const ty = Math.sin(gate.angle);
  const before = (previous.x - gate.x) * tx + (previous.y - gate.y) * ty;
  const after = (next.x - gate.x) * tx + (next.y - gate.y) * ty;
  if (before >= 0 || after < 0) return false;
  const t = -before / (after - before);
  const x = mix(previous.x, next.x, t) - gate.x;
  const y = mix(previous.y, next.y, t) - gate.y;
  return Math.abs(-x * ty + y * tx) <= halfWidth;
}

export function advanceRace(
  progress: Progress,
  previous: Point,
  next: Point,
  course: Course,
) {
  if (
    progress.laps >= RACE_LAPS ||
    !crossedGate(
      previous,
      next,
      course.checkpoints[progress.nextGate],
      course.width / 2,
    )
  )
    return progress;
  return {
    laps: progress.laps + Number(progress.nextGate === 0),
    nextGate: (progress.nextGate + 1) % course.checkpoints.length,
    gates: progress.gates + 1,
  };
}

export function raceScore(seconds: number, gates: number, completed: boolean) {
  return completed
    ? Math.max(3000, 20000 - Math.round(Math.max(0, seconds) * 100))
    : clamp(gates, 0, 23) * 100;
}

export function driveCar(
  previous: Car,
  course: Course,
  steering: number,
  dt: number,
) {
  dt = clamp(dt, 0, 1 / 30);
  const proximity = nearestTrackPoint(course, previous.x, previous.y);
  const offRoad = proximity.distance > course.width / 2 - 8;
  const targetSpeed = offRoad ? 62 : 190;
  const speed =
    previous.speed + clamp(targetSpeed - previous.speed, -350 * dt, 145 * dt);
  const angle =
    previous.angle + clamp(steering, -1, 1) * (1.35 + speed / 170) * dt;
  let x = previous.x + Math.cos(angle) * speed * dt;
  let y = previous.y + Math.sin(angle) * speed * dt;
  const wall = x < 15 || x > 945 || y < 75 || y > 585;
  x = clamp(x, 15, 945);
  y = clamp(y, 75, 585);
  return { x, y, angle, speed: wall ? Math.min(speed, 35) : speed, offRoad };
}

const formatTime = (value: number) =>
  `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, '0')}`;

function strokeCourse(
  ctx: CanvasRenderingContext2D,
  course: Course,
  color: string,
  width: number,
  dash: number[] = [],
) {
  ctx.beginPath();
  ctx.moveTo(course.points[0].x, course.points[0].y);
  for (let i = 1; i < course.points.length; i++)
    ctx.lineTo(course.points[i].x, course.points[i].y);
  ctx.closePath();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  gate: Gate,
  index: number,
  active: boolean,
  isFinish: boolean,
) {
  ctx.save();
  ctx.translate(gate.x, gate.y);
  ctx.rotate(gate.angle);
  if (isFinish) {
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#fff2d9' : '#303f40';
        ctx.fillRect(j * 8 - 8, i * 8.5 - 42.5, 8, 8.5);
      }
  } else {
    ctx.strokeStyle = active ? '#ffe5a1' : '#eee1bf66';
    ctx.lineWidth = active ? 4 : 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(0, -39);
    ctx.lineTo(0, 39);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const side of [-1, 1]) {
    const y = side * 54;
    roundRect(
      ctx,
      -5,
      y - 5,
      10,
      10,
      3,
      active ? '#dc7051' : '#e7c599',
      '#85674c',
    );
  }
  ctx.restore();
  if (active) {
    const x = gate.x - Math.sin(gate.angle) * 72;
    const y = gate.y + Math.cos(gate.angle) * 72;
    roundRect(ctx, x - 24, y - 12, 48, 25, 12, '#fff1cf', '#9b7148');
    drawText(ctx, isFinish ? 'LAP' : 'NEXT', x, y + 4, 10, '#775239', 'center');
  }
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: Car,
  time: number,
  reducedMotion: boolean,
) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = '#1d243750';
  ctx.beginPath();
  ctx.ellipse(-2, 4, 25, 15, 0, 0, TAU);
  ctx.fill();
  if (car.offRoad && !reducedMotion) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(175,184,183,${0.4 - i * 0.1})`;
      ctx.beginPath();
      ctx.arc(-25 - i * 10, Math.sin(time * 13 + i) * 8, 3 + i * 2, 0, TAU);
      ctx.fill();
    }
  }
  for (const x of [-14, 10])
    for (const y of [-15, 9]) roundRect(ctx, x, y, 10, 6, 1, '#17232d');
  roundRect(ctx, -23, -10, 46, 20, 5, '#e6ece3', '#313c43');
  roundRect(ctx, 7, -9, 13, 18, 2, '#d34032');
  ctx.fillStyle = '#d34032';
  ctx.fillRect(-21, -3, 36, 6);
  roundRect(ctx, -10, -8, 16, 16, 3, '#244454');
  roundRect(ctx, -7, -6, 7, 12, 1, '#80b8ba');
  ctx.fillStyle = '#1b2c36';
  ctx.fillRect(-25, -14, 4, 28);
  ctx.fillStyle = '#f2d98a';
  ctx.fillRect(20, -7, 3, 4);
  ctx.fillRect(20, 3, 3, 4);
  ctx.restore();
}
function drawScene(
  ctx: CanvasRenderingContext2D,
  course: Course,
  car: Car,
  progress: Progress,
  countdown: number,
  elapsed: number,
  toast: string,
  toastTime: number,
  seed: string,
  reducedMotion: boolean,
) {
  ctx.fillStyle = '#aebbb8';
  ctx.fillRect(0, 0, 960, 600);
  ctx.strokeStyle = '#a0aeab';
  ctx.lineWidth = 1;
  for (let y = 70; y < 580; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }
  strokeCourse(ctx, course, '#758e84', ROAD_WIDTH + 40);
  strokeCourse(ctx, course, '#e4e4d7', ROAD_WIDTH + 17);
  strokeCourse(ctx, course, '#c74336', ROAD_WIDTH + 17, [18, 18]);
  strokeCourse(ctx, course, '#34464c', ROAD_WIDTH);
  strokeCourse(ctx, course, '#657775', ROAD_WIDTH - 10);
  strokeCourse(ctx, course, '#3a4a4e', ROAD_WIDTH - 15);
  strokeCourse(ctx, course, '#c2cbbb', 2, [12, 22]);
  // Infield service bays make the track read as a circuit rather than a postcard.
  roundRect(ctx, 392, 251, 184, 105, 2, '#cbd1c8', '#95a6a0');
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = '#a3b0a8';
    ctx.beginPath();
    ctx.moveTo(410 + i * 26, 257);
    ctx.lineTo(410 + i * 26, 347);
    ctx.stroke();
  }
  drawText(
    ctx,
    String(progress.laps + 1).padStart(2, '0'),
    490,
    314,
    57,
    '#728a83',
    'center',
  );
  drawText(ctx, 'CURRENT LAP', 490, 338, 10, '#657a71', 'center');
  for (let i = 0; i < 8; i++) {
    const arrow = pointAlongCourse(course, (i + 0.46) / 8);
    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(arrow.angle);
    ctx.strokeStyle = '#d2d6bc55';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.lineTo(4, 0);
    ctx.lineTo(-6, 10);
    ctx.stroke();
    ctx.restore();
  }
  course.checkpoints.forEach((gate, i) =>
    drawGate(ctx, gate, i, i === progress.nextGate, i === 0),
  );
  drawCar(ctx, car, elapsed, reducedMotion);
  roundRect(ctx, 21, 18, 230, 51, 1, '#23323b');
  drawText(ctx, 'DAILY TIME ATTACK', 36, 40, 13, '#ebede0');
  drawText(ctx, seed, 36, 58, 11, '#a9babd');
  roundRect(ctx, 737, 18, 202, 51, 1, '#23323b');
  drawText(
    ctx,
    String(Math.max(0, Math.ceil(TIME_LIMIT - elapsed))).padStart(3, '0'),
    836,
    53,
    32,
    '#f1eee1',
    'center',
  );
  drawText(ctx, 'SEC', 915, 52, 11, '#a9babd', 'right');
  if (countdown > 0) {
    roundRect(ctx, 401, 224, 158, 130, 3, '#edf0df');
    drawText(
      ctx,
      String(Math.ceil(countdown)),
      480,
      302,
      65,
      '#c94838',
      'center',
    );
    drawText(ctx, 'ON YOUR MARK', 480, 334, 11, '#536164', 'center');
  } else if (toastTime > 0) {
    roundRect(ctx, 289, 85, 382, 38, 2, '#e8ecd9');
    drawText(ctx, toast, 480, 109, 15, '#374c46', 'center');
  }
  if (car.offRoad && countdown <= 0) {
    roundRect(ctx, 358, 553, 244, 28, 2, '#f2cb79');
    drawText(
      ctx,
      'OFF TRACK · LOSING SPEED',
      480,
      572,
      11,
      '#624a29',
      'center',
    );
  }
}

export function mount(host: HTMLElement, api: ArcadeApi) {
  const seed = daySeed();
  const course = makeCourse(seed);
  const start = pointAlongCourse(course, 0.007);
  let car = { ...start, speed: 0, offRoad: false };
  let progress = { laps: 0, nextGate: 1, gates: 0 };
  let elapsed = 0;
  let countdown = 2.6;
  let toast = 'Follow the arrows. Pass every gate.';
  let toastTime = 4;
  let ended = false;
  let resetCooldown = 0;
  let lastStats = '';
  const storedBest = Number(api.load(`corner-rush-${seed}`, 0));
  const dailyBest =
    Number.isFinite(storedBest) && storedBest > 0 ? storedBest : 0;
  const keys = new Set<string>();
  const touch = { left: new Set<number>(), right: new Set<number>() };
  const cleanups: (() => void)[] = [];
  const stage = document.createElement('div');
  stage.className = 'game-board';
  const controls = document.createElement('div');
  controls.className = 'game-controls';
  host.append(stage, controls);
  const surface = createCanvas(stage, 960, 600);
  surface.canvas.setAttribute(
    'aria-label',
    'Corner Rush: drive three laps through all eight gates. The car accelerates automatically. Left and right arrows or A and D steer. R returns to your last gate with a four second penalty.',
  );
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  api.setHint(
    'Pass every NEXT gate in order. Return to your last gate with R or the recovery button (+4s).',
  );

  function returnToTrack() {
    if (ended || api.isPaused() || countdown > 0 || resetCooldown > 0) return;
    const lastGate = (progress.nextGate + 7) % 8;
    const restart = pointAlongCourse(course, lastGate / 8 + 0.005);
    car = { ...restart, speed: 0, offRoad: false };
    elapsed += 4;
    resetCooldown = 1.2;
    toast = 'Back at your last gate. +4 seconds';
    toastTime = 2.4;
    api.sound('tap');
  }

  for (const [action, label] of [
    ['left', '← Steer left'],
    ['right', 'Steer right →'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-control';
    button.textContent = label;
    button.style.touchAction = 'none';
    button.style.userSelect = 'none';
    controls.append(button);
    cleanups.push(
      listen(button, 'pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        if (!api.isPaused()) touch[action].add(event.pointerId);
      }),
    );
    const release = (event: PointerEvent) =>
      touch[action].delete(event.pointerId);
    cleanups.push(
      listen(button, 'pointerup', release),
      listen(button, 'pointercancel', release),
      listen(button, 'lostpointercapture', release),
    );
  }
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'game-action';
  resetButton.textContent = 'Return to track +4s';
  controls.append(resetButton);
  cleanups.push(listen(resetButton, 'click', returnToTrack));
  const supported = new Set([
    'ArrowLeft',
    'ArrowRight',
    'KeyA',
    'KeyD',
    'KeyR',
  ]);
  cleanups.push(
    listen(window, 'keydown', (event) => {
      if (!supported.has(event.code)) return;
      if (ended || api.isPaused()) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        !host.contains(event.target) &&
        (event.target instanceof Element
          ? event.target
          : null
        )?.closest<HTMLElement>('button, a, [role="button"]')
      )
        return;
      event.preventDefault();
      keys.add(event.code);
      if (event.code === 'KeyR' && !event.repeat) returnToTrack();
    }),
  );
  cleanups.push(listen(window, 'keyup', (event) => keys.delete(event.code)));
  const clearInput = () => {
    keys.clear();
    touch.left.clear();
    touch.right.clear();
  };
  cleanups.push(listen(window, 'blur', clearInput));

  function finish(won: boolean) {
    if (ended) return;
    ended = true;
    if (won && (!dailyBest || elapsed < dailyBest))
      api.save(`corner-rush-${seed}`, Number(elapsed.toFixed(2)));
    api.finish({
      title: won ? 'Three laps. Lovely driving!' : 'The picnic bell rang!',
      message: won
        ? `${formatTime(elapsed)} for today's three laps.${!dailyBest || elapsed < dailyBest ? ' A new daily personal best!' : ` Your daily best is ${formatTime(dailyBest)}.`}`
        : `You completed ${progress.laps} ${progress.laps === 1 ? 'lap' : 'laps'} and ${progress.gates} gates. Try gentle taps of the steering.`,
      score: raceScore(elapsed, progress.gates, won),
      unit: 'points',
    });
  }

  api.setStats([
    { label: 'Lap', value: '1 / 3' },
    { label: 'Time', value: formatTime(0) },
    {
      label: 'Daily best',
      value: dailyBest ? formatTime(dailyBest) : 'Set one!',
    },
  ]);
  const stop = animate((dt) => {
    if (api.isPaused()) {
      clearInput();
      drawScene(
        surface.ctx,
        course,
        car,
        progress,
        countdown,
        elapsed,
        toast,
        toastTime,
        seed,
        reducedMotion,
      );
      return;
    }
    dt = Math.min(dt, 0.05);
    if (!ended) {
      if (countdown > 0) countdown -= dt;
      else {
        elapsed += dt;
        toastTime = Math.max(0, toastTime - dt);
        resetCooldown = Math.max(0, resetCooldown - dt);
        const left =
          keys.has('ArrowLeft') || keys.has('KeyA') || touch.left.size > 0;
        const right =
          keys.has('ArrowRight') || keys.has('KeyD') || touch.right.size > 0;
        const steering = Number(right) - Number(left);
        let remaining = dt;
        while (remaining > 0) {
          const step = Math.min(remaining, 1 / 120);
          const previous = car;
          car = driveCar(car, course, steering, step);
          const oldProgress = progress;
          progress = advanceRace(progress, previous, car, course);
          if (progress.gates !== oldProgress.gates)
            api.sound(progress.laps !== oldProgress.laps ? 'good' : 'tap');
          if (progress.laps !== oldProgress.laps) {
            toast = `${progress.laps} / 3 laps. Keep that little car rolling!`;
            toastTime = 2;
          }
          remaining -= step;
          if (progress.laps >= RACE_LAPS) {
            finish(true);
            break;
          }
        }
        if (!ended && elapsed >= TIME_LIMIT) finish(false);
      }
      const stamp = `${progress.laps}-${Math.floor(elapsed * 5)}`;
      if (stamp !== lastStats) {
        lastStats = stamp;
        api.setStats([
          { label: 'Lap', value: `${Math.min(3, progress.laps + 1)} / 3` },
          { label: 'Time', value: formatTime(elapsed) },
          {
            label: 'Daily best',
            value: dailyBest ? formatTime(dailyBest) : 'Set one!',
          },
        ]);
      }
    }
    drawScene(
      surface.ctx,
      course,
      car,
      progress,
      countdown,
      elapsed,
      toast,
      toastTime,
      seed,
      reducedMotion,
    );
  });
  return () => {
    stop();
    cleanups.forEach((cleanup) => cleanup());
    surface.destroy();
    stage.remove();
    controls.remove();
  };
}
