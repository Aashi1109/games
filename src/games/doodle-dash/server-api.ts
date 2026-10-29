import { RoomError, isRecord } from './types.ts';
import { RoomService } from './room-service.ts';

/** Doodle Dash's HTTP API, using the same Web Request/Response types as Next routes. */
export function createDoodleApi({ service = new RoomService() } = {}) {
  const buckets = new Map<string, { start: number; count: number }>();
  const timer = setInterval(() => {
    service.tick();
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.start > 3_600_000) buckets.delete(key);
    }
  }, 1000);
  timer.unref();

  function limit(key: string, maximum: number, window: number) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > window) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > maximum) {
      throw new RoomError('Too many requests. Give it a moment.', 429);
    }
  }

  const json = (status: number, data: unknown) =>
    Response.json(data, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });

  async function handle(request: Request) {
    try {
      const url = new URL(request.url);
      const route = decodeURIComponent(url.pathname).replace(
        /^\/doodle-dash/,
        '',
      );
      const parts = route.split('/').filter(Boolean);
      if (parts[0] !== 'api')
        return json(404, { error: 'Unknown room route.' });
      // The single Node listener overwrites this header with the actual socket address.
      const ip = request.headers.get('x-questline-client-address') || 'unknown';
      limit(`all:${ip}`, 500, 10_000);
      const origin = request.headers.get('origin');
      if (
        origin &&
        new URL(origin).host !== (request.headers.get('host') || url.host)
      ) {
        return json(403, {
          error: 'Use the same game server for room requests.',
        });
      }
      const token = (request.headers.get('authorization') || '').replace(
        /^Bearer /,
        '',
      );
      if (
        request.method === 'GET' &&
        parts[1] === 'rooms' &&
        parts.length === 3
      ) {
        return json(200, service.state(parts[2], token));
      }
      if (request.method !== 'POST')
        return json(405, { error: 'Method not allowed.' });
      if (
        !(request.headers.get('content-type') || '').startsWith(
          'application/json',
        )
      ) {
        return json(415, { error: 'Expected JSON.' });
      }
      let raw = '';
      let bytes = 0;
      const decoder = new TextDecoder();
      for await (const chunk of request.body || []) {
        bytes += chunk.byteLength;
        if (bytes > 18_000)
          return json(413, { error: 'Drawing payload too large.' });
        raw += decoder.decode(chunk, { stream: true });
      }
      raw += decoder.decode();
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return json(400, { error: 'Invalid JSON.' });
      }
      if (!isRecord(data)) {
        return json(400, { error: 'Invalid request.' });
      }
      if (parts[1] === 'rooms' && parts.length === 2) {
        limit(`create:${ip}`, 25, 3_600_000);
        return json(201, service.create(data.name));
      }
      if (parts[1] === 'rooms' && parts.length === 4 && parts[3] === 'join') {
        limit(`join:${ip}`, 60, 60_000);
        return json(200, service.join(parts[2], data.name));
      }
      if (
        parts[1] === 'rooms' &&
        parts.length === 4 &&
        parts[3] === 'actions'
      ) {
        limit(`action:${token.slice(0, 40)}`, 60, 1000);
        return json(200, service.act(parts[2], token, data));
      }
      return json(404, { error: 'Unknown room route.' });
    } catch (error) {
      return json(error instanceof RoomError ? error.status : 400, {
        error:
          error instanceof RoomError
            ? error.message
            : 'Could not process that room request.',
      });
    }
  }

  return { handle, close: () => clearInterval(timer) };
}
