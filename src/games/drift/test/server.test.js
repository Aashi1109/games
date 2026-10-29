import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { sanitizeInput } from '../server/index.ts';
import { createTestServer } from './helpers/server.js';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT, STEP, stepPlayer, shotRay } from '../shared/simulation.ts';

const command = (extra = {}) => ({ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, ...extra });
function receive(ws, type, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, timeout);
    function listener(data) { const message = JSON.parse(data); if (message.type === type) { clearTimeout(timer); ws.off('message', listener); resolve(message); } }
    ws.on('message', listener);
  });
}
async function join(url, room = 'test', name = 'Player', classId) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome'); ws.send(JSON.stringify({ type: 'join', room, name, classId }));
  return { ws, welcome: await welcome };
}
async function joinTeam(url, room, name, team, classId, mode = 'tdm') {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name, classId, mode, team }));
  return { ws, welcome: await welcome };
}

test('input validator rejects non-finite, oversized, forged and incorrectly typed input', () => {
  assert.ok(sanitizeInput(command()));
  for (const invalid of [{ yaw: Infinity }, { forward: 2 }, { seq: -1 }, { fire: 'yes' }, { pitch: 99 }, { strafe: NaN }]) {
    assert.equal(sanitizeInput(command(invalid)), null);
  }
  const safe = sanitizeInput(command({ health: 999, x: 1000, damage: 999 }));
  assert.equal(safe.health, undefined); assert.equal(safe.x, undefined); assert.equal(safe.damage, undefined);
});

test('class selection validates IDs before room allocation and defaults older joins to Assault', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const ws = new WebSocket(url); await once(ws, 'open'); t.after(() => ws.terminate());
  for (const classId of ['__proto__', 'constructor', 'toString', '', null, 1, {}, ['sniper']]) {
    const failure = receive(ws, 'error');
    ws.send(JSON.stringify({ type: 'join', room: 'invalid', name: 'A', classId }));
    assert.match((await failure).message, /valid class/);
    assert.equal(game.rooms.size, 0);
  }
  const failure = receive(ws, 'error'); ws.send(JSON.stringify({ type: 'class', classId: 'sniper' }));
  assert.match((await failure).message, /Join a room/);
  const a = await join(url, 'valid'); t.after(() => a.ws.terminate());
  assert.equal(a.welcome.player.classId, 'assault'); assert.equal(a.welcome.player.ammo, 24);
  const b = await join(url, 'valid', 'B', 'sniper'); t.after(() => b.ws.terminate());
  assert.equal(b.welcome.player.classId, 'sniper'); assert.equal(b.welcome.player.ammo, 6);
  const invalidSwitch = receive(a.ws, 'error'); a.ws.send(JSON.stringify({ type: 'class', classId: '__proto__' }));
  assert.match((await invalidSwitch).message, /valid class/);
  assert.equal(game.rooms.get('valid').peers.get(a.welcome.id).player.nextClassId, 'assault');
});

