import type { ClassId } from '../shared/classes.ts';
type Parts = THREE.BufferGeometry[];
type Shade = ((x: number, y: number, z: number) => THREE.Color) & {
  flat?: boolean;
};
type Color = THREE.ColorRepresentation | Shade;
interface HeadStyle {
  skin: THREE.ColorRepresentation;
  shadow: THREE.ColorRepresentation;
}
type Profile = (typeof PROFILES)[ClassId] & { id: ClassId; offset: number };
interface FaceDefinition {
  profile: Profile;
  widthAt: (y: number) => number;
  zAt: (x: number, y: number) => number;
  colorAt: Shade;
  skin: THREE.Color;
  id: ClassId;
  faceGeometry?: THREE.BufferGeometry;
  surfaceZ?: (x: number, y: number) => number;
  featureShift?: number;
}
import * as THREE from 'three';
import { makeMesh } from './character-geometry.ts';

const PIVOT = [0, 1.49, 0];
const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, -1);
const clamp = THREE.MathUtils.clamp;
const gaussian = (value: number, center: number, radius: number) =>
  Math.exp(-(((value - center) / radius) ** 2));

// These are anatomical sections, not subdivisions of a primitive skull. The
// changing mandible, cheek, temple and forehead widths define the silhouette.
const SECTIONS = [
  [1.548, 0.041, -0.088, 0.049],
  [1.556, 0.054, -0.094, 0.069],
  [1.568, 0.067, -0.098, 0.086],
  [1.578, 0.081, -0.1, 0.098],
  [1.588, 0.091, -0.104, 0.106],
  [1.597, 0.098, -0.103, 0.11],
  [1.607, 0.102, -0.1, 0.111],
  [1.617, 0.105, -0.099, 0.112],
  [1.627, 0.108, -0.098, 0.113],
  [1.637, 0.11, -0.097, 0.114],
  [1.645, 0.111, -0.097, 0.115],
  [1.652, 0.11, -0.096, 0.114],
  [1.66, 0.109, -0.094, 0.114],
  [1.667, 0.108, -0.094, 0.114],
  [1.677, 0.108, -0.098, 0.114],
  [1.689, 0.108, -0.102, 0.113],
  [1.71, 0.107, -0.101, 0.111],
  [1.737, 0.107, -0.096, 0.108],
  [1.76, 0.104, -0.087, 0.103],
  [1.774, 0.098, -0.071, 0.097],
  [1.787, 0.088, -0.052, 0.085],
  [1.799, 0.067, -0.027, 0.064],
  [1.806, 0.036, 0.0, 0.035],
];

const PROFILES = {
  assault: {
    width: 1.0,
    jaw: 0.99,
    chin: 1.13,
    nose: 0.92,
    lips: '#975e47',
    hair: '#403531',
    beard: null,
    eye: '#664c32',
  },
  sniper: {
    width: 0.94,
    jaw: 1.2,
    chin: 1.36,
    nose: 1.03,
    lips: '#865d48',
    hair: '#443b34',
    beard: '#59534c',
    eye: '#544d3e',
  },
  scout: {
    width: 1.0,
    jaw: 1.08,
    chin: 1.16,
    nose: 1.01,
    lips: '#9e694b',
    hair: '#49392e',
    beard: '#74553c',
    eye: '#725435',
  },
  heavy: {
    width: 1.1,
    jaw: 1.13,
    chin: 1.26,
    nose: 1.1,
    lips: '#62402e',
    hair: '#302a26',
    beard: '#38322e',
    eye: '#352c23',
  },
};

