import { healthMethodNotAllowed, healthResponse } from '../../server/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = healthResponse;
export const HEAD = healthResponse;
export const POST = healthMethodNotAllowed;
export const PUT = healthMethodNotAllowed;
export const PATCH = healthMethodNotAllowed;
export const DELETE = healthMethodNotAllowed;
export const OPTIONS = healthMethodNotAllowed;