test('class switches preserve current health, ammo, reload and cooldown until respawn', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const a = await join(`ws://127.0.0.1:${game.port}/drift/ws`, 'switch'); t.after(() => a.ws.terminate());
  const peer = game.rooms.get('switch').peers.get(a.welcome.id);
  Object.assign(peer.player, { health: 37, ammo: 3, reloadIn: 0.8, fireCooldown: 0.9, kills: 2, deaths: 1 });
  const selected = receive(a.ws, 'class-selected'); a.ws.send(JSON.stringify({ type: 'class', classId: 'sniper' }));
  assert.deepEqual(await selected, { type: 'class-selected', classId: 'sniper', activeClassId: 'assault' });
  assert.equal(peer.player.classId, 'assault'); assert.equal(peer.player.nextClassId, 'sniper');
  assert.equal(peer.player.health, 37); assert.equal(peer.player.ammo, 3);
  assert.ok(peer.player.reloadIn > 0 && peer.player.reloadIn <= 0.8);
  assert.ok(peer.player.fireCooldown > 0 && peer.player.fireCooldown <= 0.9);
  const cancelled = receive(a.ws, 'class-selected'); a.ws.send(JSON.stringify({ type: 'class', classId: 'assault' }));
  await cancelled; assert.equal(peer.player.nextClassId, 'assault'); assert.equal(peer.player.ammo, 3);
  peer.player.health = 0; peer.player.respawnIn = 0.15;
  const deadSelection = receive(a.ws, 'class-selected'); a.ws.send(JSON.stringify({ type: 'class', classId: 'sniper' }));
  await deadSelection;
  const state = await stateWhere(a.ws, (message) => message.players[0].life === 1);
  const fresh = state.players[0];
  assert.equal(fresh.classId, 'sniper'); assert.equal(fresh.nextClassId, 'sniper');
  assert.equal(fresh.health, 100); assert.equal(fresh.ammo, 6);
  assert.equal(fresh.reloadIn, 0); assert.equal(fresh.fireCooldown, 0); assert.equal(fresh.fireHeld, false);
  assert.equal(fresh.kills, 2); assert.equal(fresh.deaths, 1);
});

test('sniper damage and class metadata are authoritative and a held trigger cannot repeat shots', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'sniping', 'A', 'sniper'); t.after(() => a.ws.terminate());
  const b = await join(url, 'sniping', 'B'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('sniping');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const firstShot = stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'shot'));
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true, damage: 999, classId: 'assault' })] })), 40);
  t.after(() => clearInterval(fire));
  const first = await firstShot;
  assert.equal(first.events.find((event) => event.type === 'shot').classId, 'sniper');
  assert.equal(first.players.find((player) => player.id === b.welcome.id).health, 20);
  const ready = await stateWhere(a.ws, (state) => state.players.find((player) => player.id === a.welcome.id).fireCooldown === 0);
  clearInterval(fire);
  assert.equal(ready.players.find((player) => player.id === a.welcome.id).ammo, 5);
  assert.equal(ready.players.find((player) => player.id === b.welcome.id).health, 20);
  const kill = stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'kill'));
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq }), command({ seq: ++seq, fire: true })] }));
  const final = await kill;
  assert.equal(final.players.find((player) => player.id === a.welcome.id).ammo, 4);
  assert.equal(final.players.find((player) => player.id === b.welcome.id).health, 0);
});

test('every class joins with its own magazine and deals its server-defined damage', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  for (const [classId, magazine, damage] of [['assault', 24, 20], ['sniper', 6, 80], ['scout', 36, 14], ['heavy', 60, 26]]) {
    const a = await join(url, classId, 'A', classId); t.after(() => a.ws.terminate());
    const b = await join(url, classId, 'B'); t.after(() => b.ws.terminate());
    assert.equal(a.welcome.player.ammo, magazine);
    assert.equal(a.welcome.player.classId, classId);
    const room = game.rooms.get(classId);
    Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
    Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
    const shot = stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'shot'));
    a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 1, fire: true, damage: 999 }), command({ seq: 2 })] }));
    const state = await shot;
    assert.equal(state.players.find((player) => player.id === b.welcome.id).health, 100 - damage);
    assert.equal(state.players.find((player) => player.id === a.welcome.id).ammo, magazine - 1);
    assert.equal(state.events.find((event) => event.type === 'shot').classId, classId);
  }
});