function addSurface(
  parts: Parts,
  vertices: number[][],
  faces: number[][],
  color: Color,
  smooth: number | ((x: number, y: number) => number) = 0,
) {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices.flat(), 3),
  );
  const a32 = new THREE.Vector3(),
    b32 = new THREE.Vector3(),
    c32 = new THREE.Vector3();
  const position = indexed.attributes.position;
  const validFaces = faces.filter(([a, b, c]) => {
    a32.fromBufferAttribute(position, a);
    b32.fromBufferAttribute(position, b);
    c32.fromBufferAttribute(position, c);
    return b32.sub(a32).cross(c32.sub(a32)).lengthSq() > 1e-22;
  });
  indexed.setIndex(validFaces.flat());
  indexed.computeVertexNormals();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const tint = typeof color === 'function' ? null : new THREE.Color(color);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const flat = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    flat.crossVectors(b.sub(a), c.sub(a)).normalize();
    for (let j = i; j < i + 3; j += 1) {
      const blend =
        typeof smooth === 'function' ? smooth(p.getX(j), p.getY(j)) : smooth;
      normal
        .fromBufferAttribute(n, j)
        .multiplyScalar(blend)
        .addScaledVector(flat, 1 - blend)
        .normalize();
      n.setXYZ(j, normal.x, normal.y, normal.z);
      const shade =
        typeof color === 'function'
          ? color.flat
            ? color(
                (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
                (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3,
                (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3,
              )
            : color(p.getX(j), p.getY(j), p.getZ(j))
          : tint!;
      colors[j * 3] = shade.r;
      colors[j * 3 + 1] = shade.g;
      colors[j * 3 + 2] = shade.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(geometry);
  return geometry;
}

function sectionAt(y: number) {
  if (y <= SECTIONS[0][0]) return SECTIONS[0];
  for (let i = 1; i < SECTIONS.length; i += 1) {
    if (y <= SECTIONS[i][0]) {
      const lower = SECTIONS[i - 1],
        upper = SECTIONS[i];
      const t = (y - lower[0]) / (upper[0] - lower[0]);
      return lower.map((v, j) => v + (upper[j] - v) * t);
    }
  }
  return SECTIONS.at(-1)!;
}

function makeFaceDefinition(id: ClassId, style: HeadStyle): FaceDefinition {
  const profile: Profile = {
    ...PROFILES[id],
    id,
    offset: { assault: 0.032, sniper: 0.014, scout: 0.02, heavy: 0.006 }[id],
  };
  const widthAt = (y: number) => {
    const jaw = 1 + (profile.jaw - 1) * clamp((1.635 - y) / 0.065, 0, 1);
    const chin = 1 + (profile.chin - 1) * clamp((1.58 - y) / 0.032, 0, 1);
    if (id !== 'assault' && y < 1.66) {
      const corner = 0.078 * (1 + (profile.jaw - 1) * 0.25);
      const width =
        y < 1.58
          ? THREE.MathUtils.lerp(
              0.043 * profile.chin,
              corner,
              clamp((y - 1.548) / 0.032, 0, 1),
            )
          : THREE.MathUtils.lerp(corner, 0.109, (y - 1.58) / 0.08);
      return width * profile.width;
    }
    return sectionAt(y)[1] * profile.width * jaw * chin;
  };
  const zAt = (x: number, y: number) => {
    const row = sectionAt(y);
    const featureY = y + profile.offset;
    const u = clamp(Math.abs(x) / widthAt(y), 0, 1);
    let z =
      row[2] +
      (u < 0.3
        ? 0.003 * (u / 0.3) ** 2
        : u < 0.72
          ? 0.003 + (u - 0.3) * 0.072
          : 0.03324 + (u - 0.72) * 0.16);
    // Orbital sockets sit behind the cheekbone and brow ridge. Central nose
    // planes grow continuously out of this surface rather than sitting on it.
    z +=
      0.012 *
      gaussian(Math.abs(x), 0.045 * profile.width, 0.031) *
      gaussian(featureY, 1.7, 0.018);
    z -=
      0.01 *
      gaussian(Math.abs(x), 0.045 * profile.width, 0.038) *
      gaussian(featureY, 1.724, 0.014);
    z -=
      0.004 *
      Math.max(0, 1 - Math.abs(Math.abs(x) - 0.071 * profile.width) / 0.026) *
      Math.max(0, 1 - Math.abs(featureY - 1.676) / 0.027);
    z +=
      0.002 *
      gaussian(Math.abs(x), 0.075 * profile.width, 0.022) *
      gaussian(featureY, 1.626, 0.023);
    z +=
      0.006 *
      gaussian(Math.abs(x), 0.035, 0.009) *
      gaussian(featureY, 1.646, 0.029);
    z -=
      profile.nose *
      0.034 *
      gaussian(x, 0, 0.01) *
      gaussian(featureY, 1.69, 0.05);
    z -=
      profile.nose *
      0.012 *
      gaussian(x, 0, 0.014) *
      gaussian(featureY, 1.666, 0.014);
    z -=
      0.011 *
      gaussian(Math.abs(x), 0.015 * profile.nose, 0.007) *
      gaussian(featureY, 1.661, 0.009);
    z -= 0.002 * gaussian(x, 0, 0.024) * gaussian(featureY, 1.628, 0.012);

    return z;
  };
  const skin = new THREE.Color(style.skin);
  const shadow = new THREE.Color(style.shadow);
  const colorAt = (x: number, y: number, z: number) => {
    const tint = skin.clone();
    if (id !== 'assault' && z > 0.006 && y >= 1.66)
      return new THREE.Color(profile.hair);
    const featureY = y + profile.offset;
    const side = Math.abs(x) / profile.width;
    const socket = gaussian(side, 0.046, 0.03) * gaussian(featureY, 1.7, 0.018);
    const hollow =
      gaussian(side, 0.082, 0.024) * gaussian(featureY, 1.622, 0.03);
    tint.lerp(shadow, socket * 0.11 + hollow * 0.08);
    return tint;
  };
  colorAt.flat = true;
  return { profile, widthAt, zAt, colorAt, skin, id };
}

function forwardFaces(vertices: number[][], faces: number[][]) {
  return faces.map((face) => {
    const [a, b, c] = face.map((i: number) => vertices[i]);
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
      ? [...face].reverse()
      : face;
  });
}

function eyeOutline(
  side: number,
  profile: { width: number; id: string; offset: number },
) {
  return [
    [0.024, 1.668],
    [0.033, 1.672],
    [0.044, 1.674],
    [0.057, 1.674],
    [0.068, 1.672],
    [0.072, 1.669],
    [0.063, 1.665],
    [0.051, 1.664],
    [0.039, 1.664],
    [0.029, 1.666],
  ].map(([x, y]) => [
    x * side * profile.width * (profile.id === 'sniper' ? 0.82 : 1),
    (profile.id === 'heavy' ? 1.669 + (y - 1.669) * 0.78 + 0.004 : y) +
      0.032 -
      profile.offset,
  ]);
}

// Start with the face outline and two constrained eye openings, then insert
// anatomical landmarks. Local edge flips create broad oblique planes instead
// of horizontal latitude bands around the cheeks and jaw.
function triangulateLandmarks(
  contour: number[][],
  holes: number[][][],
  landmarks: number[][],
) {
  const vertices = [...contour, ...holes.flat()];
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const faces = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(...p)),
    holes.map((loop) => loop.map((p) => new THREE.Vector2(...p))),
  );
  for (const point of landmarks) {
    if (
      vertices.some(
        (p) => Math.hypot(p[0] - point[0], p[1] - point[1]) < 0.0001,
      )
    )
      continue;
    const index = faces.findIndex((face) => {
      const p = face.map((i) => vertices[i]),
        signs = [
          cross(p[0], p[1], point),
          cross(p[1], p[2], point),
          cross(p[2], p[0], point),
        ];
      return signs.every((v) => v > 1e-10) || signs.every((v) => v < -1e-10);
    });
    if (index < 0) continue;
    const [a, b, c] = faces[index],
      n = vertices.length;
    vertices.push(point);
    faces.splice(index, 1, [a, b, n], [b, c, n], [c, a, n]);
  }
  for (let pass = 0; pass < 9; pass++) {
    const edges = new Map<
      string,
      { index: number; a: number; b: number; c: number }[]
    >();
    faces.forEach((face, index) =>
      face.forEach((a, i) => {
        const b = face[(i + 1) % 3],
          c = face[(i + 2) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const entries = edges.get(key) || [];
        entries.push({ index, a, b, c });
        edges.set(key, entries);
      }),
    );
    const used = new Set();
    let changed = false;
    for (const entries of edges.values()) {
      if (entries.length !== 2) continue;
      const [first, second] = entries;
      if (used.has(first.index) || used.has(second.index)) continue;
      const { a, b, c } = first,
        d = second.c,
        pa = vertices[a],
        pb = vertices[b],
        pc = vertices[c],
        pd = vertices[d];
      if (
        cross(pa, pb, pc) * cross(pa, pb, pd) >= 0 ||
        cross(pc, pd, pa) * cross(pc, pd, pb) >= 0
      )
        continue;
      const angle = (p: number[], q: number[], r: number[]) =>
        Math.acos(
          clamp(
            ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) /
              (Math.hypot(p[0] - q[0], p[1] - q[1]) *
                Math.hypot(r[0] - q[0], r[1] - q[1])),
            -1,
            1,
          ),
        );
      if (angle(pa, pc, pb) + angle(pa, pd, pb) <= Math.PI + 0.001) continue;
      faces[first.index] = [c, d, a];
      faces[second.index] = [d, c, b];
      used.add(first.index);
      used.add(second.index);
      changed = true;
    }
    if (!changed) break;
  }
  return { vertices, faces };
}

function sculptSkull(parts: Parts, definition: FaceDefinition) {
  const { widthAt, zAt, colorAt, profile, id } = definition;
  const jawRise = (y: number): number =>
    0.031 * clamp((1.605 - y) / 0.057, 0, 1);
  const contour = SECTIONS.map(([y]) => [-widthAt(y), y + jawRise(y)]);
  contour.push([0, 1.812]);
  contour.push(
    ...[...SECTIONS].reverse().map(([y]) => [widthAt(y), y + jawRise(y)]),
  );
  const chinY =
    id === 'assault'
      ? 1.548
      : id === 'sniper'
        ? 1.56
        : id === 'heavy'
          ? 1.555
          : 1.552;
  const chinWidth = id === 'assault' ? 0.028 : id === 'heavy' ? 0.046 : 0.041;
  contour.push([chinWidth, chinY], [-chinWidth, chinY]);
  const holes = [eyeOutline(-1, profile), eyeOutline(1, profile)];
  const landmarks = [];
  for (const side of [-1, 1]) {
    const points = [
      [0.024, 1.554],
      [0.054, 1.569],
      [0.073, 1.587],
      [0.045, 1.585],
      [0.018, 1.579],
      [0.089, 1.61],
      [0.066, 1.607],
      [0.041, 1.608],
      [0.025, 1.596],
      [0.092, 1.634],
      [0.072, 1.643],
      [0.051, 1.633],
      [0.034, 1.625],
      [0.089, 1.657],
      [0.075, 1.655],
      [0.051, 1.651],
      [0.031, 1.653],
      [0.083, 1.684],
      [0.064, 1.688],
      [0.042, 1.69],
      [0.021, 1.684],
      [0.073, 1.714],
      [0.043, 1.715],
      [0.008, 1.712],
      [0.083, 1.742],
      [0.039, 1.746],
      [0.075, 1.77],
      [0.035, 1.786],
      [0.025, 1.8],
    ];
    if (id !== 'assault')
      points.push(
        [0.028, 1.609],
        [0.046, 1.619],
        [0.071, 1.637],
        [0.089, 1.671],
        [0.096, 1.689],
      );
    landmarks.push(...points.map(([x, y]) => [side * x * profile.width, y]));
    for (const y of [1.612, 1.621, 1.629, 1.636, 1.648, 1.659, 1.674, 1.691]) {
      landmarks.push([side * 0.008, y], [side * 0.019, y]);
    }
  }
  for (const y of [
    1.552, 1.568, 1.581, 1.59, 1.597, 1.607, 1.618, 1.625, 1.632, 1.642, 1.654,
    1.668, 1.683, 1.701, 1.73, 1.759, 1.789, 1.806,
  ])
    landmarks.push([0, y]);
  const front = triangulateLandmarks(contour, holes, landmarks);
  const vertices = front.vertices.map(([x, y]) => [x, y, zAt(x, y)]);
  definition.faceGeometry = addSurface(
    parts,
    vertices,
    forwardFaces(vertices, front.faces),
    colorAt,
    (x: number, y: number) =>
      y < 1.61 ? 0.48 : Math.abs(x) > 0.038 && y < 1.675 ? 0.48 : 0.7,
  );
  definition.surfaceZ = (x: number, y: number) => {
    const p = definition.faceGeometry!.attributes.position;
    let closest = Infinity;
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i),
        ay = p.getY(i),
        bx = p.getX(i + 1),
        by = p.getY(i + 1),
        cx = p.getX(i + 2),
        cy = p.getY(i + 2),
        det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(det) < 1e-12) continue;
      const u = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / det,
        v = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / det;
      if (u >= -0.00001 && v >= -0.00001 && u + v <= 1.00001)
        closest = Math.min(
          closest,
          p.getZ(i) * (1 - u - v) + p.getZ(i + 1) * u + p.getZ(i + 2) * v,
        );
    }
    return Number.isFinite(closest) ? closest : zAt(x, y);
  };
  // Occipital shape joins the same temple/jaw boundary, with enough sections
  // to remain a skull rather than a vertical tube at the back of the ears.
  const back = [];
  const backFaces = [];
  const around = 18;
  for (let r = 0; r < SECTIONS.length; r += 1) {
    const [y, , , depth] = SECTIONS[r];
    const width = widthAt(y);
    const jawRise = 0.031 * clamp((1.605 - y) / 0.057, 0, 1);
    const sideZ = zAt(width, y + jawRise);
    for (let i = 0; i <= around; i += 1) {
      const angle = (i / around) * Math.PI;
      back.push([
        width * Math.cos(angle),
        y + jawRise * (1 + 0.25 * Math.sin(angle)),
        sideZ + (depth - sideZ) * Math.sin(angle),
      ]);
    }
  }
  for (let r = 0; r < SECTIONS.length - 1; r += 1) {
    for (let i = 0; i < around; i += 1) {
      const a = r * (around + 1) + i;
      backFaces.push(
        [a, a + 1, a + around + 1],
        [a + 1, a + around + 2, a + around + 1],
      );
    }
  }
  addSurface(
    parts,
    back,
    backFaces.map((face) => face.reverse()),
    colorAt,
    0.7,
  );
  // Crown and underside are closed; the neck intersects the underside.
  const crown = [
    [-widthAt(1.806), 1.806, zAt(-widthAt(1.806), 1.806)],
    [widthAt(1.806), 1.806, zAt(widthAt(1.806), 1.806)],
    ...back.slice(-(around + 1)).slice(1, -1),
  ];
  const center = [0, 1.812, 0.026];
  const capVertices = [...crown, center];
  const capFaces = crown.map((_, i) => [
    i,
    crown.length,
    (i + 1) % crown.length,
  ]);
  addSurface(parts, capVertices, capFaces, colorAt, 0.6);
  // Seal the mandible to the rear skull. The inner fan intersects the neck;
  // the front corners follow the same flat chin boundary as the face.
  const lowest = SECTIONS[0][0],
    edgeY = lowest + jawRise(lowest),
    edgeX = widthAt(lowest);
  const underside = [
    [-edgeX, edgeY, zAt(-edgeX, edgeY)],
    [-chinWidth, chinY, zAt(-chinWidth, chinY)],
    [chinWidth, chinY, zAt(chinWidth, chinY)],
    [edgeX, edgeY, zAt(edgeX, edgeY)],
    ...back.slice(1, around),
  ];
  const bottomCenter = underside.length;
  underside.push([0, 1.575, 0.018]);
  addSurface(
    parts,
    underside,
    Array.from({ length: bottomCenter }, (_, i) => [
      i,
      (i + 1) % bottomCenter,
      bottomCenter,
    ]),
    colorAt,
    0.45,
  );
  return vertices;
}

