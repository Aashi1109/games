import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Scene, Vector3 } from 'three';
import { createPowerEffects } from '../client/power-effects.ts';
import { createAvatar } from '../client/characters.ts';
import { disposeModel } from '../client/game-models.ts';
import { getPower } from '../shared/powers.ts';
import { loadTestGameModels } from './helpers/game-models.js';

const rook = { id: 'rook', classId: 'heavy', health: 100, x: 4, y: 2, z: 3, yaw: Math.PI / 2, abilityTime: 2, shieldHealth: 100 };
const echo = { id: 'wisp:1:1', type: 'echo', owner: 'wisp', classId: 'sniper', x: 1, y: 0, z: 2, yaw: .2, vx: 3, vz: 0, remaining: 3 };
const meshes = (object) => { const result = []; object.traverse((part) => { if (part.isMesh) result.push(part); }); return result; };
const visible = (object) => { let shown = true; object.traverseAncestors((part) => { shown &&= part.visible; }); return shown && object.visible; };

test('Echo waits for the existing class model and appears after it loads', async () => {
  const scene = new Scene();
  let requested = 0;
  const effects = createPowerEffects(scene, { requestClassModels: (id) => { assert.equal(id, 'sniper'); requested++; } });
  effects.sync({ effects: [echo] });
  assert.equal(scene.getObjectByName(`echo:${echo.id}`), undefined);
  assert.equal(requested, 1);
  effects.update(.05, .1);
  assert.equal(requested, 1, 'model requests should be throttled');
  await loadTestGameModels();
  effects.update(.05, .2);
  const ghost = scene.getObjectByName(`echo:${echo.id}`);
  assert.ok(ghost && visible(ghost));
  effects.dispose();
});

test('shield cover matches server dimensions and follows the predicted local player', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  effects.sync({ players: [rook], effects: [] }, rook.id);
  effects.update(1 / 60, 1, { localPlayer: rook });
  const shield = scene.getObjectByName('shield:rook');
  assert.ok(shield && visible(shield));
  const power = getPower('heavy'), box = new Box3().setFromObject(shield);
  assert.ok(Math.abs(box.min.y - (rook.y + .1)) < .001);
  assert.ok(Math.abs(box.max.y - (rook.y + .1 + power.shieldHeight)) < .001);
  assert.ok(Math.abs(box.getSize(new Vector3()).z - power.shieldWidth) < .001);
  assert.ok(Math.abs(shield.position.x - (rook.x - power.shieldOffset)) < .001);
  const panel = meshes(shield)[0], opacity = panel.material.opacity;
  const impact = shield.localToWorld(new Vector3(.35, .25, 0));
  effects.event({ type: 'shot', shieldHit: rook.id, to: impact });
  effects.update(1 / 60, 1.1, { localPlayer: rook });
  assert.ok(panel.material.opacity > opacity, 'blocked shots should visibly flash the shield');
  assert.ok(panel.material.isShaderMaterial, 'shield needs its patterned energy surface');
  assert.ok(Math.abs(panel.material.uniforms.uImpact.value.x - (.5 + .35 / power.shieldWidth)) < .001);
  assert.ok(Math.abs(panel.material.uniforms.uImpact.value.y - (.5 + .25 / power.shieldHeight)) < .001);
  effects.update(1 / 60, 2, { localPlayer: { ...rook, x: 8 } });
  assert.ok(Math.abs(shield.position.x - (8 - power.shieldOffset)) < .001);
  effects.update(1 / 60, 3, { localPlayer: { ...rook, abilityTime: 0 } });
  assert.equal(visible(shield), false);
  effects.dispose();
});

test('supplying a local preview state without a local id does not duplicate its existing shield', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  effects.sync({ players: [rook] });
  effects.update(.02, 1, { localPlayer: rook });
  const shields = []; scene.traverse((part) => { if (part.name.startsWith('shield:') && visible(part)) shields.push(part); });
  assert.equal(shields.length, 1);
  effects.dispose();
});

