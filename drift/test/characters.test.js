import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createAvatar, createTarget, updateCharacter } from '../client/characters.js';
import { disposeModel } from '../client/game-models.js';
import { getPower } from '../shared/powers.js';
import { loadTestGameModels } from './helpers/game-models.js';

await loadTestGameModels();
const classIds = ['assault', 'sniper', 'scout', 'heavy'];
const meshList = (group) => {
  const meshes = [];
  group.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
};

test('optimized characters use one skinned body, one gun and a compact holographic sight', () => {
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    const meshes = meshList(group);
    assert.equal(meshes.length, 5);
    const body = meshes.find((part) => part.isSkinnedMesh);
    // Derived rigs close cuff contact seams; Wisp also sheds a detached source scrap.
    const bodyTriangles = { assault: 30000, sniper: 29856, scout: 30000, heavy: 30048 };
    assert.equal(body.geometry.index.count / 3, bodyTriangles[id]);
    assert.equal(meshes.find((part) => !part.isSkinnedMesh).geometry.index.count / 3, 4000);
    assert.equal(body.skeleton.bones.length, 19);
    const bounds = new Box3().setFromObject(body);
    assert.ok(Math.abs(bounds.min.y) < .00001, `${id} feet meet the floor`);
    assert.ok(Math.abs(bounds.max.y - 1.8) < .00001, `${id} normalized height`);
    for (const part of meshes) {
      if (part.isSkinnedMesh || part.name.endsWith('-gun')) assert.ok(part.material.map && part.material.normalMap && part.material.roughnessMap);
      for (const attribute of Object.values(part.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    }
    const { skinWeight, skinIndex } = body.geometry.attributes;
    for (let i = 0; i < skinWeight.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const weight = skinWeight.getComponent(i, k);
        assert.ok(weight >= 0 && weight <= 1);
        assert.ok(skinIndex.getComponent(i, k) < 19);
        sum += weight;
      }
      assert.ok(Math.abs(sum - 1) < .0001);
    }
    // CPU skinning at bind pose must reproduce the approved optimized mesh.
    const position = new Vector3(), skinned = new Vector3();
    body.skeleton.pose();
    group.updateMatrixWorld(true);
    body.skeleton.update();
    for (let i = 0; i < skinWeight.count; i += 17) {
      position.fromBufferAttribute(body.geometry.attributes.position, i);
      skinned.copy(position); body.applyBoneTransform(i, skinned);
      assert.ok(skinned.distanceTo(position) < .00001, `${id} bind-pose drift`);
    }
    disposeModel(group);
  }
});

test('world weapons point forward and both palms stay on their grips while aiming', () => {
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    const { gun, bones, body } = group.userData.character;
    group.updateMatrixWorld(true);
    const forward = new Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
    assert.ok(forward.distanceTo(new Vector3(0, 0, -1)) < .00001);
    for (const pitch of [-1.48, -1.3, -.8, 0, .8, 1.3, 1.48]) {
      updateCharacter(group, { delta: 1 / 60, pitch, speed: 9 });
      group.updateMatrixWorld(true);
      const aimed = new Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
      assert.ok(aimed.distanceTo(new Vector3(0, Math.sin(pitch), -Math.cos(pitch))) < .00001);
      assert.ok(Math.abs(bones.Chest.rotation.x) <= .8, 'extreme aim must not bend the entire torso');
      assert.equal(body.skeleton.bones.length, 19, 'runtime aim support must preserve the asset skeleton');
      for (const [side, anchor] of [['Right', 'grip'], ['Left', 'support']]) {
        const palm = bones[`${side}Hand`].localToWorld(new Vector3(...group.userData.handGrips[`${side}Hand`].localPalmOffset));
        const socket = gun.localToWorld(new Vector3(...gun.userData.anchors[anchor]));
        assert.ok(palm.distanceTo(socket) < .001, `${id} ${side} hand left the weapon`);
      }
      if (Math.abs(pitch) === 1.48) {
        assert.ok(gun.localToWorld(new Vector3(...gun.userData.anchors.grip)).z < 0, `${id} extreme aim swings the grip behind the torso`);
        body.skeleton.update();
        const point = new Vector3();
        for (let i = 0; i < body.geometry.attributes.position.count; i++) {
          point.fromBufferAttribute(body.geometry.attributes.position, i);
          body.applyBoneTransform(i, point);
          assert.ok(point.toArray().every(Number.isFinite) && point.length() < 2.8, `${id} extreme aim exceeds finite human bounds`);
        }
      }
    }
    disposeModel(group);
  }
});