function ellipsePatch(
  parts: Parts,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  zAt: (x: number, y: number) => number,
  color: Color,
  sides = 16,
  rise = 0.001,
) {
  const vertices = [[cx, cy, zAt(cx, cy) - rise]];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx,
      y = cy + Math.sin(a) * ry;
    vertices.push([x, y, zAt(x, y) - rise]);
  }
  const faces = Array.from({ length: sides }, (_, i) => [
    0,
    ((i + 1) % sides) + 1,
    i + 1,
  ]);
  addSurface(parts, vertices, faces, color, 0.85);
}

function faceStrip(
  parts: Parts,
  points: number[][],
  widths: number | number[],
  definition: FaceDefinition,
  color: Color,
  lift = 0.0012,
  smooth = 0.45,
) {
  if (definition.faceGeometry) {
    const shift = definition.featureShift || 0;
    const edge = (sign: number) =>
      points.map(([x, y], i) => [
        x,
        y + shift + (sign * (Array.isArray(widths) ? widths[i] : widths)) / 2,
      ]);
    const first = parts.length;
    projectedFaceRegion(
      parts,
      definition,
      [...edge(1), ...edge(-1).reverse()],
      [],
      color,
      Math.min(lift, 0.00065),
    );
    if (shift)
      for (const geometry of parts.slice(first))
        geometry.translate(0, -shift, 0);
    return;
  }
  const vertices = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i],
      half = (Array.isArray(widths) ? widths[i] : widths) / 2;
    for (const yy of [y - half, y + half])
      vertices.push([
        x,
        yy,
        (definition.surfaceZ || definition.zAt)(x, yy) - lift,
      ]);
  }
  const faces = [];
  for (let i = 0; i < points.length - 1; i += 1)
    faces.push(
      [i * 2, i * 2 + 1, i * 2 + 2],
      [i * 2 + 1, i * 2 + 3, i * 2 + 2],
    );
  addSurface(parts, vertices, forwardFaces(vertices, faces), color, smooth);
}

