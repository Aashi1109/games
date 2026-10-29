import type { ClassId } from '../shared/classes.ts';
import { isClassId } from '../shared/classes.ts';
import type {
  GunMesh,
  GunAnchors,
  RiggedGroup,
  CharacterData,
  BoneMap,
  Tuple3,
  Tuple4,
} from './render-types.ts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createHolographicSight } from './weapon-sight.ts';

const names = {
  assault: 'ember',
  sniper: 'wisp',
  scout: 'dash',
  heavy: 'rook',
};
const gunFits: Record<
  ClassId,
  { scale: number; translation: Tuple3; anchors: GunAnchors }
> = {
  assault: {
    scale: 1.65275955,
    translation: [-0.086365992, -0.294256568, -0.523507564],
    anchors: {
      grip: [0.001973, -0.087662, 0.05],
      support: [0.001671, -0.011635, -0.308649],
      sight: [0.001321, 0.102406, -0.006194],
      muzzle: [0.0, 0.0, -0.557128],
    },
  },
  sniper: {
    scale: 2.064141463,
    translation: [0.148961747, -0.390900569, 0.229580307],
    anchors: {
      grip: [-0.010638, -0.033804, 0.05],
      support: [-0.003272, -0.015227, -0.288519],
      sight: [-0.003685, 0.098301, 0.006653],
      muzzle: [0.0, 0.0, -0.773388],
    },
  },
  scout: {
    scale: 1.695833097,
    translation: [-0.143587919, 0.233624712, -0.485883259],
    anchors: {
      grip: [-0.00075, -0.105542, 0.05],
      support: [-0.000721, -0.012271, -0.256946],
      sight: [-0.000679, 0.097958, 0.000821],
      muzzle: [0.0, 0.0, -0.43394],
    },
  },
  heavy: {
    scale: 1.823134834,
    translation: [0.118014431, 0.199662697, 0.274245585],
    anchors: {
      grip: [-0.000174, -0.132148, 0.05],
      support: [-0.000268, -0.035522, -0.343797],
      sight: [0.000977, 0.097567, -0.048449],
      muzzle: [0.0, 0.0, -0.637099],
    },
  },
};
const characters = new Map<ClassId, THREE.Object3D>();
const guns = new Map<ClassId, GunMesh>();
const pending = new Map<string, Promise<void>>();
const loadedScenes = new Set<THREE.Object3D>();
let consumers = 0;
let defaultLoader: GLTFLoader | undefined;
const modelURLs = Object.fromEntries(
  Object.entries(names).map(([id, name]) => [
    id,
    {
      character: `/drift/output/models/tripo-runtime/${name}-character.glb`,
      gun: `/drift/output/models/tripo-runtime/${name}-gun.glb`,
    },
  ]),
);
const atlasURLs: Record<string, string> = {
  'characters-color.png':
    '/drift/output/models/tripo-runtime/characters-color.png',
  'characters-metallic-roughness.jpg':
    '/drift/output/models/tripo-runtime/characters-metallic-roughness.jpg',
  'characters-normal.png':
    '/drift/output/models/tripo-runtime/characters-normal.png',
  'guns-color.jpg': '/drift/output/models/tripo-runtime/guns-color.jpg',
  'guns-metallic-roughness.jpg':
    '/drift/output/models/tripo-runtime/guns-metallic-roughness.jpg',
  'guns-normal.png': '/drift/output/models/tripo-runtime/guns-normal.png',
};
const modelClass = (classId: string): ClassId =>
  isClassId(classId) ? classId : 'assault';

