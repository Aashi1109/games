import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Quaternion, Raycaster, Vector3 } from 'three';
import { createWeapon } from '../client/arena.ts';
import { createGun } from '../client/game-models.ts';
import { CLASSES } from '../shared/classes.ts';
import { loadTestGameModels } from './helpers/game-models.js';

await loadTestGameModels();

const classes = ['assault', 'sniper', 'scout', 'heavy'];
const rates = [30, 60, 144];
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const pose = (weapon) => [...weapon.group.position.toArray(), ...weapon.group.rotation.toArray().slice(0, 3)];
const frames = (weapon, rate, seconds, state = {}) => {
  for (let frame = 0; frame < Math.round(rate * seconds); frame++) weapon.update({ delta: 1 / rate, ...state });
};
const meshList = (group) => {
  const meshes = [];
  group.traverse((part) => { if (part.isMesh) meshes.push(part); });
  return meshes;
};

test('ADS centers the actual reticle 16 cm from the eye with a readable, clear aperture under class recoil', () => {
  for (const classId of ['assault', 'scout', 'heavy']) {
    for (const firing of [0, CLASSES[classId].recoil]) {
      const camera = new PerspectiveCamera(CLASSES[classId].aimFov, 16 / 9, 0.05, 220);
      const weapon = createWeapon(camera, classId);
      frames(weapon, 60, 2, { aiming: true, firing });
      camera.updateMatrixWorld(true);
      const sight = weapon.group.getObjectByName('primary-sight');
      assert.ok(sight, classId);
      const sightPosition = sight.getWorldPosition(new Vector3());
      close(sightPosition.z, -.16);
      const reticle = weapon.group.getObjectByName('holographic-reticle');
      assert.ok(reticle.getWorldPosition(new Vector3()).distanceTo(sightPosition) < 1e-9, `${classId} aim anchor misses its visible reticle`);
      const center = sightPosition.clone().project(camera);
      close(center.x, 0); close(center.y, 0);
      const up = sight.localToWorld(new Vector3(0, 0.01, 0)).project(camera);
      close(up.x, 0); assert.ok(up.y > center.y, `${classId} aperture is not upright`);
      const ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1));
      const meshes = meshList(weapon.group).filter((child) => !['muzzle-flash', 'holographic-glass', 'holographic-reticle'].includes(child.name));
      assert.equal(ray.intersectObjects(meshes, false).length, 0, `${classId} blocks the sight line`);
      const glass = weapon.group.getObjectByName('holographic-glass');
      let minY = Infinity, maxY = -Infinity;
      for (const part of [glass, weapon.group.getObjectByName('holographic-housing')]) {
        const positions = part.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const point = part.localToWorld(new Vector3().fromBufferAttribute(positions, i));
          assert.ok(point.z < -camera.near - .03, `${classId} optic approaches the near clipping plane`);
          if (part === glass) {
            const projected = point.project(camera);
            minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
          }
        }
      }
      // The wider, thin-bezel lens fills roughly a fifth to a quarter of the
      // screen height, using each class's actual ADS FOV.
      const apertureHeight = (maxY - minY) / 2;
      assert.ok(apertureHeight > .19 && apertureHeight < .27, `${classId} aperture occupies ${(apertureHeight * 100).toFixed(1)}% of screen height`);
      close(weapon.group.rotation.z, 0);
      assert.deepEqual(camera.rotation.toArray(), [0, 0, 0, 'XYZ']);
      weapon.dispose();
    }
  }
});

