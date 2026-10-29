import { isClassId } from '../shared/classes.ts';
import type { ClassId } from '../shared/classes.ts';
type Parts = THREE.BufferGeometry[];
type Color = THREE.ColorRepresentation;
type Palette = (typeof PALETTES)[keyof typeof PALETTES];
interface LoftOptions {
  sides?: number;
  follow?: boolean;
  phase?: number;
  open?: number;
  thickness?: number;
  shape?:
    | ((
        point: THREE.Vector3,
        angle: number,
        ring: number,
        count: number,
      ) => void)
    | null;
}
import * as THREE from 'three';
import { stroke, makeMesh, triangles, colored } from './character-geometry.ts';
import { makeHead } from './character-heads.ts';
import { makeEmberHead, paintedSurface } from './ember-head.ts';
import { createWeaponModel } from './weapon-models.ts';
import { fitEmberWeapon } from './ember-weapon-fit.ts';

const PALETTES = {
  assault: {
    name: 'Ember' as const,
    skin: '#c18b61',
    shadow: '#946246',
    hair: '#302b2b',
    cloth: '#ca6437',
    dark: '#404044',
    armor: '#515257',
    accent: '#e28643',
    shoulder: 0.188,
    bulk: 1,
    chest: 0.403,
    waist: 0.318,
    hips: 0.348,
    thigh: 0.199,
    calf: 0.159,
    sleeve: 0.163,
    forearm: 0.104,
    stance: [-0.258, 0.308],
    step: [0.032, -0.028],
  },
  sniper: {
    name: 'Wisp' as const,
    skin: '#c29872',
    shadow: '#986e50',
    hair: '#403b38',
    cloth: '#45596f',
    dark: '#3b4659',
    armor: '#364354',
    accent: '#bc9b55',
    shoulder: 0.186,
    bulk: 1.05,
    chest: 0.409,
    waist: 0.338,
    hips: 0.355,
    thigh: 0.213,
    calf: 0.174,
    sleeve: 0.16,
    forearm: 0.12,
    stance: [-0.229, 0.291],
    step: [0.045, -0.038],
  },
  scout: {
    name: 'Dash' as const,
    skin: '#c89263',
    shadow: '#a16e48',
    hair: '#42342c',
    cloth: '#37393b',
    dark: '#41413f',
    armor: '#39616a',
    accent: '#bf974e',
    shoulder: 0.205,
    bulk: 1.03,
    chest: 0.419,
    waist: 0.322,
    hips: 0.345,
    thigh: 0.215,
    calf: 0.173,
    sleeve: 0.169,
    forearm: 0.129,
    stance: [-0.283, 0.312],
    step: [-0.015, 0.057],
  },
  heavy: {
    name: 'Rook' as const,
    skin: '#805438',
    shadow: '#63402d',
    hair: '#2c2926',
    cloth: '#353734',
    dark: '#40413b',
    armor: '#68704c',
    accent: '#8b9063',
    shoulder: 0.254,
    bulk: 1.2,
    chest: 0.506,
    waist: 0.34,
    hips: 0.418,
    thigh: 0.265,
    calf: 0.212,
    sleeve: 0.219,
    forearm: 0.162,
    stance: [-0.283, 0.285],
    step: [-0.019, 0.033],
  },
};

const point = (...values: number[]) =>
  new THREE.Vector3(values[0], values[1], values[2]);
const STANCES = {
  Ember: {
    shift: 0.035,
    knees: [0.51, 0.58],
    heights: [0.553, 0.566],
    toes: [0.42, -1.02],
  },
  Wisp: {
    shift: -0.028,
    knees: [0.95, 0.48],
    heights: [0.537, 0.517],
    toes: [-0.18, -0.96],
  },
  Dash: {
    shift: -0.019,
    knees: [0.65, 1.37],
    heights: [0.536, 0.508],
    toes: [0.08, -0.88],
  },
  Rook: {
    shift: 0.023,
    knees: [0.55, 0.95],
    heights: [0.535, 0.522],
    toes: [0.65, -0.32],
  },
};

// Ember uses the same orthographic reference frame as her reconstructed head.
// Screen-space landmarks set the pose; depth remains actual closed 3D geometry.
const EMBER_D = new THREE.Vector3(0.4, 0.08, -1).normalize();
const EMBER_R = new THREE.Vector3(-1, 0, -0.4).normalize();
const EMBER_U = new THREE.Vector3().crossVectors(EMBER_D, EMBER_R);
function emberPoint(x: number, y: number, depth = 0) {
  return point(0, 1.67, 0)
    .addScaledVector(EMBER_R, (x - 196) / 465)
    .addScaledVector(EMBER_U, (130 - y) / 465)
    .addScaledVector(EMBER_D, depth);
}

function referenceLoft(
  parts: Parts,
  sections: number[][],
  color: Color,
  { sides = 12, open = 0, thickness = 0 } = {},
) {
  const vertices = [],
    faces = [],
    count = open ? sides + 1 : sides,
    layers = thickness ? 2 : 1;
  for (let layer = 0; layer < layers; layer++)
    for (const [
      left,
      right,
      y,
      front,
      back,
      slant = 0,
      frontDrop = 0,
    ] of sections) {
      const center = (left + right) / 2,
        half = (right - left) / 2 - layer * thickness * 465;
      for (let i = 0; i < count; i++) {
        const angle = open
          ? open + ((Math.PI * 2 - open * 2) * i) / sides
          : (i / sides) * Math.PI * 2;
        const c = Math.cos(angle),
          s = Math.sin(angle),
          depth =
            c * (c > 0 ? front - layer * thickness : back - layer * thickness);
        vertices.push(
          emberPoint(
            center + half * s,
            y + slant * s + frontDrop * Math.max(0, c) ** 2,
            depth,
          ).toArray(),
        );
      }
    }
  const length = sections.length * count;
  for (let layer = 0; layer < layers; layer++)
    for (let r = 0; r < sections.length - 1; r++)
      for (let i = 0; i < sides; i++) {
        const a = layer * length + r * count + i,
          b = layer * length + r * count + ((i + 1) % count);
        const pair = [
          [a, b, a + count],
          [b, b + count, a + count],
        ];
        if (layer) pair.forEach((f) => f.reverse());
        faces.push(...pair);
      }
  if (thickness) {
    for (const r of [0, sections.length - 1])
      for (let i = 0; i < sides; i++) {
        const a = r * count + i,
          b = r * count + ((i + 1) % count),
          pair = [
            [a, b + length, b],
            [a, a + length, b + length],
          ];
        if (r === 0) pair.forEach((f) => f.reverse());
        faces.push(...pair);
      }
    if (open)
      for (let r = 0; r < sections.length - 1; r++)
        for (const i of [0, sides]) {
          const a = r * count + i,
            b = a + count,
            pair = [
              [a, b, a + length],
              [b, b + length, a + length],
            ];
          if (i === sides) pair.forEach((f) => f.reverse());
          faces.push(...pair);
        }
  } else if (!open) {
    for (let i = 1; i < sides - 1; i++)
      faces.push(
        [0, i + 1, i],
        [length - count, length - count + i, length - count + i + 1],
      );
  }
  triangles(parts, vertices, faces, color);
}