test('players share immutable model resources while their skeletons and disposal stay independent', () => {
  const first = createAvatar(undefined, 'assault');
  const second = createAvatar(undefined, 'assault');
  const firstBody = meshList(first).find((part) => part.isSkinnedMesh);
  const secondBody = meshList(second).find((part) => part.isSkinnedMesh);
  assert.equal(firstBody.geometry, secondBody.geometry);
  assert.equal(firstBody.material, secondBody.material);
  assert.notEqual(firstBody.skeleton, secondBody.skeleton);
  assert.notEqual(first.userData.character.head, second.userData.character.head);
  let disposedShared = 0;
  for (const part of meshList(second)) for (const resource of [part.geometry, part.material, part.material.map].filter(Boolean)) resource.addEventListener('dispose', () => disposedShared++);
  updateCharacter(first, { delta: 1 / 60, pitch: .5, speed: 9 });
  assert.ok(Math.abs(second.userData.character.head.rotation.x) === 0);
  disposeModel(first);
  assert.equal(disposedShared, 0);
  disposeModel(second);
  assert.equal(disposedShared, 0);
});

test('weapon-ready arms do not pull the cuffs or waist into stretched strips', () => {
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    const { body } = group.userData.character;
    group.updateMatrixWorld(true);
    body.skeleton.update();
    const { position } = body.geometry.attributes;
    const rest = [], posed = [];
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i);
      rest.push(point.clone());
      posed.push(body.applyBoneTransform(i, point));
    }
    const indices = body.geometry.index;
    for (let i = 0; i < indices.count; i += 3) {
      for (let side = 0; side < 3; side++) {
        const a = indices.getX(i + side), b = indices.getX(i + (side + 1) % 3);
        const growth = posed[a].distanceTo(posed[b]) - rest[a].distanceTo(rest[b]);
        assert.ok(growth < .05, `${id} triangle ${i / 3} stretches by ${growth} metres`);
      }
    }
    disposeModel(group);
  }
});

test('locomotion, crouch, slide, jump and aim articulate bones without changing the network root', () => {
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    group.position.set(4, 2, -6);
    group.rotation.y = .4;
    const rig = group.userData.character;
    const body = meshList(group).find((part) => part.isSkinnedMesh);
    for (const motion of [{ speed: 9 }, { crouching: true }, { sliding: true }, { grounded: false }, { reloading: true }]) {
      for (let frame = 0; frame < 30; frame++) updateCharacter(group, { delta: 1 / 60, time: frame / 60, pitch: .5, ...motion });
      assert.deepEqual(group.position.toArray(), [4, 2, -6]);
      assert.equal(group.rotation.y, .4);
      assert.equal(group.scale.y, 1, 'stance must use bones, not squash the human mesh');
      group.updateMatrixWorld(true); body.skeleton.update();
      const skinned = new Vector3();
      for (let i = 0; i < body.geometry.attributes.position.count; i += 31) {
        skinned.fromBufferAttribute(body.geometry.attributes.position, i); body.applyBoneTransform(i, skinned);
        assert.ok(skinned.toArray().every(Number.isFinite));
        assert.ok(skinned.length() < 2.8, `${id} exploded skinning`);
      }
    }
    assert.ok(rig.head.rotation.x > 0 && rig.upper.rotation.x > 0);
    updateCharacter(group, { delta: NaN, time: Infinity, speed: NaN, pitch: NaN });
    group.updateMatrixWorld(true);
    group.traverse((object) => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
    disposeModel(group);
  }
});

