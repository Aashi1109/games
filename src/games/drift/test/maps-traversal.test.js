import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, traceShot, getNearbyRope, STEP, PLAYER_HEIGHT, RADIUS } from '../shared/simulation.ts';
import { MAPS, DEFAULT_MAP, getMap, isMapId } from '../shared/world.ts';

const control = (extra = {}) => ({ yaw: 0, pitch: 0, ...extra });
const fixture = (extra = {}) => ({
  id: 'fixture', size: 64,
  spawns: [{ x: 0, y: 0, z: 0, yaw: 0 }],
  boxes: [{ x: 0, y: -1, z: 0, w: 64, h: 1, d: 64, style: 'floor' }],
  pads: [], targets: [],
  ropes: [{ id: 'line', from: { x: 0, y: 0, z: 0 }, to: { x: 20, y: 0, z: 0 }, speed: 10 }],
  ...extra,
});
const player = (map, pose = {}) => Object.assign(createPlayer('p', 'Pilot', 0, 'assault', map), pose);
const tick = (p, map, input = {}, count = 1) => {
  for (let i = 0; i < count; i++) stepPlayer(p, control(input), STEP, map);
};
const overlaps = (p, box) => p.x + RADIUS > box.x - box.w / 2 && p.x - RADIUS < box.x + box.w / 2
  && p.z + RADIUS > box.z - box.d / 2 && p.z - RADIUS < box.z + box.d / 2
  && p.y + PLAYER_HEIGHT > box.y + 0.0001 && p.y < box.y + box.h - 0.0001;

test('map IDs are explicit and every map has clear, stable spawns', () => {
  assert.equal(getMap().id, DEFAULT_MAP);
  assert.ok(Object.keys(MAPS).length >= 3);
  for (const value of ['__proto__', 'constructor', 'toString', '', null, undefined, {}, ['solstice']]) {
    assert.equal(isMapId(value), false);
    assert.equal(getMap(value).id, DEFAULT_MAP);
  }
  for (const map of Object.values(MAPS)) {
    assert.equal(isMapId(map.id), true);
    assert.equal(getMap(map.id), map);
    assert.ok(map.spawns.length >= 4);
    for (let index = 0; index < map.spawns.length; index++) {
      const p = createPlayer('p', 'Pilot', index, 'scout', map);
      assert.equal(p.x, map.spawns[index].x);
      assert.equal(p.y, map.spawns[index].y);
      assert.equal(p.z, map.spawns[index].z);
      assert.equal(map.boxes.some((box) => overlaps(p, box)), false, `${map.id} spawn ${index} intersects geometry`);
      tick(p, map, {}, 60);
      assert.equal(p.y, map.spawns[index].y, `${map.id} spawn ${index} must rest on solid ground`);
      assert.equal(p.grounded, true);
    }
    assert.deepEqual(createPlayer('p', 'Pilot', -1, 'assault', map), createPlayer('p', 'Pilot', map.spawns.length - 1, 'assault', map));
  }
});

test('collision, bounds, pads, targets, and shot obstruction use the supplied map', () => {
  const empty = fixture({ size: 20, ropes: [] });
  const wall = { x: 0, y: 0, z: -4, w: 10, h: 4, d: 0.5, style: 'wall' };
  const covered = fixture({ ...empty, boxes: [...empty.boxes, wall] });
  const a = player(empty); const b = player(covered);
  tick(a, empty, { forward: 1, sprint: true }, 120);
  tick(b, covered, { forward: 1, sprint: true }, 120);
  assert.equal(a.z, -empty.size / 2 + RADIUS);
  assert.ok(b.z >= -3.4, 'the active map wall must block movement');
  const shooter = player(empty);
  const victim = player(empty, { id: 'victim', z: -8 });
  assert.equal(traceShot(shooter, [victim], empty).hit, 'victim');
  assert.equal(traceShot(shooter, [victim], covered).hit, undefined);
  assert.equal(traceShot(shooter, [victim], covered).surface.style, 'wall');
  const targetMap = fixture({ ...empty, targets: [{ id: 'local-target', x: 0, y: 0, z: -3 }] });
  assert.equal(traceShot(shooter, [], targetMap).hit, 'local-target');
  assert.equal(traceShot(shooter, [], empty).hit, undefined);
  const padMap = fixture({ ...empty, pads: [{ x: 0, y: 0, z: 0, radius: 1, vx: 3, vy: 16, vz: 0 }] });
  const launched = player(padMap); const resting = player(empty);
  tick(launched, padMap); tick(resting, empty);
  assert.ok(launched.vy > 15); assert.equal(resting.vy, 0);
});

