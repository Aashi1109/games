import type { BufferGeometry } from 'three';
import type { Topology } from './reference-head-geometry.ts';
import { EMBER_HAIR_PATCHES } from './ember-reference-hair-data.ts';
import {
  fromReference,
  referenceSurface,
  triangulateReference,
  worldSurface,
} from './reference-head-geometry.ts';

const vertexKey = (point: number[]) => point.join(',');

// Adjacent traced facets share exact vertices. Their exposed edges describe
// one loop: the outside of the bob, then the forehead/ear opening, then the
// remaining outside locks. The loop retains every pointed bob tip.
function visibleBoundary() {
  const edges = new Map<
    string,
    { start: string; end: string; point: number[]; count: number }
  >();
  for (const patch of EMBER_HAIR_PATCHES) {
    patch.points.forEach((point, i) => {
      const next = patch.points[(i + 1) % patch.points.length];
      const start = vertexKey(point),
        end = vertexKey(next);
      const key = [start, end].sort().join('|');
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else edges.set(key, { start, end, point, count: 1 });
    });
  }
  const exposed = [...edges.values()].filter((edge) => edge.count === 1);
  const nextEdge = new Map(exposed.map((edge) => [edge.start, edge]));
  const first = exposed[0].start;
  const boundary = [];
  let current = first;
  do {
    const edge = nextEdge.get(current);
    if (!edge || boundary.length >= exposed.length)
      throw new Error('Ember hair contour is not a closed loop');
    boundary.push(edge.point);
    current = edge.end;
  } while (current !== first);
  if (boundary.length !== exposed.length)
    throw new Error('Ember hair has an unexpected separate contour');
  return boundary;
}

function openingAndOutline(boundary: number[][]) {
  const rightTip = boundary.findIndex(([x, y]) => x === 229 && y === 172);
  const leftTip = boundary.findIndex(([x, y]) => x === 167 && y === 180);
  if (rightTip < 0 || leftTip <= rightTip)
    throw new Error('Ember bob attachment points are missing');
  return {
    opening: boundary.slice(rightTip, leftTip + 1),
    outline: [...boundary.slice(0, rightTip + 1), ...boundary.slice(leftTip)],
  };
}

// A diagonal joining two outside vertices needs an interior depth sample;
// otherwise both sides would touch along that diagonal and pinch the volume.
function refineBoundaryChords(
  topology: Topology,
  outline: number[][],
): Topology {
  const key = (point: number[]) => point.slice(0, 2).join(',');
  const outer = new Set(outline.map(key));
  const boundaryEdges = new Set(
    outline.map((point, i) =>
      [key(point), key(outline[(i + 1) % outline.length])].sort().join('|'),
    ),
  );
  const vertices = [...topology.vertices],
    faces = [],
    pending = [...topology.faces],
    midpoints = new Map<string, number>();
  while (pending.length) {
    const face = pending.pop()!;
    const edge = face.findIndex((a, i) => {
      const b = face[(i + 1) % 3],
        ka = key(vertices[a]),
        kb = key(vertices[b]);
      return (
        outer.has(ka) &&
        outer.has(kb) &&
        !boundaryEdges.has([ka, kb].sort().join('|'))
      );
    });
    if (edge < 0) {
      faces.push(face);
      continue;
    }
    const a = face[edge],
      b = face[(edge + 1) % 3],
      c = face[(edge + 2) % 3];
    const pair = [a, b].sort((x, y) => x - y).join(',');
    let middle = midpoints.get(pair);
    if (middle === undefined) {
      middle = vertices.length;
      vertices.push(
        vertices[a].map((value, axis) => (value + vertices[b][axis]) / 2),
      );
      midpoints.set(pair, middle);
    }
    pending.push([a, middle, c], [middle, b, c]);
  }
  return { vertices, faces };
}

/**
 * Add the complete sculpted hair shell, including the approved visible facets.
 * All rear points project inside the traced silhouette and lie behind its
 * surface. The forehead/ear opening closes inside the skull, behind the skin;
 * a rounded posterior surface completes the bob for free orbit views.
 */
