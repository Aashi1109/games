import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createHolographicSight } from './weapon-sight.js';

const names = { assault: 'ember', sniper: 'wisp', scout: 'dash', heavy: 'rook' };
const gunFits = {
  assault: {"scale": 1.65275955, "translation": [-0.086365992, -0.294256568, -0.523507564], "anchors": {"grip": [0.001973, -0.087662, 0.05], "support": [0.001671, -0.011635, -0.308649], "sight": [0.001321, 0.102406, -0.006194], "muzzle": [0.0, 0.0, -0.557128]}},
  sniper: {"scale": 2.064141463, "translation": [0.148961747, -0.390900569, 0.229580307], "anchors": {"grip": [-0.010638, -0.033804, 0.05], "support": [-0.003272, -0.015227, -0.288519], "sight": [-0.003685, 0.098301, 0.006653], "muzzle": [0.0, 0.0, -0.773388]}},
  scout: {"scale": 1.695833097, "translation": [-0.143587919, 0.233624712, -0.485883259], "anchors": {"grip": [-0.00075, -0.105542, 0.05], "support": [-0.000721, -0.012271, -0.256946], "sight": [-0.000679, 0.097958, 0.000821], "muzzle": [0.0, 0.0, -0.43394]}},
  heavy: {"scale": 1.823134834, "translation": [0.118014431, 0.199662697, 0.274245585], "anchors": {"grip": [-0.000174, -0.132148, 0.05], "support": [-0.000268, -0.035522, -0.343797], "sight": [0.000977, 0.097567, -0.048449], "muzzle": [0.0, 0.0, -0.637099]}},
};
const characters = new Map();
const guns = new Map();
const pending = new Map();
let defaultLoader;
const modelURLs = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, {
  character: new URL(`../output/models/tripo-runtime/${name}-character.glb`, import.meta.url).href,
  gun: new URL(`../output/models/tripo-runtime/${name}-gun.glb`, import.meta.url).href,
}]));
const atlasURLs = {
  'characters-color.png': new URL('../output/models/tripo-runtime/characters-color.png', import.meta.url).href,
  'characters-metallic-roughness.jpg': new URL('../output/models/tripo-runtime/characters-metallic-roughness.jpg', import.meta.url).href,
  'characters-normal.png': new URL('../output/models/tripo-runtime/characters-normal.png', import.meta.url).href,
  'guns-color.jpg': new URL('../output/models/tripo-runtime/guns-color.jpg', import.meta.url).href,
  'guns-metallic-roughness.jpg': new URL('../output/models/tripo-runtime/guns-metallic-roughness.jpg', import.meta.url).href,
  'guns-normal.png': new URL('../output/models/tripo-runtime/guns-normal.png', import.meta.url).href,
};
const modelClass = (classId) => Object.hasOwn(names, classId) ? classId : 'assault';

// Grasp centers measured on the actual gloves, in the unposed character mesh.
// Wrist origins alone are behind the fingers and do not describe a closed grip.
const handFits = {
  assault: { right: [.051, 1.104, -.181], left: [-.152, .950, -.395], rotation: [-.300365, .332926, .054288, .892185] },
  sniper: { right: [.092, 1.110, -.189], left: [-.171, .867, -.463], rotation: [-.316906, .288056, .055217, .901968] },
  scout: { right: [.169, 1.058, -.310], left: [.024, .947, -.495], rotation: [-.259897, .215089, .054495, .939798] },
  heavy: { right: [.051, .977, -.302], left: [-.213, .886, -.180], rotation: [-.267258, .328367, .044310, .904867] },
};

// Only requested classes are decoded. Geometry and the shared texture atlases
// remain cached; every player still receives an independent skeleton.
export function loadGameModels(classId = 'assault', loader) {
  const id = modelClass(classId);
  return Promise.all([
    loadModel(id, 'character', loader),
    loadModel(id, 'gun', loader),
  ]).then(() => undefined);
}

export function hasGameModels(classId = 'assault') {
  const id = modelClass(classId);
  return characters.has(id) && guns.has(id);
}

