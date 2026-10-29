import test from 'node:test';
import assert from 'node:assert/strict';
import { getAbilityHudState } from '../client/ability-hud.ts';

const player = { classId: 'assault', health: 100, abilityCooldown: 0, abilityTime: 0, ropeId: null };

test('all ready powers advertise Q and a full charge, with aim only for Blast Pop', () => {
  for (const classId of ['assault', 'sniper', 'scout', 'heavy']) {
    const state = getAbilityHudState({ ...player, classId });
    assert.equal(state.ready, true);
    assert.equal(state.active, false);
    assert.equal(state.status, 'READY');
    assert.equal(state.hint, classId === 'assault' ? 'PRESS Q TO AIM' : 'PRESS Q TO USE');
    assert.equal(state.progress, 1);
  }
});

test('cooldown counts up to the next whole second and clamps charge progress', () => {
  const state = getAbilityHudState({ ...player, abilityCooldown: 5.2 });
  assert.equal(state.state, 'cooldown');
  assert.equal(state.ready, false);
  assert.equal(state.status, '6s');
  assert.equal(state.hint, 'RECHARGING');
  assert.ok(Math.abs(state.progress - (1 - 5.2 / 12)) < 1e-9);
  assert.equal(getAbilityHudState({ ...player, abilityCooldown: 50 }).progress, 0);
  assert.equal(getAbilityHudState({ ...player, abilityCooldown: -1 }).progress, 1);
});

test('dead players and rope riders never advertise availability or activation', () => {
  const dead = getAbilityHudState({ ...player, health: 0 }, { aiming: true, deployed: true });
  assert.equal(dead.state, 'dead');
  assert.equal(dead.ready, false);
  assert.equal(dead.active, false);
  const rope = getAbilityHudState({ ...player, ropeId: 'rope-1' });
  assert.equal(rope.state, 'blocked');
  assert.equal(rope.ready, false);
  assert.equal(rope.hint, 'Release with E to use power');
});

test('aiming shows throw guidance only when the Blast Pop has a landing surface', () => {
  const aiming = getAbilityHudState(player, { aiming: true, preview: { landed: true, distance: 4.8 } });
  assert.equal(aiming.state, 'aiming');
  assert.equal(aiming.active, true);
  assert.equal(aiming.ready, false);
  assert.equal(aiming.hint, '5m · LMB throw · RMB cancel');
  const invalid = getAbilityHudState(player, { aiming: true, preview: { landed: false } });
  assert.equal(invalid.status, 'AIM LOWER');
  assert.equal(invalid.hint, 'Find a surface · RMB cancel');
});

test('active powers and deployment feedback take precedence over cooldown', () => {
  const shield = getAbilityHudState({ ...player, classId: 'heavy', abilityTime: 2.3, shieldHealth: 61, abilityCooldown: 14 }, { deployed: true });
  assert.equal(shield.status, '61 SHIELD');
  assert.equal(shield.hint, '2.3s remaining');
  assert.equal(shield.active, true);
  assert.equal(shield.ready, false);
  const deployed = getAbilityHudState({ ...player, abilityCooldown: 12 }, { deployed: true });
  assert.equal(deployed.state, 'deployed');
  const active = getAbilityHudState({ ...player, classId: 'sniper', abilityTime: 2, abilityCooldown: 10 });
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.hint, '2.0s remaining');
});
