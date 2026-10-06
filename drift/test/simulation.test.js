import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, STEP, shotRay, traceShot, MAX_AMMO, EYE_HEIGHT, CROUCH_EYE_HEIGHT } from '../shared/simulation.js';
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';

const control = (extra = {}) => ({ seq: 1, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, ...extra });
const run = (player, input, ticks) => { for (let i = 0; i < ticks; i++) stepPlayer(player, input, STEP); };

test('classes accept only explicit IDs and initialize their own magazines with identical movement', () => {
  assert.equal(DEFAULT_CLASS, 'assault');
  for (const invalid of ['__proto__', 'constructor', 'toString', 'Sniper', '', null, undefined, {}, ['sniper'], 1]) {
    assert.equal(isClassId(invalid), false);
    assert.equal(getClass(invalid).id, 'assault');
  }
  const assault = createPlayer('a', 'A');
  const sniper = createPlayer('b', 'B', 0, 'sniper');
  assert.equal(assault.ammo, 24); assert.equal(sniper.ammo, 6);
  assert.equal(sniper.classId, 'sniper'); assert.equal(sniper.nextClassId, 'sniper');
  for (const player of [assault, sniper]) {
    player.x = -27; player.z = 0;
    run(player, control({ forward: 1, sprint: true }), 20);
    run(player, control({ forward: 1, crouch: true, jump: true }), 10);
  }
  for (const field of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'health']) assert.equal(assault[field], sniper[field]);
});

test('sniper requires a fresh trigger press after both bolt cooldown and reload', () => {
  const p = createPlayer('a', 'A', 0, 'sniper');
  stepPlayer(p, control({ fire: true }));
  assert.equal(p.fired, true); assert.equal(p.ammo, 5); assert.equal(p.fireCooldown, 1.05);
  stepPlayer(p, control());
  stepPlayer(p, control({ fire: true }));
  assert.equal(p.fired, false, 'a fresh press still respects the bolt cooldown');
  run(p, control({ fire: true }), 120);
  assert.equal(p.ammo, 5, 'holding through cooldown must not queue a sniper shot');
  stepPlayer(p, control()); stepPlayer(p, control({ fire: true }));
  assert.equal(p.ammo, 4); assert.equal(p.fired, true);
  stepPlayer(p, control({ reload: true, fire: true }));
  assert.equal(p.reloadIn, 2.2); assert.equal(p.fired, false);
  run(p, control({ fire: true }), 120);
  assert.equal(p.ammo, 4, 'sniper reload takes longer than two seconds');
  run(p, control({ fire: true }), 20);
  assert.equal(p.reloadIn, 0); assert.equal(p.ammo, 6);
  stepPlayer(p, control()); stepPlayer(p, control({ fire: true }));
  assert.equal(p.ammo, 5);
  p.ammo = 0; stepPlayer(p, control()); stepPlayer(p, control({ fire: true }));
  assert.equal(p.fired, false); assert.equal(p.ammo, 0);
});

test('sniper trigger state survives authoritative snapshots and prediction replay', () => {
  const authoritative = createPlayer('a', 'A', 0, 'sniper');
  run(authoritative, control({ fire: true }), 30);
  const predicted = structuredClone(authoritative);
  assert.equal(predicted.fireHeld, true);
  for (let seq = 30; seq < 170; seq++) {
    const input = control({ seq, fire: seq !== 95, reload: seq === 130 });
    stepPlayer(authoritative, input); stepPlayer(predicted, input);
  }
  assert.deepEqual(predicted, authoritative);
  assert.equal(predicted.ammo, 4, 'replaying held fire must not add a shot');
});