function getDefaultLoader() {
  if (defaultLoader) return defaultLoader;
  const manager = new THREE.LoadingManager();
  // Vite fingerprints image assets; glTF image URIs retain their original names.
  manager.setURLModifier((url) => atlasURLs[url.slice(url.lastIndexOf('/') + 1)] || url);
  const textures = new Map();
  defaultLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  defaultLoader.register((parser) => {
    parser.textureLoader = new THREE.TextureLoader(manager);
    const loadTexture = parser.loadTexture.bind(parser);
    parser.loadTexture = (index) => {
      const definition = parser.json.textures[index];
      const source = parser.json.images[definition.source];
      if (!source.uri) return loadTexture(index);
      const key = `${source.uri}:${JSON.stringify(parser.json.samplers?.[definition.sampler] || {})}`;
      if (!textures.has(key)) {
        textures.set(key, loadTexture(index).then((texture) => {
          if (!texture) throw new Error(`Could not load model texture: ${source.uri}`);
          return texture;
        }).catch((error) => {
          textures.delete(key);
          throw error;
        }));
      }
      return textures.get(key);
    };
    return { name: 'drift-image-decoding' };
  });
  return defaultLoader;
}

function loadModel(id, kind, loader) {
  const cache = kind === 'character' ? characters : guns;
  if (cache.has(id)) return Promise.resolve();
  const key = `${id}:${kind}`;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const gltf = await (loader || getDefaultLoader()).loadAsync(modelURLs[id][kind]);
    const name = `${names[id]}${kind === 'gun' ? '-gun' : ''}`;
    const source = gltf.scene.getObjectByName(name);
    if (!source || (kind === 'gun' && !source.isMesh)) throw new Error(`Missing model: ${name}`);
    cache.set(id, kind === 'character' ? prepareCharacter(source, name) : prepareGun(source, id));
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function prepareCharacter(body, name) {
  body.traverse((part) => {
    if (!part.isMesh) return;
    if (!part.isSkinnedMesh || !part.material.map) throw new Error(`Invalid rig: ${name}`);
    part.userData.sharedModel = true;
    part.castShadow = true;
    part.receiveShadow = true;
    // A conservative animated bound avoids CPU skinning every frame.
    part.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, 0), 1.45);
    const positions = part.geometry.attributes.position;
    const sole = [];
    // Sample heel/toe support angles and the lowest point in each sole cell.
    // This includes raised bind-pose heels without skinning the full body.
    for (const sign of [-1, 1]) {
      const foot = [];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = positions.getZ(i);
        if (positions.getY(i) > .16 || x * sign < 0) continue;
        foot.push(i);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      if (!foot.length) continue;
      for (let angle = 0; angle <= 16; angle++) {
        const theta = -Math.PI / 2 + angle * Math.PI / 16;
        let best = -Infinity, chosen = -1;
        for (const i of foot) {
          const support = -positions.getY(i) * Math.cos(theta) + positions.getZ(i) * Math.sin(theta);
          if (support > best) { best = support; chosen = i; }
        }
        sole.push(chosen);
      }
      const cells = new Map();
      for (const i of foot) {
        const x = Math.min(3, Math.floor(4 * (positions.getX(i) - minX) / (maxX - minX || 1)));
        const z = Math.min(7, Math.floor(8 * (positions.getZ(i) - minZ) / (maxZ - minZ || 1)));
        const key = x * 8 + z, previous = cells.get(key);
        if (previous === undefined || positions.getY(i) < positions.getY(previous)) cells.set(key, i);
      }
      sole.push(...cells.values());
    }
    part.geometry.userData.soleVertices = [...new Set(sole)];
  });
  return body;
}