test('auto reload after the final bullet broadcasts to room peers and keeps the active class magazine', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'autoreload', 'A', 'scout'); t.after(() => a.ws.terminate());
  const b = await join(url, 'autoreload', 'B'); t.after(() => b.ws.terminate());
  const peer = game.rooms.get('autoreload').peers.get(a.welcome.id);
  peer.player.ammo = 1;
  const shooter = (state) => state.players.find((player) => player.id === a.welcome.id);
  const hasShot = (state) => state.events.some((event) => event.type === 'shot' && event.id === a.welcome.id);
  const shotA = stateWhere(a.ws, hasShot);
  const shotB = stateWhere(b.ws, hasShot);
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 1, fire: true }), command({ seq: 2 })] }));
  const [stateA, stateB] = await Promise.all([shotA, shotB]);
  assert.deepEqual(shooter(stateA), shooter(stateB));
  assert.equal(shooter(stateA).ammo, 0);
  assert.ok(shooter(stateA).reloadIn > 0 && shooter(stateA).reloadIn <= 1.6);

  const selected = receive(a.ws, 'class-selected');
  a.ws.send(JSON.stringify({ type: 'class', classId: 'heavy' }));
  await selected;
  assert.equal(peer.player.classId, 'scout');
  assert.equal(peer.player.nextClassId, 'heavy');
  assert.equal(peer.player.ammo, 0);
  assert.ok(peer.player.reloadIn > 0 && peer.player.reloadIn <= shooter(stateA).reloadIn);

  const reloaded = (state) => shooter(state).reloadIn === 0 && shooter(state).ammo > 0;
  const [refillA, refillB] = await Promise.all([stateWhere(a.ws, reloaded), stateWhere(b.ws, reloaded)]);
  assert.deepEqual(shooter(refillA), shooter(refillB));
  assert.equal(shooter(refillA).ammo, 36);
  assert.equal(shooter(refillA).classId, 'scout');
  assert.equal(shooter(refillA).nextClassId, 'heavy');
});

test('rooms isolate snapshots and reject overflow, while movement remains server authoritative', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'alpha', '<script>'); t.after(() => a.ws.terminate());
  const b = await join(url, 'alpha', 'B'); t.after(() => b.ws.terminate());
  const c = await join(url, 'bravo', 'C'); t.after(() => c.ws.terminate());
  const state = await receive(a.ws, 'state');
  assert.equal(state.players.length, 2);
  assert.ok(state.players.every((p) => p.id !== c.welcome.id));
  assert.equal(a.welcome.room, 'alpha');
  const extra = new WebSocket(url); await once(extra, 'open'); t.after(() => extra.terminate());
  const error = receive(extra, 'error'); extra.send(JSON.stringify({ type: 'join', room: 'alpha', name: 'D' }));
  assert.match((await error).message, /full/i);
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ forward: 1, x: 100000, health: 999 })] }));
  const next = await receive(a.ws, 'state'); const player = next.players.find((p) => p.id === a.welcome.id);
  assert.equal(player.health, 100); assert.ok(Math.abs(player.x) < 32); assert.equal(player.seq, 1);
  const pong = receive(a.ws, 'pong'); a.ws.send(JSON.stringify({ type: 'ping', sent: 42 }));
  assert.equal((await pong).sent, 42);
});

