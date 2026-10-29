interface Point {
  x: number;
  y: number;
}
interface Rect extends Point {
  w: number;
  h: number;
}
interface Saw extends Point {
  range: number;
  speed: number;
  r: number;
}
interface Level {
  name: string;
  note: string;
  platforms: Rect[];
  spikes: Rect[];
  traps: Rect[];
  saws: Saw[];
}
interface Runner extends Point {
  vx: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  time: number;
  trapStarts: (number | null)[];
  dead: boolean;
  won: boolean;
}
interface Input {
  move?: number;
  jump?: boolean;
}
import type { ArcadeApi } from '../lib/types.ts';
import {
  animate,
  clamp,
  createCanvas,
  drawText,
  listen,
  roundRect,
} from '../lib/core.ts';

const W = 28;
const H = 36;
const SPEED = 244;
const GRAVITY = 1660;
const JUMP = 620;
const platform = (x: number, y: number, w: number) => ({ x, y, w, h: 90 });
const spikes = (x: number, y: number, w = 40) => ({ x, y, w, h: 22 });

export const TRAP_LEVELS: Level[] = [
  {
    name: 'Special delivery',
    note: 'Clear the red spikes. Reach the green EXIT.',
    platforms: [platform(0, 510, 960)],
    spikes: [spikes(290, 488), spikes(578, 488, 50)],
    traps: [],
    saws: [],
  },
  {
    name: 'Mind the gap',
    note: 'Jump near the edge. You can steer in the air.',
    platforms: [
      platform(0, 510, 245),
      platform(335, 510, 220),
      platform(650, 510, 310),
    ],
    spikes: [],
    traps: [],
    saws: [],
  },
  {
    name: 'A little surprise',
    note: 'Striped tiles flash before their thorns pop up.',
    platforms: [platform(0, 510, 960)],
    spikes: [spikes(248, 488), spikes(730, 488)],
    traps: [spikes(486, 484, 60)],
    saws: [],
  },
  {
    name: 'The rooftop route',
    note: 'Climb the little islands. Every landing is a breather.',
    platforms: [
      platform(0, 510, 225),
      platform(278, 438, 170),
      platform(508, 366, 170),
      platform(739, 438, 108),
      platform(870, 510, 90),
    ],
    spikes: [spikes(579, 344, 32)],
    traps: [],
    saws: [],
  },
  {
    name: 'Garden machinery',
    note: 'Watch the wandering wheel, then hop over it.',
    platforms: [
      platform(0, 510, 240),
      platform(315, 510, 310),
      platform(710, 510, 250),
    ],
    spikes: [],
    traps: [spikes(438, 484, 52)],
    saws: [{ x: 802, y: 489, range: 48, speed: 1.9, r: 17 }],
  },
  {
    name: 'Last parcel!',
    note: 'One final crossing. Take your time, little courier.',
    platforms: [
      platform(0, 510, 210),
      platform(290, 510, 270),
      platform(643, 510, 317),
    ],
    spikes: [spikes(363, 488, 30), spikes(447, 488, 30)],
    traps: [spikes(714, 484, 48)],
    saws: [{ x: 833, y: 489, range: 29, speed: 2.1, r: 17 }],
  },
];

export function createRunner(level: Level = TRAP_LEVELS[0]): Runner {
  return {
    x: 60,
    y: level.platforms[0].y - H,
    vx: 0,
    vy: 0,
    grounded: true,
    coyote: 0.1,
    jumpBuffer: 0,
    time: 0,
    trapStarts: level.traps.map(() => null),
    dead: false,
    won: false,
  };
}

