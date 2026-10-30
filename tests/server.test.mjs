import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createCollectionServer } from '../src/server.ts';
import { getRuntime } from '../src/server/runtime.ts';

const close = (server) =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
const rawGet = (origin, pathname) =>
  new Promise((resolve, reject) => {
    http
      .get(origin, { path: pathname }, (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      })
      .once('error', reject);
  });
function receive(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`No ${type} message`));
    }, 5000);
    const onMessage = (data) => {
      const message = JSON.parse(data);
      if (message.type === type) {
        cleanup();
        resolve(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
    };
    socket.on('message', onMessage);
  });
}

for (const trustProxy of [false, true]) {
  test(`client addresses use a single validated proxy IP only when trustProxy=${trustProxy}`, async (t) => {
    const server = await createCollectionServer({ trustProxy });
    t.after(() => close(server));
    t.mock.method(getRuntime().doodle, 'handle', (request) =>
      Response.json({
        address: request.headers.get('x-questline-client-address'),
      }),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const cases = [
      { headers: { 'X-Real-IP': '198.51.100.7' }, expected: '198.51.100.7' },
      { headers: { 'X-Real-IP': '2001:db8::7' }, expected: '2001:db8::7' },
      { headers: {}, expected: '127.0.0.1' },
      { headers: { 'X-Real-IP': 'not-an-ip' }, expected: '127.0.0.1' },
      {
        headers: { 'X-Real-IP': '198.51.100.7, 203.0.113.8' },
        expected: '127.0.0.1',
      },
      {
        headers: { 'X-Questline-Client-Address': '203.0.113.8' },
        expected: '127.0.0.1',
      },
      {
        headers: { 'X-Forwarded-For': '203.0.113.8' },
        expected: '127.0.0.1',
      },
      {
        headers: {
          'X-Real-IP': '198.51.100.7',
          'X-Questline-Client-Address': '203.0.113.8',
        },
        expected: '198.51.100.7',
      },
    ];
    for (const { headers, expected } of cases) {
      const response = await fetch(`${origin}/doodle-dash/api/rooms`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(
        (await response.json()).address,
        trustProxy ? expected : '127.0.0.1',
        JSON.stringify(headers),
      );
    }
  });
}

test(
  'Next production collection preserves game routes and multiplayer',
  { timeout: 60_000 },
  async (t) => {
    const listens = [];
    const listen = http.Server.prototype.listen;
    const listenerSpy = t.mock.method(
      http.Server.prototype,
      'listen',
      function (...args) {
        listens.push(this);
        return listen.apply(this, args);
      },
    );
    const server = await createCollectionServer();
    assert.equal(
      listens.length,
      0,
      'Preparing the app never starts a separate game listener',
    );
    t.after(() => close(server));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    assert.deepEqual(
      listens,
      [server],
      'Next and multiplayer share the only listener',
    );
    listenerSpy.mock.restore();
    const origin = `http://127.0.0.1:${server.address().port}`;

    await t.test(
      'App Router renders every game and serves their public assets',
      async () => {
        const pages = [
          '/',
          '/trap-sprint/',
          '/daily-circuit/',
          '/bumper-ring/',
          '/block-bloom/',
          '/shelf-shuffle/',
          '/wobble-delivery/',
          '/corner-rush/',
          '/drift/',
          '/arcade/',
          ...[
            'asteroid-run',
            'beat-bounce',
            'brick-breaker',
            'claw-catch',
            'doodle-dash',
            'faultline',
            'kitchen-rush',
            'lane-rush',
            'pocket-pinball',
            'pocket-putt',
            'tiny-tower-defense',
            'word-weave',
          ].map((game) => `/${game}/`),
        ];
        const metadata = new Map([
          [
            '/drift/',
            {
              title: 'DRIFT — Find your flow',
              icon: '/drift/mark.svg',
              theme: '#202b29',
            },
          ],
          [
            '/arcade/',
            {
              title: 'Little Break — Small games. Big good time.',
              icon: '/arcade/public/favicon.svg',
              theme: '#f6f3eb',
            },
          ],
          [
            '/trap-sprint/',
            {
              title: 'Trap Sprint — Little Break',
              icon: '/arcade/public/favicon.svg',
              theme: '#e5e5dc',
            },
          ],
          [
            '/doodle-dash/',
            {
              title: 'Doodle Dash — Questionable art. Excellent company.',
              icon: '/assets/shelf/mark.svg',
              theme: '#26282b',
            },
          ],
          [
            '/pocket-putt/',
            {
              title: 'Pocket Putt — Six little greens',
              icon: '/assets/shelf/mark.svg',
              theme: '#123941',
            },
          ],
        ]);
        const resources = new Set();
        for (const pathname of pages) {
          const response = await fetch(origin + pathname);
          assert.equal(response.status, 200, pathname);
          assert.match(
            response.headers.get('content-type'),
            /text\/html/,
            pathname,
          );
          const html = await response.text();
          assert.match(html, /\/_next\//, `${pathname} is rendered by Next`);
          assert.doesNotMatch(html, /@vite\/client/, pathname);
          const expected = metadata.get(pathname);
          if (expected) {
            assert.equal(
              html.match(/<title>([^<]*)<\/title>/)?.[1],
              expected.title,
              `${pathname} retains its title`,
            );
            const tags = html.match(/<(?:meta|link)\b[^>]*>/g) || [];
            assert.ok(
              tags.some(
                (tag) =>
                  tag.includes('rel="icon"') &&
                  tag.includes(`href="${expected.icon}"`),
              ),
              `${pathname} retains its icon`,
            );
            assert.ok(
              tags.some(
                (tag) =>
                  tag.includes('name="theme-color"') &&
                  tag.includes(`content="${expected.theme}"`),
              ),
              `${pathname} retains its theme color`,
            );
          }
          for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
            assert.ok(
              src.startsWith('/_next/'),
              `${pathname} code is compiled by Next: ${src}`,
            );
          }
          for (const [, resource] of html.matchAll(
            /(?:src|href)="([^"\s]+\.(?:js|css|svg|png|webp|woff2|ttf)(?:[?#][^"]*)?)"/g,
          )) {
            resources.add(new URL(resource, origin + pathname).href);
          }
        }
        for (const resource of resources) {
          const response = await fetch(resource);
          assert.equal(response.status, 200, resource);
          assert.doesNotMatch(
            response.headers.get('content-type'),
            /text\/html/,
            resource,
          );
          assert.ok((await response.arrayBuffer()).byteLength > 0, resource);
        }
        assert.ok(resources.size > 20, 'Game pages expose local assets');
        const redirect = await fetch(`${origin}/drift?room=play`, {
          redirect: 'manual',
        });
        assert.ok([301, 302, 307, 308].includes(redirect.status));
        assert.equal(redirect.headers.get('location'), '/drift/?room=play');
      },
    );

    await t.test(
      'unknown and prototype-name game slugs return 404',
      async () => {
        for (const slug of [
          'not-a-game',
          'constructor',
          '__proto__',
          'toString',
          'hasOwnProperty',
        ]) {
          const response = await fetch(`${origin}/${slug}/`);
          assert.equal(response.status, 404, slug);
          await response.arrayBuffer();
        }
      },
    );

    await t.test(
      'health checks support GET and HEAD and reject mutations',
      async () => {
        for (const pathname of ['/health', '/drift/health']) {
          for (const method of ['GET', 'HEAD']) {
            const response = await fetch(origin + pathname, { method });
            assert.equal(response.status, 200);
            assert.match(response.headers.get('cache-control'), /no-store/);
            if (method === 'HEAD') assert.equal(await response.text(), '');
            else assert.equal((await response.json()).ok, true);
          }
          const response = await fetch(origin + pathname, { method: 'POST' });
          assert.equal(response.status, 405);
          assert.equal(response.headers.get('allow'), 'GET, HEAD');
        }
      },
    );

    await t.test(
      'Doodle Dash rooms, authorization and origin checks use the same origin',
      async () => {
        const roomRequest = (route, name, requestOrigin = origin) =>
          fetch(`${origin}/doodle-dash/api/rooms${route}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: requestOrigin,
            },
            body: JSON.stringify({ name }),
          });
        const created = await roomRequest('', 'Host');
        assert.equal(created.status, 201);
        const host = await created.json();
        const joined = await roomRequest(`/${host.code}/join`, 'Guest');
        assert.equal(joined.status, 200);
        const guest = await joined.json();
        const state = await fetch(
          `${origin}/doodle-dash/api/rooms/${host.code}`,
          {
            headers: { Authorization: `Bearer ${guest.token}`, Origin: origin },
          },
        );
        assert.equal(state.status, 200);
        assert.deepEqual(
          (await state.json()).players.map((player) => player.name),
          ['Host', 'Guest'],
        );
        assert.equal(
          (await roomRequest('', 'Other host', 'https://unrelated.example'))
            .status,
          403,
        );
        const invalid = await fetch(`${origin}/doodle-dash/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{broken',
        });
        assert.equal(invalid.status, 400);
        const encodedRoute = await fetch(`${origin}/doodle-dash/%61pi/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ name: 'Encoded route' }),
          signal: AbortSignal.timeout(3000),
        });
        assert.equal(
          encodedRoute.status,
          201,
          'Decoded API paths reach the handler without hanging',
        );
      },
    );

    await t.test('source files and traversal paths stay private', async () => {
      for (const pathname of [
        '/.git/config',
        '/tmp/archive/index.html',
        '/src/server.mjs',
        '/src/server.ts',
        '/src/games/drift/client/main.js',
        '/src/games/drift/client/main.ts',
        '/package.json',
        '/server.mjs',
        '/scripts/serve.mjs',
        '/lib/game-pages.ts',
        '/drift/server/index.js',
        '/drift/package.json',
        '/drift/.env',
        '/drift/test/server.test.js',
        '/drift/node_modules/ws/package.json',
        '/drift/%2e%2e/package.json',
        '/drift/%2e%2e%2fscripts/serve.mjs',
        '/drift/%5cserver/index.js',
        '/drift/%00',
      ])
        assert.ok(
          [400, 403, 404].includes(await rawGet(origin, pathname)),
          pathname,
        );
    });

    await t.test(
      'DRIFT connects, rejects other origins and closes active sockets on shutdown',
      async () => {
        const address = `${origin.replace('http:', 'ws:')}/drift/ws`;
        const socket = new WebSocket(address, { origin });
        t.after(() => socket.terminate());
        await once(socket, 'open');
        const welcome = receive(socket, 'welcome');
        socket.send(
          JSON.stringify({
            type: 'join',
            name: 'Next player',
            room: 'next-test',
            botFill: false,
          }),
        );
        assert.equal((await welcome).room, 'next-test');
        const pong = receive(socket, 'pong');
        socket.send(JSON.stringify({ type: 'ping', sent: 456 }));
        assert.equal((await pong).sent, 456);
        assert.equal(
          (
            await fetch(`${origin}/drift/health`).then((response) =>
              response.json(),
            )
          ).rooms,
          1,
        );

        const rejected = new WebSocket(address, {
          origin: 'https://unrelated.example',
        });
        rejected.on('error', () => {});
        const [, response] = await once(rejected, 'unexpected-response');
        assert.equal(response.statusCode, 403);
        response.resume();
        rejected.terminate();
        const disconnected = once(socket, 'close');
        await close(server);
        await disconnected;
        await close(server);
        assert.equal(server.listening, false);
      },
    );
  },
);
