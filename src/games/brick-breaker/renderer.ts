import type { GameState, GameEvent, Brick } from './engine.ts';
interface Point {
  x: number;
  y: number;
}
interface Chip extends Point {
  vx: number;
  vy: number;
  life: number;
  rotation: number;
  color: string;
  size: number;
}
interface Ring extends Point {
  life: number;
  duration: number;
  color: string;
  radius: number;
}
interface ScorePoint extends Point {
  life: number;
  text: string;
}
import { WIDTH, HEIGHT } from './engine.ts';

const materials = [
  { light: '#ffc1a0', face: '#f38662', dark: '#b34432', edge: '#ffb38e' },
  { light: '#ffebae', face: '#ebbc58', dark: '#a87428', edge: '#ffe29d' },
  { light: '#b3faff', face: '#54c5dc', dark: '#217e9d', edge: '#a0effb' },
  { light: '#8de5fa', face: '#42b2d5', dark: '#286eac', edge: '#96e8fb' },
  { light: '#ffe3a2', face: '#eeb45b', dark: '#af7130', edge: '#ffda91' },
  { light: '#ffc0ac', face: '#ed846f', dark: '#a3434a', edge: '#ffb7a1' },
  { light: '#b4f7ff', face: '#65c4e5', dark: '#397db3', edge: '#bcf4ff' },
];

function bevelPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut = 3,
) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function makeSurface() {
  const surface = document.createElement('canvas');
  surface.width = WIDTH;
  surface.height = HEIGHT;
  const c = surface.getContext('2d')!;
  c.fillStyle = '#f5f2e5';
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.strokeStyle = '#bbc3ae';
  c.lineWidth = 1;
  c.strokeRect(15.5, 15.5, 769, 554);
  c.strokeStyle = '#e0e2d3';
  c.beginPath();
  c.moveTo(16, 310);
  c.lineTo(784, 310);
  c.stroke();
  c.beginPath();
  c.arc(400, 310, 63, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = '#b1372520';
  c.beginPath();
  c.moveTo(16, 568);
  c.lineTo(784, 568);
  c.stroke();
  c.fillStyle = '#76816b';
  c.font = '11px Text, sans-serif';
  c.textAlign = 'left';
  c.fillText('01 — PRECISION COURT', 32, 43);
  c.textAlign = 'right';
  c.fillText('KEEP THE BALL IN PLAY', 768, 43);
  for (let i = 0; i < 28; i++) {
    c.fillStyle = '#b1b9a9';
    c.fillRect(15, 70 + i * 17, 5, 1);
    c.fillRect(780, 70 + i * 17, 5, 1);
  }
  return surface;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  reducedMotion: MediaQueryList,
) {
  const ctx = canvas.getContext('2d')!,
    surface = makeSurface();
  let chips: Chip[] = [],
    rings: Ring[] = [],
    points: ScorePoint[] = [],
    trail: Point[] = [],
    paddleLight = 0;
  const flashes = new Map<string, number>();
  function reset() {
    chips = [];
    rings = [];
    points = [];
    trail = [];
    flashes.clear();
    paddleLight = 0;
  }
  function event(event: GameEvent) {
    if (['serve', 'lost', 'clear'].includes(event.type)) trail = [];
    if (reducedMotion.matches) return;
    if (event.type === 'paddle') {
      paddleLight = 1;
      rings.push({
        x: event.x,
        y: event.y,
        life: 0.22,
        duration: 0.22,
        color: '#c0f4ff',
        radius: 4,
      });
    }
    if (event.type !== 'brick') return;
    const color = materials[event.row % materials.length].edge;
    flashes.set(`${event.x}/${event.y}`, 0.14);
    rings.push({
      x: event.x,
      y: event.y,
      life: 0.3,
      duration: 0.3,
      color,
      radius: 6,
    });
    points.push({
      x: event.x,
      y: event.y - 6,
      text: `+${event.points}`,
      life: 0.7,
    });
    for (let i = 0; i < (event.destroyed ? 10 : 4); i++)
      chips.push({
        x: event.x,
        y: event.y,
        vx: Math.cos(i * 2.37) * (65 + i * 9),
        vy: Math.sin(i * 2.37) * 100 - 30,
        life: 0.46,
        rotation: i,
        color,
        size: 2.5 + (i % 3),
      });
    chips = chips.slice(-100);
    rings = rings.slice(-16);
    points = points.slice(-10);
  }
  function drawBrick(b: Brick) {
    const palette = [
      '#b8422a',
      '#d5a239',
      '#4a735f',
      '#293d37',
      '#c87142',
      '#9d4434',
      '#557b68',
    ];
    ctx.fillStyle = '#2b392611';
    ctx.fillRect(b.x + 1, b.y + 3, b.w, b.h);
    ctx.fillStyle = palette[b.row % palette.length];
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#fff9df45';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2);
    if (b.maxHp > 1)
      for (let i = 0; i < b.maxHp; i++) {
        ctx.fillStyle = i < b.hp ? '#fff4d9' : '#1b292655';
        ctx.fillRect(
          b.x + b.w / 2 - b.maxHp * 4 + i * 8,
          b.y + b.h / 2 - 1,
          5,
          2,
        );
      }
    if (b.hp < b.maxHp) {
      ctx.strokeStyle = '#f5f2e5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x + 15, b.y);
      ctx.lineTo(b.x + 21, b.y + 10);
      ctx.lineTo(b.x + 18, b.y + b.h);
      ctx.stroke();
    }
  }
  function draw(game: GameState, dt: number) {
    const reduced = reducedMotion.matches,
      advance = game.phase !== 'paused' ? dt : 0;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(surface, 0, 0);
    for (const brick of game.bricks) if (brick.hp > 0) drawBrick(brick);
    if (!reduced) {
      if (game.phase === 'playing' && dt > 0) {
        trail.push({ x: game.ball.x, y: game.ball.y });
        if (trail.length > 14) trail.shift();
      }
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `rgba(173,72,43,${(i / trail.length) * 0.48})`;
        ctx.lineWidth = 1 + (i / trail.length) * 7;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      for (const ring of rings) {
        ring.life -= advance;
        ctx.globalAlpha = Math.max(0, ring.life / ring.duration) * 0.7;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          ring.x,
          ring.y,
          ring.radius + (1 - ring.life / ring.duration) * 25,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      for (const chip of chips) {
        chip.x += chip.vx * advance;
        chip.y += chip.vy * advance;
        chip.vy += 170 * advance;
        chip.life -= advance;
        chip.rotation += advance * 7;
        ctx.globalAlpha = Math.max(0, chip.life / 0.46);
        ctx.save();
        ctx.translate(chip.x, chip.y);
        ctx.rotate(chip.rotation);
        ctx.fillStyle = chip.color;
        ctx.fillRect(
          -chip.size / 2,
          -chip.size / 2,
          chip.size,
          chip.size * 0.6,
        );
        ctx.fillStyle = '#fff7e79f';
        ctx.fillRect(-chip.size / 2, -chip.size / 2, chip.size, 1);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      chips = chips.filter((p) => p.life > 0);
      rings = rings.filter((r) => r.life > 0);
      for (const [key, life] of flashes) {
        if (life <= advance) flashes.delete(key);
        else flashes.set(key, life - advance);
      }
    } else {
      chips = [];
      rings = [];
      points = [];
      flashes.clear();
      trail = [];
    }
    const p = game.paddle;
    ctx.fillStyle = '#02091977';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.h + 9, p.w / 2 + 7, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#7a8a65';
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#b43c25';
    ctx.fillRect(p.x - p.w / 2 + 12, p.y + p.h - 1, p.w - 24, 2);
    ctx.shadowBlur = 0;
    const metal = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    metal.addColorStop(0, '#b8c4a6');
    metal.addColorStop(0.2, '#496548');
    metal.addColorStop(0.45, '#364a35');
    metal.addColorStop(0.53, '#6f8060');
    metal.addColorStop(1, '#253724');
    ctx.fillStyle = metal;
    bevelPath(ctx, p.x - p.w / 2, p.y, p.w, p.h, 4);
    ctx.fill();
    ctx.strokeStyle = '#253724';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    for (const end of [-1, 1]) {
      ctx.fillStyle = '#c96038';
      bevelPath(ctx, p.x + end * (p.w / 2 - 8) - 4, p.y + 2, 8, p.h - 4, 2);
      ctx.fill();
    }
    ctx.fillStyle = '#243721';
    ctx.fillRect(p.x - 17, p.y + 4, 34, 6);
    ctx.fillStyle = '#d8dcc4';
    for (let i = -1; i <= 1; i++) ctx.fillRect(p.x + i * 7 - 1, p.y + 5, 2, 4);
    paddleLight = Math.max(0, paddleLight - advance * 5);
    if (['ready', 'serve'].includes(game.phase)) {
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = '#394e3888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(game.ball.x, game.ball.y - 13);
      ctx.lineTo(game.ball.x + (game.level % 2 ? -18 : 18), game.ball.y - 62);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (game.phase !== 'lost') {
      const b = game.ball,
        orb = ctx.createRadialGradient(b.x - 2, b.y - 3, 0, b.x, b.y, b.r);
      orb.addColorStop(0, '#677d56');
      orb.addColorStop(0.45, '#273c25');
      orb.addColorStop(1, '#172817');
      ctx.shadowColor = '#34482c44';
      ctx.shadowBlur = 3;
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (!reduced) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px Trebuchet MS';
      for (const point of points) {
        point.life -= advance;
        point.y -= advance * 26;
        ctx.globalAlpha = Math.min(1, Math.max(0, point.life / 0.25));
        ctx.shadowColor = '#f5f2e5';
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#982e1b';
        ctx.fillText(point.text, point.x, point.y);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      points = points.filter((p) => p.life > 0);
    }
  }
  return { draw, event, reset };
}
