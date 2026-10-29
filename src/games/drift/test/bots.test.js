import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotController } from '../server/bots.ts';
import { createPlayer, stepPlayer, traceShot, STEP, RADIUS } from '../shared/simulation.ts';
import { MAPS } from '../shared/world.ts';
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY, getBotDifficulty, normalizeBotDifficulty } from '../shared/bot-difficulty.ts';

function court(boxes = []) {
  return {
    size: 64, boxes: [{ x: 0, y: -1, z: 0, w: 64, h: 1, d: 64 }, ...boxes],
    pads: [], targets: [], ropes: [], spawns: [{ x: 0, y: 0, z: 10, yaw: 0 }],
  };
}
function opponent(map, values = {}) {
  return Object.assign(createPlayer('human', 'Human', 0, 'assault', map), { x: 0, z: -10 }, values);
}

test('difficulty accepts only supported IDs and defaults safely to Easy', () => {
  assert.equal(DEFAULT_BOT_DIFFICULTY, 'easy');
  assert.deepEqual(BOT_DIFFICULTIES.map(({ id }) => id), ['easy', 'normal', 'hard']);
  for (const { id } of BOT_DIFFICULTIES) {
    assert.equal(normalizeBotDifficulty(id), id);
    assert.equal(getBotDifficulty(id).id, id);
  }
  for (const value of [undefined, null, '', 'HARD', 'impossible', '__proto__', 1, {}, ['hard']]) {
    assert.equal(normalizeBotDifficulty(value), 'easy');
    assert.equal(getBotDifficulty(value).id, 'easy');
  }
});

for (const difficulty of BOT_DIFFICULTIES) {
test(`${difficulty.label} bots wait before firing and turn gradually toward an exposed opponent`, () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map, { x: 8 });
  const controller = createBotController(map, 0, difficulty.id);
  let fired = false;
  for (let tick = 0; tick < 240; tick++) {
    const input = controller.update(player, [player, target]);
    const turn = Math.atan2(Math.sin(input.yaw - player.yaw), Math.cos(input.yaw - player.yaw));
    assert.ok(Math.abs(turn) <= difficulty.turnSpeed * STEP + 1e-9);
    if ((tick + 1) * STEP < difficulty.reactionTime) assert.equal(input.fire, false, 'reaction delay');
    fired ||= input.fire;
    stepPlayer(player, input, STEP, map);
  }
  assert.equal(fired, true);
});

test(`${difficulty.label} bots cannot sense or fire through cover and react after exposure`, () => {
  const wall = { x: 0, y: 0, z: 0, w: 64, h: 5, d: 1 };
  const map = court([wall]);
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map);
  const controller = createBotController(map, 0, difficulty.id);
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
}

function shootingTrial(difficulty, classId, moving = false) {
  const map = court();
  const result = { shots: 0, hits: 0, firstShots: [] };
  for (let seed = 0; seed < 4; seed++) {
    const player = createPlayer('bot', 'Bot', 0, classId, map);
    const target = opponent(map);
    const controller = createBotController(map, seed, difficulty);
    let firstShot = null;
    for (let tick = 0; tick < 1800; tick++) {
      if (moving) target.x = 6 * Math.sin(tick * STEP * 1.8);
      const input = controller.update(player, [player, target]);
      // Isolate real weapon timing and aim from movement/power displacement.
      stepPlayer(player, { ...input, forward: 0, strafe: 0, jump: false, ability: false }, STEP, map);
      if (player.fired) {
        result.shots++;
        firstShot ??= (tick + 1) * STEP;
        if (traceShot(player, [target], map).hit === target.id) result.hits++;
      }
    }
    result.firstShots.push(firstShot);
  }
  return result;
}

