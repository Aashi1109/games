import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGameServer, sanitizeInput } from '../server/index.js';
import { MAPS, DEFAULT_MAP, getMap } from '../shared/world.js';

const command = (extra = {}) => ({ seq: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, fire: false, reload: false, ...extra });
const newMaps = Object.values(MAPS).filter((map) => map.id !== DEFAULT_MAP);

function receive(ws, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, 3000);
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
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, ...options });
  t.after(() => game.close());
  return game;
}

async function socket(t, game) {
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/ws`);
  await once(ws, 'open');
  t.after(() => ws.terminate());
  return ws;
}

async function join(t, game, room, mapId) {
  const ws = await socket(t, game);
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, mapId, name: 'Runner' }));
  return { ws, welcome: await welcome };
}

function assertSpawn(player, map) {
  assert.ok(map.spawns.some((spawn) => Math.abs(player.x - spawn.x) < 0.001 && Math.abs(player.z - spawn.z) < 0.001), `Player must use a ${map.id} spawn`);
}

test('rope interaction accepts booleans, defaults old inputs to false and rejects forged state', () => {
  assert.equal(sanitizeInput(command()).interact, false);
  assert.equal(sanitizeInput(command({ interact: true })).interact, true);
  assert.equal(sanitizeInput(command({ interact: false })).interact, false);
  for (const interact of [undefined, null, 0, 1, 'true', {}, []]) {
    assert.equal(sanitizeInput(command({ interact })), null);
  }
  const safe = sanitizeInput(command({ interact: true, ropeId: 'forged-rope', ropeProgress: 1000 }));
  assert.equal(safe.ropeId, undefined);
  assert.equal(safe.ropeProgress, undefined);
});

test('different maps run in isolated rooms and broadcast their own map and spawns', async (t) => {
  const game = await server(t);
  assert.ok(newMaps.length >= 2, 'Provide multiple new environments');
  const entries = await Promise.all(Object.values(MAPS).map((map, index) => join(t, game, `map-${index}`, map.id)));
  for (const [index, entry] of entries.entries()) {
    const map = Object.values(MAPS)[index];
    assert.equal(entry.welcome.mapId, map.id);
    assertSpawn(entry.welcome.player, map);
    assert.equal(game.rooms.get(entry.welcome.room).map, map);
    const state = await receive(entry.ws, 'state');
    assert.equal(state.mapId, map.id);
    assert.equal(state.players.length, 1);
    assert.equal(state.players[0].id, entry.welcome.id);
  }
});

test('existing rooms retain their map when joining preferences differ or are omitted', async (t) => {
  const game = await server(t);
  const first = await join(t, game, 'selected', newMaps[0].id);
  const conflicting = await join(t, game, 'selected', newMaps[1].id);
  const legacy = await join(t, game, 'selected');
  const defaultRoom = await join(t, game, 'legacy');
  assert.equal(defaultRoom.welcome.mapId, DEFAULT_MAP);
  assertSpawn(defaultRoom.welcome.player, getMap());
  for (const entry of [first, conflicting, legacy]) {
    assert.equal(entry.welcome.mapId, newMaps[0].id);
    assertSpawn(entry.welcome.player, newMaps[0]);
    const state = await receive(entry.ws, 'state');
    assert.equal(state.mapId, newMaps[0].id);
    assert.equal(state.players.length, 3);
  }
});

test('authoritative collisions and bullet impacts use the room environment', async (t) => {
  const game = await server(t);
  for (const [index, map] of newMaps.entries()) {
    const roof = map.boxes
      .filter((box) => box.style !== 'floor' && box.style !== 'wall' && box.w > 2 && box.d > 2)
      .filter((box) => !map.boxes.some((other) => other.y + other.h > box.y + box.h && Math.abs(box.x - other.x) <= other.w / 2 && Math.abs(box.z - other.z) <= other.d / 2))
      .sort((a, b) => b.y + b.h - a.y - a.h)[0];
    assert.ok(roof, `${map.id} needs elevated geometry`);
    const top = roof.y + roof.h;
    const entry = await join(t, game, `surface-${index}`, map.id);
    const peer = game.rooms.get(entry.welcome.room).peers.get(entry.welcome.id);
    Object.assign(peer.player, { x: roof.x, y: top, z: roof.z, vx: 0, vy: 0, vz: 0, grounded: true, padCooldown: 1 });
    const standing = await receive(entry.ws, 'state');
    assert.equal(standing.players[0].y, top, 'the player stands on this room map geometry');
    Object.assign(peer.player, { y: top + 4, vy: 0, grounded: false });
    const impact = receive(entry.ws, 'state', (state) => state.events.some((event) => event.type === 'shot'));
    entry.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 1, pitch: -Math.PI / 2, fire: true }), command({ seq: 2, pitch: -Math.PI / 2 })] }));
    const state = await impact;
    const shot = state.events.find((event) => event.type === 'shot');
    assert.ok(Math.abs(shot.to.y - top) < 0.001, `Shots must hit the ${map.id} roof`);
    assert.deepEqual(shot.surface.normal, { x: 0, y: 1, z: 0 });
    assert.equal(shot.surface.style, roof.style);
  }
});

test('invalid explicit map IDs fail before room allocation, including prototype keys', async (t) => {
  const game = await server(t);
  const ws = await socket(t, game);
  for (const mapId of ['__proto__', 'constructor', 'toString', '', 'missing', null, 1, {}, []]) {
    const failure = receive(ws, 'error');
    ws.send(JSON.stringify({ type: 'join', room: 'invalid', mapId, name: 'Runner' }));
    assert.match((await failure).message, /valid map/);
    assert.equal(game.rooms.size, 0);
  }
  await join(t, game, 'existing', newMaps[0].id);
  const failure = receive(ws, 'error');
  ws.send(JSON.stringify({ type: 'join', room: 'existing', mapId: 'missing', name: 'Runner' }));
  assert.match((await failure).message, /valid map/);
  assert.equal(game.rooms.get('existing').peers.size, 1);
});

test('respawn and round resets keep each selected map and its spawn locations', async (t) => {
  const game = await server(t);
  for (const [index, map] of newMaps.entries()) {
    const entry = await join(t, game, `reset-${index}`, map.id);
    const room = game.rooms.get(entry.welcome.room);
    const peer = room.peers.get(entry.welcome.id);
    Object.assign(peer.player, { health: 0, respawnIn: 0.02, kills: 3, deaths: 2 });
    const respawn = await receive(entry.ws, 'state', (state) => state.players[0].life === 1);
    assert.equal(respawn.mapId, map.id);
    assertSpawn(respawn.players[0], map);
    assert.equal(respawn.players[0].health, 100);
    assert.equal(respawn.players[0].kills, 3);
    assert.equal(respawn.players[0].deaths, 2);
    room.remaining = 0;
    const reset = await receive(entry.ws, 'state', (state) => state.events.some((event) => event.type === 'round'));
    assert.equal(reset.mapId, map.id);
    assertSpawn(reset.players[0], map);
    assert.equal(reset.players[0].life, 2);
    assert.equal(reset.players[0].kills, 0);
    assert.equal(reset.players[0].deaths, 0);
    assert.equal(room.mapId, map.id);
  }
});

test('invalid interaction input is ignored while valid interaction is acknowledged', async (t) => {
  const game = await server(t);
  const entry = await join(t, game, 'interact', newMaps[0].id);
  const peer = game.rooms.get('interact').peers.get(entry.welcome.id);
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 1, interact: 'yes' })] }));
  const untouched = await receive(entry.ws, 'state');
  assert.equal(untouched.players[0].seq, -1);
  assert.equal(peer.receivedSeq, -1);
  entry.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: 2, interact: true, ropeId: 'forged', ropeProgress: 999 })] }));
  const accepted = await receive(entry.ws, 'state', (state) => state.players[0].seq === 2);
  assert.notEqual(accepted.players[0].ropeId, 'forged');
  assert.notEqual(accepted.players[0].ropeProgress, 999);
  assert.equal(peer.lastInput.interact, true);
});
