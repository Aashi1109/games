import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createWeaponModel, WEAPON_MODELS } from '../client/weapon-models.js';

const expected = {
  assault: { weaponId: 'AR-01', character: 'Ember' },
  sniper: { weaponId: 'SR-02', character: 'Wisp' },
  scout: { weaponId: 'SMG-03', character: 'Dash' },
  heavy: { weaponId: 'LMG-04', character: 'Rook' },
};

function meshesIn(group) {
  const meshes = [];
  group.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

function dispose(group) {
  for (const mesh of meshesIn(group)) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

function modelFor(t, id) {
  const group = createWeaponModel(id);
  t.after(() => dispose(group));
  return group;
}

for (const [id, identity] of Object.entries(expected)) {
  test(`${identity.weaponId} has valid untextured geometry within the preview budget`, (t) => {
    const group = modelFor(t, id);
    assert.equal(group.isGroup, true);
    assert.equal(group.userData.classId, id);
    assert.equal(group.userData.weaponId, identity.weaponId);
    assert.equal(WEAPON_MODELS[id].name, identity.weaponId);
    assert.equal(WEAPON_MODELS[id].character, identity.character);

    const meshes = meshesIn(group);
    assert.equal(meshes.length, 1, 'each weapon should need one draw mesh');
    const mesh = meshes[0];
    assert.equal(mesh.name, 'weapon-body');
    assert.equal(mesh.material.isMeshStandardMaterial, true);
    assert.equal(mesh.material.vertexColors, true);
    assert.ok(!Object.values(mesh.material).some((value) => value?.isTexture), 'weapons should require no texture assets');
    assert.ok(mesh.geometry.groups.length <= 1, 'material groups must not multiply draw calls');

    const { position, normal, color } = mesh.geometry.attributes;
    assert.ok(position && normal && color, 'positions, normals and vertex colors are required');
    assert.equal(position.itemSize, 3);
    assert.equal(normal.itemSize, 3);
    assert.equal(color.itemSize, 3);
    assert.equal(normal.count, position.count);
    assert.equal(color.count, position.count);
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      assert.ok(attribute.array.every(Number.isFinite), 'all geometry attributes must remain finite');
    }
    assert.ok(color.array.every((value) => value >= 0 && value <= 1), 'colors must remain in the material color range');
    const count = mesh.geometry.index?.count ?? position.count;
    assert.equal(count % 3, 0, 'geometry must contain complete triangles');
    assert.ok(count > 0 && count / 3 <= 1500, 'each weapon must stay within 1500 triangles');
    if (mesh.geometry.index) {
      assert.ok(mesh.geometry.index.array.every((index) => index < position.count), 'indices must refer to existing vertices');
    }
    for (let index = 0; index < normal.count; index++) {
      const length = Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index));
      assert.ok(Math.abs(length - 1) < 0.001, 'surface normals must be normalized for stable lighting');
    }

    const size = new Box3().setFromObject(group).getSize(new Vector3());
    assert.ok(size.toArray().every((value) => Number.isFinite(value) && value > 0));
    assert.ok(size.z > size.x && size.z > size.y, 'weapons should point along the Z axis');
    assert.ok(size.z < 2, 'model dimensions should use a plausible meter scale');
  });

  test(`${identity.weaponId} supplies usable muzzle, sight and hand markers`, (t) => {
    const group = modelFor(t, id);
    const bounds = new Box3().setFromObject(group);
    const paddedBounds = bounds.clone().expandByScalar(0.03);
    const markers = {};
    for (const name of ['muzzle', 'primary-sight', 'grip', 'support-grip']) {
      const marker = group.getObjectByName(name);
      assert.ok(marker?.isObject3D, `${name} attachment marker is required`);
      assert.equal(marker.isMesh, undefined, 'attachment markers should have no rendered geometry');
      assert.ok(marker.position.toArray().every(Number.isFinite));
      assert.ok(paddedBounds.containsPoint(marker.getWorldPosition(new Vector3())), `${name} should be on or close to the weapon`);
      markers[name] = marker;
    }
    assert.ok(markers.muzzle.position.z <= bounds.min.z + 0.03, 'muzzle should sit at the negative-Z front');
    assert.ok(markers['primary-sight'].position.y > markers.grip.position.y, 'sight should sit above the firing hand');
    assert.ok(markers['support-grip'].position.z < markers.grip.position.z, 'support hand should sit ahead of the firing hand');
    for (const [key, markerName] of [['muzzle', 'muzzle'], ['sight', 'primary-sight']]) {
      const point = group.userData[key];
      assert.ok(point && ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis])));
      for (const axis of ['x', 'y', 'z']) assert.equal(point[axis], markers[markerName].position[axis]);
    }
  });
}

test('rifle lengths and the heavy magazine retain distinct class silhouettes', (t) => {
  const sizes = Object.fromEntries(Object.keys(expected).map((id) => [
    id, new Box3().setFromObject(modelFor(t, id)).getSize(new Vector3()),
  ]));
  for (const id of ['assault', 'heavy']) {
    assert.ok(sizes.sniper.z > sizes[id].z, 'sniper should remain the longest weapon');
    assert.ok(sizes.scout.z < sizes[id].z, 'SMG should remain the shortest weapon');
  }
  assert.ok(sizes.sniper.z > sizes.scout.z * 1.5, 'sniper and SMG must be distinguishable at a glance');
  assert.ok(sizes.heavy.x > sizes.assault.x && sizes.heavy.x > sizes.scout.x, 'heavy box magazine should produce a wider silhouette');
});

test('preview fallback returns the assault model for an unknown class', (t) => {
  for (const id of [undefined, 'missing-class', null]) {
    const group = modelFor(t, id);
    assert.equal(group.userData.classId, 'assault');
    assert.equal(group.userData.weaponId, 'AR-01');
  }
});

test('disposing one preview cannot dispose another instance of any weapon', () => {
  for (const id of Object.keys(expected)) {
    const first = createWeaponModel(id);
    const second = createWeaponModel(id);
    const firstMesh = meshesIn(first)[0];
    const secondMesh = meshesIn(second)[0];
    assert.notEqual(firstMesh.geometry, secondMesh.geometry);
    assert.notEqual(firstMesh.material, secondMesh.material);
    let secondDisposals = 0;
    secondMesh.geometry.addEventListener('dispose', () => secondDisposals++);
    secondMesh.material.addEventListener('dispose', () => secondDisposals++);
    dispose(first);
    assert.equal(secondDisposals, 0);
    dispose(second);
    assert.equal(secondDisposals, 2);
  }
});
