import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, MODES, isModeId, getMode } from '../shared/modes.ts';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createTestServer } from './helpers/server.js';

test('mode registry exposes ffa and tdm, rejects unknown ids', () => {
  assert.equal(DEFAULT_MODE, 'ffa');
  assert.ok(isModeId('ffa'));
  assert.ok(isModeId('tdm'));
  assert.equal(MODES.tdm.teams, true);
  assert.equal(isModeId('chaos'), false);
  assert.equal(isModeId(''), false);
  assert.equal(isModeId(null), false);
  assert.equal(getMode('ffa'), MODES.ffa);
  assert.equal(getMode('nope'), MODES.ffa);
  assert.equal(getMode(undefined), MODES.ffa);
});

test('mode registry exposes domination with team scoring', () => {
  assert.ok(isModeId('domination'));
  assert.equal(MODES.domination.teams, true);
  assert.equal(MODES.domination.scoring, 'zones');
});

function receive(ws, type, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, timeout);
    function listener(data) { const message = JSON.parse(data); if (message.type === type) { clearTimeout(timer); ws.off('message', listener); resolve(message); } }
    ws.on('message', listener);
  });
}
async function quickjoin(url, { mapId = 'vertex', mode = 'ffa', name = 'Player', classId, botFill, team } = {}) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', quickplay: true, mapId, mode, name, classId, botFill, team }));
  return { ws, welcome: await welcome };
}

test('quickplay joins reuse an existing room for the same map+mode until it is full, then overflow to a new one', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => b.ws.terminate());
  assert.equal(a.welcome.room, b.welcome.room, 'second quickplay join lands in the same room while there is space');
  const c = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => c.ws.terminate());
  assert.notEqual(c.welcome.room, a.welcome.room, 'a full bucket overflows into a newly created room');
  assert.equal(game.rooms.size, 2);
});

test('quickplay buckets by map and mode independently', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await quickjoin(url, { mapId: 'vertex' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mapId: 'canyon-relay' }); t.after(() => b.ws.terminate());
  assert.notEqual(a.welcome.room, b.welcome.room);
  assert.equal(game.rooms.get(a.welcome.room).mapId, 'vertex');
  assert.equal(game.rooms.get(b.welcome.room).mapId, 'canyon-relay');
});

test('quickplay rejects an unknown mode before creating a room', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/drift/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  const failure = receive(ws, 'error');
  ws.send(JSON.stringify({ type: 'join', quickplay: true, mapId: 'vertex', mode: 'chaos', name: 'A' }));
  assert.match((await failure).message, /valid mode/);
  assert.equal(game.rooms.size, 0);
});

test('bot-fill toggle off keeps quickplay rooms free of bots while other rooms still fill', async (t) => {
  const game = await createTestServer({ botTarget: 3, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const noBots = await quickjoin(url, { mapId: 'vertex', mode: 'ffa', botFill: false }); t.after(() => noBots.ws.terminate());
  assert.equal(game.rooms.get(noBots.welcome.room).peers.size, 1);
  const withBots = await quickjoin(url, { mapId: 'canyon-relay', mode: 'ffa' }); t.after(() => withBots.ws.terminate());
  assert.equal(game.rooms.get(withBots.welcome.room).peers.size, 3);
});

test('explicit room codes still work without the quickplay flag and default to ffa', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/drift/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room: 'legacy-code', name: 'A', mapId: 'vertex' }));
  await welcome;
  assert.equal(game.rooms.get('legacy-code').mode, 'ffa');
  assert.equal(game.rooms.get('legacy-code').bucket, null);
});

test('tdm quickplay auto-assigns the less-populated team when no team is requested', async (t) => {
  const game = await createTestServer({ botTarget: 0, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await quickjoin(url, { mode: 'tdm', team: 'a' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mode: 'tdm' }); t.after(() => b.ws.terminate());
  const room = game.rooms.get(a.welcome.room);
  assert.equal(room.peers.get(a.welcome.id).player.team, 'a');
  assert.equal(room.peers.get(b.welcome.id).player.team, 'b', 'second joiner auto-assigned to the smaller team');
});

test('tdm bots balance onto whichever team has fewer players', async (t) => {
  const game = await createTestServer({ botTarget: 4, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/drift/ws`;
  const a = await quickjoin(url, { mode: 'tdm', team: 'a' }); t.after(() => a.ws.terminate());
  const room = game.rooms.get(a.welcome.room);
  const teams = [...room.peers.values()].map((peer) => peer.player.team);
  const counts = { a: teams.filter((x) => x === 'a').length, b: teams.filter((x) => x === 'b').length };
  assert.ok(Math.abs(counts.a - counts.b) <= 1, `teams should be balanced, got ${JSON.stringify(counts)}`);
});

test('ffa quickplay joins never get a team assigned', async (t) => {
  const game = await createTestServer({ botTarget: 0 });
  t.after(() => game.close());
  const a = await quickjoin(`ws://127.0.0.1:${game.port}/drift/ws`, { mode: 'ffa' }); t.after(() => a.ws.terminate());
  assert.equal(a.welcome.player.team, undefined);
});