test('Echo animates an independent skeleton without recoloring or disposing real players', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const real = createAvatar(undefined, 'sniper');
  const realBody = meshes(real).find((part) => part.isSkinnedMesh);
  const material = realBody.material;
  let sharedDisposals = 0;
  for (const resource of [realBody.geometry, material, material.map]) resource.addEventListener('dispose', () => sharedDisposals++);
  effects.sync({ effects: [echo] });
  const ghost = scene.getObjectByName(`echo:${echo.id}`);
  const ghostBody = meshes(ghost).find((part) => part.isSkinnedMesh);
  assert.equal(ghostBody.geometry, realBody.geometry);
  assert.notEqual(ghostBody.skeleton, realBody.skeleton);
  assert.notEqual(ghostBody.material, material);
  assert.ok(ghostBody.material.isShaderMaterial, 'Echo should have its own scan/rim material');
  assert.equal(ghostBody.material.uniforms.uMap.value, material.map, 'reuse the existing atlas for face and clothing detail');
  assert.ok(ghostBody.material.transparent && ghostBody.material.opacity < 1);
  const leg = ghost.userData.character.bones.LeftUpperLeg;
  const start = leg.quaternion.clone();
  effects.update(.05, 1, {});
  assert.ok(leg.quaternion.angleTo(start) > .001, 'moving Echo legs must animate');
  assert.equal(realBody.material, material);
  assert.equal(material.transparent, false);
  effects.sync({ effects: [] });
  effects.update(.1, 1.1);
  assert.ok(ghostBody.material.uniforms.uDissolve.value > 0, 'a disappearing Echo should visibly dissolve');
  for (let index = 0; index < 4; index++) effects.update(.1, 1.2 + index / 10);
  assert.equal(visible(ghost), false);
  effects.dispose();
  assert.equal(sharedDisposals, 0);
  disposeModel(real);
});

test('effects stay bounded, expire, clear on round changes and dispose owned resources', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const dash = { id: 'dash', classId: 'scout', health: 100, x: 1, y: 0, z: 2, vx: 18, vz: 0, yaw: 0, dashX: 1, dashZ: 0, abilityTime: .18, grounded: true };
  effects.sync({ players: [rook, dash], effects: [{ id: 'puck', type: 'blast', owner: 'ember', x: 1, y: 0, z: 2, vx: 0, vy: 0, vz: 0, remaining: .5 }] });
  const root = scene.getObjectByName('power-effects');
  assert.ok(visible(scene.getObjectByName('blast:puck')));
  assert.ok(scene.getObjectByName('blast:puck').getObjectByName('blast-warning'), 'the live puck needs a fuse warning');
  const before = meshes(root).length;
  for (let i = 0; i < 200; i++) {
    effects.event({ type: 'power', action: 'pop', powerId: 'blast-pop', owner: 'ember', life: 1, abilitySeq: i, x: 1, y: 0, z: 2 });
    effects.event({ type: 'power', action: 'activate', powerId: 'air-juke', owner: 'dash', life: 1, abilitySeq: i, x: 1, y: 0, z: 2 });
  }
  assert.equal(meshes(root).length, before, 'bursts must reuse a fixed pool');
  assert.ok(before < 150);
  effects.sync({ players: [], effects: [] });
  for (let i = 0; i < 20; i++) effects.update(.1, 1 + i / 10, { quality: 'low', motion: false });
  assert.equal(meshes(root).filter(visible).length, 0);
  effects.event({ type: 'power', action: 'pop', powerId: 'blast-pop', x: 1, y: 0, z: 2 });
  effects.clear();
  assert.equal(meshes(root).filter(visible).length, 0);
  const resources = new Set();
  root.traverse((part) => { if (part.geometry && !part.userData.sharedModel) resources.add(part.geometry); if (part.material) resources.add(part.material); });
  const disposals = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) || 0) + 1));
  effects.dispose();
  assert.equal(root.parent, null);
  for (const resource of resources) assert.equal(disposals.get(resource), 1, 'owned GPU resources should be disposed exactly once');
  effects.dispose();
  for (const resource of resources) assert.equal(disposals.get(resource), 1, 'disposal should be idempotent');
});