test('practice drone retains its independent static chassis', () => {
  const target = createTarget();
  assert.equal(target.userData.character.kind, 'practice');
  assert.equal(meshList(target).length, 2);
  const chassis = target.children[0];
  const before = chassis.position.toArray();
  updateCharacter(target, { time: 2, delta: 1 / 60, speed: 10, pitch: 1 });
  assert.deepEqual(chassis.position.toArray(), before);
  assert.equal(target.visible, true);
  assert.ok(new Box3().setFromObject(target).max.y < 1.81);
  disposeModel(target);
});

test('crouch and slide fit the server collider with grounded feet and ordinary aim', () => {
  const crouchHeight = 1.15; // shared/simulation.js collision and shot height.
  const point = new Vector3();
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    const { body } = group.userData.character;
    const position = body.geometry.attributes.position;
    const usedVertices = new Set(body.geometry.index.array);
    for (const sliding of [false, true]) {
      const motion = { delta: 1 / 60, grounded: true, crouching: true, sliding, speed: sliding ? 8 : 3.2 };
      // Exercise the real stance blend rather than only a directly reset pose.
      for (let frame = 0; frame < 120; frame++) updateCharacter(group, motion);
      for (const pitch of [-.4, 0, .4]) {
        updateCharacter(group, { ...motion, delta: 0, pitch });
        group.updateMatrixWorld(true);
        let bottom = Infinity, top = -Infinity, foot = Infinity;
        for (const index of usedVertices) {
          point.fromBufferAttribute(position, index);
          body.applyBoneTransform(index, point);
          bottom = Math.min(bottom, point.y);
          top = Math.max(top, point.y);
          if (position.getY(index) < .16) foot = Math.min(foot, point.y);
        }
        assert.ok(top <= crouchHeight + .001, `${id} ${sliding ? 'slide' : 'crouch'} top ${top} exceeds the collider`);
        assert.ok(bottom >= -.002, `${id} penetrates the floor by ${-bottom} m`);
        assert.ok(foot <= .011, `${id} feet float ${foot} m above the floor`);
        assert.deepEqual(group.scale.toArray(), [1, 1, 1], 'compact poses must articulate the legs, not shrink the model');
      }
    }
    disposeModel(group);
  }
});

test('a new-life reset clears a previous slide and matches a fresh standing rig', () => {
  for (const id of classIds) {
    const reused = createAvatar(undefined, id), fresh = createAvatar(undefined, id);
    reused.position.set(4, 2, -6); reused.rotation.y = .4;
    fresh.position.copy(reused.position); fresh.rotation.copy(reused.rotation);
    for (let frame = 0; frame < 90; frame++) {
      updateCharacter(reused, { delta: 1 / 60, speed: 9, grounded: true, sliding: true, pitch: .4 });
    }
    const reset = { reset: true, delta: 0, time: 0, speed: 0, grounded: true, crouching: false, sliding: false, pitch: 0 };
    updateCharacter(reused, reset); updateCharacter(fresh, reset);
    reused.updateMatrixWorld(true); fresh.updateMatrixWorld(true);
    const rig = reused.userData.character, expected = fresh.userData.character;
    for (const key of ['stance', 'slideBlend', 'stride', 'phase']) assert.equal(rig[key], 0, `${id} kept old ${key}`);
    for (const [name, bone] of Object.entries(rig.bones)) {
      assert.ok(bone.position.distanceTo(expected.bones[name].position) < .000001, `${id} ${name} reset position`);
      assert.ok(bone.quaternion.angleTo(expected.bones[name].quaternion) < .000001, `${id} ${name} reset rotation`);
    }
    assert.ok(rig.gun.getWorldPosition(new Vector3()).distanceTo(expected.gun.getWorldPosition(new Vector3())) < .000001);
    assert.deepEqual(reused.position.toArray(), [4, 2, -6]);
    assert.equal(reused.rotation.y, .4);
    disposeModel(reused); disposeModel(fresh);
  }
});