function referencePanel(
  parts: Parts,
  outline: number[][],
  depth: number | ((x: number, y: number) => number),
  color: Color,
  thickness = 0.008,
  paint = false,
) {
  if (typeof depth === 'function') {
    // Follow the curved garment between its corners. A flat chord would cut
    // through the torso and expose fragments of its underlying shell.
    const topology = THREE.ShapeUtils.triangulateShape(
      outline.map(([x, y]) => new THREE.Vector2(x, -y)),
      [],
    );
    const vertices: number[][] = [],
      faces: number[][] = [],
      paintVertices: number[][] = [],
      paintFaces: number[][] = [];
    const add = (a: number[], b: number[], c: number[]) => {
      const longest = Math.max(
        Math.hypot(a[0] - b[0], a[1] - b[1]),
        Math.hypot(b[0] - c[0], b[1] - c[1]),
        Math.hypot(c[0] - a[0], c[1] - a[1]),
      );
      if (longest > 7) {
        const mid = (p: number[], q: number[]) => [
            (p[0] + q[0]) / 2,
            (p[1] + q[1]) / 2,
            ((p[2] || 0) + (q[2] || 0)) / 2,
          ],
          ab = mid(a, b),
          bc = mid(b, c),
          ca = mid(c, a);
        add(a, ab, ca);
        add(ab, b, bc);
        add(ca, bc, c);
        add(ab, bc, ca);
        return;
      }
      const start = vertices.length;
      for (const layer of [0, thickness])
        for (const [x, y, d = 0] of [a, b, c])
          vertices.push(emberPoint(x, y, depth(x, y) + d - layer).toArray());
      if (paint) {
        const p = paintVertices.length;
        for (const [x, y, d = 0] of [a, b, c])
          paintVertices.push([x, y, depth(x, y) + d]);
        paintFaces.push([p, p + 1, p + 2]);
      } else faces.push([start, start + 1, start + 2]);
      faces.push([start + 3, start + 5, start + 4]);
    };
    for (const face of topology)
      add(outline[face[0]], outline[face[1]], outline[face[2]]);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        steps = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 5);
      for (let j = 0; j < steps; j++) {
        const p = [
            a[0] + ((b[0] - a[0]) * j) / steps,
            a[1] + ((b[1] - a[1]) * j) / steps,
          ],
          q = [
            a[0] + ((b[0] - a[0]) * (j + 1)) / steps,
            a[1] + ((b[1] - a[1]) * (j + 1)) / steps,
          ],
          start = vertices.length;
        for (const [x, y] of [p, q])
          for (const layer of [0, thickness])
            vertices.push(emberPoint(x, y, depth(x, y) - layer).toArray());
        faces.push(
          [start, start + 2, start + 1],
          [start + 2, start + 3, start + 1],
        );
      }
    }
    triangles(parts, vertices, faces, color);
    if (paint) paintedSurface(parts, paintVertices, paintFaces);
    return;
  }
  const n = outline.length,
    front = outline.map(([x, y, d = 0]) =>
      emberPoint(x, y, depth + d).toArray(),
    );
  const back = front.map((p) =>
    new THREE.Vector3(...p).addScaledVector(EMBER_D, -thickness).toArray(),
  );
  const flat = outline.map(([x, y]) => new THREE.Vector2(x, -y));
  const cap = THREE.ShapeUtils.triangulateShape(flat, []),
    vertices = [...front, ...back],
    faces = [];
  for (const tri of cap) {
    const normal = new THREE.Vector3()
      .subVectors(
        new THREE.Vector3(...front[tri[1]]),
        new THREE.Vector3(...front[tri[0]]),
      )
      .cross(
        new THREE.Vector3().subVectors(
          new THREE.Vector3(...front[tri[2]]),
          new THREE.Vector3(...front[tri[0]]),
        ),
      );
    const f = normal.dot(EMBER_D) > 0 ? tri : [...tri].reverse();
    if (paint)
      paintedSurface(
        parts,
        outline.map(([x, y, d = 0]) => [x, y, depth + d]),
        [f],
      );
    else faces.push(f);
    faces.push([...f].reverse().map((i) => i + n));
  }
  const area = flat.reduce(
    (sum: number, a: { x: number; y: number }, i: number) => {
      const b = flat[(i + 1) % n];
      return sum + a.x * b.y - b.x * a.y;
    },
    0,
  );
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n,
      pair = [
        [i, i + n, j],
        [j, i + n, j + n],
      ];
    if (area < 0) pair.forEach((f) => f.reverse());
    faces.push(...pair);
  }
  triangles(parts, vertices, faces, color);
}

function makeEmberTorso(style: Palette) {
  const parts: THREE.BufferGeometry<
    THREE.NormalBufferAttributes,
    THREE.BufferGeometryEventMap
  >[] = [];
  const jacketProfile = [
    [102, 253, 349, 0.139],
    [101, 263, 323, 0.145],
    [98, 276, 275, 0.151],
    [116, 280, 236, 0.123],
    [138, 255, 213, 0.086],
  ];
  const jacketSurface =
    (offset = 0) =>
    (x: number, y: number) => {
      let a = jacketProfile[0],
        b = a;
      for (let i = 1; i < jacketProfile.length; i++) {
        b = jacketProfile[i];
        if (y >= b[2]) break;
        a = b;
      }
      const t =
        a === b ? 0 : THREE.MathUtils.clamp((a[2] - y) / (a[2] - b[2]), 0, 1);
      const left = THREE.MathUtils.lerp(a[0], b[0], t),
        right = THREE.MathUtils.lerp(a[1], b[1], t),
        radius = THREE.MathUtils.lerp(a[3], b[3], t);
      const q = (x - (left + right) / 2) / ((right - left) / 2);
      return Math.sqrt(Math.max(0.02, 1 - q * q)) * radius + offset;
    };
  referenceLoft(
    parts,
    [
      [123, 224, 476, 0.105, 0.1],
      [101, 246, 433, 0.119, 0.112],
      [107, 239, 396, 0.112, 0.107],
      [118, 231, 361, 0.106, 0.102],
      [106, 255, 318, 0.126, 0.11],
      [101, 265, 274, 0.139, 0.114],
      [120, 267, 235, 0.119, 0.092],
      [154, 224, 213, 0.084, 0.079, 0, 27],
    ],
    style.dark,
    { sides: 12 },
  );
  // One open garment shell; the lapels and hems are continuations of its edges.
  referenceLoft(
    parts,
    [
      [102, 253, 349, 0.139, 0.121, -5],
      [101, 263, 323, 0.145, 0.124, -4],
      [98, 276, 275, 0.151, 0.126, -3],
      [116, 280, 236, 0.123, 0.105, 3],
      [138, 255, 213, 0.086, 0.084, 4],
    ],
    style.cloth,
    { sides: 16, open: 0.53, thickness: 0.012 },
  );
  referencePanel(
    parts,
    [
      [162, 232],
      [151, 250],
      [134, 277],
      [142, 319],
      [151, 349],
      [210, 352],
      [220, 319],
      [218, 270],
      [209, 235],
      [196, 239],
      [176, 240],
    ],
    jacketSurface(0.002),
    '#48474d',
    0.018,
  );
  referencePanel(
    parts,
    [
      [145, 268],
      [217, 268],
      [219, 287],
      [140, 285],
    ],
    jacketSurface(0.006),
    '#555259',
    0.005,
  );
  referencePanel(
    parts,
    [
      [143, 315],
      [219, 317],
      [217, 331],
      [147, 329],
    ],
    jacketSurface(0.006),
    '#3d3c42',
    0.005,
  );
  referencePanel(
    parts,
    [
      [136, 218],
      [162, 227],
      [149, 258],
      [136, 297],
      [140, 344],
      [112, 351],
      [103, 318],
      [105, 277],
    ],
    jacketSurface(0.006),
    '#b95831',
    0.014,
  );
  referencePanel(
    parts,
    [
      [217, 220],
      [243, 210],
      [266, 232],
      [258, 290],
      [251, 342],
      [223, 344],
      [220, 291],
    ],
    jacketSurface(0.006),
    '#c45e34',
    0.015,
  );
  referencePanel(
    parts,
    [
      [225, 254],
      [259, 248],
      [256, 283],
      [222, 289],
    ],
    jacketSurface(0.009),
    '#cb6738',
    0.005,
  );
  referencePanel(
    parts,
    [
      [105, 289],
      [140, 279],
      [137, 313],
      [107, 323],
    ],
    jacketSurface(0.009),
    '#c56a3c',
    0.005,
  );
  referencePanel(
    parts,
    [
      [222, 344],
      [251, 344],
      [247, 369],
      [218, 368],
    ],
    0.139,
    '#ad754e',
    0.018,
  );
  referenceLoft(
    parts,
    [
      [154, 228, 216, 0.091, 0.089],
      [147, 231, 194, 0.085, 0.085],
    ],
    '#b95831',
    { sides: 14, open: 0.86, thickness: 0.008 },
  );
  referencePanel(
    parts,
    [
      [138, 196, -0.055],
      [154, 188, -0.04],
      [164, 220, 0.076],
      [153, 241, 0.106],
      [145, 219, 0.022],
    ],
    0,
    '#c9693b',
    0.012,
    true,
  );
  referencePanel(
    parts,
    [
      [221, 211, 0.057],
      [224, 187, -0.016],
      [248, 183, -0.055],
      [237, 216, 0.018],
      [219, 243, 0.11],
    ],
    0,
    '#bd592f',
    0.012,
    true,
  );
  referencePanel(
    parts,
    [
      [224, 187, -0.011],
      [248, 183, -0.05],
      [246, 190, -0.039],
      [224, 198, 0.015],
    ],
    0,
    '#d47943',
    0.005,
    true,
  );
  referencePanel(
    parts,
    [
      [125, 207],
      [141, 211],
      [136, 234],
      [113, 241],
      [114, 222],
    ],
    (x, y) => Math.max(0.09, jacketSurface(0.023)(x, y)),
    '#6b6359',
    0.02,
    true,
  );
  referencePanel(
    parts,
    [
      [241, 207],
      [272, 211],
      [263, 242],
      [237, 235],
    ],
    (x, y) => Math.max(0.09, jacketSurface(0.023)(x, y)),
    '#70695e',
    0.022,
    true,
  );
  referencePanel(
    parts,
    [
      [114, 225],
      [138, 221],
      [136, 234],
      [113, 241],
    ],
    (x, y) => Math.max(0.098, jacketSurface(0.03)(x, y)),
    '#8a8073',
    0.008,
    true,
  );
  referencePanel(
    parts,
    [
      [240, 225],
      [266, 228],
      [263, 242],
      [237, 235],
    ],
    (x, y) => Math.max(0.098, jacketSurface(0.03)(x, y)),
    '#857c70',
    0.008,
    true,
  );
  referenceLoft(
    parts,
    [
      [104, 244, 414, 0.127, 0.116],
      [104, 244, 395, 0.127, 0.116],
    ],
    '#34372f',
    { sides: 12 },
  );
  referencePanel(
    parts,
    [
      [162, 397],
      [183, 396],
      [184, 412],
      [163, 414],
    ],
    0.14,
    '#716b5c',
    0.01,
  );
  for (const [x, y] of [
    [125, 419],
    [219, 406],
  ]) {
    const p = emberPoint(x, y, 0.14);
    softBox(parts, p.toArray(), [0.062, 0.106, 0.053], '#353832', 0.006);
  }
  const puckCenter = emberPoint(100, 419, 0.135);
  const puckNormal = EMBER_D.clone()
    .multiplyScalar(0.68)
    .addScaledVector(EMBER_R, 0.73)
    .normalize();
  for (const [radius, depth, color, offset] of [
    [0.056, 0.023, '#303735', 0],
    [0.046, 0.007, '#92502d', 0.015],
    [0.038, 0.008, '#cf773a', 0.02],
  ] as const) {
    const g = colored(
      new THREE.CylinderGeometry(radius, radius, depth, 12),
      color,
    );
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(point(0, 1, 0), puckNormal),
    );
    g.translate(
      ...puckCenter.clone().addScaledVector(puckNormal, offset).toArray(),
    );
    parts.push(g);
  }
  const torso = makeMesh(parts, 'character-torso');
  torso.material.dispose();
  torso.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  return torso;
}

