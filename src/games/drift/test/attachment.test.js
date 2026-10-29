import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { attachDriftMultiplayer } from '../server/index.ts';

test('multiplayer attaches without listening and closes without stopping the application', async t => {
  const server = http.createServer((_request, response) => response.end('Next application'));
  const multiplayer = attachDriftMultiplayer(server, { botTarget: 0 });
  t.after(async () => {
    await multiplayer.close();
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  assert.equal(server.listening, false);
  assert.equal(server.listenerCount('upgrade'), 1);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/drift/ws`, { origin });
  await once(socket, 'open');
  const welcome = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'join', room: 'attached', name: 'Player', botFill: false }));
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome');
  assert.deepEqual(multiplayer.health(), { ok: true, rooms: 1 });
  const disconnected = once(socket, 'close');
  await multiplayer.close();
  await disconnected;
  await multiplayer.close();
  assert.equal(multiplayer.health().ok, false);
  assert.equal(server.listenerCount('upgrade'), 0);
  assert.equal(server.listening, true);
  assert.equal(await fetch(origin).then(response => response.text()), 'Next application');
});
