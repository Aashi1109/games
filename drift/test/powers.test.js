import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createPlayer, stepPlayer, traceShot, STEP } from '../shared/simulation.js';
import { getPower, createPowerEffect, stepPowerEffects, resolvePowerShot } from '../shared/powers.js';
import * as powers from '../shared/powers.js';
import { createGameServer, sanitizeInput } from '../server/index.js';
import { createBotController } from '../server/bots.js';
import { createMovementStyle } from '../client/movement-style.js';

const map = { size: 64, spawns: [{ x: 0, y: 0, z: 0, yaw: 0 }], boxes: [], pads: [], ropes: [], targets: [] };
const input = (extra = {}) => ({ seq: 1, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, interact: false, ability: false, ...extra });
const player = (classId = 'assault', id = classId) => createPlayer(id, id, 0, classId, map);
const run = (p, controls, ticks, arena = map) => { for (let i = 0; i < ticks; i++) stepPlayer(p, controls, STEP, arena); };

test('powers are class-specific; network accepts only a boolean request, never forged power state', () => {
  assert.deepEqual(['assault', 'sniper', 'scout', 'heavy'].map((id) => getPower(id).name), ['Blast Pop', 'Echo', 'Air Juke', 'Bulwark']);
  assert.equal(getPower('__proto__').id, 'blast-pop');
  assert.equal(sanitizeInput(input({ ability: 'yes' })), null);
  const safe = sanitizeInput(input({ ability: true, shieldHealth: 999, abilityCooldown: 0 }));
  assert.equal(safe.ability, true); assert.equal(safe.shieldHealth, undefined); assert.equal(safe.abilityCooldown, undefined);
});

test('activation is edge-triggered, cooldown-limited, dead/rope-safe and deterministic after reconciliation', () => {
  for (const id of ['assault', 'sniper', 'scout', 'heavy']) {
    const a = player(id); stepPlayer(a, input({ ability: true }), STEP, map);
    assert.equal(a.abilityUsed, true); assert.equal(a.abilitySeq, 1); assert.equal(a.abilityCooldown, getPower(id).cooldown);
    const b = structuredClone(a);
    for (let seq = 2; seq < 100; seq++) {
      const controls = input({ seq, ability: true, strafe: seq % 2, fire: true });
      stepPlayer(a, controls, STEP, map); stepPlayer(b, controls, STEP, map);
    }
    assert.deepEqual(a, b); assert.equal(a.abilitySeq, 1);
    a.abilityCooldown = 0; stepPlayer(a, input({ ability: true }), STEP, map);
    assert.equal(a.abilityUsed, false, 'holding Q cannot auto-repeat after cooldown');
    stepPlayer(a, input(), STEP, map); stepPlayer(a, input({ ability: true }), STEP, map);
    assert.equal(a.abilitySeq, 2);
    const dead = player(id); dead.health = 0; stepPlayer(dead, input({ ability: true }), STEP, map); assert.equal(dead.abilitySeq, 0);
    const riding = player(id); riding.ropeId = 'line'; stepPlayer(riding, input({ ability: true }), STEP, map); assert.equal(riding.abilitySeq, 0);
  }
});

test('Air Juke bursts in the requested direction, blocks firing, and cannot cross a thin wall', () => {
  const p = player('scout'); p.y = 3; p.grounded = false;
  const wall = { ...map, boxes: [{ x: 0.6, y: 0, z: 0, w: .02, h: 8, d: 8 }] };
  stepPlayer(p, input({ ability: true, strafe: 1, fire: true }), .05, wall);
  assert.ok(p.x <= .24 + 1e-5); assert.equal(p.fired, false); assert.equal(p.ammo, 36);
  const open = player('scout'); open.y = 3; open.grounded = false;
  stepPlayer(open, input({ ability: true, strafe: -1 }), STEP, map);
  assert.equal(open.vx, -18); assert.equal(open.vz, 0);
  run(open, input(), 14); assert.ok(Math.hypot(open.vx, open.vz) <= 10 + 1e-6);
});

