import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameLifecycle } from '../src/lib/game-lifecycle.ts';

function fixture() {
  const attributes = new Map([
    ['class', 'original'],
    ['style', 'color:red'],
  ]);
  const body = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  return { root: { ownerDocument: { body } }, attributes };
}

test('unmount removes listeners, aborts requests and permits a clean remount', () => {
  const { root } = fixture();
  const target = new EventTarget();
  const originalAddListener = EventTarget.prototype.addEventListener;
  let called = 0;
  const first = createGameLifecycle(root);
  first.listen(target, 'play', () => called++);
  target.dispatchEvent(new Event('play'));
  assert.equal(called, 1);
  first.dispose();
  assert.equal(first.signal.aborted, true);
  target.dispatchEvent(new Event('play'));
  assert.equal(called, 1);
  const second = createGameLifecycle(root);
  second.listen(target, 'play', () => called++);
  target.dispatchEvent(new Event('play'));
  assert.equal(called, 2, 'only the current mount handles input');
  second.dispose();
  assert.equal(EventTarget.prototype.addEventListener, originalAddListener);
});

test('unmount cancels animation frames and guards already queued callbacks', (t) => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const pending = new Map();
  const cancelled = [];
  let next = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = next++;
    pending.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => cancelled.push(id);
  t.after(() => {
    if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
    else delete globalThis.requestAnimationFrame;
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel;
    else delete globalThis.cancelAnimationFrame;
  });
  const lifecycle = createGameLifecycle(fixture().root);
  let called = 0;
  const id = lifecycle.raf(() => called++);
  lifecycle.dispose();
  assert.deepEqual(cancelled, [id]);
  pending.get(id)(100);
  assert.equal(called, 0);
  assert.equal(
    lifecycle.raf(() => called++),
    0,
  );
});

test('unmount stops timeouts and intervals even when a callback was queued', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const lifecycle = createGameLifecycle(fixture().root);
  let called = 0;
  lifecycle.timeout(() => called++, 10);
  lifecycle.interval(() => called++, 5);
  lifecycle.dispose();
  t.mock.timers.tick(100);
  assert.equal(called, 0);
  assert.equal(
    lifecycle.timeout(() => called++, 1),
    0,
  );
  assert.equal(
    lifecycle.interval(() => called++, 1),
    0,
  );
});

test('cleanup restores body state, disconnects observers and runs exactly once', () => {
  const { root, attributes } = fixture();
  const lifecycle = createGameLifecycle(root);
  let disposed = 0;
  lifecycle.observe({
    disconnect() {
      disposed++;
    },
  });
  attributes.set('class', 'game preview');
  attributes.set('style', 'overflow:hidden');
  attributes.set('data-screen', 'playing');
  attributes.set('data-touch', 'true');
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(disposed, 1);
  assert.deepEqual(
    [...attributes],
    [
      ['class', 'original'],
      ['style', 'color:red'],
    ],
  );
  lifecycle.add(() => disposed++);
  assert.equal(
    disposed,
    2,
    'resources acquired after unmount are released immediately',
  );
});

test('property handlers restore their owner and ignore stale callbacks after unmount', () => {
  const lifecycle = createGameLifecycle(fixture().root);
  let called = 0;
  const original = () => (called += 10);
  const button = { onclick: original };
  lifecycle.handler(button, 'onclick', () => called++);
  const stale = button.onclick;
  button.onclick();
  lifecycle.dispose();
  stale();
  assert.equal(called, 1);
  assert.equal(button.onclick, original);
  button.onclick();
  assert.equal(called, 11);
});

test('document exit cleans up and a cached Back navigation starts a fresh game', async (t) => {
  const { bindGameDocument } = await import('../src/lib/game-document.ts');
  const previous = globalThis.window;
  const browser = new EventTarget();
  let reloads = 0;
  let cleanups = 0;
  browser.location = {
    reload() {
      reloads++;
    },
  };
  globalThis.window = browser;
  t.after(() => {
    if (previous) globalThis.window = previous;
    else delete globalThis.window;
  });
  const unbind = bindGameDocument(() => cleanups++);
  browser.dispatchEvent(new Event('pagehide'));
  assert.equal(cleanups, 1);
  browser.dispatchEvent(new Event('pageshow'));
  assert.equal(reloads, 0);
  const cached = new Event('pageshow');
  Object.defineProperty(cached, 'persisted', { value: true });
  browser.dispatchEvent(cached);
  assert.equal(reloads, 1);
  unbind();
  browser.dispatchEvent(new Event('pagehide'));
  browser.dispatchEvent(cached);
  assert.equal(cleanups, 1);
  assert.equal(reloads, 1);
});