// A closed cut-cloth panel: its outlined front is the visible lapel or armor face.
function panel(
  parts: Parts,
  outline: number[][],
  thickness: number,
  color: Color,
) {
  const vertices = [
    ...outline,
    ...outline.map(([x, y, z]) => [x, y, z + thickness]),
  ];
  const faces = [];
  const n = outline.length;
  const area = outline.reduce((sum: number, a: number[], i: number) => {
    const b = outline[(i + 1) % n];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  for (let i = 1; i < n - 1; i++)
    faces.push([0, i + 1, i], [n, n + i, n + i + 1]);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([i, next, n + i], [next, n + next, n + i]);
  }
  if (area < 0) faces.forEach((face) => face.reverse());
  triangles(parts, vertices, faces, color);
}

function beveledPanel(
  parts: Parts,
  outline: number[][],
  frontZ: number,
  depth: number,
  color: Color,
  inset = 0.012,
) {
  const n = outline.length;
  const centerX = outline.reduce((sum, [x]) => sum + x, 0) / n;
  const centerY = outline.reduce((sum, [, y]) => sum + y, 0) / n;
  const outer = outline.map(([x, y]) => [x, y, frontZ + inset]);
  const front = outline.map(([x, y]) => [
    centerX + (x - centerX) * 0.91,
    centerY + (y - centerY) * 0.94,
    frontZ,
  ]);
  const back = outline.map(([x, y]) => [x, y, frontZ + depth]);
  const vertices = [...outer, ...front, ...back];
  const faces = [];
  const capFaces = THREE.ShapeUtils.triangulateShape(
    outline.map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  for (const face of capFaces) {
    const [a, b, c] = face.map((i) => outline[i]);
    const ccw =
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
        ? face
        : [...face].reverse();
    faces.push(
      [...ccw].reverse().map((i) => n + i),
      ccw.map((i) => n * 2 + i),
    );
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push([next, i, n + i], [next, n + i, n + next]);
    faces.push([i, next, n * 2 + next], [i, n * 2 + next, n * 2 + i]);
  }
  triangles(parts, vertices, faces, color);
}

// Each cross-section is an authored garment/anatomy contour. Uneven radial
// offsets describe tension folds; they are not a subdivision of a primitive.
function tailoredLoft(
  parts: Parts,
  sections: number[][],
  color: Color,
  {
    sides = 16,
    follow = false,
    phase = 0,
    open = 0,
    thickness = 0,
    shape = null,
  }: LoftOptions = {},
) {
  const vertices: number[][] = [],
    faces: number[][] = [];
  const up = point(0, 1, 0);
  const centers = sections.map((s) => point(...s.slice(0, 3)));
  const count = open ? sides + 1 : sides;
  const layers = thickness ? 2 : 1;
  for (let layer = 0; layer < layers; layer++) {
    sections.forEach(([x, y, z, width, depth, fold = 0, slant = 0], ring) => {
      const tangent = centers[Math.min(ring + 1, centers.length - 1)]
        .clone()
        .sub(centers[Math.max(ring - 1, 0)])
        .normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(up, tangent);
      for (let side = 0; side < count; side++) {
        const angle = open
          ? open + ((Math.PI * 2 - 2 * open) * side) / sides
          : (Math.PI * 2 * side) / sides;
        const wave =
          Math.sin(angle * 3 + phase + ring * 0.83) * 0.7 +
          Math.cos(angle * 5 - ring * 0.61) * 0.3;
        const radius = 1 + fold * wave;
        const w = width - layer * thickness * 2,
          d = depth - layer * thickness * 2;
        // Slightly squared fabric panels have broad fronts and curved side seams.
        const sx = Math.sin(angle),
          cz = -Math.cos(angle);
        const section = point(
          Math.sign(sx) * Math.abs(sx) ** 0.87 * w * 0.5 * radius,
          slant * sx + fold * 0.009 * Math.sin(angle * 2 + ring),
          Math.sign(cz) * Math.abs(cz) ** 0.92 * d * 0.5 * radius,
        );
        if (shape) shape(section, angle, ring, sections.length);
        if (follow) section.applyQuaternion(turn);
        vertices.push([x + section.x, y + section.y, z + section.z]);
      }
    });
  }
  const ringCount = sections.length,
    layerSize = ringCount * count;
  for (let layer = 0; layer < layers; layer++)
    for (let r = 0; r < ringCount - 1; r++)
      for (let s = 0; s < sides; s++) {
        const a = layer * layerSize + r * count + s,
          b = layer * layerSize + r * count + ((s + 1) % count);
        const pair = [
          [a, a + count, b],
          [b, a + count, b + count],
        ];
        if (layer) pair.forEach((face) => face.reverse());
        faces.push(...pair);
      }
  if (thickness) {
    for (const r of [0, ringCount - 1])
      for (let s = 0; s < sides; s++) {
        const a = r * count + s,
          b = r * count + ((s + 1) % count);
        const pair = [
          [a, b, b + layerSize],
          [a, b + layerSize, a + layerSize],
        ];
        if (r === 0) pair.forEach((face) => face.reverse());
        faces.push(...pair);
      }
    if (open)
      for (let r = 0; r < ringCount - 1; r++)
        for (const s of [0, sides]) {
          const a = r * count + s,
            b = a + count;
          const pair = [
            [a, a + layerSize, b],
            [b, a + layerSize, b + layerSize],
          ];
          if (s === sides) pair.forEach((face) => face.reverse());
          faces.push(...pair);
        }
  } else if (!open) {
    for (let s = 1; s < sides - 1; s++)
      faces.push(
        [0, s, s + 1],
        [
          (ringCount - 1) * count,
          (ringCount - 1) * count + s + 1,
          (ringCount - 1) * count + s,
        ],
      );
  }
  return triangles(parts, vertices, faces, color);
}

function shapedLimb(
  parts: Parts,
  start: THREE.Vector3,
  end: THREE.Vector3,
  sections: number[][],
  color: Color,
  options: LoftOptions = {},
) {
  return tailoredLoft(
    parts,
    sections.map(([t, w, d, fold = 0, slant = 0]) => [
      ...start.clone().lerp(end, t).toArray(),
      w,
      d,
      fold,
      slant,
    ]),
    color,
    { follow: true, ...options },
  );
}

function softBox(
  parts: Parts,
  position: number[],
  size: number[],
  color: Color,
  bevel = 0.008,
) {
  const [w, h, d] = size,
    [x, y, z] = position;
  const outline = [
    [x - w / 2 + bevel, y - h / 2],
    [x - w / 2, y - h / 2 + bevel],
    [x - w / 2, y + h / 2 - bevel],
    [x - w / 2 + bevel, y + h / 2],
    [x + w / 2 - bevel, y + h / 2],
    [x + w / 2, y + h / 2 - bevel],
    [x + w / 2, y - h / 2 + bevel],
    [x + w / 2 - bevel, y - h / 2],
  ];
  beveledPanel(parts, outline, z - d / 2, d, color, bevel * 0.5);
}

function makeTorso(id: ClassId, style: Palette) {
  if (id === 'assault') return makeEmberTorso(style);
  const parts: THREE.BufferGeometry<
      THREE.NormalBufferAttributes,
      THREE.BufferGeometryEventMap
    >[] = [],
    heavy = id === 'heavy',
    ember = false,
    wisp = id === 'sniper';
  const shift = STANCES[style.name].shift;
  const chest = style.chest * (ember ? 0.955 : 1),
    depth = heavy ? 0.326 : 0.273;
  const core = id === 'scout' ? '#36393a' : ember ? '#44454b' : style.cloth;
  // The pelvis, waist, rib cage and shoulder yoke are one connected volume.
  tailoredLoft(
    parts,
    [
      [shift, 0.94, 0.022, style.hips * 0.91, depth * 0.8, 0.035],
      [shift, 1.015, 0.017, style.hips, depth * 0.92, 0.025],
      [shift * 0.84, 1.085, 0.01, style.waist, depth * 0.81, 0.02],
      [shift * 0.66, 1.16, 0.006, style.waist * 0.99, depth * 0.82, 0.02],
      [shift * 0.42, 1.255, 0.006, chest * 0.91, depth * 0.94, 0.016],
      [shift * 0.2, 1.345, 0.008, chest, depth, 0.013],
      [0, 1.403, 0.01, chest * 0.98, depth * 0.94, 0.012],
      [0, 1.455, 0.017, chest * 0.88, depth * 0.77, 0],
      [0, 1.492, 0.021, heavy ? 0.213 : 0.177, depth * 0.57, 0],
    ],
    core,
    {
      sides: 20,
      shape: (v: { y: number }, angle: number, ring: number, total: number) => {
        if (Math.cos(angle) > 0 && (ember || id === 'scout')) {
          if (ring === total - 1) v.y -= 0.046 * Math.cos(angle) ** 2;
          else if (ring === total - 2) v.y -= 0.018 * Math.cos(angle) ** 2;
        }
      },
    },
  );
  // Broad clavicle surface narrows into the neck; no cylindrical peg above a flat chest.
  tailoredLoft(
    parts,
    [
      [0, 1.407, -0.001, heavy ? 0.277 : 0.233, 0.177],
      [0, 1.465, 0.008, heavy ? 0.242 : 0.205, 0.158],
      [
        0,
        1.51,
        0.011,
        heavy ? 0.16 : ember ? 0.128 : 0.142,
        ember ? 0.128 : 0.143,
      ],
      [
        0,
        1.565,
        0.012,
        heavy ? 0.149 : ember ? 0.116 : 0.14,
        ember ? 0.121 : 0.137,
      ],
      [
        0,
        1.65,
        0.017,
        heavy ? 0.151 : ember ? 0.114 : 0.141,
        ember ? 0.119 : 0.128,
      ],
    ],
    style.skin,
    { sides: 14 },
  );
  if (ember) {
    // A continuous open shell follows the back, side seams and both jacket fronts.
    tailoredLoft(
      parts,
      [
        [shift * 0.6, 1.19, 0.012, 0.338, 0.292, 0.035, -0.01],
        [shift * 0.5, 1.202, 0.01, 0.341, 0.294, 0.02, -0.009],
        [shift * 0.32, 1.235, 0.01, 0.357, 0.302, 0.045, -0.008],
        [shift * 0.18, 1.282, 0.012, 0.379, 0.307, 0.018, -0.006],
        [0, 1.342, 0.014, 0.389, 0.309, 0.025, -0.005],
        [0, 1.405, 0.017, 0.39, 0.285, 0.014, -0.008],
        [0, 1.449, 0.022, 0.365, 0.243, 0.012, -0.012],
        [0, 1.476, 0.027, 0.304, 0.189, 0, -0.008],
      ],
      style.cloth,
      { sides: 24, open: 0.58, thickness: 0.012, phase: 0.8 },
    );
    tailoredLoft(
      parts,
      [
        [0, 1.473, 0.029, 0.196, 0.162],
        [0, 1.511, 0.033, 0.229, 0.174],
        [0, 1.543, 0.031, 0.239, 0.163],
      ],
      '#bd5d32',
      {
        sides: 18,
        open: 0.72,
        thickness: 0.008,
        shape: (v: { y: number }, angle, ring) => {
          if (ring === 2) v.y += 0.009 * Math.max(0, -Math.cos(angle));
        },
      },
    );
    for (const side of [-1, 1]) {
      // The jacket front turns forward from the side seam, clear of the tank top.
      panel(
        parts,
        [
          [side * 0.097, 1.43, -0.156],
          [side * 0.154, 1.461, -0.119],
          [side * 0.188, 1.4, -0.102],
          [side * 0.19, 1.324, -0.106],
          [side * 0.175, 1.202, -0.139],
          [side * 0.101, 1.194, -0.159],
          [side * 0.106, 1.301, -0.165],
        ],
        0.015,
        side < 0 ? '#c76336' : '#ce693a',
      );
      panel(
        parts,
        [
          [side * 0.11, 1.301, -0.168],
          [side * 0.17, 1.316, -0.14],
          [side * 0.177, 1.276, -0.142],
          [side * 0.106, 1.269, -0.166],
        ],
        0.004,
        side < 0 ? '#b5572e' : '#bc5c31',
      );
      // A tapered turned-out lapel grows from the wrapping rear collar.
      panel(
        parts,
        [
          [side * 0.083, 1.436, -0.153],
          [side * 0.055, 1.495, -0.113],
          [side * 0.133, 1.544, -0.054],
          [side * 0.12, 1.478, -0.137],
        ],
        0.008,
        '#a54f2a',
      );
      panel(
        parts,
        [
          [side * 0.088, 1.443, -0.16],
          [side * 0.077, 1.493, -0.122],
          [side * 0.145, 1.548, -0.061],
          [side * 0.123, 1.48, -0.142],
        ],
        0.006,
        '#cf6c3b',
      );
      stroke(
        parts,
        [side * 0.179, 1.458, -0.089],
        [side * 0.157, 1.405, -0.14],
        0.052,
        0.027,
        '#6c6458',
        4,
      );
      softBox(
        parts,
        [side * 0.16, 1.439, -0.119],
        [0.05, 0.024, 0.012],
        '#928578',
        0.004,
      );
      panel(
        parts,
        [
          [side * 0.117, 1.187, -0.146],
          [side * 0.164, 1.235, -0.132],
          [side * 0.171, 1.175, -0.136],
        ],
        0.003,
        '#bc5b30',
      );
    }
    // The fitted shirt's broad courses wrap the chest instead of floating as boxes.
    tailoredLoft(
      parts,
      [
        [shift * 0.45, 1.16, -0.071, 0.227, 0.145],
        [shift * 0.25, 1.25, -0.076, 0.274, 0.152],
        [0, 1.337, -0.075, 0.289, 0.148],
        [0, 1.446, -0.074, 0.246, 0.128],
      ],
      '#4d4c52',
      { sides: 16 },
    );
    panel(
      parts,
      [
        [-0.132, 1.316, -0.149],
        [-0.134, 1.29, -0.15],
        [0.134, 1.29, -0.15],
        [0.132, 1.316, -0.149],
      ],
      0.004,
      '#59575e',
    );
    panel(
      parts,
      [
        [-0.12, 1.223, -0.151],
        [-0.123, 1.202, -0.149],
        [0.123, 1.202, -0.149],
        [0.12, 1.223, -0.151],
      ],
      0.004,
      '#3e3e44',
    );
  } else if (wisp) {
    tailoredLoft(
      parts,
      [
        [shift, 0.975, 0.019, 0.332, 0.284, 0.04],
        [shift, 1.024, 0.014, 0.353, 0.289, 0.04],
        [shift * 0.6, 1.091, 0.01, 0.36, 0.289, 0.02],
        [shift * 0.4, 1.162, 0.011, 0.361, 0.294, 0.025],
        [0, 1.262, 0.013, 0.413, 0.303, 0.015],
        [0, 1.385, 0.02, 0.432, 0.294, 0.012],
        [0, 1.456, 0.025, 0.4, 0.254, 0],
        [0, 1.48, 0.032, 0.275, 0.174, 0],
      ],
      style.cloth,
      {
        sides: 24,
        open: 0.16,
        thickness: 0.01,
        shape: (v: { y: number }, angle, ring) => {
          if (ring === 0) v.y += 0.047 * Math.max(0, Math.cos(angle)) ** 4;
        },
      },
    );
    tailoredLoft(
      parts,
      [
        [0, 1.448, 0.031, 0.27, 0.188],
        [0, 1.511, 0.035, 0.264, 0.183],
        [0, 1.57, 0.033, 0.258, 0.174],
      ],
      '#374960',
      {
        sides: 18,
        open: 0.69,
        thickness: 0.012,
        shape: (v: { y: number }, angle, ring) => {
          if (ring === 2) v.y += 0.008 * Math.sin(angle);
        },
      },
    );
    for (const side of [-1, 1]) {
      if (side < 0) {
        panel(
          parts,
          [
            [-0.025, 1.439, -0.16],
            [-0.03, 1.551, -0.111],
            [-0.128, 1.575, -0.05],
            [-0.151, 1.512, -0.044],
            [-0.102, 1.446, -0.143],
          ],
          0.017,
          '#4b607a',
        );
        panel(
          parts,
          [
            [-0.031, 1.552, -0.113],
            [-0.128, 1.575, -0.052],
            [-0.126, 1.56, -0.06],
            [-0.031, 1.536, -0.118],
          ],
          0.006,
          '#61748a',
        );
      } else {
        panel(
          parts,
          [
            [0.058, 1.444, -0.15],
            [0.066, 1.529, -0.049],
            [0.118, 1.574, 0.003],
            [0.158, 1.539, -0.016],
            [0.116, 1.455, -0.127],
          ],
          0.014,
          '#42556f',
        );
      }
      panel(
        parts,
        [
          [side * 0.027, 1.334, -0.153],
          [side * 0.182, 1.331, -0.128],
          [side * 0.173, 1.273, -0.142],
          [side * 0.027, 1.282, -0.16],
        ],
        0.012,
        '#536981',
      );
      panel(
        parts,
        [
          [side * 0.025, 1.246, -0.16],
          [side * 0.176, 1.254, -0.138],
          [side * 0.16, 1.235, -0.147],
          [side * 0.025, 1.229, -0.155],
        ],
        0.007,
        '#40556f',
      );
    }
    tailoredLoft(
      parts,
      [
        [0, 1.395, 0.003, 0.249, 0.207],
        [0, 1.465, 0.008, 0.216, 0.176],
        [0, 1.544, 0.012, 0.151, 0.147],
      ],
      '#2d333c',
      { sides: 16 },
    );
    stroke(
      parts,
      [0.007, 1.439, -0.15],
      [shift + 0.007, 1.03, -0.141],
      0.014,
      0.012,
      '#293440',
      4,
    );
  } else {
    const width = heavy ? 0.447 : 0.377,
      front = heavy ? -0.186 : -0.166;
    const outline = [
      [-width * 0.39, 1.432],
      [-width * 0.5, 1.351],
      [-width * 0.47, 1.226],
      [-width * 0.36, 1.122],
      [width * 0.36, 1.122],
      [width * 0.47, 1.226],
      [width * 0.5, 1.351],
      [width * 0.39, 1.432],
      [width * 0.23, 1.427],
      [width * 0.15, 1.393],
      [-width * 0.15, 1.393],
      [-width * 0.23, 1.427],
    ];
    if (heavy)
      for (const point of outline) if (point[1] >= 1.393) point[1] += 0.04;
    beveledPanel(parts, outline, front - 0.009, 0.059, style.armor, 0.012);
    panel(
      parts,
      [
        [-width * 0.444, 1.325, front - 0.011],
        [-width * 0.427, 1.275, front - 0.011],
        [width * 0.427, 1.275, front - 0.011],
        [width * 0.444, 1.325, front - 0.011],
      ],
      0.003,
      heavy ? '#727852' : '#416b74',
    );
    panel(
      parts,
      [
        [-width * 0.428, 1.263, front - 0.011],
        [-width * 0.403, 1.214, front - 0.011],
        [width * 0.403, 1.214, front - 0.011],
        [width * 0.428, 1.263, front - 0.011],
      ],
      0.003,
      heavy ? '#656b4d' : '#385d66',
    );
    for (const side of [-1, 1]) {
      panel(
        parts,
        [
          [side * (heavy ? 0.123 : 0.105), 1.484, -0.045],
          [side * (heavy ? 0.213 : 0.184), 1.452, -0.055],
          [side * (heavy ? 0.205 : 0.166), 1.359, front - 0.019],
          [side * (heavy ? 0.128 : 0.105), 1.366, front - 0.019],
        ],
        0.045,
        style.armor,
      );
      softBox(
        parts,
        [side * (heavy ? 0.166 : 0.135), 1.366, front - 0.026],
        [heavy ? 0.07 : 0.049, 0.041, 0.023],
        '#383d3b',
        0.004,
      );
    }
    if (heavy) {
      softBox(parts, [0, 1.144, -0.177], [0.313, 0.1, 0.051], '#585f43', 0.012);
      for (const x of [-0.095, 0, 0.095])
        softBox(
          parts,
          [x, 1.067, -0.166],
          [0.084, 0.092, 0.055],
          '#656c4b',
          0.005,
        );
    }
  }
  if (ember || wisp)
    for (const side of [-1, 1]) {
      const x = style.chest * (wisp ? 0.38 : 0.405);
      stroke(
        parts,
        [side * x, 1.466, -0.092],
        [side * x * 0.91, 1.259, -0.149],
        wisp ? 0.053 : 0.04,
        0.022,
        wisp ? '#5d605e' : '#575650',
        4,
      );
      for (const y of wisp ? [1.416, 1.355, 1.29] : [1.44])
        softBox(
          parts,
          [side * x * 0.96, y, -0.121 - (1.416 - y) * 0.15],
          [wisp ? 0.059 : 0.045, 0.023, 0.011],
          wisp ? '#777973' : '#898077',
          0.003,
        );
    }
  const beltY = 1.085;
  tailoredLoft(
    parts,
    [
      [shift, beltY - 0.026, 0.008, style.hips * 1.065, depth * 0.96],
      [shift, beltY + 0.025, 0.008, style.hips * 1.065, depth * 0.96],
    ],
    '#3b3d35',
    { sides: 20 },
  );
  softBox(
    parts,
    [shift + 0.009, beltY, -depth * 0.485],
    [0.061, 0.041, 0.021],
    '#7a7563',
    0.004,
  );
  for (const side of [-1, 1]) {
    const x = shift + side * style.hips * 0.465;
    softBox(
      parts,
      [x, beltY - 0.015, -0.046],
      [0.091, 0.149, 0.115],
      '#373a32',
      0.01,
    );
    softBox(
      parts,
      [x, beltY + 0.037, -0.108],
      [0.09, 0.035, 0.018],
      '#474a40',
      0.004,
    );
  }
  if (ember) {
    const puck = colored(
      new THREE.CylinderGeometry(0.059, 0.063, 0.037, 16),
      '#343939',
    );
    puck.rotateX(Math.PI / 2);
    puck.rotateY(0.2);
    puck.translate(shift + 0.186, 1.09, -0.091);
    parts.push(puck);
    const rim = colored(
      new THREE.CylinderGeometry(0.047, 0.049, 0.008, 16),
      '#9a532b',
    );
    rim.rotateX(Math.PI / 2);
    rim.rotateY(0.2);
    rim.translate(shift + 0.191, 1.09, -0.115);
    parts.push(rim);
    const center = colored(
      new THREE.CylinderGeometry(0.041, 0.043, 0.009, 16),
      '#d47b3b',
    );
    center.rotateX(Math.PI / 2);
    center.rotateY(0.2);
    center.translate(shift + 0.192, 1.09, -0.121);
    parts.push(center);
  }
  return makeMesh(parts, 'character-torso');
}

function addGripHand(
  parts: Parts,
  hand: THREE.Vector3,
  orientation: THREE.Quaternion,
  side: number,
  fingerColor: Color,
) {
  const pieces: Parts = [];
  const finger = (points: number[][], width: number, color: Color) => {
    tailoredLoft(
      pieces,
      points.map(([x, y, z], i) => [
        x,
        y,
        z,
        width * (i === 0 ? 0.83 : i === points.length - 1 ? 0.72 : 1),
        width * 0.85,
      ]),
      color,
      { sides: 8, follow: true },
    );
  };
  if (side > 0) {
    tailoredLoft(
      pieces,
      [
        [0.03, -0.037, 0.012, 0.031, 0.043],
        [0.04, -0.022, 0.009, 0.04, 0.058],
        [0.042, 0.008, 0.006, 0.043, 0.061],
        [0.034, 0.03, 0.002, 0.038, 0.052],
      ],
      '#393e43',
      { sides: 12 },
    );
    // Three independently curled fingers leave narrow valleys between knuckles.
    for (const [y, width] of [
      [-0.032, 0.017],
      [-0.012, 0.019],
      [0.009, 0.019],
    ]) {
      finger(
        [
          [0.044, y, 0.003],
          [0.05, y, -0.019],
          [0.035, y, -0.04],
          [0.008, y, -0.044],
        ],
        width,
        '#454a50',
      );
      finger(
        [
          [0.008, y, -0.044],
          [-0.012, y, -0.037],
          [-0.019, y, -0.02],
        ],
        width * 0.88,
        fingerColor,
      );
    }
    // Extended index sits above the curl on the guard; the thumb opposes it.
    finger(
      [
        [0.037, 0.026, 0.004],
        [0.049, 0.036, -0.016],
        [0.036, 0.041, -0.038],
        [0.004, 0.037, -0.05],
      ],
      0.017,
      '#454a50',
    );
    finger(
      [
        [0.004, 0.037, -0.05],
        [-0.015, 0.031, -0.046],
      ],
      0.014,
      fingerColor,
    );
    finger(
      [
        [0.045, 0.015, 0.034],
        [0.032, 0.037, 0.035],
        [0.011, 0.045, 0.02],
        [-0.001, 0.039, 0.001],
      ],
      0.025,
      '#45494d',
    );
    finger(
      [
        [0.011, 0.045, 0.02],
        [-0.001, 0.039, 0.001],
        [-0.001, 0.029, -0.011],
      ],
      0.022,
      fingerColor,
    );
    softBox(
      pieces,
      [0.061, -0.002, 0.004],
      [0.008, 0.045, 0.043],
      '#50555a',
      0.003,
    );
  } else {
    tailoredLoft(
      pieces,
      [
        [0, -0.047, 0.006, 0.055, 0.066],
        [0, -0.033, 0.004, 0.078, 0.079],
        [0, -0.015, 0.004, 0.076, 0.077],
        [0, -0.005, 0.002, 0.062, 0.067],
      ],
      '#393e43',
      { sides: 12 },
    );
    for (const [z, width] of [
      [-0.032, 0.017],
      [-0.011, 0.019],
      [0.012, 0.019],
      [0.034, 0.017],
    ]) {
      finger(
        [
          [0.03, -0.028, z],
          [0.048, -0.015, z],
          [0.052, 0.009, z],
          [0.043, 0.03, z],
        ],
        width,
        '#44494e',
      );
      finger(
        [
          [0.043, 0.03, z],
          [0.026, 0.044, z],
          [0.008, 0.038, z],
        ],
        width * 0.9,
        fingerColor,
      );
    }
    finger(
      [
        [-0.031, -0.026, 0.021],
        [-0.047, -0.009, 0.025],
        [-0.046, 0.01, 0.017],
        [-0.032, 0.025, -0.007],
      ],
      0.026,
      '#44494e',
    );
    finger(
      [
        [-0.032, 0.025, -0.007],
        [-0.02, 0.028, -0.023],
      ],
      0.023,
      fingerColor,
    );
    softBox(pieces, [0, -0.047, 0.003], [0.05, 0.007, 0.057], '#51565b', 0.003);
  }
  for (const geometry of pieces) {
    geometry.applyQuaternion(orientation);
    geometry.translate(...hand.toArray());
    parts.push(geometry);
  }
}

function makeArm(
  id: ClassId,
  style: Palette,
  side: number,
  hand: THREE.Vector3,
  armed: boolean,
  weaponQuaternion = new THREE.Quaternion(),
) {
  const parts: Parts = [];
  const ember = id === 'assault',
    wisp = id === 'sniper',
    heavy = id === 'heavy';
  const shoulder = ember
    ? emberPoint(side > 0 ? 128 : 278, side > 0 ? 225 : 237, 0)
    : point(
        side * style.shoulder,
        (id === 'scout' ? 1.459 : heavy ? 1.474 : 1.453) -
          (heavy && side < 0 ? 0.033 : 0),
        0.015,
      );
  const elbow = armed
    ? ember
      ? emberPoint(side > 0 ? 51 : 300, side > 0 ? 337 : 369, 0.025)
      : point(
          side < 0
            ? -(style.shoulder + 0.074)
            : heavy
              ? 0.374
              : wisp
                ? 0.315
                : 0.34,
          side < 0 ? 1.117 : heavy ? 1.177 : 1.22,
          side < 0 ? (heavy ? -0.14 : -0.087) : -0.016,
        )
    : point(side * (style.shoulder + 0.042), 1.108, 0.012);
  const wrist =
      ember && armed
        ? emberPoint(
            side > 0 ? 104 : 267,
            side > 0 ? 352 : 426,
            side > 0 ? 0.2 : 0.3,
          )
        : hand.clone().lerp(elbow, 0.16),
    upper = (ember ? 0.133 : style.sleeve) * (heavy ? 1 : 0.94);
  const short = !ember && !wisp;
  if (short) {
    shapedLimb(
      parts,
      shoulder,
      elbow,
      [
        [-0.11, upper * 0.37, upper * 0.48],
        [0.025, upper * 0.66, upper * 0.77],
        [0.16, upper * 0.92, upper * 0.97],
        [0.3, upper, upper],
        [0.44, upper * 0.98, upper * 0.95, 0.025],
        [0.5, upper * 0.92, upper * 0.94, 0.035],
        [0.53, upper * 0.94, upper * 0.96, 0.015],
      ],
      style.cloth,
      { sides: 16, phase: side * 0.7 },
    );
    shapedLimb(
      parts,
      shoulder,
      elbow,
      [
        [0.45, upper * 0.83, upper * 0.83],
        [0.58, upper * 0.9, upper * 0.9],
        [0.73, upper * 0.91, upper * 0.92],
        [0.89, upper * 0.75, upper * 0.8],
        [1.04, upper * 0.66, upper * 0.72],
      ],
      style.skin,
      {
        sides: 16,
        shape: (v: { z: number }, ang: number, r: number) => {
          if (r === 2 && Math.cos(ang) > 0.2) v.z -= 0.008;
        },
      },
    );
  } else {
    shapedLimb(
      parts,
      shoulder,
      elbow,
      [
        [-0.11, upper * 0.29, upper * 0.46],
        [0.015, upper * 0.57, upper * 0.69],
        [0.1, upper * 0.79, upper * 0.88],
        [0.24, upper, upper * 0.98, 0.014],
        [0.38, upper * 0.98, upper * 0.99, 0.025],
        [0.52, upper * 0.89, upper * 0.95, 0.012],
        [0.64, upper * 0.83, upper * 0.88, 0.04],
        [0.7, upper * 0.89, upper * 0.91, 0.065],
        [0.755, upper * 0.83, upper * 0.86, 0.02],
        [0.85, upper * 0.89, upper * 0.9, 0.055],
        [0.92, upper * 0.79, upper * 0.85, 0.025],
        [1.08, upper * 0.73, upper * 0.8, 0.03],
      ],
      style.cloth,
      { sides: 18, phase: side * 0.9 },
    );
  }
  const fore = style.forearm * (ember ? 0.73 : 1);
  shapedLimb(
    parts,
    elbow,
    wrist,
    [
      [-0.14, fore * 0.88, fore * 0.95],
      [-0.025, fore * 0.98, fore * 1.01],
      [0.15, fore * 1.075, fore * 1.07],
      [0.3, fore * 1.04, fore * 1.04],
      [0.48, fore * 0.93, fore * 0.97],
      [0.68, fore * 0.8, fore * 0.89],
      [0.84, fore * 0.69, fore * 0.79],
      [
        1.035,
        (ember ? 0.061 : 0.073) * Math.sqrt(style.bulk),
        (ember ? 0.063 : 0.077) * Math.sqrt(style.bulk),
      ],
    ],
    wisp ? style.cloth : style.skin,
    {
      sides: ember ? 14 : 18,
      phase: side,
      shape: (v: { z: number }, angle: number, ring: number) => {
        if (ring === 2 && Math.cos(angle) > 0.2) v.z -= 0.006;
      },
    },
  );
  if (ember) {
    // Rolled sleeve has a thick folded rim, an inset cloth layer and crease planes.
    shapedLimb(
      parts,
      elbow,
      wrist,
      [
        [-0.155, 0.119, 0.14, 0.06],
        [-0.06, 0.133, 0.15, 0.07],
        [0.035, 0.138, 0.151, 0.04],
        [0.14, 0.135, 0.144, 0.035],
        [0.155, 0.125, 0.136, 0.015],
      ],
      '#b85b31',
      { sides: 18, phase: side * 0.8 },
    );
    shapedLimb(
      parts,
      elbow,
      wrist,
      [
        [0.075, 0.139, 0.151, 0.035],
        [0.11, 0.141, 0.153, 0.025],
        [0.153, 0.135, 0.145, 0.022],
        [0.18, 0.126, 0.137, 0.012],
      ],
      '#d77440',
      { sides: 18, thickness: 0.009, phase: side * 0.8 },
    );
    const crease = elbow.clone().lerp(wrist, -0.025);
    panel(
      parts,
      [
        [crease.x - 0.063, crease.y + 0.021, crease.z - 0.078],
        [crease.x + 0.044, crease.y + 0.039, crease.z - 0.081],
        [crease.x + 0.051, crease.y + 0.018, crease.z - 0.079],
        [crease.x - 0.05, crease.y + 0.01, crease.z - 0.08],
      ],
      0.005,
      '#a6502c',
    );
  } else if (wisp) {
    shapedLimb(
      parts,
      elbow,
      wrist,
      [
        [0.015, fore * 1.07, fore * 1.12, 0.035],
        [0.12, fore * 1.09, fore * 1.14, 0.045],
        [0.23, fore, fore * 1.09, 0.024],
        [0.62, fore * 0.84, fore * 0.94, 0.02],
        [0.69, fore * 0.91, fore * 0.97, 0.07],
        [0.76, fore * 0.82, fore * 0.9, 0.025],
        [0.9, fore * 0.77, fore * 0.88, 0.035],
      ],
      style.cloth,
      { sides: 18, phase: side },
    );
    shapedLimb(
      parts,
      elbow,
      wrist,
      [
        [0.86, 0.095, 0.105],
        [0.91, 0.1, 0.11],
        [1.03, 0.093, 0.105],
      ],
      '#394b62',
      { sides: 14 },
    );
    if (side < 0) {
      const badge = shoulder.clone().lerp(elbow, 0.38);
      softBox(
        parts,
        [badge.x - 0.056, badge.y, badge.z - 0.07],
        [0.038, 0.11, 0.035],
        '#5c626e',
        0.007,
      );
    }
  }
  if (heavy && side > 0) {
    const capStart = shoulder.clone().add(point(0.027, 0.025, -0.008));
    const capEnd = shoulder
      .clone()
      .lerp(elbow, 0.57)
      .add(point(0.035, 0, -0.006));
    shapedLimb(
      parts,
      capStart,
      capEnd,
      [
        [0, 0.103, 0.149],
        [0.25, 0.195, 0.225],
        [0.61, 0.244, 0.24],
        [1, 0.193, 0.186],
      ],
      style.armor,
      {
        sides: 10,
        phase: 0.3,
        shape: (
          v: { x: number; z: number; y: number },
          angle: number,
          ring: number,
        ) => {
          if (Math.sin(angle) < -0.15) v.x *= 0.77;
          if (Math.cos(angle) > 0.2 && ring > 1) v.z -= 0.009;
          if (ring > 1) v.y += 0.036 * Math.max(0, Math.sin(angle));
        },
      },
    );
    shapedLimb(
      parts,
      capStart,
      capEnd,
      [
        [0.94, 0.217, 0.207],
        [1.04, 0.192, 0.18],
      ],
      '#596143',
      {
        sides: 10,
        shape: (v: { y: number }, angle: number) => {
          v.y += 0.036 * Math.max(0, Math.sin(angle));
        },
      },
    );
  } else if (id === 'scout' && side < 0) {
    const pad: Parts = [];
    const w = 0.143;
    const outline = [
      [-w * 0.43, 0.084],
      [-w * 0.55, -0.05],
      [-w * 0.39, -0.119],
      [w * 0.37, -0.119],
      [w * 0.55, -0.055],
      [w * 0.46, 0.035],
      [w * 0.15, 0.104],
    ];
    beveledPanel(pad, outline, -0.118, 0.142, style.accent, 0.015);
    panel(
      pad,
      [
        [-w * 0.43, 0.066, -0.12],
        [-w * 0.35, 0.092, -0.12],
        [w * 0.12, 0.111, -0.101],
        [w * 0.43, 0.033, -0.129],
      ],
      0.022,
      '#cfaa5e',
    );
    for (const geometry of pad) {
      geometry.rotateZ(side * 0.27);
      geometry.translate(
        shoulder.x + side * 0.025,
        shoulder.y - 0.069,
        shoulder.z - 0.021,
      );
      parts.push(geometry);
    }
  }
  if (heavy && side > 0) {
    const start = elbow.clone().lerp(wrist, 0.28),
      end = elbow.clone().lerp(wrist, 0.82);
    shapedLimb(
      parts,
      start,
      end,
      [
        [0, 0.17, 0.178],
        [0.12, 0.179, 0.186],
        [0.47, 0.163, 0.173],
        [0.86, 0.125, 0.141],
        [1, 0.116, 0.133],
      ],
      style.armor,
      { sides: 12 },
    );
    shapedLimb(
      parts,
      start,
      end,
      [
        [0.74, 0.128, 0.145],
        [0.84, 0.129, 0.145],
      ],
      '#424739',
      { sides: 12 },
    );
  }
  const gloveStart = wrist.clone().lerp(elbow, 0.08),
    gloveEnd = hand.clone().lerp(wrist, 0.16);
  shapedLimb(
    parts,
    gloveStart,
    gloveEnd,
    [
      [0, 0.084, 0.09],
      [0.13, 0.089, 0.095],
      [0.24, 0.087, 0.094],
      [0.78, 0.081, 0.086],
      [1, 0.075, 0.08],
    ],
    '#373c42',
    { sides: 14 },
  );
  if (armed)
    addGripHand(
      parts,
      hand,
      weaponQuaternion,
      side,
      wisp ? '#4c5055' : style.skin,
    );
  else {
    const fingers = hand.clone().add(point(0, -0.063, -0.013));
    shapedLimb(
      parts,
      hand,
      fingers,
      [
        [0, 0.081, 0.082],
        [0.37, 0.088, 0.077],
        [0.78, 0.08, 0.067],
        [1, 0.068, 0.053],
      ],
      '#414449',
      { sides: 14 },
    );
    stroke(
      parts,
      [hand.x - side * 0.037, hand.y + 0.008, hand.z - 0.015],
      [hand.x - side * 0.041, hand.y - 0.047, hand.z - 0.025],
      0.026,
      0.03,
      '#414449',
      8,
    );
  }
  const mesh = makeMesh(
    parts,
    side < 0 ? 'character-left-arm' : 'character-right-arm',
    shoulder.toArray(),
  );
  const marker = new THREE.Object3D();
  marker.name = side < 0 ? 'support-hand' : 'trigger-hand';
  marker.position.copy(hand).sub(shoulder);
  mesh.add(marker);
  return { mesh, marker };
}

function bootShell(parts: Parts, rings: number[][], color: Color) {
  const outline = [
    [0, -1],
    [0.58, -0.98],
    [0.88, -0.8],
    [1, -0.48],
    [0.92, 0.11],
    [0.78, 0.75],
    [0.49, 1],
    [-0.49, 1],
    [-0.78, 0.75],
    [-0.92, 0.11],
    [-1, -0.48],
    [-0.88, -0.8],
    [-0.58, -0.98],
  ];
  const vertices = [],
    faces = [],
    n = outline.length;
  for (const [y, w, d, z = 0, frontLift = 0] of rings)
    for (const [x, q] of outline)
      vertices.push([
        x * w * 0.5,
        y + Math.max(0, -q) * frontLift,
        q * d * 0.5 + z,
      ]);
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      faces.push([a, a + n, b], [b, a + n, b + n]);
    }
  for (let i = 1; i < n - 1; i++)
    faces.push(
      [0, i, i + 1],
      [
        (rings.length - 1) * n,
        (rings.length - 1) * n + i + 1,
        (rings.length - 1) * n + i,
      ],
    );
  triangles(parts, vertices, faces, color);
}

function makeLeg(style: Palette, side: number) {
  const parts: Parts = [];
  const index = side < 0 ? 0 : 1,
    stance = STANCES[style.name];
  const ember = style.name === 'Ember',
    heavy = style.name === 'Rook',
    dash = style.name === 'Dash';
  const hip = side * style.hips * 0.31 + stance.shift,
    ankleAnchor = style.stance[index] * (heavy ? 0.9 : 0.95),
    baseStep = style.step[index],
    step = baseStep + (ember && side > 0 ? 0.26 : 0);
  const knee = hip + (ankleAnchor - hip) * stance.knees[index],
    kneeY = stance.heights[index],
    kneeZ = baseStep * 0.46 - 0.017;
  // Dash plants both feet slightly to his left beneath unchanged knee anchors.
  const ankle =
    ankleAnchor - (dash ? 0.065 : 0) - (ember && side > 0 ? 0.104 : 0);
  const thighX = (y: number) =>
    knee +
    (hip - knee) * THREE.MathUtils.clamp((y - kneeY) / (0.96 - kneeY), 0, 1);
  const thigh = style.thigh,
    calf = style.calf * (ember ? 0.94 : 1);
  const legSections = ember
    ? [
        [ankle, 0.249, step + 0.008, calf * 0.72, calf * 0.82],
        [ankle, 0.287, step + 0.009, calf * 0.8, calf * 0.86],
        [
          ankle + (knee - ankle) * 0.4,
          0.365,
          step * 0.81 + 0.012,
          calf * 0.99,
          calf * 0.98,
        ],
        [
          ankle + (knee - ankle) * 0.79,
          0.439,
          step * 0.52 + 0.006,
          calf * 0.9,
          calf * 0.92,
        ],
        [knee, kneeY - 0.025, kneeZ, calf * 0.78, calf * 0.87],
        [knee, kneeY + 0.047, kneeZ + 0.008, thigh * 0.66, thigh * 0.72],
        [thighX(0.689), 0.689, 0.018, thigh * 0.84, thigh * 0.89],
        [thighX(0.818), 0.818, 0.018, thigh, thigh * 0.98],
        [hip, 0.933, 0.019, thigh * 0.95, thigh * 0.94],
        [hip, 0.999, 0.016, thigh * 0.92, thigh * 0.92],
      ]
    : [
        [ankle, 0.246, step + 0.008, calf * 0.71, calf * 0.78],
        [ankle, 0.277, step + 0.007, calf * 0.86, calf * 0.9, 0.025],
        [
          ankle + (knee - ankle) * 0.2,
          0.305,
          step + 0.013,
          calf * (dash ? 1.06 : 1),
          calf * 1.03,
          0.025,
        ],
        [
          ankle + (knee - ankle) * 0.49,
          0.37,
          step * 0.8 + 0.019,
          calf * 1.06,
          calf * 1.08,
        ],
        [
          ankle + (knee - ankle) * 0.83,
          0.455,
          step * 0.51 + 0.006,
          calf * 0.95,
          calf * 0.97,
        ],
        [knee, kneeY - 0.012, kneeZ, calf * 0.82, calf * 0.91],
        [
          thighX(kneeY + 0.058),
          kneeY + 0.058,
          kneeZ + 0.01,
          thigh * 0.75,
          thigh * 0.8,
        ],
        [thighX(0.69), 0.69, step * 0.24 + 0.017, thigh * 0.87, thigh * 0.94],
        [thighX(0.825), 0.825, 0.021, thigh, thigh * 1.025],
        [hip, 0.945, 0.019, thigh * 0.96, thigh * 0.96],
        [hip, 0.999, 0.016, thigh * 0.92, thigh * 0.92],
      ];
  if (ember && side > 0) {
    legSections[2][0] -= 0.02184;
    legSections[3][0] -= 0.03224;
  }
  const trouserColor = ember ? '#4b474c' : style.dark;
  tailoredLoft(parts, legSections, trouserColor, {
    sides: 10,
    phase: side * 0.95,
  });
  const padWidth = calf * (ember ? 0.82 : heavy ? 0.75 : 0.78),
    padZ = kneeZ - calf * 0.5;
  const shield = [
    [knee - padWidth * 0.31, kneeY + 0.081],
    [knee - padWidth * 0.49, kneeY + 0.054],
    [knee - padWidth * 0.5, kneeY - 0.038],
    [knee - padWidth * 0.28, kneeY - 0.082],
    [knee + padWidth * 0.3, kneeY - 0.078],
    [knee + padWidth * 0.49, kneeY - 0.042],
    [knee + padWidth * 0.49, kneeY + 0.056],
    [knee + padWidth * 0.29, kneeY + 0.082],
  ];
  const guard: Parts = [];
  beveledPanel(
    guard,
    shield,
    padZ - 0.025,
    0.046,
    heavy || style.name === 'Dash' ? '#696c50' : ember ? '#3d3c42' : '#4b4b50',
    0.014,
  );
  // Central knee face has a subtle bend; the bevel carries the edge highlights.
  for (const geometry of guard) {
    geometry.translate(-knee, -kneeY, 0);
    if (ember) geometry.scale(0.92, 0.8, 1);
    geometry.rotateZ(Math.atan2(knee - hip, 0.96 - kneeY) * 0.5);
    geometry.rotateX(-0.08);
    geometry.translate(knee, kneeY, 0);
    parts.push(geometry);
  }
  for (const y of [kneeY - 0.045, kneeY + 0.04])
    tailoredLoft(
      parts,
      [
        [knee, y - 0.01, kneeZ + 0.011, calf * 0.96, calf * 0.99],
        [knee, y + 0.01, kneeZ + 0.011, calf * 0.96, calf * 0.99],
      ],
      '#373b38',
      { sides: 14 },
    );
  // Cargo pocket wraps the outer thigh and has an overlapping bevelled flap.
  const pocket: Parts = [];
  const pocketX = side * (thigh * (dash ? 0.41 : 0.47));
  softBox(
    pocket,
    [pocketX, -0.015, -0.004],
    [0.089, 0.204, 0.15],
    '#303532',
    0.012,
  );
  softBox(
    pocket,
    [pocketX, 0.072, -0.079],
    [0.094, 0.05, 0.022],
    '#42473f',
    0.005,
  );
  softBox(
    pocket,
    [pocketX, 0.036, -0.092],
    [0.025, 0.028, 0.012],
    '#282d2b',
    0.003,
  );
  const pocketY = dash ? 0.797 : 0.827;
  for (const geometry of pocket) {
    if ((side > 0 || style.name === 'Dash') && !ember) {
      geometry.rotateY(side * 0.14);
      geometry.rotateZ(
        dash ? Math.atan2(knee - hip, 0.96 - kneeY) * 0.25 : side * 0.06,
      );
      geometry.translate(dash ? thighX(pocketY) : hip, pocketY, 0.002);
      parts.push(geometry);
    } else geometry.dispose();
  }
  if (ember && side > 0) {
    referencePanel(
      parts,
      [
        [63, 468],
        [89, 472],
        [85, 514],
        [75, 567],
        [54, 563],
        [55, 511],
      ],
      0.031,
      '#343337',
      0.05,
    );
    referencePanel(
      parts,
      [
        [63, 468],
        [89, 472],
        [87, 486],
        [59, 483],
      ],
      0.041,
      '#49474b',
      0.008,
    );
    referencePanel(
      parts,
      [
        [58, 490],
        [65, 488],
        [66, 555],
        [55, 557],
      ],
      0.035,
      '#28292c',
      0.006,
    );
  }
  if (side > 0 || style.name === 'Dash') {
    const y = 0.785,
      x = dash ? thighX(y) : knee + (hip - knee) * 0.82;
    tailoredLoft(
      parts,
      [
        [x, y - 0.013, 0.021, thigh * 1.025, thigh * 1.087],
        [x, y + 0.013, 0.021, thigh * 1.025, thigh * 1.087],
      ],
      '#353936',
      { sides: 18 },
    );
  }
  tailoredLoft(
    parts,
    [
      [ankle, 0.24, step + 0.008, calf * 0.7, calf * 0.78, 0.015],
      [ankle, 0.255, step + 0.008, calf * 0.78, calf * 0.85, 0.02],
      [ankle, 0.281, step + 0.007, calf * 0.77, calf * 0.85, 0.035],
    ],
    trouserColor,
    { sides: 16 },
  );
  const boots: Parts = [];
  const w = heavy ? 0.19 : ember ? 0.145 : 0.164;
  bootShell(
    boots,
    [
      [0, w * 0.94, 0.284, -0.036],
      [0.012, w, 0.292, -0.037],
      [0.032, w, 0.293, -0.037],
      [0.041, w * 0.94, 0.282, -0.037],
    ],
    '#292c30',
  );
  bootShell(
    boots,
    [
      [0.032, w * 0.94, 0.277, -0.035],
      [0.072, w * 0.92, 0.266, -0.035, 0.003],
      [0.097, w * 0.86, 0.24, -0.023, 0.007],
      [0.122, w * 0.77, 0.176, 0.001, 0.007],
      [0.157, w * 0.69, 0.147, 0.017, 0],
      [0.203, w * 0.66, 0.131, 0.023, 0],
      [0.246, w * 0.66, 0.129, 0.022, 0],
      [0.257, w * 0.67, 0.132, 0.022, 0],
    ],
    '#36393d',
  );
  // Toe cap, heel counter and raised tongue create an actual boot profile.
  bootShell(
    boots,
    [
      [0.044, w * 0.95, 0.131, -0.112],
      [0.07, w * 0.935, 0.132, -0.111],
      [0.088, w * 0.86, 0.118, -0.11],
    ],
    '#414449',
  );
  softBox(boots, [0, 0.065, 0.091], [w * 0.67, 0.103, 0.021], '#2e3236', 0.008);
  stroke(
    boots,
    [0, 0.111, -0.094],
    [0, 0.217, -0.053],
    w * 0.54,
    0.014,
    '#4a4d52',
    4,
  );
  for (const [y, width, depth, z] of [
    [0.148, w * 0.76, 0.17, 0.006],
    [0.23, w * 0.68, 0.139, 0.021],
  ]) {
    bootShell(
      boots,
      [
        [y - 0.012, width, depth, z],
        [y + 0.012, width * 0.98, depth * 0.98, z],
      ],
      '#45494d',
    );
    softBox(
      boots,
      [side * width * 0.3, y, z - depth * 0.465],
      [0.014, 0.023, 0.01],
      '#303438',
      0.002,
    );
  }
  for (const geometry of boots) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      {
        const fit =
          1 -
          (ember ? 0.23 : heavy ? 0.1 : 0.14) *
            THREE.MathUtils.clamp((0.205 - y) / 0.105, 0, 1);
        position.setX(i, position.getX(i) * fit);
        position.setZ(i, 0.022 + (position.getZ(i) - 0.022) * fit);
      }
      position.setY(
        i,
        y <= 0.115
          ? y * (ember ? 0.73 : 0.78)
          : y -
              (ember ? 0.03105 : 0.0253) *
                THREE.MathUtils.clamp((0.25 - y) / 0.135, 0, 1),
      );
    }
    geometry.computeVertexNormals();
    geometry.rotateY(stance.toes[index]);
    geometry.translate(ankle, 0, step);
    parts.push(geometry);
  }
  return makeMesh(
    parts,
    side < 0 ? 'character-left-leg' : 'character-right-leg',
    [hip, 0.94, 0],
  );
}

