import { getRuntime } from './runtime.ts';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

/** @param {Request} request */
export function healthResponse(request: Request) {
  const runtime = getRuntime();
  const health = runtime?.drift.health();
  const ok = Boolean(runtime && !runtime.closing && health?.ok);
  const body = new URL(request.url).pathname.startsWith('/drift/')
    ? { ok, rooms: health?.rooms || 0 }
    : { ok };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: jsonHeaders,
  });
}

export function healthMethodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { ...jsonHeaders, Allow: 'GET, HEAD' },
  });
}

/** @param {Request} request */
export function doodleResponse(request: Request) {
  const runtime = getRuntime();
  if (!runtime || runtime.closing) {
    return Response.json(
      { error: 'The game server is unavailable.' },
      {
        status: 503,
        headers: jsonHeaders,
      },
    );
  }
  return runtime.doodle.handle(request);
}