test('slide movement broadcasts shared eye height and rejects forged movement state', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'movement', 'A', 'sniper'); t.after(() => a.ws.terminate());
  const b = await join(url, 'movement', 'B'); t.after(() => b.ws.terminate());
  assert.equal(a.welcome.player.eyeHeight, EYE_HEIGHT);
  assert.equal(a.welcome.player.slideCooldown, 0);
  const peer = game.rooms.get('movement').peers.get(a.welcome.id);
  // A clear lane keeps this focused on movement state and firing, without cover or pads.
  Object.assign(peer.player, { x: -27, y: 0, z: 10, vx: 0, vy: 0, vz: -10, yaw: 0 });
  const input = command({ seq: 10, forward: 1, sprint: true, crouch: true, fire: true });
  const expected = { ...peer.player };
  stepPlayer(expected, input, STEP);
  const expectedShotHeight = shotRay(expected).origin.y;
  const hasShot = (state) => state.events.some((event) => event.type === 'shot' && event.id === a.welcome.id);
  const shotA = stateWhere(a.ws, hasShot);
  const shotB = stateWhere(b.ws, hasShot);
  a.ws.send(JSON.stringify({ type: 'input', inputs: [{ ...input, eyeHeight: 90, slideCooldown: -10, slideBoost: 999, jumpBuffer: 999, coyoteTime: 999, vx: 999, vy: 999, vz: 999 }] }));
  const [stateA, stateB] = await Promise.all([shotA, shotB]);
  const playerA = stateA.players.find((player) => player.id === a.welcome.id);
  const playerB = stateB.players.find((player) => player.id === a.welcome.id);
  assert.deepEqual(playerA, playerB, 'both peers receive the same authoritative movement state');
  assert.equal(playerA.seq, input.seq);
  assert.equal(playerA.sliding, true);
  assert.equal(playerA.crouching, true);
  assert.ok(playerA.eyeHeight > CROUCH_EYE_HEIGHT && playerA.eyeHeight < EYE_HEIGHT);
  assert.ok(playerA.slideCooldown > 0 && playerA.slideCooldown <= 1);
  assert.ok(playerA.slideBoost >= 0 && playerA.slideBoost <= 2.6);
  assert.equal(playerA.jumpBuffer, 0);
  assert.ok(playerA.coyoteTime >= 0 && playerA.coyoteTime <= 0.1);
  assert.ok(Math.hypot(playerA.vx, playerA.vz) < 14);
  assert.equal(playerA.vy, 0);
  assert.deepEqual(stateA.events, stateB.events);
  const shot = stateA.events.find((event) => event.type === 'shot' && event.id === a.welcome.id);
  assert.equal(shot.from.y, expectedShotHeight, 'the firing tick uses the same eased eye height as shared prediction');
  assert.ok(shot.from.y > CROUCH_EYE_HEIGHT && shot.from.y < EYE_HEIGHT, 'first crouched shot must not snap to either stance height');
});

test('bad JSON and duplicate sequence values cannot crash or accelerate the simulation', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const a = await join(`ws://127.0.0.1:${game.port}/drift/ws`); t.after(() => a.ws.terminate());
  a.ws.send('{bad');
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 4, forward: 1 }), command({ seq: 4, forward: 1 })] }));
  const state = await receive(a.ws, 'state');
  assert.equal(state.players[0].health, 100); assert.ok(state.players[0].z > 18);
  assert.equal(state.players[0].seq, 4);
});

function stateWhere(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('Expected state not received')); }, timeout);
    function listener(data) {
      const message = JSON.parse(data);
      if (message.type === 'state' && predicate(message)) { clearTimeout(timer); ws.off('message', listener); resolve(message); }
    }
    ws.on('message', listener);
  });
}

test('surface impacts broadcast face metadata to room peers without leaking to other rooms', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'impacts', 'A'); t.after(() => a.ws.terminate());
  const b = await join(url, 'impacts', 'B'); t.after(() => b.ws.terminate());
  const c = await join(url, 'separate', 'C'); t.after(() => c.ws.terminate());
  const room = game.rooms.get('impacts');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -16, y: 0, z: 2, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  const separateEvents = [];
  c.ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'state') separateEvents.push(...message.events);
  });
  const hasShot = (state) => state.events.some((event) => event.type === 'shot' && event.id === a.welcome.id);
  const shotA = stateWhere(a.ws, hasShot);
  const shotB = stateWhere(b.ws, hasShot);
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 1, fire: true })] }));
  const [stateA, stateB] = await Promise.all([shotA, shotB]);
  a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 2 })] }));
  assert.deepEqual(stateA.events, stateB.events);
  const shot = stateA.events.find((event) => event.type === 'shot');
  assert.deepEqual(shot.surface, { normal: { x: 0, y: 0, z: 1 }, style: 'terrace' });
  assert.equal(shot.to.z, -5);
  assert.equal(shot.hit, undefined);
  await receive(c.ws, 'state');
  assert.equal(separateEvents.some((event) => event.type === 'shot'), false);
});

