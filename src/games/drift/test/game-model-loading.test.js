import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SkinnedMesh, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let moduleId = 0;
const freshModels = () => import(`../client/game-models.ts?loader-test=${moduleId++}`);
const fileName = (url) => new URL(url, 'http://localhost').pathname.split('/').at(-1);
function fixture(url) {
  const file = fileName(url), character = file.endsWith('-character.glb');
  const name = file.replace(character ? '-character.glb' : '.glb', '');
  const scene = new Group();
  const mesh = new (character ? SkinnedMesh : Mesh)(new BoxGeometry(.2, .2, .2), new MeshStandardMaterial({ map: new Texture() }));
  mesh.name = name;
  scene.add(mesh);
  return { scene };
}
function delayedLoader() {
  const requests = [];
  return {
    requests,
    loadAsync(url) {
      return new Promise((resolve, reject) => requests.push({ url, resolve: (result = fixture(url)) => resolve(result), reject }));
    },
  };
}

test('only the selected character and gun start together, and readiness waits for both', async () => {
  const models = await freshModels(), loader = delayedLoader();
  assert.equal(models.hasGameModels('scout'), false);
  const loading = models.loadGameModels('scout', loader);
  assert.deepEqual(loader.requests.map(({ url }) => fileName(url)), ['dash-character.glb', 'dash-gun.glb']);
  loader.requests[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.hasGameModels('scout'), false);
  assert.throws(() => models.createGun('scout'), /Load game models/);
  loader.requests[1].resolve();
  await loading;
  assert.equal(models.hasGameModels('scout'), true);
  assert.equal(models.createGun('scout').name, 'dash-gun');
  for (const id of ['assault', 'sniper', 'heavy']) {
    assert.equal(models.hasGameModels(id), false);
    assert.throws(() => models.createRiggedCharacter(id), /Load game models/);
  }
});

test('concurrent requests and later reuse share resources while other classes load independently', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const first = models.loadGameModels('assault', loader);
  const duplicate = models.loadGameModels('assault', loader);
  const other = models.loadGameModels('heavy', loader);
  assert.equal(loader.requests.length, 4);
  for (const request of loader.requests) request.resolve();
  await Promise.all([first, duplicate, other]);
  await models.loadGameModels('assault', loader);
  await models.loadGameModels('heavy', loader);
  assert.equal(loader.requests.length, 4);
  const gun = models.createGun('assault'), clone = models.createGun('assault');
  assert.notEqual(gun, clone);
  assert.equal(gun.geometry, clone.geometry);
  assert.equal(gun.material, clone.material);
});

test('a failed gun retries without redownloading the successful character', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const first = models.loadGameModels('sniper', loader);
  const failure = assert.rejects(first, /connection lost/);
  loader.requests[0].resolve();
  loader.requests[1].reject(new Error('connection lost'));
  await failure;
  assert.equal(models.hasGameModels('sniper'), false);
  const retry = models.loadGameModels('sniper', loader);
  assert.equal(loader.requests.length, 3);
  assert.equal(fileName(loader.requests[2].url), 'wisp-gun.glb');
  loader.requests[2].resolve();
  await retry;
  assert.equal(models.hasGameModels('sniper'), true);
});

test('a failed character can retry while its first gun request is still in flight', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const first = models.loadGameModels('heavy', loader);
  const failure = assert.rejects(first, /connection lost/);
  loader.requests[0].reject(new Error('connection lost'));
  await failure;
  const retry = models.loadGameModels('heavy', loader);
  assert.equal(loader.requests.length, 3);
  assert.equal(fileName(loader.requests[2].url), 'rook-character.glb');
  loader.requests[1].resolve();
  loader.requests[2].resolve();
  await retry;
  assert.equal(models.hasGameModels('heavy'), true);
});

test('invalid class identifiers fall back to Ember consistently without extra requests', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const requests = [undefined, 'unknown', '__proto__', 'constructor'].map((id) => models.loadGameModels(id, loader));
  assert.deepEqual(loader.requests.map(({ url }) => fileName(url)), ['ember-character.glb', 'ember-gun.glb']);
  for (const request of loader.requests) request.resolve();
  await Promise.all(requests);
  for (const id of [undefined, 'unknown', '__proto__', 'constructor']) {
    assert.equal(models.hasGameModels(id), true);
    assert.equal(models.createGun(id).name, 'ember-gun');
  }
});

