import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotController } from '../server/bots.js';
import { createPlayer, stepPlayer, traceShot, STEP, RADIUS } from '../shared/simulation.js';
import { MAPS } from '../shared/world.js';

function court(boxes = []) {
  return {
    size: 64, boxes: [{ x: 0, y: -1, z: 0, w: 64, h: 1, d: 64 }, ...boxes],
    pads: [], targets: [], ropes: [], spawns: [{ x: 0, y: 0, z: 10, yaw: 0 }],
  };
}
function opponent(map, values = {}) {
  return Object.assign(createPlayer('human', 'Human', 0, 'assault', map), { x: 0, z: -10 }, values);
}

test('bots wait before firing and turn gradually toward an exposed opponent', () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map, { x: 8 });
  const controller = createBotController(map);
  let fired = false;
  for (let tick = 0; tick < 240; tick++) {
    const input = controller.update(player, [player, target]);
    const turn = Math.atan2(Math.sin(input.yaw - player.yaw), Math.cos(input.yaw - player.yaw));
    assert.ok(Math.abs(turn) <= 2.6 * STEP + 1e-9);
    if (tick < 30) assert.equal(input.fire, false, 'reaction delay');
    fired ||= input.fire;
    stepPlayer(player, input, STEP, map);
  }
  assert.equal(fired, true);
});

test('solid cover prevents sensing and firing until the opponent is exposed', () => {
  const wall = { x: 0, y: 0, z: 0, w: 64, h: 5, d: 1 };
  const map = court([wall]);
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map);
  const controller = createBotController(map);
  for (let tick = 0; tick < 120; tick++) {
    const input = controller.update(player, [player, target]);
    assert.equal(input.fire, false);
    // Hold position to isolate perception from path finding.
    player.yaw = input.yaw; player.pitch = input.pitch;
  }
  target.z = 5;
  player.yaw = 0;
  for (let tick = 0; tick < 25; tick++) {
    const input = controller.update(player, [player, target]);
    assert.equal(input.fire, false, 'newly exposed targets get a reaction delay');
    player.yaw = input.yaw; player.pitch = input.pitch;
  }
  let fires = false;
  for (let tick = 0; tick < 100; tick++) {
    const input = controller.update(player, [player, target]);
    fires ||= input.fire;
    player.yaw = input.yaw; player.pitch = input.pitch;
  }
  assert.equal(fires, true);
});

test('bot bullets use ordinary aim error, magazine depletion, and autoreload', () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map);
  const controller = createBotController(map, 1);
  let shots = 0; let hits = 0; let reloads = 0;
  for (let tick = 0; tick < 1500; tick++) {
    const input = controller.update(player, [player, target]);
    const wasReloading = player.reloadIn > 0;
    // Freeze translation, but retain every weapon and aim input.
    stepPlayer(player, { ...input, forward: 0, strafe: 0 }, STEP, map);
    if (!wasReloading && player.reloadIn > 0) reloads++;
    if (player.fired) { shots++; if (traceShot(player, [target], map).hit === target.id) hits++; }
  }
  assert.ok(shots > 24);
  assert.ok(reloads > 0);
  assert.ok(hits > 0 && hits < shots, 'some ordinary raycasts miss');
});

test('sniper bots release their trigger and can fire another bolt shot', () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'sniper', map);
  const target = opponent(map);
  const controller = createBotController(map, 1);
  let shots = 0;
  for (let tick = 0; tick < 420; tick++) {
    stepPlayer(player, { ...controller.update(player, [player, target]), forward: 0, strafe: 0 }, STEP, map);
    if (player.fired) shots++;
  }
  assert.ok(shots >= 3 && shots <= 5);
});

for (const map of Object.values(MAPS)) {
  for (let spawn = 0; spawn < map.spawns.length; spawn++) {
  test(`${map.name} bot patrol from spawn ${spawn + 1} stays finite and makes progress`, () => {
    const player = createPlayer('bot', 'Bot', spawn, 'assault', map);
    const controller = createBotController(map, spawn);
    const start = { x: player.x, z: player.z };
    let maximumTravel = 0;
    for (let tick = 0; tick < 1800; tick++) {
      const input = controller.update(player, [player]);
      assert.ok(Number.isFinite(input.yaw) && Number.isFinite(input.pitch));
      assert.ok(Math.abs(input.forward) <= 1 && Math.abs(input.strafe) <= 1);
      assert.equal(input.fire, false);
      stepPlayer(player, input, STEP, map);
      assert.ok([player.x, player.y, player.z, player.vx, player.vy, player.vz].every(Number.isFinite));
      assert.ok(Math.abs(player.x) <= map.size / 2 - RADIUS + 1e-8);
      assert.ok(Math.abs(player.z) <= map.size / 2 - RADIUS + 1e-8);
      maximumTravel = Math.max(maximumTravel, Math.hypot(player.x - start.x, player.z - start.z));
    }
    assert.ok(maximumTravel > 15, `patrol traveled only ${maximumTravel.toFixed(1)}m`);
  });
  }
}

test('resetting a bot gives its new life a fresh reaction delay', () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map);
  const controller = createBotController(map);
  for (let tick = 0; tick < 120; tick++) controller.update(player, [player, target]);
  controller.reset();
  assert.equal(controller.update(player, [player, target]).fire, false);
});
