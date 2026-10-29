import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH, HEIGHT, SECTORS, wrap, torusDelta, segmentHitsCircle, createGame, startGame, restartGame, stepGame, autopilot } from '../engine.ts';

function rock(size = 1, x = 150, y = 150) {
  return { id: 99, size, radius: [0, 13, 25, 45][size], x, y, vx: 0, vy: 0, angle: 0, spin: 0, vertices: Array(10).fill(1) };
}
function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds; time += 1 / 120) stepGame(game, Math.min(1 / 120, seconds - time), input);
}
function hit(game, target) {
  game.bullets = [{ x: target.x, y: target.y, vx: 0, vy: 0, life: 1 }];
  stepGame(game, 1 / 120);
}

test('wrapping works across positive and negative boundaries', () => {
  assert.equal(wrap(-5, WIDTH), WIDTH - 5);
  assert.equal(wrap(WIDTH * 3 + 4, WIDTH), 4);
  assert.equal(torusDelta(955, 5, WIDTH), 10);
  assert.equal(torusDelta(5, 955, WIDTH), -10);
});

test('continuous segment test detects crossing a small target and rejects a near miss', () => {
  assert.equal(segmentHitsCircle(0, 0, 200, 0, 80, 0, 5), true);
  assert.equal(segmentHitsCircle(0, 6, 200, 6, 80, 0, 5), false);
  assert.equal(segmentHitsCircle(1, 1, 1, 1, 1, 1, 5), true);
});

test('seeded ready playfield is populated, safe and frozen until start', () => {
  const game = createGame(12);
  assert.deepEqual(game, createGame(12));
  assert.equal(game.phase, 'ready');
  assert.equal(game.rocks.length, 2);
  for (const item of game.rocks) assert.ok(Math.hypot(torusDelta(game.ship.x, item.x, WIDTH), torusDelta(game.ship.y, item.y, HEIGHT)) >= 220);
  const snapshot = structuredClone(game);
  stepGame(game, 0.1, { fire: true, thrust: true });
  assert.deepEqual(game, snapshot);
});

test('rotation, thrust and repeated fire are independent and speed/cooldown are bounded', () => {
  const game = startGame(createGame(7));
  game.rocks = [rock(1, 10, 10)];
  game.ship.shield = 100;
  advance(game, 1, { thrust: true, right: true, fire: true });
  assert.ok(game.ship.angle > 1);
  assert.ok(Math.hypot(game.ship.vx, game.ship.vy) > 40);
  assert.ok(game.shots >= 6 && game.shots <= 7);
  advance(game, 5, { thrust: true });
  assert.ok(Math.hypot(game.ship.vx, game.ship.vy) <= 280.01);
});

test('ship and asteroid positions wrap to the other side', () => {
  const game = startGame(createGame(3));
  game.ship.x = WIDTH - 1; game.ship.vx = 200;
  game.ship.y = HEIGHT - 1; game.ship.vy = 200;
  const item = rock(1, WIDTH - 1, HEIGHT - 1);
  item.vx = 200; item.vy = 200;
  game.rocks = [item];
  stepGame(game, 0.02);
  assert.ok(game.ship.x < 5 && game.ship.y < 5);
  assert.ok(item.x < 5 && item.y < 5);
});

test('one large rock produces two medium and then four small rocks, with correct score', () => {
  const game = startGame(createGame(17));
  game.rocks = [rock(3)];
  hit(game, game.rocks[0]);
  assert.deepEqual(game.rocks.map(item => item.size), [2, 2]);
  assert.equal(game.score, 50);
  while (game.rocks.some(item => item.size === 2)) hit(game, game.rocks.find(item => item.size === 2));
  assert.deepEqual(game.rocks.map(item => item.size), [1, 1, 1, 1]);
  assert.equal(game.score, 250);
  while (game.rocks.length) hit(game, game.rocks[0]);
  assert.equal(game.score, 1050);
  assert.equal(game.hits, 7);
  assert.equal(game.phase, 'between');
});

test('fast bullets do not tunnel through a rock and are consumed once', () => {
  const game = startGame(createGame(1));
  game.rocks = [rock(1, 170, 100), rock(1, 200, 100)];
  game.bullets = [{ x: 100, y: 100, vx: 15000, vy: 0, life: 1 }];
  stepGame(game, 1 / 120);
  assert.equal(game.rocks.length, 1);
  assert.equal(game.score, 200);
  assert.equal(game.bullets.length, 0);
});

