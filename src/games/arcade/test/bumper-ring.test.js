import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaRadius, dashVelocity, resolveBump, outsideArena } from '../src/games/bumper-ring.ts';

test('island starts safely, shrinks over time, and never disappears', () => {
  assert.equal(arenaRadius(0), arenaRadius(6));
  assert.ok(arenaRadius(25, 3) < arenaRadius(25, 1));
  assert.equal(arenaRadius(1e6, 3), 102);
  assert.equal(outsideArena({ x: 480, y: 304, r: 21 }, 102), false);
  assert.equal(outsideArena({ x: 720, y: 304, r: 21 }, 226), true);
});

test('dash power is capped and diagonal movement receives no speed advantage', () => {
  const straight = dashVelocity({ x: 1, y: 0 }, 1);
  const diagonal = dashVelocity({ x: 1, y: 1 }, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - straight.x) < 1e-9);
  assert.deepEqual(dashVelocity({ x: 1, y: 0 }, 20), straight);
  assert.ok(dashVelocity({ x: 1, y: 0 }, 0).x < straight.x);
});

test('head-on impact separates circles and transfers momentum to the target', () => {
  const a = { x: 0, y: 0, r: 20, vx: 500, vy: 0 };
  const b = { x: 30, y: 0, r: 20, vx: 0, vy: 0 };
  assert.equal(resolveBump(a, b), true);
  assert.equal(b.x - a.x, 40);
  assert.ok(b.vx > a.vx);
  assert.equal(a.vx + b.vx, 500);
  assert.equal(resolveBump(a, b), false);
});

test('overlapping stationary and separating bumpers resolve without explosive velocity', () => {
  const a = { x: 0, y: 0, r: 20, vx: -12, vy: 0 };
  const b = { x: 0, y: 0, r: 20, vx: 12, vy: 0 };
  resolveBump(a, b);
  assert.equal(a.vx, -12);
  assert.equal(b.vx, 12);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(b.x));
  assert.equal(b.x - a.x, 40);
});
