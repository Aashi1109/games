import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createShotEffects } from '../client/shot-effects.ts';

function fixture(t) {
  const originalDocument = globalThis.document;
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { globalThis.document = originalDocument; });
  const scene = new Scene(), camera = new PerspectiveCamera(85, 16 / 9, .05, 220);
  camera.position.set(0, 1.6, 0);
  const effects = createShotEffects(scene, camera, { viewportHeight: () => 720 });
  const root = scene.getObjectByName('shot-effects');
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; effects.dispose(); } };
  t.after(dispose);
  return { scene, camera, effects, root, dispose };
}

const streaks = (root) => root.children.filter((object) => object.isGroup);
const activeStreaks = (root) => streaks(root).filter((object) => object.visible);
const shot = (to, extra = {}) => ({ type: 'shot', id: 'shooter', from: { x: 0, y: 1.6, z: 0 }, to, ...extra });

// Measure rendered geometry, including glow, along its intended visual path.
function bounds(streak, start, end) {
  const direction = new Vector3().copy(end).sub(start).normalize();
  const point = new Vector3(), radial = new Vector3();
  let near = Infinity, far = -Infinity, radius = 0;
  streak.updateWorldMatrix(true, true);
  streak.traverse((part) => {
    if (!part.isMesh) return;
    const positions = part.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(part.matrixWorld).sub(start);
      assert.ok(point.toArray().every(Number.isFinite));
      const distance = point.dot(direction);
      near = Math.min(near, distance); far = Math.max(far, distance);
      radius = Math.max(radius, radial.copy(point).addScaledVector(direction, -distance).length());
    }
  });
  return { near, far, length: far - near, radius, center: (near + far) / 2 };
}

function assertClipped(streak, start, end) {
  const measured = bounds(streak, start, end);
  assert.ok(measured.near >= -1e-6, 'streak must not extend behind its visual start');
  assert.ok(measured.far <= new Vector3().copy(end).distanceTo(start) + 1e-6, 'streak must not pass through its hit point');
  assert.ok(measured.length > 0 && measured.length <= .45 + 1e-6, `visible streak is ${measured.length}m long`);
  return measured;
}

test('short and long shots render thin bounded streaks instead of full-path rods', (t) => {
  const { effects, root } = fixture(t);
  for (const to of [{ x: 0, y: 1.6, z: -.04 }, { x: 0, y: 1.6, z: -.5 }, { x: 3, y: 5.6, z: 0 }, { x: 0, y: 1.6, z: -160 }]) {
    effects.clear();
    const event = shot(to);
    effects.shoot(event);
    assert.equal(activeStreaks(root).length, 1);
    assertClipped(activeStreaks(root)[0], event.from, event.to);
    effects.update(1 / 144);
    for (const streak of activeStreaks(root)) assertClipped(streak, event.from, event.to);
  }
  effects.clear();
  effects.shoot(shot({ x: 0, y: 1.6, z: 0 }));
  assert.equal(activeStreaks(root).length, 0, 'a zero-length shot cannot create invalid geometry');
});

test('muzzle offsets stay on the muzzle-to-hit path and fall back before a point-blank wall', (t) => {
  const { effects, root } = fixture(t);
  const origin = new Vector3(.2, 1.3, -.65);
  const long = shot({ x: -2, y: 2, z: -80 });
  effects.shoot(long, { origin });
  const first = assertClipped(activeStreaks(root)[0], origin, long.to);
  assert.ok(first.near < .001, 'a distant shot should visibly start at the actual muzzle');
  effects.update(.03);
  const advanced = assertClipped(activeStreaks(root)[0], origin, long.to);
  assert.ok(advanced.center > first.center);
  effects.clear();
  const close = shot({ x: 0, y: 1.6, z: -.18 });
  effects.shoot(close, { origin });
  assertClipped(activeStreaks(root)[0], close.from, close.to);
  effects.update(.15);
  assert.equal(activeStreaks(root).length, 0, 'a nearby hit cannot leave a lingering muzzle-to-wall rod');
});

test('streaks advance consistently across frame rates and expire within 140ms', (t) => {
  const { effects, root } = fixture(t);
  const event = shot({ x: 0, y: 1.6, z: -100 });
  const centers = [];
  for (const rate of [30, 60, 144]) {
    effects.clear(); effects.shoot(event);
    const streak = activeStreaks(root)[0];
    let previous = assertClipped(streak, event.from, event.to).center;
    let elapsed = 0;
    while (elapsed < .06 - 1e-9) {
      const delta = Math.min(1 / rate, .06 - elapsed);
      effects.update(delta); elapsed += delta;
      assert.equal(streak.visible, true, 'a long shot should travel for more than one frame');
      const measured = assertClipped(streak, event.from, event.to);
      assert.ok(measured.center > previous, 'the visible streak must advance toward the hit');
      previous = measured.center;
    }
    centers.push(previous);
    while (elapsed < .14 - 1e-9) {
      const delta = Math.min(1 / rate, .14 - elapsed);
      effects.update(delta); elapsed += delta;
      if (streak.visible) assertClipped(streak, event.from, event.to);
    }
    assert.equal(streak.visible, false, `${rate}Hz leaves a tracer visible beyond 140ms`);
  }
  for (const center of centers) assert.ok(Math.abs(center - centers[0]) < 1e-6, 'travel cannot depend on frame rate');
});

