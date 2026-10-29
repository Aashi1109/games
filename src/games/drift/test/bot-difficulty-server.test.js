import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createTestServer } from './helpers/server.js';

const bots = (state) => state.players.filter((player) => player.bot);
const humans = (state) => state.players.filter((player) => !player.bot);

function receive(ws, type, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', listener);
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeout);
    function listener(raw) {
      const message = JSON.parse(raw);
      if (message.type !== type || !predicate(message)) return;
      clearTimeout(timer);
      ws.off('message', listener);
      resolve(message);
    }
    ws.on('message', listener);
  });
}

async function server(t, options = {}) {
  const game = await createTestServer({ ...options });
  t.after(() => game.close());
  return game;
}

async function join(t, game, options = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/drift/ws`);
  await once(ws, 'open');
  t.after(() => ws.terminate());
  const welcome = receive(ws, 'welcome');
  const state = receive(ws, 'state');
  ws.send(JSON.stringify({ type: 'join', name: 'Runner', room: 'difficulty', ...options }));
  return { ws, welcome: await welcome, state: await state };
}

function assertDifficulty(entry, expected) {
  assert.equal(entry.welcome.botDifficulty, expected, 'welcome publishes the room difficulty');
  assert.equal(entry.state.botDifficulty, expected, 'state publishes the room difficulty');
}

test('all supported difficulties are stored and published by private and quickplay rooms', async (t) => {
  const game = await server(t);
  for (const botDifficulty of ['easy', 'normal', 'hard']) {
    const privateEntry = await join(t, game, { room: `ai-${botDifficulty}`, botDifficulty });
    const quickEntry = await join(t, game, { quickplay: true, botDifficulty });
    for (const entry of [privateEntry, quickEntry]) {
      assertDifficulty(entry, botDifficulty);
      assert.equal(game.rooms.get(entry.welcome.room).botDifficulty, botDifficulty);
      assert.equal(bots(entry.state).length, 3);
    }
  }
});

test('omitted and malformed difficulty values safely use easy at the join boundary', async (t) => {
  const game = await server(t, { botTarget: 2 });
  const invalid = [undefined, null, {}, ['hard'], 'unknown', '__proto__', 'constructor', 'toString', 2, true];
  for (const [index, botDifficulty] of invalid.entries()) {
    const entry = await join(t, game, { room: `invalid-${index}`, botDifficulty });
    assertDifficulty(entry, 'easy');
    assert.equal(game.rooms.get(entry.welcome.room).botDifficulty, 'easy');
    assert.equal(bots(entry.state).length, 1, 'invalid values must not disable bot filling');
  }
  const normal = await join(t, game, { quickplay: true, botDifficulty: 'normal' });
  const fallback = await join(t, game, { quickplay: true, botDifficulty: { id: 'normal' } });
  const easy = await join(t, game, { quickplay: true });
  assertDifficulty(fallback, 'easy');
  assert.equal(fallback.welcome.room, easy.welcome.room, 'normalized values share the easy bucket');
  assert.notEqual(fallback.welcome.room, normal.welcome.room);
});

test('quickplay shares matching selections and separates difficulty, map, mode, and bot filling', async (t) => {
  const game = await server(t);
  const selection = { quickplay: true, mapId: 'vertex', mode: 'ffa', botDifficulty: 'normal', botFill: true };
  const first = await join(t, game, selection);
  const same = await join(t, game, selection);
  assert.equal(first.welcome.room, same.welcome.room);
  assertDifficulty(same, 'normal');
  assert.equal(humans(same.state).length, 2);
  assert.equal(bots(same.state).length, 2);

  const alternatives = [
    { botDifficulty: 'easy' },
    { botDifficulty: 'hard' },
    { mapId: 'canyon-relay' },
    { mode: 'tdm' },
    { botFill: false },
  ];
  const rooms = new Set([first.welcome.room]);
  for (const change of alternatives) {
    const entry = await join(t, game, { ...selection, ...change });
    assert.equal(rooms.has(entry.welcome.room), false, `selection ${JSON.stringify(change)} must have its own room`);
    rooms.add(entry.welcome.room);
    assertDifficulty(entry, change.botDifficulty ?? 'normal');
    assert.equal(bots(entry.state).length, change.botFill === false ? 0 : 3);
  }
  assert.equal(game.rooms.size, 6);
});

test('bot-free quickplay ignores difficulty for matching and publishes its creator setting', async (t) => {
  const game = await server(t);
  const creator = await join(t, game, { quickplay: true, botFill: false, botDifficulty: 'hard' });
  const newcomer = await join(t, game, { quickplay: true, botFill: false, botDifficulty: 'easy' });
  assert.equal(creator.welcome.room, newcomer.welcome.room);
  assertDifficulty(creator, 'hard');
  assertDifficulty(newcomer, 'hard');
  assert.equal(humans(newcomer.state).length, 2);
  assert.equal(bots(newcomer.state).length, 0);
  assert.equal(game.rooms.get(creator.welcome.room).botFill, false);
});

test('explicit room joins preserve the creator difficulty and bot-fill setting for every player', async (t) => {
  const game = await server(t);
  const creator = await join(t, game, { room: 'shared-ai', botDifficulty: 'hard' });
  const newcomer = await join(t, game, { room: 'shared-ai', botDifficulty: 'easy', botFill: false });
  assert.equal(creator.welcome.room, newcomer.welcome.room);
  assertDifficulty(newcomer, 'hard');
  assert.equal(bots(newcomer.state).length, 2);
  assert.equal(game.rooms.get('shared-ai').botDifficulty, 'hard');

  for (let frame = 0; frame < 3; frame++) {
    const states = await Promise.all([receive(creator.ws, 'state'), receive(newcomer.ws, 'state')]);
    for (const state of states) assert.equal(state.botDifficulty, 'hard');
  }

  const failure = receive(newcomer.ws, 'error');
  newcomer.ws.send(JSON.stringify({ type: 'join', name: 'Runner', room: 'shared-ai', botDifficulty: 'easy' }));
  assert.match((await failure).message, /already in a room/i);
  assert.equal((await receive(newcomer.ws, 'state')).botDifficulty, 'hard');

  const noBots = await join(t, game, { room: 'private-off', botFill: false, botDifficulty: 'normal' });
  const joining = await join(t, game, { room: 'private-off', botFill: true, botDifficulty: 'hard' });
  assertDifficulty(noBots, 'normal');
  assertDifficulty(joining, 'normal');
  assert.equal(bots(joining.state).length, 0);
});

test('bot replenishment and round resets preserve room difficulty and publish it to remaining players', async (t) => {
  const game = await server(t, { botTarget: 2 });
  const creator = await join(t, game, { room: 'ai-lifecycle', botDifficulty: 'normal' });
  const originalBot = bots(creator.state)[0];
  const newcomer = await join(t, game, { room: 'ai-lifecycle', botDifficulty: 'hard' });
  assertDifficulty(newcomer, 'normal');
  assert.equal(bots(newcomer.state).length, 0, 'a human replaces the original bot');

  const replenished = receive(creator.ws, 'state', (state) => humans(state).length === 1 && bots(state).length === 1);
  newcomer.ws.close();
  const solo = await replenished;
  assert.equal(solo.botDifficulty, 'normal');
  const replacementBot = bots(solo)[0];
  assert.notEqual(replacementBot.id, originalBot.id);

  const round = receive(creator.ws, 'state', (state) => state.events.some((event) => event.type === 'round'));
  game.rooms.get('ai-lifecycle').remaining = 0;
  const reset = await round;
  assert.equal(reset.botDifficulty, 'normal');
  assert.equal(game.rooms.get('ai-lifecycle').botDifficulty, 'normal');
  assert.equal(bots(reset)[0].id, replacementBot.id);
  assert.equal(bots(reset)[0].life, replacementBot.life + 1);
  assert.equal((await receive(creator.ws, 'state')).botDifficulty, 'normal');
});

test('server-wide botTarget zero remains human-only with any selected difficulty', async (t) => {
  const game = await server(t, { botTarget: 0 });
  const entry = await join(t, game, { botDifficulty: 'hard' });
  assertDifficulty(entry, 'hard');
  assert.equal(entry.state.players.length, 1);
  assert.equal(bots(entry.state).length, 0);
});