test('authoritative combat broadcasts hits and kills, then respawns with scores intact', async (t) => {
  const game = await createTestServer({ botTarget: 0, respawnSeconds: 0.2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'combat', 'A'); t.after(() => a.ws.terminate());
  const b = await join(url, 'combat', 'B'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('combat');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true })] })), 40);
  t.after(() => clearInterval(fire));
  const killA = stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'kill'));
  const killB = stateWhere(b.ws, (state) => state.events.some((event) => event.type === 'kill'));
  const [stateA, stateB] = await Promise.all([killA, killB]);
  clearInterval(fire);
  assert.deepEqual(stateA.events, stateB.events, 'events must be delivered to all room members');
  const dead = stateA.players.find((p) => p.id === b.welcome.id);
  const killer = stateA.players.find((p) => p.id === a.welcome.id);
  assert.equal(dead.health, 0); assert.equal(dead.deaths, 1); assert.equal(killer.kills, 1);
  assert.equal(killer.ammo, 19);
  const respawned = await stateWhere(b.ws, (state) => state.players.find((p) => p.id === b.welcome.id)?.life === 1);
  const fresh = respawned.players.find((p) => p.id === b.welcome.id);
  assert.equal(fresh.health, 100); assert.equal(fresh.deaths, 1); assert.equal(fresh.respawnIn, 0);
});

test('round expiration clears scores and changes life, and empty rooms are removed', async (t) => {
  const game = await createTestServer({ botTarget: 0, roundSeconds: 0.2 });
  t.after(() => game.close());
  const a = await join(`ws://127.0.0.1:${game.port}/drift/ws`, 'round'); t.after(() => a.ws.terminate());
  game.rooms.get('round').peers.get(a.welcome.id).player.kills = 9;
  const selected = receive(a.ws, 'class-selected'); a.ws.send(JSON.stringify({ type: 'class', classId: 'heavy' }));
  await selected;
  const state = await stateWhere(a.ws, (message) => message.events.some((event) => event.type === 'round'));
  assert.equal(state.players[0].kills, 0); assert.equal(state.players[0].life, 1);
  assert.equal(state.players[0].classId, 'heavy'); assert.equal(state.players[0].ammo, 60);
  const nextRound = await stateWhere(a.ws, (message) => message.players[0].life === 2);
  assert.equal(nextRound.players[0].classId, 'heavy'); assert.equal(nextRound.players[0].nextClassId, 'heavy');
  a.ws.close(); await once(a.ws, 'close');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(game.rooms.size, 0);
});

test('dead players keep acknowledging inputs before the client prediction backlog overflows', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const a = await join(`ws://127.0.0.1:${game.port}/drift/ws`, 'respawn'); t.after(() => a.ws.terminate());
  const peer = game.rooms.get('respawn').peers.get(a.welcome.id);
  peer.player.health = 0;
  peer.player.respawnIn = 2;
  let seq = 0;
  let pending = [];
  let maxPending = 0;
  a.ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.type !== 'state') return;
    pending = pending.filter((input) => input.seq > message.players[0].seq);
  });
  const timer = setInterval(() => {
    const inputs = [command({ seq: ++seq }), command({ seq: ++seq })];
    pending.push(...inputs);
    maxPending = Math.max(maxPending, pending.length);
    a.ws.send(JSON.stringify({ type: 'input', inputs }));
  }, 1000 / 30);
  t.after(() => clearInterval(timer));
  const respawned = await stateWhere(a.ws, (state) => state.players[0].life === 1);
  clearInterval(timer);
  assert.ok(seq >= 110, 'exercise the full default two-second respawn delay');
  assert.ok(maxPending < 20, `prediction backlog reached ${maxPending} inputs before respawn`);
  assert.equal(respawned.players[0].health, 100);
});

test('room limits bound allocations and cross-origin websocket requests are rejected', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxRooms: 1 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await join(url, 'first'); t.after(() => a.ws.terminate());
  const b = new WebSocket(url); await once(b, 'open'); t.after(() => b.terminate());
  const error = receive(b, 'error'); b.send(JSON.stringify({ type: 'join', room: 'second', name: 'B' }));
  assert.match((await error).message, /busy/i); assert.equal(game.rooms.size, 1);
  const untrusted = new WebSocket(url, { origin: 'https://untrusted.example' });
  const failure = await new Promise((resolve) => untrusted.once('error', resolve));
  assert.match(failure.message, /403/);
});

