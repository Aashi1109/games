import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioFeedback, spatialAudio } from '../client/audio-feedback.js';
import { createPlayer, stepPlayer, STEP } from '../shared/simulation.js';
import { getClass } from '../shared/classes.js';

const state = (extra = {}) => ({ id: 'local', classId: 'assault', life: 0, health: 100, x: 0, y: 0, z: 0, yaw: 0,
  grounded: true, sliding: false, ropeId: null, abilityTime: 0, reloadIn: 0, ammo: 24, fired: false, fireHeld: false, ...extra });

function fixture() {
  const calls = [];
  const audio = {
    play: (kind, options = {}) => { calls.push({ kind, ...options }); return true; },
    startReload: (classId, remaining) => { calls.push({ kind: 'reload', classId, remaining }); return true; },
    stopReload: () => calls.push({ kind: 'stopReload' }),
    setSliding: (enabled) => calls.push({ kind: 'setSliding', enabled }),
    stopAll: () => calls.push({ kind: 'stopAll' }),
  };
  return { calls, audio, feedback: createAudioFeedback(audio) };
}
const sounds = (calls, kind) => calls.filter((call) => call.kind === kind);

test('spatial sound follows yaw, scales with distance on all axes, and rejects invalid values', () => {
  const listener = state();
  assert.equal(spatialAudio({ x: 2, y: 0, z: 0 }, listener).pan, 1);
  assert.equal(spatialAudio({ x: -2, y: 0, z: 0 }, listener).pan, -1);
  assert.equal(spatialAudio({ x: 0, y: 0, z: -2 }, { ...listener, yaw: Math.PI / 2 }).pan, 1);
  assert.ok(Math.abs(spatialAudio({ x: -2, y: 0, z: 0 }, { ...listener, yaw: Math.PI / 2 }).pan) < 1e-8);
  assert.deepEqual(spatialAudio(listener, listener), { volume: 1, pan: 0 });
  assert.deepEqual(spatialAudio({ x: 0, y: 5, z: 0 }, listener, 10), { volume: .25, pan: 0 });
  for (const source of [null, { x: NaN, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0 }, { x: 45, y: 0, z: 0 }]) {
    assert.equal(spatialAudio(source, listener), null);
  }
  assert.equal(spatialAudio(listener, { ...listener, yaw: NaN }), null);
  assert.equal(spatialAudio(listener, listener, 0), null);
});

test('local firing plays once per live shot, while snapshots never replay fired flags', () => {
  for (const classId of ['assault', 'sniper', 'scout', 'heavy']) {
    const { feedback, calls } = fixture();
    const before = state({ classId });
    const player = state({ classId, fired: true, ammo: 23 });
    feedback.step(before, player, { fire: true }, 1 / 60);
    feedback.sync(player);
    feedback.sync(player);
    feedback.observe([player], [], player);
    assert.deepEqual(sounds(calls, 'fire'), [{ kind: 'fire', classId }]);
    feedback.remoteShot({ type: 'shot', id: player.id, classId, from: player }, player);
    assert.equal(sounds(calls, 'fire').length, 1);
  }
});

test('manual and automatic reload start once and completion stops the sequence', () => {
  for (const automatic of [false, true]) {
    const { feedback, calls } = fixture();
    const before = state({ ammo: automatic ? 1 : 12 });
    const player = state({ ammo: automatic ? 0 : 12, fired: automatic, reloadIn: 1.35 });
    feedback.step(before, player, { fire: automatic, reload: !automatic }, 1 / 60);
    feedback.sync({ ...player, reloadIn: 1.1 });
    assert.deepEqual(sounds(calls, 'reload'), [{ kind: 'reload', classId: 'assault', remaining: 1.35 }]);
    assert.equal(sounds(calls, 'fire').length, Number(automatic));
    feedback.sync(state());
    assert.equal(sounds(calls, 'stopReload').length, 1);
  }
});

test('reload retries unavailable audio with remaining time and resumes from the current position', () => {
  const { feedback, audio, calls } = fixture();
  let ready = false;
  audio.startReload = (classId, remaining) => { calls.push({ kind: 'reload', classId, remaining }); return ready; };
  feedback.sync(state({ reloadIn: 1.3 }));
  ready = true;
  feedback.sync(state({ reloadIn: 1.1 }));
  feedback.sync(state({ reloadIn: 1 }));
  feedback.sync(state({ reloadIn: .9 }), false);
  feedback.sync(state({ reloadIn: .65 }));
  assert.deepEqual(sounds(calls, 'reload').map((call) => call.remaining), [1.3, 1.1, .65]);
  assert.equal(sounds(calls, 'stopReload').length, 1);
});

