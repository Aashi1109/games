import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArena } from '../client/arena.ts';
import { MAPS } from '../shared/world.ts';
import { applySurfaceUV, createSurfaceLibrary } from '../client/surfaces.ts';

test('surface detail keeps its physical scale and deterministic appearance', () => {
  const small = applySurfaceUV(new THREE.BoxGeometry(2, 2, 2), 'concrete');
  const large = applySurfaceUV(new THREE.BoxGeometry(20, 20, 20), 'concrete');
  assert.ok(Math.abs(large.attributes.uv.getX(0) - small.attributes.uv.getX(0) * 10) < 0.000001);
  assert.ok(Math.abs(large.attributes.uv.getY(0) - small.attributes.uv.getY(0) * 10) < 0.000001);
  small.dispose(); large.dispose();
  const first = createSurfaceLibrary()('stone'), second = createSurfaceLibrary()('stone');
  assert.deepEqual(first.map.image.data, second.map.image.data);
  assert.deepEqual(first.bumpMap.image.data, second.bumpMap.image.data);
  for (const material of [first, second]) {
    material.map.dispose(); material.bumpMap.dispose(); material.dispose();
  }
});

test('all maps preserve structure, bound surface draws and release every texture once', (t) => {
  const originalDocument = globalThis.document;
  // Arena signage only requires canvas drawing; texture lifecycle and geometry
  // can be checked without a browser or GPU.
  const context = new Proxy({ measureText: (value) => ({ width: value.length * 35 }) }, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { globalThis.document = originalDocument; });
  const scene = new THREE.Scene();
  for (const map of Object.values(MAPS)) {
    const collision = JSON.stringify(map.boxes);
    const arena = createArena(scene, map);
    const textures = new Map(), materials = new Set(), geometries = new Set();
    let surfaceDraws = 0;
    const bounds = new THREE.Box3();
    scene.traverse((object) => {
      if (object.name.startsWith('Architecture /')) bounds.union(new THREE.Box3().setFromObject(object));
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      if (object.material.name.startsWith('Surface /')) surfaceDraws++;
      materials.add(object.material);
      for (const value of Object.values(object.material)) if (value?.isTexture) textures.set(value, 0);
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    });
    const expected = new THREE.Box3();
    for (const box of map.boxes) {
      expected.expandByPoint(new THREE.Vector3(box.x - box.w / 2, box.y, box.z - box.d / 2));
      expected.expandByPoint(new THREE.Vector3(box.x + box.w / 2, box.y + box.h, box.z + box.d / 2));
    }
    assert.ok(bounds.min.distanceTo(expected.min) < 0.00001 && bounds.max.distanceTo(expected.max) < 0.00001, map.id);
    assert.ok(surfaceDraws <= 11, `${map.id}: surface draw budget`);
    assert.equal(JSON.stringify(map.boxes), collision);
    assert.ok([...textures.keys()].some((texture) => texture.name.endsWith('/ relief')));
    for (const texture of textures.keys()) texture.addEventListener('dispose', () => textures.set(texture, textures.get(texture) + 1));
    let materialDisposals = 0, geometryDisposals = 0;
    for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
    for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    arena.dispose(); arena.dispose();
    assert.equal(scene.children.length, 0);
    assert.ok([...textures.values()].every((count) => count === 1), `${map.id}: texture disposal`);
    assert.equal(materialDisposals, materials.size);
    assert.equal(geometryDisposals, geometries.size);
  }
});