/** Share in-flight models across StrictMode mounts, then release their GPU resources. */
export function retainGameModels() {
  consumers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consumers--;
    if (consumers) return;
    void Promise.allSettled([...pending.values()]).then(() => {
      if (consumers) return;
      const resources = new Set<{ dispose(): void }>();
      for (const group of [
        ...loadedScenes,
        ...characters.values(),
        ...guns.values(),
      ]) {
        group.traverse((part) => {
          if (part instanceof THREE.Mesh) resources.add(part.geometry);
          if (part instanceof THREE.SkinnedMesh && part.skeleton)
            resources.add(part.skeleton);
          if (part instanceof THREE.Mesh || part instanceof THREE.Sprite)
            for (const material of Array.isArray(part.material)
              ? part.material
              : [part.material]) {
              if (!material) continue;
              resources.add(material);
              for (const value of Object.values(material))
                if (value instanceof THREE.Texture) resources.add(value);
            }
        });
      }
      for (const resource of resources) resource.dispose();
      loadedScenes.clear();
      characters.clear();
      guns.clear();
      defaultLoader = undefined;
    });
  };
}

// Grasp centers measured on the actual gloves, in the unposed character mesh.
// Wrist origins alone are behind the fingers and do not describe a closed grip.
const handFits: Record<
  ClassId,
  { left: Tuple3; right: Tuple3; rotation: Tuple4 }
> = {
  assault: {
    right: [0.051, 1.104, -0.181],
    left: [-0.152, 0.95, -0.395],
    rotation: [-0.300365, 0.332926, 0.054288, 0.892185],
  },
  sniper: {
    right: [0.092, 1.11, -0.189],
    left: [-0.171, 0.867, -0.463],
    rotation: [-0.316906, 0.288056, 0.055217, 0.901968],
  },
  scout: {
    right: [0.169, 1.058, -0.31],
    left: [0.024, 0.947, -0.495],
    rotation: [-0.259897, 0.215089, 0.054495, 0.939798],
  },
  heavy: {
    right: [0.051, 0.977, -0.302],
    left: [-0.213, 0.886, -0.18],
    rotation: [-0.267258, 0.328367, 0.04431, 0.904867],
  },
};

// Only requested classes are decoded. Geometry and the shared texture atlases
// remain cached; every player still receives an independent skeleton.
export function loadGameModels(
  classId = 'assault',
  loader?: Pick<GLTFLoader, 'loadAsync'>,
) {
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
  // glTF atlas names resolve to the same explicit public paths as the model files.
  manager.setURLModifier(
    (url) => atlasURLs[url.slice(url.lastIndexOf('/') + 1)] || url,
  );
  const textures = new Map<string, Promise<THREE.Texture>>();
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
        textures.set(
          key,
          loadTexture(index)
            .then((texture) => {
              if (!texture)
                throw new Error(`Could not load model texture: ${source.uri}`);
              return texture;
            })
            .catch((error) => {
              textures.delete(key);
              throw error;
            }),
        );
      }
      return textures.get(key)!;
    };
    return { name: 'drift-image-decoding' };
  });
  return defaultLoader;
}