test('backup iron sights leave the near holographic window and the distant reticle area clear', () => {
  for (const classId of ['assault', 'scout', 'heavy']) {
    for (const firing of [0, CLASSES[classId].recoil]) {
      const camera = new PerspectiveCamera(CLASSES[classId].aimFov, 16 / 9, .05, 220);
      const weapon = createWeapon(camera, classId);
      weapon.update({ aiming: true, motion: false, firing });
      camera.updateMatrixWorld(true);
      const glass = weapon.group.getObjectByName('holographic-glass');
      glass.geometry.computeBoundingBox();
      const center = glass.geometry.boundingBox.getCenter(new Vector3());
      const size = glass.geometry.boundingBox.getSize(new Vector3());
      const opaque = meshList(weapon.group).filter((part) => !['muzzle-flash', 'holographic-glass', 'holographic-reticle'].includes(part.name));
      for (const y of [-.8, -.4, 0, .4, .8]) {
        for (const x of [-.8, -.4, 0, .4, .8]) {
          // Stay inside the chamfered frame and inspect only the eye-to-glass
          // volume. The receiver and supporting hand may appear farther away
          // at the bottom edge; the full-depth center ray is checked above.
          const target = glass.localToWorld(new Vector3(center.x + x * size.x / 2, center.y + y * size.y / 2, center.z));
          const ray = new Raycaster(new Vector3(), target.clone().normalize(), 0, target.length() + .01);
          const hits = ray.intersectObjects(opaque, false);
          assert.equal(hits.length, 0, `${classId} recoil ${firing}: ${hits[0]?.object.name} blocks aperture (${x}, ${y}) before the glass`);
        }
      }
      for (const y of [-.4, -.2, 0, .2, .4]) {
        for (const x of [-.4, -.2, 0, .2, .4]) {
          // Inspect the entire depth around the ring and dot, keeping a margin
          // beyond the ring. A supporting hand can appear farther out at the
          // diagonal edge of the window without obscuring the aiming area.
          if (x * x + y * y > .16 + 1e-9) continue;
          const target = glass.localToWorld(new Vector3(center.x + x * size.x / 2, center.y + y * size.y / 2, center.z));
          const ray = new Raycaster(new Vector3(), target.clone().normalize());
          const hits = ray.intersectObjects(opaque, false);
          assert.equal(hits.length, 0, `${classId} recoil ${firing}: ${hits[0]?.object.name} blocks central aperture (${x}, ${y}) beyond the glass`);
        }
      }
      weapon.dispose();
    }
  }
});

test('sniper uses the closer hip pose while retaining its magnified scope pose', () => {
  const weapon = createWeapon(new PerspectiveCamera(), 'sniper');
  weapon.reset();
  close(weapon.group.position.z, -.38);
  frames(weapon, 60, 2, { aiming: true });
  close(weapon.group.position.x, 0.053);
  close(weapon.group.position.y, -0.245);
  close(weapon.group.position.z, -0.43);
  close(weapon.group.rotation.z, -0.015);
  weapon.dispose();
});

test('power poses lower the weapon, cancel ADS and restore its grip-aligned aim on release', () => {
  for (const classId of ['scout', 'heavy']) {
    const camera = new PerspectiveCamera();
    const weapon = createWeapon(camera, classId);
    weapon.update({ aiming: true, motion: false });
    const aim = pose(weapon);
    weapon.update({ aiming: true, lowered: true, motion: false });
    assert.ok(weapon.group.position.y < -.39, `${classId} weapon stays raised during power`);
    assert.ok(weapon.group.rotation.x < -.2);
    const arms = weapon.group.getObjectByName('first-person-arms');
    const gun = weapon.group.children[0];
    camera.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const palm = arms.userData.character.bones[`${side}Hand`].localToWorld(new Vector3(...arms.userData.handGrips[`${side}Hand`].localPalmOffset));
      const grip = gun.localToWorld(new Vector3(...gun.userData.anchors[side === 'Left' ? 'support' : 'grip']));
      assert.ok(palm.distanceTo(grip) < .00001);
    }
    weapon.update({ aiming: true, motion: false });
    pose(weapon).forEach((value, index) => close(value, aim[index]));
    weapon.update({ lowered: true });
    weapon.reset();
    close(weapon.group.position.y, -.245);
    close(weapon.group.rotation.x, 0);
    weapon.dispose();
  }
});

