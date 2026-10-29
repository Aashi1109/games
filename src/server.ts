import type { IncomingMessage } from 'node:http';
import { isIP, type Socket } from 'node:net';
import type { ApplicationRuntime } from './server/runtime.ts';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import next from 'next';
import { attachDriftMultiplayer } from './games/drift/server/index.ts';
import { createDoodleApi } from './games/doodle-dash/server-api.ts';
import {
  getRuntime,
  registerRuntime,
  unregisterRuntime,
} from './server/runtime.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function normalizeRequest(request: IncomingMessage) {
  const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    /[\\\0]/.test(pathname) ||
    pathname.split('/').some((part) => part.startsWith('.'))
  ) {
    throw new Error('Invalid path');
  }
  const url = new URL(request.url || '/', 'http://localhost');
  url.pathname = pathname;
  request.url = url.pathname + url.search;
  return pathname;
}

/** One HTTP listener for the Next application, including DRIFT's WebSocket upgrade. */
export async function createCollectionServer({
  dev = false,
  hostname = '127.0.0.1',
  port = 4180,
  trustProxy = false,
} = {}) {
  if (getRuntime())
    throw new Error('The application runtime is already running.');
  const application = next({ dev, dir: ROOT, hostname, port });
  const sockets = new Set<Socket>();
  let closing = false;
  let handle: ReturnType<ReturnType<typeof next>['getRequestHandler']>;
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      normalizeRequest(request);
    } catch {
      response.writeHead(404).end('Not found');
      return;
    }
    if (closing) {
      response.writeHead(503).end('Server is shutting down');
      return;
    }
    // Only a configured proxy may supply a validated client address.
    const proxyAddress = request.headers['x-questline-client-address'];
    request.headers['x-questline-client-address'] =
      trustProxy && typeof proxyAddress === 'string' && isIP(proxyAddress) !== 0
        ? proxyAddress
        : request.socket.remoteAddress || 'unknown';
    try {
      await handle(request, response);
    } catch (error) {
      if (response.destroyed) return;
      console.error('Application request failed:', error);
      if (!response.headersSent)
        response.writeHead(500, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
      response.end('Could not load this page.');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (request, socket) => {
    try {
      const pathname = normalizeRequest(request);
      if (
        closing ||
        (pathname !== '/drift/ws' && (!dev || !pathname.startsWith('/_next/')))
      )
        socket.destroy();
      // DRIFT and Next attach their own upgrade listeners to this same HTTP server.
    } catch {
      socket.destroy();
    }
  });

  let runtime: ApplicationRuntime | undefined;
  try {
    await application.prepare();
    handle = application.getRequestHandler();
    runtime = {
      drift: attachDriftMultiplayer(server),
      doodle: createDoodleApi(),
      closing: false,
    };
    registerRuntime(runtime);
  } catch (error) {
    runtime?.doodle.close();
    await runtime?.drift.close();
    await application.close();
    throw error;
  }

  const activeRuntime = runtime;
  let closePromise: Promise<Error | undefined> | undefined;
  server.close = (callback) => {
    if (!closePromise) {
      closing = true;
      activeRuntime.closing = true;
      activeRuntime.doodle.close();
      const httpClosed = new Promise<Error | undefined>((resolve) =>
        http.Server.prototype.close.call(server, (error) =>
          resolve(
            error && 'code' in error && error.code === 'ERR_SERVER_NOT_RUNNING'
              ? undefined
              : error,
          ),
        ),
      );
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      closePromise = Promise.allSettled([
        httpClosed,
        activeRuntime.drift.close(),
        application.close(),
      ]).then((results) => {
        unregisterRuntime(activeRuntime);
        const rejected = results.find((result) => result.status === 'rejected');
        if (rejected) {
          const reason: unknown = rejected.reason;
          return reason instanceof Error ? reason : new Error(String(reason));
        }
        return results[0].status === 'fulfilled' ? results[0].value : undefined;
      });
    }
    if (callback) closePromise.then(callback);
    return server;
  };
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const dev = process.argv.includes('--dev');
  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV || (dev ? 'development' : 'production'),
  });
  const port = Number(process.env.PORT || 4180);
  const hostname = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be an integer from 0 to 65535.');
  const server = await createCollectionServer({
    dev,
    hostname,
    port,
    trustProxy: process.env.TRUST_PROXY === 'true',
  });
  server.once('error', (error) => {
    console.error(error);
    server.close(() => process.exit(1));
  });
  server.listen(port, hostname, () => {
    const address = server.address();
    if (address && typeof address !== 'string')
      console.log(`Questline ready: http://${hostname}:${address.port}`);
  });
  const stop = () =>
    server.close((error) => {
      if (error) console.error(error);
      // Next's development compiler can retain native watcher handles after close().
      process.exit(error ? 1 : 0);
    });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