test('bullets hit across a wrapped screen edge', () => {
  const game = startGame(createGame(1));
  game.rocks = [rock(1, 5, 100), rock(1, 300, 300)];
  game.bullets = [{ x: WIDTH - 12, y: 100, vx: 1500, vy: 0, life: 1 }];
  stepGame(game, 1 / 120);
  assert.equal(game.rocks.length, 1);
  assert.equal(game.score, 200);
});

test('ship collisions see rocks on the opposite screen edge', () => {
  const game = startGame(createGame(1));
  game.ship.x = WIDTH - 3; game.ship.y = 100; game.ship.shield = 0;
  game.rocks = [rock(1, 5, 100)];
  stepGame(game, 1 / 120);
  assert.equal(game.hulls, 2);
});

test('invulnerability prevents damage, expires, then respawns with protection', () => {
  const game = startGame(createGame(1));
  game.rocks = [rock(3, game.ship.x, game.ship.y)];
  advance(game, 2.7);
  assert.equal(game.hulls, 3);
  advance(game, 0.2);
  assert.equal(game.hulls, 2);
  assert.equal(game.ship.alive, false);
  advance(game, 0.9);
  assert.equal(game.ship.alive, true);
  assert.ok(game.ship.shield > 2.5);
  const item = game.rocks[0]; item.x = game.ship.x; item.y = game.ship.y;
  stepGame(game, 0.1);
  assert.equal(game.hulls, 2);
});

test('losing the third hull ends the run and freezes further scoring', () => {
  const game = startGame(createGame(1));
  game.hulls = 1; game.ship.shield = 0;
  game.rocks = [rock(3, game.ship.x, game.ship.y)];
  stepGame(game, 1 / 120);
  assert.equal(game.phase, 'lost');
  assert.equal(game.hulls, 0);
  const elapsed = game.elapsed;
  stepGame(game, 0.1, { fire: true });
  assert.equal(game.elapsed, elapsed);
  assert.equal(game.score, 0);
});

test('sectors escalate to four, victory awards surviving hulls exactly once', () => {
  const game = startGame(createGame(11));
  for (let sector = 1; sector <= SECTORS; sector++) {
    assert.equal(game.sector, sector);
    assert.equal(game.rocks.length, sector + 1);
    game.rocks = [];
    stepGame(game, 1 / 120);
    if (sector < SECTORS) {
      assert.equal(game.phase, 'between');
      advance(game, 1.6);
    }
  }
  assert.equal(game.phase, 'won');
  assert.equal(game.score, 1500);
  stepGame(game, 0.2, { fire: true });
  assert.equal(game.score, 1500);
});

test('restart restores all mutable state and deterministic starting board', () => {
  const game = startGame(createGame(53));
  advance(game, 1, { fire: true, thrust: true });
  game.phase = 'lost'; game.hulls = 0; game.score = 900;
  restartGame(game);
  assert.deepEqual(game, createGame(53));
});

test('autopilot runs the same playable engine and produces actual scored hits', () => {
  const game = startGame(createGame(76123));
  for (let i = 0; i < 60 * 30 && game.phase !== 'lost'; i++) stepGame(game, 1 / 60, autopilot(game));
  assert.ok(game.shots > 10);
  assert.ok(game.hits > 4);
  assert.ok(game.score >= 500);
});

test('invalid deltas cannot poison the simulation', () => {
  const game = startGame(createGame(4));
  for (const delta of [-1, NaN, Infinity]) stepGame(game, delta);
  assert.equal(game.elapsed, 0);
  assert.ok(Number.isFinite(game.ship.x));
});

test('an actual autopilot run clears all generated sectors with the full destruction score', () => {
  const game = startGame(createGame(3));
  for (let i = 0; i < 60 * 180 && !['lost', 'won'].includes(game.phase); i++) stepGame(game, 1 / 60, autopilot(game));
  assert.equal(game.phase, 'won');
  assert.equal(game.hits, (2 + 3 + 4 + 5) * 7);
  assert.equal(game.score, 14700 + game.hulls * 500);
});
