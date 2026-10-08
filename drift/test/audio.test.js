import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUDIO_ASSETS, MAX_AUDIO_VOICES, createGameAudio } from '../client/audio.js';
import { CLASSES } from '../shared/classes.js';

const durations = { 'reload': 1.4954, 'reload-alternate': 1.2759, bolt: .3645, slide: .65,
  'fire-assault': .145, 'fire-sniper': 1.2, 'fire-scout': .2501, 'fire-heavy': .7362 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

class Param {
  value = 1;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}

class Node {
  connected = [];
  disconnected = false;
  connect(node) { assert.ok(node); this.connected.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class Source extends Node {
  playbackRate = new Param();
  loop = false;
  stops = [];
  start(...args) { this.started = args; }
  stop(time) { this.stops.push(time); }
  end() { this.onended?.(); }
}

class Context {
  state = 'suspended';
  currentTime = 10;
  destination = new Node();
  sources = [];
  gains = [];
  panners = [];
  decodes = [];
  resumes = 0;
  failures = new Set();
  listeners = new Map();
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  changeState(state) { this.state = state; this.listeners.get('statechange')?.(); }
  createGain() { const node = new Node(); node.gain = new Param(); this.gains.push(node); return node; }
  createStereoPanner() { const node = new Node(); node.pan = new Param(); this.panners.push(node); return node; }
  createDynamicsCompressor() {
    const node = new Node();
    for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[name] = new Param();
    return node;
  }
  createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
  decodeAudioData(data) {
    const id = new TextDecoder().decode(data);
    this.decodes.push(id);
    // Web Audio may detach the supplied ArrayBuffer even when decoding fails.
    structuredClone(data, { transfer: [data] });
    return this.failures.has(id) ? Promise.reject(new Error('bad audio')) : Promise.resolve({ id, duration: durations[id] ?? .3 });
  }
}

function setup(options = {}) {
  const context = new Context(), fetched = [];
  let contexts = 0;
  const fetcher = async (url) => {
    fetched.push(url);
    const id = new URL(url).pathname.split('/').at(-1).replace('.wav', '');
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(id).buffer };
  };
  const audio = createGameAudio({ contextFactory: () => { contexts++; return context; }, fetcher, ...options });
  return { audio, context, fetched, fetcher, get contexts() { return contexts; } };
}

test('approved manifest files exist and preload neither creates the device nor decodes', async () => {
  const env = setup({ baseUrl: 'https://example.test/drift/' });
  await Promise.all([env.audio.preload(), env.audio.preload()]);
  assert.equal(env.contexts, 0);
  assert.equal(env.context.decodes.length, 0);
  assert.equal(env.fetched.length, 19);
  assert.ok(env.fetched.every((url) => url.startsWith('https://example.test/drift/audio/')));
  for (const file of Object.values(AUDIO_ASSETS)) {
    const wav = await readFile(new URL(`../public/${file}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  }
  await env.audio.unlock();
  await env.audio.unlock();
  assert.equal(env.contexts, 1);
  assert.equal(env.context.decodes.length, 19);
  assert.equal(env.fetched.length, 19, 'successful assets and decoded buffers are reused');
});

test('relative base paths work both at the site root and under drift', async () => {
  for (const [baseUrl, prefix] of [['/', 'http://localhost/audio/'], ['/drift/', 'http://localhost/drift/audio/']]) {
    const env = setup({ baseUrl });
    await env.audio.preload();
    assert.ok(env.fetched.every((url) => url.startsWith(prefix)));
  }
});

test('unlock resumes synchronously; unavailable and suspended events never play later', async () => {
  const pending = deferred();
  const env = setup({ fetcher: async (url) => {
    await pending.promise;
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(new URL(url).pathname.split('/').at(-1).replace('.wav', '')).buffer };
  } });
  const unlock = env.audio.unlock();
  assert.equal(env.context.resumes, 1, 'resume must happen inside the user gesture');
  assert.equal(env.audio.play('fire'), false);
  assert.equal(env.audio.startReload('heavy', 3.2), false);
  assert.equal(env.audio.setSliding(true), false);
  pending.resolve();
  assert.equal(await unlock, true);
  assert.equal(env.context.sources.length, 0, 'loading must not replay missed gameplay');
  assert.equal(env.audio.play('fire'), true);
  env.context.changeState('suspended');
  assert.equal(env.audio.play('hit'), false);
  assert.ok(env.context.sources.every((source) => source.disconnected));
  await env.audio.unlock();
  assert.equal(env.context.sources.length, 1, 'resuming must not replay suspended events');
});

test('network and decode failures stay isolated and retry on the next unlock', async () => {
  let attempts = 0;
  const env = setup();
  env.context.failures.add('hit');
  const fetcher = async (url) => {
    if (url.endsWith('/fire-heavy.wav') && ++attempts === 1) throw new Error('offline');
    if (url.endsWith('/hurt.wav')) return { ok: false };
    return env.fetcher(url);
  };
  const audio = createGameAudio({ contextFactory: () => env.context, fetcher });
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.play('fire', { classId: 'heavy' }), false);
  assert.equal(audio.play('hit'), false);
  assert.equal(audio.play('hurt'), false);
  assert.equal(audio.play('fire'), true);
  env.context.failures.delete('hit');
  await audio.unlock();
  assert.equal(audio.play('fire', { classId: 'heavy' }), true);
  assert.equal(audio.play('hit'), true, 'failed decode keeps undetached raw bytes for retry');
  assert.equal(attempts, 2);
  assert.equal(env.context.decodes.filter((id) => id === 'hit').length, 2);
});

test('missing audio support, resume rejection, and node failure do not escape into gameplay', async () => {
  for (const contextFactory of [() => null, () => { throw new Error('unsupported'); }]) {
    const audio = createGameAudio({ contextFactory });
    assert.equal(await audio.unlock(), false);
    assert.equal(audio.play('fire'), false);
    assert.equal(audio.startReload('assault', 1), false);
    audio.stopAll();
  }
  const env = setup();
  env.context.resume = () => Promise.reject(new Error('gesture blocked'));
  assert.equal(await env.audio.unlock(), false);
  assert.equal(env.context.decodes.length, 0);
  env.context.resume = Context.prototype.resume;
  assert.equal(await env.audio.unlock(), true);
  env.context.createBufferSource = () => { throw new Error('device closed'); };
  assert.equal(env.audio.play('fire'), false);
});

test('one missing footstep still leaves usable movement audio and stereo panning is optional', async () => {
  const env = setup();
  env.context.createStereoPanner = undefined;
  const audio = createGameAudio({ contextFactory: () => env.context, fetcher: (url) =>
    url.endsWith('/footstep-2.wav') ? Promise.resolve({ ok: false }) : env.fetcher(url) });
  await audio.unlock();
  for (let i = 0; i < 3; i++) assert.equal(audio.play('footstep', { pan: .4 }), true);
  assert.ok(env.context.sources.every((source) => source.buffer.id === 'footstep-1'));
  assert.equal(env.context.panners.length, 0);
  assert.equal(env.context.gains.at(-1).connected[0], env.context.gains[0]);
  audio.stopAll();
});

test('fire selects each class recording; only local sniper shots schedule mechanical cycling', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  for (const classId of Object.keys(CLASSES)) {
    const before = context.sources.length;
    assert.equal(audio.play('fire', { classId, volume: .5, pan: -.4, local: false }), true);
    const source = context.sources[before];
    assert.equal(source.buffer.id, `fire-${classId}`);
    assert.equal(context.sources.length, before + 1);
    assert.ok(source.playbackRate.value >= .99 && source.playbackRate.value <= 1.01);
    assert.equal(source.started[0], 10);
    assert.equal(context.panners.at(-1).pan.value, -.4);
  }
  audio.play('fire', { classId: 'sniper' });
  const bolt = context.sources.at(-1);
  assert.equal(bolt.buffer.id, 'bolt');
  assert.equal(bolt.started[0], 10.36);
  audio.stopAll();
  assert.equal(bolt.stops.at(-1), 10, 'reset cancels bolt before its scheduled start');
  assert.equal(bolt.disconnected, true);
});

test('all class reloads retain sample pitch and finish within the actual reload timer', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  for (const [classId, loadout] of Object.entries(CLASSES)) {
    const before = context.sources.length;
    assert.equal(audio.startReload(classId, loadout.reloadTime), true);
    const parts = context.sources.slice(before);
    assert.equal(parts.length, 3);
    assert.ok(parts.every((part) => part.playbackRate.value === 1));
    assert.ok(parts.every((part) => part.buffer.id === (classId === 'sniper' ? 'reload-alternate' : 'reload')));
    assert.ok(parts.every((part) => part.started[0] >= 10 && part.stops[0] <= 10 + loadout.reloadTime + .0001));
    assert.ok(Math.abs(parts.at(-1).stops[0] - (10 + loadout.reloadTime)) < .001);
    if (classId === 'heavy') assert.ok(parts.at(-1).started[0] > 12.8, 'heavy reload spaces actions instead of slowing pitch');
    audio.stopReload();
    assert.ok(parts.every((part) => part.disconnected && part.stops.at(-1) === 10));
  }
});

test('resuming a reload skips past actions and preserves the remaining completion time', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  assert.equal(audio.startReload('heavy', .2), true);
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0].started[0], 10);
  assert.ok(context.sources[0].started[1] > 1.11, 'resume enters the current mechanical segment without replaying its beginning');
  assert.ok(Math.abs(context.sources[0].stops[0] - 10.2) < 1e-6);
  audio.startReload('heavy', 2);
  assert.equal(context.sources[0].disconnected, true, 'new reload state cancels the old sequence');
  assert.equal(context.sources.length, 3, 'elapsed eject does not play again');
  assert.equal(audio.startReload('assault', NaN), false);
  assert.equal(audio.startReload('assault', 0), false);
  assert.ok(context.sources.every((source) => source.disconnected));
});

test('a muted gesture unlocks silently; enabling later can play without a second gesture', async () => {
  const env = setup({ enabled: false });
  assert.equal(await env.audio.unlock(), true);
  assert.equal(env.contexts, 1);
  assert.equal(env.context.gains[0].gain.value, 0);
  assert.equal(env.context.decodes.length, 19);
  assert.equal(env.audio.play('fire'), false);
  env.audio.setEnabled(true);
  assert.equal(env.audio.play('fire'), true);
  assert.equal(env.context.resumes, 1, 'enable must work after an async welcome without another gesture');
  env.audio.startReload('heavy', 3.2);
  env.audio.play('fire', { classId: 'sniper' });
  env.audio.setSliding(true);
  env.audio.setEnabled(false);
  assert.ok(env.context.sources.every((source) => source.disconnected));
  assert.ok(env.context.sources.every((source) => source.stops.at(-1) === env.context.currentTime));
  assert.equal(env.context.gains[0].gain.value, 0);
  assert.equal(env.audio.play('fire'), false);
  assert.equal(env.audio.setSliding(true), false);
  const before = env.context.sources.length;
  env.audio.setEnabled(true);
  assert.equal(env.context.sources.length, before, 'unmute must not replay cancelled effects');
  assert.equal(env.context.gains[0].gain.value, .65);
});

test('slide holds one loop, fades out, and an old loop ending cannot clear a new one', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  assert.equal(audio.setSliding(true), true);
  audio.setSliding(true);
  assert.equal(context.sources.length, 1);
  const old = context.sources[0], oldGain = context.gains.at(-1);
  assert.equal(old.loop, true);
  audio.setSliding(false);
  assert.equal(old.stops.at(-1), 10.06);
  assert.deepEqual(oldGain.gain.events.at(-1), ['ramp', 0, 10.06]);
  audio.setSliding(true);
  old.end();
  assert.equal(old.disconnected, true);
  audio.setSliding(true);
  assert.equal(context.sources.length, 2);
  audio.stopAll();
  assert.ok(context.sources.every((source) => source.disconnected));
});

test('overlapping fire uses a bounded voice pool and naturally ended nodes disconnect', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  audio.setSliding(true);
  for (let i = 0; i < MAX_AUDIO_VOICES + 10; i++) audio.play('fire');
  assert.equal(context.sources.filter((source) => !source.disconnected).length, MAX_AUDIO_VOICES);
  assert.equal(context.sources[0].disconnected, false, 'gunfire should not evict the ongoing slide');
  assert.equal(context.sources[1].disconnected, true);
  const last = context.sources.at(-1), gain = context.gains.at(-1), panner = context.panners.at(-1);
  last.end();
  assert.ok(last.disconnected && gain.disconnected && panner.disconnected);
  audio.stopAll();
  assert.ok(context.sources.every((source) => source.disconnected));
});

test('essential cue mapping is explicit, footsteps alternate, and volume/pan are bounded', async () => {
  const { audio, context } = setup();
  await audio.unlock();
  for (const [kind, id] of [['echo', 'power-echo'], ['air-juke', 'power-dash'], ['bulwark', 'power-shield'],
    ['pop', 'power-pop'], ['slide', 'slide'], ['hit', 'hit'], ['hurt', 'hurt'], ['round-start', 'round-start'], ['respawn', 'respawn']]) {
    assert.equal(audio.play(kind), true);
    assert.equal(context.sources.at(-1).buffer.id, id);
  }
  for (const id of ['footstep-1', 'footstep-2', 'footstep-1']) {
    audio.play('footstep');
    assert.equal(context.sources.at(-1).buffer.id, id);
  }
  for (const kind of ['jump', 'death', 'power-ready', 'shatter', 'toString', 'unknown']) assert.equal(audio.play(kind), false);
  assert.equal(audio.play('fire', { volume: 0 }), false);
  assert.equal(audio.play('fire', { volume: NaN }), false);
  audio.play('fire', { classId: 'invalid', volume: 9, pan: -9 });
  assert.equal(context.sources.at(-1).buffer.id, 'fire-assault');
  assert.equal(context.panners.at(-1).pan.value, -1);
  assert.ok(context.gains.at(-1).gain.events.every((event) => event[0] === 'cancel' || event[1] <= 1));
});