function eyes(
  parts: Parts,
  _skull: number[][],
  definition: FaceDefinition,
  style: HeadStyle,
  id: ClassId,
) {
  const { zAt, profile } = definition;
  const shift = 0.032 - profile.offset + (id === 'heavy' ? 0.004 : 0);
  for (const side of [-1, 1]) {
    const shape = eyeOutline(side, profile);
    const opening = shape.map(([x, y]) => [x, y, zAt(x, y) - 0.002]);
    const eyeCenter = [
      side * 0.047 * profile.width * (id === 'sniper' ? 0.82 : 1),
      1.669 + shift,
      zAt(
        side * 0.047 * profile.width * (id === 'sniper' ? 0.82 : 1),
        1.669 + shift,
      ) - 0.004,
    ];
    const globe = [...opening, eyeCenter];
    const eyeFaces = opening.map((_, i) => [
      i,
      (i + 1) % opening.length,
      opening.length,
    ]);
    addSurface(
      parts,
      globe,
      forwardFaces(globe, eyeFaces),
      id === 'heavy' ? '#978d7a' : '#b9b2a0',
      0.85,
    );
    const eyeZ = (x: number, y: number) => zAt(x, y) - 0.0042;
    ellipsePatch(
      parts,
      eyeCenter[0] - side * 0.002,
      1.669 + shift,
      0.0052,
      id === 'heavy' ? 0.0042 : 0.0052,
      eyeZ,
      profile.eye,
      14,
      0.0006,
    );
    ellipsePatch(
      parts,
      eyeCenter[0] - side * 0.002,
      1.669 + shift,
      0.0026,
      id === 'heavy' ? 0.0028 : 0.004,
      eyeZ,
      '#1e211f',
      10,
      0.0011,
    );
    const upper = shape.slice(0, 6);
    const lower = [shape[0], ...shape.slice(6).reverse(), shape[5]];
    faceStrip(
      parts,
      upper,
      [0.0013, 0.0021, 0.0025, 0.0027, 0.0025, 0.0012],
      definition,
      '#59402f',
      0.0026,
    );
    faceStrip(parts, lower, 0.0015, definition, style.shadow, 0.0024);
    // A three-dimensional raised brow follows the orbital ridge. Its color
    // and taper support a stern adult expression without huge black eyebrows.
    const brow = [
      [0.018, 1.68 + shift],
      [0.031, 1.685 + shift],
      [0.046, 1.689 + shift],
      [0.062, 1.693 + shift],
      [0.077, 1.695 + shift],
      [0.084, 1.692 + shift],
    ];
    faceStrip(
      parts,
      brow.map(([x, y]) => [side * x * profile.width, y]),
      id === 'assault'
        ? [0.004, 0.008, 0.01, 0.0085, 0.005, 0.001]
        : [0.004, 0.008, 0.01, 0.0085, 0.005, 0.001],
      definition,
      profile.hair,
      0.0028,
      0.25,
    );
    // Lower lid volume and a restrained nasolabial crease catch the studio key.
    faceStrip(
      parts,
      [
        [0.035, 1.657 + shift],
        [0.052, 1.654 + shift],
        [0.068, 1.658 + shift],
      ].map(([x, y]) => [x * side * profile.width, y]),
      [0.001, 0.0023, 0.001],
      definition,
      new THREE.Color(style.skin).lerp(new THREE.Color(style.shadow), 0.17),
      0.0006,
    );
  }
}