function prepareGun(source, id) {
  source.updateWorldMatrix(true, false);
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
  const fit = gunFits[id];
  geometry.scale(fit.scale, fit.scale, fit.scale);
  geometry.translate(...fit.translation);
  // Lower the imported backup irons into their mounts when fitting the holo.
  // Work on this cached runtime copy; the source GLBs, UVs and topology stay intact.
  const ironSights = {
    assault: [[.075, .022, -.03, .025], [.055, .025, -.41, -.36]],
    scout: [[.071, .02, -.015, .025], [.055, .025, -.34, -.29]],
  }[id];
  if (ironSights) {
    const positions = geometry.attributes.position;
    for (const [baseY, halfWidth, minZ, maxZ] of ironSights) {
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (Math.abs(x) <= halfWidth && y > baseY && z >= minZ && z <= maxZ) {
          positions.setY(i, baseY + (y - baseY) * .08);
        }
      }
    }
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3), 3));
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.name = source.name;
  mesh.userData.sharedModel = true;
  const sight = createHolographicSight(id, fit.anchors.sight);
  mesh.add(sight);
  mesh.userData.anchors = { ...fit.anchors, sight: [...sight.userData.sight] };
  return mesh;
}

export function createGun(classId = 'assault') {
  const template = guns.get(modelClass(classId));
  if (!template) throw new Error('Load game models before creating weapons.');
  const gun = template.clone();
  gun.castShadow = true;
  gun.receiveShadow = true;
  return gun;
}

export function createRiggedCharacter(classId = 'assault') {
  const id = modelClass(classId);
  const template = characters.get(id);
  if (!template) throw new Error('Load game models before creating characters.');
  const group = clone(template);
  const bones = {};
  group.traverse((part) => { if (part.isBone) bones[part.name.split('_').at(-1)] = part; });
  const gun = createGun(id);
  // Fit the stock against the shoulder front, with a closer fore-end hold.
  // These are world-only adjustments; first-person guns retain their full size.
  gun.scale.setScalar(id === 'heavy' ? .8 : .85);
  gun.position.set(id === 'heavy' ? -.025 : .07, 1.31, (id === 'heavy' ? -.14 : -.08) - gun.geometry.boundingBox.max.z * gun.scale.x);
  gun.userData.anchors.support = [...gun.userData.anchors.support];
  gun.userData.anchors.support[2] = id === 'heavy' ? -.10 : -.18;
  const fit = handFits[id];
  for (const side of ['Left', 'Right']) {
    const palm = new THREE.Vector3(...fit[side.toLowerCase()]);
    const wrist = new THREE.Vector3(...group.userData.restJointPositions[`${side}Hand`]);
    group.userData.handGrips[`${side}Hand`].palmCenter = palm.toArray();
    group.userData.handGrips[`${side}Hand`].localPalmOffset = palm.sub(wrist).toArray();
  }
  group.add(gun);
  group.updateMatrixWorld(true);
  poseCharacterArms({ bones, gun, palms: group.userData.handGrips, joints: group.userData.restJointPositions,
    handRotation: new THREE.Quaternion(...fit.rotation).normalize().invert() });
  // A runtime-only parent lets arms and gun finish steep aim without folding
  // the torso. It adds no skin influence: the original skeleton still has 19.
  const aim = new THREE.Bone();
  aim.name = 'weapon-aim';
  // Pivot at the held grip: rotating about the shoulders would swing a rifle
  // behind the waist when aiming almost vertically downward.
  aim.position.copy(bones.Chest.worldToLocal(gun.localToWorld(new THREE.Vector3(...gun.userData.anchors.grip))));
  bones.Chest.add(aim);
  aim.attach(bones.LeftShoulder);
  aim.attach(bones.RightShoulder);
  aim.attach(gun);
  let body;
  group.traverse((part) => { if (part.isSkinnedMesh) body = part; });
  group.userData.character = {
    kind: 'runner', classId: id, bones, upper: bones.Chest, head: bones.Head,
    arms: [bones.LeftUpperArm, bones.RightUpperArm],
    legs: [bones.LeftUpperLeg, bones.RightUpperLeg],
    phase: 0, stride: 0, hipsY: bones.Hips.position.y, body, gun, aim,
  };
  return group;
}