test('Rook braces the left arm without breaking the right grip and restores both hands after release', () => {
  const camera = new PerspectiveCamera(), weapon = createWeapon(camera, 'heavy');
  const arms = weapon.group.getObjectByName('first-person-arms'), gun = weapon.group.children[0];
  const gap = side => {
    camera.updateMatrixWorld(true);
    const palm = arms.userData.character.bones[`${side}Hand`].localToWorld(new Vector3(...arms.userData.handGrips[`${side}Hand`].localPalmOffset));
    return palm.distanceTo(gun.localToWorld(new Vector3(...gun.userData.anchors[side === 'Left' ? 'support' : 'grip'])));
  };
  for (const motion of [true, false]) {
    frames(weapon, 60, .5, { lowered: true, abilityTime: 3, shieldHealth: 120, motion });
    assert.ok(gap('Left') > .15, 'support hand must leave the gun to brace');
    assert.ok(gap('Right') < .00001, 'trigger hand must remain on its grip');
    const hand = arms.userData.character.bones.LeftHand.getWorldPosition(new Vector3());
    assert.ok(hand.x < 0 && hand.y > -.45 && hand.z < -.3, 'raised forearm should be visible to the left');
    weapon.reset();
    assert.ok(gap('Left') < .00001 && gap('Right') < .00001, 'reset must restore grip alignment');
  }
  weapon.dispose();
});

test('Ember and Wisp casting never pulls an aimed or firing gun away from its normal pose', () => {
  for (const classId of ['assault', 'sniper']) {
    const weapon = createWeapon(new PerspectiveCamera(), classId);
    const abilityTime = classId === 'assault' ? .46 : 3.81;
    for (const state of [{ aiming: true }, { firing: .9 }]) {
      weapon.reset(); frames(weapon, 60, 2, state); const normal = pose(weapon);
      frames(weapon, 60, 2, { ...state, abilityTime });
      pose(weapon).forEach((value,index) => close(value,normal[index]));
    }
    weapon.dispose();
  }
});

test('ADS enters and exits smoothly at the same speed across display rates', () => {
  for (const classId of classes) {
    const settled = [];
    for (const rate of rates) {
      const weapon = createWeapon(new PerspectiveCamera(), classId);
      weapon.update({ delta: 0 });
      const start = pose(weapon);
      const startPosition = weapon.group.position.clone();
      weapon.update({ delta: 1 / rate, aiming: true });
      assert.ok(weapon.group.position.x < start[0]);
      assert.ok(weapon.group.position.distanceTo(startPosition) < 0.1, `${rate}Hz ADS entry snapped`);
      for (let frame = 1; frame < rate / 2; frame++) weapon.update({ delta: 1 / rate, aiming: true });
      settled.push(pose(weapon));
      const aimedX = weapon.group.position.x;
      weapon.update({ delta: 1 / rate });
      assert.ok(weapon.group.position.x > aimedX && weapon.group.position.x < start[0]);
      frames(weapon, rate, 1);
      pose(weapon).forEach((value, index) => close(value, start[index], 0.000001));
      weapon.dispose();
    }
    settled.forEach((current) => current.forEach((value, index) => close(value, settled[0][index])));
  }
});

test('reload releases ADS on every class and aiming resumes when reload finishes', () => {
  for (const classId of classes) {
    const weapon = createWeapon(new PerspectiveCamera(), classId);
    const standard = createWeapon(new PerspectiveCamera(), classId);
    frames(weapon, 60, 2, { aiming: true });
    const aimed = pose(weapon);
    frames(weapon, 60, 2, { aiming: true, reloading: true });
    frames(standard, 60, 2, { reloading: true });
    pose(weapon).forEach((value, index) => close(value, pose(standard)[index]));
    frames(weapon, 60, 2, { aiming: true });
    pose(weapon).forEach((value, index) => close(value, aimed[index]));
    weapon.dispose(); standard.dispose();
  }
});

test('reduced motion snaps functional ADS and preserves the hipfire pose on release', () => {
  for (const classId of classes) {
    const camera = new PerspectiveCamera(); const weapon = createWeapon(camera, classId);
    weapon.update({ aiming: true, motion: false, firing: 1, moving: 1 });
    if (classId !== 'sniper') {
      close(weapon.group.rotation.z, 0);
      camera.updateMatrixWorld(true);
      const center = weapon.group.getObjectByName('primary-sight').getWorldPosition(new Vector3());
      close(center.x, 0); close(center.y, 0); close(center.z, -.16);
    }
    assert.ok(Number.isFinite(weapon.muzzlePosition(new Vector3()).z));
    weapon.update({ aiming: false, motion: false });
    assert.deepEqual(pose(weapon), [0.265, -0.245, -0.38, 0, -0.025, -0.015]);
    weapon.dispose();
  }
});

