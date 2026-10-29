import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createCharacterModel } from '../client/character-models.ts';

const classIds = ['assault', 'sniper', 'scout', 'heavy'];

function meshesIn(group) {
  const meshes = [];
  group.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

function resourcesIn(group) {
  return new Set(meshesIn(group).flatMap((mesh) => [mesh.geometry, ...[mesh.material].flat()]));
}

function dispose(group) {
  for (const resource of resourcesIn(group)) resource.dispose();
}

function modelFor(t, id, options) {
  const group = createCharacterModel(id, options);
  t.after(() => dispose(group));
  return group;
}

for (const id of classIds) {
  test(`${id} preview character has valid geometry within the shared human scale and mesh budget`, (t) => {
    const group = modelFor(t, id, { armed: false });
    assert.equal(group.isGroup, true);
    assert.equal(group.userData.classId, id);
    const meshes = meshesIn(group);
    assert.ok(meshes.length > 0 && meshes.length <= 6, 'body must stay within six draw meshes');
    let triangleCount = 0;
    for (const mesh of meshes) {
      assert.ok(!Array.isArray(mesh.material) || mesh.material.length === 1, 'body meshes should use one material each');
      assert.ok(mesh.geometry.groups.length <= 1, 'material groups should not add hidden draw calls');
      const { position, normal, color } = mesh.geometry.attributes;
      assert.ok(position && normal, 'positions and normals are required');
      assert.equal(position.itemSize, 3);
      assert.equal(normal.itemSize, 3);
      assert.equal(normal.count, position.count);
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        assert.ok(attribute.array.every(Number.isFinite), 'geometry attributes must be finite');
      }
      const count = mesh.geometry.index?.count ?? position.count;
      assert.equal(count % 3, 0, 'meshes must contain complete triangles');
      triangleCount += count / 3;
      if (mesh.geometry.index) assert.ok(mesh.geometry.index.array.every((index) => index < position.count));
      for (let index = 0; index < normal.count; index++) {
        const length = Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index));
        assert.ok(Math.abs(length - 1) < 0.001, 'lighting normals must be normalized');
      }
      for (const material of [mesh.material].flat()) {
        assert.ok(!Object.values(material).some((value) => value?.isTexture), 'characters must require no texture assets');
        assert.ok(material.color?.toArray().every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
        if (material.vertexColors) {
          assert.ok(color, 'vertex-colored materials need color attributes');
          assert.equal(color.itemSize, 3);
          assert.equal(color.count, position.count);
          assert.ok(color.array.every((value) => value >= 0 && value <= 1));
        }
      }
    }
    assert.ok(triangleCount > 0, 'character must contain triangles');
    // Ember is currently a likeness-first sculpt. Optimization is explicitly
    // deferred by the user until the visual remodel is accepted.
    if (id !== 'assault') assert.ok(triangleCount <= 24000, 'existing characters retain their triangle budget');
    const bounds = new Box3().setFromObject(group);
    const size = bounds.getSize(new Vector3());
    assert.ok(size.toArray().every((value) => Number.isFinite(value) && value > 0));
    assert.ok(Math.abs(bounds.min.y) < 0.005, 'feet should rest at ground level');
    assert.ok(bounds.max.y >= 1.7 && bounds.max.y <= 1.85, 'human models should use the shared player height');
    assert.ok(size.x <= 1, 'body should remain within the revised one-meter armored silhouette');
  });

  test(`${id} can be previewed with and without its matching weapon`, (t) => {
    const unarmed = modelFor(t, id, { armed: false });
    const armed = modelFor(t, id);
    assert.equal(unarmed.getObjectByName('weapon-body'), undefined);
    assert.ok(armed.getObjectByName('weapon-body')?.isMesh);
    assert.equal(meshesIn(armed).length, meshesIn(unarmed).length + 1, 'weapon should add one merged draw mesh');
    const weaponMesh = armed.getObjectByName('weapon-body');
    assert.equal(weaponMesh.parent.userData.classId, id, 'each character should carry its own class weapon');
    const rig = armed.userData.rig;
    armed.updateMatrixWorld(true);
    for (const [hand, arm, gripName] of [
      [rig.supportHand, rig.arms[0], 'support-grip'],
      [rig.triggerHand, rig.arms[1], 'grip'],
    ]) {
      const handPosition = hand.getWorldPosition(new Vector3());
      const shoulderPosition = arm.getWorldPosition(new Vector3());
      const gripPosition = rig.weapon.getObjectByName(gripName).getWorldPosition(new Vector3());
      assert.ok(handPosition.distanceTo(shoulderPosition) <= 0.65, 'hands must stay within human arm reach of the shoulder');
      assert.ok(handPosition.y >= 0.85, 'armed hands must remain above the waist rather than dragging the weapon toward the ground');
      assert.ok(handPosition.distanceTo(gripPosition) < 0.00001, 'both hands must actually meet their weapon grips');
    }
    const armedBounds = new Box3().setFromObject(armed);
    assert.ok(Math.abs(armedBounds.min.y) < 0.005, 'holding a weapon must not extend the model below its feet');
    assert.ok(armedBounds.max.y <= 1.85, 'holding a weapon must preserve the expected preview height');
  });
}

test('preview defaults to assault for a missing or unknown character class', (t) => {
  for (const id of [undefined, null, 'missing-class']) {
    assert.equal(modelFor(t, id).userData.classId, 'assault');
  }
});

test('disposing a character preview cannot dispose another character instance', () => {
  for (const id of classIds) {
    const first = createCharacterModel(id);
    const second = createCharacterModel(id);
    const firstResources = resourcesIn(first);
    const secondResources = resourcesIn(second);
    let secondDisposals = 0;
    for (const resource of secondResources) {
      assert.ok(!firstResources.has(resource), 'preview instances must own independent geometry and materials');
      resource.addEventListener('dispose', () => secondDisposals++);
    }
    dispose(first);
    assert.equal(secondDisposals, 0);
    dispose(second);
    assert.equal(secondDisposals, secondResources.size);
  }
});