export function createViewArms(classId = 'assault') {
  const group = createRiggedCharacter(classId);
  const { body, gun, bones } = group.userData.character;
  const rest = group.userData.restJointPositions;
  gun.userData.anchors = structuredClone(guns.get(modelClass(classId)).userData.anchors);
  gun.scale.setScalar(1);
  gun.updateWorldMatrix(true, true);
  // Bend the elbows below the camera, with forearms reaching forward to the
  // grips. A straight shoulder/elbow/wrist chain reads as a long sleeve slab.
  for (const side of ['Left', 'Right']) {
    const upper = bones[`${side}UpperArm`], forearm = bones[`${side}ForeArm`], hand = bones[`${side}Hand`];
    const oldShoulder = new THREE.Vector3(...rest[`${side}UpperArm`]);
    const oldElbow = new THREE.Vector3(...rest[`${side}ForeArm`]);
    const oldWrist = new THREE.Vector3(...rest[`${side}Hand`]);
    const handRotation = hand.getWorldQuaternion(new THREE.Quaternion());
    if (classId === 'heavy' && side === 'Left') {
      handRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2));
    }
    const palmOffset = new THREE.Vector3(...group.userData.handGrips[`${side}Hand`].localPalmOffset).applyQuaternion(handRotation);
    const target = gun.localToWorld(new THREE.Vector3(...gun.userData.anchors[side === 'Right' ? 'grip' : 'support']));
    const wrist = target.sub(palmOffset);
    const direction = new THREE.Vector3(side === 'Left' ? .45 : -.35, side === 'Left' ? .2 : .35, -.87).normalize();
    const elbow = wrist.clone().addScaledVector(direction, -oldElbow.distanceTo(oldWrist));
    const shoulderDirection = side === 'Left' ? new THREE.Vector3(-.5, -.65, .57) : new THREE.Vector3(.6, -.8, .1);
    const shoulder = elbow.clone().addScaledVector(shoulderDirection.normalize(), oldShoulder.distanceTo(oldElbow));
    // Carry the glove's roll through the sleeve, then add only the bend needed
    // to reach the elbow. Independent shortest-arc rotations can twist a cuff.
    const forearmRotation = new THREE.Quaternion().setFromUnitVectors(
      oldWrist.clone().sub(oldElbow).normalize().applyQuaternion(handRotation), direction,
    ).multiply(handRotation);
    const upperRotation = new THREE.Quaternion().setFromUnitVectors(
      oldElbow.clone().sub(oldShoulder).normalize().applyQuaternion(forearmRotation), elbow.clone().sub(shoulder).normalize(),
    ).multiply(forearmRotation);
    upper.position.copy(upper.parent.worldToLocal(shoulder));
    upper.quaternion.copy(upper.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(upperRotation));
    forearm.quaternion.copy(upperRotation.invert().multiply(forearmRotation));
    hand.quaternion.copy(forearmRotation.invert().multiply(handRotation));
    upper.updateWorldMatrix(true, true);
  }
  const source = body.geometry;
  const weights = source.attributes.skinWeight, joints = source.attributes.skinIndex;
  const armBones = body.skeleton.bones.map((bone) => /(?:UpperArm|ForeArm|Hand)$/.test(bone.name));
  const armWeight = new Float32Array(weights.count);
  for (let i = 0; i < weights.count; i++) for (let k = 0; k < 4; k++) {
    if (armBones[joints.getComponent(i, k)]) armWeight[i] += weights.getComponent(i, k);
  }
  const vertices = [], indices = [], remap = new Map();
  for (let i = 0; i < source.index.count; i += 3) {
    const triangle = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)];
    if (triangle.some((vertex) => armWeight[vertex] < .6)) continue;
    for (const vertex of triangle) {
      if (!remap.has(vertex)) { remap.set(vertex, vertices.length); vertices.push(vertex); }
      indices.push(remap.get(vertex));
    }
  }
  // Blended weights can include small, disconnected pieces of the vest. Keep
  // the two continuous arms, welding UV seams only for this component check.
  const parents = vertices.map((_, index) => index), welded = new Map();
  const find = (index) => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  const positions = source.attributes.position;
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    const key = [positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex)].map((value) => value.toFixed(5)).join(',');
    if (welded.has(key)) parents[i] = welded.get(key); else welded.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]);
    parents[find(indices[i + 1])] = root; parents[find(indices[i + 2])] = root;
  }
  const sizes = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]); sizes.set(root, (sizes.get(root) || 0) + 1);
  }
  const arms = new Set([...sizes].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([root]) => root));
  const armIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (arms.has(find(indices[i]))) armIndices.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  // Own compact vertex buffers so releasing a viewmodel never touches the body.
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const original = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : attribute.itemSize;
    const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
    const values = new original.constructor(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) for (let k = 0; k < attribute.itemSize; k++) {
      values[i * attribute.itemSize + k] = original[vertices[i] * stride + offset + k];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  // The detached view arms have no torso to blend toward. Renormalize the
  // shoulder transition onto the arm bones to prevent floating sleeve wedges.
  const viewWeights = geometry.attributes.skinWeight, viewJoints = geometry.attributes.skinIndex;
  for (let i = 0; i < viewWeights.count; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      if (!armBones[viewJoints.getComponent(i, k)]) viewWeights.setComponent(i, k, 0);
      sum += viewWeights.getComponent(i, k);
    }
    for (let k = 0; k < 4; k++) viewWeights.setComponent(i, k, viewWeights.getComponent(i, k) / sum);
  }
  geometry.setIndex(armIndices);
  if (modelClass(classId) === 'sniper') {
    // Two vest-contact patches survived on Wisp's inner sleeve. Fit them to the
    // posed forearm: the mixed elbow weights make a bind-pose trim protrude.
    const position = geometry.attributes.position, uv = geometry.attributes.uv;
    group.updateMatrixWorld(true);
    const elbow = bones.LeftForeArm.getWorldPosition(new THREE.Vector3());
    const axis = bones.LeftHand.getWorldPosition(new THREE.Vector3()).sub(elbow).normalize();
    const boneMatrices = body.skeleton.bones.map((bone, i) => bone.matrixWorld.clone().multiply(body.skeleton.boneInverses[i]));
    const skinMatrix = (i) => {
      const matrix = new THREE.Matrix4();
      matrix.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const weight = viewWeights.getComponent(i, k);
        const bone = boneMatrices[viewJoints.getComponent(i, k)].elements;
        for (let n = 0; n < 16; n++) matrix.elements[n] += bone[n] * weight;
      }
      matrix.elements[15] = 1;
      return matrix.multiply(body.bindMatrix).premultiply(body.bindMatrixInverse).premultiply(body.matrixWorld);
    };
    const point = new THREE.Vector3(), radial = new THREE.Vector3();
    const corrections = new Map();
    const key = (i) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (!((u >= .519 && u <= .570 && v >= .2829 && v <= .323)
        || (u >= .0046 && u <= .0318 && v >= .8723 && v <= .8924))) continue;
      point.fromBufferAttribute(position, i);
      if (point.x < -.278 || point.x > -.182 || point.y < .991 || point.y > 1.149
        || point.z < -.204 || point.z > -.069) continue;
      point.applyMatrix4(skinMatrix(i));
      radial.copy(point).sub(elbow);
      radial.addScaledVector(axis, -radial.dot(axis));
      const radius = radial.length();
      if (radius > .05) corrections.set(key(i), point.clone().addScaledVector(radial, .05 / radius - 1));
    }
    // All seam/cap copies share the same posed target. Undo each vertex's own
    // weighted transform so differing weights cannot split that seam again.
    for (let i = 0; i < position.count; i++) {
      const correction = corrections.get(key(i));
      if (correction) {
        point.copy(correction).applyMatrix4(skinMatrix(i).invert());
        position.setXYZ(i, point.x, point.y, point.z);
      }
    }
  }
  // Continue only the upper sleeves beyond the camera's lower edge. The body
  // mesh was cut at its shoulders; showing those cut ends makes arms float.
  // Forearms, gloves, bones and grip anchors keep their original dimensions.
  const viewPosition = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (const side of ['Left', 'Right']) {
    const elbow = new THREE.Vector3(...rest[`${side}ForeArm`]);
    const axis = new THREE.Vector3(...rest[`${side}UpperArm`]).sub(elbow);
    const length = axis.length();
    axis.normalize();
    const joint = body.skeleton.bones.indexOf(bones[`${side}UpperArm`]);
    for (let i = 0; i < viewPosition.count; i++) {
      let influence = 0;
      for (let k = 0; k < 4; k++) if (viewJoints.getComponent(i, k) === joint) influence += viewWeights.getComponent(i, k);
      if (influence <= .5) continue;
      point.fromBufferAttribute(viewPosition, i).sub(elbow);
      const extension = .2 * THREE.MathUtils.smoothstep(point.dot(axis) / (length * .75), 0, 1)
        * THREE.MathUtils.smoothstep(influence, .5, .9);
      point.add(elbow).addScaledVector(axis, extension);
      viewPosition.setXYZ(i, point.x, point.y, point.z);
    }
  }
  // Source normals are quantized; regenerated normals need float accumulation.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(viewPosition.count * 3), 3));
  geometry.computeVertexNormals();
  body.geometry = geometry;
  body.name = 'first-person-hands';
  group.updateMatrixWorld(true);
  group.applyMatrix4(gun.matrixWorld.clone().invert());
  gun.removeFromParent();
  group.userData.character.gun = null;
  group.name = 'first-person-arms';
  return group;
}