export function trapPhase(time: number, start: number | null | undefined) {
  if (start === null || start === undefined) return 'sleep';
  const phase = (((time - start) % 2.5) + 2.5) % 2.5;
  return phase < 0.55 ? 'warning' : phase < 1.35 ? 'active' : 'sleep';
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function circleHitsRunner(circle: Point & { r: number }, runner: Point) {
  const dx = circle.x - clamp(circle.x, runner.x + 3, runner.x + W - 3);
  const dy = circle.y - clamp(circle.y, runner.y + 3, runner.y + H - 2);
  return dx * dx + dy * dy < circle.r * circle.r;
}

export function sawPosition(saw: Saw, time: number) {
  return {
    x: saw.x + Math.sin(time * saw.speed) * saw.range,
    y: saw.y,
    r: saw.r,
  };
}

// The same simulation runs in the game and in the focused collision tests.
export function stepTrap(
  previous: Runner,
  level: Level,
  input: Input,
  seconds: number,
) {
  if (previous.dead || previous.won) return previous;
  const dt = clamp(seconds, 0, 1 / 30);
  const state = { ...previous, trapStarts: [...previous.trapStarts] };
  state.time += dt;
  state.coyote = previous.grounded ? 0.1 : Math.max(0, previous.coyote - dt);
  state.jumpBuffer = input.jump ? 0.12 : Math.max(0, previous.jumpBuffer - dt);
  const targetSpeed = clamp(input.move || 0, -1, 1) * SPEED;
  state.vx += clamp(targetSpeed - state.vx, -2100 * dt, 2100 * dt);
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.vy = -JUMP;
    state.coyote = 0;
    state.jumpBuffer = 0;
    state.grounded = false;
  }
  const oldX = state.x;
  state.x = clamp(state.x + state.vx * dt, 0, 960 - W);
  for (const p of level.platforms) {
    if (overlaps({ x: state.x, y: state.y + 0.1, w: W, h: H - 0.2 }, p)) {
      if (oldX + W <= p.x + 0.2) state.x = p.x - W;
      else if (oldX >= p.x + p.w - 0.2) state.x = p.x + p.w;
      else continue;
      state.vx = 0;
    }
  }
  const oldY = state.y;
  state.vy += GRAVITY * dt;
  state.y += state.vy * dt;
  state.grounded = false;
  for (const p of level.platforms) {
    if (state.x + W <= p.x || state.x >= p.x + p.w) continue;
    if (state.vy >= 0 && oldY + H <= p.y + 0.3 && state.y + H >= p.y) {
      state.y = p.y - H;
      state.vy = 0;
      state.grounded = true;
    } else if (state.vy < 0 && oldY >= p.y + p.h - 0.3 && state.y < p.y + p.h) {
      state.y = p.y + p.h;
      state.vy = 0;
    }
  }
  level.traps.forEach((trap, index) => {
    if (
      state.trapStarts[index] === null &&
      Math.abs(state.x + W / 2 - trap.x - trap.w / 2) < 150
    ) {
      state.trapStarts[index] = state.time;
    }
  });
  const hitbox = { x: state.x + 4, y: state.y + 3, w: W - 8, h: H - 5 };
  const activeSpikes = [
    ...level.spikes,
    ...level.traps.filter(
      (_, i) => trapPhase(state.time, state.trapStarts[i]) === 'active',
    ),
  ];
  state.dead =
    state.y > 612 ||
    activeSpikes.some((s) =>
      overlaps(hitbox, { x: s.x + 3, y: s.y + 6, w: s.w - 6, h: s.h - 6 }),
    ) ||
    level.saws.some((s) => circleHitsRunner(sawPosition(s, state.time), state));
  state.won =
    !state.dead && state.x + W > 900 && state.grounded && state.y + H > 495;
  return state;
}

export function sprintScore(seconds: number, deaths: number) {
  return Math.max(
    100,
    6000 - Math.round(Math.max(0, seconds) * 12) - Math.max(0, deaths) * 75,
  );
}