test('brief class celebrations keep weapon aim, hand grips and the network root intact', () => {
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    group.position.set(4, 2, -6);
    group.rotation.y = .4;
    const { gun, bones } = group.userData.character;
    const motion = { reset: true, delta: 0, speed: 0, pitch: .2, grounded: true };
    updateCharacter(group, motion);
    const restingHead = bones.Head.quaternion.clone();
    updateCharacter(group, { ...motion, celebration: .3 });
    group.updateMatrixWorld(true);
    assert.ok(bones.Head.quaternion.angleTo(restingHead) > .01, `${id} celebration needs a visible pose`);
    const forward = new Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
    const expected = new Vector3(-Math.sin(.4) * Math.cos(.2), Math.sin(.2), -Math.cos(.4) * Math.cos(.2));
    assert.ok(forward.distanceTo(expected) < .00001, `${id} celebration changed weapon aim`);
    for (const [side, anchor] of [['Right', 'grip'], ['Left', 'support']]) {
      const palm = bones[`${side}Hand`].localToWorld(new Vector3(...group.userData.handGrips[`${side}Hand`].localPalmOffset));
      const socket = gun.localToWorld(new Vector3(...gun.userData.anchors[anchor]));
      assert.ok(palm.distanceTo(socket) < .001, `${id} celebration detached a hand`);
    }
    assert.deepEqual(group.position.toArray(), [4, 2, -6]);
    assert.equal(group.rotation.y, .4);
    for (const interrupt of [{ speed: 3 }, { grounded: false }, { crouching: true }, { sliding: true }, { reloading: true }, { firing: true }, { celebration: NaN }, { celebration: 1 }]) {
      updateCharacter(group, { ...motion, celebration: .3, ...interrupt });
      assert.ok(Math.abs(bones.Head.rotation.y) < .000001 && Math.abs(bones.Head.rotation.z) < .000001, `${id} retained a celebration after interrupt`);
    }
    updateCharacter(group, motion);
    assert.ok(bones.Head.quaternion.angleTo(restingHead) < .000001, `${id} did not return to its ordinary pose`);
    disposeModel(group);
  }
});

test('class powers have distinct active body poses with supported weapons and unchanged network roots', () => {
  const remaining = { assault: getPower('assault').duration - .15, sniper: 3.8, scout: .09, heavy: 3.5 };
  for (const id of classIds) {
    const group = createAvatar(undefined, id);
    group.position.set(4, 2, -6); group.rotation.y = .4;
    const rig = group.userData.character;
    const motion = { reset: true, delta: 0, grounded: id !== 'scout', pitch: .15, speed: 0 };
    updateCharacter(group, motion);
    const neutralChest = rig.bones.Chest.quaternion.clone();
    const neutralLeg = rig.bones.LeftLowerLeg.quaternion.clone();
    updateCharacter(group, { ...motion, abilityTime: remaining[id], abilitySeq: 1, shieldHealth: 120, dashX: -Math.sin(.4), dashZ: -Math.cos(.4), yaw: .4 });
    group.updateMatrixWorld(true);
    assert.ok(rig.bones.Chest.quaternion.angleTo(neutralChest) > .05, `${id} needs a visible activation/body gesture`);
    const forward = new Vector3(0, 0, -1).transformDirection(rig.gun.matrixWorld);
    if (id === 'scout' || id === 'heavy') assert.ok(forward.y < -.25, `${id} still holds its gun in the firing pose`);
    else {
      const expected = new Vector3(-Math.sin(.4) * Math.cos(.15), Math.sin(.15), -Math.cos(.4) * Math.cos(.15));
      assert.ok(forward.distanceTo(expected) < .00001, `${id} activation changes its live shot direction`);
    }
    for (const [side, anchor] of [['Right', 'grip'], ['Left', 'support']]) {
      const palm = rig.bones[`${side}Hand`].localToWorld(new Vector3(...group.userData.handGrips[`${side}Hand`].localPalmOffset));
      const socket = rig.gun.localToWorld(new Vector3(...rig.gun.userData.anchors[anchor]));
      if (id === 'heavy' && side === 'Left') assert.ok(palm.distanceTo(socket) > .15, 'Rook must release the fore-end to brace his shield');
      else assert.ok(palm.distanceTo(socket) < .001, `${id} ${side} grip detached`);
    }
    if (id === 'heavy') {
      const elbow = rig.bones.LeftForeArm.getWorldPosition(new Vector3());
      const wrist = rig.bones.LeftHand.getWorldPosition(new Vector3());
      assert.ok(wrist.y > elbow.y + .055, 'Rook must raise his left forearm behind the shield');
    }
    if (id === 'scout') assert.ok(rig.bones.LeftLowerLeg.quaternion.angleTo(neutralLeg) > .35, 'air juke must tuck the legs visibly');
    assert.deepEqual(group.position.toArray(), [4, 2, -6]);
    assert.equal(group.rotation.y, .4);
    assert.deepEqual(group.scale.toArray(), [1, 1, 1]);
    disposeModel(group);
  }
});