for (const classId of ['assault', 'sniper', 'scout', 'heavy']) {
  for (const moving of [false, true]) {
    test(`${classId} difficulty changes actual fire rate and accuracy against ${moving ? 'moving' : 'stationary'} targets`, () => {
      const [easy, normal, hard] = BOT_DIFFICULTIES.map(({ id }) => shootingTrial(id, classId, moving));
      assert.ok(easy.shots > 0 && easy.shots < normal.shots && normal.shots < hard.shots);
      assert.ok(easy.hits > 0, 'Easy bots can still hit an exposed opponent');
      assert.ok(easy.hits / easy.shots < normal.hits / normal.shots);
      assert.ok(normal.hits / normal.shots < hard.hits / hard.shots);
      assert.ok(easy.hits / easy.shots < 0.35, 'Easy leaves substantial room to survive');
      assert.ok(hard.hits < hard.shots, 'even Hard uses imperfect ordinary aim');
      for (let seed = 0; seed < 4; seed++) {
        assert.ok(easy.firstShots[seed] >= 1.25);
        assert.ok(normal.firstShots[seed] >= 0.9);
        assert.ok(hard.firstShots[seed] >= 0.55);
        assert.ok(easy.firstShots[seed] > normal.firstShots[seed] && normal.firstShots[seed] > hard.firstShots[seed]);
      }
    });
  }
}

test('bots track observed positions instead of instantly following each target movement', () => {
  const map = court();
  for (const { id } of BOT_DIFFICULTIES) {
    const stationary = createPlayer('bot', 'Bot', 0, 'assault', map);
    const moving = { ...stationary };
    const stillTarget = opponent(map);
    const movingTarget = { ...stillTarget };
    const stationaryController = createBotController(map, 0, id);
    const movingController = createBotController(map, 0, id);
    let eventuallyTracks = false;
    for (let tick = 0; tick < 40; tick++) {
      if (tick === 1) movingTarget.x = 8;
      const stillInput = stationaryController.update(stationary, [stationary, stillTarget]);
      const movingInput = movingController.update(moving, [moving, movingTarget]);
      if (tick < 6) assert.equal(movingInput.yaw, stillInput.yaw, 'unobserved movement cannot change aim');
      else eventuallyTracks ||= Math.abs(movingInput.yaw - stillInput.yaw) > 0.1;
      stationary.yaw = stillInput.yaw; stationary.pitch = stillInput.pitch;
      moving.yaw = movingInput.yaw; moving.pitch = movingInput.pitch;
    }
    assert.equal(eventuallyTracks, true, `${id} eventually observes and tracks the new position`);
  }
});

test('bots delay power use and pace repeated abilities according to difficulty', () => {
  const map = court();
  const uses = BOT_DIFFICULTIES.map(({ id }) => {
    const player = createPlayer('bot', 'Bot', 0, 'assault', map);
    const target = opponent(map, { z: 0 });
    const controller = createBotController(map, 0, id);
    const times = [];
    for (let tick = 0; tick < 2700; tick++) {
      const input = controller.update(player, [player, target]);
      stepPlayer(player, { ...input, forward: 0, strafe: 0, jump: false }, STEP, map);
      if (player.abilityUsed) times.push((tick + 1) * STEP);
    }
    assert.ok(times.length >= 2, `${id} bots still use their power`);
    return times;
  });
  const [easy, normal, hard] = uses;
  assert.ok(easy[0] >= 4.25 && normal[0] >= 2.4 && hard[0] >= 0.95);
  assert.ok(easy[0] > normal[0] && normal[0] > hard[0]);
  assert.ok(easy[1] - easy[0] > normal[1] - normal[0]);
  assert.ok(normal[1] - normal[0] > hard[1] - hard[0]);
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

test('resetting a bot gives its new life fresh reaction, observation, and power timers', () => {
  const map = court();
  const player = createPlayer('bot', 'Bot', 0, 'assault', map);
  const target = opponent(map, { z: 0 });
  for (const { id } of BOT_DIFFICULTIES) {
    const controller = createBotController(map, 1, id);
    for (let tick = 0; tick < 420; tick++) controller.update(player, [player, target]);
    controller.reset();
    const fresh = createBotController(map, 1, id);
    for (let tick = 0; tick < 420; tick++) {
      const input = controller.update(player, [player, target]);
      assert.deepEqual(input, fresh.update(player, [player, target]));
      if (tick === 0) { assert.equal(input.fire, false); assert.equal(input.ability, false); }
    }
  }
});