test('same-class respawn resets aim, reload, slide and flash without rebuilding the weapon', () => {
  for (const classId of classes) {
    const weapon = createWeapon(new PerspectiveCamera(), classId);
    const fresh = createWeapon(new PerspectiveCamera(), classId);
    fresh.update({ motion: false });
    const meshes = meshList(weapon.group);
    const resources = meshes.flatMap((mesh) => [mesh.geometry, mesh.material]);
    let disposed = 0;
    const onDispose = () => disposed++;
    for (const resource of resources) resource.addEventListener('dispose', onDispose);
    for (const state of [{ aiming: true }, { reloading: true }, { sliding: true, firing: 1 }]) {
      frames(weapon, 60, .3, state);
      weapon.reset();
      assert.deepEqual(pose(weapon), pose(fresh), `${classId} respawn retains a stale pose`);
      assert.equal(weapon.group.getObjectByName('muzzle-flash').material.opacity, 0);
      assert.deepEqual(meshList(weapon.group).flatMap((mesh) => [mesh.geometry, mesh.material]), resources);
      assert.equal(disposed, 0, 'respawning in the same class must retain the loaded resources');
    }
    for (const resource of resources) resource.removeEventListener('dispose', onDispose);
    weapon.dispose(); fresh.dispose();
  }
});

test('weapons share actual gun and sight meshes while releasing their owned viewmodel resources', () => {
  for (const classId of classes) {
    const model = createGun(classId);
    const camera = new PerspectiveCamera(); const weapon = createWeapon(camera, classId);
    const meshes = meshList(weapon.group);
    assert.equal(meshes.length, 6, 'gun, skinned arms, flash and three holographic sight surfaces');
    const gun = meshes.find((mesh) => mesh.userData.sharedModel);
    assert.equal(gun.geometry, model.geometry, 'the optimized geometry must remain shared');
    assert.notEqual(gun.material, model.material, 'view depth must not change the world material');
    for (const map of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) assert.equal(gun.material[map], model.material[map]);
    assert.equal(gun.geometry.index.count / 3, 4000, 'use the actual optimized weapon');
    const arms = weapon.group.getObjectByName('first-person-arms');
    const hands = meshes.find((mesh) => mesh.isSkinnedMesh);
    assert.ok(hands.material.map && hands.material.normalMap, 'use the actual character arm textures');
    assert.ok(hands.geometry.index.count / 3 < 18000, 'exclude torso, head and legs from the first-person draw');
    const { skinWeight, skinIndex } = hands.geometry.attributes;
    for (let vertex = 0; vertex < skinWeight.count; vertex++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(vertex, k);
        sum += weight;
        if (weight) assert.match(hands.skeleton.bones[skinIndex.getComponent(vertex, k)].name, /(?:UpperArm|ForeArm|Hand)$/, 'detached sleeves cannot remain pulled toward torso bones');
      }
      assert.ok(Math.abs(sum - 1) < .005, 'quantized view-arm weights remain normalized');
    }
    const disposals = [];
    for (const mesh of meshes) {
      for (const resource of mesh.userData.sharedModel && mesh !== hands ? [mesh.material] : [mesh.geometry, mesh.material]) {
        let count = 0;
        resource.addEventListener('dispose', () => { count++; });
        disposals.push(() => count);
      }
    }
    let sharedDisposals = 0;
    const shared = new Set([model.geometry, model.material, model.material.map, model.material.normalMap, model.material.metalnessMap, model.material.roughnessMap, hands.material.map, hands.material.normalMap, hands.material.roughnessMap]);
    for (const part of meshList(model)) { shared.add(part.geometry); shared.add(part.material); }
    const sharedDisposed = () => { sharedDisposals++; };
    for (const resource of shared) resource?.addEventListener('dispose', sharedDisposed);
    weapon.update({ motion: false });
    camera.updateMatrixWorld(true);
    const muzzle = gun.localToWorld(new Vector3().fromArray(gun.userData.anchors.muzzle));
    assert.ok(weapon.muzzlePosition(new Vector3()).distanceTo(muzzle) < 1e-9, 'shot origin follows the model muzzle');
    for (const side of ['Left', 'Right']) {
      const palm = arms.userData.character.bones[`${side}Hand`].localToWorld(new Vector3(...arms.userData.handGrips[`${side}Hand`].localPalmOffset));
      const anchor = gun.localToWorld(new Vector3(...gun.userData.anchors[side === 'Left' ? 'support' : 'grip']));
      assert.ok(palm.distanceTo(anchor) < .00001, `${classId} ${side} hand must meet the first-person grip`);
    }
    let boneDisposals = 0;
    hands.skeleton.computeBoneTexture();
    hands.skeleton.boneTexture.addEventListener('dispose', () => boneDisposals++);
    weapon.dispose();
    assert.equal(camera.children.length, 0);
    assert.ok(disposals.every((count) => count() === 1));
    assert.equal(sharedDisposals, 0, 'class changes must preserve cached geometry and texture atlases');
    assert.equal(boneDisposals, 1, 'the first-person skeleton texture is independently owned');
    for (const resource of shared) resource?.removeEventListener('dispose', sharedDisposed);
  }
});