test('Dash leaves posed character snapshots with a global quality cap, not cuboid rods', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const dash = { id: 'dash', classId: 'scout', health: 100, x: 0, y: .3, z: 0, yaw: 0, vx: 18, vz: 0, dashX: 1, dashZ: 0, abilityTime: .18, grounded: false };
  effects.sync({ players: [dash] });
  const root = scene.getObjectByName('power-effects');
  const before = meshes(root).length;
  const activate = (seq) => effects.event({ type: 'power', action: 'activate', powerId: 'air-juke', owner: dash.id, life: 1, abilitySeq: seq, x: 0, y: .3, z: 0, yaw: 0, dashX: 1, dashZ: 0 });
  activate(1);
  effects.update(.06, .06, { localPlayer: { ...dash, x: 1 }, quality: 'balanced' });
  const ghosts = () => {
    const found = [];
    root.traverse((part) => { if (part.name.startsWith('dash-afterimage:') && visible(part)) found.push(part); });
    return found;
  };
  assert.equal(ghosts().length, 2);
  for (const ghost of ghosts()) {
    const { body, bones } = ghost.userData.character;
    assert.ok(body.isSkinnedMesh && body.material.isShaderMaterial);
    assert.ok(Math.abs(bones.LeftLowerLeg.rotation.x) > .1, 'snapshot should keep its bent action pose');
  }
  for (let index = 2; index < 40; index++) { activate(index); effects.update(.02, index / 50, { quality: 'balanced' }); }
  assert.ok(ghosts().length <= 4);
  assert.equal(meshes(root).length, before, 'repeated activations must reuse warmed snapshots and ribbons');
  effects.update(.01, 1, { quality: 'low', motion: false });
  assert.ok(ghosts().length <= 2);
  effects.clear();
  assert.equal(ghosts().length, 0);
  effects.dispose();
});

test('repeated network events do not replay bursts and invalid positions never enter the scene', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const event = { type: 'power', action: 'pop', powerId: 'blast-pop', owner: 'ember', life: 1, abilitySeq: 1, x: 0, y: 0, z: 0 };
  effects.event(event);
  const root = scene.getObjectByName('power-effects');
  const count = meshes(root).filter(visible).length;
  effects.event(event);
  effects.event({ ...event, abilitySeq: 2, x: NaN });
  assert.equal(meshes(root).filter(visible).length, count);
  root.updateMatrixWorld(true);
  root.traverse((part) => assert.ok(part.matrixWorld.elements.every(Number.isFinite)));
  effects.dispose();
});

test('a rejected predicted activation retires only its visuals and can reuse the sequence', async () => {
  await loadTestGameModels();
  const scene = new Scene(), effects = createPowerEffects(scene);
  const players = ['a', 'b'].map((id) => ({ id, life: 1, health: 100, classId: 'scout', x: 0, y: .2, z: 0, grounded: false, yaw: 0, vx: 18, vz: 0 }));
  effects.sync({ players });
  const activation = (owner) => ({ type: 'power', action: 'activate', powerId: 'air-juke', owner, life: 1, abilitySeq: 1, x: 0, y: .2, z: 0, dashX: 1, dashZ: 0 });
  effects.event(activation('a')); effects.event(activation('b'));
  const ghost = (id) => scene.getObjectByName(`dash-afterimage:${id}:1:0`);
  assert.ok(visible(ghost('a')) && visible(ghost('b')));
  effects.cancelActivation({ owner: 'a', life: 1, abilitySeq: 1 });
  assert.equal(visible(ghost('a')), false);
  assert.equal(visible(ghost('b')), true);
  effects.event(activation('a'));
  assert.ok(meshes(scene).some((part) => part.isSkinnedMesh && visible(part) && part.parent?.name.startsWith('dash-afterimage:a')));
  effects.sync({ players: players.map((player) => ({ ...player, health: player.id === 'a' ? 0 : 100 })) });
  const aGhosts = []; scene.traverse((part) => { if (part.name.startsWith('dash-afterimage:a:')) aGhosts.push(part); });
  assert.ok(aGhosts.every((part) => !visible(part)), 'death should retire that player\'s cast presentation');
  effects.dispose();
});