function noseAndMouth(
  parts: Parts,
  definition: FaceDefinition,
  style: HeadStyle,
  id: ClassId,
) {
  const shift = 0.032 - definition.profile.offset;
  const source = definition;
  definition = {
    ...source,
    featureShift: shift,
    zAt: (x, y) => (source.surfaceZ || source.zAt)(x, y + shift),
    surfaceZ: (x, y) => (source.surfaceZ || source.zAt)(x, y + shift),
  };
  const first = parts.length;
  const { profile, zAt } = definition;
  for (const side of [-1, 1]) {
    ellipsePatch(
      parts,
      side * 0.0125 * profile.nose,
      1.6255,
      0.0045,
      0.0018,
      zAt,
      '#714c36',
      10,
      0.001,
    );
    faceStrip(
      parts,
      [
        [side * 0.022, 1.625],
        [side * 0.027, 1.611],
        [side * 0.034, 1.6],
      ],
      [0.001, 0.0016, 0.0005],
      definition,
      new THREE.Color(style.skin).lerp(new THREE.Color(style.shadow), 0.3),
      0.0007,
    );
  }
  const lip = new THREE.Color(profile.lips);
  const lipRows = [
    [
      [-0.029, 1.594],
      [-0.02, 1.597],
      [-0.009, 1.6],
      [0, 1.5975],
      [0.009, 1.6],
      [0.02, 1.597],
      [0.029, 1.594],
    ],
    [
      [-0.029, 1.593],
      [-0.02, 1.593],
      [-0.009, 1.5935],
      [0, 1.5937],
      [0.009, 1.5935],
      [0.02, 1.593],
      [0.029, 1.593],
    ],
    [
      [-0.028, 1.592],
      [-0.02, 1.588],
      [-0.009, 1.5865],
      [0, 1.586],
      [0.009, 1.5865],
      [0.02, 1.588],
      [0.028, 1.592],
    ],
  ];
  if (id !== 'assault')
    for (const row of lipRows)
      for (const point of row) {
        point[0] *= 0.72;
        point[1] =
          1.593 +
          (point[1] - 1.593) * 0.65 -
          0.01 +
          (id === 'heavy' ? 0.01 : 0);
      }
  const vertices = lipRows.flatMap((row, r) =>
    row.map(([x, y]) => [x, y, zAt(x, y) - (r === 1 ? 0.0015 : 0.0008)]),
  );
  const faces = [];
  for (let r = 0; r < 2; r += 1)
    for (let c = 0; c < 6; c += 1) {
      const a = r * 7 + c;
      faces.push([a, a + 1, a + 7], [a + 1, a + 8, a + 7]);
    }
  addSurface(
    parts,
    vertices,
    forwardFaces(vertices, faces),
    (x, y) =>
      y < 1.593 ? lip.clone().lerp(new THREE.Color(style.skin), 0.27) : lip,
    0.65,
  );
  faceStrip(
    parts,
    lipRows[1],
    [0.0006, 0.0014, 0.0015, 0.0015, 0.0015, 0.0014, 0.0006],
    definition,
    '#654531',
    id === 'assault' ? 0.0043 : 0.0022,
    0.55,
  );
  if (id !== 'assault') {
    const beard = PROFILES[id].beard;
    for (const side of [-1, 1]) {
      faceStrip(
        parts,
        [
          [side * 0.002, 1.613],
          [side * 0.012, 1.614],
          [side * 0.023, 1.608],
          [side * 0.03, 1.602],
        ],
        [0.004, 0.007, 0.006, 0.002],
        definition,
        id === 'scout' ? '#956847' : beard,
        0.001,
        0.6,
      );
    }
    faceStrip(
      parts,
      [
        [-0.009, 1.575],
        [0, 1.573],
        [0.009, 1.575],
      ],
      [0.001, 0.006, 0.001],
      definition,
      beard,
      0.0007,
    );
  }
  for (const geometry of parts.slice(first)) geometry.translate(0, shift, 0);
}

// Clip a sharp beard boundary to the actual facial triangles, retaining their
// normals. The beard is a colored region of the jaw, never a floating slab.
function beardSurface(
  parts: Parts,
  definition: FaceDefinition,
  paint: {
    color: THREE.ColorRepresentation;
    contour: number[][];
  } | null = null,
) {
  const { id, profile } = definition;
  if (id === 'assault') return;
  const shift = 0.032 - profile.offset;
  const side = [
    [0, 1.52],
    [0.16, 1.52],
    [0.16, 1.694],
    [0.094, 1.69],
    [0.085, 1.659],
    [0.08, 1.632],
    [0.06, 1.614],
    [0.04, 1.632],
    [0.018, 1.641],
    [0, 1.635],
  ];
  let contour = [
    ...side,
    ...side
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [-x, y]),
  ].map(([x, y]) => [x * profile.width, y + shift * 0.3]);
  let mouth = [
    [-0.025, 1.595],
    [-0.024, 1.58],
    [-0.012, 1.575],
    [0.012, 1.575],
    [0.024, 1.58],
    [0.025, 1.595],
  ].map(([x, y]) => [
    x * profile.width,
    y + shift + (id === 'heavy' ? 0.01 : 0),
  ]);
  if (paint) {
    contour = paint.contour;
    mouth = [];
  }
  const beard = new THREE.Color(paint?.color || profile.beard!);
  if (id === 'scout') beard.lerp(definition.skin, 0.58);
  projectedFaceRegion(parts, definition, contour, mouth, beard);
}

function projectedFaceRegion(
  parts: Parts,
  definition: FaceDefinition,
  contour: number[][],
  mouth: number[][],
  color: Color,
  lift = 0.0005,
) {
  const surface = definition.faceGeometry!;
  const regions = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(...p)),
    mouth.length ? [mouth.map((p) => new THREE.Vector2(...p))] : [],
  );
  const all = [...contour, ...mouth],
    p = surface.attributes.position,
    n = surface.attributes.normal;
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let t = 0; t < p.count; t += 3) {
    const tri = [0, 1, 2].map((i) => [
      p.getX(t + i),
      p.getY(t + i),
      p.getZ(t + i),
    ]);
    const signed = cross(tri[0], tri[1], tri[2]);
    if (Math.abs(signed) < 1e-12) continue;
    for (const region of regions) {
      let polygon = region.map((i) => all[i]);
      for (let e = 0; e < 3 && polygon.length; e++) {
        const a = tri[e],
          b = tri[(e + 1) % 3],
          clipped = [];
        for (let i = 0; i < polygon.length; i++) {
          const v = polygon[i],
            w = polygon[(i + 1) % polygon.length],
            dv = cross(a, b, v),
            dw = cross(a, b, w);
          if (dv * signed >= -1e-13) clipped.push(v);
          if (dv < 0 !== dw < 0) {
            const ratio = dv / (dv - dw);
            clipped.push([
              v[0] + (w[0] - v[0]) * ratio,
              v[1] + (w[1] - v[1]) * ratio,
            ]);
          }
        }
        polygon = clipped;
      }
      if (polygon.length < 3) continue;
      const [a, b, c] = tri;
      const positions = polygon.map(([x, y]) => {
        const u =
          ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / signed;
        const v =
          ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / signed;
        return [x, y, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]) - lift];
      });
      const faces = [];
      for (let i = 1; i < positions.length - 1; i++)
        if (
          Math.abs(cross(positions[0], positions[i], positions[i + 1])) > 1e-12
        )
          faces.push([0, i, i + 1]);
      if (!faces.length) continue;
      const geometry = addSurface(
        parts,
        positions,
        forwardFaces(positions, faces),
        color,
        0.5,
      );
      const gp = geometry.attributes.position,
        gn = geometry.attributes.normal;
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i),
          y = gp.getY(i),
          u =
            ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / signed,
          v =
            ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / signed;
        const normal = new THREE.Vector3()
          .fromBufferAttribute(n, t)
          .multiplyScalar(1 - u - v)
          .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, t + 1), u)
          .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, t + 2), v)
          .normalize();
        gn.setXYZ(i, normal.x, normal.y, normal.z);
      }
    }
  }
}

