import * as THREE from 'three';

const EPSILON = 1e-6;

function bounds(box) {
  return [
    [box.x - box.w / 2, box.x + box.w / 2],
    [box.y, box.y + box.h],
    [box.z - box.d / 2, box.z + box.d / 2],
  ];
}

// Rectangles are [uMin, vMin, uMax, vMax]. The four remaining strips
// never overlap, including when several neighboring cuts intersect.
function subtract(rectangle, cut) {
  const left = Math.max(rectangle[0], cut[0]);
  const bottom = Math.max(rectangle[1], cut[1]);
  const right = Math.min(rectangle[2], cut[2]);
  const top = Math.min(rectangle[3], cut[3]);
  if (right - left <= EPSILON || top - bottom <= EPSILON) return [rectangle];
  const remaining = [];
  if (left - rectangle[0] > EPSILON) remaining.push([rectangle[0], rectangle[1], left, rectangle[3]]);
  if (rectangle[2] - right > EPSILON) remaining.push([right, rectangle[1], rectangle[2], rectangle[3]]);
  if (bottom - rectangle[1] > EPSILON) remaining.push([left, rectangle[1], right, bottom]);
  if (rectangle[3] - top > EPSILON) remaining.push([left, top, right, rectangle[3]]);
  return remaining;
}

/** Exposed box faces in world coordinates; collision boxes are never modified. */
export function createBoxSurfaceGeometry(boxes, index) {
  const allBounds = boxes.map(bounds);
  const box = allBounds[index];
  const positions = [], normals = [];
  for (let axis = 0; axis < 3; axis++) {
    // These cyclic axes have u × v pointing along the positive face normal.
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const direction of [-1, 1]) {
      const boundary = direction > 0 ? 1 : 0;
      const plane = box[axis][boundary];
      let rectangles = [[box[u][0], box[v][0], box[u][1], box[v][1]]];
      for (let neighborIndex = 0; neighborIndex < boxes.length && rectangles.length; neighborIndex++) {
        if (neighborIndex === index) continue;
        const neighbor = allBounds[neighborIndex];
        const outwardSolid = direction > 0
          ? neighbor[axis][0] <= plane + EPSILON && neighbor[axis][1] > plane + EPSILON
          : neighbor[axis][1] >= plane - EPSILON && neighbor[axis][0] < plane - EPSILON;
        const earlierCoplanarFace = neighborIndex < index
          && Math.abs(neighbor[axis][boundary] - plane) <= EPSILON;
        if (!outwardSolid && !earlierCoplanarFace) continue;
        const cut = [neighbor[u][0], neighbor[v][0], neighbor[u][1], neighbor[v][1]];
        rectangles = rectangles.flatMap((rectangle) => subtract(rectangle, cut));
      }
      const normal = [0, 0, 0];
      normal[axis] = direction;
      for (const [uMin, vMin, uMax, vMax] of rectangles) {
        const corners = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]].map(([a, b]) => {
          const point = [0, 0, 0];
          point[axis] = plane; point[u] = a; point[v] = b;
          return point;
        });
        const winding = direction > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const vertex of winding) {
          positions.push(...corners[vertex]);
          normals.push(...normal);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
