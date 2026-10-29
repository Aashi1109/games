import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createTestServer } from './helpers/server.js';
import { CLASSES, getClass } from '../shared/classes.ts';
import { MAPS } from '../shared/world.ts';

const command = (extra = {}) => ({ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, interact: false, ...extra });
const bots = (state) => state.players.filter((player) => player.bot);
const humans = (state) => state.players.filter((player) => !player.bot);

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
  const game = await createTestServer({ ...options });
  t.after(() => game.close());
  return game;
}

async function socket(t, game) {
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/drift/ws`);
  await once(ws, 'open');
  t.after(() => ws.terminate());
  return ws;
}

async function join(t, game, room = 'bots', extra = {}) {
  const ws = await socket(t, game);
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name: 'Runner', ...extra }));
  return { ws, welcome: await welcome };
}

async function disconnect(ws) {
  if (ws.readyState === WebSocket.CLOSED) return;
  const closed = once(ws, 'close');
  ws.close();
  await closed;
}

test('a solo room automatically includes three named AI opponents with class loadouts', async (t) => {
  const game = await server(t);
  const entry = await join(t, game);
  const state = await receive(entry.ws, 'state');
  assert.equal(state.players.length, 4);
  assert.equal(humans(state).length, 1);
  assert.equal(humans(state)[0].id, entry.welcome.id);
  assert.equal(bots(state).length, 3);
  assert.equal(new Set(bots(state).map((player) => player.name)).size, 3);
  assert.deepEqual(new Set(state.players.map((player) => player.classId)), new Set(Object.keys(CLASSES)), 'a solo match showcases all four characters');
  for (const player of bots(state)) {
    assert.equal(player.bot, true);
    assert.ok(Object.hasOwn(CLASSES, player.classId));
    assert.equal(player.name, getClass(player.classId).character);
    assert.equal(player.health, 100);
    assert.equal(player.ammo, getClass(player.classId).magazine);
  }
});

test('friends replace AI, six humans can join, and AI replenishes without keeping empty rooms alive', async (t) => {
  const game = await server(t);
  const entries = [];
  for (let count = 1; count <= 6; count++) {
    entries.push(await join(t, game, 'friends', { name: `Friend ${count}` }));
    const state = await receive(entries[0].ws, 'state', (state) => humans(state).length === count);
    assert.equal(state.players.length, Math.max(4, count));
    assert.equal(bots(state).length, Math.max(0, 4 - count));
    if (count === 4) {
      for (const [index, player] of humans(state).entries()) {
        for (const other of humans(state).slice(index + 1)) {
          assert.ok(Math.hypot(player.x - other.x, player.z - other.z) > 2, 'replacing AI must not spawn friends on top of each other');
        }
      }
    }
  }
  const overflow = await socket(t, game);
  const error = receive(overflow, 'error');
  overflow.send(JSON.stringify({ type: 'join', room: 'friends', name: 'Seventh' }));
  assert.match((await error).message, /full/i);
  assert.equal(game.rooms.get('friends').peers.size, 6);

  await Promise.all(entries.slice(3).map((entry) => disconnect(entry.ws)));
  const three = await receive(entries[0].ws, 'state', (state) => humans(state).length === 3);
  assert.equal(bots(three).length, 1);
  await Promise.all(entries.slice(1, 3).map((entry) => disconnect(entry.ws)));
  const solo = await receive(entries[0].ws, 'state', (state) => humans(state).length === 1);
  assert.equal(bots(solo).length, 3);
  const serverClosed = once(game.rooms.get('friends').peers.get(entries[0].welcome.id).ws, 'close');
  await disconnect(entries[0].ws);
  await serverClosed;
  assert.equal(game.rooms.has('friends'), false, 'AI must not retain a room after its final human leaves');
});

test('AI opponents remain isolated in every selected map', async (t) => {
  const game = await server(t);
  const seen = new Set();
  for (const [index, map] of Object.values(MAPS).entries()) {
    const entry = await join(t, game, `map-ai-${index}`, { mapId: map.id });
    const state = await receive(entry.ws, 'state');
    assert.equal(state.mapId, map.id);
    assert.equal(bots(state).length, 3);
    for (const player of state.players) {
      assert.equal(seen.has(player.id), false, 'rooms cannot share an AI or human player');
      seen.add(player.id);
      assert.ok(Math.abs(player.x) < map.size / 2 && Math.abs(player.z) < map.size / 2);
    }
    assert.equal(game.rooms.get(entry.welcome.room).map, map);
  }
});

test('AI moves and damages a visible human through authoritative shot events', async (t) => {
  const game = await server(t, { botTarget: 2 });
  const entry = await join(t, game, 'ai-combat');
  const room = game.rooms.get('ai-combat');
  const human = room.peers.get(entry.welcome.id);
  const bot = [...room.peers.values()].find((peer) => peer.player.bot);
  // The west lane has no cover or jump pads, so sight and movement are unambiguous.
  Object.assign(human.player, { x: -27, y: 0, z: 15, vx: 0, vy: 0, vz: 0, yaw: 0 });
  Object.assign(bot.player, { x: -27, y: 0, z: 10, vx: 0, vy: 0, vz: 0, yaw: Math.PI });
  const state = await receive(entry.ws, 'state', (state) => state.events.some((event) => event.type === 'shot' && event.id === bot.player.id && event.hit === entry.welcome.id), 8000);
  const attacker = bots(state)[0];
  const victim = humans(state)[0];
  assert.ok(Math.hypot(attacker.x + 27, attacker.z - 10) > 0.1, 'AI must move through shared physics');
  assert.ok(victim.health <= 100 - getClass(attacker.classId).damage, 'an AI hit must reduce authoritative health');
  assert.ok(attacker.ammo < getClass(attacker.classId).magazine, 'AI consumes its class magazine');
  const shot = state.events.find((event) => event.type === 'shot' && event.id === attacker.id && event.hit === victim.id);
  assert.equal(shot.classId, attacker.classId);
  assert.ok(Number.isFinite(shot.from.x) && Number.isFinite(shot.to.z));
});

test('human shots kill AI, preserve its identity on respawn, and round reset clears AI scores', async (t) => {
  const game = await server(t, { botTarget: 2, respawnSeconds: 0.15 });
  const entry = await join(t, game, 'ai-life');
  const room = game.rooms.get('ai-life');
  const human = room.peers.get(entry.welcome.id);
  const bot = [...room.peers.values()].find((peer) => peer.player.bot);
  const identity = { id: bot.player.id, name: bot.player.name, classId: bot.player.classId };
  // Keep this victim stationary to isolate damage/lifecycle from the AI movement test above.
  bot.bot.update = (player) => command({ seq: player.seq + 1, yaw: player.yaw });
  Object.assign(human.player, { x: -27, y: 0, z: 15, vx: 0, vy: 0, vz: 0, yaw: 0 });
  Object.assign(bot.player, { x: -27, y: 0, z: 10, vx: 0, vy: 0, vz: 0, health: 20 });
  const killed = receive(entry.ws, 'state', (state) => state.events.some((event) => event.type === 'kill' && event.victim === identity.id));
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [command({ fire: true }), command({ seq: 2 })] }));
  const death = await killed;
  assert.equal(bots(death)[0].health, 0);
  assert.equal(bots(death)[0].deaths, 1);
  assert.equal(humans(death)[0].kills, 1);
  const respawn = await receive(entry.ws, 'state', (state) => bots(state)[0]?.life === 1);
  const fresh = bots(respawn)[0];
  assert.deepEqual({ id: fresh.id, name: fresh.name, classId: fresh.classId }, identity);
  assert.equal(fresh.health, 100);
  assert.equal(fresh.bot, true);
  assert.equal(fresh.deaths, 1);
  assert.equal(fresh.ammo, getClass(fresh.classId).magazine);

  bot.player.kills = 5;
  room.remaining = 0;
  const reset = await receive(entry.ws, 'state', (state) => state.events.some((event) => event.type === 'round'));
  const resetBot = bots(reset)[0];
  assert.equal(reset.players.length, 2);
  assert.equal(resetBot.id, identity.id);
  assert.equal(resetBot.classId, identity.classId);
  assert.equal(resetBot.life, 2);
  assert.equal(resetBot.health, 100);
  assert.equal(resetBot.kills, 0);
  assert.equal(resetBot.deaths, 0);
  assert.equal(humans(reset)[0].kills, 0);
});

test('botTarget zero leaves solo practice rooms human-only', async (t) => {
  const game = await server(t, { botTarget: 0 });
  const entry = await join(t, game, 'practice');
  const state = await receive(entry.ws, 'state');
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].id, entry.welcome.id);
  assert.equal(state.players[0].health, 100);
  assert.equal(bots(state).length, 0);
});