function loadModel(
  id: ClassId,
  kind: 'character' | 'gun',
  loader?: Pick<GLTFLoader, 'loadAsync'>,
) {
  const cache = kind === 'character' ? characters : guns;
  if (cache.has(id)) return Promise.resolve();
  const key = `${id}:${kind}`;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const gltf = await (loader || getDefaultLoader()).loadAsync(
      modelURLs[id][kind],
    );
    loadedScenes.add(gltf.scene);
    const name = `${names[id]}${kind === 'gun' ? '-gun' : ''}`;
    const source = gltf.scene.getObjectByName(name);
    if (!source || (kind === 'gun' && !(source instanceof THREE.Mesh)))
      throw new Error(`Missing model: ${name}`);
    if (kind === 'character')
      characters.set(id, prepareCharacter(source, name));
    else
      guns.set(
        id,
        prepareGun(
          source as THREE.Mesh<
            THREE.BufferGeometry,
            THREE.MeshStandardMaterial
          >,
          id,
        ),
      );
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function prepareCharacter(body: THREE.Object3D, name: string) {
  body.traverse((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    if (
      !(part instanceof THREE.SkinnedMesh) ||
      !(part.material instanceof THREE.MeshStandardMaterial) ||
      !part.material.map
    )
      throw new Error(`Invalid rig: ${name}`);
    part.userData.sharedModel = true;
    part.castShadow = true;
    part.receiveShadow = true;
    // A conservative animated bound avoids CPU skinning every frame.
    part.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.45);
    const positions = part.geometry.attributes.position;
    const sole = [];
    // Sample heel/toe support angles and the lowest point in each sole cell.
    // This includes raised bind-pose heels without skinning the full body.
    for (const sign of [-1, 1]) {
      const foot = [];
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          z = positions.getZ(i);
        if (positions.getY(i) > 0.16 || x * sign < 0) continue;
        foot.push(i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      if (!foot.length) continue;
      for (let angle = 0; angle <= 16; angle++) {
        const theta = -Math.PI / 2 + (angle * Math.PI) / 16;
        let best = -Infinity,
          chosen = -1;
        for (const i of foot) {
          const support =
            -positions.getY(i) * Math.cos(theta) +
            positions.getZ(i) * Math.sin(theta);
          if (support > best) {
            best = support;
            chosen = i;
          }
        }
        sole.push(chosen);
      }
      const cells = new Map<number, number>();
      for (const i of foot) {
        const x = Math.min(
          3,
          Math.floor((4 * (positions.getX(i) - minX)) / (maxX - minX || 1)),
        );
        const z = Math.min(
          7,
          Math.floor((8 * (positions.getZ(i) - minZ)) / (maxZ - minZ || 1)),
        );
        const key = x * 8 + z,
          previous = cells.get(key);
        if (
          previous === undefined ||
          positions.getY(i) < positions.getY(previous)
        )
          cells.set(key, i);
      }
      sole.push(...cells.values());
    }
    part.geometry.userData.soleVertices = [...new Set(sole)];
  });
  return body;
}

function prepareGun(
  source: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  id: ClassId,
) {
  source.updateWorldMatrix(true, false);
  const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
  const fit = gunFits[id];
  geometry.scale(fit.scale, fit.scale, fit.scale);
  geometry.translate(...fit.translation);
  // Lower the imported backup irons into their mounts when fitting the holo.
  // Work on this cached runtime copy; the source GLBs, UVs and topology stay intact.
  const ironSights = (
    {
      assault: [
        [0.075, 0.022, -0.03, 0.025],
        [0.055, 0.025, -0.41, -0.36],
      ],
      scout: [
        [0.071, 0.02, -0.015, 0.025],
        [0.055, 0.025, -0.34, -0.29],
      ],
    } as Partial<Record<ClassId, number[][]>>
  )[id];
  if (ironSights) {
    const positions = geometry.attributes.position;
    for (const [baseY, halfWidth, minZ, maxZ] of ironSights) {
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        if (Math.abs(x) <= halfWidth && y > baseY && z >= minZ && z <= maxZ) {
          positions.setY(i, baseY + (y - baseY) * 0.08);
        }
      }
    }
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        new Float32Array(positions.count * 3),
        3,
      ),
    );
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, source.material) as GunMesh;
  mesh.name = source.name;
  mesh.userData.sharedModel = true;
  const sight = createHolographicSight(id, fit.anchors.sight);
  mesh.add(sight);
  mesh.userData.anchors = {
    ...fit.anchors,
    sight: [...sight.userData.sight] as Tuple3,
  };
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
  if (!template)
    throw new Error('Load game models before creating characters.');
  const group = clone(template) as RiggedGroup;
  const bones: BoneMap = {};
  group.traverse((part) => {
    if (part instanceof THREE.Bone) bones[part.name.split('_').at(-1)!] = part;
  });
  const gun = createGun(id);
  // Fit the stock against the shoulder front, with a closer fore-end hold.
  // These are world-only adjustments; first-person guns retain their full size.
  gun.scale.setScalar(id === 'heavy' ? 0.8 : 0.85);
  gun.position.set(
    id === 'heavy' ? -0.025 : 0.07,
    1.31,
    (id === 'heavy' ? -0.14 : -0.08) -
      gun.geometry.boundingBox!.max.z * gun.scale.x,
  );
  gun.userData.anchors.support = [...gun.userData.anchors.support];
  gun.userData.anchors.support[2] = id === 'heavy' ? -0.1 : -0.18;
  const fit = handFits[id];
  for (const side of ['Left', 'Right'] as const) {
    const palm = new THREE.Vector3(...fit[side === 'Left' ? 'left' : 'right']);
    const wrist = new THREE.Vector3(
      ...group.userData.restJointPositions[`${side}Hand`],
    );
    group.userData.handGrips[`${side}Hand`].palmCenter = palm.toArray();
    group.userData.handGrips[`${side}Hand`].localPalmOffset = palm
      .sub(wrist)
      .toArray();
  }
  group.add(gun);
  group.updateMatrixWorld(true);
  poseCharacterArms({
    bones,
    gun,
    palms: group.userData.handGrips,
    joints: group.userData.restJointPositions,
    handRotation: new THREE.Quaternion(...fit.rotation).normalize().invert(),
  });
  // A runtime-only parent lets arms and gun finish steep aim without folding
  // the torso. It adds no skin influence: the original skeleton still has 19.
  const aim = new THREE.Bone();
  aim.name = 'weapon-aim';
  // Pivot at the held grip: rotating about the shoulders would swing a rifle
  // behind the waist when aiming almost vertically downward.
  aim.position.copy(
    bones.Chest.worldToLocal(
      gun.localToWorld(new THREE.Vector3(...gun.userData.anchors.grip)),
    ),
  );
  bones.Chest.add(aim);
  aim.attach(bones.LeftShoulder);
  aim.attach(bones.RightShoulder);
  aim.attach(gun);
  let body:
    | THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    | undefined;
  group.traverse((part) => {
    if (
      part instanceof THREE.SkinnedMesh &&
      part.material instanceof THREE.MeshStandardMaterial
    )
      body = part;
  });
  if (!body) throw new Error('Character model has no skinned body.');
  group.userData.character = {
    kind: 'runner',
    classId: id,
    bones,
    upper: bones.Chest,
    head: bones.Head,
    arms: [bones.LeftUpperArm, bones.RightUpperArm],
    legs: [bones.LeftUpperLeg, bones.RightUpperLeg],
    phase: 0,
    stride: 0,
    stance: 0,
    slideBlend: 0,
    hipsY: bones.Hips.position.y,
    body,
    gun,
    aim,
  };
  return group;
}