// Solve the elbow/wrist chain separately from the glove's grasp orientation.
export function poseCharacterArms({ bones, gun, palms, joints, handRotation }) {
  for (const side of ['Left', 'Right']) {
    const upper = bones[`${side}UpperArm`];
    const forearm = bones[`${side}ForeArm`];
    const hand = bones[`${side}Hand`];
    const shoulder = new THREE.Vector3(...joints[`${side}UpperArm`]);
    const restElbow = new THREE.Vector3(...joints[`${side}ForeArm`]);
    const restWrist = new THREE.Vector3(...joints[`${side}Hand`]);
    const restUpper = restElbow.clone().sub(shoulder);
    const restForearm = restWrist.clone().sub(restElbow);
    const firstLength = restUpper.length(), secondLength = restForearm.length();
    const target = gun.localToWorld(new THREE.Vector3(...gun.userData.anchors[side === 'Right' ? 'grip' : 'support']));
    target.sub(new THREE.Vector3(...palms[`${side}Hand`].localPalmOffset).applyQuaternion(handRotation));
    const direction = target.clone().sub(shoulder);
    const distance = direction.length();
    if (distance >= firstLength + secondLength || distance <= Math.abs(firstLength - secondLength)) {
      throw new Error(`Weapon palm is outside ${side.toLowerCase()} arm reach (${distance.toFixed(3)} / ${(firstLength + secondLength).toFixed(3)}).`);
    }
    direction.normalize();
    // Keep elbows on the source pose's downward/outward side of the aim axis.
    const pole = restUpper.clone().addScaledVector(direction, -restUpper.dot(direction)).normalize();
    const along = (firstLength ** 2 - secondLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstLength ** 2 - along ** 2));
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, height);
    const upperWorld = new THREE.Quaternion().setFromUnitVectors(restUpper.normalize(), elbow.clone().sub(shoulder).normalize());
    const forearmWorld = new THREE.Quaternion().setFromUnitVectors(restForearm.normalize(), target.clone().sub(elbow).normalize());
    upper.quaternion.copy(upper.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(upperWorld));
    forearm.quaternion.copy(upperWorld.clone().invert().multiply(forearmWorld));
    hand.quaternion.copy(forearmWorld.clone().invert().multiply(handRotation));
    upper.updateWorldMatrix(true, true);
  }
}

// Shared meshes survive class changes, portrait renders and disconnected players.
// Labels, practice drones and each avatar's GPU bone texture remain independently owned.
export function disposeModel(group) {
  const skeletons = new Set();
  group.traverse((part) => {
    if (part.skeleton) skeletons.add(part.skeleton);
    if (part.userData.sharedModel) return;
    part.geometry?.dispose();
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      material?.map?.dispose();
      material?.dispose();
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  group.removeFromParent();
}
