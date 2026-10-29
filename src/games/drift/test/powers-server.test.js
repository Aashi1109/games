import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { sanitizeInput } from '../server/index.ts';
import { createTestServer } from './helpers/server.js';
import { CLASSES } from '../shared/classes.ts';
import { getPower } from '../shared/powers.ts';

const command = (extra = {}) => ({ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, ...extra });
const playerIn = (state, entry) => state.players.find((player) => player.id === entry.welcome.id);

function receive(ws, type, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, timeout);
    function listener(raw) {
      const message = JSON.parse(raw);
      if (message.type === type && predicate(message)) {
        clearTimeout(timer); ws.off('message', listener); resolve(message);
      }
    }
    ws.on('message', listener);
  });
}

async function server(t, options = {}) {
  const game = await createTestServer({ botTarget: 0, ...options });
  t.after(() => game.close());
  return game;
}

async function join(t, game, room, classId = 'assault', extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/drift/ws`);
  await once(ws, 'open');
  t.after(() => ws.terminate());
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name: classId, classId, ...extra }));
  return { ws, welcome: await welcome };
}

function input(entry, extra = {}) {
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [command(extra)] }));
}

const activation = (entry) => (state) => state.events.some((event) => event.type === 'power' && event.action === 'activate' && event.owner === entry.welcome.id);

async function activate(entry, seq = 1) {
  const state = receive(entry.ws, 'state', activation(entry));
  input(entry, { seq, ability: true });
  return state;
}

test('power input accepts an optional boolean and discards client-authored power state', () => {
  assert.equal(sanitizeInput(command()).ability, false, 'older clients remain compatible');
  assert.equal(sanitizeInput(command({ ability: true })).ability, true);
  assert.equal(sanitizeInput(command({ ability: false })).ability, false);
  for (const ability of ['true', 1, 0, null, [], {}]) {
    assert.equal(sanitizeInput(command({ ability })), null, `reject ${JSON.stringify(ability)}`);
  }
  const safe = sanitizeInput(command({ ability: true, abilityCooldown: 0, abilityTime: 999, abilityHeld: false, abilitySeq: 900, abilityUsed: true, shieldHealth: 999, effects: [{ type: 'blast' }], classId: 'heavy', health: 999 }));
  for (const field of ['abilityCooldown', 'abilityTime', 'abilityHeld', 'abilitySeq', 'abilityUsed', 'shieldHealth', 'effects', 'classId', 'health']) {
    assert.equal(Object.hasOwn(safe, field), false, `untrusted ${field} must not enter simulation`);
  }
});

test('all four powers broadcast authoritative activations to room peers without leaking to other rooms', async (t) => {
  const game = await server(t);
  const isolated = await join(t, game, 'separate');
  const isolatedStates = [];
  isolated.ws.on('message', (raw) => {
    const state = JSON.parse(raw);
    if (state.type === 'state') isolatedStates.push(state);
  });
  for (const classId of Object.keys(CLASSES)) {
    const roomName = `p-${classId}`;
    const owner = await join(t, game, roomName, classId);
    const observer = await join(t, game, roomName);
    const seenByObserver = receive(observer.ws, 'state', activation(owner));
    const ownState = await activate(owner);
    const otherState = await seenByObserver;
    assert.deepEqual(ownState.events, otherState.events, 'the same authoritative event reaches every room peer');
    assert.deepEqual(ownState.effects, otherState.effects);
    assert.deepEqual(playerIn(ownState, owner), playerIn(otherState, owner));
    const event = ownState.events.find((event) => event.type === 'power' && event.owner === owner.welcome.id);
    assert.equal(event.action, 'activate');
    assert.equal(event.powerId, getPower(classId).id);
    assert.equal(event.abilitySeq, 1);
    assert.equal(event.life, 0);
    for (const coordinate of ['x', 'y', 'z']) assert.ok(Number.isFinite(event[coordinate]));
    const authoritative = playerIn(ownState, owner);
    assert.equal(authoritative.classId, classId);
    assert.ok(authoritative.abilityCooldown > 0 && authoritative.abilityCooldown <= getPower(classId).cooldown);
    assert.equal(playerIn(ownState, observer).health, 100);
    if (classId === 'assault' || classId === 'sniper') {
      const effect = ownState.effects.find((item) => item.owner === owner.welcome.id);
      assert.equal(effect.type, classId === 'assault' ? 'blast' : 'echo');
      assert.equal(effect.classId, classId);
      const late = await join(t, game, roomName, 'scout');
      assert.ok(late.welcome.effects.some((item) => item.id === effect.id), 'late joins receive an already-active world effect');
    } else {
      assert.equal(ownState.effects.length, 0, 'dash and shield are represented by authoritative player state');
      assert.ok(authoritative.abilityTime > 0);
      if (classId === 'heavy') assert.equal(authoritative.shieldHealth, 120);
    }
  }
  await receive(isolated.ws, 'state');
  assert.ok(isolatedStates.length > 0);
  for (const state of isolatedStates) {
    assert.deepEqual(state.effects, []);
    assert.equal(state.events.some((event) => event.type === 'power'), false);
    assert.equal(state.players.length, 1);
    assert.equal(playerIn(state, isolated).abilitySeq, 0);
  }
});

test('malformed or forged network power requests cannot alter authoritative class, health or timers', async (t) => {
  const game = await server(t);
  const entry = await join(t, game, 'untrusted');
  const idle = receive(entry.ws, 'state', (state) => playerIn(state, entry).seq === 2);
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [
    command({ seq: 1, ability: 'true' }),
    command({ seq: 2, ability: false, abilitySeq: 999, abilityTime: 999, shieldHealth: 999, health: 999, classId: 'heavy', effects: [{ type: 'echo' }] }),
  ] }));
  const rejected = await idle;
  assert.equal(playerIn(rejected, entry).abilitySeq, 0);
  assert.equal(playerIn(rejected, entry).abilityTime, 0);
  assert.equal(playerIn(rejected, entry).shieldHealth, 0);
  assert.equal(playerIn(rejected, entry).health, 100);
  assert.equal(playerIn(rejected, entry).classId, 'assault');
  assert.deepEqual(rejected.effects, []);

  const active = receive(entry.ws, 'state', activation(entry));
  input(entry, { seq: 3, ability: true, abilityCooldown: -999, abilityTime: 999, shieldHealth: 999, classId: 'heavy' });
  const state = await active;
  assert.equal(state.events.find((event) => event.type === 'power').powerId, 'blast-pop');
  assert.equal(playerIn(state, entry).shieldHealth, 0);
  assert.ok(playerIn(state, entry).abilityCooldown > getPower('assault').cooldown - 1);
  assert.equal(state.effects[0].type, 'blast');
});

test('holding Q across cooldown cannot repeat a power until release and a new press', async (t) => {
  const game = await server(t);
  const entry = await join(t, game, 'held-power');
  const peer = game.rooms.get('held-power').peers.get(entry.welcome.id);
  let seq = 1;
  await activate(entry, seq);
  // Shorten only the server's timer to exercise expiry without a real 12-second wait.
  peer.player.abilityCooldown = .08;
  const held = setInterval(() => input(entry, { seq: ++seq, ability: true }), 20);
  t.after(() => clearInterval(held));
  const ready = await receive(entry.ws, 'state', (state) => playerIn(state, entry).abilityCooldown === 0 && playerIn(state, entry).seq >= 10);
  clearInterval(held);
  assert.equal(playerIn(ready, entry).abilitySeq, 1);
  assert.equal(playerIn(ready, entry).abilityHeld, true);
  const repeated = receive(entry.ws, 'state', (state) => playerIn(state, entry).abilitySeq === 2);
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, ability: false }), command({ seq: ++seq, ability: true })] }));
  const used = await repeated;
  assert.ok(used.events.some((event) => event.type === 'power' && event.action === 'activate' && event.abilitySeq === 2));
  assert.ok(playerIn(used, entry).abilityCooldown > 0);
});

test('death clears every active power but class selection and respawn cannot reset its cooldown', async (t) => {
  const game = await server(t, { respawnSeconds: .2 });
  for (const classId of Object.keys(CLASSES)) {
    const roomName = `life-${classId}`;
    const entry = await join(t, game, roomName, classId);
    const room = game.rooms.get(roomName);
    const peer = room.peers.get(entry.welcome.id);
    const used = await activate(entry);
    const cooldown = playerIn(used, entry).abilityCooldown;
    const nextClass = classId === 'heavy' ? 'assault' : 'heavy';
    const selected = receive(entry.ws, 'class-selected');
    entry.ws.send(JSON.stringify({ type: 'class', classId: nextClass }));
    assert.equal((await selected).activeClassId, classId);
    assert.equal(peer.player.classId, classId);
    assert.ok(peer.player.abilityCooldown > cooldown - .5);
    peer.player.health = 0;
    peer.player.respawnIn = .2;
    const died = receive(entry.ws, 'state', (state) => playerIn(state, entry).health === 0);
    input(entry, { seq: 2, ability: true, abilityCooldown: 0, health: 100 });
    const dead = await died;
    assert.equal(playerIn(dead, entry).abilityTime, 0);
    assert.equal(playerIn(dead, entry).shieldHealth, 0);
    assert.equal(dead.effects.some((effect) => effect.owner === entry.welcome.id), false);
    const fresh = await receive(entry.ws, 'state', (state) => playerIn(state, entry).life === 1);
    assert.equal(playerIn(fresh, entry).classId, nextClass);
    assert.equal(playerIn(fresh, entry).health, 100);
    assert.ok(playerIn(fresh, entry).abilityCooldown > cooldown - 1);
    assert.equal(playerIn(fresh, entry).abilityTime, 0);
    assert.equal(playerIn(fresh, entry).shieldHealth, 0);
    const blocked = receive(entry.ws, 'state', (state) => playerIn(state, entry).seq === 3);
    input(entry, { seq: 3, ability: true, abilityCooldown: 0 });
    const denied = await blocked;
    assert.equal(playerIn(denied, entry).abilityTime, 0);
    assert.equal(denied.events.some((event) => event.type === 'power' && event.action === 'activate'), false);
  }
});

test('disconnect removes owned world effects while the remaining room stays usable', async (t) => {
  const game = await server(t);
  for (const classId of ['assault', 'sniper']) {
    const roomName = `bye-${classId}`;
    const owner = await join(t, game, roomName, classId);
    const observer = await join(t, game, roomName);
    await activate(owner);
    const cleaned = receive(observer.ws, 'state', (state) => !playerIn(state, owner));
    owner.ws.close();
    const state = await cleaned;
    assert.equal(state.effects.some((effect) => effect.owner === owner.welcome.id), false);
    assert.equal(game.rooms.get(roomName).peers.size, 1);
    const usable = await activate(observer);
    assert.equal(playerIn(usable, observer).abilitySeq, 1);
  }
});

test('round reset clears world effects, shields and cooldowns for every participant', async (t) => {
  const game = await server(t);
  const entries = [];
  for (const classId of ['assault', 'sniper', 'heavy']) entries.push(await join(t, game, 'round-power', classId));
  const room = game.rooms.get('round-power');
  const active = receive(entries[0].ws, 'state', (state) => state.players.every((player) => player.abilitySeq === 1));
  for (const entry of entries) input(entry, { ability: true });
  const before = await active;
  assert.equal(before.effects.length, 2);
  assert.equal(playerIn(before, entries[2]).shieldHealth, 120);
  const reset = receive(entries[0].ws, 'state', (state) => state.events.some((event) => event.type === 'round'));
  room.remaining = 0;
  const fresh = await reset;
  assert.deepEqual(fresh.effects, []);
  for (const player of fresh.players) {
    assert.equal(player.life, 1);
    assert.equal(player.abilityCooldown, 0);
    assert.equal(player.abilityTime, 0);
    assert.equal(player.abilityHeld, false);
    assert.equal(player.shieldHealth, 0);
  }
});

test('AI uses the authoritative power path and its world effect disappears when a human replaces it', async (t) => {
  const game = await server(t, { botTarget: 2 });
  const entry = await join(t, game, 'bot-power', 'assault', { botDifficulty: 'hard' });
  const room = game.rooms.get('bot-power');
  const human = room.peers.get(entry.welcome.id);
  const bot = [...room.peers.values()].find((peer) => peer.bot);
  assert.equal(bot.player.classId, 'sniper');
  // A clear lane gives the actual controller a visible target and reaction time.
  Object.assign(human.player, { x: -27, y: 0, z: 15, vx: 0, vy: 0, vz: 0, yaw: 0 });
  Object.assign(bot.player, { x: -27, y: 0, z: 7, vx: 0, vy: 0, vz: 0, yaw: Math.PI });
  const state = await receive(entry.ws, 'state', (snapshot) => snapshot.events.some((event) => event.type === 'power' && event.action === 'activate' && event.owner === bot.player.id), 5000);
  const event = state.events.find((event) => event.type === 'power' && event.owner === bot.player.id);
  assert.equal(event.powerId, 'echo');
  assert.equal(event.abilitySeq, 1);
  assert.ok(state.effects.some((effect) => effect.owner === bot.player.id && effect.type === 'echo'));
  assert.ok(state.players.find((player) => player.id === bot.player.id).abilityCooldown > 0);
  const removed = receive(entry.ws, 'state', (snapshot) => snapshot.players.every((player) => !player.bot));
  const replacement = await join(t, game, 'bot-power', 'heavy');
  assert.equal(replacement.welcome.effects.some((effect) => effect.owner === bot.player.id), false);
  const replaced = await removed;
  assert.equal(replaced.players.length, 2);
  assert.equal(replaced.effects.some((effect) => effect.owner === bot.player.id), false);
});

test('authoritative shots hit shields and echoes before health, and broadcast the same result to the target', async (t) => {
  const game = await server(t);
  const shooter = await join(t, game, 'shield-shot', 'sniper');
  const target = await join(t, game, 'shield-shot', 'heavy');
  const room = game.rooms.get('shield-shot');
  const attacker = room.peers.get(shooter.welcome.id);
  const defender = room.peers.get(target.welcome.id);
  Object.assign(attacker.player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(defender.player, { x: -27, y: 0, z: 10, yaw: Math.PI });
  const raised = receive(target.ws, 'state', activation(target));
  input(target, { ability: true, yaw: Math.PI });
  await raised;
  let seq = 0;
  for (const expectedShield of [40, 0]) {
    attacker.player.fireCooldown = 0;
    const shot = (state) => state.events.some((event) => event.type === 'shot' && event.id === shooter.welcome.id);
    const own = receive(shooter.ws, 'state', shot);
    const observed = receive(target.ws, 'state', shot);
    shooter.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq }), command({ seq: ++seq, fire: true }), command({ seq: ++seq })] }));
    const [state, other] = await Promise.all([own, observed]);
    assert.deepEqual(state.events, other.events);
    const event = state.events.find((event) => event.type === 'shot');
    assert.equal(event.shieldHit, target.welcome.id);
    assert.equal(event.hit, undefined);
    assert.equal(playerIn(state, target).health, 100);
    assert.equal(playerIn(state, target).shieldHealth, expectedShield);
    assert.equal(state.events.some((event) => event.action === 'shatter'), expectedShield === 0);
    assert.equal(playerIn(state, shooter).kills, 0);
  }

  const wisp = await join(t, game, 'echo-shot', 'sniper');
  const marksman = await join(t, game, 'echo-shot');
  const victim = await join(t, game, 'echo-shot', 'heavy');
  const echoRoom = game.rooms.get('echo-shot');
  Object.assign(echoRoom.peers.get(wisp.welcome.id).player, { x: -24, y: 0, z: 10, yaw: 0 });
  Object.assign(echoRoom.peers.get(marksman.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(echoRoom.peers.get(victim.welcome.id).player, { x: -27, y: 0, z: 5, yaw: 0 });
  await activate(wisp);
  const echo = echoRoom.effects.find((effect) => effect.owner === wisp.welcome.id);
  // Place the existing server-owned echo in a clear firing lane, ahead of a player.
  Object.assign(echo, { x: -27, y: 0, z: 10, vx: 0, vz: 0 });
  const intercepted = receive(marksman.ws, 'state', (state) => state.events.some((event) => event.type === 'shot' && event.id === marksman.welcome.id));
  marksman.ws.send(JSON.stringify({ type: 'input', inputs: [command({ fire: true }), command({ seq: 2 })] }));
  const state = await intercepted;
  const shot = state.events.find((event) => event.type === 'shot');
  assert.equal(shot.echoHit, echo.id);
  assert.equal(shot.hit, undefined);
  assert.equal(state.effects.some((effect) => effect.id === echo.id), false);
  assert.equal(playerIn(state, wisp).abilityTime, 0, 'a destroyed echo is no longer shown as active');
  assert.ok(playerIn(state, wisp).abilityCooldown > 0, 'destroying a decoy does not refund the power');
  assert.ok(state.events.some((event) => event.type === 'power' && event.action === 'glitch' && event.effectId === echo.id));
  for (const player of state.players) {
    assert.equal(player.health, 100);
    assert.equal(player.kills, 0);
    assert.equal(player.deaths, 0);
  }
});
