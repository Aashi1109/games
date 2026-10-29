import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createBoxSurfaceGeometry } from '../client/box-surfaces.ts';
import { MAPS } from '../shared/world.ts';

const cube = (x = 0, y = 0, z = 0, size = 2) => ({ x, y, z, w: size, h: size, d: size });
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function triangles(geometry, owner = 0) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  assert.equal(position.count, normal.count);
  assert.ok(position.array.every(Number.isFinite));
  assert.ok(normal.array.every(Number.isFinite));
  const result = [];
  const count = geometry.index?.count ?? position.count;
  for (let index = 0; index < count; index += 3) {
    const ids = [index, index + 1, index + 2].map((vertex) => geometry.index ? geometry.index.getX(vertex) : vertex);
    const points = ids.map((vertex) => new Vector3().fromBufferAttribute(position, vertex));
    const n = new Vector3().fromBufferAttribute(normal, ids[0]);
    const cross = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    close(n.length(), 1);
    assert.ok(cross.dot(n) > 0, 'triangles must have nonzero area and outward winding');
    ids.forEach((vertex) => assert.deepEqual(new Vector3().fromBufferAttribute(normal, vertex), n));
    const axis = n.toArray().findIndex((value) => value !== 0);
    assert.equal(Math.abs(n.getComponent(axis)), 1, 'box normals must stay axis-aligned');
    const plane = points[0].getComponent(axis);
    points.forEach((point) => close(point.getComponent(axis), plane));
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const polygon = points.map((point) => [point.getComponent(u), point.getComponent(v)]);
    result.push({ owner, axis, direction: n.getComponent(axis), plane, polygon, area: cross.length() / 2,
      bounds: [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1])),
        Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))] });
  }
  return result;
}

function surfaces(boxes) {
  return boxes.flatMap((_, index) => {
    const geometry = createBoxSurfaceGeometry(boxes, index);
    const result = triangles(geometry, index);
    geometry.dispose();
    return result;
  });
}

const area = (faces) => faces.reduce((sum, face) => sum + face.area, 0);
const onPlane = (faces, axis, direction, plane) => faces.filter((face) => face.axis === axis
  && face.direction === direction && Math.abs(face.plane - plane) < 1e-6);
const signedArea = (polygon) => polygon.reduce((sum, point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2;

// An independent triangle/polygon intersection check catches overlapping output
// without assuming how the implementation splits or triangulates rectangles.
function intersectionArea(subject, clip) {
  let polygon = subject;
  const direction = Math.sign(signedArea(clip));
  for (let edge = 0; edge < clip.length && polygon.length; edge++) {
    const a = clip[edge], b = clip[(edge + 1) % clip.length];
    const distance = (point) => direction * ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]));
    const output = [];
    for (let index = 0; index < polygon.length; index++) {
      const current = polygon[index], previous = polygon[(index + polygon.length - 1) % polygon.length];
      const currentDistance = distance(current), previousDistance = distance(previous);
      if ((currentDistance >= 0) !== (previousDistance >= 0)) {
        const t = previousDistance / (previousDistance - currentDistance);
        output.push([previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t]);
      }
      if (currentDistance >= 0) output.push(current);
    }
    polygon = output;
  }
  return Math.abs(signedArea(polygon));
}

function assertNoCoplanarOverlap(faces) {
  const planes = new Map();
  for (const face of faces) {
    const key = `${face.axis}/${face.direction}/${face.plane.toFixed(5)}`;
    if (!planes.has(key)) planes.set(key, []);
    const existing = planes.get(key);
    for (const other of existing) {
      const a = face.bounds, b = other.bounds;
      if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) <= 1e-7
        || Math.min(a[3], b[3]) - Math.max(a[1], b[1]) <= 1e-7) continue;
      assert.ok(intersectionArea(face.polygon, other.polygon) < 1e-7,
        `owners ${face.owner}/${other.owner} overlap on plane ${key}`);
    }
    existing.push(face);
  }
}

