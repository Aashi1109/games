import { randomBytes } from 'node:crypto';
import {
  expect,
  test,
  type WebSocket as BrowserWebSocket,
} from '@playwright/test';

type Connection = {
  socket: BrowserWebSocket;
  welcome?: { type: string; room: string; id: string };
  states: number;
};

test('DRIFT joins its same-origin room, disconnects on navigation, and can join again', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const room = `pw${randomBytes(4).toString('hex')}`;
  const failures: string[] = [];
  const connections: Connection[] = [];
  let observer: WebSocket | undefined;
  let observedPlayers: string[] = [];

  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /hydration|hydrating|did not match|server rendered HTML/i.test(
        message.text(),
      )
    ) {
      failures.push(`Console ${message.type()}: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'Unknown failure';
    // A document navigation normally cancels outstanding asset requests.
    if (!reason.includes('ERR_ABORTED')) {
      failures.push(`${reason}: ${request.url()}`);
    }
  });
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/drift/ws') return;
    const connection: Connection = { socket, states: 0 };
    connections.push(connection);
    socket.on('socketerror', (error) => failures.push(`WebSocket: ${error}`));
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(payload.toString());
      if (message.type === 'welcome') connection.welcome = message;
      if (message.type === 'state') connection.states++;
      if (message.type === 'error') failures.push(`DRIFT: ${message.message}`);
    });
  });

  try {
    for (let visit = 0; visit < 2; visit++) {
      const response =
        visit === 0
          ? await page.goto(`/drift/?room=${room}`)
          : await page.goBack();
      // Back/forward cache restores need not make another document request.
      if (response) expect(response.status()).toBe(200);
      await expect(page.locator('#boot')).toBeHidden({ timeout: 30_000 });
      await expect(page.locator('#unsupported')).toBeHidden();
      await expect(page.locator('body')).toHaveAttribute(
        'data-screen',
        'lobby',
      );
      await expect(page.locator('#lobby-classes input')).toHaveCount(4);
      await page.locator('#player-name').fill(`Next player ${visit + 1}`);

      // A real click unlocks audio and requests pointer lock before connecting.
      await page.locator('#play').click();
      await expect.poll(() => connections.length).toBe(visit + 1);
      const connection = connections[visit];
      const address = new URL(connection.socket.url());
      const documentAddress = new URL(page.url());
      expect(address.host).toBe(documentAddress.host);
      expect(address.pathname).toBe('/drift/ws');
      expect(address.protocol).toBe(
        documentAddress.protocol === 'https:' ? 'wss:' : 'ws:',
      );
      await expect.poll(() => connection.welcome?.room).toBe(room);
      expect(connection.welcome?.id).toBeTruthy();
      await expect(page.locator('body')).toHaveAttribute(
        'data-screen',
        'playing',
      );
      await expect(page.locator('#hud')).toBeVisible();
      await expect(page.locator('#room-label')).toContainText(
        room.toUpperCase(),
      );
      await expect.poll(() => connection.states).toBeGreaterThan(0);

      if (!observer) {
        // Observe authoritative room membership without another GPU-heavy page.
        observer = new WebSocket(address);
        observer.addEventListener('error', () =>
          failures.push('Room observer could not connect'),
        );
        observer.addEventListener('message', (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type === 'state') {
            observedPlayers = message.players.map(
              (player: { id: string }) => player.id,
            );
          }
          if (message.type === 'error')
            failures.push(`Observer: ${message.message}`);
        });
        await expect.poll(() => observer?.readyState).toBe(WebSocket.OPEN);
        observer.send(
          JSON.stringify({
            type: 'join',
            room,
            name: 'Test observer',
            botFill: false,
          }),
        );
      }
      const playerId = connection.welcome!.id;
      await expect.poll(() => observedPlayers).toContain(playerId);

      // Navigate with the live session still joined: the document must release it.
      await page.goto('/');
      await expect(page.locator('#game-count')).toHaveText('20 games');
      // Chromium can omit the old document's WebSocket close event in DevTools.
      // Server snapshots must confirm that its player was actually removed.
      await expect.poll(() => observedPlayers).not.toContain(playerId);
    }
  } finally {
    observer?.close();
    if (failures.length) {
      await testInfo.attach('drift-browser-errors', {
        body: failures.join('\n'),
        contentType: 'text/plain',
      });
    }
  }
  expect(
    failures,
    'DRIFT must run without browser, hydration, or asset errors',
  ).toEqual([]);
});