test('an invalid model is not cached and retries without discarding a valid gun', async () => {
  const models = await freshModels();
  const calls = [];
  const loader = {
    async loadAsync(url) {
      calls.push(fileName(url));
      return calls.length === 1 ? { scene: new Group() } : fixture(url);
    },
  };
  await assert.rejects(models.loadGameModels('assault', loader), /Missing model: ember/);
  assert.equal(models.hasGameModels('assault'), false);
  await models.loadGameModels('assault', loader);
  assert.deepEqual(calls, ['ember-character.glb', 'ember-gun.glb', 'ember-character.glb']);
  assert.equal(models.hasGameModels('assault'), true);
});

test('unmount waits for pending models, disposes their GPU resources once, and permits a new session', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const release = models.retainGameModels();
  const loading = models.loadGameModels('assault', loader);
  let disposals = 0;
  const results = [];
  for (const request of loader.requests) {
    const result = fixture(request.url);
    results.push(result);
    result.scene.traverse((part) => {
      for (const resource of [part.geometry, part.material, part.material?.map]) {
        resource?.addEventListener('dispose', () => disposals++);
      }
    });
  }
  release();
  release();
  loader.requests.forEach((request, index) => request.resolve(results[index]));
  await loading;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.hasGameModels('assault'), false, 'late arrivals cannot retain a disposed session');
  assert.equal(disposals, 6, 'late model geometry, materials, and textures are all released');
  const nextRelease = models.retainGameModels();
  const next = models.loadGameModels('assault', loader);
  assert.equal(loader.requests.length, 4, 'a new session loads fresh templates');
  for (const request of loader.requests.slice(2)) request.resolve();
  await next;
  const gun = models.createGun('assault');
  for (const resource of [gun.geometry, gun.material, gun.material.map]) resource.addEventListener('dispose', () => disposals++);
  nextRelease();
  nextRelease();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposals, 9, 'shared resources are released once');
  assert.equal(models.hasGameModels('assault'), false);
});

test('StrictMode remount during loading retains shared models until the final owner unmounts', async () => {
  const models = await freshModels(), loader = delayedLoader();
  const releaseFirst = models.retainGameModels();
  const first = models.loadGameModels('scout', loader);
  releaseFirst();
  const releaseSecond = models.retainGameModels();
  const second = models.loadGameModels('scout', loader);
  assert.equal(loader.requests.length, 2, 'remount reuses in-flight model downloads');
  for (const request of loader.requests) request.resolve();
  await Promise.all([first, second]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.hasGameModels('scout'), true);
  releaseSecond();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.hasGameModels('scout'), false);
});

// Exercise the production loader with real GLBs while replacing only browser
// image decoding. This catches duplicated atlases across separate glTF parses.
test('separate character files reuse all six atlas downloads and GPU textures', async (t) => {
  const models = await freshModels(), imageURLs = [];
  const originalSelf = globalThis.self;
  globalThis.self = globalThis;
  t.after(() => {
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (url) {
    const bytes = await readFile(new URL(`../../../../public${url}`, import.meta.url));
    return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), new URL('.', new URL(url, 'http://localhost')).href);
  });
  t.mock.method(TextureLoader.prototype, 'load', function (url, onLoad) {
    imageURLs.push(this.manager.resolveURL(url));
    const texture = new Texture({ width: 1, height: 1 });
    queueMicrotask(() => onLoad(texture));
    return texture;
  });
  const ids = ['assault', 'sniper', 'scout', 'heavy'];
  await Promise.all(ids.map((id) => models.loadGameModels(id)));
  assert.equal(imageURLs.length, 6);
  assert.equal(new Set(imageURLs).size, 6);
  const avatars = ids.map((id) => models.createRiggedCharacter(id));
  for (const avatar of avatars) {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      assert.equal(avatar.userData.character.body.material[key], avatars[0].userData.character.body.material[key]);
      assert.equal(avatar.userData.character.gun.material[key], avatars[0].userData.character.gun.material[key]);
    }
    models.disposeModel(avatar);
  }
});