test('Air Juke preserves launch momentum after its burst without stacking speed or reviving a wall impact', () => {
  const p = player('scout'); Object.assign(p, { y: 12, grounded: false, vx: 20, vz: 0 });
  stepPlayer(p, input({ ability: true, forward: 1 }), STEP, map);
  assert.ok(Math.hypot(p.vx, p.vz) >= 20, 'redirecting pad momentum must not slow the active burst');
  const replay = structuredClone(p);
  for (let tick = 0; tick < 12; tick++) { stepPlayer(p, input(), STEP, map); stepPlayer(replay, input(), STEP, map); }
  assert.deepEqual(p, replay); assert.ok(Math.abs(Math.hypot(p.vx, p.vz) - 20) < 1e-6);
  p.abilityCooldown = 0;
  stepPlayer(p, input({ ability: true, strafe: 1 }), STEP, map); run(p, input(), 12);
  assert.ok(Math.hypot(p.vx, p.vz) <= 20 + 1e-6, 'another burst redirects existing speed instead of adding to it');
  const wall = { ...map, boxes: [{ x: 1, y: 0, z: 0, w: .02, h: 20, d: 10 }] };
  const blocked = player('scout'); Object.assign(blocked, { y: 5, grounded: false, vx: 20 });
  stepPlayer(blocked, input({ ability: true, strafe: 1 }), STEP, wall); run(blocked, input(), 12, wall);
  assert.ok(blocked.x <= .64 + 1e-6); assert.equal(blocked.vx, 0, 'expiry cannot restore speed removed by collision');
});

test('aimed Blast Pop reaches a chosen distant spot; only looking down places it near the owner', () => {
  const ranges = [];
  for (const pitch of [0, .6, -1.2]) {
    const owner = player(); stepPlayer(owner, input({ ability: true, pitch }), STEP, map);
    const effects = [createPowerEffect(owner)]; const events = [];
    for (let tick = 0; tick < 300 && effects.length; tick++) events.push(...stepPowerEffects(effects, [owner], STEP, map));
    const pop = events.find((event) => event.action === 'pop');
    assert.ok(pop);
    if (pitch < 0) assert.ok(owner.vy > 7, 'deliberate close placement still allows self-launch');
    else assert.equal(owner.vy, 0, 'a distant aimed throw must not automatically launch its stationary owner');
    assert.equal(owner.health, 100); assert.equal(owner.abilityCooldown, 12); assert.equal(effects.length, 0);
    assert.equal(owner.abilityTime, 0, 'the server clears active status when the puck pops');
    ranges.push(Math.hypot(pop.x, pop.z));
  }
  assert.ok(ranges[0] >= 10 && ranges[0] <= 15, `level range ${ranges[0]}`);
  assert.ok(ranges[1] >= 17 && ranges[1] <= 20, `lofted range ${ranges[1]}`);
  assert.ok(ranges[2] < 3, `look-down range ${ranges[2]}`);
  const owner = player(); stepPlayer(owner, input({ ability: true, yaw: Math.PI / 2 }), STEP, map);
  const puck = createPowerEffect(owner); assert.ok(puck.vx < 0); assert.ok(Math.abs(puck.vz) < 1e-6);
});

test('Blast Pop starts its full warning after first impact, stays there and never damages players', () => {
  const owner = player(); stepPlayer(owner, input({ ability: true, pitch: .6 }), STEP, map);
  const effect = createPowerEffect(owner), effects = [effect];
  for (let tick = 0; tick < 80; tick++) {
    assert.equal(stepPowerEffects(effects, [owner], STEP, map).length, 0);
  }
  assert.equal(effect.landed, false, 'a lofted puck must not detonate on its old .65s airborne fuse');
  while (!effect.landed) {
    assert.equal(stepPowerEffects(effects, [owner], STEP, map).length, 0);
  }
  assert.equal(effect.remaining, getPower('assault').fuse);
  assert.deepEqual(effect.normal, { x: 0, y: 1, z: 0 });
  assert.deepEqual([effect.vx, effect.vy, effect.vz], [0, 0, 0]);
  const landing = { x: effect.x, y: effect.y, z: effect.z };
  const target = player('heavy', 'target'); Object.assign(target, { x: effect.x, z: effect.z });
  for (let tick = 0; tick < 38; tick++) {
    assert.equal(stepPowerEffects(effects, [owner, target], STEP, map).length, 0);
    assert.deepEqual({ x: effect.x, y: effect.y, z: effect.z }, landing);
  }
  const events = stepPowerEffects(effects, [owner, target], STEP, map);
  assert.equal(events[0].action, 'pop'); assert.equal(effects.length, 0);
  assert.ok(target.vy > 7); assert.equal(target.health, 100); assert.equal(owner.health, 100);
  assert.equal(owner.abilityCooldown, 12);
});

