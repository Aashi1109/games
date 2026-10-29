import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrouchInput } from '../client/crouch-input.ts';
import { createPlayer, stepPlayer, STEP } from '../shared/simulation.ts';

const arena = {
  size: 200, boxes: [], pads: [], ropes: [], targets: [],
  spawns: [{ x: 0, y: 0, z: 30, yaw: 0 }],
};

function controls() {
  const keys = new Set();
  const crouch = createCrouchInput();
  let sequence = 0;
  return {
    keys, crouch,
    down(code, repeat = false) { keys.add(code); crouch.press(code, repeat); },
    up(code) { keys.delete(code); },
    sample() {
      return {
        seq: ++sequence, yaw: 0, pitch: 0,
        forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
        jump: keys.has('Space'), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        crouch: crouch.read(keys), fire: false, reload: false,
      };
    },
    step(player, ticks = 1) {
      for (let tick = 0; tick < ticks; tick++) stepPlayer(player, this.sample(), STEP, arena);
    },
  };
}

const movingPlayer = () => Object.assign(createPlayer('runner', 'Runner', 0, 'assault', arena), { vz: -10 });

test('tapping C carries a slide after release and a second tap exits it', () => {
  const input = controls();
  const player = movingPlayer();
  input.down('KeyW'); input.down('ShiftLeft'); input.down('KeyC'); input.step(player);
  assert.equal(player.sliding, true);
  input.up('KeyC'); input.step(player, 8);
  assert.equal(player.sliding, true, 'releasing toggle crouch must keep the slide active');
  assert.equal(player.crouching, true, 'the sliding collider must remain crouched');
  input.down('KeyC'); input.step(player);
  assert.equal(player.sliding, false);
  assert.equal(player.crouching, false);
  assert.equal(player.slideBoost, 0);
});

test('either Ctrl key holds a slide only until the key is released', () => {
  for (const key of ['ControlLeft', 'ControlRight']) {
    const input = controls();
    const player = movingPlayer();
    input.down(key); input.step(player, 8);
    assert.equal(player.sliding, true, `${key} must start and hold the slide`);
    input.up(key); input.step(player);
    assert.equal(player.sliding, false, `${key} release must end the slide`);
    assert.equal(player.crouching, false);
    assert.equal(player.slideBoost, 0);
  }
});

test('keyboard repeat and unrelated keys do not change toggle crouch', () => {
  const input = controls();
  input.down('KeyC');
  for (const key of ['KeyC', 'Space', 'ShiftLeft', 'ShiftRight']) input.down(key, true);
  input.down('KeyW'); input.down('KeyQ');
  assert.equal(input.sample().crouch, true);
  input.up('KeyC'); input.down('KeyC');
  assert.equal(input.sample().crouch, false, 'a fresh C press must still switch the toggle off');
});

test('C also toggles ordinary crouching when there is not enough speed to slide', () => {
  const input = controls();
  const player = createPlayer('slow', 'Slow', 0, 'assault', arena);
  input.down('KeyC'); input.step(player);
  input.up('KeyC'); input.step(player, 12);
  assert.equal(player.sliding, false);
  assert.equal(player.crouching, true);
  input.down('KeyC'); input.step(player);
  assert.equal(player.crouching, false);
});

test('Space clears toggle crouch and jumps out of a slide without deleting momentum', () => {
  const input = controls();
  const player = movingPlayer();
  input.down('KeyW'); input.down('KeyC'); input.step(player, 8);
  input.up('KeyC');
  const speed = Math.hypot(player.vx, player.vz);
  input.down('Space'); input.step(player);
  assert.equal(input.sample().crouch, false);
  assert.equal(player.sliding, false);
  assert.equal(player.grounded, false);
  assert.ok(player.vy > 8);
  assert.ok(Math.abs(Math.hypot(player.vx, player.vz) - speed) < 1e-8);
  input.up('Space'); input.step(player);
  assert.equal(player.crouching, false, 'the jump must not leave crouch toggled on');
});

test('a fresh press of either sprint key cancels toggle crouch and its slide', () => {
  for (const key of ['ShiftLeft', 'ShiftRight']) {
    const input = controls();
    const player = movingPlayer();
    input.down('KeyW'); input.down('KeyC'); input.step(player, 8);
    input.up('KeyC'); input.down(key); input.step(player);
    assert.equal(player.sliding, false, `${key} should cancel a toggled slide`);
    assert.equal(player.crouching, false);
    assert.equal(input.sample().crouch, false);
  }
});

test('held Ctrl remains independent of the C toggle, jumping, and sprint cancellation', () => {
  const input = controls();
  input.down('ControlLeft'); input.down('KeyC'); input.up('KeyC'); input.down('KeyC');
  assert.equal(input.sample().crouch, true, 'switching C off must not release held Ctrl');
  input.up('KeyC'); input.down('KeyC'); input.down('Space');
  assert.equal(input.sample().crouch, true, 'jumping clears the toggle but not held Ctrl');
  input.up('ControlLeft');
  assert.equal(input.sample().crouch, false);
  input.up('KeyC'); input.down('KeyC'); input.down('ControlRight'); input.down('ShiftRight');
  assert.equal(input.sample().crouch, true, 'sprinting clears the toggle but not held Ctrl');
  input.up('ControlRight');
  assert.equal(input.sample().crouch, false);
});

test('reset prevents toggle crouch leaking across control sessions', () => {
  const input = controls();
  input.down('KeyC'); input.up('KeyC');
  assert.equal(input.sample().crouch, true);
  input.crouch.reset(); input.keys.clear();
  assert.equal(input.sample().crouch, false);
  input.down('KeyC');
  assert.equal(input.sample().crouch, true, 'the next session must begin with toggle crouch off');
});

test('resolved crouch inputs replay identically from an authoritative snapshot', () => {
  const input = controls();
  const authoritative = movingPlayer();
  input.down('KeyW'); input.down('KeyC'); input.step(authoritative, 3); input.up('KeyC');
  const predicted = JSON.parse(JSON.stringify(authoritative));
  for (let tick = 0; tick < 100; tick++) {
    if (tick === 8) input.down('Space');
    if (tick === 9) input.up('Space');
    if (tick === 20) input.down('ControlLeft');
    if (tick === 60) input.up('ControlLeft');
    if (tick === 65) input.down('KeyC');
    if (tick === 66) input.up('KeyC');
    if (tick === 75) input.down('ShiftLeft');
    const command = input.sample();
    assert.equal(typeof command.crouch, 'boolean');
    stepPlayer(predicted, command, STEP, arena);
    stepPlayer(authoritative, JSON.parse(JSON.stringify(command)), STEP, arena);
    assert.deepEqual(predicted, authoritative);
  }
});
