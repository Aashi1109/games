interface Point {
  x: number;
  y: number;
}
interface Body extends Point {
  vx: number;
  vy: number;
  r: number;
}
interface Actor extends Body {
  alive: boolean;
  dash: number;
  cooldown: number;
  color: string;
  bot: boolean;
  decision: number;
  wobble: number;
  id: number;
}
interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  color: string;
}
import type { ArcadeApi } from '../lib/types.ts';
import {
  createCanvas,
  animate,
  listen,
  clamp,
  drawText,
  roundRect,
} from '../lib/core.ts';

export function arenaRadius(time: number, round = 1) {
  return Math.max(102, 226 - Math.max(0, time - 7) * (2.0 + round * 0.35));
}

export function dashVelocity(direction: Point, charge: number) {
  const length = Math.hypot(direction.x, direction.y) || 1;
  const speed = 470 + 320 * clamp(charge, 0, 1);
  return {
    x: (direction.x / length) * speed,
    y: (direction.y / length) * speed,
  };
}

export function resolveBump(a: Body, b: Body) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const distance = Math.hypot(dx, dy),
    overlap = a.r + b.r - distance;
  if (overlap <= 0) return false;
  const nx = distance ? dx / distance : 1,
    ny = distance ? dy / distance : 0;
  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;
  const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (approach > 0) {
    const impulse = approach * 0.95;
    a.vx -= nx * impulse;
    a.vy -= ny * impulse;
    b.vx += nx * impulse;
    b.vy += ny * impulse;
  }
  return true;
}

export function outsideArena(
  body: Point & { r: number },
  radius: number,
  cx = 480,
  cy = 304,
) {
  return Math.hypot(body.x - cx, body.y - cy) > radius + body.r * 0.35;
}