test('Blast Pop preview and server agree on floor, platform, thin wall, ceiling, boundary and high throws', () => {
  const cases = [
    { name: 'floor', pitch: 0, arena: map, normal: { x: 0, y: 1, z: 0 } },
    { name: 'platform', pitch: 0, arena: { ...map, boxes: [{ x: 0, y: 0, z: -7, w: 8, h: 1, d: 10 }] }, normal: { x: 0, y: 1, z: 0 } },
    { name: 'thin wall', pitch: 0, arena: { ...map, boxes: [{ x: 0, y: 0, z: -3, w: 8, h: 8, d: .01 }] }, normal: { x: 0, y: 0, z: 1 } },
    { name: 'ceiling', pitch: .6, arena: { ...map, boxes: [{ x: 0, y: 2.1, z: 0, w: 20, h: .02, d: 20 }] }, normal: { x: 0, y: -1, z: 0 } },
    { name: 'boundary', pitch: 0, arena: { ...map, size: 8 }, normal: { x: 0, y: 0, z: 1 } },
    { name: 'upward', pitch: 1.45, arena: map, normal: { x: 0, y: 1, z: 0 } },
    { name: 'roof throw', y: 18, pitch: .6, arena: map, normal: { x: 0, y: 1, z: 0 } },
    { name: 'flight bound', y: 180, pitch: 1.45, arena: { ...map, size: 400 }, normal: null },
  ];
  for (const { name, arena, pitch, y = 0, normal } of cases) {
    const owner = player(); Object.assign(owner, { y, pitch, abilitySeq: 1 });
    const before = structuredClone({ owner, arena });
    const predicted = powers.predictBlastTrajectory(owner, arena);
    assert.deepEqual({ owner, arena }, before, `${name}: prediction must be pure`);
    assert.deepEqual(predicted, powers.predictBlastTrajectory(owner, arena));
    assert.ok(predicted.points.length >= 2 && predicted.points.length <= 122);
    for (const point of predicted.points) assert.ok(Object.values(point).every(Number.isFinite));
    assert.equal(predicted.radius, getPower('assault').radius);
    assert.equal(predicted.landed, normal !== null); assert.deepEqual(predicted.normal, normal, name);
    assert.ok(predicted.detonationTime <= getPower('assault').duration + STEP + 1e-8);
    assert.ok(predicted.detonationTime - predicted.flightTime >= .65 - 1e-8);
    const effect = createPowerEffect(owner), effects = [effect]; let pop;
    for (let tick = 0; tick < 300 && effects.length; tick++) {
      pop = stepPowerEffects(effects, [owner], STEP, arena).find((event) => event.action === 'pop') || pop;
    }
    assert.ok(pop, name);
    assert.deepEqual(predicted.landing, { x: pop.x, y: pop.y, z: pop.z }, `${name}: preview must mark the actual pop center`);
    assert.deepEqual(predicted.points.at(-1), predicted.landing);
    if (name === 'platform') assert.ok(Math.abs(pop.y - 1.1) < .002);
    if (name === 'thin wall') assert.ok(pop.z > -2.9, 'a fast puck cannot tunnel through the thin wall');
    if (name === 'ceiling') assert.ok(pop.y < 2.001);
    if (name === 'roof throw') assert.ok(predicted.flightTime > 2.25, 'rooftop throws retain time to reach the ground');
  }
});

test('Echo falls onto raised platforms, runs off their edges and lands on the floor deterministically', () => {
  const arena = { ...map, boxes: [{ x: 0, y: 0, z: 0, w: 12, h: 2, d: 12 }] };
  const owner = player('sniper'); Object.assign(owner, { y: 5, grounded: false });
  stepPlayer(owner, input({ ability: true }), STEP, arena);
  const effects = [createPowerEffect(owner)]; const replay = structuredClone(effects);
  for (let tick = 0; tick < 36; tick++) {
    stepPowerEffects(effects, [owner], STEP, arena); stepPowerEffects(replay, [owner], STEP, arena);
  }
  assert.deepEqual(effects, replay); assert.equal(effects[0].y, 2); assert.equal(effects[0].grounded, true);
  for (let tick = 0; tick < 40; tick++) stepPowerEffects(effects, [owner], STEP, arena);
  assert.ok(effects[0].y < 2, 'the runner must fall after leaving a platform'); assert.equal(effects[0].grounded, false);
  for (let tick = 0; tick < 30; tick++) stepPowerEffects(effects, [owner], STEP, arena);
  assert.equal(effects[0].y, 0); assert.equal(effects[0].grounded, true); assert.equal(effects[0].vy, 0);
  assert.ok(effects[0].z < -9, 'landing must preserve running movement');
});

