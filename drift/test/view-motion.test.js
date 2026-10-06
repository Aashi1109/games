import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { createViewMotion } from '../client/view-motion.js';
import { createWeapon } from '../client/arena.js';
import { createPlayer, stepPlayer, STEP, EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../shared/simulation.js';
import { BOXES } from '../shared/world.js';
import { loadTestGameModels } from './helpers/game-models.js';

await loadTestGameModels();

const rates = [30, 60, 144];
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const fixture = () => ({ ...createPlayer('view', 'View'), x: -27, y: 0, z: 5, yaw: 0 });
const control = (extra = {}) => ({ forward: 0, strafe: 0, yaw: 0, pitch: 0, ...extra });

test('Air Juke banks toward the burst without changing aim or leaving camera motion after release', () => {
  const player = { ...fixture(), classId: 'scout', abilityTime: .09, dashX: 1, dashZ: 0 };
  const view = createViewMotion(); view.reset(player);
  const right = { ...view.sample(player, 1, 1 / 60, true) };
  assert.ok(right.roll < -.01 && right.roll > -.05);
  assert.ok(right.powerFov > 0 && right.powerFov <= 5);
  player.dashX = -1;
  assert.ok(view.sample(player, 1, 1 / 60, true).roll > .01);
  for (const [motion, aiming] of [[false, false], [true, true]]) {
    const quiet = view.sample(player, 1, 1 / 60, motion, aiming);
    close(quiet.roll, 0); close(quiet.powerFov, 0);
  }
  player.abilityTime = 0;
  const after = view.sample(player, 1, 1 / 60, true);
  close(after.roll, 0); close(after.powerFov, 0);
});

function renderFrames(player, view, rate, seconds, input, motion = false) {
  let accumulator = 0;
  const frames = [];
  for (let frame = 0; frame < Math.round(rate * seconds); frame++) {
    accumulator += 1 / rate;
    while (accumulator + 1e-12 >= STEP) {
      view.beforeStep(player);
      stepPlayer(player, input, STEP);
      view.afterStep(player);
      accumulator -= STEP;
    }
    frames.push({ ...view.sample(player, accumulator / STEP, 1 / rate, motion) });
  }
  return frames;
}

test('slide stance eases down and back up without a one-frame height snap at 30/60/144Hz', () => {
  for (const rate of rates) {
    const player = fixture(); const view = createViewMotion();
    for (let tick = 0; tick < 30; tick++) stepPlayer(player, control({ forward: 1, sprint: true }));
    view.reset(player);
    const down = renderFrames(player, view, rate, 1, control({ forward: 1, sprint: true, crouch: true }));
    assert.equal(player.sliding, true, 'fixture should exercise a real slide');
    const up = renderFrames(player, view, rate, 1, control());
    let previousY = EYE_HEIGHT;
    for (const frame of down) {
      assert.ok(frame.y <= previousY + 1e-9, 'stance lowering must be monotonic');
      assert.ok(previousY - frame.y < 7.2 / rate + 1e-9, `${rate}Hz dropped the view too far in one frame`);
      assert.ok(frame.y >= CROUCH_EYE_HEIGHT);
      previousY = frame.y;
    }
    close(down.at(-1).y, CROUCH_EYE_HEIGHT, 0.001);
    for (const frame of up) {
      assert.ok(frame.y >= previousY - 0.000001, 'stance recovery must be monotonic after the remaining crouch interpolation');
      assert.ok(frame.y - previousY < 7.2 / rate + 1e-9, `${rate}Hz raised the view too far in one frame`);
      assert.ok(frame.y <= EYE_HEIGHT);
      previousY = frame.y;
    }
    close(up.at(-1).y, EYE_HEIGHT, 0.001);
  }
});

test('rendered position moves every display frame between fixed simulation ticks', () => {
  for (const rate of rates) {
    const player = fixture(); const view = createViewMotion();
    player.vx = 3; player.vz = -7; view.reset(player);
    let accumulator = 0; let previous;
    for (let frame = 0; frame < rate; frame++) {
      accumulator += 1 / rate;
      while (accumulator + 1e-12 >= STEP) {
        view.beforeStep(player); player.x += player.vx * STEP; player.z += player.vz * STEP;
        view.afterStep(player); accumulator -= STEP;
      }
      const sample = { ...view.sample(player, accumulator / STEP, 1 / rate, false) };
      if (frame > 3) {
        close(sample.x - previous.x, 3 / rate);
        close(sample.z - previous.z, -7 / rate);
      }
      previous = sample;
    }
  }
});

test('reconciliation preserves interpolated camera continuity with the existing error offset', () => {
  const player = fixture(); const view = createViewMotion(); view.reset(player);
  view.beforeStep(player); player.x += 0.1; player.z -= 0.2; view.afterStep(player);
  const old = { ...player };
  const before = { ...view.sample(player, 0.4, 0, false) };
  player.x += 0.4; player.y += 0.1; player.z -= 0.6; player.eyeHeight -= 0.2;
  view.reconcile(old, player);
  const correction = { x: old.x - player.x, y: old.y - player.y + old.eyeHeight - player.eyeHeight, z: old.z - player.z };
  const after = view.sample(player, 0.4, 0, false, false, correction);
  for (const axis of ['x', 'y', 'z']) close(after[axis], before[axis]);
});

test('mantling raises the view smoothly without an initial downward interpolation glitch', () => {
  for (const rate of rates) {
    const player = fixture(); const view = createViewMotion(); view.reset(player);
    view.beforeStep(player); player.y = 1; view.afterStep(player);
    let previousY = EYE_HEIGHT;
    for (let frame = 0; frame < rate; frame++) {
      const sample = view.sample(player, 0, 1 / rate, false);
      assert.ok(sample.y >= previousY, 'the first mantle frame must rise, never dip');
      assert.ok(sample.y - previousY < 16 / rate, 'a step should ease rather than teleport');
      assert.ok(sample.y <= 1 + EYE_HEIGHT);
      previousY = sample.y;
    }
    close(previousY, 1 + EYE_HEIGHT, 0.00001);
  }
});

test('reset clears step, landing, slide and bob presentation state on respawn', () => {
  const player = fixture(); const view = createViewMotion(); view.reset(player);
  player.grounded = false; player.vy = -10; view.beforeStep(player);
  player.grounded = true; player.y = 1; player.sliding = true; player.vx = 10; view.afterStep(player);
  view.sample(player, 0.5, 1 / 60, true);
  const respawn = fixture(); respawn.x = 23; respawn.z = -15;
  view.reset(respawn);
  const actual = { ...view.sample(respawn, 0.3, 0, true) };
  const fresh = createViewMotion(); fresh.reset(respawn);
  assert.deepEqual(actual, { ...fresh.sample(respawn, 0.3, 0, true) });
  view.reset(null);
  assert.deepEqual({ ...view.sample(respawn, 0.3, 0, true) }, actual);
});

test('reduced motion removes bob, landing dip and roll while preserving stance interpolation', () => {
  const player = fixture(); const view = createViewMotion(); view.reset(player);
  player.grounded = false; player.vy = -12; view.beforeStep(player);
  player.grounded = true; player.sliding = true; player.vx = 10; player.eyeHeight = 1.4; view.afterStep(player);
  const animated = { ...view.sample(player, 0.5, 1 / 60, true) };
  assert.ok(animated.roll < 0);
  const reduced = view.sample(player, 0.5, 1 / 60, false);
  close(reduced.y, 1.5);
  close(reduced.roll, 0); assert.equal(reduced.moving, 0); assert.equal(reduced.slide, 0);
});

test('weapon aim, slide and reload transitions are continuous and consistent across display rates', () => {
  for (const setting of ['aiming', 'sliding', 'reloading']) {
    const finalPoses = [];
    for (const rate of rates) {
      const camera = new PerspectiveCamera(); const weapon = createWeapon(camera);
      weapon.update({ delta: 0 });
      const startPosition = weapon.group.position.clone(); const startRotation = weapon.group.rotation.clone();
      const snapshot = () => [...weapon.group.position.toArray(), ...weapon.group.rotation.toArray().slice(0, 3)];
      for (let frame = 0; frame < rate / 2; frame++) {
        weapon.update({ delta: 1 / rate, [setting]: true });
        if (frame === 0) {
          assert.ok(weapon.group.position.distanceTo(startPosition) < 0.1, `${setting} moved too far on entry`);
          assert.ok(Math.abs(weapon.group.rotation.z - startRotation.z) < 0.16, `${setting} rotated too far on entry`);
        }
      }
      finalPoses.push(snapshot());
      for (let frame = 0; frame < rate; frame++) weapon.update({ delta: 1 / rate });
      assert.ok(weapon.group.position.distanceTo(startPosition) < 0.000001, `${setting} did not settle after release`);
      weapon.dispose(); assert.equal(camera.children.length, 0);
    }
    finalPoses.forEach((pose) => pose.forEach((value, index) => close(value, finalPoses[0][index])));
  }
});


test('smoothed view stays below low cover and above the player floor', () => {
  const player = fixture(); const view = createViewMotion(); view.reset(player);
  const ceiling = { x: player.x, y: 1.25, z: player.z, w: 4, h: 1, d: 4, style: 'cover' };
  BOXES.push(ceiling);
  try {
    assert.ok(view.sample(player, 0.5, 1 / 144, false).y <= ceiling.y - 0.08 + 1e-9);
    assert.ok(view.sample(player, 0.5, 1 / 144, false, false, { x: 0, y: 0.5, z: 0 }).y <= ceiling.y - 0.08 + 1e-9, 'reconciliation must not move the camera through cover');
  } finally { BOXES.splice(BOXES.indexOf(ceiling), 1); }
  view.beforeStep(player); player.y = 1.3; view.afterStep(player);
  assert.ok(view.sample(player, 0, 1 / 144, false).y >= player.y + 0.1);
});
