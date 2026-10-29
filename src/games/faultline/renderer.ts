import type { GameState, GameInput, GameEvent, Point } from './engine.ts';
interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface FloatLabel extends Point {
  text: string;
  color: string;
  life: number;
}
import { COLS, ROWS, SURFACE, TILE, BASE_X, TURRET_HEIGHT } from './engine.ts';

const COLORS: Record<string, string> = {
  iron: '#abbdb8',
  crystal: '#6ddbbd',
  gold: '#ffbf58',
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function polygon(
  ctx: CanvasRenderingContext2D,
  points: number[][],
  fill?: string | CanvasGradient,
  stroke?: string,
) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  strength = 1,
) {
  ctx.save();
  ctx.globalAlpha = strength;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  minimap: HTMLCanvasElement;
  mini: CanvasRenderingContext2D;
  images: Record<string, HTMLImageElement>;
  textures: Map<string, HTMLCanvasElement>;
  camera: Point & { scale: number };
  particles: Particle[];
  floats: FloatLabel[];
  time: number;
  shake: number;
  flash: number;
  reduced: boolean;
  ready: boolean;
  lastPlayer: Point;
  wasMoving: boolean;
  minimapTick: number;
  mountains: number[][][];
  observer: ResizeObserver;
  width = 1;
  height = 1;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.minimap = minimap;
    this.mini = minimap.getContext('2d')!;
    this.images = {};
    this.textures = new Map();
    this.camera = { x: 0, y: 0, scale: 1 };
    this.particles = [];
    this.floats = [];
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.reduced = false;
    this.ready = false;
    this.lastPlayer = { x: 0, y: 0 };
    this.wasMoving = false;
    this.minimapTick = 0;
    this.mountains = this.makeMountains();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    for (const type of ['rock', 'iron', 'crystal', 'gold', 'bedrock'])
      for (let variant = 0; variant < 4; variant++)
        for (let layer = 0; layer < 3; layer++)
          this.textures.set(
            `${type}-${variant}-${layer}`,
            this.makeRock(type, variant, layer),
          );
  }
  async load() {
    const names = {
      miner: 'miner.png',
      shelter: 'shelter.png',
      turret: 'turret-base.png',
      cart: 'cargo-cart.png',
      ore: 'ore-modly.png',
      crawler: 'crawler.svg',
      spitter: 'spitter.svg',
      brute: 'brute.svg',
    };
    const failed: string[] = [];
    await Promise.all(
      Object.entries(names).map(async ([name, url]) => {
        const im = new Image();
        im.src = `/faultline/assets/${url}`;
        try {
          await im.decode();
          this.images[name] = im;
        } catch {
          failed.push(name);
        }
      }),
    );
    // Build crystal tiles from the production sprite once image decoding finishes.
    for (let variant = 0; variant < 4; variant++) {
      for (let layer = 0; layer < 3; layer++) {
        this.textures.set(
          `crystal-${variant}-${layer}`,
          this.makeRock('crystal', variant, layer),
        );
      }
    }
    this.ready = true;
    return failed;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }
  toWorld(x: number, y: number) {
    return {
      x: x / this.camera.scale + this.camera.x,
      y: y / this.camera.scale + this.camera.y,
    };
  }
  makeMountains() {
    const random = rng(4099);
    return Array.from({ length: 4 }, (_, layer) =>
      Array.from({ length: 70 }, (_, i) => [
        i * 42,
        180 + layer * 22 - random() * (95 - layer * 13),
      ]),
    );
  }
  makeRock(type: string, variant: number, layer: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    const c = canvas.getContext('2d')!;
    const random = rng(1871 + variant * 392 + layer * 822 + type.length * 71);
    const hues = [222, 213, 230],
      hue = hues[layer];
    c.fillStyle = `hsl(${hue} 19% ${type === 'bedrock' ? 12 : 19}%)`;
    c.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 24; i++) {
      const x = random() * 52 - 2,
        y = random() * 52 - 2,
        w = 3 + random() * 15,
        h = 3 + random() * 12;
      const shade = 14 + random() * 15;
      polygon(
        c,
        [
          [x, y],
          [x + w * 0.7, y - 2],
          [x + w, y + h * 0.35],
          [x + w * 0.8, y + h],
          [x + w * 0.1, y + h + 1],
          [x - 2, y + h * 0.6],
        ],
        `hsl(${hue + random() * 14} 16% ${shade}%)`,
      );
      c.strokeStyle = `hsla(${hue} 15% 52% / .22)`;
      c.beginPath();
      c.moveTo(x + 1, y + 1);
      c.lineTo(x + w * 0.65, y - 1);
      c.stroke();
    }
    c.strokeStyle = '#0c162766';
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      let x = random() * 48,
        y = random() * 48;
      c.beginPath();
      c.moveTo(x, y);
      for (let n = 0; n < 3; n++) {
        x += random() * 16 - 8;
        y += random() * 10;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    if (COLORS[type] && !(type === 'crystal' && this.images.ore)) {
      const count = type === 'iron' ? 6 : 5;
      for (let i = 0; i < count; i++) {
        const x = 7 + random() * 32,
          y = 9 + random() * 30,
          w = 5 + random() * 8,
          h = 7 + random() * 14;
        const color = COLORS[type];
        c.save();
        c.translate(x, y);
        c.rotate((random() - 0.5) * 1.6);
        polygon(
          c,
          [
            [-w * 0.5, 0],
            [-w * 0.3, -h],
            [w * 0.2, -h * 1.2],
            [w * 0.55, -h * 0.3],
            [w * 0.25, 3],
          ],
          color,
          '#122627',
        );
        polygon(
          c,
          [
            [0, 2],
            [-w * 0.3, -h],
            [w * 0.2, -h * 1.2],
            [w * 0.12, -h * 0.2],
          ],
          '#ffffff38',
        );
        polygon(
          c,
          [
            [w * 0.12, -h * 0.2],
            [w * 0.2, -h * 1.2],
            [w * 0.55, -h * 0.3],
            [w * 0.25, 3],
          ],
          '#09253266',
        );
        c.restore();
      }
    }
    if (type === 'crystal' && this.images.ore) {
      c.save();
      c.translate(TILE / 2, TILE / 2);
      c.rotate((variant - 1.5) * 0.16);
      if (variant % 2) c.scale(-1, 1);
      c.drawImage(this.images.ore, -29, -28, 58, 58);
      c.restore();
    }
    c.fillStyle = '#8b9d9f40';
    for (let i = 0; i < 22; i++) c.fillRect(random() * 48, random() * 48, 1, 1);
    return canvas;
  }
  burst(x: number, y: number, color: string, count = 12, power = 1) {
    if (this.reduced) count = Math.min(count, 4);
    for (let i = 0; i < count && this.particles.length < 250; i++) {
      const a = Math.random() * Math.PI * 2,
        s = (25 + Math.random() * 95) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        life: 0.3 + Math.random() * 0.7,
        max: 1,
        color,
        size: 1 + Math.random() * 3,
      });
    }
  }
  event(event: GameEvent) {
    const { type, x, y, value, text } = event;
    if (type === 'mine') {
      this.burst(x, y, COLORS[text ?? ''] || '#8d8c7a', value ? 20 : 10);
      if (value)
        this.floats.push({
          x,
          y,
          text: `+${value}`,
          color: COLORS[text ?? ''],
          life: 1.2,
        });
    }
    if (type === 'hit') this.burst(x, y, '#f9a24d', 5);
    if (type === 'kill') {
      this.burst(x, y, '#c86c48', 25, 1.4);
      if (value > 0)
        this.floats.push({
          x,
          y,
          text: `+${value}`,
          color: '#e9c578',
          life: 1,
        });
    }
    if (type === 'base-hit') {
      this.shake = 5;
      this.flash = 0.15;
      this.burst(x, y, '#f7ae58', 12);
    }
    if (type === 'shoot') {
      this.burst(x, y, '#ffe4a3', 4, 0.8);
    }
    if (type === 'recall') {
      this.burst(x, y, '#9cdbc5', 28, 1.8);
    }
    if (type === 'deposit') {
      this.floats.push({
        x,
        y,
        text: `+${value} SALVAGE`,
        color: '#ffd478',
        life: 1.8,
      });
      this.burst(x, y, '#ffe09a', 18);
    }
    if (type === 'lost') {
      this.burst(x, y - 50, '#ffab5b', 70, 2.4);
      this.shake = 12;
    }
  }
  draw(
    state: GameState,
    dt: number,
    {
      menu = false,
      paused = false,
      input = {},
      aim = null,
    }: {
      menu?: boolean;
      paused?: boolean;
      input?: GameInput;
      aim?: Point | null;
    } = {},
  ) {
    if (!paused) this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt);
    const ctx = this.ctx,
      w = this.width,
      h = this.height,
      p = state.player;
    const combat = p.mode === 'turret';
    const targetScale = menu
      ? clamp(w / 1390, 0.65, 1.4)
      : combat
        ? clamp(w / 1500, 0.54, 1.15)
        : clamp(w / 1220, 0.82, 1.25);
    this.camera.scale +=
      (targetScale - this.camera.scale) * Math.min(1, dt * 5);
    const vw = w / this.camera.scale,
      vh = h / this.camera.scale;
    let targetX = menu
      ? Math.max(0, BASE_X * TILE - vw * 0.62)
      : combat
        ? state.base.x - vw * (w < 600 ? 0.46 : 0.36)
        : p.x - vw * (w < 600 ? 0.48 : 0.38);
    let targetY = menu
      ? SURFACE * TILE - vh * 0.29
      : combat
        ? SURFACE * TILE - vh * 0.53
        : p.y - vh * 0.48;
    targetX = clamp(targetX, 0, Math.max(0, COLS * TILE - vw));
    targetY = clamp(targetY, combat ? -250 : 0, Math.max(0, ROWS * TILE - vh));
    this.camera.x += (targetX - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (targetY - this.camera.y) * Math.min(1, dt * 4);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#101a24';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.translate(
      -this.camera.x + (this.reduced ? 0 : (Math.random() - 0.5) * this.shake),
      -this.camera.y + (this.reduced ? 0 : (Math.random() - 0.5) * this.shake),
    );
    this.sky(ctx, state);
    this.underground(ctx, state);
    this.terrain(ctx, state);
    this.structure(ctx, state);
    this.creatures(ctx, state);
    this.shots(ctx, state);
    this.miner(ctx, state, input, dt);
    this.effects(ctx, dt, paused);
    this.lighting(ctx, state);
    if (state.phase === 'won') this.evacuation(ctx, state);
    if (p.mode === 'turret' && aim) {
      ctx.strokeStyle = '#ffe2a388';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 13, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 20, aim.y);
      ctx.lineTo(aim.x + 20, aim.y);
      ctx.moveTo(aim.x, aim.y - 20);
      ctx.lineTo(aim.x, aim.y + 20);
      ctx.stroke();
    }
    ctx.restore();
    const v = ctx.createRadialGradient(
      w * 0.5,
      h * 0.48,
      h * 0.15,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.67,
    );
    v.addColorStop(0, 'transparent');
    v.addColorStop(1, '#07121d8c');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    if (this.flash && !this.reduced) {
      ctx.fillStyle = `rgba(225,80,40,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (combat) this.threatArrows(ctx, state);
    if ((this.minimapTick += dt) > 0.2) {
      this.drawMinimap(state);
      this.minimapTick = 0;
    }
    this.lastPlayer = { x: p.x, y: p.y };
  }
  sky(c: CanvasRenderingContext2D, state: GameState) {
    const ground = SURFACE * TILE,
      night = state.wave / 4;
    const gradient = c.createLinearGradient(0, -150, 0, ground);
    gradient.addColorStop(0, night > 0.7 ? '#24263c' : '#343447');
    gradient.addColorStop(0.48, night > 0.7 ? '#644455' : '#965957');
    gradient.addColorStop(1, night > 0.7 ? '#b86e52' : '#e2a06b');
    c.fillStyle = gradient;
    c.fillRect(0, -500, COLS * TILE, ground + 500);
    const sunX = 1170,
      sunY = 175 + night * 65;
    glow(c, sunX, sunY, 250, '#ffb76755');
    c.fillStyle = '#fbd28d';
    c.beginPath();
    c.arc(sunX, sunY, 49, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = '#34374e';
    for (let i = 0; i < 5; i++)
      c.fillRect(sunX - 55, sunY + 7 + i * 9, 110, 3 + i);
    c.restore();
    const random = rng(887);
    for (let i = 0; i < 32; i++) {
      const x =
          random() * 1920 +
          (this.reduced ? 0 : Math.sin(this.time * 0.015 + i) * 22),
        y = random() * 220;
      c.fillStyle = `rgba(66,56,70,${0.05 + random() * 0.1})`;
      c.beginPath();
      c.ellipse(x, y, 35 + random() * 90, 3 + random() * 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    const colors = ['#8d635f', '#775552', '#55444b', '#34313d'];
    this.mountains.forEach((points, i) => {
      polygon(
        c,
        [[0, ground], ...points.map(([x, y]) => [x, y + 27]), [2900, ground]],
        colors[i],
      );
    });
    c.fillStyle = '#dd997233';
    c.fillRect(0, ground - 15, COLS * TILE, 15);
    for (let i = 0; i < 40; i++) {
      const x = i * 57 + Math.sin(i * 9) * 24,
        y = ground - 5;
      polygon(
        c,
        [
          [x - 8, y],
          [x - 4, y - 7 - (i % 5) * 3],
          [x + 1, y - 13 - (i % 4) * 2],
          [x + 12, y],
        ],
        i % 2 ? '#332e34' : '#55423e',
      );
    }
    // Distant abandoned survey masts and drifting dust.
    for (const x of [240, 1010, 1560]) {
      c.strokeStyle = '#574441';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, ground);
      c.lineTo(x, ground - 55);
      c.moveTo(x - 13, ground - 38);
      c.lineTo(x + 16, ground - 43);
      c.stroke();
      c.fillStyle = '#bd8758';
      c.fillRect(x - 2, ground - 56, 4, 4);
    }
    if (!this.reduced) {
      c.fillStyle = '#ffe1ab38';
      for (let i = 0; i < 30; i++) {
        const x = (i * 89 + this.time * (8 + (i % 5))) % 1920,
          y = ground - 8 - ((i * 37) % 100);
        c.fillRect(x, y, 2, 1);
      }
    }
  }
  underground(c: CanvasRenderingContext2D, state: GameState) {
    const g = c.createLinearGradient(0, SURFACE * TILE, 0, ROWS * TILE);
    g.addColorStop(0, '#202530');
    g.addColorStop(0.4, '#172632');
    g.addColorStop(1, '#0b1b29');
    c.fillStyle = g;
    c.fillRect(0, SURFACE * TILE, COLS * TILE, (ROWS - SURFACE) * TILE);
    const left = Math.max(0, Math.floor(this.camera.x / TILE) - 1),
      right = Math.min(
        COLS,
        Math.ceil((this.camera.x + this.width / this.camera.scale) / TILE) + 1,
      ),
      top = Math.max(SURFACE, Math.floor(this.camera.y / TILE) - 1),
      bottom = Math.min(
        ROWS,
        Math.ceil((this.camera.y + this.height / this.camera.scale) / TILE) + 1,
      );
    for (let r = top; r < bottom; r++)
      for (let col = left; col < right; col++) {
        const cell = state.tiles[r][col];
        if (cell.type !== 'air') continue;
        const x = col * TILE,
          y = r * TILE;
        c.globalAlpha = 0.15;
        c.drawImage(this.textures.get(`rock-${cell.variant}-1`)!, x, y);
        c.globalAlpha = 1;
        const n = (r * 113 + col * 37) % 17;
        if (n < 4) {
          c.strokeStyle = '#64797622';
          c.beginPath();
          c.moveTo(x + 6, y + 18);
          c.lineTo(x + 25, y + 13);
          c.lineTo(x + 36, y + 33);
          c.stroke();
        }
        if (r > 7 && state.tiles[r - 1]?.[col].type !== 'air') {
          polygon(
            c,
            [
              [x + 9, y],
              [x + 14, y + 12],
              [x + 19, y],
            ],
            '#24303b',
          );
          polygon(
            c,
            [
              [x + 34, y],
              [x + 38, y + 8],
              [x + 42, y],
            ],
            '#263540',
          );
        }
      }
    // Central service shaft remains a visual landmark after digging outward.
    const shaftX = (BASE_X + 0.6) * TILE;
    c.strokeStyle = '#514c37';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(shaftX - 15, SURFACE * TILE);
    c.lineTo(shaftX - 15, 12 * TILE);
    c.moveTo(shaftX + 15, SURFACE * TILE);
    c.lineTo(shaftX + 15, 12 * TILE);
    c.stroke();
    c.strokeStyle = '#7c71504d';
    for (let y = SURFACE * TILE + 8; y < 12 * TILE; y += 15) {
      c.beginPath();
      c.moveTo(shaftX - 15, y);
      c.lineTo(shaftX + 15, y);
      c.stroke();
    }
    for (let y = SURFACE * TILE + 28; y < 12 * TILE; y += 96) {
      c.fillStyle = '#574b34';
      c.fillRect(shaftX - 29, y - 9, 8, 14);
      c.fillStyle = '#ffd489';
      c.fillRect(shaftX - 27, y - 7, 4, 9);
      glow(c, shaftX - 25, y - 2, 58, '#efb55838');
    }
  }
  terrain(c: CanvasRenderingContext2D, state: GameState) {
    const startC = Math.max(0, Math.floor(this.camera.x / TILE) - 1),
      endC = Math.min(
        COLS,
        Math.ceil((this.camera.x + this.width / this.camera.scale) / TILE) + 1,
      ),
      startR = Math.max(SURFACE, Math.floor(this.camera.y / TILE) - 1),
      endR = Math.min(
        ROWS,
        Math.ceil((this.camera.y + this.height / this.camera.scale) / TILE) + 1,
      );
    for (let r = startR; r < endR; r++)
      for (let col = startC; col < endC; col++) {
        const tile = state.tiles[r][col];
        if (tile.type === 'air') continue;
        const x = col * TILE,
          y = r * TILE,
          layer = r < 12 ? 0 : r < 19 ? 1 : 2;
        c.drawImage(
          this.textures.get(`${tile.type}-${tile.variant}-${layer}`)!,
          x,
          y,
        );
        const sides = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ];
        sides.forEach(([dx, dy], i) => {
          if (state.tiles[r + dy]?.[col + dx]?.type !== 'air') return;
          c.fillStyle = i === 0 ? '#aca08742' : '#080f2077';
          if (i === 0) c.fillRect(x, y, 48, 4);
          if (i === 1) c.fillRect(x + 44, y, 4, 48);
          if (i === 2) c.fillRect(x, y + 43, 48, 5);
          if (i === 3) c.fillRect(x, y, 5, 48);
          c.strokeStyle = i === 0 ? '#a6a5986b' : '#182739';
          c.lineWidth = 1.5;
          const vertices =
            i % 2 === 0
              ? [
                  [x, y + (i === 0 ? 0 : 48)],
                  [x + 12, y + (i === 0 ? 2 : 46)],
                  [x + 21, y + (i === 0 ? 0 : 48)],
                  [x + 34, y + (i === 0 ? 3 : 45)],
                  [x + 48, y + (i === 0 ? 0 : 48)],
                ]
              : [
                  [x + (i === 1 ? 48 : 0), y],
                  [x + (i === 1 ? 45 : 3), y + 17],
                  [x + (i === 1 ? 48 : 0), y + 29],
                  [x + (i === 1 ? 46 : 2), y + 38],
                  [x + (i === 1 ? 48 : 0), y + 48],
                ];
          c.beginPath();
          vertices.forEach(([vx, vy], n) =>
            n ? c.lineTo(vx, vy) : c.moveTo(vx, vy),
          );
          c.stroke();
        });
        if (r === SURFACE) {
          c.fillStyle = '#a46542';
          c.fillRect(x, y, 48, 5);
          c.fillStyle = '#dc9e6055';
          c.fillRect(x, y, 48, 2);
          for (let n = 0; n < 6; n++) {
            c.fillStyle = n % 2 ? '#784a3d' : '#b47a4c';
            c.fillRect(
              x + ((n * 13 + tile.variant * 7) % 47),
              y + 2 + (n % 5),
              4 + (n % 3),
              3,
            );
          }
        }
        if (tile.hp < tile.maxHp) {
          const damage = 1 - tile.hp / tile.maxHp;
          c.strokeStyle = '#070d15';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x + 23, y + 22);
          c.lineTo(x + 9, y + 10);
          c.moveTo(x + 23, y + 22);
          c.lineTo(x + 35, y + 5);
          c.moveTo(x + 23, y + 22);
          c.lineTo(x + 33, y + 40);
          if (damage > 0.5) {
            c.moveTo(x + 23, y + 22);
            c.lineTo(x + 4, y + 32);
            c.moveTo(x + 23, y + 22);
            c.lineTo(x + 46, y + 27);
          }
          c.stroke();
        }
        if (COLORS[tile.type] && tile.type !== 'iron') {
          glow(
            c,
            x + 24,
            y + 20,
            34,
            tile.type === 'gold' ? '#ecb84422' : '#60e1be17',
          );
        }
      }
    if (state.player.drillTarget) {
      const { col, row } = state.player.drillTarget,
        t = state.tiles[row][col];
      if (t.type !== 'air') {
        c.strokeStyle =
          state.player.cargo.length >= state.player.capacity
            ? '#e18756'
            : '#ffda7a';
        c.lineWidth = 1;
        c.strokeRect(col * TILE + 2, row * TILE + 2, TILE - 4, TILE - 4);
        c.fillStyle = '#0d1728';
        c.fillRect(col * TILE + 7, row * TILE + 39, 34, 3);
        c.fillStyle = '#edbd6b';
        c.fillRect(
          col * TILE + 7,
          row * TILE + 39,
          34 * (1 - t.hp / t.maxHp),
          3,
        );
      }
    }
  }
  structure(c: CanvasRenderingContext2D, state: GameState) {
    const { x, y } = state.base;
    c.fillStyle = '#303a39';
    c.fillRect(x - 116, y - 9, 240, 9);
    c.fillStyle = '#d8a150';
    for (let i = 0; i < 12; i++) {
      polygon(
        c,
        [
          [x - 116 + i * 20, y - 9],
          [x - 108 + i * 20, y - 9],
          [x - 115 + i * 20, y],
          [x - 123 + i * 20, y],
        ],
        '#b48e48',
      );
    }
    if (this.images.shelter)
      c.drawImage(this.images.shelter, x - 184, y - 205, 340, 212.5);
    else {
      c.fillStyle = '#977341';
      c.fillRect(x - 90, y - 100, 180, 95);
      c.fillStyle = '#272a25';
      c.fillRect(x - 50, y - 75, 90, 73);
    }
    glow(c, x - 25, y - 38, 83, '#ffcc5524');
    const flash =
      state.phase === 'wave'
        ? Math.sin(this.time * 9) > 0
        : Math.sin(this.time * 2) > 0;
    c.fillStyle = flash ? '#ffc05d' : '#75442d';
    c.fillRect(x - 68, y - 184, 5, 7);
    if (flash) glow(c, x - 65, y - 181, 23, '#ffb94f33');
    // Cannon uses the rendered turret base and an independently aimed barrel.
    const tx = x,
      ty = y - TURRET_HEIGHT;
    if (this.images.turret)
      c.drawImage(this.images.turret, tx - 27.9175, ty - 28.0938, 95, 95);
    c.save();
    c.translate(tx, ty);
    c.rotate(state.turretAngle);
    c.fillStyle = '#131e21';
    c.fillRect(-6, -9, 53, 18);
    c.fillStyle = '#72827c';
    c.fillRect(1, -7, 41, 12);
    c.fillStyle = '#b5b8a2';
    c.fillRect(8, -6, 31, 3);
    c.fillStyle = '#d6ac55';
    c.fillRect(0, -7, 11, 13);
    c.fillStyle = '#192323';
    c.fillRect(40, -8, 12, 15);
    c.fillStyle = '#777e6c';
    c.fillRect(45, -8, 5, 15);
    c.restore();
    if (state.player.mode === 'turret') {
      c.strokeStyle = '#eec572';
      c.lineWidth = 1;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.arc(tx, ty, 39, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.font = '700 9px Ridge';
    c.textAlign = 'center';
    c.fillStyle = '#e3c895';
    c.fillText('RIDGE STATION / 04', x - 15, y - 14);
    if (state.base.hp / state.base.maxHp < 0.4) {
      for (let i = 0; i < 6; i++) {
        const age = (this.time * 0.6 + i * 0.17) % 1;
        c.globalAlpha = (1 - age) * 0.4;
        c.fillStyle = '#2a272c';
        c.beginPath();
        c.arc(
          x - 60 + Math.sin(i * 3 + age * 2) * 20,
          y - 80 - age * 115,
          9 + age * 25,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.globalAlpha = 1;
    }
    if (this.images.cart)
      c.drawImage(this.images.cart, x + 115, y - 40, 54, 42);
    c.strokeStyle = '#6c6649';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x + 90, y - 16);
    c.lineTo(x + 119, y - 13);
    c.stroke();
  }
  miner(
    c: CanvasRenderingContext2D,
    state: GameState,
    input: GameInput,
    dt: number,
  ) {
    const p = state.player;
    if (p.mode === 'turret') return;
    const moving =
      Math.hypot(p.x - this.lastPlayer.x, p.y - this.lastPlayer.y) > 0.05;
    this.wasMoving = moving;
    const row = p.drilling ? 2 : moving ? 1 : 0,
      frame = this.reduced ? 0 : Math.floor(this.time * (row ? 10 : 4)) % 8;
    const size = 62,
      foot = p.y + 20;
    c.save();
    c.translate(p.x, foot);
    c.scale(p.facing, 1);
    glow(c, 8, -31, 55, '#ffd27822');
    if (this.images.miner)
      c.drawImage(
        this.images.miner,
        frame * 256,
        row * 256,
        256,
        256,
        -size * 0.435,
        -size * 0.9375,
        size,
        size,
      );
    else {
      c.fillStyle = '#d8a64f';
      c.fillRect(-10, -35, 20, 32);
      c.fillStyle = '#132e37';
      c.fillRect(-8, -31, 17, 10);
    }
    if (moving && Math.abs(input.dy || 0) > 0.1 && !this.reduced) {
      c.fillStyle = '#80c9c4';
      polygon(
        c,
        [
          [-9, -5],
          [-5, -5],
          [-7, 9 + Math.sin(this.time * 60) * 4],
        ],
        '#a6d6caaa',
      );
    }
    c.restore();
    // A warm, directional headlamp reveals the immediate tunnel without hiding the ore field.
    c.save();
    c.translate(p.x + p.facing * 7, p.y - 14);
    if (p.facing < 0) c.scale(-1, 1);
    const g = c.createLinearGradient(0, 0, 145, 0);
    g.addColorStop(0, '#ffe4a323');
    g.addColorStop(1, '#ffd57400');
    polygon(
      c,
      [
        [0, -3],
        [145, -50],
        [145, 50],
        [0, 3],
      ],
      g,
    );
    c.restore();
    if (p.drilling && p.drillTarget && !this.reduced) {
      const target = p.drillTarget;
      if (Math.random() < dt * 35)
        this.burst(
          (p.x + target.x) * 0.5,
          (p.y + target.y) * 0.5,
          '#ffc96d',
          2,
          0.7,
        );
    }
    if (p.cargo.length) {
      const cartX = p.x - p.facing * 33;
      const n = Math.min(3, Math.ceil(p.cargo.length / 3));
      for (let i = 0; i < n; i++) {
        const x = cartX - p.facing * i * 24;
        c.strokeStyle = '#92856a';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x + p.facing * 16, p.y + 9);
        c.lineTo(x - p.facing * 8, p.y + 9);
        c.stroke();
        if (this.images.cart) {
          c.save();
          c.translate(x, p.y + 18);
          c.scale(p.facing, 1);
          c.drawImage(this.images.cart, -18, -28, 36, 28);
          c.restore();
        }
      }
    }
  }
  creatures(c: CanvasRenderingContext2D, state: GameState) {
    for (const e of state.enemies) {
      const size = e.type === 'brute' ? 115 : e.type === 'spitter' ? 68 : 64;
      const h = size * (e.type === 'crawler' ? 0.625 : 0.72);
      const facing = e.x < state.base.x ? 1 : -1;
      const bob = this.reduced
        ? 0
        : Math.sin(this.time * (e.type === 'brute' ? 6 : 12) + e.id) * 1.5;
      c.save();
      c.translate(e.x, e.y + 20 + bob);
      c.scale(facing, 1);
      c.fillStyle = '#101a2566';
      c.beginPath();
      c.ellipse(0, 0, size * 0.43, 5, 0, 0, Math.PI * 2);
      c.fill();
      if (this.images[e.type])
        c.drawImage(this.images[e.type], -size / 2, -h, size, h);
      else {
        polygon(
          c,
          [
            [-size * 0.4, -8],
            [-size * 0.3, -h * 0.7],
            [size * 0.1, -h],
            [size * 0.4, -h * 0.45],
            [size * 0.35, -7],
          ],
          '#946d4e',
          '#d6a570',
        );
        c.fillStyle = '#efad58';
        c.fillRect(size * 0.18, -h * 0.55, 8, 4);
        c.strokeStyle = '#b28b69';
        c.lineWidth = 3;
        for (let n = 0; n < 4; n++) {
          c.beginPath();
          c.moveTo(-size * 0.28 + n * size * 0.17, -12);
          c.lineTo(-size * 0.4 + n * size * 0.22, 1);
          c.stroke();
        }
      }
      c.restore();
      glow(
        c,
        e.x + facing * 18,
        e.y - 10,
        25,
        e.type === 'spitter' ? '#aacb4722' : '#fa723322',
      );
      if (e.hp < e.maxHp) {
        c.fillStyle = '#171f27';
        c.fillRect(e.x - size * 0.3, e.y - h + 9, size * 0.6, 3);
        c.fillStyle = e.type === 'brute' ? '#ef8357' : '#d6a368';
        c.fillRect(
          e.x - size * 0.3,
          e.y - h + 9,
          (size * 0.6 * e.hp) / e.maxHp,
          3,
        );
      }
    }
  }
  shots(c: CanvasRenderingContext2D, state: GameState) {
    for (const s of state.projectiles) {
      c.save();
      c.strokeStyle = s.owner === 'player' ? '#ffe6a7' : '#c9db77';
      c.lineWidth = s.owner === 'player' ? 2 : 4;
      c.shadowColor = c.strokeStyle;
      c.shadowBlur = 8;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x - s.vx * 0.018, s.y - s.vy * 0.018);
      c.stroke();
      c.restore();
    }
  }
  effects(c: CanvasRenderingContext2D, dt: number, paused: boolean) {
    if (!paused) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 90 * dt;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const f of this.floats) {
        f.y -= 18 * dt;
        f.life -= dt;
      }
      this.floats = this.floats.filter((f) => f.life > 0);
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.min(1, p.life * 2);
      c.fillStyle = p.color;
      c.fillRect(p.x, p.y, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    c.font = '700 13px Ridge';
    for (const f of this.floats) {
      c.globalAlpha = Math.min(1, f.life * 2);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
  }
  lighting(c: CanvasRenderingContext2D, state: GameState) {
    const p = state.player;
    const darkness = c.createLinearGradient(0, SURFACE * TILE, 0, ROWS * TILE);
    darkness.addColorStop(0, '#07132600');
    darkness.addColorStop(0.55, '#07132612');
    darkness.addColorStop(1, '#030d204d');
    c.fillStyle = darkness;
    c.fillRect(0, SURFACE * TILE, COLS * TILE, (ROWS - SURFACE) * TILE);
    if (p.mode === 'mine') {
      c.save();
      c.globalCompositeOperation = 'screen';
      glow(c, p.x, p.y, 120, '#dba24613');
      c.restore();
    }
  }
  threatArrows(c: CanvasRenderingContext2D, state: GameState) {
    const left = state.enemies.filter((e) => e.x < this.camera.x).length,
      right = state.enemies.filter(
        (e) => e.x > this.camera.x + this.width / this.camera.scale,
      ).length;
    c.fillStyle = '#ffd093';
    c.font = '700 13px Ridge';
    const y = (SURFACE * TILE - 40 - this.camera.y) * this.camera.scale;
    c.textAlign = 'left';
    if (left) c.fillText(`◀ ${left}`, 18, clamp(y, 125, this.height - 150));
    c.textAlign = 'right';
    if (right)
      c.fillText(
        `${right} ▶`,
        this.width - 18,
        clamp(y, 125, this.height - 150),
      );
  }
  drawMinimap(state: GameState) {
    const c = this.mini,
      w = this.minimap.width,
      h = this.minimap.height;
    c.fillStyle = '#111c22';
    c.fillRect(0, 0, w, h);
    const tw = w / COLS,
      th = h / ROWS;
    for (let r = SURFACE; r < ROWS; r++)
      for (let x = 0; x < COLS; x++) {
        const type = state.tiles[r][x].type;
        c.fillStyle = type === 'air' ? '#72857c' : COLORS[type] || '#263843';
        c.globalAlpha = type === 'air' ? 0.8 : COLORS[type] ? 0.6 : 0.7;
        c.fillRect(x * tw, r * th, tw + 0.2, th + 0.2);
      }
    c.globalAlpha = 1;
    c.fillStyle = '#e8b862';
    c.fillRect((state.base.x / TILE) * tw - 4, SURFACE * th - 4, 8, 4);
    c.fillStyle = '#fff1c1';
    c.beginPath();
    c.arc(
      (state.player.x / TILE) * tw,
      (state.player.y / TILE) * th,
      2.4,
      0,
      Math.PI * 2,
    );
    c.fill();
    for (const e of state.enemies) {
      c.fillStyle = '#ed825c';
      c.fillRect((e.x / TILE) * tw, 4.5 * th, 2, 2);
    }
  }
  evacuation(c: CanvasRenderingContext2D, state: GameState) {
    const x = state.base.x + Math.sin(this.time * 0.6) * 8,
      y = state.base.y - 190;
    glow(c, x, y + 60, 100, '#c8df9b25');
    polygon(
      c,
      [
        [x - 86, y],
        [x - 45, y - 15],
        [x - 20, y - 32],
        [x + 48, y - 29],
        [x + 96, y - 5],
        [x + 75, y + 19],
        [x - 68, y + 19],
      ],
      '#72847c',
      '#c5cbbb',
    );
    polygon(
      c,
      [
        [x + 20, y - 23],
        [x + 49, y - 23],
        [x + 76, y - 7],
        [x + 25, y - 7],
      ],
      '#c7ddc5',
    );
    for (const dx of [-52, 53]) {
      c.fillStyle = '#343e40';
      c.fillRect(x + dx - 11, y + 13, 22, 13);
      glow(c, x + dx, y + 35, 40, '#ffd08277');
    }
    c.fillStyle = '#eac785';
    c.font = '700 10px Ridge';
    c.fillText('RIDGE RECOVERY', x, y + 6);
  }
  dispose() {
    this.observer.disconnect();
  }
}
