import * as THREE from 'three';
export interface Topology {
  vertices: number[][];
  faces: number[][];
}
interface ReferenceFrame {
  origin: THREE.Vector3;
  anchor: number[];
  scale: number;
  toward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}
type SurfaceColor =
  | THREE.ColorRepresentation
  | ((index: number, face: number[]) => THREE.ColorRepresentation);

// The image is a modeling guide only. Vertices carry anatomical depth and form
// closed, turnable volumes; no reference bitmap is loaded into the model.
export const EMBER_FRAME: ReferenceFrame = {
  up: new THREE.Vector3(),
  origin: new THREE.Vector3(0, 1.67, 0),
  anchor: [196, 130],
  scale: 465,
  toward: new THREE.Vector3(0.4, 0.08, -1).normalize(),
  right: new THREE.Vector3(-1, 0, -0.4).normalize(),
};
EMBER_FRAME.up = new THREE.Vector3()
  .crossVectors(EMBER_FRAME.toward, EMBER_FRAME.right)
  .normalize();

export function fromReference([x, y, depth]: number[], frame = EMBER_FRAME) {
  return frame.origin
    .clone()
    .addScaledVector(frame.right, (x - frame.anchor[0]) / frame.scale)
    .addScaledVector(frame.up, (frame.anchor[1] - y) / frame.scale)
    .addScaledVector(frame.toward, depth)
    .toArray();
}

const cross = (a: number[], b: number[], c: number[]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function triangulateReference(
  contour: number[][],
  holes: number[][][] = [],
  landmarks: number[][] = [],
): Topology {
  const vertices = [...contour, ...holes.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(p[0], p[1])),
    holes.map((loop) => loop.map((p) => new THREE.Vector2(p[0], p[1]))),
  );
  for (const point of landmarks) {
    if (
      vertices.some((p) => Math.hypot(p[0] - point[0], p[1] - point[1]) < 0.01)
    )
      continue;
    const index = faces.findIndex((face) => {
      const p = face.map((i) => vertices[i]);
      const signs = [
        cross(p[0], p[1], point),
        cross(p[1], p[2], point),
        cross(p[2], p[0], point),
      ];
      return signs.every((v) => v > 0.001) || signs.every((v) => v < -0.001);
    });
    if (index < 0) continue;
    const [a, b, c] = faces[index],
      n = vertices.length;
    vertices.push(point);
    faces.splice(index, 1, [a, b, n], [b, c, n], [c, a, n]);
  }
  for (let pass = 0; pass < 15; pass++) {
    const edges = new Map<
        string,
        { index: number; a: number; b: number; c: number }[]
      >(),
      used = new Set<number>();
    faces.forEach((face, index) =>
      face.forEach((a, i) => {
        const b = face[(i + 1) % 3],
          c = face[(i + 2) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const list = edges.get(key) || [];
        list.push({ index, a, b, c });
        edges.set(key, list);
      }),
    );
    let changed = false;
    for (const pair of edges.values()) {
      if (pair.length !== 2) continue;
      const [f, g] = pair;
      if (used.has(f.index) || used.has(g.index)) continue;
      const { a, b, c } = f,
        d = g.c,
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
          THREE.MathUtils.clamp(
            ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) /
              (Math.hypot(p[0] - q[0], p[1] - q[1]) *
                Math.hypot(r[0] - q[0], r[1] - q[1])),
            -1,
            1,
          ),
        );
      if (angle(pa, pc, pb) + angle(pa, pd, pb) <= Math.PI + 0.0001) continue;
      faces[f.index] = [c, d, a];
      faces[g.index] = [d, c, b];
      used.add(f.index);
      used.add(g.index);
      changed = true;
    }
    if (!changed) break;
  }
  return {
    vertices,
    faces: faces.map((face) =>
      cross(vertices[face[0]], vertices[face[1]], vertices[face[2]]) > 0
        ? [...face].reverse()
        : face,
    ),
  };
}

export function worldSurface(
  parts: THREE.BufferGeometry[],
  vertices: number[][],
  faces: number[][],
  color: SurfaceColor,
  outward: THREE.Vector3 | null = null,
) {
  const positions: number[] = [],
    colors: number[] = [];
  faces.forEach((sourceFace, index) => {
    const face = [...sourceFace];
    const pts = face.map(
      (i) => new THREE.Vector3(vertices[i][0], vertices[i][1], vertices[i][2]),
    );
    const normal = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0]));
    if (normal.lengthSq() < 1e-16) return;
    if (outward && normal.dot(outward) < 0) face.reverse();
    const tint = new THREE.Color(
      typeof color === 'function' ? color(index, sourceFace) : color,
    );
    for (const i of face) {
      positions.push(...vertices[i]);
      colors.push(tint.r, tint.g, tint.b);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  parts.push(geometry);
  return geometry;
}

export function referenceSurface(
  parts: THREE.BufferGeometry[],
  vertices: number[][],
  faces: number[][],
  color: SurfaceColor,
) {
  return worldSurface(
    parts,
    vertices.map((p) => fromReference(p)),
    faces,
    color,
    EMBER_FRAME.toward,
  );
}

// Closed shallow sculpted features (lids, brows and lip rims) follow the face,
// while skull and hair shells below provide the full head volume.
export function referencePatch(
  parts: THREE.BufferGeometry[],
  points: number[][],
  color: SurfaceColor,
  thickness = 0.001,
) {
  const front = triangulateReference(points);
  referenceSurface(parts, front.vertices, front.faces, color);
  if (thickness <= 0) return;
  const n = points.length,
    verts = [
      ...points,
      ...points.map(([x, y, d]) => [x, y, d - thickness]),
    ].map((p) => fromReference(p));
  const faces = front.faces.map((f) => [...f].reverse().map((i) => i + n));
  const clockwise =
    points.reduce((s, a, i) => {
      const b = points[(i + 1) % n];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0) > 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge = [
      [i, j, i + n],
      [j, j + n, i + n],
    ];
    if (!clockwise) edge.forEach((f) => f.reverse());
    faces.push(...edge);
  }
  worldSurface(parts, verts, faces, color);
}