test('each class obeys its magazine, reload duration, and firing cadence', () => {
  for (const loadout of Object.values(CLASSES)) {
    const p = createPlayer(loadout.id, loadout.name, 0, loadout.id);
    assert.equal(p.ammo, loadout.magazine);
    stepPlayer(p, control({ fire: true }));
    assert.equal(p.fireCooldown, loadout.fireInterval);
    let shots = 1; let lastShot = 0;
    for (let tick = 1; tick <= 180; tick++) {
      stepPlayer(p, control({ fire: true }));
      if (p.fired) {
        assert.ok((tick - lastShot) * STEP >= loadout.fireInterval - 0.0001, `${loadout.id} fired too early`);
        assert.ok((tick - lastShot) * STEP <= loadout.fireInterval + STEP, `${loadout.id} fired too late`);
        lastShot = tick; shots++;
      }
    }
    assert.equal(p.ammo, loadout.magazine - shots);
    if (loadout.automatic) assert.ok(shots > 1); else assert.equal(shots, 1);
    stepPlayer(p, control({ reload: true }));
    assert.equal(p.reloadIn, loadout.reloadTime);
    const reloadTicks = Math.ceil(loadout.reloadTime / STEP);
    run(p, control({ reload: true }), reloadTicks - 1);
    assert.ok(p.reloadIn > 0, `${loadout.id} reloaded early`);
    assert.equal(p.ammo, loadout.magazine - shots);
    stepPlayer(p, control({ reload: true }));
    assert.equal(p.reloadIn, 0); assert.equal(p.ammo, loadout.magazine);
    stepPlayer(p, control({ reload: true, fire: true }));
    assert.equal(p.fired, true);
    stepPlayer(p, control({ reload: true }));
    assert.equal(p.reloadIn, 0, 'holding reload must not restart it after firing');
    stepPlayer(p, control()); stepPlayer(p, control({ reload: true }));
    assert.equal(p.reloadIn, loadout.reloadTime);
  }
});

test('empty magazines automatically reload once using the active class duration', () => {
  for (const loadout of Object.values(CLASSES)) {
    const p = createPlayer('a', 'A', 0, loadout.id);
    p.ammo = 1;
    stepPlayer(p, control({ fire: true }));
    assert.equal(p.fired, true, 'the final round must still fire');
    assert.equal(p.ammo, 0);
    assert.equal(p.reloadIn, loadout.reloadTime);
    p.nextClassId = loadout.id === 'heavy' ? 'scout' : 'heavy';
    const ticks = Math.ceil(loadout.reloadTime / STEP);
    for (let tick = 1; tick < ticks; tick++) {
      stepPlayer(p, control({ fire: true, reload: tick % 2 === 0 }));
      assert.equal(p.fired, false, 'fire must stay blocked throughout reload');
      assert.equal(p.ammo, 0);
      assert.ok(p.reloadIn > 0 && p.reloadIn < loadout.reloadTime, 'repeated reload requests must not restart the timer');
    }
    stepPlayer(p, control());
    assert.equal(p.reloadIn, 0);
    assert.equal(p.ammo, loadout.magazine, 'queued classes must not change the active magazine');
    stepPlayer(p, control());
    assert.equal(p.reloadIn, 0, 'a full magazine must not reload again');
  }
});

test('held automatic fire resumes after autoreload while sniper needs a fresh press', () => {
  for (const loadout of Object.values(CLASSES)) {
    const p = createPlayer('a', 'A', 0, loadout.id);
    p.ammo = 1;
    stepPlayer(p, control({ fire: true }));
    run(p, control({ fire: true }), Math.ceil(loadout.reloadTime / STEP));
    assert.equal(p.reloadIn, 0);
    assert.equal(p.fired, loadout.automatic);
    assert.equal(p.ammo, loadout.magazine - Number(loadout.automatic));
    if (!loadout.automatic) {
      run(p, control({ fire: true }), 90);
      assert.equal(p.ammo, loadout.magazine);
      stepPlayer(p, control()); stepPlayer(p, control({ fire: true }));
      assert.equal(p.fired, true); assert.equal(p.ammo, loadout.magazine - 1);
    }
  }
});

test('autoreload handles an already empty weapon but leaves partial magazines and dead players alone', () => {
  const p = createPlayer('a', 'A');
  p.ammo = 5;
  stepPlayer(p, control());
  assert.equal(p.reloadIn, 0);
  p.ammo = 0;
  stepPlayer(p, control());
  assert.equal(p.reloadIn, getClass(p.classId).reloadTime);
  p.health = 0;
  const remaining = p.reloadIn;
  run(p, control({ fire: true, reload: true }), 180);
  assert.equal(p.reloadIn, remaining); assert.equal(p.ammo, 0);
  p.reloadIn = 0;
  stepPlayer(p, control());
  assert.equal(p.reloadIn, 0, 'dead players must not start reloading');
});