function ears(parts: Parts, definition: FaceDefinition, style: HeadStyle) {
  for (const side of [-1, 1]) {
    const vertices = [],
      faces = [];
    const centerX = 0.102 * definition.profile.width * side;
    const centerY = 1.682;
    const rings = [
      [1, 0.003],
      [0.8, -0.006],
      [0.53, 0.001],
      [0.2, -0.001],
    ];
    const segments = 14;
    for (const [radius, depth] of rings) {
      for (let i = 0; i < segments; i += 1) {
        const a = (i / segments) * Math.PI * 2;
        const yy = Math.sin(a);
        vertices.push([
          centerX +
            side * (0.007 + Math.cos(a) * 0.013 * radius * (yy < 0 ? 0.75 : 1)),
          centerY + yy * 0.022 * radius,
          0.014 + depth + Math.cos(a) * 0.009 * radius,
        ]);
      }
    }
    for (let r = 0; r < rings.length - 1; r += 1)
      for (let i = 0; i < segments; i += 1) {
        const a = r * segments + i,
          b = r * segments + ((i + 1) % segments);
        faces.push([a, b, a + segments], [b, b + segments, a + segments]);
      }
    const last = (rings.length - 1) * segments;
    for (let i = 1; i < segments - 1; i += 1)
      faces.push([last, last + i, last + i + 1]);
    addSurface(
      parts,
      vertices,
      forwardFaces(vertices, faces),
      (x, y, z) =>
        new THREE.Color(style.skin).lerp(
          new THREE.Color(style.shadow),
          z > -0.001 ? 0.22 : 0,
        ),
      0.7,
    );
    // The rear surface and earlobe make a real ear silhouette in a side view.
    const back = vertices
      .slice(0, segments)
      .map(([x, y, z]) => [x - side * 0.006, y, z + 0.015]);
    const rim = [...vertices.slice(0, segments), ...back];
    const rimFaces = [];
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      rimFaces.push([i, j, i + segments], [j, j + segments, i + segments]);
    }
    for (let i = 1; i < segments - 1; i += 1)
      rimFaces.push([segments, segments + i, segments + i + 1]);
    if (side < 0) rimFaces.forEach((face) => face.reverse());
    addSurface(parts, rim, rimFaces, style.skin, 0.65);
  }
}

function hairMass(
  parts: Parts,
  sections: number[][],
  color: Color,
  segments = 24,
  smooth = 0.25,
) {
  const vertices = [],
    faces = [];
  for (const [x, y, z, width, depth] of sections) {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      vertices.push([
        x + (Math.sin(a) * width) / 2,
        y,
        z - (Math.cos(a) * depth) / 2,
      ]);
    }
  }
  for (let r = 0; r < sections.length - 1; r += 1)
    for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i,
        b = r * segments + ((i + 1) % segments);
      faces.push([a, a + segments, b], [b, a + segments, b + segments]);
    }
  for (let i = 1; i < segments - 1; i += 1) {
    faces.push([0, i, i + 1]);
    const end = (sections.length - 1) * segments;
    faces.push([end, end + i + 1, end + i]);
  }
  return addSurface(parts, vertices, faces, color, smooth);
}

// A curved lock has a full elliptical cross-section along its path. These
// tapered, connected volumes create a hairstyle in profile and from behind.
function hairLock(
  parts: Parts,
  points: number[][],
  width: number,
  depth: number,
  color: Color,
  samples = 8,
  sides = 7,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    'centripetal',
  );
  const vertices = [],
    faces = [];
  for (let r = 0; r <= samples; r += 1) {
    const t = r / samples;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const across = new THREE.Vector3().crossVectors(FRONT, tangent).normalize();
    if (across.lengthSq() < 0.01) across.set(1, 0, 0);
    const outward = new THREE.Vector3()
      .crossVectors(tangent, across)
      .normalize();
    const taper = 0.4 + 0.6 * Math.sin(Math.PI * (0.08 + t * 0.84));
    const tip = r === samples ? 0.08 : taper;
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      vertices.push(
        center
          .clone()
          .addScaledVector(across, (Math.cos(a) * width * tip) / 2)
          .addScaledVector(outward, (Math.sin(a) * depth * tip) / 2)
          .toArray(),
      );
    }
  }
  for (let r = 0; r < samples; r += 1)
    for (let i = 0; i < sides; i += 1) {
      const a = r * sides + i,
        b = r * sides + ((i + 1) % sides);
      faces.push([a, b, a + sides], [b, b + sides, a + sides]);
    }
  for (let i = 1; i < sides - 1; i += 1) {
    faces.push([0, i + 1, i]);
    const end = samples * sides;
    faces.push([end, end + i, end + i + 1]);
  }
  addSurface(parts, vertices, faces, color, 0.15);
}

function scalpCap(parts: Parts, id: ClassId, color: Color) {
  const vertices = [],
    faces = [];
  const segments = 28,
    levels = 7;
  const top =
    id === 'assault'
      ? 1.823
      : id === 'scout'
        ? 1.815
        : id === 'sniper'
          ? 1.791
          : 1.81;
  for (let r = 0; r <= levels; r += 1) {
    const t = r / levels;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      const side = Math.sin(a);
      let bottom = 1.704 + 0.057 * front;
      if (id === 'assault')
        bottom = 1.6 + 0.144 * front - 0.027 * Math.max(0, side);
      if (id === 'sniper') bottom = 1.722 + 0.024 * front;
      if (id === 'heavy')
        bottom = 1.709 + 0.048 * front - 0.022 * Math.abs(side);
      const radius = Math.sqrt(t * (2 - t));
      const width = id === 'heavy' ? 0.127 : id === 'assault' ? 0.128 : 0.116;
      const curl = id === 'assault' ? 1 - 0.1 * t ** 5 : 1;
      vertices.push([
        Math.sin(a) * width * radius * curl +
          (id === 'assault' ? 0.009 * (1 - t) : 0),
        top + (bottom - top) * t,
        0.018 - Math.cos(a) * 0.13 * radius,
      ]);
    }
  }
  for (let r = 0; r < levels; r += 1)
    for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i,
        b = r * segments + ((i + 1) % segments);
      if (r > 0) faces.push([a, b, a + segments]);
      faces.push([b, b + segments, a + segments]);
    }
  addSurface(parts, vertices, faces, color, 0.28);
}