test('Dash banks into its actual burst direction and expired powers restore the ordinary rig', () => {
  const dash = createAvatar(undefined, 'scout');
  const pose = { reset: true, grounded: false, abilityTime: .09, abilitySeq: 1, yaw: 0, dashZ: 0 };
  updateCharacter(dash, { ...pose, dashX: 1 });
  const right = dash.userData.character.bones.Chest.rotation.z;
  updateCharacter(dash, { ...pose, dashX: -1 });
  const left = dash.userData.character.bones.Chest.rotation.z;
  assert.ok(right < -.12 && left > .12, 'left and right jukes need opposite athletic leans');
  disposeModel(dash);
  for (const id of classIds) {
    const reused = createAvatar(undefined, id), fresh = createAvatar(undefined, id);
    updateCharacter(reused, { reset: true, grounded: true, abilityTime: id === 'scout' ? .09 : id === 'assault' ? .5 : 3.8, shieldHealth: 120, dashX: 1, dashZ: 0, yaw: 0 });
    const ordinary = { reset: true, delta: 0, grounded: true, pitch: .2, abilityTime: 0, shieldHealth: 0 };
    updateCharacter(reused, ordinary); updateCharacter(fresh, ordinary);
    reused.updateMatrixWorld(true); fresh.updateMatrixWorld(true);
    for (const [name, bone] of Object.entries(reused.userData.character.bones)) {
      assert.ok(bone.position.distanceTo(fresh.userData.character.bones[name].position) < .000001, `${id} ${name} keeps a power offset`);
      assert.ok(bone.quaternion.angleTo(fresh.userData.character.bones[name].quaternion) < .000001, `${id} ${name} keeps a power rotation`);
    }
    disposeModel(reused); disposeModel(fresh);
  }
});

test('Ember tucks her knees on a strong launch while ordinary jumps and live weapon aim stay unchanged', () => {
  const group = createAvatar(undefined, 'assault');
  const { bones, gun } = group.userData.character;
  const motion = { reset: true, grounded: false, pitch: .25, delta: 0 };
  updateCharacter(group, motion);
  const ordinaryKnee = bones.LeftLowerLeg.quaternion.clone();
  const segmentLengths = ['Left', 'Right'].flatMap((side) => [
    bones[`${side}LowerLeg`].position.length(), bones[`${side}Foot`].position.length(),
  ]);
  updateCharacter(group, { ...motion, vy: 8.6 });
  assert.ok(bones.LeftLowerLeg.quaternion.angleTo(ordinaryKnee) < .000001, 'ordinary jump should keep its existing pose');
  updateCharacter(group, { ...motion, vy: 13 });
  group.updateMatrixWorld(true);
  assert.ok(bones.LeftLowerLeg.quaternion.angleTo(ordinaryKnee) > .35, 'strong launch needs a visible knee tuck');
  assert.ok(Math.abs(bones.LeftLowerLeg.rotation.x - bones.RightLowerLeg.rotation.x) > .2, 'launch tuck should be asymmetric');
  assert.deepEqual(['Left', 'Right'].flatMap((side) => [
    bones[`${side}LowerLeg`].position.length(), bones[`${side}Foot`].position.length(),
  ]), segmentLengths, 'launch pose must keep the leg lengths');
  const forward = new Vector3(0, 0, -1).transformDirection(gun.matrixWorld);
  assert.ok(forward.distanceTo(new Vector3(0, Math.sin(.25), -Math.cos(.25))) < .00001);
  updateCharacter(group, { ...motion, vy: -3 });
  assert.ok(bones.LeftLowerLeg.quaternion.angleTo(ordinaryKnee) < .000001, 'descending should leave the launch tuck');
  disposeModel(group);
});
