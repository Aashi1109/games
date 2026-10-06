import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementStyle } from '../client/movement-style.js';

const state = (extra = {}) => ({ id: 'a', life: 0, health: 100, grounded: true, sliding: false, ropeId: null, padCooldown: 0, vx: 9, vz: 0, ...extra });

test('a rope jump or launchpad followed by a quick slide earns one style callout', () => {
  for (const source of ['rope', 'pad']) {
    const style = createMovementStyle();
    style.update(state({ ropeId: source === 'rope' ? 'line' : null }), 0);
    assert.equal(style.update(state({ grounded: false, padCooldown: source === 'pad' ? 1 : 0 }), 100), null);
    assert.equal(style.update(state({ sliding: true }), 900), 'SMOOTH OPERATOR');
    assert.equal(style.update(state({ sliding: true }), 1000), null);
  }
});

test('ordinary slides, long pauses and delayed landings do not count as a chain', () => {
  const style = createMovementStyle();
  style.update(state(), 0);
  assert.equal(style.update(state({ sliding: true }), 100), null);
  style.update(state({ grounded: false, padCooldown: 1 }), 200);
  style.update(state(), 800);
  assert.equal(style.update(state({ sliding: true }), 2000), null);
  style.update(state({ grounded: false, padCooldown: 1 }), 2100);
  assert.equal(style.update(state({ sliding: true }), 10000), null);
});

test('death, a new life and explicit room reset discard unfinished chains', () => {
  for (const reset of ['death', 'life', 'room']) {
    const style = createMovementStyle();
    style.update(state(), 0);
    style.update(state({ grounded: false, padCooldown: 1 }), 100);
    if (reset === 'room') style.reset();
    else style.update(state(reset === 'death' ? { health: 0 } : { life: 1 }), 200);
    assert.equal(style.update(state({ life: reset === 'life' ? 1 : 0, sliding: true }), 300), null);
  }
});
