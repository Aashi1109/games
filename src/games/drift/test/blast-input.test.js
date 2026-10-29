import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlastInput } from '../client/blast-input.ts';

const ember = (extra = {}) => ({ classId: 'assault', health: 100, abilityCooldown: 0, life: 1, ropeId: null, yaw: 0, pitch: 0, ...extra });

test('Q opens aim without casting; a valid click queues exactly one throw', () => {
  const input = createBlastInput(), player = ember();
  assert.equal(input.toggle(player), true);
  assert.equal(input.takeThrow(player), null);
  assert.equal(input.aiming, true);
  assert.equal(input.confirm(player, false), false, 'an invalid landing stays in aim mode');
  assert.equal(input.aiming, true);
  assert.equal(input.confirm(player, true), true);
  assert.equal(input.aiming, false);
  assert.deepEqual(input.takeThrow(player), { yaw: 0, pitch: 0 });
  assert.equal(input.takeThrow(player), null, 'holding the mouse cannot repeat the queued power');
  assert.equal(input.confirm(player, true), false, 'a click outside aim mode is not a throw');
});

test('Q toggle and cancellation never spend an ability or leave a throw queued', () => {
  const input = createBlastInput(), player = ember();
  input.toggle(player); input.toggle(player);
  assert.equal(input.aiming, false); assert.equal(input.takeThrow(player), null);
  input.toggle(player); input.confirm(player, true); input.cancel();
  assert.equal(input.aiming, false); assert.equal(input.takeThrow(player), null);
});

test('death, respawn, class change, cooldown, rope and inactive controls cancel aiming and pending throws', () => {
  for (const [state, active] of [[ember({ health: 0 }), true], [ember({ life: 2 }), true],
    [ember({ classId: 'sniper' }), true], [ember({ abilityCooldown: .1 }), true],
    [ember({ ropeId: 'rope' }), true], [ember(), false], [null, true]]) {
    for (const queued of [false, true]) {
      const input = createBlastInput(), player = ember();
      input.toggle(player); if (queued) input.confirm(player, true);
      input.sync(state, active);
      assert.equal(input.aiming, false);
      assert.equal(input.takeThrow(state, active), null);
    }
  }
});

test('unavailable powers and other classes cannot enter Blast Pop aiming', () => {
  for (const player of [null, ember({ classId: 'scout' }), ember({ health: 0 }), ember({ abilityCooldown: 1 }), ember({ ropeId: 'r' })]) {
    const input = createBlastInput();
    assert.equal(input.toggle(player), false);
    assert.equal(input.takeThrow(player), null);
  }
  const input = createBlastInput(); assert.equal(input.toggle(ember(), false), false);
});

test('confirmed throws retain click-time aim even when mouse and player angles change before the next tick', () => {
  const input = createBlastInput(), player = ember({ yaw: .2, pitch: -.3 });
  const mouseAim = { yaw: .8, pitch: .6 };
  input.toggle(player);
  assert.equal(input.confirm(player, true, mouseAim), true);
  player.yaw = -2; player.pitch = 1.4;
  mouseAim.yaw = -1; mouseAim.pitch = -1.2;
  assert.deepEqual(input.takeThrow(player), { yaw: .8, pitch: .6 }, 'the selected trajectory uses a value snapshot, not mutable aim objects');
  assert.equal(input.takeThrow(player), null);

  input.toggle(player);
  assert.equal(input.confirm(player, true), true);
  player.yaw = 1; player.pitch = 0;
  assert.deepEqual(input.takeThrow(player), { yaw: -2, pitch: 1.4 }, 'without an explicit mouse pose, capture current player angles');
});