test('movement uses camera direction, normalizes diagonals, and stops at arena walls', () => {
  const straight = createPlayer('a', 'A');
  const diagonal = createPlayer('b', 'B');
  straight.x = diagonal.x = -27; straight.z = diagonal.z = 0;
  run(straight, control({ forward: 1 }), 30);
  run(diagonal, control({ forward: 1, strafe: 1 }), 30);
  assert.ok(Math.abs(Math.hypot(diagonal.x + 27, diagonal.z) - Math.abs(straight.z)) < 0.05);
  run(straight, control({ forward: 1, sprint: true }), 1200);
  assert.ok(straight.z >= -31.2, `escaped arena: ${straight.z}`);
  assert.ok(Number.isFinite(straight.y));
});

test('jump needs a new press, while sprint-to-slide carries momentum', () => {
  const p = createPlayer('a', 'A'); p.x = -27; p.z = 0;
  run(p, control({ forward: 1, sprint: true }), 30);
  const speed = Math.hypot(p.vx, p.vz);
  stepPlayer(p, control({ forward: 1, sprint: true, crouch: true }), STEP);
  assert.equal(p.sliding, true);
  assert.ok(Math.hypot(p.vx, p.vz) > speed);
  run(p, control({ jump: true }), 120);
  assert.equal(p.grounded, true, 'held jump must not automatically jump again');
  assert.ok(Math.abs(p.y) < 0.001);
});

test('jump pads propel a player and never allow falling through the floor', () => {
  const p = createPlayer('a', 'A'); p.x = -25; p.z = 18;
  stepPlayer(p, control(), STEP);
  assert.ok(p.vy >= 15);
  assert.ok(p.vz < 0);
  run(p, control(), 240);
  assert.ok(p.y >= 0);
});

test('shots obey ammunition, automatic fire cadence, reload delay, and death', () => {
  const p = createPlayer('a', 'A');
  let shots = 0;
  for (let i = 0; i < 60; i++) { stepPlayer(p, control({ fire: true }), STEP); shots += Number(p.fired); }
  assert.ok(shots >= 6 && shots <= 7, `shots in one second: ${shots}`);
  assert.equal(p.ammo, MAX_AMMO - shots);
  stepPlayer(p, control({ reload: true }), STEP);
  assert.ok(p.reloadIn > 0);
  assert.equal(p.fired, false);
  run(p, control(), 100);
  assert.equal(p.ammo, MAX_AMMO);
  p.health = 0;
  stepPlayer(p, control({ fire: true, forward: 1 }), STEP);
  assert.equal(p.fired, false);
  assert.equal(p.ammo, MAX_AMMO);
});

test('ray shooting selects first visible opponent and respects solid cover', () => {
  const shooter = createPlayer('a', 'A'); shooter.x = -27; shooter.z = 15;
  const victim = createPlayer('b', 'B'); victim.x = -27; victim.z = 10;
  assert.equal(traceShot(shooter, [shooter, victim]).hit, 'b');
  shooter.x = victim.x = 0; shooter.z = 12; victim.z = -12;
  // Aim at body height through central raised platform and pillar-free opening: low shot is blocked.
  shooter.pitch = -0.08;
  assert.equal(traceShot(shooter, [victim]).hit, undefined);
  shooter.x = victim.x = -16; shooter.z = 2; victim.z = -22; shooter.pitch = 0;
  assert.equal(traceShot(shooter, [victim]).hit, undefined, 'terrace must block shots');
});

test('surface impacts report outward normals for walls, floor, and beam underside', () => {
  const cases = [
    { pose: { x: -27, z: 15 }, normal: { x: 0, y: 0, z: 1 }, style: 'wall', axis: 'z', position: -31.5 },
    { pose: { x: -27, z: 15, yaw: Math.PI }, normal: { x: 0, y: 0, z: -1 }, style: 'wall', axis: 'z', position: 31.5 },
    { pose: { x: -27, z: 0, yaw: Math.PI / 2 }, normal: { x: 1, y: 0, z: 0 }, style: 'wall', axis: 'x', position: -31.5 },
    { pose: { x: 27, z: 0, yaw: -Math.PI / 2 }, normal: { x: -1, y: 0, z: 0 }, style: 'wall', axis: 'x', position: 31.5 },
    { pose: { x: -27, z: 0, pitch: -Math.PI / 2 }, normal: { x: 0, y: 1, z: 0 }, style: 'floor', axis: 'y', position: 0 },
    { pose: { x: 0, y: 3, z: 0, pitch: Math.PI / 2 }, normal: { x: 0, y: -1, z: 0 }, style: 'beam', axis: 'y', position: 5.8 },
  ];
  for (const { pose, normal, style, axis, position } of cases) {
    const shot = traceShot(Object.assign(createPlayer('a', 'A'), pose), []);
    assert.deepEqual(shot.surface, { normal, style });
    assert.ok(Math.abs(shot.to[axis] - position) < 1e-8);
    assert.equal(shot.hit, undefined);
  }
});