function emberHair(parts: Parts, color: Color) {
  scalpCap(parts, 'assault', color);
  hairMass(
    parts,
    [
      [0, 1.729, 0.036, 0.246, 0.235],
      [0.005, 1.756, 0.025, 0.267, 0.265],
      [0, 1.786, 0.024, 0.254, 0.256],
      [0.005, 1.808, 0.025, 0.181, 0.192],
      [0.005, 1.821, 0.029, 0.086, 0.096],
    ],
    color,
    20,
    0.16,
  );
  const variations = ['#463a35', '#4d3f38', '#3b312e', '#423632'];
  const locks = [
    [
      [-0.079, 1.776, -0.066],
      [-0.035, 1.805, -0.087],
      [0.032, 1.778, -0.111],
      [0.083, 1.723, -0.103],
      [0.115, 1.661, -0.037],
    ],
    [
      [-0.069, 1.802, -0.008],
      [-0.008, 1.824, -0.046],
      [0.065, 1.789, -0.077],
      [0.109, 1.713, -0.049],
      [0.122, 1.639, 0.003],
    ],
    [
      [-0.093, 1.772, -0.031],
      [-0.055, 1.814, -0.05],
      [0.01, 1.818, -0.041],
      [0.078, 1.776, -0.026],
      [0.13, 1.682, 0.023],
      [0.115, 1.612, 0.035],
    ],
    [
      [-0.101, 1.769, 0.009],
      [-0.124, 1.72, 0.021],
      [-0.114, 1.654, 0.032],
      [-0.092, 1.624, 0.028],
    ],
    [
      [0.072, 1.781, 0.077],
      [0.13, 1.736, 0.068],
      [0.132, 1.65, 0.066],
      [0.109, 1.592, 0.073],
    ],
    [
      [-0.064, 1.783, 0.097],
      [-0.112, 1.711, 0.096],
      [-0.094, 1.631, 0.108],
      [-0.07, 1.589, 0.099],
    ],
    [
      [0.001, 1.79, 0.123],
      [0.035, 1.704, 0.144],
      [0.049, 1.636, 0.131],
      [0.023, 1.591, 0.123],
    ],
    [
      [0.052, 1.772, 0.121],
      [0.085, 1.702, 0.131],
      [0.078, 1.617, 0.125],
      [0.062, 1.574, 0.113],
    ],
  ];
  locks.forEach((points, i) =>
    hairLock(
      parts,
      points,
      i === 0 ? 0.102 : i < 3 ? 0.072 : 0.056,
      i < 3 ? 0.027 : 0.034,
      variations[i % variations.length],
      i < 3 ? 7 : 6,
      5,
    ),
  );
}

function goggles(parts: Parts) {
  const strap = '#2b2a28';
  hairMass(
    parts,
    [
      [0, 1.742, 0.01, 0.246, 0.236],
      [0, 1.758, 0.01, 0.247, 0.237],
    ],
    strap,
    24,
  );
  for (const side of [-1, 1]) {
    const center = new THREE.Vector3(side * 0.055, 1.754, -0.103);
    const vertices = [],
      faces = [];
    const rings = [
      [0.046, 0.04, 0.005],
      [0.047, 0.04, -0.006],
      [0.037, 0.03, -0.014],
      [0.034, 0.027, -0.012],
    ];
    for (const [rx, ry, z] of rings)
      for (let i = 0; i < 8; i += 1) {
        const a = ((i + 0.5) / 8) * Math.PI * 2;
        const point = new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, z)
          .applyAxisAngle(UP, -side * 0.28)
          .add(center);
        vertices.push(point.toArray());
      }
    for (let r = 0; r < rings.length - 1; r += 1)
      for (let i = 0; i < 8; i += 1) {
        const a = r * 8 + i,
          b = r * 8 + ((i + 1) % 8);
        faces.push([a, a + 8, b], [b, a + 8, b + 8]);
      }
    addSurface(parts, vertices, faces, strap, 0.25);
    const lens = vertices.slice(-8);
    const lensFaces = [];
    for (let i = 1; i < 7; i += 1) lensFaces.push([0, i + 1, i]);
    addSurface(
      parts,
      lens,
      forwardFaces(lens, lensFaces),
      (x, y) => new THREE.Color(y > 1.76 ? '#c6c5b9' : '#969f9d'),
      0.15,
    );
  }
  hairLock(
    parts,
    [
      [-0.011, 1.753, -0.111],
      [0, 1.758, -0.117],
      [0.011, 1.753, -0.111],
    ],
    0.014,
    0.015,
    strap,
    3,
    6,
  );
}

