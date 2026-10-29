import * as THREE from 'three';
import { makeMesh } from './character-geometry.ts';
import {
  fromReference,
  triangulateReference,
  referencePatch,
  worldSurface,
} from './reference-head-geometry.ts';
import {
  EMBER_FACE_CONTOUR,
  EMBER_EYES,
  EMBER_FACE_LANDMARKS,
} from './ember-reference-face-data.ts';
import { addEmberHairVolume } from './ember-hair-volume.ts';
import { EMBER_PAINT } from './ember-reference-paint.ts';

export const emberFaceTopology = triangulateReference(
  EMBER_FACE_CONTOUR,
  EMBER_EYES,
  EMBER_FACE_LANDMARKS,
);

// Subdivide the anatomically modeled planes for continuous vertex painting.
// Geometry depth comes from facial landmarks, independently of pixel colors.
export function paintedSurface(
  parts: THREE.BufferGeometry[],
  vertices: number[][],
  faces: number[][],
) {
  const points: number[][] = [];
  function subdivide(a: number[], b: number[], c: number[], level = 0) {
    const longest = Math.max(
      Math.hypot(a[0] - b[0], a[1] - b[1]),
      Math.hypot(b[0] - c[0], b[1] - c[1]),
      Math.hypot(c[0] - a[0], c[1] - a[1]),
    );
    if (longest < 1 || level === 7) {
      points.push(a, b, c);
      return;
    }
    const mid = (p: number[], q: number[]) => p.map((v, i) => (v + q[i]) / 2),
      ab = mid(a, b),
      bc = mid(b, c),
      ca = mid(c, a);
    subdivide(a, ab, ca, level + 1);
    subdivide(ab, b, bc, level + 1);
    subdivide(ca, bc, c, level + 1);
    subdivide(ab, bc, ca, level + 1);
  }
  for (const face of faces)
    subdivide(vertices[face[0]], vertices[face[1]], vertices[face[2]]);
  const positions = [],
    colors = [];
  for (const p of points) {
    positions.push(...fromReference(p));
    const x = THREE.MathUtils.clamp(
      p[0] - EMBER_PAINT.x,
      0,
      EMBER_PAINT.width - 1,
    );
    const y = THREE.MathUtils.clamp(
      p[1] - EMBER_PAINT.y,
      0,
      EMBER_PAINT.height - 1,
    );
    const x0 = Math.floor(x),
      y0 = Math.floor(y),
      x1 = Math.min(x0 + 1, EMBER_PAINT.width - 1),
      y1 = Math.min(y0 + 1, EMBER_PAINT.height - 1);
    const sample = (px: number, py: number, c: number) =>
      EMBER_PAINT.rgb[(py * EMBER_PAINT.width + px) * 3 + c] / 255;
    const rgb = [0, 1, 2].map((c) =>
      THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(sample(x0, y0, c), sample(x1, y0, c), x - x0),
        THREE.MathUtils.lerp(sample(x0, y1, c), sample(x1, y1, c), x - x0),
        y - y0,
      ),
    );
    const color = new THREE.Color().setRGB(
      rgb[0],
      rgb[1],
      rgb[2],
      THREE.SRGBColorSpace,
    );
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  parts.push(geometry);
}

