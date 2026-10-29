import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, PLAYER_Y, PLAYER_HEIGHT, MAX_TRAFFIC_HEIGHT, LANE_SPEED, MAX_SPEED, ROW_SPACING,
  RUN_SECONDS, RECOVERY_SECONDS, createGame, startGame, generateWave, moveLane, pauseGame, speedAt, demoLane, stepGame } from '../engine.ts';

const runFor = (initial, duration, input = {}) => {
  let game = initial;
  for (let frame = 0; frame < Math.ceil(duration * 120); frame++) game = stepGame(game, input, 1 / 120);
  return game;
};
const obstacle = (id, x = LANES[1], y = PLAYER_Y) => ({ id, row: 99, safeLane: 0, lane: 1, x, y,
  width: 70, height: 116, kind: 'coupe', color: 0, passed: false, hit: false, clearance: Infinity });

test('thousands of seeded traffic rows keep an adjacent open route', () => {
  for (let seed = 1; seed <= 200; seed++) {
    let random = seed; let safe = 1;
    for (let row = 0; row < 100; row++) {
      const wave = generateWave(random, safe, row, row * 2);
      assert.ok(Math.abs(wave.safeLane - safe) <= 1);
      assert.ok(wave.cars.length >= 1 && wave.cars.length <= 2);
      assert.ok(wave.cars.every(car => car.lane !== wave.safeLane));
      assert.equal(new Set(wave.cars.map(car => car.lane)).size, wave.cars.length);
      random = wave.seed; safe = wave.safeLane;
    }
  }
});

test('visibility and clear space give a human reaction margin at maximum speed', () => {
  const visibleWarning = (PLAYER_Y - PLAYER_HEIGHT / 2) / MAX_SPEED;
  const clearTime = (ROW_SPACING - (MAX_TRAFFIC_HEIGHT + PLAYER_HEIGHT)) / MAX_SPEED;
  const laneTime = (LANES[1] - LANES[0]) / LANE_SPEED;
  assert.ok(visibleWarning >= 1.5); assert.ok(clearTime - laneTime > .3);
});

test('lane changes respond immediately, cross smoothly, and stop at road limits', () => {
  let game = startGame(51); const original = game;
  game = moveLane(game, -1); assert.equal(game.player.lane, 0); assert.equal(original.player.lane, 1);
  assert.equal(moveLane(game, -1).player.lane, 0);
  game = stepGame(game, {}, .05); assert.ok(game.player.x < LANES[1] && game.player.x > LANES[0]);
  game = runFor(game, .2); assert.equal(game.player.x, LANES[0]);
});

test('one contact costs one hit and recovery prevents a simultaneous second hit', () => {
  let game = startGame(5); game.traffic = [obstacle('first'), obstacle('second')];
  game = stepGame(game, {}, .01);
  assert.equal(game.health, 2); assert.ok(game.invulnerable > RECOVERY_SECONDS - .02);
  assert.equal(game.events.filter(event => event.type === 'damage').length, 1);
  game = runFor(game, .8); assert.equal(game.health, 2);
  assert.ok(game.traffic.every(car => car.hit));
});

test('exactly three separated impacts end a run and terminal state cannot change', () => {
  let game = startGame(4);
  for (let hit = 0; hit < 3; hit++) {
    game.traffic = [obstacle(`hit-${hit}`)]; game.invulnerable = 0;
    game = stepGame(game, {}, .01); assert.equal(game.health, 2 - hit);
  }
  assert.equal(game.phase, 'lost'); assert.equal(stepGame(game, { brake: true }, .1), game);
  assert.equal(moveLane(game, 1), game);
});

test('a geometric near miss earns 125 once, while a wide pass earns only 25', () => {
  let close = startGame(8); close.player = { lane: 0, x: LANES[0] };
  close.traffic = [obstacle('near', LANES[0] + 80)]; close = runFor(close, .9);
  assert.equal(close.nearMisses, 1); assert.equal(close.bonus, 125); assert.equal(close.health, 3);
  close = runFor(close, .5); assert.equal(close.nearMisses, 1); assert.equal(close.bonus, 125);
  let wide = startGame(8); wide.traffic = [obstacle('wide', LANES[0])]; wide = runFor(wide, .9);
  assert.equal(wide.nearMisses, 0); assert.equal(wide.bonus, 25);
});

test('speed rises, braking slows traffic and distance, and both clocks advance equally', () => {
  assert.ok(speedAt(70) > speedAt(10)); assert.equal(speedAt(200), MAX_SPEED);
  const full = runFor(startGame(9), 1); const brake = runFor(startGame(9), 1, { brake: true });
  assert.equal(full.time, brake.time); assert.ok(brake.distance < full.distance * .65);
  assert.ok(brake.traffic[0].y < full.traffic[0].y); assert.ok(full.score > brake.score);
});

test('pause freezes every race clock and resume continues without losing the run', () => {
  let game = runFor(startGame(6), .5); game = pauseGame(game);
  assert.equal(game.phase, 'paused'); assert.equal(stepGame(game, {}, .1), game); assert.equal(moveLane(game, 1), game);
  game = pauseGame(game, false); assert.equal(game.phase, 'playing'); assert.ok(stepGame(game, {}, .1).distance > game.distance);
});

test('autonomous driver completes real 90-second runs across seeds without damage', () => {
  for (let seed = 1; seed <= 25; seed++) {
    let game = startGame(seed);
    for (let frame = 0; frame < RUN_SECONDS * 60 + 2 && game.phase === 'playing'; frame++) {
      game = stepGame(game, { lane: demoLane(game), brake: seed % 5 === 0 }, 1 / 60);
      assert.ok(game.traffic.length <= 8); assert.ok(Number.isFinite(game.score));
    }
    assert.equal(game.phase, 'won', `seed ${seed}`); assert.equal(game.health, 3, `seed ${seed}`);
    assert.equal(game.time, RUN_SECONDS); assert.ok(game.score >= Math.floor(game.distance) + 1750);
  }
});

test('restart resets score, damage, timing, inputs and traffic; seeds replay predictably', () => {
  const a = startGame(123); const b = startGame(123);
  assert.deepEqual(runFor(a, 2), runFor(b, 2));
  let game = startGame(123); game.health = 1; game.score = 9000; game = startGame(123);
  assert.deepEqual(game, a); assert.equal(createGame(123).phase, 'ready');
  assert.equal(stepGame(game, {}, NaN), game); assert.equal(stepGame(game, {}, -1), game);
});