export function createViewArms(classId = 'assault') {
  const group = createRiggedCharacter(classId);
  const { body, gun, bones } = group.userData.character;
  const rest = group.userData.restJointPositions;
  gun.userData.anchors = structuredClone(
    guns.get(modelClass(classId))!.userData.anchors,
  );
  gun.scale.setScalar(1);
  gun.updateWorldMatrix(true, true);
  // Bend the elbows below the camera, with forearms reaching forward to the
  // grips. A straight shoulder/elbow/wrist chain reads as a long sleeve slab.
  for (const side of ['Left', 'Right'] as const) {
    const upper = bones[`${side}UpperArm`],
      forearm = bones[`${side}ForeArm`],
      hand = bones[`${side}Hand`];
    const oldShoulder = new THREE.Vector3(...rest[`${side}UpperArm`]);
    const oldElbow = new THREE.Vector3(...rest[`${side}ForeArm`]);
    const oldWrist = new THREE.Vector3(...rest[`${side}Hand`]);
    const handRotation = hand.getWorldQuaternion(new THREE.Quaternion());
    if (classId === 'heavy' && side === 'Left') {
      handRotation.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          1.2,
        ),
      );
    }
    const palmOffset = new THREE.Vector3(
      ...group.userData.handGrips[`${side}Hand`].localPalmOffset,
    ).applyQuaternion(handRotation);
    const target = gun.localToWorld(
      new THREE.Vector3(
        ...gun.userData.anchors[side === 'Right' ? 'grip' : 'support'],
      ),
    );
    const wrist = target.sub(palmOffset);
    const direction = new THREE.Vector3(
      side === 'Left' ? 0.45 : -0.35,
      side === 'Left' ? 0.2 : 0.35,
      -0.87,
    ).normalize();
    const elbow = wrist
      .clone()
      .addScaledVector(direction, -oldElbow.distanceTo(oldWrist));
    const shoulderDirection =
      side === 'Left'
        ? new THREE.Vector3(-0.5, -0.65, 0.57)
        : new THREE.Vector3(0.6, -0.8, 0.1);
    const shoulder = elbow
      .clone()
      .addScaledVector(
        shoulderDirection.normalize(),
        oldShoulder.distanceTo(oldElbow),
      );
    // Carry the glove's roll through the sleeve, then add only the bend needed
    // to reach the elbow. Independent shortest-arc rotations can twist a cuff.
    const forearmRotation = new THREE.Quaternion()
      .setFromUnitVectors(
        oldWrist
          .clone()
          .sub(oldElbow)
          .normalize()
          .applyQuaternion(handRotation),
        direction,
      )
      .multiply(handRotation);
    const upperRotation = new THREE.Quaternion()
      .setFromUnitVectors(
        oldElbow
          .clone()
          .sub(oldShoulder)
          .normalize()
          .applyQuaternion(forearmRotation),
        elbow.clone().sub(shoulder).normalize(),
      )
      .multiply(forearmRotation);
    upper.position.copy(upper.parent!.worldToLocal(shoulder));
    upper.quaternion.copy(
      upper
        .parent!.getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(upperRotation),
    );
    forearm.quaternion.copy(upperRotation.invert().multiply(forearmRotation));
    hand.quaternion.copy(forearmRotation.invert().multiply(handRotation));
    upper.updateWorldMatrix(true, true);
  }
  const source = body.geometry;
  const weights = source.attributes.skinWeight,
    joints = source.attributes.skinIndex;
  const armBones = body.skeleton.bones.map((bone: { name: string }) =>
    /(?:UpperArm|ForeArm|Hand)$/.test(bone.name),
  );
  const armWeight = new Float32Array(weights.count);
  for (let i = 0; i < weights.count; i++)
    for (let k = 0; k < 4; k++) {
      if (armBones[joints.getComponent(i, k)])
        armWeight[i] += weights.getComponent(i, k);
    }
  const vertices = [],
    indices = [],
    remap = new Map<number, number>();
  for (let i = 0; i < source.index!.count; i += 3) {
    const triangle = [
      source.index!.getX(i),
      source.index!.getX(i + 1),
      source.index!.getX(i + 2),
    ];
    if (triangle.some((vertex) => armWeight[vertex] < 0.6)) continue;
    for (const vertex of triangle) {
      if (!remap.has(vertex)) {
        remap.set(vertex, vertices.length);
        vertices.push(vertex);
      }
      indices.push(remap.get(vertex)!);
    }
  }
  // Blended weights can include small, disconnected pieces of the vest. Keep
  // the two continuous arms, welding UV seams only for this component check.
  const parents = vertices.map((_, index) => index),
    welded = new Map<string, number>();
  const find = (index: number) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const positions = source.attributes.position;
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    const key = [
      positions.getX(vertex),
      positions.getY(vertex),
      positions.getZ(vertex),
    ]
      .map((value) => value.toFixed(5))
      .join(',');
    if (welded.has(key)) parents[i] = welded.get(key)!;
    else welded.set(key, i);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]);
    parents[find(indices[i + 1])] = root;
    parents[find(indices[i + 2])] = root;
  }
  const sizes = new Map<number, number>();
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]);
    sizes.set(root, (sizes.get(root) || 0) + 1);
  }
  const arms = new Set(
    [...sizes]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([root]) => root),
  );
  const armIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (arms.has(find(indices[i])))
      armIndices.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  // Own compact vertex buffers so releasing a viewmodel never touches the body.
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const original =
      attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.array
        : attribute.array;
    const stride =
      attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.stride
        : attribute.itemSize;
    const offset =
      attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.offset
        : 0;
    const values = new (
      original.constructor as { new (length: number): THREE.TypedArray }
    )(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++)
      for (let k = 0; k < attribute.itemSize; k++) {
        values[i * attribute.itemSize + k] =
          original[vertices[i] * stride + offset + k];
      }
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(
        values,
        attribute.itemSize,
        attribute.normalized,
      ),
    );
  }
  // The detached view arms have no torso to blend toward. Renormalize the
  // shoulder transition onto the arm bones to prevent floating sleeve wedges.
  const viewWeights = geometry.attributes.skinWeight,
    viewJoints = geometry.attributes.skinIndex;
  for (let i = 0; i < viewWeights.count; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      if (!armBones[viewJoints.getComponent(i, k)])
        viewWeights.setComponent(i, k, 0);
      sum += viewWeights.getComponent(i, k);
    }
    for (let k = 0; k < 4; k++)
      viewWeights.setComponent(i, k, viewWeights.getComponent(i, k) / sum);
  }
  geometry.setIndex(armIndices);
  if (modelClass(classId) === 'sniper') {
    // Two vest-contact patches survived on Wisp's inner sleeve. Fit them to the
    // posed forearm: the mixed elbow weights make a bind-pose trim protrude.
    const position = geometry.attributes.position,
      uv = geometry.attributes.uv;
    group.updateMatrixWorld(true);
    const elbow = bones.LeftForeArm.getWorldPosition(new THREE.Vector3());
    const axis = bones.LeftHand.getWorldPosition(new THREE.Vector3())
      .sub(elbow)
      .normalize();
    const boneMatrices = body.skeleton.bones.map((bone, i) =>
      bone.matrixWorld.clone().multiply(body.skeleton.boneInverses[i]),
    );
    const skinMatrix = (i: number) => {
      const matrix = new THREE.Matrix4();
      matrix.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const weight = viewWeights.getComponent(i, k);
        const bone = boneMatrices[viewJoints.getComponent(i, k)].elements;
        for (let n = 0; n < 16; n++) matrix.elements[n] += bone[n] * weight;
      }
      matrix.elements[15] = 1;
      return matrix
        .multiply(body.bindMatrix)
        .premultiply(body.bindMatrixInverse)
        .premultiply(body.matrixWorld);
    };
    const point = new THREE.Vector3(),
      radial = new THREE.Vector3();
    const corrections = new Map<string, THREE.Vector3>();
    const key = (i: number) =>
      `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
    for (let i = 0; i < position.count; i++) {
      const u = uv.getX(i),
        v = uv.getY(i);
      if (!(
        (u >= 0.519 && u <= 0.57 && v >= 0.2829 && v <= 0.323) ||
        (u >= 0.0046 && u <= 0.0318 && v >= 0.8723 && v <= 0.8924)
      ))
        continue;
      point.fromBufferAttribute(position, i);
      if (
        point.x < -0.278 ||
        point.x > -0.182 ||
        point.y < 0.991 ||
        point.y > 1.149 ||
        point.z < -0.204 ||
        point.z > -0.069
      )
        continue;
      point.applyMatrix4(skinMatrix(i));
      radial.copy(point).sub(elbow);
      radial.addScaledVector(axis, -radial.dot(axis));
      const radius = radial.length();
      if (radius > 0.05)
        corrections.set(
          key(i),
          point.clone().addScaledVector(radial, 0.05 / radius - 1),
        );
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
  for (const side of ['Left', 'Right'] as const) {
    const elbow = new THREE.Vector3(...rest[`${side}ForeArm`]);
    const axis = new THREE.Vector3(...rest[`${side}UpperArm`]).sub(elbow);
    const length = axis.length();
    axis.normalize();
    const joint = body.skeleton.bones.indexOf(bones[`${side}UpperArm`]);
    for (let i = 0; i < viewPosition.count; i++) {
      let influence = 0;
      for (let k = 0; k < 4; k++)
        if (viewJoints.getComponent(i, k) === joint)
          influence += viewWeights.getComponent(i, k);
      if (influence <= 0.5) continue;
      point.fromBufferAttribute(viewPosition, i).sub(elbow);
      const extension =
        0.2 *
        THREE.MathUtils.smoothstep(point.dot(axis) / (length * 0.75), 0, 1) *
        THREE.MathUtils.smoothstep(influence, 0.5, 0.9);
      point.add(elbow).addScaledVector(axis, extension);
      viewPosition.setXYZ(i, point.x, point.y, point.z);
    }
  }
  // Source normals are quantized; regenerated normals need float accumulation.
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      new Float32Array(viewPosition.count * 3),
      3,
    ),
  );
  geometry.computeVertexNormals();
  body.geometry = geometry;
  body.name = 'first-person-hands';
  group.updateMatrixWorld(true);
  group.applyMatrix4(gun.matrixWorld.clone().invert());
  gun.removeFromParent();
  const armsGroup = group as RiggedGroup<GunMesh | null>;
  armsGroup.userData.character.gun = null;
  group.name = 'first-person-arms';
  return armsGroup;
}

// Solve the elbow/wrist chain separately from the glove's grasp orientation.
export function poseCharacterArms({
  bones,
  gun,
  palms,
  joints,
  handRotation,
}: {
  bones: BoneMap;
  gun: GunMesh;
  palms: CharacterData['handGrips'];
  joints: CharacterData['restJointPositions'];
  handRotation: THREE.Quaternion;
}) {
  for (const side of ['Left', 'Right'] as const) {
    const upper = bones[`${side}UpperArm`];
    const forearm = bones[`${side}ForeArm`];
    const hand = bones[`${side}Hand`];
    const shoulder = new THREE.Vector3(...joints[`${side}UpperArm`]);
    const restElbow = new THREE.Vector3(...joints[`${side}ForeArm`]);
    const restWrist = new THREE.Vector3(...joints[`${side}Hand`]);
    const restUpper = restElbow.clone().sub(shoulder);
    const restForearm = restWrist.clone().sub(restElbow);
    const firstLength = restUpper.length(),
      secondLength = restForearm.length();
    const target = gun.localToWorld(
      new THREE.Vector3(
        ...gun.userData.anchors[side === 'Right' ? 'grip' : 'support'],
      ),
    );
    target.sub(
      new THREE.Vector3(
        ...palms[`${side}Hand`].localPalmOffset,
      ).applyQuaternion(handRotation),
    );
    const direction = target.clone().sub(shoulder);
    const distance = direction.length();
    if (
      distance >= firstLength + secondLength ||
      distance <= Math.abs(firstLength - secondLength)
    ) {
      throw new Error(
        `Weapon palm is outside ${side.toLowerCase()} arm reach (${distance.toFixed(3)} / ${(firstLength + secondLength).toFixed(3)}).`,
      );
    }
    direction.normalize();
    // Keep elbows on the source pose's downward/outward side of the aim axis.
    const pole = restUpper
      .clone()
      .addScaledVector(direction, -restUpper.dot(direction))
      .normalize();
    const along =
      (firstLength ** 2 - secondLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstLength ** 2 - along ** 2));
    const elbow = shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(pole, height);
    const upperWorld = new THREE.Quaternion().setFromUnitVectors(
      restUpper.normalize(),
      elbow.clone().sub(shoulder).normalize(),
    );
    const forearmWorld = new THREE.Quaternion().setFromUnitVectors(
      restForearm.normalize(),
      target.clone().sub(elbow).normalize(),
    );
    upper.quaternion.copy(
      upper
        .parent!.getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(upperWorld),
    );
    forearm.quaternion.copy(upperWorld.clone().invert().multiply(forearmWorld));
    hand.quaternion.copy(forearmWorld.clone().invert().multiply(handRotation));
    upper.updateWorldMatrix(true, true);
  }
}

// Shared meshes survive class changes, portrait renders and disconnected players.
// Labels, practice drones and each avatar's GPU bone texture remain independently owned.
export function disposeModel(group: THREE.Object3D) {
  const skeletons = new Set<THREE.Skeleton>();
  group.traverse((part) => {
    if (part instanceof THREE.SkinnedMesh) skeletons.add(part.skeleton);
    if (part.userData.sharedModel) return;
    if (part instanceof THREE.Mesh) part.geometry.dispose();
    if (part instanceof THREE.Mesh || part instanceof THREE.Sprite)
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material]) {
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshBasicMaterial ||
          material instanceof THREE.SpriteMaterial
        )
          material.map?.dispose();
        material?.dispose();
      }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  group.removeFromParent();
}