test('a sniper final shot starts its automatic reload after the firing cue so reload can cancel bolt handling', () => {
  const { feedback, calls } = fixture();
  const before = state({ classId: 'sniper', ammo: 1 });
  feedback.step(before, { ...before, ammo: 0, fired: true, reloadIn: 2.2 }, { fire: true }, 1 / 60);
  assert.deepEqual(calls.map((call) => call.kind), ['fire', 'reload']);
});

test('class changes, death, respawn and clearing stop stateful sounds without cutting later cues', () => {
  for (const next of [state({ classId: 'sniper' }), state({ life: 1 }), state({ health: 0 })]) {
    const { feedback, calls } = fixture();
    feedback.sync(state({ reloadIn: 1, sliding: true }));
    feedback.sync(next);
    assert.equal(sounds(calls, 'stopReload').length, 1);
    assert.equal(sounds(calls, 'setSliding').filter((call) => !call.enabled).length, 1);
    feedback.clear();
    feedback.sync(state({ health: 0 }));
    feedback.sync(state({ health: 0 }));
    assert.equal(sounds(calls, 'stopAll').length, 1);
  }
});

test('only a fresh empty trigger pull clicks; reloads, held fire and blocking powers stay quiet', () => {
  const { feedback, calls } = fixture();
  const empty = state({ ammo: 0 });
  feedback.step(empty, { ...empty, reloadIn: 1.35 }, { fire: true }, 1 / 60);
  for (const extra of [{ fireHeld: true }, { reloadIn: 1 }, { fireCooldown: 1 }, { classId: 'scout', abilityTime: .1 }, { classId: 'heavy', abilityTime: 2, shieldHealth: 120 }]) {
    const before = { ...empty, ...extra };
    feedback.step(before, before, { fire: true }, 1 / 60);
  }
  assert.equal(sounds(calls, 'dry-fire').length, 1);
});

test('footsteps follow actual distance and remain silent when stationary or traversal blocks walking', () => {
  const { feedback, calls } = fixture();
  let player = state();
  for (let i = 0; i < 24; i++) {
    const next = { ...player, x: player.x + .1 };
    feedback.step(player, next, {}, 1 / 60); player = next;
  }
  assert.equal(sounds(calls, 'footstep').length, 1);
  for (let i = 0; i < 40; i++) feedback.step(player, player, {}, 1 / 60);
  for (const extra of [{ grounded: false }, { sliding: true }, { ropeId: 'rope' }, { classId: 'scout', abilityTime: .1 }]) {
    const before = { ...player, ...extra };
    for (let i = 0; i < 40; i++) feedback.step(before, { ...before, x: before.x + .2 }, {}, 1 / 60);
  }
  feedback.step(player, { ...player, x: 90 }, {}, 1 / 60);
  assert.equal(sounds(calls, 'footstep').length, 1);
});

test('muted live input never fires or accumulates footstep distance; slide stops and resumes', () => {
  const { feedback, calls } = fixture();
  const before = state();
  feedback.sync({ ...before, sliding: true });
  feedback.step(before, { ...before, fired: true, x: .4 }, { fire: true }, 1 / 60, false);
  feedback.sync({ ...before, sliding: true });
  assert.equal(sounds(calls, 'fire').length, 0);
  assert.deepEqual(sounds(calls, 'setSliding').map((call) => call.enabled), [true, false, true]);
});

test('remote gunfire uses the shooter class and position, never the local weapon', () => {
  const { feedback, calls } = fixture();
  const listener = state({ classId: 'assault' });
  feedback.remoteShot({ type: 'shot', id: 'enemy', classId: 'sniper', from: { x: 4, y: 1, z: 0 } }, listener);
  feedback.remoteShot({ type: 'shot', id: 'enemy', classId: 'heavy', from: { x: 90, y: 0, z: 0 } }, listener);
  feedback.remoteShot({ type: 'shot', id: listener.id, classId: 'assault', from: listener }, listener);
  assert.equal(sounds(calls, 'fire').length, 1);
  assert.equal(calls[0].classId, 'sniper');
  assert.equal(calls[0].local, false);
  assert.equal(calls[0].pan, 1);
  assert.ok(calls[0].volume < .8);
});