export function mount(host: HTMLElement, api: ArcadeApi) {
  const layoutMedia = window.matchMedia('(max-width:720px)');
  let compact = layoutMedia.matches;
  const surface = createCanvas(host, compact ? 600 : 960, 600);
  const { canvas, ctx } = surface;
  canvas.setAttribute(
    'aria-label',
    'Bumper Ring. Move with arrow keys or WASD. Hold then release Space to charge a dash. Survive three rounds.',
  );
  canvas.tabIndex = 0;
  const controls = document.createElement('div');
  controls.className = 'game-controls';
  controls.innerHTML =
    '<div class="game-control" style="display:grid;grid-template-columns:repeat(3,44px);gap:5px" aria-label="Movement"><span></span><button class="game-action" data-direction="up" aria-label="Move up">↑</button><span></span><button class="game-action" data-direction="left" aria-label="Move left">←</button><button class="game-action" data-direction="down" aria-label="Move down">↓</button><button class="game-action" data-direction="right" aria-label="Move right">→</button></div><button class="game-action" data-charge style="min-width:150px;touch-action:none">Hold → release dash</button><span class="game-note">WASD / arrows · Hold + release Space<br>Stay in the ring. Last puck wins.</span>';
  host.append(controls);
  const cleanups = [
      listen(layoutMedia, 'change', (event) => {
        compact = event.matches;
        surface.setSize(compact ? 600 : 960, 600);
      }),
    ],
    keys = new Set<string>(),
    particles: Particle[] = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const palette = [
    '#38658a',
    '#efae64',
    '#9cab85',
    '#f0cc8d',
    '#c4816f',
    '#a99ab1',
  ];
  let actors: Actor[] = [],
    player: Actor,
    round = 1,
    score = 0,
    elapsed = 0,
    charge = 0;
  let charging = false,
    done = false,
    countdown = 1.4,
    nextRound = 0,
    statClock = 0;
  let facing = { x: 0, y: -1 };

  function startRound() {
    elapsed = 0;
    charge = 0;
    charging = false;
    nextRound = 0;
    countdown = 1.4;
    actors = Array.from({ length: round + 3 }, (_, i) => {
      const angle = Math.PI / 2 + (i * Math.PI * 2) / (round + 3);
      return {
        x: 480 + Math.cos(angle) * 135,
        y: 304 + Math.sin(angle) * 135,
        vx: 0,
        vy: 0,
        r: i ? 19 : 21,
        alive: true,
        dash: 0,
        cooldown: 0.3 + i * 0.15,
        color: palette[i],
        bot: i > 0,
        decision: 0.8 + i * 0.38,
        wobble: i,
        id: i,
      };
    });
    player = actors[0];
    facing = { x: 0, y: -1 };
    api.setHint(
      'Bump every rival outside the ring. Hold Space to charge, aim with movement, release to dash.',
    );
  }
  function finish(won: boolean) {
    if (done) return;
    done = true;
    charging = false;
    if (won) score += 600;
    api.sound(won ? 'win' : 'lose');
    api.finish({
      title: won ? 'Ring champion!' : 'Knocked out. Go again?',
      message: won
        ? 'You survived all three rounds of bumper chaos.'
        : `You reached round ${round}. Aim toward the center when charging near the edge.`,
      score,
      unit: 'points',
    });
  }
  function fire(actor: Actor, direction: Point, strength: number) {
    if (!actor.alive || actor.cooldown > 0) return;
    const velocity = dashVelocity(direction, strength);
    actor.vx = velocity.x;
    actor.vy = velocity.y;
    actor.dash = 0.22;
    actor.cooldown = 1.05;
    if (!actor.bot) api.sound('tap');
  }
  function beginCharge() {
    if (
      done ||
      api.isPaused() ||
      countdown > 0 ||
      nextRound > 0 ||
      player.cooldown > 0
    )
      return;
    charging = true;
  }
  function releaseCharge() {
    if (charging && !api.isPaused() && !done && countdown <= 0 && !nextRound)
      fire(player, facing, charge);
    charging = false;
    charge = 0;
  }
  const mapping: Record<string, string> = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
  };
  function ignoreGameplayKey(event: KeyboardEvent) {
    return (
      done ||
      api.isPaused() ||
      ((event.target instanceof Element
        ? event.target
        : null
      )?.closest<HTMLElement>(
        'button, a, input, select, textarea, [contenteditable], [role="button"], [role="link"]',
      ) &&
        !host.contains(event.target instanceof Node ? event.target : null))
    );
  }
  cleanups.push(
    listen(window, 'keydown', (e) => {
      if (ignoreGameplayKey(e)) return;
      if (mapping[e.code] || e.code === 'Space') e.preventDefault();
      if (mapping[e.code]) keys.add(mapping[e.code]);
      if (e.code === 'Space' && !e.repeat) beginCharge();
    }),
  );
  cleanups.push(
    listen(window, 'keyup', (e) => {
      if (mapping[e.code]) keys.delete(mapping[e.code]);
      if (e.code === 'Space') {
        if (ignoreGameplayKey(e)) {
          charging = false;
          charge = 0;
        } else releaseCharge();
      }
    }),
  );
  cleanups.push(
    listen(window, 'blur', () => {
      keys.clear();
      charging = false;
      charge = 0;
    }),
  );
  controls
    .querySelectorAll<HTMLElement>('[data-direction]')
    .forEach((button) => {
      button.style.touchAction = 'none';
      const direction = button.dataset.direction;
      if (!direction) return;
      cleanups.push(
        listen(button, 'pointerdown', (e) => {
          e.preventDefault();
          button.setPointerCapture(e.pointerId);
          keys.add(direction);
        }),
      );
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        cleanups.push(listen(button, name, () => keys.delete(direction)));
      cleanups.push(
        listen(button, 'keydown', (e) => {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            e.stopPropagation();
            keys.add(direction);
          }
        }),
      );
      cleanups.push(
        listen(button, 'keyup', (e) => {
          if (e.code === 'Enter' || e.code === 'Space') {
            e.stopPropagation();
            keys.delete(direction);
          }
        }),
      );
      cleanups.push(listen(button, 'blur', () => keys.delete(direction)));
    });
  const chargeButton = controls.querySelector<HTMLElement>('[data-charge]')!;
  cleanups.push(
    listen(chargeButton, 'pointerdown', (e) => {
      e.preventDefault();
      chargeButton.setPointerCapture(e.pointerId);
      beginCharge();
    }),
  );
  cleanups.push(listen(chargeButton, 'pointerup', releaseCharge));
  cleanups.push(
    listen(chargeButton, 'pointercancel', () => {
      charging = false;
      charge = 0;
    }),
  );
  cleanups.push(
    listen(chargeButton, 'lostpointercapture', () => {
      charging = false;
      charge = 0;
    }),
  );
  cleanups.push(
    listen(chargeButton, 'keydown', (e) => {
      if (e.code === 'Enter' && !e.repeat) {
        e.preventDefault();
        beginCharge();
      }
    }),
  );
  cleanups.push(
    listen(chargeButton, 'keyup', (e) => {
      if (e.code === 'Enter') releaseCharge();
    }),
  );

  function burst(actor: Point) {
    if (reduced) return;
    for (let i = 0; i < 12; i++)
      particles.push({
        x: actor.x,
        y: actor.y,
        vx: Math.cos((i * Math.PI) / 6) * 95,
        vy: Math.sin((i * Math.PI) / 6) * 80,
        life: 0.65,
        color: '#fff9de',
      });
  }
  function step(dt: number) {
    if (done || api.isPaused()) {
      keys.clear();
      charging = false;
      charge = 0;
      return;
    }
    if (countdown > 0) {
      countdown -= dt;
      return;
    }
    if (nextRound > 0) {
      nextRound -= dt;
      if (nextRound <= 0) {
        round++;
        startRound();
      }
      return;
    }
    elapsed += dt;
    const radius = arenaRadius(elapsed, round);
    let mx = Number(keys.has('right')) - Number(keys.has('left')),
      my = Number(keys.has('down')) - Number(keys.has('up'));
    const length = Math.hypot(mx, my);
    if (length) {
      mx /= length;
      my /= length;
      facing = { x: mx, y: my };
    }
    if (charging) charge = Math.min(1, charge + dt / 0.85);
    for (const actor of actors) {
      if (!actor.alive) continue;
      actor.cooldown = Math.max(0, actor.cooldown - dt);
      actor.dash = Math.max(0, actor.dash - dt);
      let dx = mx,
        dy = my,
        speed = charging ? 75 : 155;
      if (actor.bot) {
        const edgeDistance = Math.hypot(actor.x - 480, actor.y - 304);
        const vulnerable = edgeDistance > radius - 58;
        const tx = vulnerable ? 480 : player.x,
          ty = vulnerable ? 304 : player.y;
        dx = tx - actor.x;
        dy = ty - actor.y;
        const norm = Math.hypot(dx, dy) || 1;
        dx /= norm;
        dy /= norm;
        speed = 98 + round * 12;
        actor.decision -= dt;
        if (
          !vulnerable &&
          norm < 170 &&
          norm > 40 &&
          actor.decision <= 0 &&
          actor.cooldown <= 0
        ) {
          const error = Math.sin(elapsed * 3 + actor.id * 2) * 0.25;
          fire(actor, { x: dx + error, y: dy - error }, 0.2 + round * 0.12);
          actor.decision = 1.4 + actor.id * 0.17;
        }
      }
      if (actor.dash <= 0) {
        const blend = 1 - Math.exp(-dt * 4.7);
        actor.vx += (dx * speed - actor.vx) * blend;
        actor.vy += (dy * speed - actor.vy) * blend;
      }
      actor.x += actor.vx * dt;
      actor.y += actor.vy * dt;
    }
    for (let i = 0; i < actors.length; i++)
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i],
          b = actors[j];
        if (a.alive && b.alive && resolveBump(a, b)) {
          if (
            (a.dash > 0 || b.dash > 0) &&
            (a === player || b === player) &&
            !reduced
          )
            burst({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    for (const actor of actors)
      if (actor.alive && outsideArena(actor, radius)) {
        actor.alive = false;
        burst(actor);
        if (actor.bot) {
          score += 150;
          api.sound('good');
        }
      }
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    for (let i = particles.length - 1; i >= 0; i--)
      if (particles[i].life <= 0) particles.splice(i, 1);
    if (!player.alive) {
      finish(false);
      return;
    }
    if (!actors.some((a) => a.bot && a.alive)) {
      score += Math.max(50, 250 - Math.floor(elapsed * 2));
      if (round === 3) finish(true);
      else {
        nextRound = 1.6;
        api.sound('win');
      }
    }
    statClock += dt;
    if (statClock > 0.15) {
      statClock = 0;
      api.setStats([
        { label: 'Round', value: `${round} / 3` },
        {
          label: 'Rivals',
          value: actors.filter((a) => a.bot && a.alive).length,
        },
        { label: 'Score', value: score },
      ]);
    }
  }
  function drawActor(actor: Actor) {
    const angle =
      actor === player
        ? Math.atan2(facing.y, facing.x)
        : Math.atan2(actor.vy, actor.vx);
    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.fillStyle = '#481b2340';
    ctx.beginPath();
    ctx.ellipse(1, 7, actor.r + 5, actor.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#28282d';
    ctx.beginPath();
    ctx.arc(0, 0, actor.r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = actor.color;
    ctx.beginPath();
    ctx.arc(0, -2, actor.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe7bf99';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, actor.r - 4, Math.PI * 1.1, Math.PI * 1.8);
    ctx.stroke();
    ctx.strokeStyle = '#63352870';
    ctx.beginPath();
    ctx.arc(0, -2, actor.r - 7, 0, Math.PI * 2);
    ctx.stroke();
    drawText(
      ctx,
      actor === player ? '01' : String(actor.id + 1).padStart(2, '0'),
      0,
      3,
      14,
      actor === player ? '#fff4d6' : '#42282c',
      'center',
    );
    if (actor === player) {
      ctx.strokeStyle = '#fff5d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, actor.r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(angle);
      ctx.fillStyle = '#fff2ca';
      ctx.beginPath();
      ctx.moveTo(actor.r + 18, 0);
      ctx.lineTo(actor.r + 9, -5);
      ctx.lineTo(actor.r + 9, 5);
      ctx.fill();
    }
    ctx.restore();
  }
  function draw() {
    const radius = arenaRadius(elapsed, round);
    ctx.save();
    if (compact) ctx.translate(-180, 0);
    ctx.fillStyle = '#c7483b';
    ctx.fillRect(0, 0, 960, 600);
    for (let x = 0; x < 960; x += 48) {
      ctx.fillStyle = x % 96 ? '#c34437' : '#ce4d40';
      ctx.fillRect(x, 0, 46, 600);
    }
    ctx.strokeStyle = '#a9342c';
    ctx.lineWidth = 12;
    ctx.strokeRect(compact ? 195 : 15, 15, compact ? 570 : 930, 570);
    ctx.fillStyle = '#973428';
    ctx.beginPath();
    ctx.arc(480, 313, 238, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c49764';
    ctx.beginPath();
    ctx.arc(480, 304, 234, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a7372d';
    ctx.beginPath();
    ctx.arc(480, 304, 226, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0d9a8';
    ctx.beginPath();
    ctx.arc(480, 304, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(480, 304, radius - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = '#d8bf91';
    ctx.lineWidth = 1;
    for (let y = 100; y < 550; y += 23) {
      ctx.beginPath();
      ctx.moveTo(245, y);
      ctx.lineTo(715, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b94637';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(252, 304);
    ctx.lineTo(708, 304);
    ctx.arc(480, 304, 65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#fcf0c9';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(480, 304, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#af3b2e';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 9]);
    ctx.beginPath();
    ctx.arc(480, 304, radius - 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, 'YOU', compact ? 208 : 44, 58, 12, '#f2d3a1');
    drawText(ctx, '01', compact ? 208 : 43, 107, 45, '#fff0c9');
    drawText(ctx, 'RING', compact ? 752 : 920, 58, 12, '#f2d3a1', 'right');
    drawText(
      ctx,
      elapsed < 7 ? Math.ceil(7 - elapsed) + 's' : 'CLOSING',
      compact ? 752 : 920,
      88,
      elapsed < 7 ? 29 : 18,
      '#fff0c9',
      'right',
    );
    actors
      .filter((a) => a.alive)
      .sort((a, b) => a.y - b.y)
      .forEach(drawActor);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const fill = charging
      ? charge
      : player.cooldown > 0
        ? 1 - player.cooldown / 1.05
        : 1;
    roundRect(ctx, 317, 555, 326, 21, 10, '#983b2d');
    roundRect(
      ctx,
      319,
      557,
      Math.max(1, 322 * fill),
      17,
      8,
      charging ? '#ffcf6b' : player.cooldown > 0 ? '#bc7762' : '#f4d79d',
    );
    drawText(
      ctx,
      charging
        ? 'CHARGE ' + Math.round(charge * 100) + '%'
        : player.cooldown > 0
          ? 'RECHARGING'
          : 'HOLD · AIM · RELEASE',
      480,
      571,
      10,
      '#652c27',
      'center',
    );
    if (countdown > 0 || nextRound > 0) {
      roundRect(ctx, 331, 249, 298, 102, 3, '#f3dfb9');
      drawText(
        ctx,
        nextRound > 0 ? 'ROUND WON' : 'ROUND ' + round,
        480,
        294,
        30,
        '#a1362a',
        'center',
      );
      drawText(
        ctx,
        nextRound > 0 ? 'Next challengers incoming' : 'Hold your ground.',
        480,
        324,
        14,
        '#93634c',
        'center',
      );
    }
    ctx.restore();
  }
  startRound();
  api.setStats([
    { label: 'Round', value: '1 / 3' },
    { label: 'Rivals', value: 3 },
    { label: 'Score', value: 0 },
  ]);
  const stop = animate((dt) => {
    for (let left = Math.min(dt, 0.05); left > 0; left -= 1 / 120)
      step(Math.min(left, 1 / 120));
    draw();
  });
  draw();
  return () => {
    done = true;
    stop();
    cleanups.forEach((fn) => fn());
    surface.destroy();
    controls.remove();
  };
}