test('a single box retains world bounds, surface area and outward normals', () => {
  const boxes = Object.freeze([Object.freeze({ x: 2, y: 3, z: -5, w: 2, h: 3, d: 4 })]);
  const geometry = createBoxSurfaceGeometry(boxes, 0);
  geometry.computeBoundingBox();
  assert.deepEqual(geometry.boundingBox.min.toArray(), [1, 3, -7]);
  assert.deepEqual(geometry.boundingBox.max.toArray(), [3, 6, -3]);
  close(area(triangles(geometry)), 52);
  geometry.dispose();
});

test('adjacent boxes omit both interior faces and preserve the union surface', () => {
  const faces = surfaces([cube(), cube(2)]);
  close(area(faces), 40);
  assert.equal(faces.filter((face) => face.axis === 0 && face.plane === 1).length, 0);
  assertNoCoplanarOverlap(faces);
});

test('overlapping coplanar faces have stable ownership and no double-drawn area', () => {
  const faces = surfaces([cube(), cube(1)]);
  close(area(faces), 32);
  close(area(onPlane(faces.filter((face) => face.owner === 0), 1, 1, 2)), 4);
  close(area(onPlane(faces.filter((face) => face.owner === 1), 1, 1, 2)), 2);
  assertNoCoplanarOverlap(faces);
});

test('a partial neighbor removes only its covered rectangle, retaining every exposed strip', () => {
  const faces = surfaces([{ x: 0, y: 0, z: 0, w: 4, h: 4, d: 1 }, cube(0, 1, 1.5)]);
  const front = onPlane(faces.filter((face) => face.owner === 0), 2, 1, 0.5);
  close(area(front), 12);
  assertNoCoplanarOverlap(faces);
});

test('nested and identical solids emit only their union boundary, including shared outer planes', () => {
  const outer = cube(0, 0, 0, 4), inner = cube(0, 1);
  for (const boxes of [[outer, inner], [inner, outer]]) {
    const faces = surfaces(boxes);
    close(area(faces), 96);
    assert.equal(faces.filter((face) => face.owner === boxes.indexOf(inner)).length, 0);
  }
  const identical = surfaces([cube(), cube(), cube()]);
  close(area(identical), 24);
  assert.ok(identical.every((face) => face.owner === 0));
  const touching = surfaces([cube(0, 2), outer]);
  close(area(touching), 96);
  assertNoCoplanarOverlap(touching);
});

test('real gaps retain both facing surfaces', () => {
  for (const gap of [0.025, 0.00001]) {
    const faces = surfaces([cube(), cube(2 + gap)]);
    close(area(faces), 48, 1e-5);
    close(area(onPlane(faces, 0, 1, 1)), 4);
    close(area(onPlane(faces, 0, -1, 1 + gap)), 4);
  }
});

for (const map of Object.values(MAPS)) {
  test(`${map.id}: render surfaces are finite, non-overlapping and preserve collision data and world bounds`, () => {
    const original = JSON.stringify(map.boxes);
    const expected = new Box3(), actual = new Box3();
    const allFaces = [];
    map.boxes.forEach((box, index) => {
      expected.expandByPoint(new Vector3(box.x - box.w / 2, box.y, box.z - box.d / 2));
      expected.expandByPoint(new Vector3(box.x + box.w / 2, box.y + box.h, box.z + box.d / 2));
      const geometry = createBoxSurfaceGeometry(map.boxes, index);
      geometry.computeBoundingBox();
      actual.union(geometry.boundingBox);
      allFaces.push(...triangles(geometry, index));
      geometry.dispose();
    });
    assertNoCoplanarOverlap(allFaces);
    assert.equal(JSON.stringify(map.boxes), original);
    actual.min.toArray().forEach((value, index) => close(value, expected.min.getComponent(index), 1e-5));
    actual.max.toArray().forEach((value, index) => close(value, expected.max.getComponent(index), 1e-5));
  });
}
