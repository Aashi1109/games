import test from 'node:test';
import assert from 'node:assert/strict';
import { updateCargo, deliveryScore, obstacleImpact, roadHeight } from '../src/games/wobble-delivery.ts';

test('cargo settles after a gentle bump without spontaneously losing boxes', () => {
  let cargo = { angle: 0.2, velocity: 0.7 };
  let lost = false;
  for (let i = 0; i < 1200; i++) { cargo = updateCargo(cargo, 0, 0, 1 / 120); lost ||= cargo.lost; }
  assert.equal(lost, false);
  assert.ok(Math.abs(cargo.angle) < 0.001);
  assert.ok(Math.abs(cargo.velocity) < 0.001);
});

test('a strong physical shock can spill cargo, while normal acceleration stays stable', () => {
  let cargo = updateCargo({ angle: 0, velocity: 0 }, 0, 7, 1 / 120);
  let lost = false;
  for (let i = 0; i < 90; i++) { cargo = updateCargo(cargo, 0, 0, 1 / 120); lost ||= cargo.lost; }
  assert.equal(lost, true);
  cargo = { angle: 0, velocity: 0 };
  for (let i = 0; i < 360; i++) cargo = updateCargo(cargo, 185, 0, 1 / 120);
  assert.equal(cargo.lost, false);
  assert.ok(cargo.angle < 0, 'acceleration leans cargo backwards');
});

test('jumping clears an obstacle, crossing on the ground hits, and used bumps cannot be farmed', () => {
  const obstacle = { x: 100, clearance: 24, hit: false };
  assert.equal(obstacleImpact(obstacle, 95, 105, 0), true);
  assert.equal(obstacleImpact(obstacle, 95, 105, 25), false);
  assert.equal(obstacleImpact(obstacle, 95, 99, 0), false);
  assert.equal(obstacleImpact({ ...obstacle, hit: true }, 95, 105, 0), false);
  assert.equal(obstacleImpact(obstacle, 105, 95, 0), false);
});

test('delivery values retained cargo and quick completion without negative time bonus', () => {
  assert.ok(deliveryScore(6, 30, 1) > deliveryScore(5, 30, 1));
  assert.ok(deliveryScore(6, 20, 1) > deliveryScore(6, 30, 1));
  assert.equal(deliveryScore(2, 1000, 1), 500);
  assert.equal(deliveryScore(-1, 1000, 1), 100);
});

test('road courses are continuous and stay within the visible track area', () => {
  for (let route = 1; route <= 3; route++) for (let x = 0; x < 3600; x += 3) {
    const height = roadHeight(x, route);
    assert.ok(height > 400 && height < 480);
    assert.ok(Math.abs(roadHeight(x + 1, route) - height) < 1);
  }
});
