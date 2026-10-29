import type { GameState, Rock } from './engine.ts';
type Paint = string | CanvasGradient | CanvasPattern;
import { WIDTH, HEIGHT, wrap } from './engine.ts';

const TAU = Math.PI * 2;
const hash = (value: number) => {
  const n = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// All textures are our own procedural geometry. No image assets or game-state mutation.
export function createRenderer(
  canvas: HTMLCanvasElement,
  reducedMotion: () => boolean,
) {
  const ctx = canvas.getContext('2d')!;
  const background = document.createElement('canvas');
  background.width = WIDTH;
  background.height = HEIGHT;
  const bg = background.getContext('2d')!;
  const field = bg.createLinearGradient(0, 0, WIDTH, HEIGHT);
  field.addColorStop(0, '#191a12');
  field.addColorStop(0.48, '#10140f');
  field.addColorStop(1, '#292919');
  bg.fillStyle = field;
  bg.fillRect(0, 0, WIDTH, HEIGHT);

  // Original amber survey field: sparse coordinates stay quieter than moving hazards.
  bg.strokeStyle = '#d9bd6710';
  bg.lineWidth = 0.6;
  for (let x = 0; x < WIDTH; x += 80) {
    bg.beginPath();
    bg.moveTo(x, 0);
    bg.lineTo(x, HEIGHT);
    bg.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 80) {
    bg.beginPath();
    bg.moveTo(0, y);
    bg.lineTo(WIDTH, y);
    bg.stroke();
  }
  for (let i = 0; i < 230; i++) {
    bg.fillStyle = `rgba(215,204,163,${0.04 + hash(i) * 0.2})`;
    bg.fillRect(
      hash(i + 13) * WIDTH,
      hash(i + 801) * HEIGHT,
      0.6 + hash(i),
      0.6 + hash(i),
    );
  }
  const stars = Array.from({ length: 61 }, (_, i) => ({
    x: hash(i + 44) * WIDTH,
    y: hash(i + 66) * HEIGHT,
    size: 0.5 + hash(i + 912) * 1.15,
    depth: hash(i + 70),
  }));

  function resize() {
    const scale =
      Math.max(canvas.clientWidth / WIDTH, canvas.clientHeight / HEIGHT) *
      Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(WIDTH * scale));
    const height = Math.max(1, Math.round(HEIGHT * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
  }

  function polygon(
    points: number[][],
    fill?: Paint | null,
    stroke?: Paint | null,
    width = 1,
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
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function wrapped(x: number, y: number, radius: number, draw: () => void) {
    for (const ox of [-WIDTH, 0, WIDTH])
      for (const oy of [-HEIGHT, 0, HEIGHT]) {
        const px = x + ox;
        const py = y + oy;
        if (
          px < -radius ||
          px > WIDTH + radius ||
          py < -radius ||
          py > HEIGHT + radius
        )
          continue;
        ctx.save();
        ctx.translate(px, py);
        draw();
        ctx.restore();
      }
  }

  function asteroid(rock: Rock) {
    const r = rock.radius;
    const points = rock.vertices.map((value, i) => [
      Math.cos((i / 10) * TAU) * r * value,
      Math.sin((i / 10) * TAU) * r * value,
    ]);
    ctx.rotate(rock.angle);
    polygon(points, '#514f39');
    ctx.save();
    ctx.clip();
    // Broad, irregular facets preserve exactly the original outer silhouette.
    const center = [-r * 0.14, r * 0.07];
    for (let i = 0; i < 10; i++) {
      const angle = ((i + 0.5) / 10) * TAU + rock.angle;
      const light = 0.5 + Math.cos(angle + 2.2) * 0.5;
      const tone = Math.round(34 + light * 42 + hash(rock.id + i) * 13);
      polygon(
        [center, points[i], points[(i + 1) % 10]],
        `rgb(${tone},${tone + 7},${tone - 6})`,
      );
    }
    const wash = ctx.createLinearGradient(-r, -r, r, r);
    wash.addColorStop(0, 'rgba(192,204,202,0.12)');
    wash.addColorStop(0.65, 'rgba(12,25,36,0.04)');
    wash.addColorStop(1, 'rgba(2,9,15,0.4)');
    ctx.fillStyle = wash;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    if (rock.size > 1) {
      const craters = [
        [-0.25, -0.27, 0.18],
        [0.24, 0.19, 0.23],
        [0.25, -0.35, 0.095],
      ];
      for (let i = 0; i < craters.length; i++) {
        const [cx, cy, radius] = craters[i];
        const x = cx * r;
        const y = cy * r;
        const cr = radius * r;
        const pit = ctx.createRadialGradient(
          x + cr * 0.3,
          y + cr * 0.4,
          0,
          x,
          y,
          cr,
        );
        pit.addColorStop(0, '#363925');
        pit.addColorStop(0.72, '#282e20');
        pit.addColorStop(1, '#5e6044');
        ctx.fillStyle = pit;
        ctx.beginPath();
        ctx.ellipse(x, y, cr, cr * 0.76, 0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(169,183,183,0.33)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(x, y, cr, cr * 0.76, 0.3, 0.15, 2.7);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(14,26,34,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.65, r * 0.1);
      ctx.lineTo(-r * 0.24, r * 0.28);
      ctx.lineTo(-r * 0.1, r * 0.63);
      ctx.stroke();
    }
    for (let i = 0; i < rock.size * 6; i++) {
      const x = (hash(rock.id * 11 + i) - 0.5) * r * 1.8;
      const y = (hash(rock.id * 3 + i + 100) - 0.5) * r * 1.8;
      ctx.fillStyle = i % 3 ? 'rgba(183,194,190,0.13)' : 'rgba(8,18,28,0.45)';
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.restore();
    // Edge light follows the fixed scene light while the body tumbles.
    for (let i = 0; i < 10; i++) {
      const amount =
        (Math.cos(((i + 0.5) / 10) * TAU + rock.angle + 2.1) + 1) / 2;
      ctx.strokeStyle = `rgba(174,192,199,${0.18 + amount * 0.48})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(points[i][0], points[i][1]);
      ctx.lineTo(points[(i + 1) % 10][0], points[(i + 1) % 10][1]);
      ctx.stroke();
    }
  }

  function ship(state: GameState, paused: boolean) {
    const craft = state.ship;
    if (craft.shield > 0) {
      const shield = ctx.createRadialGradient(0, 0, 20, 0, 0, 30);
      shield.addColorStop(0, 'rgba(235,207,127,0)');
      shield.addColorStop(0.9, 'rgba(235,207,127,0.12)');
      shield.addColorStop(1, 'rgba(235,207,127,0)');
      ctx.fillStyle = shield;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#dfbc6d';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const angle =
          (i * TAU) / 3 + (reducedMotion() ? 0 : state.elapsed * 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, 28, angle, angle + 1.55);
        ctx.stroke();
      }
    }
    ctx.rotate(craft.angle);
    if (craft.thrust && !paused) {
      const length = reducedMotion()
        ? 27
        : 28 + Math.sin(state.elapsed * 31) * 5;
      const plume = ctx.createLinearGradient(-10, 0, -16 - length, 0);
      plume.addColorStop(0, 'rgba(227,248,246,0.95)');
      plume.addColorStop(0.28, 'rgba(238,176,83,0.8)');
      plume.addColorStop(1, 'rgba(208,137,53,0)');
      polygon(
        [
          [-11, -6],
          [-20, -5],
          [-17 - length, 0],
          [-20, 5],
          [-11, 6],
        ],
        plume,
      );
      polygon(
        [
          [-13, -2.5],
          [-29, 0],
          [-13, 2.5],
        ],
        '#e3f4ec',
      );
    }
    ctx.save();
    ctx.translate(2, 3);
    polygon(
      [
        [19, 0],
        [-13, -12],
        [-7, 0],
        [-13, 12],
      ],
      'rgba(0,4,9,0.5)',
    );
    ctx.restore();
    // Recessed engine block, swept wings, fuselage, canopy and amber identification bars.
    polygon(
      [
        [-4, -6],
        [-15, -6],
        [-15, 6],
        [-4, 6],
      ],
      '#2d414d',
      '#6a8a9b',
      0.8,
    );
    ctx.fillStyle = craft.thrust && !paused ? '#b9e6f1' : '#42677d';
    ctx.fillRect(-16, -4, 3, 8);
    polygon(
      [
        [8, -3],
        [-11, -13],
        [-13, -10],
        [-8, -2],
      ],
      '#758e9d',
      '#b6c9cf',
      0.8,
    );
    polygon(
      [
        [8, 3],
        [-11, 13],
        [-13, 10],
        [-8, 2],
      ],
      '#405d71',
      '#7895a5',
      0.8,
    );
    const hull = ctx.createLinearGradient(0, -6, 0, 7);
    hull.addColorStop(0, '#f0d18a');
    hull.addColorStop(0.48, '#c9a352');
    hull.addColorStop(0.51, '#a47931');
    hull.addColorStop(1, '#5f4b24');
    polygon(
      [
        [19, 0],
        [-6, -6],
        [-11, -3],
        [-11, 3],
        [-6, 6],
      ],
      hull,
      '#c1d8df',
      0.9,
    );
    polygon(
      [
        [8, 0],
        [-2, -2.8],
        [-5, -1.8],
        [-5, 1.8],
        [-2, 2.8],
      ],
      '#203029',
      '#daceaa',
      0.6,
    );
    ctx.strokeStyle = '#b4e0e9';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(-2, -1.8);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.strokeStyle = '#e7b778';
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(-7, -9.5);
    ctx.lineTo(-4, -7.9);
    ctx.moveTo(-7, 9.5);
    ctx.lineTo(-4, 7.9);
    ctx.stroke();
  }

  function draw(state: GameState, { paused = false } = {}) {
    ctx.drawImage(background, 0, 0);
    for (const star of stars) {
      const drift = reducedMotion()
        ? 0
        : state.elapsed * (0.08 + star.depth * 0.15);
      const x = wrap(star.x - drift, WIDTH);
      const y = wrap(star.y + drift * 0.24, HEIGHT);
      ctx.fillStyle = star.depth > 0.7 ? '#b4c8ce' : '#566f80';
      ctx.globalAlpha = 0.4 + star.depth * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, star.size, 0, TAU);
      ctx.fill();
      if (star.size > 1.4) {
        ctx.globalAlpha = 0.13;
        ctx.fillRect(x - 3, y - 0.35, 6, 0.7);
        ctx.fillRect(x - 0.35, y - 3, 0.7, 6);
      }
    }
    ctx.globalAlpha = 1;
    for (const rock of state.rocks)
      wrapped(rock.x, rock.y, rock.radius + 2, () => asteroid(rock));
    for (const bullet of state.bullets) {
      wrapped(bullet.x, bullet.y, 18, () => {
        ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
        const trail = ctx.createLinearGradient(-15, 0, 3, 0);
        trail.addColorStop(0, 'rgba(236,182,104,0)');
        trail.addColorStop(1, 'rgba(244,208,146,0.9)');
        ctx.fillStyle = trail;
        ctx.fillRect(-15, -1.5, 17, 3);
        ctx.fillStyle = 'rgba(244,195,123,0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff1ce';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, TAU);
        ctx.fill();
      });
    }
    if (!reducedMotion())
      for (const particle of state.particles) {
        wrapped(particle.x, particle.y, 8, () => {
          ctx.globalAlpha = Math.min(1, particle.life * 1.8);
          ctx.rotate(
            Math.atan2(particle.vy, particle.vx) + state.elapsed * 1.2,
          );
          const size = particle.kind === 'ship' ? 4 : 2.8;
          polygon(
            [
              [-size, -size * 0.6],
              [size * 0.8, -size * 0.2],
              [size * 0.3, size],
            ],
            particle.kind === 'ship' ? '#d0a078' : '#5c7581',
            particle.kind === 'ship' ? '#f4ca88' : '#abc2c6',
            0.7,
          );
          ctx.globalAlpha = Math.min(0.35, particle.life * 0.3);
          ctx.strokeStyle = '#edbb78';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-size, 0);
          ctx.lineTo(-size - 8, 0);
          ctx.stroke();
        });
      }
    ctx.globalAlpha = 1;
    if (state.ship.alive)
      wrapped(state.ship.x, state.ship.y, 53, () => ship(state, paused));
    // The faint edge marks belong to the flight display, not the game world.
    ctx.strokeStyle = 'rgba(127,172,190,0.26)';
    ctx.lineWidth = 1;
    for (const x of [14, WIDTH - 14])
      for (const y of [45, HEIGHT - 22]) {
        ctx.beginPath();
        ctx.moveTo(x, y + (y < 100 ? 8 : -8));
        ctx.lineTo(x, y);
        ctx.lineTo(x + (x < 100 ? 8 : -8), y);
        ctx.stroke();
      }
  }

  return { resize, draw };
}