test('remote footsteps and slides need real movement and reset on departure, death and life changes', () => {
  const { feedback, calls } = fixture();
  const listener = state();
  let remote = state({ id: 'remote', x: 1 });
  feedback.observe([remote], [], listener);
  for (let i = 0; i < 6; i++) {
    remote = { ...remote, x: remote.x + .4 }; feedback.observe([remote], [], listener);
  }
  assert.equal(sounds(calls, 'footstep').length, 1);
  feedback.observe([{ ...remote, x: remote.x + .3, sliding: true }], [], listener);
  assert.equal(sounds(calls, 'slide').length, 1);
  feedback.observe([], [], listener);
  feedback.observe([{ ...remote, sliding: true }], [], listener);
  feedback.observe([{ ...remote, health: 0, x: remote.x + .5 }], [], listener);
  feedback.observe([{ ...remote, life: 1, x: remote.x + 1 }], [], listener);
  feedback.observe([{ ...remote, life: 1, x: remote.x + 1 }], [], listener);
  assert.equal(sounds(calls, 'footstep').length, 1);
  assert.equal(sounds(calls, 'slide').length, 1);
});

test('Echo gunfire follows visible pulses without old-shot replay on join, pause or large snapshot gaps', () => {
  const { feedback, calls } = fixture();
  const listener = state();
  const echo = { id: 'echo1', type: 'echo', classId: 'sniper', x: 3, y: 0, z: 0, remaining: 3.4 };
  feedback.observe([], [echo], listener);
  feedback.observe([], [{ ...echo, remaining: 3.29 }], listener);
  feedback.observe([], [{ ...echo, remaining: 3.29 }], listener);
  assert.equal(sounds(calls, 'fire').length, 1);
  feedback.observe([], [{ ...echo, remaining: 1 }], listener);
  assert.equal(sounds(calls, 'fire').length, 1);
  feedback.observe([], [{ ...echo, remaining: .5 }], listener, { active: false });
  feedback.observe([], [{ ...echo, remaining: .4 }], listener);
  assert.equal(sounds(calls, 'fire').length, 1);
  assert.equal(calls[0].classId, 'sniper');
});

const arena = { size: 200, spawns: [{ x: 0, y: 0, z: 0, yaw: 0 }], boxes: [], pads: [], ropes: [], targets: [] };

test('real simulation firing and empty-magazine reload match audio for every class across a full magazine', () => {
  for (const classId of ['assault', 'sniper', 'scout', 'heavy']) {
    const { feedback, calls } = fixture();
    const loadout = getClass(classId);
    const player = createPlayer('local', 'Rookie', 0, classId, arena);
    let shots = 0, reloads = 0;
    const ticks = Math.ceil((loadout.magazine * loadout.fireInterval + loadout.reloadTime + 1) / STEP);
    for (let tick = 0; tick < ticks; tick++) {
      const before = { ...player };
      const input = { fire: loadout.automatic || tick % 2 === 0 };
      stepPlayer(player, input, STEP, arena);
      if (player.fired) shots++;
      if (before.reloadIn <= 0 && player.reloadIn > 0) reloads++;
      feedback.step(before, player, input, STEP);
      if (tick % 3 === 0) feedback.sync(player);
    }
    assert.ok(shots > loadout.magazine, `${classId} fires again after the automatic reload`);
    assert.equal(sounds(calls, 'fire').length, shots, `${classId} plays each shot exactly once`);
    assert.equal(sounds(calls, 'reload').length, reloads, `${classId} plays each reload once`);
    assert.equal(sounds(calls, 'dry-fire').length, 0, `${classId} does not click throughout an automatic reload`);
  }
});

test('real simulation held sniper trigger and active weapon-blocking powers do not make phantom shots', () => {
  for (const classId of ['sniper', 'scout', 'heavy']) {
    const { feedback, calls } = fixture();
    const player = createPlayer('local', 'Rookie', 0, classId, arena);
    for (let tick = 0; tick < 100; tick++) {
      if (classId !== 'sniper') { player.abilityTime = 2; player.shieldHealth = 120; }
      const before = { ...player }, input = { fire: true };
      stepPlayer(player, input, STEP, arena);
      feedback.step(before, player, input, STEP);
    }
    assert.equal(sounds(calls, 'fire').length, classId === 'sniper' ? 1 : 0);
    assert.equal(sounds(calls, 'dry-fire').length, 0);
  }
});