test('first-person arms retain bent elbows and untwisted cuffs without stretching their bones', () => {
  for (const classId of classes) {
    const camera = new PerspectiveCamera();
    const weapon = createWeapon(camera, classId);
    weapon.reset();
    camera.updateMatrixWorld(true);
    const arms = weapon.group.getObjectByName('first-person-arms');
    const { bones, body } = arms.userData.character;
    const rest = arms.userData.restJointPositions;
    const scale = arms.getWorldScale(new Vector3()).x;
    for (const side of ['Left', 'Right']) {
      const [upper, forearm, hand] = ['UpperArm', 'ForeArm', 'Hand'].map((part) => bones[`${side}${part}`]);
      const [shoulder, elbow, wrist] = [upper, forearm, hand].map((bone) => bone.getWorldPosition(new Vector3()));
      const upperDirection = elbow.clone().sub(shoulder);
      const forearmDirection = wrist.clone().sub(elbow);
      const restShoulder = new Vector3(...rest[`${side}UpperArm`]);
      const restElbow = new Vector3(...rest[`${side}ForeArm`]);
      const restWrist = new Vector3(...rest[`${side}Hand`]);
      close(upperDirection.length(), restShoulder.distanceTo(restElbow) * scale, 1e-6);
      close(forearmDirection.length(), restElbow.distanceTo(restWrist) * scale, 1e-6);
      const bend = upperDirection.angleTo(forearmDirection);
      assert.ok(bend > Math.PI / 6 && bend < Math.PI * 2 / 3, `${classId} ${side} elbow forms a straight sleeve slab`);

      // Separate axial twisting from ordinary wrist bending. A large roll
      // discontinuity pinches the blended sleeve even with a correct grip.
      const relative = forearm.getWorldQuaternion(new Quaternion())
        .multiply(hand.getWorldQuaternion(new Quaternion()).invert());
      forearmDirection.normalize();
      const axial = relative.x * forearmDirection.x + relative.y * forearmDirection.y + relative.z * forearmDirection.z;
      const twist = 2 * Math.atan2(Math.abs(axial), Math.abs(relative.w));
      assert.ok(twist < Math.PI / 8, `${classId} ${side} cuff twists independently of the glove`);
    }

    // Check the actual extracted and reweighted FPS mesh, which is different
    // from the full-body rig covered by the character tests.
    const { position } = body.geometry.attributes;
    const restVertices = Array.from({ length: position.count }, (_, index) => new Vector3().fromBufferAttribute(position, index));
    const posed = restVertices.map((point, index) => body.applyBoneTransform(index, point.clone()));
    const indices = body.geometry.index;
    for (let i = 0; i < indices.count; i += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = indices.getX(i + edge), b = indices.getX(i + (edge + 1) % 3);
        const growth = posed[a].distanceTo(posed[b]) - restVertices[a].distanceTo(restVertices[b]);
        assert.ok(Number.isFinite(growth) && growth < .08, `${classId} FPS triangle ${i / 3} stretches beyond a palm width`);
      }
    }
    weapon.dispose();
  }
});
