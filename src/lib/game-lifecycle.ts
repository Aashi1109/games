type Cleanup = () => unknown;
type GameEvent<K extends string> = K extends keyof WindowEventMap
  ? WindowEventMap[K]
  : K extends keyof DocumentEventMap
    ? DocumentEventMap[K]
    : Event;

/** Resources owned by one mounted browser game. Nothing patches browser globals. */
export function createGameLifecycle(root: HTMLElement) {
  const controller = new AbortController();
  const cleanups: Cleanup[] = [];
  const frames = new Set<number>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  let disposed = false;
  const body = root.ownerDocument.body;
  const bodyAttributes = new Map<string, string | null>(
    [
      'class',
      'style',
      'data-screen',
      'data-game',
      'data-phase',
      'data-touch',
    ].map((name) => [name, body.getAttribute(name)]),
  );

  function add<T extends Cleanup>(cleanup: T) {
    if (disposed) cleanup();
    else cleanups.push(cleanup);
    return cleanup;
  }

  const lifecycle = {
    root,
    signal: controller.signal,
    get disposed() {
      return disposed;
    },
    byId<T extends HTMLElement = HTMLElement>(id: string): T {
      const element = root.querySelector<T>(`#${CSS.escape(id)}`);
      if (!element) throw new Error(`Game element #${id} is missing`);
      return element;
    },
    add,
    listen<K extends string>(
      target: EventTarget | null | undefined,
      type: K,
      handler: (event: GameEvent<K>) => unknown,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (!target || disposed) return () => {};
      const guarded: EventListener = (event) => {
        if (!disposed) handler(event as GameEvent<K>);
      };
      target.addEventListener(type, guarded, options);
      return add(() => target.removeEventListener(type, guarded, options));
    },
    handler<K extends keyof GlobalEventHandlersEventMap>(
      target: GlobalEventHandlers,
      property: `on${K}`,
      handler: (event: GlobalEventHandlersEventMap[K]) => unknown,
    ) {
      // Each on* property is paired with its event by the generic above.
      const owner = target as unknown as Record<
        `on${K}`,
        ((event: GlobalEventHandlersEventMap[K]) => unknown) | null
      >;
      const previous = owner[property];
      const guarded = (event: GlobalEventHandlersEventMap[K]) => {
        if (!disposed) return handler(event);
      };
      owner[property] = guarded;
      add(() => {
        if (owner[property] === guarded) owner[property] = previous;
      });
      return handler;
    },
    observe<T extends { disconnect: () => void }>(observer: T) {
      add(() => observer.disconnect());
      return observer;
    },
    timeout<A extends unknown[]>(
      callback: (...args: A) => void,
      delay: number,
      ...args: A
    ) {
      if (disposed) return 0;
      const id = setTimeout(() => {
        timeouts.delete(id);
        if (!disposed) callback(...args);
      }, delay);
      timeouts.add(id);
      return id;
    },
    interval<A extends unknown[]>(
      callback: (...args: A) => void,
      delay: number,
      ...args: A
    ) {
      if (disposed) return 0;
      const id = setInterval(() => {
        if (!disposed) callback(...args);
      }, delay);
      intervals.add(id);
      return id;
    },
    clearTimeout(id: ReturnType<typeof setTimeout> | 0) {
      clearTimeout(id);
      if (id) timeouts.delete(id);
    },
    clearInterval(id: ReturnType<typeof setInterval> | 0) {
      clearInterval(id);
      if (id) intervals.delete(id);
    },
    raf(callback: FrameRequestCallback) {
      if (disposed) return 0;
      const id = requestAnimationFrame((now) => {
        frames.delete(id);
        if (!disposed) callback(now);
      });
      frames.add(id);
      return id;
    },
    cancelFrame(id: number) {
      cancelAnimationFrame(id);
      frames.delete(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const id of frames) cancelAnimationFrame(id);
      for (const id of timeouts) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      for (const cleanup of cleanups.reverse()) {
        try {
          Promise.resolve(cleanup()).catch((error) =>
            console.error('Game cleanup failed:', error),
          );
        } catch (error) {
          console.error('Game cleanup failed:', error);
        }
      }
      for (const [name, value] of bodyAttributes) {
        if (value === null) body.removeAttribute(name);
        else body.setAttribute(name, value);
      }
      frames.clear();
      timeouts.clear();
      intervals.clear();
      cleanups.length = 0;
    },
  };
  return lifecycle;
}
