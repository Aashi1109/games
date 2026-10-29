import type { attachDriftMultiplayer } from '../games/drift/server/index.ts';
import type { createDoodleApi } from '../games/doodle-dash/server-api.ts';

export interface ApplicationRuntime {
  drift: ReturnType<typeof attachDriftMultiplayer>;
  doodle: ReturnType<typeof createDoodleApi>;
  closing: boolean;
}

// The launcher and Next route bundles share one process but separate module graphs.
const RUNTIME = Symbol.for('questline.next.application-runtime');
const registry = globalThis as typeof globalThis & {
  [RUNTIME]?: ApplicationRuntime;
};

export function getRuntime() {
  return registry[RUNTIME];
}
export function registerRuntime(runtime: ApplicationRuntime) {
  if (registry[RUNTIME])
    throw new Error('The application runtime is already running.');
  registry[RUNTIME] = runtime;
}
export function unregisterRuntime(runtime: ApplicationRuntime) {
  if (registry[RUNTIME] === runtime) delete registry[RUNTIME];
}
