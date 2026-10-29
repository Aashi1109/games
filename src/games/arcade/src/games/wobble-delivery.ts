interface Cargo {
  angle: number;
  velocity: number;
}
interface Obstacle {
  x: number;
  kind: string;
  clearance: number;
  hit: boolean;
}
interface FlyingBox {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  life: number;
}
interface Dust {
  x: number;
  y: number;
  life: number;
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

export function roadHeight(x: number, route = 1) {
  return 445 + Math.sin(x / 180) * (12 + route * 3) + Math.sin(x / 63) * 5;
}

export function updateCargo(
  cargo: Cargo,
  acceleration: number,
  impulse: number,
  dt: number,
) {
  const thetaVelocity =
    cargo.velocity +
    (-cargo.angle * 17 - cargo.velocity * 4.1 - acceleration * 0.009) * dt +
    impulse;
  const angle = cargo.angle + thetaVelocity * dt;
  return { angle, velocity: thetaVelocity, lost: Math.abs(angle) > 0.68 };
}

export function deliveryScore(boxes: number, seconds: number, route: number) {
  return (
    Math.max(0, Math.floor(boxes)) * 200 +
    Math.max(0, Math.floor(85 - Math.max(0, seconds))) * 5 +
    route * 100
  );
}

export function obstacleImpact(
  obstacle: Pick<Obstacle, 'x' | 'hit' | 'clearance'>,
  previousX: number,
  currentX: number,
  heightAboveRoad: number,
) {
  return (
    !obstacle.hit &&
    previousX < obstacle.x &&
    currentX >= obstacle.x &&
    heightAboveRoad < obstacle.clearance
  );
}

const ROUTES = [
  {
    name: 'Seaside street',
    length: 2600,
    sky: '#c9e0df',
    hills: '#97b8a2',
    roof: '#dc8873',
    obstacles: [620, 1010, 1430, 1930, 2200],
  },
  {
    name: 'Orchard lane',
    length: 3100,
    sky: '#e5dcbc',
    hills: '#9baa7a',
    roof: '#bc7866',
    obstacles: [530, 910, 1210, 1640, 2020, 2450, 2740],
  },
  {
    name: 'Golden hour',
    length: 3500,
    sky: '#eccabc',
    hills: '#baa094',
    roof: '#806b87',
    obstacles: [490, 780, 1150, 1490, 1750, 2130, 2450, 2870, 3130],
  },
];

export function mount(host: HTMLElement, api: ArcadeApi) {
  const layoutMedia = window.matchMedia('(max-width:720px)');
  let compact = layoutMedia.matches;
  const surface = createCanvas(host, compact ? 720 : 960, 600);
  const { canvas, ctx } = surface;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Wobble Delivery. Drive with Left and Right arrows or A and D. Press Space or Up to hop over road bumps. Deliver boxes through three routes.',
  );
  const controls = document.createElement('div');
  controls.className = 'game-controls';
  controls.innerHTML =
    '<button class="game-action" data-drive="left" style="min-width:82px;touch-action:none" aria-label="Drive left or brake">← Brake</button><button class="game-action" data-drive="right" style="min-width:82px;touch-action:none" aria-label="Drive right">Drive →</button><button class="game-action" data-hop style="min-width:94px;touch-action:none">Hop ↑</button><span class="game-note">← → / A D to drive · Space / ↑ to hop</span>';
  host.append(controls);
  const cleanups = [
      listen(layoutMedia, 'change', (event) => {
        compact = event.matches;
        surface.setSize(compact ? 720 : 960, 600);
      }),
    ],
    keys = new Set<string>(),
    flyingBoxes: FlyingBox[] = [],
    dust: Dust[] = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let route = 1,
    course: (typeof ROUTES)[number],
    obstacles: Obstacle[],
    x: number,
    y: number,
    vx: number,
    vy: number,
    cargo: Cargo,
    boxes: number,
    score = 0,
    elapsed = 0,
    hopCooldown = 0;
  let grounded = true,
    camera = 0,
    done = false,
    transition = 0,
    lostClock = 0,
    feedback = '',
    feedbackTime = 0,
    statClock = 0;
  let wheelAngle = 0,
    previousGrade = 0,
    transitionScore = 0;
  function beginRoute() {
    course = ROUTES[route - 1];
    obstacles = course.obstacles.map((position, i) => ({
      x: position,
      kind: i % 3 === 2 ? 'puddle' : 'bump',
      clearance: i % 3 === 2 ? 12 : 24,
      hit: false,
    }));
    x = 120;
    y = roadHeight(x, route) - 27;
    vx = 0;
    vy = 0;
    camera = 0;
    elapsed = 0;
    boxes = 6;
    cargo = { angle: 0, velocity: 0 };
    grounded = true;
    hopCooldown = 0;
    lostClock = 0;
    previousGrade = 0;
    flyingBoxes.length = 0;
    dust.length = 0;
    feedback =
      route === 1
        ? 'Precious cargo. Take it easy!'
        : `Route ${route}: fresh boxes, trickier streets.`;
    feedbackTime = 3;
    api.setHint(
      'Deliver all three routes. Smooth acceleration keeps boxes balanced; hop before the striped bumps.',
    );
    updateStats();
  }
  function updateStats() {
    api.setStats([
      { label: 'Route', value: `${route} / 3` },
      { label: 'Boxes', value: `${boxes} / 6` },
      { label: 'Score', value: score },
    ]);
  }
  function finish(won: boolean) {
    if (done) return;
    done = true;
    api.sound(won ? 'win' : 'lose');
    api.finish({
      title: won
        ? 'Special delivery!'
        : boxes === 0
          ? 'The parcels took a tumble.'
          : 'The depot has closed.',
      message: won
        ? 'Three neighborhoods served. Your boxes arrived with character.'
        : boxes === 0
          ? `You reached route ${route}. Brake gently and hop over the striped road bumps.`
          : `Route ${route} took more than 85 seconds. Hold Right to keep moving.`,
      score,
      unit: 'points',
    });
  }
  function hop() {
    if (
      done ||
      api.isPaused() ||
      transition > 0 ||
      !grounded ||
      hopCooldown > 0
    )
      return;
    vy = -290;
    grounded = false;
    hopCooldown = 0.75;
    cargo.velocity += 0.15 * Math.sign(vx || 1);
    api.sound('tap');
  }
  const mapping: Record<string, string> = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
  };
  cleanups.push(
    listen(window, 'keydown', (e) => {
      if (
        done ||
        api.isPaused() ||
        ((e.target instanceof Element ? e.target : null)?.closest<HTMLElement>(
          'button, a, input, select, textarea, [contenteditable], [role="button"], [role="link"]',
        ) &&
          !host.contains(e.target instanceof Node ? e.target : null))
      )
        return;
      if (mapping[e.code] || ['Space', 'ArrowUp', 'KeyW'].includes(e.code))
        e.preventDefault();
      if (mapping[e.code]) keys.add(mapping[e.code]);
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code) && !e.repeat) hop();
    }),
  );
  cleanups.push(
    listen(window, 'keyup', (e) => {
      if (mapping[e.code]) keys.delete(mapping[e.code]);
    }),
  );
  cleanups.push(listen(window, 'blur', () => keys.clear()));
  controls.querySelectorAll<HTMLElement>('[data-drive]').forEach((button) => {
    const direction = button.dataset.drive;
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
  cleanups.push(
    listen(controls.querySelector<HTMLElement>('[data-hop]')!, 'click', hop),
  );
  function loseBox() {
    const top = boxes - 1;
    const worldX = x + Math.sin(cargo.angle) * (top * 28 + 32);
    const worldY = y - 35 - Math.cos(cargo.angle) * (top * 28 + 20);
    flyingBoxes.push({
      x: worldX,
      y: worldY,
      vx: vx + Math.sign(cargo.angle) * 95,
      vy: -95,
      angle: cargo.angle,
      spin: Math.sign(cargo.angle) * 2.5,
      life: 2,
    });
    boxes--;
    cargo.angle *= 0.42;
    cargo.velocity *= 0.25;
    lostClock = 0.7;
    feedback = boxes
      ? 'Easy does it! One parcel down.'
      : 'Oh no, the last parcel!';
    feedbackTime = 1.6;
    api.sound('lose');
    updateStats();
  }
  function step(dt: number) {
    if (done || api.isPaused()) {
      keys.clear();
      return;
    }
    if (transition > 0) {
      transition -= dt;
      if (transition <= 0) {
        route++;
        beginRoute();
      }
      return;
    }
    elapsed += dt;
    hopCooldown = Math.max(0, hopCooldown - dt);
    lostClock = Math.max(0, lostClock - dt);
    feedbackTime -= dt;
    const drive = Number(keys.has('right')) - Number(keys.has('left'));
    const beforeVx = vx,
      beforeX = x;
    vx = clamp(vx + drive * 185 * dt, -85, 210 + route * 8);
    if (!drive) vx *= Math.exp(-dt * 1.65);
    if (drive < 0 && beforeVx > 0) vx = Math.max(-85, beforeVx - 265 * dt);
    x = Math.max(76, x + vx * dt);
    if (x <= 76 && vx < 0) vx = 0;
    const acceleration = (vx - beforeVx) / dt;
    const floor = roadHeight(x, route) - 27;
    let impulse = 0;
    if (grounded) {
      y = floor;
      const grade = (roadHeight(x + 6, route) - roadHeight(x - 6, route)) / 12;
      impulse += (grade - previousGrade) * Math.abs(vx) * 0.012;
      previousGrade = grade;
    } else {
      vy += 710 * dt;
      y += vy * dt;
      if (y >= floor) {
        y = floor;
        grounded = true;
        impulse +=
          Math.min(0.55, Math.max(0, vy) * 0.0012) * Math.sign(vx || 1);
        vy = 0;
        if (!reduced)
          for (let i = 0; i < 5; i++)
            dust.push({ x: x - 15 + i * 8, y: floor + 27, life: 0.5 });
      }
    }
    const heightAboveRoad = floor - y;
    for (const obstacle of obstacles) {
      if (obstacleImpact(obstacle, beforeX, x, heightAboveRoad)) {
        obstacle.hit = true;
        if (obstacle.kind === 'bump') {
          const intensity = Math.abs(vx) / 215;
          impulse += (4.8 + route * 0.55) * intensity;
          vy = -Math.abs(vx) * 0.55;
          grounded = false;
          vx *= 0.73;
          feedback =
            intensity > 0.55
              ? 'Bumpy! Hop before the next striped curb.'
              : 'A gentle bump. Nicely handled.';
        } else {
          impulse -= (0.65 * Math.abs(vx)) / 200;
          vx *= 0.63;
          feedback = 'Puddle splash! Your parcels stayed dry.';
        }
        feedbackTime = 1.7;
      } else if (!obstacle.hit && beforeX < obstacle.x && x >= obstacle.x) {
        obstacle.hit = true;
        score += 25;
        api.sound('good');
        feedback = 'Clean hop! +25';
        feedbackTime = 1.4;
      }
    }
    const updated = updateCargo(
      cargo,
      acceleration * (0.7 + boxes * 0.08),
      impulse,
      dt,
    );
    cargo = { angle: updated.angle, velocity: updated.velocity };
    if (updated.lost && lostClock <= 0 && boxes > 0) loseBox();
    if (boxes === 0) {
      finish(false);
      return;
    }
    for (const box of flyingBoxes) {
      box.x += box.vx * dt;
      box.y += box.vy * dt;
      box.vy += 580 * dt;
      box.angle += box.spin * dt;
      box.life -= dt;
    }
    for (let i = flyingBoxes.length - 1; i >= 0; i--)
      if (flyingBoxes[i].life <= 0) flyingBoxes.splice(i, 1);
    for (const puff of dust) puff.life -= dt;
    for (let i = dust.length - 1; i >= 0; i--)
      if (dust[i].life <= 0) dust.splice(i, 1);
    camera +=
      (Math.max(0, Math.min(course.length - 650, x - 290)) - camera) *
      (1 - Math.exp(-dt * 7));
    wheelAngle += (vx * dt) / 15;
    if (x >= course.length - 65) {
      transitionScore = deliveryScore(boxes, elapsed, route);
      score += transitionScore;
      updateStats();
      if (route === 3) finish(true);
      else {
        transition = 2.2;
        vx = 0;
        api.sound('win');
      }
    }
    if (elapsed >= 85) finish(false);
    statClock += dt;
    if (statClock > 0.2) {
      statClock = 0;
      updateStats();
    }
  }

  function drawBox(
    bx: number,
    by: number,
    size: number,
    index: number,
    angle = 0,
  ) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    roundRect(
      ctx,
      -size / 2,
      -size / 2,
      size,
      size,
      1,
      index % 2 ? '#c49b62' : '#dab574',
      '#775d3d',
    );
    ctx.fillStyle = '#e9cc8c';
    ctx.fillRect(-4, -size / 2 + 1, 8, size - 2);
    ctx.fillStyle = '#fff0c5';
    ctx.fillRect(size / 2 - 12, -size / 2 + 6, 8, 8);
    ctx.fillStyle = '#8c704a';
    ctx.fillRect(-size / 2 + 4, size / 2 - 7, 7, 2);
    ctx.fillRect(-size / 2 + 4, size / 2 - 4, 7, 1);
    ctx.restore();
  }
  function warehouse(hx: number, hy: number, index: number) {
    ctx.fillStyle = index % 2 ? '#c6cfca' : '#d2d7ca';
    ctx.fillRect(hx - 60, hy - 136, 155, 136);
    ctx.fillStyle = '#acbbb4';
    ctx.fillRect(hx - 63, hy - 140, 162, 6);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#91a79f';
      ctx.fillRect(hx - 48 + i * 27, hy - 119, 19, 29);
      ctx.fillStyle = '#b6c7bb';
      ctx.fillRect(hx - 45 + i * 27, hy - 116, 13, 3);
    }
    ctx.fillStyle = '#bbc5b9';
    ctx.fillRect(hx - 46, hy - 74, 116, 72);
    ctx.strokeStyle = '#9eafa2';
    ctx.lineWidth = 2;
    for (let j = 0; j < 6; j++) {
      ctx.beginPath();
      ctx.moveTo(hx - 46, hy - 66 + j * 11);
      ctx.lineTo(hx + 70, hy - 66 + j * 11);
      ctx.stroke();
    }
    ctx.fillStyle = '#8fa297';
    ctx.fillRect(hx - 49, hy - 74, 4, 74);
    ctx.fillRect(hx + 70, hy - 74, 4, 74);
  }
  function draw() {
    ctx.fillStyle =
      route === 1 ? '#e5e8d9' : route === 2 ? '#d8e1d7' : '#d6dce0';
    ctx.fillRect(0, 0, 960, 600);
    ctx.strokeStyle = '#c7d0c3';
    ctx.lineWidth = 1;
    for (let x = 0; x < 960; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 600);
      ctx.stroke();
    }
    for (
      let i = Math.floor((camera * 0.55) / 250) - 1;
      i < Math.floor((camera * 0.55) / 250) + 6;
      i++
    ) {
      const sx = i * 250 - camera * 0.55;
      warehouse(sx, 397 + Math.sin(i * 2) * 9, i);
    }
    ctx.fillStyle = '#c0ccbf';
    ctx.fillRect(0, 402, 960, 10);
    // The painted road follows the simulation surface exactly.
    ctx.beginPath();
    ctx.moveTo(0, 600);
    for (let sx = 0; sx <= 980; sx += 8)
      ctx.lineTo(sx, roadHeight(sx + camera, route));
    ctx.lineTo(960, 600);
    ctx.closePath();
    ctx.fillStyle = '#40564b';
    ctx.fill();
    ctx.beginPath();
    for (let sx = 0; sx <= 980; sx += 8) {
      const sy = roadHeight(sx + camera, route);
      if (!sx) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = '#f3d581';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.setLineDash([24, 24]);
    ctx.strokeStyle = '#728172';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let sx = 0; sx <= 980; sx += 8) {
      const sy = roadHeight(sx + camera, route) + 35;
      if (!sx) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const obstacle of obstacles) {
      const sx = obstacle.x - camera,
        sy = roadHeight(obstacle.x, route);
      if (sx < -70 || sx > 1030) continue;
      if (obstacle.kind === 'puddle') {
        ctx.fillStyle = '#94bcb4';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 1, 36, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c2d7c5';
        ctx.beginPath();
        ctx.moveTo(sx - 17, sy);
        ctx.lineTo(sx + 12, sy);
        ctx.stroke();
      } else {
        roundRect(ctx, sx - 20, sy - 14, 40, 15, 2, '#e9b83f', '#735c24');
        ctx.strokeStyle = '#454d32';
        ctx.lineWidth = 5;
        for (let offset = -12; offset < 20; offset += 12) {
          ctx.beginPath();
          ctx.moveTo(sx + offset, sy - 11);
          ctx.lineTo(sx + offset + 5, sy - 2);
          ctx.stroke();
        }
        if (!obstacle.hit && sx - (x - camera) < 220 && sx > x - camera)
          drawText(ctx, 'HOP', sx, sy - 34, 11, '#526954', 'center');
      }
    }
    const depotX = course.length - camera,
      depotY = roadHeight(course.length, route);
    if (depotX < 1120) {
      warehouse(depotX, depotY - 5, 0);
      roundRect(ctx, depotX - 52, depotY - 168, 105, 27, 1, '#364d3e');
      drawText(
        ctx,
        'DELIVERY BAY',
        depotX,
        depotY - 150,
        12,
        '#f6e1a3',
        'center',
      );
      ctx.strokeStyle = '#deaa3e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(depotX - 84, depotY - 82);
      ctx.lineTo(depotX - 84, depotY);
      ctx.stroke();
      ctx.fillStyle = '#e7bd4b';
      ctx.fillRect(depotX - 82, depotY - 82, 35, 22);
    }
    for (const puff of dust) {
      ctx.globalAlpha = Math.max(0, puff.life);
      ctx.fillStyle = '#e6d7a5';
      ctx.beginPath();
      ctx.arc(puff.x - camera, puff.y, (0.6 - puff.life) * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sx = x - camera;
    ctx.fillStyle = '#1c332b40';
    ctx.beginPath();
    ctx.ellipse(sx, roadHeight(x, route) + 3, 48, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sx, y);
    const grade = grounded
      ? Math.atan2(roadHeight(x + 6, route) - roadHeight(x - 6, route), 12) *
        0.6
      : 0;
    ctx.rotate(grade);
    for (const wheelX of [-26, 27]) {
      ctx.save();
      ctx.translate(wheelX, 14);
      ctx.rotate(wheelAngle);
      ctx.fillStyle = '#263a32';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a4b7a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.restore();
    }
    roundRect(ctx, -43, -8, 85, 18, 2, '#d89f38', '#5b5937');
    roundRect(ctx, 17, -43, 30, 35, 3, '#d9ac50', '#606444');
    roundRect(ctx, 22, -38, 19, 18, 2, '#405d56');
    ctx.fillStyle = '#9abeb0';
    ctx.fillRect(25, -35, 12, 3);
    ctx.fillStyle = '#f5da8d';
    ctx.fillRect(39, -17, 8, 5);
    ctx.strokeStyle = '#596345';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(17, -9);
    ctx.lineTo(17, -63);
    ctx.stroke();
    ctx.save();
    ctx.translate(-10, -10);
    ctx.rotate(-cargo.angle);
    for (let i = 0; i < boxes; i++)
      drawBox(Math.sin(i * 1.7) * 2, -17 - i * 28, 31, i);
    ctx.restore();
    ctx.restore();
    for (const box of flyingBoxes)
      drawBox(box.x - camera, box.y, 31, 1, box.angle);
    roundRect(ctx, 28, 25, 266, 64, 2, '#f2e4b7');
    drawText(
      ctx,
      'ROUTE ' + String(route).padStart(2, '0'),
      43,
      47,
      compact ? 16 : 11,
      '#728060',
    );
    drawText(
      ctx,
      Math.max(0, Math.ceil((course.length - x) / 10)) + ' m TO DELIVERY',
      43,
      72,
      compact ? 22 : 19,
      '#3a5543',
    );
    roundRect(ctx, compact ? 452 : 692, 25, 240, 64, 2, '#f2e4b7');
    drawText(
      ctx,
      'CARGO BALANCE',
      compact ? 468 : 708,
      46,
      compact ? 16 : 11,
      '#657656',
    );
    ctx.fillStyle = '#d0b97d';
    ctx.fillRect(compact ? 469 : 709, 63, 206, 5);
    ctx.fillStyle = '#91a872';
    ctx.fillRect(compact ? 537 : 777, 63, 70, 5);
    const needle =
      (compact ? 572 : 812) + clamp(cargo.angle / 0.68, -1, 1) * 100;
    ctx.fillStyle = Math.abs(cargo.angle) > 0.48 ? '#c75035' : '#3a5943';
    ctx.beginPath();
    ctx.moveTo(needle, 68);
    ctx.lineTo(needle - 5, 55);
    ctx.lineTo(needle + 5, 55);
    ctx.fill();
    roundRect(ctx, 29, 557, compact ? 663 : 903, 9, 3, '#263f34');
    roundRect(
      ctx,
      31,
      559,
      Math.max(
        2,
        (compact ? 659 : 899) * clamp((x - 120) / (course.length - 185), 0, 1),
      ),
      5,
      2,
      '#efd181',
    );
    drawText(ctx, 'DISPATCH', 29, 546, compact ? 14 : 10, '#becdb1');
    drawText(
      ctx,
      'DELIVERY',
      compact ? 692 : 932,
      546,
      compact ? 14 : 10,
      '#becdb1',
      'right',
    );
    if (feedbackTime > 0) {
      roundRect(ctx, compact ? 134 : 254, 111, 452, 33, 2, '#f2e4b7');
      drawText(
        ctx,
        feedback,
        compact ? 360 : 480,
        132,
        compact ? 16 : 13,
        '#5e6946',
        'center',
      );
    }
    if (transition > 0) {
      roundRect(
        ctx,
        compact ? 193 : 313,
        232,
        334,
        125,
        3,
        '#f0d272',
        '#607044',
      );
      drawText(
        ctx,
        'DELIVERY COMPLETE',
        compact ? 360 : 480,
        274,
        25,
        '#3b583b',
        'center',
      );
      drawText(
        ctx,
        boxes + ' parcels · +' + transitionScore + ' points',
        compact ? 360 : 480,
        309,
        17,
        '#6b6840',
        'center',
      );
      drawText(
        ctx,
        'Loading your next delivery…',
        compact ? 360 : 480,
        335,
        12,
        '#6b6840',
        'center',
        400,
      );
    }
  }
  beginRoute();
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