test('Echo dissipates visibly at walls instead of remaining idle, without refunding its cooldown', () => {
  const owner = player('sniper'); stepPlayer(owner, input({ ability: true }), STEP, map);
  const effects = [createPowerEffect(owner)]; const id = effects[0].id;
  const arena = { ...map, boxes: [{ x: 0, y: 0, z: -1, w: 4, h: 3, d: .02 }] };
  const events = stepPowerEffects(effects, [owner], .3, arena);
  assert.equal(effects.length, 0); assert.equal(owner.abilityTime, 0); assert.equal(owner.abilityCooldown, 12);
  assert.equal(events.length, 1); assert.equal(events[0].action, 'glitch'); assert.equal(events[0].effectId, id);
  assert.ok(events[0].z >= -.64 - 1e-6); assert.equal(owner.health, 100);
});

test('Blast Pop warns before launching self and nearby players without damage; walls block it', () => {
  const owner = player(); const target = player('heavy', 'target'); target.x = 2;
  stepPlayer(owner, input({ ability: true }), STEP, map);
  const effect = createPowerEffect(owner); Object.assign(effect, { x: 0, y: .2, z: 0, vx: 0, vy: 0, vz: 0, landed: true, remaining: .65 });
  const effects = [effect];
  stepPowerEffects(effects, [owner, target], .1, map); assert.equal(owner.vy, 0); assert.equal(effects.length, 1);
  effect.remaining = .001; const events = stepPowerEffects(effects, [owner, target], STEP, map);
  assert.equal(effects.length, 0); assert.ok(owner.vy > 5); assert.ok(target.vx > 0); assert.equal(owner.health, 100); assert.equal(target.health, 100);
  assert.ok(events.some((event) => event.action === 'pop'));
  target.vx = target.vy = target.vz = 0;
  const behindWall = [{ ...effect, remaining: .001, x: 0, y: .2, z: 0 }];
  stepPowerEffects(behindWall, [target], STEP, { ...map, boxes: [{ x: 1, y: 0, z: 0, w: .2, h: 4, d: 4 }] });
  assert.equal(target.vx, 0); assert.equal(target.vy, 0);
});

test('Echo respects walls, absorbs a shot then glitches, and cannot damage anybody', () => {
  const wisp = player('sniper'); wisp.x = 5;
  stepPlayer(wisp, input({ ability: true }), STEP, map);
  const echo = createPowerEffect(wisp); echo.x = 0; echo.y = 0; echo.z = -3;
  const effects = [echo];
  const shooter = player('assault', 'shooter'); const victim = player('heavy', 'victim'); victim.z = -8;
  const shot = resolvePowerShot(shooter, [shooter, victim, wisp], effects, traceShot(shooter, [shooter, victim, wisp], map), 20);
  assert.equal(shot.result.hit, undefined); assert.equal(shot.result.echoHit, echo.id); assert.equal(effects.length, 0);
  assert.equal(victim.health, 100); assert.equal(shot.events[0].action, 'glitch');
  assert.equal(wisp.abilityTime, 0); assert.ok(wisp.abilityCooldown > 0);
  const wallEcho = createPowerEffect(wisp); wallEcho.x = 0; wallEcho.z = 0;
  const wall = { ...map, boxes: [{ x: 0, y: 0, z: -.7, w: 4, h: 4, d: .02 }] };
  stepPowerEffects([wallEcho], [wisp], .5, wall);
  assert.ok(wallEcho.z >= -.34 - 1e-5);
});

test('Bulwark blocks frontal shots, has finite health, exposes the back and lowers its own gun', () => {
  const rook = player('heavy'); rook.z = -4; rook.yaw = Math.PI;
  stepPlayer(rook, input({ yaw: Math.PI, ability: true, fire: true }), STEP, map);
  assert.equal(rook.fired, false); assert.equal(rook.shieldHealth, 120);
  const shooter = player('assault', 'shooter');
  let outcome = resolvePowerShot(shooter, [shooter, rook], [], traceShot(shooter, [shooter, rook], map), 80);
  assert.equal(outcome.result.hit, undefined); assert.equal(outcome.result.shieldHit, rook.id); assert.equal(rook.shieldHealth, 40);
  outcome = resolvePowerShot(shooter, [shooter, rook], [], traceShot(shooter, [shooter, rook], map), 80);
  assert.equal(rook.shieldHealth, 0); assert.equal(rook.abilityTime, 0); assert.equal(outcome.events[0].action, 'shatter');
  rook.shieldHealth = 120; rook.abilityTime = 4; rook.yaw = 0;
  outcome = resolvePowerShot(shooter, [shooter, rook], [], traceShot(shooter, [shooter, rook], map), 20);
  assert.equal(outcome.result.hit, rook.id); assert.equal(rook.shieldHealth, 120);
});