test('glitch and shatter finish cleanly while reduced motion keeps essential power silhouettes', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  effects.sync({ players: [rook], effects: [echo, { id: 'puck', type: 'blast', owner: 'ember', x: 0, y: .1, z: 0, remaining: .4 }] });
  effects.event({ type: 'power', action: 'pop', powerId: 'blast-pop', owner: 'ember', life: 1, abilitySeq: 1, x: 0, y: .1, z: 0 });
  effects.update(.05, 1, { quality: 'low', motion: false });
  const root = scene.getObjectByName('power-effects');
  assert.ok(visible(scene.getObjectByName('shield:rook')));
  assert.ok(visible(scene.getObjectByName('blast:puck')));
  const ghost = scene.getObjectByName(`echo:${echo.id}`);
  assert.ok(visible(ghost));
  assert.equal(ghost.userData.character.body.material.uniforms.uTime.value, 0);
  assert.ok(meshes(root).filter((part) => part.isInstancedMesh).every((part) => !visible(part)), 'reduced motion hides flying sparks');
  effects.sync({ players: [], effects: [] });
  effects.event({ type: 'power', action: 'glitch', powerId: 'echo', owner: 'wisp', life: 1, abilitySeq: 2, effectId: echo.id, x: 1, y: 0, z: 2 });
  effects.event({ type: 'power', action: 'shatter', powerId: 'bulwark', owner: 'rook', life: 1, abilitySeq: 3, x: 4, y: 2, z: 3, yaw: 1 });
  effects.update(.05, 1.05, { motion: true });
  assert.ok(meshes(root).some((part) => part.isInstancedMesh && visible(part)), 'breakups should emit their bounded shard meshes');
  for (const part of meshes(root).filter((part) => part.isInstancedMesh)) assert.ok(part.instanceMatrix.array.every(Number.isFinite));
  for (let i = 0; i < 8; i++) effects.update(.1, 1.1 + i / 10, { motion: true });
  assert.equal(meshes(root).filter(visible).length, 0);
  effects.dispose();
});

const ember = { id: 'ember', life: 1, classId: 'assault', health: 100, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, eyeHeight: 1.6, abilityCooldown: 0, ropeId: null };
const openMap = { size: 200, boxes: [] };

test('Blast aim reuses a bounded depth-tested arc matching the shared prediction', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const result = effects.setBlastAim(ember, openMap);
  assert.equal(result.status, 'ready');
  assert.ok(result.landed && result.distance > 5);
  const aim = scene.getObjectByName('blast-aim'), arc = aim.getObjectByName('blast-aim-arc');
  const marker = aim.getObjectByName('blast-aim-target'), radius = aim.getObjectByName('blast-aim-radius');
  assert.ok(visible(aim) && visible(radius));
  assert.ok(arc.isLineSegments2 && arc.material.isLineMaterial);
  assert.equal(arc.geometry.getAttribute('instanceStart').count, 127);
  assert.equal(arc.geometry.instanceCount, result.points.length - 1);
  assert.ok(result.points.length <= 128);
  assert.ok(new Vector3().fromBufferAttribute(arc.geometry.getAttribute('instanceStart'), 0).distanceTo(new Vector3().copy(result.points[0])) < 1e-5);
  assert.ok(new Vector3().fromBufferAttribute(arc.geometry.getAttribute('instanceEnd'), result.points.length - 2)
    .distanceTo(new Vector3().copy(result.points.at(-1))) < 1e-5);
  assert.equal(arc.material.linewidth, 2.5);
  assert.equal(arc.material.opacity, 1);
  assert.equal(arc.material.worldUnits, false);
  assert.equal(arc.material.color.getHexString(), 'ff7b24');
  assert.equal(radius.material.linewidth, 1.5);
  assert.equal(radius.material.opacity, .6);
  arc.onBeforeRender({ getViewport: (target) => target.set(0, 0, 1280, 720) });
  assert.deepEqual(arc.material.resolution.toArray(), [1280, 720]);
  assert.ok(marker.position.distanceTo(new Vector3().copy(result.landing)) < 1e-5);
  assert.equal(radius.scale.x, result.radius);
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(marker.quaternion).distanceTo(new Vector3().copy(result.normal)) < 1e-5);
  aim.traverse((part) => { if (part.material) { assert.equal(part.material.depthTest, true); assert.equal(part.material.depthWrite, false); } });
  effects.update(.02, 1, { quality: 'low', motion: false, localPlayer: ember });
  assert.ok(visible(aim), 'reduced motion must retain an accurate aim guide');
  effects.dispose();
});

test('Blast aim marks wall contact in its surface plane and flags unreachable surfaces', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const wallMap = { size: 200, boxes: [{ x: 0, y: 0, z: -5, w: 10, h: 8, d: 1 }] };
  const wall = effects.setBlastAim(ember, wallMap);
  const aim = scene.getObjectByName('blast-aim'), marker = aim.getObjectByName('blast-aim-target');
  assert.ok(wall.landed && wall.normal.z > .99);
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(marker.quaternion).distanceTo(new Vector3().copy(wall.normal)) < 1e-5);
  const failed = effects.setBlastAim({ ...ember, y: 300 }, openMap, true);
  assert.equal(failed.status, 'no-surface');
  assert.equal(failed.landed, false);
  assert.equal(visible(aim.getObjectByName('blast-aim-radius')), false);
  assert.ok(visible(marker), 'an unreachable endpoint still needs a red aim cue');
  const color = aim.getObjectByName('blast-aim-arc').material.color;
  assert.ok(color.r > color.g * 2, 'unreachable aim should be visibly red');
  effects.dispose();
});

