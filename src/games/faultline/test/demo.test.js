import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, interact, buyUpgrade, serialize, restore } from '../engine.ts';
import { createPilot } from '../demo.ts';

function tick(state, pilot, dt = 1 / 60) {
  const action = pilot(state);
  if (action.upgradeId) assert.equal(buyUpgrade(state, action.upgradeId), true);
  if (action.interact) assert.equal(interact(state), true);
  step(state, action.input, dt);
}

test('pilot only returns inputs and never edits game state', () => {
  const state = createGame(), before = serialize(state);
  const action = createPilot()(state);
  assert.equal(serialize(state), before);
  assert.deepEqual(Object.keys(action).sort(), ['input', 'interact', 'upgradeId']);
  assert.ok([-1, 0, 1].includes(action.input.dx));
  assert.ok([-1, 0, 1].includes(action.input.dy));
});

test('attract-mode pilot mines, hauls, upgrades and wins using only real gameplay actions', () => {
  const state = createGame(), pilot = createPilot();
  let deposits = 0, hullHits = 0, recalls = 0;
  for (let frame = 0; frame < 60 * 600 && !['won', 'lost'].includes(state.phase); frame++) {
    tick(state, pilot);
    for (const event of state.events) {
      if (event.type === 'deposit') deposits++;
      if (event.type === 'base-hit') hullHits++;
      if (event.type === 'recall') recalls++;
    }
    if (frame % 1200 === 0) assert.ok(restore(serialize(state)));
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.wave, 4);
  assert.equal(state.kills, 43);
  assert.ok(state.oreMined >= 18);
  assert.ok(deposits >= 3);
  assert.ok(recalls >= 1);
  assert.ok(hullHits > 0);
  assert.equal(state.upgrades.turret, 2);
  assert.equal(state.upgrades.armor, 1);
  assert.ok(state.base.hp > 0);
});

test('full cargo returns through the shaft while recall is unavailable', () => {
  const state = createGame(), pilot = createPilot();
  state.player.cargo = Array.from({ length: 6 }, () => ({ type: 'iron', value: 3 }));
  state.player.recallCooldown = 25;
  for (let i = 0; i < 300 && state.player.cargo.length; i++) tick(state, pilot);
  assert.equal(state.player.cargo.length, 0);
  assert.equal(state.credits, 26);
  assert.ok(state.player.recallCooldown > 20);
});

test('pilot does not oscillate at tunnel turns under the browser frame-time cap', () => {
  const state = createGame(), pilot = createPilot();
  for (let frame = 0; frame < 12000 && !['won', 'lost'].includes(state.phase); frame++) tick(state, pilot, 0.05);
  assert.equal(state.phase, 'won');
  assert.ok(state.oreMined >= 18);
});