function drawThorns(ctx: CanvasRenderingContext2D, spike: Rect, active = true) {
  roundRect(
    ctx,
    spike.x - 4,
    spike.y + spike.h - 4,
    spike.w + 8,
    9,
    1,
    '#283736',
  );
  if (!active) return;
  const count = Math.ceil(spike.w / 16);
  for (let i = 0; i < count; i++) {
    const x = spike.x + (i * spike.w) / count;
    ctx.fillStyle = '#d54732';
    ctx.beginPath();
    ctx.moveTo(x, spike.y + spike.h);
    ctx.lineTo(x + spike.w / count / 2, spike.y);
    ctx.lineTo(x + spike.w / count, spike.y + spike.h);
    ctx.fill();
    ctx.fillStyle = '#f48958';
    ctx.beginPath();
    ctx.moveTo(x, spike.y + spike.h);
    ctx.lineTo(x + spike.w / count / 2, spike.y);
    ctx.lineTo(x + spike.w / count / 2, spike.y + spike.h);
    ctx.fill();
  }
}
function drawCourier(
  ctx: CanvasRenderingContext2D,
  state: Runner,
  dead: boolean,
  time: number,
) {
  ctx.save();
  ctx.translate(state.x + W / 2, state.y + H / 2);
  if (dead) ctx.rotate(-0.35);
  const step =
    state.grounded && Math.abs(state.vx) > 10 ? Math.sin(time * 23) * 3 : 0;
  roundRect(ctx, -13, 12 + step, 10, 6, 2, '#26312e');
  roundRect(ctx, 3, 12 - step, 10, 6, 2, '#26312e');
  roundRect(ctx, -14, -17, 28, 29, 3, '#e55e3b', '#743922');
  roundRect(ctx, -11, -14, 22, 12, 2, '#273c3b');
  roundRect(ctx, -8, -12, 14, 3, 1, '#c5e1cf');
  ctx.fillStyle = '#f2cb74';
  ctx.fillRect(-3, 0, 6, 12);
  ctx.fillStyle = '#98482b';
  ctx.fillRect(-14, 9, 28, 4);
  ctx.strokeStyle = '#27332f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(-18, 6);
  ctx.moveTo(14, 0);
  ctx.lineTo(18, 6);
  ctx.stroke();
  ctx.restore();
}
function drawScene(
  ctx: CanvasRenderingContext2D,
  state: Runner,
  level: Level,
  levelIndex: number,
  flash: number,
  message: string,
  runTime: number,
  reducedMotion: boolean,
) {
  ctx.fillStyle = '#dee3dc';
  ctx.fillRect(0, 0, 960, 600);
  ctx.strokeStyle = '#c7cfca';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 960; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }
  for (let y = 0; y <= 600; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }
  // Structural beams and hazard markings are drawn behind the collision course.
  ctx.fillStyle = '#cad3cd';
  ctx.fillRect(0, 215, 960, 10);
  ctx.fillRect(0, 300, 960, 5);
  for (let x = 25; x < 960; x += 230) {
    ctx.fillStyle = '#bcc7c1';
    ctx.fillRect(x, 110, 8, 400);
    ctx.strokeStyle = '#c4cdc6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, 217);
    ctx.lineTo(x + 115, 302);
    ctx.lineTo(x + 230, 217);
    ctx.stroke();
  }
  drawText(
    ctx,
    String(levelIndex + 1).padStart(2, '0'),
    50,
    200,
    92,
    '#b1beb6',
  );
  drawText(
    ctx,
    'TRIAL ' + String(levelIndex + 1).padStart(2, '0') + ' / 06',
    36,
    41,
    12,
    '#697b70',
  );
  drawText(ctx, level.name.toUpperCase(), 36, 72, 24, '#35493e');
  drawText(ctx, 'EXIT →', 920, 43, 13, '#49745e', 'right');
  for (const p of level.platforms) {
    ctx.fillStyle = '#283b32';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#587063';
    ctx.fillRect(p.x, p.y, p.w, 9);
    ctx.fillStyle = '#cbd1b9';
    ctx.fillRect(p.x, p.y + 1, p.w, 3);
    ctx.fillStyle = '#3c5145';
    for (let x = p.x + 15; x < p.x + p.w - 12; x += 52) {
      ctx.fillRect(x, p.y + 23, 3, 48);
      ctx.fillRect(x + 14, p.y + 23, 3, 48);
    }
    ctx.fillStyle = '#96a58d';
    for (let x = p.x + 12; x < p.x + p.w - 5; x += 70) {
      ctx.beginPath();
      ctx.arc(x, p.y + 14, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  roundRect(ctx, 883, 422, 58, 88, 2, '#2b5446');
  ctx.fillStyle = '#102e27';
  ctx.fillRect(891, 431, 42, 79);
  ctx.fillStyle = '#87b899';
  ctx.fillRect(895, 435, 34, 4);
  ctx.fillRect(924, 440, 3, 63);
  drawText(ctx, 'EXIT', 912, 457, 11, '#c5e4bf', 'center');
  ctx.strokeStyle = '#c4e1ac';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(902, 480);
  ctx.lineTo(920, 480);
  ctx.lineTo(914, 474);
  ctx.moveTo(920, 480);
  ctx.lineTo(914, 486);
  ctx.stroke();
  for (const spike of level.spikes) drawThorns(ctx, spike);
  level.traps.forEach((trap, i) => {
    const phase = trapPhase(state.time, state.trapStarts[i]);
    drawThorns(ctx, trap, phase === 'active');
    if (phase !== 'active') {
      ctx.fillStyle = phase === 'warning' ? '#edb843' : '#c5b16e';
      ctx.fillRect(trap.x, trap.y + trap.h - 4, trap.w, 6);
      ctx.fillStyle = '#3d4832';
      for (let x = trap.x + 3; x < trap.x + trap.w; x += 13)
        ctx.fillRect(x, trap.y + trap.h - 4, 5, 6);
    }
    if (phase === 'warning') {
      roundRect(
        ctx,
        trap.x + trap.w / 2 - 13,
        trap.y - 36,
        26,
        26,
        2,
        '#edb843',
      );
      drawText(
        ctx,
        '!',
        trap.x + trap.w / 2,
        trap.y - 16,
        19,
        '#463c26',
        'center',
      );
    }
  });
  for (const saw of level.saws) {
    const wheel = sawPosition(saw, state.time);
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(reducedMotion ? 0 : state.time * 4);
    ctx.fillStyle = '#56665e';
    ctx.strokeStyle = '#293b31';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        r = i % 2 ? saw.r - 5 : saw.r + 2;
      if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e4a74f';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawCourier(ctx, state, state.dead, runTime);
  if (flash > 0) {
    roundRect(ctx, 256, 102, 448, 42, 2, state.dead ? '#d95038' : '#293e33');
    drawText(ctx, message, 480, 129, 16, '#f0ecd6', 'center');
  }
}

export function mount(host: HTMLElement, api: ArcadeApi) {
  const stage = document.createElement('div');
  const controls = document.createElement('div');
  stage.className = 'game-board';
  controls.className = 'game-controls';
  host.append(stage, controls);
  const surface = createCanvas(stage, 960, 600);
  surface.canvas.setAttribute(
    'aria-label',
    'Trap Sprint: guide the courier to the blue door. Move with arrow keys or A and D. Jump with Space, W, or Up.',
  );
  const cleanups: (() => void)[] = [];
  const keys = new Set<string>();
  const touches = { left: new Set<number>(), right: new Set<number>() };
  let jumpPressed = false;
  let index = 0;
  let runner = createRunner();
  let deaths = 0;
  let runTime = 0;
  let flash = 1.8;
  let message = 'Six trials. Find your way through.';
  let respawn = 0;
  let transition = 0;
  let ended = false;
  let lastStats = '';
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const updateHint = () => api.setHint(TRAP_LEVELS[index].note);
  updateHint();
  api.setStats([
    { label: 'Route', value: '1 / 6' },
    { label: 'Time', value: '0.0s' },
    { label: 'Retries', value: 0 },
  ]);
  const buttons = [
    ['left', '← Left'],
    ['jump', 'Jump ↑'],
    ['right', 'Right →'],
  ] as const;
  for (const [action, label] of buttons) {
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
        if (api.isPaused()) return;
        if (action === 'jump') jumpPressed = true;
        else touches[action].add(event.pointerId);
      }),
    );
    const release = (event: PointerEvent) => {
      if (action !== 'jump') touches[action].delete(event.pointerId);
    };
    cleanups.push(
      listen(button, 'pointerup', release),
      listen(button, 'pointercancel', release),
      listen(button, 'lostpointercapture', release),
    );
    cleanups.push(
      listen(button, 'click', (event) => {
        if (event.detail === 0 && action === 'jump' && !api.isPaused())
          jumpPressed = true;
      }),
    );
  }
  const supported = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'KeyA',
    'KeyD',
    'KeyW',
    'Space',
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
        !host.contains(event.target instanceof Node ? event.target : null) &&
        (event.target instanceof Element
          ? event.target
          : null
        )?.closest<HTMLElement>('button, a, [role="button"]')
      )
        return;
      if (
        event.code === 'Space' &&
        event.target instanceof HTMLElement &&
        (event.target instanceof Element
          ? event.target
          : null
        )?.closest<HTMLElement>('button, a')
      )
        return;
      event.preventDefault();
      keys.add(event.code);
      if (!event.repeat && ['ArrowUp', 'KeyW', 'Space'].includes(event.code))
        jumpPressed = true;
    }),
  );
  cleanups.push(listen(window, 'keyup', (event) => keys.delete(event.code)));
  const clearInput = () => {
    keys.clear();
    touches.left.clear();
    touches.right.clear();
    jumpPressed = false;
  };
  cleanups.push(listen(window, 'blur', clearInput));
  const stop = animate((dt) => {
    if (api.isPaused()) {
      clearInput();
      drawScene(
        surface.ctx,
        runner,
        TRAP_LEVELS[index],
        index,
        flash,
        message,
        runTime,
        reducedMotion,
      );
      return;
    }
    if (!ended) {
      dt = Math.min(dt, 0.05);
      runTime += dt;
      flash = Math.max(0, flash - dt);
      if (respawn > 0) {
        respawn -= dt;
        jumpPressed = false;
        if (respawn <= 0) runner = createRunner(TRAP_LEVELS[index]);
      } else if (transition > 0) {
        transition -= dt;
        jumpPressed = false;
        if (transition <= 0) {
          index++;
          runner = createRunner(TRAP_LEVELS[index]);
          updateHint();
        }
      } else {
        const left =
          keys.has('ArrowLeft') || keys.has('KeyA') || touches.left.size > 0;
        const right =
          keys.has('ArrowRight') || keys.has('KeyD') || touches.right.size > 0;
        const movement = Number(right) - Number(left);
        let remaining = dt;
        const didJump = jumpPressed;
        jumpPressed = false;
        let first = true;
        while (remaining > 0) {
          const step = Math.min(remaining, 1 / 120);
          const oldVy = runner.vy;
          runner = stepTrap(
            runner,
            TRAP_LEVELS[index],
            { move: movement, jump: first && didJump },
            step,
          );
          if (oldVy >= 0 && runner.vy < -500) api.sound('tap');
          first = false;
          remaining -= step;
          if (runner.dead || runner.won) break;
        }
        if (runner.dead) {
          deaths++;
          respawn = 0.42;
          flash = 0.9;
          message = 'Parcel safe. Try that jump again!';
          api.sound('lose');
        } else if (runner.won) {
          api.sound('good');
          if (index === TRAP_LEVELS.length - 1) {
            ended = true;
            api.finish({
              title: 'Every parcel delivered!',
              message: `All six routes in ${runTime.toFixed(1)} seconds, with ${deaths} ${deaths === 1 ? 'retry' : 'retries'}.`,
              score: sprintScore(runTime, deaths),
              unit: 'points',
            });
          } else {
            transition = 0.65;
            flash = 0.65;
            message = 'Delivered! On to the next little adventure.';
          }
        }
      }
      const stamp = `${index}-${deaths}-${Math.floor(runTime * 5)}`;
      if (stamp !== lastStats) {
        lastStats = stamp;
        api.setStats([
          { label: 'Route', value: `${index + 1} / 6` },
          { label: 'Time', value: `${runTime.toFixed(1)}s` },
          { label: 'Retries', value: deaths },
        ]);
      }
    }
    drawScene(
      surface.ctx,
      runner,
      TRAP_LEVELS[index],
      index,
      flash,
      message,
      runTime,
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