test('Blast aim caches at 30 Hz, confirms fresh and immediately clears invalid states', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const first = effects.setBlastAim(ember, openMap);
  const aim = scene.getObjectByName('blast-aim'), arc = aim.getObjectByName('blast-aim-arc');
  const geometry = arc.geometry, positions = geometry.getAttribute('instanceStart'), distances = geometry.getAttribute('instanceDistanceStart');
  const moved = { ...ember, x: 1, pitch: .3 };
  assert.equal(effects.setBlastAim(ember, openMap), first);
  assert.equal(effects.setBlastAim(moved, openMap), first, 'movement recomputation is throttled between frames');
  const confirmed = effects.setBlastAim(moved, openMap, true);
  assert.notEqual(confirmed, first, 'confirmation must use the current aim');
  assert.ok(Math.abs(confirmed.points[0].x - 1) < 1e-5);
  effects.update(.04, .04);
  assert.notEqual(effects.setBlastAim(ember, openMap), confirmed);
  for (let index = 0; index < 40; index++) effects.setBlastAim({ ...ember, yaw: index / 10 }, openMap, true);
  assert.equal(arc.geometry, geometry);
  assert.equal(arc.geometry.getAttribute('instanceStart'), positions);
  assert.equal(arc.geometry.getAttribute('instanceDistanceStart'), distances);
  assert.ok(positions.data.array.every(Number.isFinite) && distances.data.array.every(Number.isFinite));
  for (const invalid of [null, { ...ember, health: 0 }, { ...ember, classId: 'scout' }, { ...ember, ropeId: 'zip' },
    { ...ember, abilityCooldown: 1 }, { ...ember, x: NaN }, { ...ember, pitch: NaN }]) {
    effects.setBlastAim(ember, openMap, true);
    assert.equal(effects.setBlastAim(invalid, openMap), null);
    assert.equal(visible(aim), false);
  }
  effects.setBlastAim(ember, openMap, true);
  effects.update(.02, 1, { localPlayer: { ...ember, life: 2 } });
  assert.equal(visible(aim), false, 'a new life must not inherit the previous aim');
  effects.setBlastAim(ember, openMap, true);
  effects.sync({ players: [{ ...ember, health: 0 }] }, ember.id);
  assert.equal(visible(aim), false, 'an authoritative death must clear the guide');
  effects.setBlastAim(ember, openMap, true);
  effects.clear();
  assert.equal(visible(aim), false);
  effects.dispose();
  assert.equal(effects.setBlastAim(ember, openMap), null);
});

test('puck fuse buildup starts after flight and surface attachment follows the contact normal', () => {
  const scene = new Scene(), effects = createPowerEffects(scene);
  const puck = { id: 'attached-puck', type: 'blast', owner: 'ember', x: 0, y: 2, z: -4.4,
    remaining: 2, flightRemaining: 1.35, landed: false, normal: null };
  effects.sync({ effects: [puck] });
  effects.update(.1, .1);
  const object = scene.getObjectByName('blast:attached-puck'), warning = object.getObjectByName('blast-warning');
  assert.equal(warning.material.uniforms.uProgress.value, 0, 'airborne travel is not the fuse');
  effects.sync({ effects: [{ ...puck, landed: true, normal: { x: 0, y: 0, z: 1 }, remaining: .5 }] });
  effects.update(.05, .15);
  assert.ok(warning.material.uniforms.uProgress.value > .2);
  assert.ok(new Vector3(0, 1, 0).applyQuaternion(object.quaternion).distanceTo(new Vector3(0, 0, 1)) < 1e-5);
  effects.sync({ effects: [{ ...puck, flightRemaining: 0, remaining: .5 }] });
  effects.update(.05, .2);
  assert.ok(warning.material.uniforms.uProgress.value > .2, 'the bounded airborne fallback still needs its warning');
  effects.dispose();
});