function maleHair(parts: Parts, id: ClassId, profile: Profile) {
  if (id === 'scout') {
    scalpCap(parts, id, profile.hair);
    hairMass(
      parts,
      [
        [0, 1.741, 0.018, 0.235, 0.242],
        [0, 1.776, 0.02, 0.247, 0.254],
        [0, 1.808, 0.023, 0.215, 0.226],
        [0, 1.826, 0.026, 0.09, 0.11],
      ],
      profile.hair,
      14,
      0.12,
    );
  }

  if (id === 'sniper') {
    // A fitted band and a broad cloth crown, tilted down over one temple.
    hairMass(
      parts,
      [
        [0, 1.739, 0.018, 0.219, 0.221],
        [0, 1.767, 0.02, 0.208, 0.205],
        [0, 1.789, 0.022, 0.125, 0.139],
      ],
      '#43536a',
      16,
      0.15,
    );
    hairMass(
      parts,
      [
        [0, 1.734, 0.02, 0.227, 0.214],
        [0, 1.746, 0.02, 0.229, 0.216],
      ],
      '#303b49',
      24,
      0.4,
    );
    const beret = hairMass(
      parts,
      [
        [0, 1.754, 0.018, 0.223, 0.212],
        [0.033, 1.767, 0.024, 0.292, 0.25],
        [0.012, 1.802, 0.025, 0.272, 0.248],
        [-0.012, 1.824, 0.026, 0.226, 0.212],
        [-0.006, 1.827, 0.028, 0.13, 0.135],
      ],
      '#4e5f77',
      10,
      0.12,
    );
    beret.translate(0, -1.776, 0);
    beret.rotateZ(-0.27);
    beret.translate(0, 1.776, 0);
    const bp = beret.attributes.position;
    for (let i = 0; i < bp.count; i++)
      bp.setY(i, 1.73 + (bp.getY(i) - 1.73) * 0.82 - 0.018);
    beret.computeVertexNormals();
    const projectBadge = (x: number, y: number) => {
      const p = beret.attributes.position;
      let closest = Infinity;
      for (let i = 0; i < p.count; i += 3) {
        const ax = p.getX(i),
          ay = p.getY(i),
          bx = p.getX(i + 1),
          by = p.getY(i + 1),
          cx = p.getX(i + 2),
          cy = p.getY(i + 2);
        const det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(det) < 1e-12) continue;
        const u = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / det,
          v = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / det;
        if (u >= 0 && v >= 0 && u + v <= 1)
          closest = Math.min(
            closest,
            p.getZ(i) * (1 - u - v) + p.getZ(i + 1) * u + p.getZ(i + 2) * v,
          );
      }
      return [x, y, closest - 0.001];
    };
    const badge = [
      [-0.061, 1.766],
      [-0.052, 1.7665],
      [-0.043, 1.767],
      [-0.043, 1.78],
      [-0.043, 1.792],
      [-0.0505, 1.7945],
      [-0.058, 1.797],
      [-0.0595, 1.7815],
      [-0.052, 1.782],
    ].map(([x, y]) => {
      const p = projectBadge(x, y);
      p[2] -= 0.002;
      return p;
    });
    if (badge.every((p) => p.every(Number.isFinite)))
      addSurface(
        parts,
        badge,
        forwardFaces(
          badge,
          Array.from({ length: 8 }, (_, i) => [i, (i + 1) % 8, 8]),
        ),
        '#c1a566',
        0,
      );
  } else if (id === 'scout') {
    const locks = [
      [
        [-0.084, 1.761, -0.036],
        [-0.073, 1.809, -0.033],
        [-0.096, 1.837, -0.025],
      ],
      [
        [-0.046, 1.782, -0.052],
        [-0.036, 1.832, -0.039],
        [-0.059, 1.851, -0.023],
      ],
      [
        [-0.008, 1.788, -0.044],
        [0.02, 1.834, -0.025],
        [0.008, 1.85, -0.008],
      ],
      [
        [0.042, 1.78, -0.019],
        [0.066, 1.82, 0.003],
        [0.092, 1.82, 0.025],
      ],
      [
        [-0.068, 1.788, 0.04],
        [-0.054, 1.822, 0.073],
        [-0.077, 1.84, 0.086],
      ],
      [
        [0.001, 1.79, 0.061],
        [0.02, 1.826, 0.09],
        [0.006, 1.845, 0.102],
      ],
      [
        [0.069, 1.77, 0.062],
        [0.093, 1.796, 0.086],
        [0.113, 1.798, 0.103],
      ],
    ];
    locks.forEach((points, i) => {
      const vertices = [];
      for (let r = 0; r < 2; r++) {
        const [x, y, z] = points[r],
          w = r === 0 ? 0.032 : 0.024,
          d = r === 0 ? 0.026 : 0.018;
        vertices.push(
          [x - w, y, z - d],
          [x + w, y, z - d],
          [x + w, y, z + d],
          [x - w, y, z + d],
        );
      }
      vertices.push(points[2]);
      const faces = [
        [0, 3, 2],
        [0, 2, 1],
      ];
      for (let j = 0; j < 4; j++) {
        const next = (j + 1) % 4;
        faces.push(
          [j, j + 4, next],
          [next, j + 4, next + 4],
          [j + 4, 8, next + 4],
        );
      }
      addSurface(parts, vertices, faces, i % 2 ? '#514034' : profile.hair, 0);
    });
    goggles(parts);
  }
}

/** A single articulated adult head. Its origin remains the existing neck pivot. */
export function makeHead(id: ClassId, style: HeadStyle) {
  const parts: Parts = [];
  const definition = makeFaceDefinition(id, style);
  const skull = sculptSkull(parts, definition);
  eyes(parts, skull, definition, style, id);
  beardSurface(parts, definition);
  if (id === 'heavy')
    beardSurface(parts, definition, {
      color: definition.profile.hair,
      contour: [
        [-0.15, 1.728],
        [-0.106, 1.722],
        [-0.095, 1.734],
        [-0.081, 1.745],
        [-0.052, 1.751],
        [0.052, 1.751],
        [0.081, 1.745],
        [0.095, 1.734],
        [0.106, 1.722],
        [0.15, 1.728],
        [0.15, 1.84],
        [-0.15, 1.84],
      ],
    });
  noseAndMouth(parts, definition, style, id);
  ears(parts, definition, style);
  if (id === 'sniper')
    for (const geometry of parts) {
      const positions = geometry.attributes.position,
        normals = geometry.attributes.normal;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y > 1.72) {
          positions.setY(i, 1.72 + (y - 1.72) * 0.72);
          const normal = new THREE.Vector3(
            normals.getX(i),
            normals.getY(i) / 0.72,
            normals.getZ(i),
          ).normalize();
          normals.setXYZ(i, normal.x, normal.y, normal.z);
        }
      }
    }
  const hairStart = parts.length;
  if (id === 'assault') emberHair(parts, definition.profile.hair);
  else maleHair(parts, id, definition.profile);
  if (id === 'assault') {
    for (const geometry of parts.slice(hairStart + 2)) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const y = positions.getY(i);
        if (y > 1.76) positions.setY(i, 1.76 + (y - 1.76) * 0.69);
      }
      geometry.computeVertexNormals();
    }
  }
  if (id === 'scout')
    for (const geometry of parts.slice(hairStart)) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y > 1.77) positions.setY(i, 1.77 + (y - 1.77) * 0.78);
      }
      geometry.computeVertexNormals();
    }
  if (id === 'sniper') for (const geometry of parts) geometry.scale(0.88, 1, 1);
  if (id === 'heavy') for (const geometry of parts) geometry.scale(0.9, 1, 1);
  if (id === 'scout')
    for (const geometry of parts) {
      geometry.translate(0, -1.54, 0);
      geometry.scale(1, 0.9, 1);
      geometry.translate(0, 1.516, 0);
    }
  for (const geometry of parts) {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i),
        b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
        c = new THREE.Vector3().fromBufferAttribute(p, i + 2),
        face = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
      for (let j = i; j < i + 3; j++) {
        const normal = new THREE.Vector3().fromBufferAttribute(n, j);
        if (normal.dot(face) < 0.05) n.setXYZ(j, face.x, face.y, face.z);
      }
    }
  }
  const mesh = makeMesh(parts, 'character-head', PIVOT);
  if (mesh.material instanceof THREE.MeshStandardMaterial)
    mesh.material.flatShading = false;
  mesh.rotation.y =
    id === 'assault'
      ? 0.23
      : id === 'scout'
        ? 0.24
        : id === 'sniper'
          ? 0.27
          : 0.22;
  return mesh;
}