export function addEmberHairVolume(parts: BufferGeometry[]) {
  const frontRegions = [];
  const { opening, outline } = openingAndOutline(visibleBoundary());
  for (const patch of EMBER_HAIR_PATCHES) {
    const topology = refineBoundaryChords(
      triangulateReference(patch.points),
      outline,
    );
    referenceSurface(parts, topology.vertices, topology.faces, patch.color);
    frontRegions.push(topology);
  }

  // Walls follow the reference viewing direction, so they do not paint over
  // the exposed face or ear. The first and last ends meet the bob's lower tips.
  const hiddenOpening = opening.map(([x, y, depth], i) => [
    x,
    y,
    i === 0 || i === opening.length - 1 ? depth : -0.085,
  ]);
  const openingVertices = [...opening, ...hiddenOpening].map((point) =>
    fromReference(point),
  );
  const n = opening.length,
    openingWalls = [];
  for (let i = 0; i < n - 1; i += 1) {
    openingWalls.push([i, i + 1, i + n], [i + 1, i + n + 1, i + n]);
  }
  worldSurface(parts, openingVertices, openingWalls, '#292121');
  const closure = refineBoundaryChords(
    triangulateReference(hiddenOpening),
    outline,
  );
  referenceSurface(parts, closure.vertices, closure.faces, '#292121');
  frontRegions.push(closure);

  // Use a conforming copy of the visible/inside surface for the posterior
  // topology. A centroid refines each plane without adding unmatched vertices
  // on the bob boundary. Every back vertex stays behind its front counterpart,
  // including around the concave notches between pointed locks.
  const rearVertices: number[][] = [],
    rearFaces: number[][] = [],
    lookup = new Map<string, number>();
  const rearVertex = (point: number[]) => {
    const key = point
      .slice(0, 2)
      .map((value) => Math.round(value * 1e7))
      .join(',');
    let index = lookup.get(key);
    if (index === undefined) {
      index = rearVertices.length;
      rearVertices.push([...point]);
      lookup.set(key, index);
    } else rearVertices[index][2] = Math.min(rearVertices[index][2], point[2]);
    return index;
  };
  for (const region of frontRegions)
    for (const face of region.faces) {
      const points = face.map((i) => region.vertices[i]);
      const [a, b, c] = points.map(rearVertex);
      const center = rearVertex(
        [0, 1, 2].map(
          (axis) => points.reduce((sum, point) => sum + point[axis], 0) / 3,
        ),
      );
      rearFaces.push([b, a, center], [c, b, center], [a, c, center]);
    }
  for (const point of rearVertices) {
    const [x, y, frontDepth] = point;
    let distance = Infinity,
      boundaryDepth = frontDepth;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      const separation = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
      if (separation < distance) {
        distance = separation;
        boundaryDepth = a[2] + (b[2] - a[2]) * t;
      }
    }
    if (distance < 1e-6) point[2] = boundaryDepth;
    else {
      const radius = ((x - 181) / 73) ** 2 + ((y - 117) / 65) ** 2;
      const domeDepth = -0.152 + 0.042 * Math.min(radius, 1.5);
      const t = Math.min(1, distance / 12),
        blend = t * t * (3 - 2 * t);
      point[2] =
        frontDepth +
        (Math.min(frontDepth - 0.004, domeDepth) - frontDepth) * blend;
    }
  }
  worldSurface(
    parts,
    rearVertices.map((point) => fromReference(point)),
    rearFaces,
    (i, face) => {
      const center = face.map((index) => rearVertices[index]);
      const x = center.reduce((sum, point) => sum + point[0], 0) / 3;
      const y = center.reduce((sum, point) => sum + point[1], 0) / 3;
      return y < 105
        ? '#362b2b'
        : x < 177
          ? '#302727'
          : y > 154
            ? '#282122'
            : '#2d2425';
    },
  );
}