test('friendly fire is off in team deathmatch: same-team hits deal no damage and no kill', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await joinTeam(url, 'ff-tdm', 'A', 'a'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'ff-tdm', 'B', 'a'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('ff-tdm');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true })] })), 40);
  t.after(() => clearInterval(fire));
  const shot = await stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'shot' && event.hit === b.welcome.id));
  clearInterval(fire);
  assert.equal(shot.events.some((event) => event.type === 'kill'), false, 'no kill event for a same-team hit');
  const victim = shot.players.find((p) => p.id === b.welcome.id);
  assert.equal(victim.health, 100, 'teammate takes no damage');
});

test('a kill in team deathmatch increments the killer team score', async (t) => {
  const game = await createTestServer({ botTarget: 0, respawnSeconds: 0.2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await joinTeam(url, 'tdm-score', 'A', 'a'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'tdm-score', 'B', 'b'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('tdm-score');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true })] })), 40);
  t.after(() => clearInterval(fire));
  await stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'kill'));
  clearInterval(fire);
  assert.equal(room.score.a, 1);
  assert.equal(room.score.b, 0);
});

test('round expiration in team deathmatch declares the higher-scoring team and resets scores', async (t) => {
  const game = await createTestServer({ botTarget: 0, roundSeconds: 0.2 });
  t.after(() => game.close());
  const a = await joinTeam(`ws://127.0.0.1:${game.port}/drift/ws`, 'tdm-round', 'A', 'a'); t.after(() => a.ws.terminate());
  const room = game.rooms.get('tdm-round');
  room.score.a = 5; room.score.b = 2;
  const state = await stateWhere(a.ws, (message) => message.events.some((event) => event.type === 'round'));
  const roundEvent = state.events.find((event) => event.type === 'round');
  assert.equal(roundEvent.winnerTeam, 'a');
  assert.equal(roundEvent.scoreA, 5); assert.equal(roundEvent.scoreB, 2);
  assert.equal(room.score.a, 0); assert.equal(room.score.b, 0);
});

test('domination ticks a team\'s score while it alone holds a zone, and does not score a contested zone', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 6, roundSeconds: 300 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await joinTeam(url, 'dom-room', 'A', 'a', undefined, 'domination'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'dom-room', 'B', 'b', undefined, 'domination'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('dom-room');
  const zone = room.map.zones[0];
  const peerA = room.peers.get(a.welcome.id);
  const peerB = room.peers.get(b.welcome.id);
  // Put only A's player inside zone 0, and B far away from every zone.
  peerA.player.x = zone.x; peerA.player.z = zone.z;
  peerB.player.x = zone.x + 1000; peerB.player.z = zone.z + 1000;
  const before = room.score.a;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(room.score.a > before, `expected room.score.a to increase while team a alone holds the zone, was ${before} now ${room.score.a}`);
  assert.equal(room.score.b, 0, 'team b should not score while absent from every zone');

  // Now contest the same zone with a player from team b; score should stop advancing for a.
  peerB.player.x = zone.x; peerB.player.z = zone.z;
  const contestedA = room.score.a;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(room.score.a, contestedA, 'a contested zone (both teams present) should not score for either team');
});

test('domination round ends early when a team reaches the score cap', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 6, roundSeconds: 300, scoreCap: 1 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await joinTeam(url, 'dom-cap', 'A', 'a', undefined, 'domination'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'dom-cap', 'B', 'b', undefined, 'domination'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('dom-cap');
  const zone = room.map.zones[0];
  const peerA = room.peers.get(a.welcome.id);
  const peerB = room.peers.get(b.welcome.id);
  peerA.player.x = zone.x; peerA.player.z = zone.z;
  peerB.player.x = zone.x + 1000; peerB.player.z = zone.z + 1000;
  const state = await stateWhere(a.ws, (message) => message.events.some((event) => event.type === 'round'));
  const round = state.events.find((event) => event.type === 'round');
  assert.equal(round.winnerTeam, 'a');
  assert.ok(round.scoreA >= 1);
});