/** A standalone adult fighter, facing -Z, with feet on y=0. */
export function createCharacterModel(
  classId: unknown = 'assault',
  { armed = true } = {},
) {
  const id = isClassId(classId) ? classId : 'assault';
  const style = PALETTES[id];
  const group = new THREE.Group();
  group.name = `${style.name} / character-model`;
  group.userData.classId = id;
  group.userData.characterName = style.name;
  const torso = makeTorso(id, style);
  const head = id === 'assault' ? makeEmberHead() : makeHead(id, style);
  const legs = [-1, 1].map((side) => makeLeg(style, side));
  group.add(torso, head, ...legs);
  let weapon = null;
  let triggerHand = point(style.shoulder + 0.039, 0.883, -0.026);
  let supportHand = point(-style.shoulder - 0.039, 0.883, -0.026);
  if (armed) {
    weapon = createWeaponModel(id);
    weapon.scale.setScalar(
      id === 'assault'
        ? 0.78
        : id === 'sniper'
          ? 0.7
          : id === 'scout'
            ? 1.12
            : 0.9,
    );
    weapon.rotation.set(
      id === 'scout'
        ? -0.8
        : id === 'heavy'
          ? -0.49
          : id === 'sniper'
            ? -0.81
            : -0.85,
      1.0,
      0,
      'YXZ',
    );
    weapon.updateMatrixWorld(true);
    const grip = weapon.getObjectByName('grip')!;
    const support = weapon.getObjectByName('support-grip')!;
    triggerHand = point(
      id === 'assault' || id === 'sniper' ? 0.18 : 0.12,
      id === 'heavy'
        ? 1.064
        : id === 'scout'
          ? 1.1
          : id === 'sniper'
            ? 1.15
            : 1.14,
      -0.17,
    );
    const gripPosition = grip.getWorldPosition(new THREE.Vector3());
    weapon.position.copy(triggerHand).sub(gripPosition);
    weapon.updateMatrixWorld(true);
    if (id === 'assault') {
      fitEmberWeapon(weapon);
      triggerHand = grip.getWorldPosition(new THREE.Vector3());
    }
    supportHand = support.getWorldPosition(new THREE.Vector3());
    group.add(weapon);
  }
  const leftArm = makeArm(
    id,
    style,
    -1,
    supportHand,
    armed,
    weapon?.quaternion,
  );
  const rightArm = makeArm(
    id,
    style,
    1,
    triggerHand,
    armed,
    weapon?.quaternion,
  );
  group.add(leftArm.mesh, rightArm.mesh);
  Object.defineProperty(group.userData, 'rig', {
    value: {
      torso,
      head,
      arms: [leftArm.mesh, rightArm.mesh],
      legs,
      weapon,
      triggerHand: rightArm.marker,
      supportHand: leftArm.marker,
    },
    enumerable: false,
  });
  group.userData.character = { classId: id, name: style.name };
  return group;
}