test('every authored zipline and ascender can complete its full route in both directions', () => {
  for (const map of Object.values(MAPS)) for (const rope of map.ropes) {
    // Isolate pickup from adjacent ropes that share a station, keeping all map solids.
    const routeMap = { ...map, ropes: [rope] };
    for (const direction of [1, -1]) {
      const start = direction === 1 ? rope.from : rope.to;
      const end = direction === 1 ? rope.to : rope.from;
      const p = player(routeMap, start);
      tick(p, routeMap, { interact: true });
      assert.equal(p.ropeId, rope.id, `${rope.id} cannot be boarded at ${direction === 1 ? 'start' : 'end'}`);
      for (let ticks = 0; p.ropeId && ticks < 1000; ticks++) {
        tick(p, routeMap, { interact: true });
        assert.equal(map.boxes.some((box) => overlaps(p, box)), false, `${rope.id} intersects geometry`);
      }
      assert.equal(p.ropeId, null, `${rope.id} never finished`);
      assert.ok(Math.hypot(p.x - end.x, p.y - end.y, p.z - end.z) < 0.001, `${rope.id} blocked before reaching endpoint in direction ${direction}`);
    }
  }
});

test('E grabs nearby lines, rides from either end, and requires a fresh press to release', () => {
  const map = fixture();
  const p = player(map, { z: 1.2 });
  assert.equal(getNearbyRope(p, map)?.id, 'line');
  assert.equal(getNearbyRope(player(map, { z: 1.5 }), map), null);
  tick(p, map, { interact: true }, 30);
  assert.equal(p.ropeId, 'line');
  assert.ok(Math.abs(p.x - 5) < 1e-8); assert.equal(p.z, 0);
  tick(p, map); tick(p, map, { interact: true });
  assert.equal(p.ropeId, null); assert.ok(p.ropeCooldown > 0);
  const reverse = player(map, { x: 20 });
  tick(reverse, map, { interact: true }, 30);
  assert.equal(reverse.ropeId, 'line');
  assert.equal(reverse.ropeDirection, -1);
  assert.ok(Math.abs(reverse.x - 15) < 1e-8);
  const middle = player(map, { x: 10 });
  tick(middle, map, { interact: true, yaw: Math.PI / 2 });
  assert.equal(middle.ropeDirection, -1, 'the camera selects direction away from endpoints');
});

test('Space releases with line momentum, cooldown prevents regrabs, and E can reattach after release', () => {
  const map = fixture();
  const p = player(map);
  tick(p, map, { interact: true });
  tick(p, map, { jump: true });
  assert.equal(p.ropeId, null);
  assert.equal(p.vx, 10); assert.ok(p.vy > 8);
  assert.equal(p.jumpBuffer, 0);
  tick(p, map, { interact: true });
  assert.equal(p.ropeId, null);
  assert.equal(getNearbyRope(p, map), null);
  tick(p, map, {}, 30);
  Object.assign(p, { x: 4, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true });
  tick(p, map, { interact: true });
  assert.equal(p.ropeId, 'line');
});

test('vertical ascenders work in both directions and safely release at endpoints', () => {
  const map = fixture({ ropes: [{ id: 'lift', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 8, z: 0 }, speed: 8 }] });
  const up = player(map);
  tick(up, map, { interact: true }, 30);
  assert.equal(up.ropeId, 'lift'); assert.ok(Math.abs(up.y - 4) < 1e-8); assert.equal(up.vy, 8);
  const down = player(map, { y: 8, grounded: false });
  tick(down, map, { interact: true }, 30);
  assert.ok(Math.abs(down.y - 4) < 1e-8); assert.equal(down.vy, -8);
  tick(down, map, { interact: true }, 31);
  assert.equal(down.ropeId, null); assert.ok(down.y >= 0);
  assert.ok(down.ropeCooldown > 0, 'holding E at an endpoint must not immediately reverse');
  tick(up, map, { interact: true }, 31);
  assert.equal(up.ropeId, null); assert.ok(up.y >= 8);
});