test('surface feedback belongs only to the closest solid hit, including grazing and face-origin rays', () => {
  const shooter = Object.assign(createPlayer('a', 'A'), { x: -16, z: 2 });
  const victim = Object.assign(createPlayer('b', 'B'), { x: -16, z: -22 });
  const covered = traceShot(shooter, [victim]);
  assert.deepEqual(covered.surface, { normal: { x: 0, y: 0, z: 1 }, style: 'terrace' });
  assert.equal(covered.to.z, -5);
  assert.equal(covered.hit, undefined);
  shooter.x = -22.5;
  assert.deepEqual(traceShot(shooter, []).surface, covered.surface, 'a parallel ray on a box edge still hits its front face');
  shooter.x = -16; shooter.z = -5;
  assert.deepEqual(traceShot(shooter, []).surface, covered.surface, 'a ray entering exactly on a face has a valid normal');
  shooter.yaw = Math.PI;
  assert.deepEqual(traceShot(shooter, []).surface, covered.surface, 'a ray leaving exactly on a face has the same outward normal');
  shooter.z = -10;
  assert.equal(traceShot(shooter, []).surface, undefined, 'an origin embedded in cover must not invent a surface');
});

test('opponents, targets, and range-limited misses never receive world surface feedback', () => {
  const shooter = Object.assign(createPlayer('a', 'A'), { x: -27, z: 15 });
  const victim = Object.assign(createPlayer('b', 'B'), { x: -27, z: 10 });
  const opponent = traceShot(shooter, [victim]);
  assert.equal(opponent.hit, 'b');
  assert.equal(opponent.surface, undefined);
  Object.assign(shooter, { x: 10, z: -18 });
  const target = traceShot(shooter, []);
  assert.equal(target.hit, 'target-c');
  assert.equal(target.surface, undefined);
  for (const pose of [{ x: -27, y: 10, z: 0 }, { x: -27, y: 0, z: 150 }]) {
    Object.assign(shooter, pose);
    const miss = traceShot(shooter, []);
    assert.equal(miss.hit, undefined);
    assert.equal(miss.surface, undefined);
    assert.equal(Math.hypot(miss.to.x - miss.from.x, miss.to.y - miss.from.y, miss.to.z - miss.from.z), 100);
  }
});

test('simulation preserves deterministic reconciliation when commands are replayed', () => {
  const original = createPlayer('a', 'A'); original.x = -27; original.z = 0;
  const predicted = structuredClone(original);
  for (let i = 0; i < 100; i++) {
    const input = control({ seq: i, forward: 1, yaw: i * 0.002, sprint: true, jump: i === 20 });
    stepPlayer(original, input, STEP); stepPlayer(predicted, input, STEP);
  }
  assert.deepEqual(original, predicted);
});

test('ceiling collisions stop upward velocity and mantling reaches low ledges', () => {
  const ceiling = createPlayer('ceiling', 'A');
  Object.assign(ceiling, { x: 0, y: 3.9, z: 0, vy: 8, grounded: false });
  stepPlayer(ceiling, control(), STEP);
  assert.ok(ceiling.y <= 4.0001, `head entered beam: ${ceiling.y}`);
  assert.equal(ceiling.vy, 0);
  const mantle = createPlayer('mantle', 'B');
  Object.assign(mantle, { x: 0, y: 0, z: 4.6 });
  run(mantle, control({ forward: 1, jump: true }), 30);
  assert.ok(mantle.z < 4, 'jump must move onto central ledge');
  assert.ok(mantle.y >= 1.2, 'mantle must not embed the player in cover');
});