test('cover and closer players still stop bullets before a shield or Echo behind them', () => {
  const shooter = player('assault', 'shooter'); const rook = player('heavy');
  Object.assign(rook, { z: -6, yaw: Math.PI, abilityTime: 4, shieldHealth: 120 });
  const cover = { ...map, boxes: [{ x: 0, y: 0, z: -3, w: 4, h: 3, d: .1 }] };
  const echo = { id: 'echo', type: 'echo', owner: 'wisp', x: 0, y: 0, z: -8 };
  let result = resolvePowerShot(shooter, [shooter, rook], [echo], traceShot(shooter, [shooter, rook], cover), 80);
  assert.ok(result.result.surface); assert.equal(rook.shieldHealth, 120);
  const nearest = player('sniper', 'nearest'); nearest.z = -2;
  result = resolvePowerShot(shooter, [shooter, nearest, rook], [echo], traceShot(shooter, [shooter, nearest, rook], map), 80);
  assert.equal(result.result.hit, nearest.id); assert.equal(rook.shieldHealth, 120);
});

test('bots request powers through normal inputs and can be fooled by a visible Echo', () => {
  for (const classId of ['assault', 'sniper', 'scout', 'heavy']) {
    const bot = player(classId); const enemy = player('assault', 'enemy'); enemy.z = -8;
    const controller = createBotController(map, 0, 'hard'); const original = structuredClone(bot);
    let requested = false;
    for (let tick = 0; tick < 90; tick++) requested ||= controller.update(bot, [bot, enemy], STEP).ability;
    assert.ok(requested, `${classId} should request its own power after reacting`);
    assert.deepEqual(bot, original, 'a bot controller must not directly grant state or movement');
  }
  const bot = player(); const controller = createBotController(map);
  const echo = { id: 'enemy-echo', type: 'echo', owner: 'wisp', classId: 'sniper', x: 0, y: 0, z: -8 };
  let fooled = false;
  for (let tick = 0; tick < 100; tick++) fooled ||= controller.update(bot, [bot], STEP, [echo]).fire;
  assert.ok(fooled, 'the bot should fire at a hologram with no real opponent visible');
});

function receive(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('Timed out waiting for state')); }, 3000);
    const listener = (data) => { const message = JSON.parse(data); if (predicate(message)) { clearTimeout(timer); ws.off('message', listener); resolve(message); } };
    ws.on('message', listener);
  });
}

test('server owns room effects and preserves cooldown across death/class changes', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 }); t.after(() => game.close());
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  let waiting = receive(ws, (message) => message.type === 'welcome');
  ws.send(JSON.stringify({ type: 'join', room: 'powers', name: 'Ember', classId: 'assault' }));
  const welcome = await waiting; assert.deepEqual(welcome.effects, []);
  const room = game.rooms.get('powers'); const peer = room.peers.get(welcome.id);
  waiting = receive(ws, (message) => message.type === 'state' && message.effects?.length === 1);
  ws.send(JSON.stringify({ type: 'input', inputs: [input({ ability: true, abilityCooldown: 0 })] }));
  const active = await waiting; assert.equal(active.effects[0].type, 'blast');
  peer.player.health = 0; peer.player.respawnIn = .05; peer.player.nextClassId = 'scout';
  waiting = receive(ws, (message) => message.type === 'state' && message.players[0].life === 1);
  const state = await waiting; assert.equal(state.players[0].classId, 'scout'); assert.ok(state.players[0].abilityCooldown > 11);
  assert.equal(state.players[0].abilityTime, 0); assert.equal(state.players[0].shieldHealth, 0);
});

async function joinPlayer(t, game, room, name, classId = 'assault') {
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  const welcome = receive(ws, (message) => message.type === 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name, classId }));
  return { ws, id: (await welcome).id };
}