test('line snapping and travel cannot pass through solid cover or ceilings', () => {
  const base = fixture();
  const wall = { x: 3, y: 0, z: 0, w: 0.1, h: 5, d: 5, style: 'wall' };
  const blocked = fixture({ boxes: [...base.boxes, wall] });
  const p = player(blocked);
  tick(p, blocked, { interact: true }, 60);
  assert.equal(p.ropeId, null);
  assert.ok(p.x <= 2.6 && p.x > 2, `rope entered the wall at x=${p.x}`);
  const snapMap = fixture({
    boxes: [...base.boxes, { x: 0, y: 0, z: 0.6, w: 6, h: 4, d: 0.1, style: 'wall' }],
  });
  const snap = player(snapMap, { z: 1.2 });
  assert.equal(getNearbyRope(snap, snapMap), null, 'nearby lines behind a wall must not be offered');
  tick(snap, snapMap, { interact: true });
  assert.equal(snap.ropeId, null);
  const ceilingMap = fixture({
    boxes: [...base.boxes, { x: 0, y: 4, z: 0, w: 6, h: 0.1, d: 6, style: 'roof' }],
    ropes: [{ id: 'lift', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 8, z: 0 }, speed: 14 }],
  });
  const lift = player(ceilingMap);
  tick(lift, ceilingMap, { interact: true }, 20);
  assert.equal(lift.ropeId, null); assert.ok(lift.y + PLAYER_HEIGHT <= 4);
  const cornerMap = fixture({
    boxes: [...base.boxes, { x: 2.3, y: 0, z: 1.6, w: 0.01, h: 4, d: 0.01, style: 'wall' }],
    ropes: [{ id: 'fast', from: { x: 0, y: 0, z: 0 }, to: { x: 10, y: 0, z: 10 }, speed: 200 }],
  });
  const corner = player(cornerMap);
  tick(corner, cornerMap, { interact: true });
  assert.equal(corner.ropeId, null, 'swept collision must catch a thin diagonal corner between ticks');
  assert.equal(corner.x, 0); assert.equal(corner.z, 0);
});

test('weapons stay active on ropes and death stops traversal', () => {
  const map = fixture(); const p = player(map);
  tick(p, map, { interact: true, fire: true });
  assert.equal(p.ropeId, 'line'); assert.equal(p.fired, true); assert.equal(p.ammo, 23);
  tick(p, map, { reload: true }); assert.ok(p.reloadIn > 0);
  p.health = 0;
  const { x, y, z } = p;
  tick(p, map, { interact: true, jump: true, fire: true }, 30);
  assert.deepEqual({ x: p.x, y: p.y, z: p.z }, { x, y, z });
  assert.equal(p.fired, false); assert.equal(getNearbyRope(p, map), null);
});

test('rope state survives JSON snapshots and command replay exactly', () => {
  const map = fixture({ ropes: [{ id: 'slope', from: { x: 0, y: 0, z: 0 }, to: { x: 20, y: 5, z: 0 }, speed: 12 }] });
  const authoritative = player(map);
  tick(authoritative, map, { interact: true }, 12);
  const predicted = JSON.parse(JSON.stringify(authoritative));
  assert.equal(predicted.ropeId, 'slope'); assert.equal(predicted.interactHeld, true);
  for (let seq = 0; seq < 100; seq++) {
    const input = control({ seq, forward: seq > 10 ? 1 : 0, interact: seq < 5, jump: seq === 30, fire: seq % 4 === 0, crouch: seq > 80 });
    stepPlayer(authoritative, input, STEP, map); stepPlayer(predicted, input, STEP, map);
    assert.deepEqual(predicted, authoritative);
  }
});