test('nearby shots survive multiple render frames instead of expiring before they can be drawn', (t) => {
  const { effects, root } = fixture(t);
  for (const rate of [30, 60, 144]) for (const distance of [.04, .5, 4, 8, 18]) {
    effects.clear(); const event = shot({ x: 0, y: 1.6, z: -distance }); effects.shoot(event);
    for (let frame = 0; frame < 2; frame++) {
      // main.js advances effects before renderer.render, including new shots.
      effects.update(1 / rate);
      const [streak] = activeStreaks(root);
      assert.ok(streak, `${distance}m shot disappeared at ${rate}Hz frame ${frame + 1}`);
      assertClipped(streak, event.from, event.to);
    }
    effects.update(.15); assert.equal(activeStreaks(root).length, 0);
  }
});

test('distant tracers retain a small readable pixel width in hipfire and ADS without becoming beams', (t) => {
  const { effects, root, camera } = fixture(t);
  for (const fov of [85, 55, 30]) for (const distance of [4, 18, 80, 160]) {
    camera.fov = fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    effects.clear(); effects.shoot(shot({ x: 0, y: 1.6, z: -distance })); effects.update(.04);
    const [streak] = activeStreaks(root); assert.ok(streak);
    const center = streak.getWorldPosition(new Vector3());
    const edge = center.clone().add(new Vector3(streak.scale.x, 0, 0)).project(camera);
    const projected = center.clone().project(camera);
    const pixels = Math.abs(edge.x - projected.x) * 1280;
    assert.ok(pixels >= 2.8 && pixels <= 4.5, `${distance}m/FOV${fov} tracer diameter ${pixels.toFixed(2)}px`);
    assert.ok(streak.children[1].material.opacity >= .9, 'the bright core should persist through the readable part of flight');
  }
});

test('tracer suppression keeps immediate impact feedback and never changes the shot result', (t) => {
  const { effects, root } = fixture(t);
  const event = Object.freeze({ ...shot(Object.freeze({ x: 0, y: 1.6, z: -4 })), from: Object.freeze({ x: 0, y: 1.6, z: 0 }), surface: Object.freeze({ normal: Object.freeze({ x: 0, y: 0, z: 1 }), style: 'stone' }), hit: 'target' });
  const before = JSON.stringify(event);
  effects.shoot(event, { tracer: false });
  assert.equal(activeStreaks(root).length, 0);
  assert.ok(root.children.some((object) => object.isMesh && object.visible), 'impacts must appear immediately even without a tracer');
  effects.update(.02);
  assert.equal(JSON.stringify(event), before, 'visual effects cannot mutate authoritative hits');
});

test('sustained fire reuses fixed pools, clears all effects and releases owned GPU resources', (t) => {
  const { effects, root, scene, dispose } = fixture(t);
  const objects = [], resources = new Set(), bindings = [];
  root.traverse((object) => {
    objects.push(object);
    if (object.geometry) resources.add(object.geometry);
    if (object.material) {
      resources.add(object.material);
      if (object.material.map) resources.add(object.material.map);
      bindings.push([object, object.geometry, object.material, object.material.map]);
    }
  });
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
  const event = shot({ x: 0, y: 1.6, z: -40 }, { surface: { normal: { x: 0, y: 0, z: 1 }, style: 'stone' } });
  for (let count = 0; count < 400; count++) { effects.shoot(event); effects.update(.001); }
  const after = []; root.traverse((object) => after.push(object));
  assert.deepEqual(after, objects, 'firing may reuse objects but must not grow the pool');
  for (const [object, geometry, material, map] of bindings) {
    assert.equal(object.geometry, geometry);
    assert.equal(object.material, material);
    assert.equal(object.material.map, map);
  }
  assert.ok(activeStreaks(root).length > 0 && activeStreaks(root).length <= streaks(root).length);
  for (const streak of activeStreaks(root)) assertClipped(streak, event.from, event.to);
  assert.equal(disposed.size, 0, 'live effects retain their shared resources');
  effects.clear();
  assert.ok(root.children.every((object) => !object.visible));
  effects.update(.05);
  assert.ok(root.children.every((object) => !object.visible), 'cleared slots must not revive during an update');
  effects.shoot(event);
  assert.equal(activeStreaks(root).length, 1, 'the cleared pool can be reused for the next round');
  dispose();
  assert.equal(scene.getObjectByName('shot-effects'), undefined);
  for (const resource of resources) assert.equal(disposed.get(resource), 1, 'each owned resource is released once');
});
