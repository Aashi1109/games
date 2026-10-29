import test from 'node:test';
import assert from 'node:assert/strict';
import { PATH, PATH_LENGTH, PLOTS, MAX_WAVES, createGame, pointOnPath, buildTower, upgradeTower, sellTower, towerStats, sellValue, upgradeCost, startWave, stepGame, waveRecipe, gameScore } from '../engine.ts';

function finishWave(state) {
  let steps = 0;
  while (state.phase === 'wave' && steps++ < 2500) stepGame(state, .25);
  assert.notEqual(state.phase, 'wave', 'wave should resolve in bounded time');
}

test('path follows every corner continuously and clamps outside the map', () => {
  assert.deepEqual([pointOnPath(-100).x, pointOnPath(-100).y], PATH[0]);
  let distance = 0;
  for (let i = 1; i < PATH.length; i++) {
    distance += Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]);
    const point = pointOnPath(distance);
    assert.deepEqual([point.x, point.y], PATH[i]);
    const justBefore = pointOnPath(distance - .001), justAfter = pointOnPath(distance + .001);
    assert.ok(Math.hypot(justBefore.x - justAfter.x, justBefore.y - justAfter.y) < .003);
  }
  assert.equal(distance, PATH_LENGTH);
  assert.deepEqual([pointOnPath(999999).x, pointOnPath(999999).y], PATH.at(-1));
});

test('building, upgrade limits, affordability and selling preserve the resource economy', () => {
  const state = createGame();
  assert.equal(buildTower(state, -1, 'pea'), false);
  assert.equal(buildTower(state, PLOTS.length, 'pea'), false);
  assert.equal(buildTower(state, 0, 'constructor'), false);
  assert.equal(state.sun, 150);
  assert.equal(buildTower(state, 0, 'pea'), true);
  assert.equal(state.sun, 90);
  assert.equal(buildTower(state, 0, 'pea'), false);
  const tower = state.towers[0], original = towerStats(tower);
  assert.equal(upgradeCost(tower), 45);
  assert.equal(upgradeTower(state, 0), true);
  assert.equal(state.sun, 45);
  assert.ok(towerStats(tower).damage > original.damage);
  assert.ok(towerStats(tower).range > original.range);
  assert.ok(towerStats(tower).rate < original.rate);
  assert.equal(upgradeTower(state, 0), false);
  state.sun += 100;
  assert.equal(upgradeTower(state, 0), true);
  assert.equal(upgradeTower(state, 0), false);
  const refund = sellValue(tower), sun = state.sun;
  assert.equal(refund, Math.floor((60 + 45 + 66) * .7));
  assert.equal(sellTower(state, 0), true);
  assert.equal(state.sun, sun + refund);
  assert.equal(sellTower(state, 0), false);
});

test('seven waves escalate and undefended bugs cause a stable loss', () => {
  assert.deepEqual(waveRecipe(0), []);
  assert.ok(waveRecipe(7).includes('snail'));
  assert.ok(waveRecipe(7).length > waveRecipe(1).length);
  const state = createGame();
  assert.equal(startWave(state), true);
  assert.equal(startWave(state), false);
  finishWave(state);
  assert.equal(state.hearts, 4);
  assert.equal(state.phase, 'planning');
  assert.equal(state.sun, 150 + 38);
  startWave(state); finishWave(state);
  assert.equal(state.phase, 'lost'); assert.equal(state.hearts, 0);
  const snapshot = structuredClone(state);
  stepGame(state, 1);
  assert.deepEqual(state, snapshot);
  assert.equal(startWave(state), false); assert.equal(buildTower(state, 0, 'pea'), false);
});

test('a legitimate mixed defense wins all waves with finite resources and earns each bounty once', () => {
  const state = createGame();
  buildTower(state, 1, 'pea'); buildTower(state, 3, 'pea');
  let expectedKills = 0;
  for (let wave = 1; wave <= MAX_WAVES; wave++) {
    for (const [plot, type] of [[5, 'acorn'], [0, 'pea'], [4, 'pea'], [6, 'dew'], [2, 'acorn'], [7, 'pea'], [8, 'pea']]) buildTower(state, plot, type);
    for (let level = 1; level <= 2; level++) for (const tower of state.towers) if (tower.level === level) upgradeTower(state, tower.plot);
    assert.equal(startWave(state), true); finishWave(state);
    expectedKills += waveRecipe(wave).length;
    assert.equal(state.kills, expectedKills);
    assert.equal(state.hearts, 12);
    assert.ok(Number.isFinite(state.sun) && state.sun >= 0);
  }
  assert.equal(state.phase, 'won'); assert.equal(state.wave, 7); assert.equal(state.kills, 111);
  const score = gameScore(state), sun = state.sun;
  for (let i = 0; i < 100; i++) stepGame(state, .5);
  assert.equal(state.sun, sun); assert.equal(gameScore(state), score);
});

test('acorn splash damages a group while dew applies a temporary movement slow', () => {
  for (const type of ['acorn', 'dew']) {
    const state = createGame(); buildTower(state, 1, type); startWave(state); state.queue = [];
    state.enemies = [0, 1].map(index => ({ id: 100 + index, type: 'ant', hp: 100, maxHp: 100, distance: 270 + index * 8, ...pointOnPath(270 + index * 8), speed: 56, slowTimer: 0, slowFactor: 1 }));
    for (let i = 0; i < 10; i++) stepGame(state, .1);
    if (type === 'acorn') assert.ok(state.enemies.every(enemy => enemy.hp < 100), 'splash reaches adjacent enemies');
    else { assert.ok(state.enemies.every(enemy => enemy.slowTimer > 0)); assert.ok(state.enemies.every(enemy => enemy.slowFactor < 1)); }
  }
});
