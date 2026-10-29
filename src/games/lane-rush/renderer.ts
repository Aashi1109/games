import type { GameState, GameEvent } from './engine.ts';
type Paint = string | CanvasGradient | CanvasPattern;
interface Point {
  x: number;
  y: number;
}
interface Spark extends Point {
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface TireMark {
  x: number;
  y: number;
  life: number;
  length: number;
}
import {
  LANES,
  PLAYER_Y,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  clamp,
} from './engine.ts';

// Everything here is original procedural drawing. Projection is purely visual;
// the road, vehicle bodies and markings share the same world coordinates.
export function createRenderer(
  canvas: HTMLCanvasElement,
  { preview = false, reducedMotion = false } = {},
) {
  const ctx = canvas.getContext('2d')!;
  const grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const g = grain.getContext('2d')!;
  let noise = 57371;
  for (let i = 0; i < 4200; i++) {
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const x = noise & 127;
    const y = (noise >>> 8) & 127;
    g.fillStyle = i % 3 === 0 ? '#b5bfbe13' : '#060c1120';
    g.fillRect(x, y, 1 + (i % 2), 1);
  }
  const texture = ctx.createPattern(grain, 'repeat')!;
  let w = 600;
  let h = 800;
  let portrait = true;
  let unit = 1;
  let sparks: Spark[] = [];
  let tireMarks: TireMark[] = [];
  let lastCar: number | null = null;
  const colors = ['#d9e3e8', '#d7583c', '#587d88', '#d2a765'];
  const P = (x: number, y: number) => {
    if (portrait)
      return {
        x: w / 2 + (x - 300) * unit,
        y: y * unit + (h - 800 * unit) / 2,
      };
    const t = y / 800;
    const scale = (h / 800) * (0.25 + 1.5 * t);
    return { x: w / 2 + (x - 300) * scale, y: h * (0.25 * t + 0.75 * t * t) };
  };
  const S = (y: number) =>
    portrait ? unit : (h / 800) * (0.25 + (1.5 * y) / 800);
  function polygon(
    points: number[][],
    fill?: Paint | null,
    stroke?: Paint | null,
    width = 1,
  ) {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const p = P(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width * S(points[0][1]);
      ctx.stroke();
    }
  }
  function rectangle(
    x: number,
    y: number,
    rw: number,
    rh: number,
    fill?: Paint | null,
    stroke?: Paint | null,
  ) {
    polygon(
      [
        [x, y],
        [x + rw, y],
        [x + rw, y + rh],
        [x, y + rh],
      ],
      fill,
      stroke,
    );
  }
  function line(points: number[][], stroke: Paint, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const p = P(x, y);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.4, width * S(points[0][1]));
    ctx.stroke();
  }
  function text(
    value: string,
    x: number,
    y: number,
    size: number,
    fill: Paint,
    align: CanvasTextAlign = 'center',
    font = 'LaneDisplay',
  ) {
    const p = P(x, y);
    ctx.font = `${size * Math.max(0.2, S(y))}px ${font}, sans-serif`;
    ctx.textAlign = align;
    ctx.fillStyle = fill;
    ctx.fillText(value, p.x, p.y);
  }
  function gradient(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stops: [number, string][],
  ) {
    const a = P(x1, y1);
    const b = P(x2, y2);
    const paint = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    stops.forEach(([at, color]) => paint.addColorStop(at, color));
    return paint;
  }
  function glow(x: number, y: number, radius: number, color: string) {
    const p = P(x, y);
    const r = Math.max(1, radius * S(y));
    const paint = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    paint.addColorStop(0, color);
    paint.addColorStop(1, '#b7ddf000');
    ctx.fillStyle = paint;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  function car(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    player = false,
    van = false,
    brake = false,
    turn = 0,
    damaged = false,
  ) {
    const hw = width / 2;
    const hh = height / 2;
    // Normalised local body geometry is projected vertex by vertex, including
    // the roof and glass, so the apparent car follows the physical footprint.
    const C = (lx: number, ly: number) => [
      x + lx * Math.cos(turn) - ly * Math.sin(turn),
      y + lx * Math.sin(turn) + ly * Math.cos(turn),
    ];
    const poly = (
      points: number[][],
      fill?: Paint | null,
      stroke?: Paint | null,
      lw = 1,
    ) =>
      polygon(
        points.map(([lx, ly]) => C(lx, ly)),
        fill,
        stroke,
        lw,
      );
    const box = (
      lx: number,
      ly: number,
      rw: number,
      rh: number,
      fill?: Paint | null,
      stroke?: Paint | null,
    ) =>
      poly(
        [
          [lx, ly],
          [lx + rw, ly],
          [lx + rw, ly + rh],
          [lx, ly + rh],
        ],
        fill,
        stroke,
      );
    const rule = (points: number[][], color: Paint, lw = 1) =>
      line(
        points.map(([lx, ly]) => C(lx, ly)),
        color,
        lw,
      );
    // Long, low beams and contact shadow give the car a clear front and weight.
    if (player || !van) {
      const beams = gradient(x, y - hh - 125, x, y - hh, [
        [0, '#dceaf000'],
        [1, player ? '#e6f5ed24' : '#dbe7ed12'],
      ]);
      poly(
        [
          [-hw + 6, -hh],
          [-hw - 17, -hh - 125],
          [hw + 17, -hh - 125],
          [hw - 6, -hh],
        ],
        beams,
      );
    }
    glow(x + 5, y + 11, 70, '#03070865');
    poly(
      [
        [-hw + 2, -hh + 10],
        [hw + 9, -hh + 10],
        [hw + 11, hh + 7],
        [-hw + 4, hh + 13],
      ],
      '#03080a9c',
    );
    for (const wheelY of [-hh + 21, hh - 27])
      for (const side of [-1, 1]) {
        const wx = side < 0 ? -hw - 4 : hw - 3;
        box(wx, wheelY, 8, 20, '#0a1115', '#05090c');
        box(wx + 2, wheelY + 3, 4, 14, '#333e45');
        for (let tread = 0; tread < 4; tread++)
          box(wx + 1, wheelY + 3 + tread * 4, 6, 1, '#172026');
      }
    const body = gradient(x - hw, y, x + hw, y, [
      [0, '#152326'],
      [0.08, color],
      [0.25, color],
      [0.43, '#eff1df'],
      [0.65, color],
      [0.91, color],
      [1, '#152326'],
    ]);
    const hull = [
      [-hw + 10, -hh],
      [hw - 10, -hh],
      [hw - 3, -hh + 8],
      [hw, -hh + 23],
      [hw - 2, -11],
      [hw, hh - 13],
      [hw - 8, hh],
      [-hw + 8, hh],
      [-hw, hh - 13],
      [-hw + 2, -11],
      [-hw, -hh + 23],
      [-hw + 3, -hh + 8],
    ];
    poly(hull, body, '#061013', 1.4);
    rule(
      [
        [-hw + 8, hh - 6],
        [-hw + 4, hh - 23],
        [-hw + 5, -hh + 15],
        [-hw + 12, -hh + 5],
      ],
      '#effff386',
      1.2,
    );
    rule(
      [
        [hw - 8, hh - 6],
        [hw - 4, hh - 23],
        [hw - 5, -hh + 15],
        [hw - 12, -hh + 5],
      ],
      '#14252eaa',
      1.5,
    );
    box(-hw + 10, -hh + 4, width - 20, 3, '#f6fbeb70');
    const glass = gradient(x, y - hh + 23, x, y + 20, [
      [0, '#8bafbb'],
      [0.27, '#395565'],
      [1, '#112531'],
    ]);
    if (van) {
      poly(
        [
          [-hw + 7, -hh + 23],
          [hw - 7, -hh + 23],
          [hw - 9, -hh + 42],
          [-hw + 9, -hh + 42],
        ],
        glass,
        '#12212a',
        2,
      );
      rule(
        [
          [-hw + 10, -hh + 25],
          [hw - 11, -hh + 28],
        ],
        '#c5e3ec66',
        1.5,
      );
      box(
        -hw + 8,
        -hh + 45,
        width - 16,
        height - 60,
        gradient(x, y - hh + 45, x, y + hh, [
          [0, color],
          [0.5, '#e9f0ea70'],
          [1, color],
        ]),
        '#27343b60',
      );
      for (let rib = 0; rib < 5; rib++)
        box(
          -hw + 13 + (rib * (width - 26)) / 5,
          -hh + 50,
          2,
          height - 73,
          '#1e33311c',
        );
      box(-1, -hh + 48, 2, height - 64, '#293e4033');
      box(-hw + 10, hh - 12, width - 20, 2, '#152b3155');
      const q = C(0, 8);
      text('TRANSIT', q[0], q[1], 7, '#293e42', 'center', 'Trebuchet MS');
    } else {
      // Sculpted bonnet, intake, windshield, side glass, roof and rear window.
      poly(
        [
          [-hw + 11, -hh + 12],
          [hw - 11, -hh + 12],
          [hw - 9, -hh + 31],
          [-hw + 9, -hh + 31],
        ],
        '#07161715',
      );
      rule(
        [
          [-hw + 15, -hh + 13],
          [-hw + 12, -hh + 30],
        ],
        '#f5ffef60',
      );
      rule(
        [
          [hw - 15, -hh + 13],
          [hw - 12, -hh + 30],
        ],
        '#1b2d3277',
      );
      box(-16, -hh + 16, 32, 3, '#17292b');
      poly(
        [
          [-hw + 8, -hh + 34],
          [hw - 8, -hh + 34],
          [hw - 14, -hh + 57],
          [-hw + 14, -hh + 57],
        ],
        glass,
        '#142832',
        1.5,
      );
      rule(
        [
          [-hw + 10, -hh + 36],
          [hw - 11, -hh + 38],
        ],
        '#e0f9ff9c',
        1.7,
      );
      rule(
        [
          [-hw + 9, -hh + 40],
          [hw - 15, -hh + 48],
        ],
        '#b0d4e033',
        3,
      );
      poly(
        [
          [-hw + 5, -hh + 38],
          [-hw + 11, -hh + 56],
          [-hw + 11, hh - 30],
          [-hw + 5, hh - 22],
        ],
        '#13252e',
      );
      poly(
        [
          [hw - 5, -hh + 38],
          [hw - 11, -hh + 56],
          [hw - 11, hh - 30],
          [hw - 5, hh - 22],
        ],
        '#13252e',
      );
      box(
        -hw + 14,
        -hh + 55,
        width - 28,
        29,
        gradient(x - hw, y, x + hw, y, [
          [0, color],
          [0.45, '#f4ffdb6b'],
          [1, color],
        ]),
      );
      poly(
        [
          [-hw + 14, hh - 29],
          [hw - 14, hh - 29],
          [hw - 9, hh - 15],
          [-hw + 9, hh - 15],
        ],
        glass,
        '#193038',
        1.2,
      );
      rule(
        [
          [-hw + 14, hh - 27],
          [hw - 13, hh - 25],
        ],
        '#c8e4ea55',
      );
      for (let i = 0; i < 3; i++) box(-13 + i * 9, hh - 11, 5, 3, '#213232');
    }
    box(-hw - 4, -8, 7, 5, '#1a2b31');
    box(hw - 3, -8, 7, 5, '#1a2b31');
    for (const side of [-1, 1]) {
      const lx = side < 0 ? -hw + 6 : hw - 20;
      box(lx, -hh + 9, 14, 5, '#172b32');
      box(lx + 1, -hh + 9, 12, 2, '#f0fff4');
      box(lx + 2, -hh + 6, 10, 2, '#9dc4d2');
      box(lx, hh - 7, 14, 4, brake ? '#ff895f' : '#e44a3c');
      if (brake) glow(x + side * hw * 0.6, y + hh, 23, '#ff562233');
    }
    box(-15, hh - 2, 30, 3, '#111f25');
    box(-19, hh - 3, 4, 5, '#c9d6d9');
    box(15, hh - 3, 4, 5, '#c9d6d9');
    if (player) {
      box(-6, -hh + 13, 12, 17, '#1f3426');
      box(-3, -hh + 13, 2, 17, '#dcf99c');
      box(-hw + 2, hh - 12, width - 4, 5, '#101d25');
      box(-hw + 3, hh - 13, width - 6, 2, '#dbfbaa');
      const badge = C(0, 8);
      text('09', badge[0], badge[1], 17, '#25351e');
      if (damaged) {
        const p = P(x, y);
        ctx.strokeStyle = '#ffb96b';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          hw * S(y) + 10,
          hh * S(y) + 10,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  function environment(scroll: number) {
    const backdrop = ctx.createLinearGradient(0, 0, 0, h);
    backdrop.addColorStop(0, '#d5ddcb');
    backdrop.addColorStop(1, '#afbca0');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, w, h);
    // Service aprons, expansion joints, drainage and guardrail foundations.
    for (const side of [-1, 1]) {
      const outer = side < 0 ? -900 : 552;
      rectangle(outer, -100, 948, 1050, '#c8d0ba');
      rectangle(side < 0 ? -90 : 556, -100, 134, 1050, '#b4bca5');
      for (let y = (scroll % 170) - 170; y < 1000; y += 170) {
        line(
          [
            [outer, y],
            [side < 0 ? 48 : 1480, y],
          ],
          '#111c2299',
          2,
        );
        if (side < 0) {
          rectangle(-94, y + 20, 86, 54, '#a0ac98', '#7e8c79');
          for (let n = 0; n < 7; n++)
            rectangle(-85 + n * 11, y + 27, 4, 41, '#65775f');
        } else {
          rectangle(581, y + 28, 103, 62, '#aebca4', '#7d8e76');
          for (let n = 0; n < 5; n++)
            line(
              [
                [590, y + 36 + n * 10],
                [674, y + 36 + n * 10],
              ],
              '#e0e6d266',
              2,
            );
        }
      }
      for (let y = ((scroll * 0.92) % 360) - 360; y < 1000; y += 360) {
        const x = side < 0 ? -175 : 686;
        rectangle(x, y, 101, 165, '#53634233');
        rectangle(x - 6, y - 8, 94, 158, '#cbd4bd', '#71876b66');
        rectangle(x + 5, y + 2, 71, 110, '#b3c4a5', '#8d9c82');
        for (let v = 0; v < 8; v++)
          line(
            [
              [x + 13, y + 13 + v * 12],
              [x + 68, y + 13 + v * 12],
            ],
            '#e3e8d4aa',
            3,
          );
        rectangle(x + 8, y + 123, 66, 7, '#819076');
      }
    }
    const asphalt = ctx.createLinearGradient(0, 0, w, 0);
    asphalt.addColorStop(0, '#4a5248');
    asphalt.addColorStop(0.5, '#687263');
    asphalt.addColorStop(1, '#4a5248');
    polygon(
      [
        [78, -150],
        [522, -150],
        [522, 1000],
        [78, 1000],
      ],
      asphalt,
    );
    ctx.save();
    polygon(
      [
        [84, -150],
        [516, -150],
        [516, 1000],
        [84, 1000],
      ],
      null,
    );
    ctx.clip();
    ctx.fillStyle = texture;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    for (const lane of LANES) {
      rectangle(lane - 29, -80, 10, 980, '#0b171b25');
      rectangle(lane + 22, -80, 10, 980, '#0b171b25');
    }
    for (let y = (scroll % 132) - 132; y < 1000; y += 132) {
      for (const x of [228, 372]) {
        rectangle(x - 3, y, 6, 57, '#111c26');
        rectangle(x - 2, y, 4, 54, '#f4f2d4bb');
        rectangle(x - 1, y, 2, 52, '#fffbe178');
      }
      for (const x of [78, 516]) {
        rectangle(x, y, 6, 72, '#dd503f');
        rectangle(x, y + 72, 6, 60, '#f8f4d4');
      }
      for (const x of [93, 504]) {
        rectangle(x, y + 13, 3, 10, '#dce9ed');
        glow(x, y + 18, 10, '#d4edff13');
      }
    }
    for (let y = (scroll % 245) - 245; y < 1000; y += 245) {
      line(
        [
          [89, y],
          [218, y + 3],
          [222, y + 8],
        ],
        '#101b2477',
      );
      line(
        [
          [380, y + 100],
          [510, y + 103],
        ],
        '#15202980',
      );
      rectangle(49, y, 22, 63, '#121e27');
      rectangle(529, y, 22, 63, '#121e27');
      for (let n = 0; n < 6; n++) {
        rectangle(51, y + n * 10 + 2, 17, 3, '#495963');
        rectangle(532, y + n * 10 + 2, 17, 3, '#495963');
      }
    }
    for (const x of [62, 534]) {
      rectangle(x, -100, 5, 1100, '#e8edd8');
      rectangle(x + 2, -100, 2, 1100, '#fafae8aa');
      rectangle(x + 5, -100, 4, 1100, '#0c1b2288');
    }
    for (let y = (scroll % 66) - 66; y < 1000; y += 66)
      for (const x of [59, 531]) {
        rectangle(x, y, 13, 6, '#121f28');
        rectangle(x + 2, y, 9, 2, '#a9bec177');
      }
    for (let y = ((scroll + 95) % 470) - 150; y < 950; y += 470) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? 35 : 565;
        rectangle(x - 4, y + 7, 9, 47, '#06121b88');
        rectangle(x - 7, y - 7, 14, 16, '#182932', '#596b75');
        line(
          [
            [x, y],
            [x + side * 9, y - 28],
          ],
          '#6e7a67',
          4,
        );
        glow(x, y - 30, 96, '#c5e4f117');
        rectangle(x - 11, y - 35, 22, 7, '#e4e8cf');
        rectangle(x - 9, y - 34, 18, 3, '#f8f7e9');
        const pool = gradient(x, y - 10, x - side * 110, y + 80, [
          [0, '#d3e9f10a'],
          [1, '#d3e9f100'],
        ]);
        polygon(
          [
            [x, y - 22],
            [x - side * 145, y + 95],
            [x - side * 85, y + 135],
          ],
          pool,
        );
      }
    }
    for (let y = ((scroll + 430) % 710) - 180; y < 950; y += 710) {
      rectangle(-8, y, 48, 64, '#141f25');
      rectangle(-11, y - 3, 48, 62, '#c04a36', '#f5d7b4aa');
      text('90', 13, y + 33, 28, '#16232a');
      text('EXPRESS', 13, y + 48, 6, '#16232a', 'center', 'Trebuchet MS');
      polygon(
        [
          [565, y + 55],
          [588, y + 55],
          [576, y + 77],
        ],
        '#f08144',
      );
    }
  }
  function draw(state: GameState) {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    w = canvas.width / ratio;
    h = canvas.height / ratio;
    portrait = w / h < 0.95;
    unit = portrait ? Math.min(h / 800, w / 448) : 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    environment(state.traveled);
    if (state.time < 2) {
      const gy = 743 + state.traveled;
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 24; col++)
          rectangle(
            84 + col * 18,
            gy + row * 18,
            18,
            18,
            (row + col) % 2 ? '#d8e1d9ad' : '#16232bd9',
          );
    }
    for (const mark of tireMarks)
      line(
        [
          [mark.x, mark.y],
          [mark.x, mark.y + mark.length],
        ],
        `rgba(7,16,22,${mark.life * 0.15})`,
        4,
      );
    for (const other of state.traffic) {
      if (other.y < -70 || other.y > 900) continue;
      ctx.globalAlpha = other.hit ? 0.45 : 1;
      car(
        other.x,
        other.y,
        other.width,
        other.height,
        colors[other.color],
        false,
        other.kind === 'van',
      );
    }
    ctx.globalAlpha =
      state.invulnerable > 0 &&
      !reducedMotion &&
      Math.floor(state.time * 10) % 2
        ? 0.66
        : 1;
    car(
      state.player.x,
      PLAYER_Y,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
      '#c8ef58',
      true,
      false,
      state.brake,
      clamp((LANES[state.player.lane] - state.player.x) / 1000, -0.055, 0.055),
      state.invulnerable > 0,
    );
    ctx.globalAlpha = 1;
    for (const spark of sparks) {
      const p = P(spark.x, spark.y);
      const s = S(spark.y);
      ctx.strokeStyle = spark.color;
      ctx.globalAlpha = Math.min(1, spark.life * 2);
      ctx.lineWidth = Math.max(1, s * 1.6);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - spark.vx * 0.027 * s, p.y - spark.vy * 0.027 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!reducedMotion && state.phase === 'playing' && state.speed > 280) {
      for (let i = 0; i < 8; i++) {
        const x = i % 2 ? 548 + i * 9 : 52 - i * 9;
        const y = ((state.traveled * (1.2 + i * 0.06) + i * 127) % 990) - 90;
        line(
          [
            [x, y],
            [x, y + 25 + (state.speed - 280) * 0.15],
          ],
          '#b7d3de18',
          1,
        );
      }
    }
    if (preview) {
      const n = Math.max(12, Math.min(27, w * 0.035));
      ctx.fillStyle = '#aa3526';
      ctx.font = `700 ${n * 1.3}px LaneDisplay, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('LANE RUSH', 20, n * 1.5);
      ctx.fillStyle = '#263e2c';
      ctx.font = `700 ${n * 0.7}px LaneText, sans-serif`;
      ctx.fillText(
        `SCORE ${String(state.score).padStart(5, '0')}`,
        20,
        n * 2.55,
      );
      const left = Math.ceil(Math.max(0, 90 - state.time));
      ctx.textAlign = 'right';
      ctx.fillStyle = '#b6402c';
      ctx.font = `700 ${n * 1.3}px LaneDisplay, sans-serif`;
      ctx.fillText(
        `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
        w - 20,
        n * 1.5,
      );
      ctx.fillStyle = '#293f27';
      ctx.fillText(`${Math.round(state.speed * 0.6)} KM/H`, w - 20, h - 22);
      ctx.fillStyle = '#3e5436';
      ctx.font = `700 ${n * 0.65}px LaneText, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(
        `${(state.distance / 1000).toFixed(2)} KM · SECTOR ${Math.min(3, Math.floor(state.time / 30) + 1)}`,
        20,
        h - 22,
      );
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < state.health ? '#3a5730' : '#ffffff22';
        ctx.fillRect(w - 65 + i * 16, n * 2.1, 12, 4);
      }
    }
  }
  function update(dt: number, events: GameEvent[], state: GameState) {
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt + state.speed * dt * 0.5;
      spark.vy += 90 * dt;
      spark.life -= dt;
    }
    sparks = sparks.filter((p) => p.life > 0);
    for (const mark of tireMarks) {
      mark.y += state.speed * dt;
      mark.life -= dt;
    }
    tireMarks = tireMarks.filter((mark) => mark.life > 0 && mark.y < 900);
    if (!reducedMotion && state.brake && state.phase === 'playing' && lastCar) {
      for (const side of [-1, 1])
        tireMarks.push({
          x: state.player.x + side * 25,
          y: PLAYER_Y + 41,
          length: state.speed * dt + 5,
          life: 0.85,
        });
    }
    lastCar = state.player.x;
    if (!reducedMotion)
      for (const event of events)
        if (event.type === 'damage')
          for (let i = 0; i < 25; i++) {
            const angle = i * 2.399;
            const speed = 60 + (i % 7) * 25;
            sparks.push({
              x: event.x + ((i % 3) - 1) * 17,
              y: PLAYER_Y - 25,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.35 + (i % 5) * 0.1,
              color: i % 3 === 0 ? '#fff1b5' : '#f1914c',
            });
          }
  }
  function resize(state: GameState) {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    draw(state);
  }
  return {
    draw,
    update,
    resize,
    reset() {
      sparks = [];
      tireMarks = [];
      lastCar = null;
    },
  };
}
