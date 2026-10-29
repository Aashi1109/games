import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, MAX_SPEED, BUMPERS, createGame, launchBall, stepGame, collideSegment, awardTarget, drainBall } from '../engine.ts';

test('a plunge is stronger when held and cannot relaunch a ball in play', () => {
  const ready = createGame(); const light = launchBall(ready, .2); const strong = launchBall(ready, 1);
  assert.ok(strong.ball.vy < light.ball.vy); assert.equal(launchBall(strong, 1), strong);
  assert.equal(ready.phase, 'ready'); assert.equal(strong.balls, 3);
});

test('an underpowered launch returns to the lane without consuming a ball', () => {
  let game = launchBall(createGame(), 0);
  for (let i = 0; i < 600 && game.phase === 'playing'; i++) game = stepGame(game, {}, 1 / 120);
  assert.equal(game.phase, 'ready'); assert.equal(game.balls, 3); assert.equal(game.ballNumber, 1);
  assert.equal(game.entered, false); assert.equal(game.ball.y, 735);
});

test('a normal launch enters the actual table and starts the limited ball saver', () => {
  let game = launchBall(createGame(), .65);
  for (let i = 0; i < 300 && !game.entered; i++) game = stepGame(game, {}, 1 / 120);
  assert.equal(game.entered, true); assert.equal(game.ball.inLane, false);
  assert.ok(game.saveTime > 3.9 && game.saveTime <= 4);
});

test('segment collisions resolve penetration and reflect incoming motion only', () => {
  const ball = { x: 104, y: 150, vx: -200, vy: 0 };
  collideSegment(ball, { x: 100, y: 100 }, { x: 100, y: 200 });
  assert.ok(ball.x >= 100 + BALL_RADIUS + 5); assert.ok(ball.vx > 0 && ball.vx < 200);
  const departing = { x: 104, y: 150, vx: 150, vy: 0 };
  collideSegment(departing, { x: 100, y: 100 }, { x: 100, y: 200 });
  assert.equal(departing.vx, 150);
});

test('fast balls do not tunnel through a rail at the largest accepted time step', () => {
  const game = createGame(); game.phase = 'playing'; game.saved = true; game.entered = true;
  game.ball = { x: 65, y: 200, vx: -MAX_SPEED, vy: 0, inLane: false };
  const next = stepGame(game, {}, .1);
  assert.ok(next.ball.x >= 58); assert.ok(next.ball.vx > 0); assert.ok(Math.hypot(next.ball.vx, next.ball.vy) <= MAX_SPEED + .01);
});

test('a moving flipper supplies an impulse while a held flipper adds no repeated kick', () => {
  const rise = createGame(); rise.phase = 'playing'; rise.saved = true; rise.entered = true;
  rise.ball = { x: 223, y: 685, vx: 0, vy: 160, inLane: false };
  const rising = stepGame(rise, { left: true }, 1 / 60);
  assert.ok(rising.ball.vy < -700);
  const hold = createGame(); hold.phase = 'playing'; hold.saved = true; hold.entered = true; hold.flippers[0].angle = -.48;
  hold.ball = { x: 222, y: 637, vx: 0, vy: 160, inLane: false };
  const held = stepGame(hold, { left: true }, 1 / 60);
  assert.ok(Math.hypot(held.ball.vx, held.ball.vy) < 200); assert.equal(held.flippers[0].omega, 0);
});

test('bumper hits score once per contact and ORB raises a capped multiplier', () => {
  let game = createGame();
  assert.equal(awardTarget(game, 'O', 100), true); assert.equal(awardTarget(game, 'O', 100), false);
  assert.equal(game.score, 100);
  awardTarget(game, 'R', 100); awardTarget(game, 'B', 100);
  assert.equal(game.score, 1375); assert.equal(game.multiplier, 2); assert.deepEqual(game.targets, [false, false, false]);
  for (let orbit = 0; orbit < 9; orbit++) {
    for (let i = 0; i < 3; i++) game = stepGame(game, {}, .1);
    for (const bumper of BUMPERS) awardTarget(game, bumper.id, 100);
  }
  assert.equal(game.multiplier, 5);
});

test('combos require different targets and expire after inactivity', () => {
  let game = createGame(); awardTarget(game, 'O', 100); awardTarget(game, 'R', 100); assert.equal(game.combo, 2);
  for (let i = 0; i < 30; i++) game = stepGame(game, {}, .1);
  assert.equal(game.combo, 0); awardTarget(game, 'O', 100); assert.equal(game.combo, 1);
});

test('the saver works once and exactly three consumed balls end a game', () => {
  let game = launchBall(createGame(), .6); game.entered = true; game.saveTime = 2;
  drainBall(game); assert.equal(game.phase, 'ready'); assert.equal(game.balls, 3); assert.equal(game.saved, true);
  game = launchBall(game, .6); drainBall(game); assert.equal(game.balls, 2);
  for (let i = 0; i < 11; i++) game = stepGame(game, {}, .1);
  assert.equal(game.phase, 'ready'); assert.equal(game.saved, false); assert.equal(game.ballNumber, 2);
  game = launchBall(game, .6); drainBall(game); assert.equal(game.balls, 1);
  for (let i = 0; i < 11; i++) game = stepGame(game, {}, .1);
  game = launchBall(game, .6); drainBall(game); assert.equal(game.phase, 'over'); assert.equal(game.balls, 0);
  drainBall(game); assert.equal(game.balls, 0); assert.equal(stepGame(game, {}, .1), game);
});

test('an unattended real game drains all three balls instead of trapping one forever', () => {
  let game = createGame(); let launches = 0;
  for (let i = 0; i < 120 * 90 && game.phase !== 'over'; i++) {
    if (game.phase === 'ready') game = launchBall(game, [.65, .28, .78, .35][launches++ % 4]);
    game = stepGame(game, {}, 1 / 120);
  }
  assert.equal(game.phase, 'over'); assert.equal(game.balls, 0); assert.ok(game.score > 0);
});

test('balls beside either upper guide fall back into the table instead of wedging', () => {
  for (const x of [58, 476]) {
    let game = createGame(); game.phase = 'playing'; game.entered = true; game.saved = true;
    game.ball = { x, y: 211, vx: 0, vy: 0, inLane: false };
    for (let frame = 0; frame < 300; frame++) game = stepGame(game, {}, 1 / 120);
    assert.ok(game.ball.y > 500, `Ball at x=${x} must leave the upper guide`);
  }
});

test('long play with alternating flippers remains finite, bounded, and scores real contacts', () => {
  let game = launchBall(createGame(), .65); let maxScore = 0;
  for (let i = 0; i < 120 * 100; i++) {
    if (game.phase === 'over') game = createGame();
    if (game.phase === 'ready') game = launchBall(game, .65);
    game = stepGame(game, { left: i % 31 < 10, right: i % 37 < 11 }, 1 / 120);
    for (const key of ['x', 'y', 'vx', 'vy']) assert.ok(Number.isFinite(game.ball[key]), key);
    assert.ok(game.ball.x >= 16 && game.ball.x <= 544); assert.ok(game.ball.y >= 20 && game.ball.y < 800);
    assert.ok(Math.hypot(game.ball.vx, game.ball.vy) <= MAX_SPEED + .01); maxScore = Math.max(maxScore, game.score);
  }
  assert.ok(maxScore > 2000);
});