test('round winner metadata uses pre-reset kills, then fewer deaths, and omits a zero-kill winner', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 }); t.after(() => game.close());
  const a = await joinPlayer(t, game, 'winner', 'First');
  const b = await joinPlayer(t, game, 'winner', 'Winner');
  const c = await joinPlayer(t, game, 'winner', 'Third');
  const room = game.rooms.get('winner');
  Object.assign(room.peers.get(a.id).player, { kills: 5, deaths: 4 });
  Object.assign(room.peers.get(b.id).player, { kills: 5, deaths: 1 });
  Object.assign(room.peers.get(c.id).player, { kills: 4, deaths: 0 });
  let next = receive(a.ws, (message) => message.type === 'state' && message.events.some((event) => event.type === 'round'));
  room.remaining = STEP / 2;
  let state = await next;
  assert.deepEqual(state.events.find((event) => event.type === 'round'), { type: 'round', winnerId: b.id, winnerName: 'Winner' });
  for (const p of state.players) { assert.equal(p.kills, 0); assert.equal(p.deaths, 0); assert.equal(p.life, 1); }
  next = receive(a.ws, (message) => message.type === 'state' && message.events.some((event) => event.type === 'round'));
  room.remaining = STEP / 2;
  state = await next;
  assert.deepEqual(state.events.find((event) => event.type === 'round'), { type: 'round' });
});

test('kill events mark a jumping shooter airborne but exclude grounded and rope riders', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 }); t.after(() => game.close());
  const shooter = await joinPlayer(t, game, 'airmail', 'Shooter', 'sniper');
  const victim = await joinPlayer(t, game, 'airmail', 'Victim');
  const room = game.rooms.get('airmail');
  const shooterPeer = room.peers.get(shooter.id); const victimPeer = room.peers.get(victim.id);
  let seq = 0;
  for (const pose of ['grounded', 'airborne', 'rope']) {
    const y = pose === 'grounded' ? 0 : 3;
    room.map = { ...map, ropes: pose === 'rope' ? [{ id: 'line', from: { x: 0, y, z: 0 }, to: { x: 0, y, z: -20 }, speed: .01 }] : [] };
    shooterPeer.player = { ...createPlayer(shooter.id, 'Shooter', 0, 'sniper', room.map), y, grounded: pose === 'grounded', ropeId: pose === 'rope' ? 'line' : null };
    victimPeer.player = { ...createPlayer(victim.id, 'Victim', 0, 'assault', room.map), y, z: -6, health: 1, grounded: pose === 'grounded' };
    shooterPeer.queue.length = 0; shooterPeer.lastInput = input({ seq, fire: false });
    const next = receive(shooter.ws, (message) => message.type === 'state' && message.events.some((event) => event.type === 'kill' && event.victim === victim.id));
    shooter.ws.send(JSON.stringify({ type: 'input', inputs: [input({ seq: ++seq, fire: true })] }));
    const state = await next;
    const event = state.events.find((item) => item.type === 'kill' && item.victim === victim.id);
    assert.equal(event.killer, shooter.id); assert.equal(event.airborne, pose === 'airborne', pose);
    assert.equal(state.players.find((p) => p.id === victim.id).health, 0);
  }
});

test('shared launchpad and rope-jump trajectories produce one cosmetic landing-slide callout', () => {
  for (const source of ['pad', 'rope']) {
    const arena = { ...map,
      pads: source === 'pad' ? [{ x: 0, y: 0, z: 0, radius: 1, vx: 10, vy: 12, vz: 0 }] : [],
      ropes: source === 'rope' ? [{ id: 'line', from: { x: 0, y: 0, z: 0 }, to: { x: 20, y: 0, z: 0 }, speed: 10 }] : [],
    };
    const p = createPlayer('p', 'Runner', 0, 'assault', arena);
    const style = createMovementStyle(); style.update(p, 0);
    let callouts = 0; let enteredAir = false;
    for (let tick = 1; tick <= 240; tick++) {
      stepPlayer(p, input({ interact: source === 'rope' && tick === 1, jump: source === 'rope' && tick === 2, crouch: tick > 2 }), STEP, arena);
      enteredAir ||= !p.grounded && !p.ropeId;
      if (style.update(p, tick * STEP * 1000)) { callouts++; assert.equal(p.grounded, true); assert.equal(p.sliding, true); }
    }
    assert.equal(enteredAir, true); assert.equal(callouts, 1, source);
    assert.equal(p.health, 100); assert.equal(p.kills, 0, 'recognition is cosmetic');
  }
});