function skin(parts: THREE.BufferGeometry[]) {
  const topology = emberFaceTopology;
  paintedSurface(parts, topology.vertices, topology.faces);
  // Continuous jaw, temples, cranium and rear skull. Rear rows are shaped in
  // anatomical world axes, not a flat extrusion of the source silhouette.
  const front = EMBER_FACE_CONTOUR.map((p) => fromReference(p));
  const side = front.map(([x, y]) => [
    x * 0.92,
    y,
    y < 1.61 ? 0.038 : y > 1.79 ? 0.036 : 0.071,
  ]);
  const back = side.map(([x, y, z]) => [
    x * 0.65,
    y + (1.7 - y) * 0.07,
    z + (y > 1.61 && y < 1.79 ? 0.049 : 0.014),
  ]);
  const n = front.length,
    vertices = [...front, ...side, ...back, [0, 1.705, 0.133]],
    faces = [];
  for (let ring = 0; ring < 2; ring++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        a = ring * n;
      faces.push([a + i, a + j, a + n + i], [a + j, a + n + j, a + n + i]);
    }
  for (let i = 0; i < n; i++)
    faces.push([2 * n + i, 2 * n + ((i + 1) % n), 3 * n]);
  const orient = faces.map((f) => {
    const [a, b, c] = f.map((i) => new THREE.Vector3(...vertices[i]));
    const center = a
      .clone()
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3)
      .sub(new THREE.Vector3(0, 1.704, 0.015));
    return b.sub(a).cross(c.sub(a)).dot(center) < 0 ? [...f].reverse() : f;
  });
  worldSurface(parts, vertices, orient, (i) =>
    i > n * 2 ? '#8f5b3d' : '#9e6745',
  );
  for (const loop of EMBER_EYES) {
    const surface = triangulateReference(loop);
    paintedSurface(parts, surface.vertices, surface.faces);
  }
  // Visible outer ear, concha and tragus. Opposite ear sits behind the far temple.
  const earPoints = [
    [149, 132, 0.036],
    [157, 128, 0.046],
    [164, 132, 0.057],
    [168, 143, 0.057],
    [162, 153, 0.048],
    [155, 150, 0.038],
    [149, 143, 0.028],
  ];
  referencePatch(parts, earPoints, '#a86e49', 0.021);
  const earSurface = triangulateReference(
    earPoints.map(([x, y, d]) => [x, y, d + 0.0002]),
    [],
    [
      [158, 139, 0.051],
      [161, 144, 0.055],
    ],
  );
  paintedSurface(parts, earSurface.vertices, earSurface.faces);
}

function neck(parts: THREE.BufferGeometry[]) {
  const rows = [
    [153, 230, 244, 0.103, 0.069],
    [164, 220, 226, 0.082, 0.068],
    [168, 217, 208, 0.065, 0.064],
    [171, 211, 189, 0.061, 0.064],
    [171, 207, 170, 0.064, 0.058],
  ];
  const sides = 16,
    vertices: number[][] = [],
    front: number[][] = [],
    rear: number[][] = [];
  for (const [left, right, y, f, b] of rows)
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2,
        c = Math.cos(angle);
      vertices.push([
        (left + right) / 2 + ((right - left) / 2) * Math.sin(angle),
        y,
        c * (c >= 0 ? f : b),
      ]);
    }
  for (let row = 0; row < rows.length - 1; row++)
    for (let i = 0; i < sides; i++) {
      const a = row * sides + i,
        b = row * sides + ((i + 1) % sides);
      const faces = [
        [a, b, a + sides],
        [b, b + sides, a + sides],
      ];
      (Math.cos(((i + 0.5) / sides) * Math.PI * 2) > 0 ? front : rear).push(
        ...faces,
      );
    }
  for (let i = 1; i < sides - 1; i++) {
    rear.push([0, i + 1, i]);
    const start = (rows.length - 1) * sides;
    rear.push([start, start + i, start + i + 1]);
  }
  // Front triangles are oriented toward the reference camera for vertex paint.
  const orient = front.map((f) => {
    const [a, b, c] = f.map((i) => vertices[i]);
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
      ? [...f].reverse()
      : f;
  });
  paintedSurface(parts, vertices, orient);
  worldSurface(
    parts,
    vertices.map((p) => fromReference(p)),
    rear,
    '#95613f',
  );
}

export function makeEmberHead() {
  const parts: THREE.BufferGeometry[] = [];
  skin(parts);
  neck(parts);
  addEmberHairVolume(parts);
  const head = makeMesh(parts, 'character-head', [0, 1.49, 0]);
  head.material.dispose();
  head.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  return head;
}
