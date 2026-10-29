import test from 'node:test';
import assert from 'node:assert/strict';
import { mount as mountBumper } from '../src/games/bumper-ring.ts';
import { mount as mountWobble } from '../src/games/wobble-delivery.ts';
import { mount as mountTrap } from '../src/games/trap-sprint.ts';
import { mount as mountCorner } from '../src/games/corner-rush.ts';
import { createCanvas } from '../src/lib/core.ts';

// A virtual browser clock exercises the real mount/update/cleanup lifecycle.
function browserHarness() {
  const prior = Object.fromEntries(['window', 'document', 'Element', 'Node', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const frames = new Map();
  let frameId = 0, now = performance.now(), paused = false;
  const stats = [], results = [], drawnText = new Map();
  const context = new Proxy({ fillText: (text, x, y) => drawnText.set(`${x},${y}`, String(text)) }, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  class Element extends EventTarget {
    constructor() { super(); this.style = { setProperty(key, value) { this[key] = String(value); } }; this.dataset = {}; this.children = []; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    remove() { this.removed = true; }
    getContext() { return context; }
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 960, height: 600 }; }
    setPointerCapture() {}
    set innerHTML(value) {
      for (const match of value.matchAll(/<button\b([^>]*)>/g)) {
        const element = new Element();
        for (const attr of match[1].matchAll(/data-([\w-]+)(?:="([^"]*)")?/g)) { element.attributes[`data-${attr[1]}`] = attr[2] ?? ''; element.dataset[attr[1]] = attr[2] ?? ''; }
        this.children.push(element);
      }
    }
    querySelectorAll(selector) { const attribute = selector.slice(1, -1); return this.children.filter(child => attribute in child.attributes); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  }
  const target = new EventTarget();
  target.devicePixelRatio = 1; target.matchMedia = () => Object.assign(new EventTarget(), { matches: true });
  globalThis.Element = Element;
  globalThis.Node = Element;
  globalThis.window = target;
  globalThis.document = { createElement: () => new Element() };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = fn => { const id = ++frameId; frames.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const api = {
    setStats(value) { stats.push(value); }, setHint() {}, sound() {},
    isPaused: () => paused, finish: result => results.push(result), getBest: () => 0,
    load: (key, fallback) => fallback, save() {},
  };
  const shellButton = new Element(); shellButton.closest = () => shellButton;
  return {
    host: new Element(), api, stats, results, frames, drawnText, shellButton,
    pause(value) { paused = value; },
    key(code, type = 'keydown', source) {
      const event = new Event(type, { cancelable: true }); Object.assign(event, { code, repeat: false });
      if (source) Object.defineProperty(event, 'target', { value: source });
      target.dispatchEvent(event); return event.defaultPrevented;
    },
    advance(seconds, beforeFrame = () => {}) {
      for (let i = 0; i < Math.ceil(seconds * 30); i++) {
        beforeFrame(i); now += 1000 / 30;
        const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now));
      }
    },
    restore() { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

for (const [name, mount, fieldLabel] of [['Trap Sprint', mountTrap, 'TRIAL 01 / 06'], ['Corner Rush', mountCorner, 'DAILY TIME ATTACK']]) {
  test(`${name} paints a paused entry preview without advancing the run`, () => {
    const h = browserHarness(); let cleanup;
    try {
      h.pause(true);
      cleanup = mount(h.host, h.api);
      h.advance(10);
      assert.ok([...h.drawnText.values()].includes(fieldLabel));
      assert.equal(h.results.length, 0);
      assert.equal(h.stats.length, 1);
      assert.ok(h.stats[0].some(stat => stat.label === 'Time' && /^0/.test(String(stat.value))));
      cleanup(); cleanup = null;
      assert.equal(h.frames.size, 0);
    } finally { cleanup?.(); h.restore(); }
  });
}

test('bumper rounds can end, finish fires once, pause freezes and cleanup cancels animation', () => {
  const h = browserHarness(); let cleanup;
  try {
    cleanup = mountBumper(h.host, h.api);
    h.pause(true); h.advance(90);
    assert.equal(h.results.length, 0);
    assert.equal(h.stats.length, 1);
    h.pause(false); h.advance(100);
    assert.equal(h.results.length, 1);
    assert.match(h.results[0].title, /Knocked out/);
    h.advance(10);
    assert.equal(h.results.length, 1);
    cleanup(); cleanup = null;
    assert.equal(h.frames.size, 0);
    assert.ok(h.host.children.every(child => child.removed));
  } finally { cleanup?.(); h.restore(); }
});

test('courier can complete all three real courses with movement and hopping', () => {
  const h = browserHarness(); let cleanup;
  try {
    cleanup = mountWobble(h.host, h.api);
    h.pause(true); h.key('ArrowRight'); h.advance(90);
    assert.equal(h.results.length, 0);
    h.pause(false); h.key('ArrowRight');
    h.advance(85, i => { if (i % 5 === 0) { h.key('Space'); h.key('Space', 'keyup'); } });
    assert.equal(h.results.length, 1);
    assert.equal(h.results[0].title, 'Special delivery!');
    assert.ok(h.results[0].score > 2000);
    h.advance(5);
    assert.equal(h.results.length, 1);
    cleanup(); cleanup = null;
    assert.equal(h.frames.size, 0);
  } finally { cleanup?.(); h.restore(); }
});

for (const [name, mount] of [['bumper', mountBumper], ['courier', mountWobble]]) {
  test(`${name} leaves Space and arrows available to shell controls and paused/results screens`, () => {
    const h = browserHarness(); let cleanup;
    try {
      cleanup = mount(h.host, h.api);
      assert.equal(h.key('Space', 'keydown', h.shellButton), false);
      assert.equal(h.key('ArrowRight', 'keydown', h.shellButton), false);
      h.pause(true);
      assert.equal(h.key('Space'), false);
      assert.equal(h.key('ArrowRight'), false);
      h.advance(1); h.pause(false); h.advance(100);
      assert.equal(h.results.length, 1);
      assert.equal(h.key('Space'), false);
      assert.equal(h.key('ArrowRight'), false);
    } finally { cleanup?.(); h.restore(); }
  });
}

test('pausing clears held courier drive and bumper charge before resuming', () => {
  const h = browserHarness(); let cleanup;
  try {
    cleanup = mountWobble(h.host, h.api);
    h.key('ArrowRight'); h.advance(0.2);
    h.pause(true); h.advance(1); h.pause(false); h.advance(3);
    const remaining = Number.parseInt([...h.drawnText.values()].find(text => /m TO DELIVERY$/.test(text)), 10);
    assert.ok(remaining > 240, 'cart should coast to a stop after pause, not keep accelerating');
    cleanup();
    cleanup = mountBumper(h.host, h.api);
    h.advance(2); h.key('Space'); h.advance(0.15);
    assert.ok([...h.drawnText.values()].some(text => /^CHARGE \d/.test(text)));
    h.pause(true); h.advance(1); h.pause(false); h.advance(0.1);
    assert.ok([...h.drawnText.values()].includes('HOLD · AIM · RELEASE'));
  } finally { cleanup?.(); h.restore(); }
});

test('rushing the courier into bumps has a real cargo cost', () => {
  const h = browserHarness(); let cleanup;
  try {
    cleanup = mountWobble(h.host, h.api);
    h.key('ArrowRight'); h.advance(25);
    assert.ok(h.stats.some(frame => frame.some(stat => stat.label === 'Boxes' && stat.value !== '6 / 6')));
  } finally { cleanup?.(); h.restore(); }
});


test('canvas viewport preserves pointer mapping when its display and logical size change', () => {
  const h = browserHarness();
  let surface;
  try {
    surface = createCanvas(h.host, 960, 600);
    const viewport = h.host.children[0];
    assert.equal(viewport.className, 'canvas-viewport');
    assert.equal(viewport.children[0], surface.canvas);
    surface.canvas.getBoundingClientRect = () => ({ left: 20, top: 30, width: 480, height: 300 });
    assert.deepEqual(surface.point({ clientX: 260, clientY: 180 }), { x: 480, y: 300 });
    surface.setSize(600, 600);
    surface.canvas.getBoundingClientRect = () => ({ left: 20, top: 30, width: 280, height: 280 });
    assert.equal(surface.canvas.style['--canvas-ratio'], '1');
    assert.deepEqual(surface.point({ clientX: 160, clientY: 170 }), { x: 300, y: 300 });
    surface.destroy(); surface = null;
    assert.equal(viewport.removed, true);
  } finally { surface?.destroy(); h.restore(); }
});
