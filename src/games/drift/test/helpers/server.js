import http from 'node:http';
import { attachDriftMultiplayer } from '../../server/index.ts';

/** Test-only listener; production always attaches to the existing Next server. */
export async function createTestServer(options = {}) {
  const httpServer = http.createServer((_request, response) => response.writeHead(404).end());
  const multiplayer = attachDriftMultiplayer(httpServer, options);
  try {
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    await multiplayer.close();
    throw error;
  }
  return {
    ...multiplayer,
    httpServer,
    port: httpServer.address().port,
    async close() {
      await multiplayer.close();
      httpServer.closeAllConnections();
      if (httpServer.listening) await new Promise(resolve => httpServer.close(resolve));
    },
  };
}