test('repeated slide entry cannot stack boosts beyond the movement speed limit', () => {
  const p = createPlayer('slider', 'A');
  Object.assign(p, { x: -28, y: 0, z: 28 });
  let fastest = 0;
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, control({ forward: 1, sprint: true, crouch: i >= 20 && i % 2 === 0 }), STEP);
    fastest = Math.max(fastest, Math.hypot(p.vx, p.vz));
  }
  assert.ok(fastest > 10, 'a normal slide should still boost sprint speed');
  assert.ok(fastest <= 14, `repeated crouch stacked slide speed to ${fastest}`);
});

test('slide entry ramps speed and naturally decays through the former timed cutoff', () => {
  const p = Object.assign(createPlayer('slider', 'A'), { x: -28, z: 12, vz: -10 });
  stepPlayer(p, control({ forward: 1, crouch: true }));
  assert.equal(p.sliding, true);
  assert.ok(-p.vz > 10 && -p.vz < 10.4, 'slide entry must spread its push across several ticks');
  let previous = Math.hypot(p.vx, p.vz);
  for (let tick = 1; tick < 120; tick++) {
    stepPlayer(p, control({ forward: 1, crouch: true }));
    const speed = Math.hypot(p.vx, p.vz);
    assert.ok(Math.abs(speed - previous) < 0.4, `slide speed snapped at tick ${tick}`);
    if (tick >= 8) assert.ok(speed <= previous + 1e-8, 'forward steering must not add slide speed');
    if (tick === 51) assert.equal(p.sliding, true, 'the old 850ms cutoff must not end a healthy slide');
    previous = speed;
  }
  assert.equal(p.sliding, false);
  assert.ok(Math.abs(previous - 3.2) < 0.001);
});

test('slide steering is limited and release/repress cannot restart the entry push', () => {
  const p = Object.assign(createPlayer('slider', 'A'), { x: -28, z: 12, vz: -10 });
  stepPlayer(p, control({ forward: 1, crouch: true }));
  const before = Math.atan2(p.vx, -p.vz);
  stepPlayer(p, control({ strafe: 1, crouch: true }));
  const after = Math.atan2(p.vx, -p.vz);
  assert.ok(after > before && after - before < 0.03);
  stepPlayer(p, control({ forward: 1, sprint: true }));
  assert.equal(p.sliding, false); assert.equal(p.slideBoost, 0);
  stepPlayer(p, control({ forward: 1, sprint: true, crouch: true }));
  assert.equal(p.sliding, false, 'crouch spam must respect the slide cooldown');
  assert.equal(p.slideBoost, 0);
});

test('slide jump preserves momentum, air steering caps speed, and crouched landings add no boost', () => {
  const p = Object.assign(createPlayer('slider', 'A'), { x: -28, z: 20, vz: -10 });
  run(p, control({ forward: 1, crouch: true }), 8);
  const takeoffSpeed = Math.hypot(p.vx, p.vz);
  stepPlayer(p, control({ jump: true, forward: 1 }));
  assert.equal(p.grounded, false); assert.equal(p.sliding, false);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - takeoffSpeed) < 1e-8, 'jump must precede grounded deceleration');
  for (let tick = 0; tick < 60 && !p.grounded; tick++) {
    stepPlayer(p, control({ forward: 1, strafe: 0.15, sprint: true, crouch: true }));
    assert.ok(Math.hypot(p.vx, p.vz) <= takeoffSpeed + 1e-8, 'air steering must not stack momentum');
  }
  assert.equal(p.grounded, true); assert.equal(p.sliding, true);
  assert.equal(p.slideBoost, 0, 'landing must not grant another entry push');
  const landedSpeed = Math.hypot(p.vx, p.vz);
  stepPlayer(p, control({ forward: 1, crouch: true }));
  assert.ok(Math.hypot(p.vx, p.vz) < landedSpeed);
});

