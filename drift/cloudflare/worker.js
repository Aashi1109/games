import { Container, getContainer } from '@cloudflare/containers';

export class DriftContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
  pingEndpoint = 'container/health';
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    // Static Assets serves matching files before this Worker runs.
    if (pathname !== '/ws' && pathname !== '/health') {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'same-origin',
        },
      });
    }
    const forwarded = new Request(request);
    // The SDK reserves this header for internal port selection.
    forwarded.headers.delete('cf-container-target-port');
    // Rooms live in this process; all players must reach the same instance.
    return getContainer(env.DRIFT, 'arena').fetch(forwarded);
  },
};