test('jump tolerates ledge edges and buffers a press before landing without repeating held jumps', () => {
  const edge = Object.assign(createPlayer('edge', 'A'), { x: 0, y: 1.2, z: 4.34, vz: 7 });
  stepPlayer(edge, control({ forward: -1 }));
  assert.equal(edge.grounded, false);
  run(edge, control(), 2);
  stepPlayer(edge, control({ jump: true }));
  assert.ok(edge.vy > 8, 'a jump within 100ms of the edge must work');
  assert.equal(edge.coyoteTime, 0);
  stepPlayer(edge, control()); stepPlayer(edge, control({ jump: true }));
  assert.ok(edge.vy < 8, 'coyote time must not permit a second air jump');

  const expired = Object.assign(createPlayer('late', 'A'), { x: -28, y: 3, grounded: false, coyoteTime: 0.1 });
  run(expired, control(), 8); stepPlayer(expired, control({ jump: true }));
  assert.ok(expired.vy < 0, 'expired coyote time must not permit an air jump');

  const buffered = Object.assign(createPlayer('buffered', 'A'), { x: -28, z: 0, y: 0.2, vy: -3, grounded: false });
  stepPlayer(buffered, control({ jump: true }));
  assert.ok(buffered.jumpBuffer > 0);
  run(buffered, control({ jump: true }), 4);
  assert.ok(buffered.vy > 7, 'a press just before landing must jump on contact');
  run(buffered, control({ jump: true }), 120);
  assert.equal(buffered.grounded, true); assert.equal(buffered.y, 0);
});

test('jump pads cancel slide drag and prevent a second coyote jump', () => {
  const p = Object.assign(createPlayer('pad', 'A'), { x: -25, z: 18, sliding: true, slideBoost: 2, vx: 0, vz: -10 });
  stepPlayer(p, control({ crouch: true }));
  assert.equal(p.sliding, false); assert.equal(p.slideBoost, 0); assert.equal(p.coyoteTime, 0);
  const launchSpeed = Math.hypot(p.vx, p.vz);
  stepPlayer(p, control({ crouch: true, jump: true }));
  assert.ok(p.vy > 15, 'a coyote jump must not replace the pad impulse');
  assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - launchSpeed) < 1e-8, 'slide friction must not continue in flight');
});

test('stance sight height eases both ways, matches shot origin, and stays below low ceilings', () => {
  const p = Object.assign(createPlayer('eye', 'A'), { x: -28, z: 0 });
  assert.equal(p.eyeHeight, EYE_HEIGHT);
  stepPlayer(p, control({ crouch: true }));
  assert.ok(p.eyeHeight < EYE_HEIGHT && p.eyeHeight > 1.45, 'crouch must not snap the eye down by 0.6m');
  assert.equal(shotRay(p).origin.y, p.y + p.eyeHeight);
  run(p, control({ crouch: true }), 25);
  assert.ok(Math.abs(p.eyeHeight - CROUCH_EYE_HEIGHT) < 0.005);
  stepPlayer(p, control());
  assert.ok(p.eyeHeight > CROUCH_EYE_HEIGHT && p.eyeHeight < 1.15, 'standing must ease upward');
  run(p, control(), 25);
  assert.ok(Math.abs(p.eyeHeight - EYE_HEIGHT) < 0.005);

  Object.assign(p, { x: 0, y: 4.5, z: 0, vy: 0, eyeHeight: EYE_HEIGHT });
  stepPlayer(p, control({ crouch: true }));
  assert.equal(p.crouching, true);
  assert.ok(shotRay(p).origin.y <= 5.72 + 1e-8, 'transitioning beneath a beam must clamp the sight line immediately');
  stepPlayer(p, control());
  assert.equal(p.crouching, true, 'release must keep the collider crouched until there is headroom');
  assert.ok(shotRay(p).origin.y < 5.8);
});

test('movement transition state survives authoritative snapshots and prediction replay', () => {
  const authoritative = Object.assign(createPlayer('replay', 'A'), { x: -28, z: 20, vz: -10 });
  run(authoritative, control({ crouch: true, forward: 1 }), 3);
  const predicted = JSON.parse(JSON.stringify(authoritative));
  assert.ok(predicted.slideBoost > 0 && predicted.eyeHeight < EYE_HEIGHT);
  for (let seq = 0; seq < 90; seq++) {
    const input = control({ seq, forward: 1, crouch: seq !== 10, jump: seq === 10, sprint: true, yaw: seq * 0.002 });
    stepPlayer(authoritative, input); stepPlayer(predicted, input);
    assert.deepEqual(predicted, authoritative);
    assert.deepEqual(shotRay(predicted), shotRay(authoritative));
  }
});
