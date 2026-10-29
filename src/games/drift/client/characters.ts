import type { ClassId } from '../shared/classes.ts';
import type {
  RiggedGroup,
  CharacterGroup,
  PracticeGroup,
  CharacterRig,
  CharacterMotion,
  GunMesh,
} from './render-types.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRiggedCharacter } from './game-models.ts';
import { getPower } from '../shared/powers.ts';

const INK = '#20343b';
const SUIT = '#35484c';
const IVORY = '#b7b8ad';
const STEEL = '#788a8a';
const solePoint = new THREE.Vector3();
const aimAxis = new THREE.Vector3();
const SURFACES = {
  cloth: [0.96, 0],
  skin: [0.88, 0],
  hair: [0.94, 0],
  armor: [0.72, 0.12],
  metal: [0.4, 0.68],
  lens: [0.26, 0.18],
  rubber: [0.93, 0],
};
// Eight-sided armor with sloping top/bottom edges gives small silhouettes crisp
// highlights. All parts are merged by moving limb, without textures or assets.
function armor(w: number, h: number, d: number, taper = 1, bevel = 0.024) {
  const positions: number[] = [];
  const cut = Math.min(w, d) * 0.18;
  const edge = Math.min(bevel, h * 0.18, w * 0.1, d * 0.1);
  const ring = (width: number, depth: number, y: number) => [
    [-width / 2 + cut, y, -depth / 2],
    [width / 2 - cut, y, -depth / 2],
    [width / 2, y, -depth / 2 + cut],
    [width / 2, y, depth / 2 - cut],
    [width / 2 - cut, y, depth / 2],
    [-width / 2 + cut, y, depth / 2],
    [-width / 2, y, depth / 2 - cut],
    [-width / 2, y, -depth / 2 + cut],
  ];
  const rings = [
    ring(w * taper - edge * 2, d - edge * 2, -h / 2),
    ring(w * taper, d, -h / 2 + edge),
    ring(w, d, h / 2 - edge),
    ring(w - edge * 2, d - edge * 2, h / 2),
  ];
  const triangle = (a: number[], b: number[], c: number[]) =>
    positions.push(...a, ...b, ...c);
  for (let level = 0; level < 3; level++) {
    for (let side = 0; side < 8; side++) {
      const next = (side + 1) % 8;
      triangle(
        rings[level][side],
        rings[level + 1][side],
        rings[level + 1][next],
      );
      triangle(rings[level][side], rings[level + 1][next], rings[level][next]);
    }
  }
  for (let side = 1; side < 7; side++) {
    triangle(rings[0][0], rings[0][side], rings[0][side + 1]);
    triangle(rings[3][0], rings[3][side + 1], rings[3][side]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function paint(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation | undefined,
  surface?: keyof typeof SURFACES,
) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  const value = new THREE.Color(color);
  const positions = result.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const finish =
    SURFACES[
      surface ||
        (color === SUIT
          ? 'cloth'
          : color === INK
            ? 'rubber'
            : color === STEEL
              ? 'metal'
              : 'armor')
    ];
  const surfaces = new Float32Array(positions.count * 2);
  for (let index = 0; index < colors.length; index += 3) {
    const vertex = index / 3;
    const tone =
      0.97 +
      Math.sin(positions.getY(vertex) * 19 + positions.getX(vertex) * 7) * 0.03;
    colors[index] = value.r * tone;
    colors[index + 1] = value.g * tone;
    colors[index + 2] = value.b * tone;
    surfaces[vertex * 2] = finish[0];
    surfaces[vertex * 2 + 1] = finish[1];
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  result.setAttribute('surface', new THREE.BufferAttribute(surfaces, 2));
  return result;
}

function plate(
  parts: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: THREE.ColorRepresentation,
  taper = 1,
  rotation = 0,
  surface?: keyof typeof SURFACES,
) {
  const geometry = paint(armor(w, h, d, taper), color, surface);
  geometry.rotateZ(rotation);
  geometry.translate(x, y, z);
  parts.push(geometry);
}

function rod(
  parts: THREE.BufferGeometry[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number,
  color: THREE.ColorRepresentation,
  endRadius = radius,
  segments = 6,
  surface?: keyof typeof SURFACES,
) {
  const start = new THREE.Vector3(ax, ay, az);
  const end = new THREE.Vector3(bx, by, bz);
  const direction = end.clone().sub(start);
  const geometry = paint(
    new THREE.CylinderGeometry(endRadius, radius, direction.length(), segments),
    color,
    surface,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  );
  geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
  parts.push(geometry);
}

function mesh(
  parts: THREE.BufferGeometry[],
  name: string,
  pivotX = 0,
  pivotY = 0,
  pivotZ = 0,
) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  geometry.translate(-pivotX, -pivotY, -pivotZ);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  });
  // Store surface finish beside vertex color so cloth, skin, glass and metal
  // respond differently to light while each animated limb remains one draw.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 surface;\nvarying vec2 vSurface;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSurface = surface;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurface;')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = vSurface.x;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = vSurface.y;',
      );
  };
  material.customProgramCacheKey = () => 'drift-character-surfaces-v1';
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.position.set(pivotX, pivotY, pivotZ);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export function createAvatar(_color: string | undefined, classId = 'assault') {
  return createRiggedCharacter(classId);
}

export function createTarget() {
  const group = new THREE.Group() as PracticeGroup;
  group.name = 'Practice drone';
  const parts: THREE.BufferGeometry[] = [];
  const amber = '#ecad51';
  plate(parts, 0, 0.065, 0, 0.64, 0.13, 0.55, INK);
  rod(parts, 0, 0.12, 0, 0, 0.84, 0, 0.065, STEEL);
  for (const side of [-1, 1]) {
    rod(parts, side * 0.23, 0.14, 0, side * 0.13, 0.62, 0, 0.027, INK);
    plate(
      parts,
      side * 0.3,
      1.195,
      0,
      0.14,
      0.32,
      0.23,
      INK,
      0.78,
      side * 0.13,
    );
    plate(parts, side * 0.307, 1.26, -0.13, 0.09, 0.115, 0.035, amber);
  }
  plate(parts, 0, 1.14, 0, 0.47, 0.58, 0.25, IVORY, 0.7);
  plate(parts, 0, 1.17, -0.144, 0.38, 0.38, 0.045, INK, 0.83);
  // Physical concentric target rings remain legible at arena distance.
  const ring = paint(new THREE.TorusGeometry(0.118, 0.018, 4, 16), amber);
  ring.translate(0, 1.19, -0.179);
  parts.push(ring);
  rod(parts, 0, 1.19, -0.18, 0, 1.19, -0.192, 0.04, amber, 0.04, 8);
  rod(parts, 0, 1.39, 0, 0, 1.52, 0, 0.055, STEEL);
  const body = mesh(parts, 'Training drone');
  group.add(body);
  const headParts: THREE.BufferGeometry[] = [];
  plate(headParts, 0, 1.665, 0, 0.32, 0.28, 0.28, IVORY, 0.77);
  plate(headParts, 0, 1.68, -0.15, 0.255, 0.086, 0.04, INK);
  rod(headParts, 0, 1.68, -0.176, 0, 1.68, -0.187, 0.035, amber, 0.035, 8);
  plate(headParts, 0, 1.57, -0.145, 0.13, 0.045, 0.035, STEEL);
  const head = mesh(headParts, 'Training sensor', 0, 1.54, 0);
  group.add(head);
  group.userData.character = { kind: 'practice', head };
  return group;
}

// Fit the compact poses once per class from the actual leg lengths and rest
// inclinations. This keeps the 1.15 m crouch collider honest without squashing
// the character. Feet keep their original orientation as the knees fold.
interface CompactPoses {
  crouchDrop: number;
  slideDrop: number;
  crouch: THREE.Quaternion[][];
  slide: THREE.Quaternion[][];
}
const compactPoseCache = new Map<ClassId, CompactPoses>();
const compactRotation = new THREE.Quaternion();
type ShieldPose = Record<
  | 'upper'
  | 'forearm'
  | 'hand'
  | 'upperWorld'
  | 'foreWorld'
  | 'rotation'
  | 'local',
  THREE.Quaternion
> &
  Record<
    | 'shoulder'
    | 'elbow'
    | 'wrist'
    | 'target'
    | 'direction'
    | 'pole'
    | 'upperDirection'
    | 'foreDirection',
    THREE.Vector3
  >;
const shieldArmPoses = new WeakMap<THREE.Object3D, ShieldPose>();

// Only the shield arm releases its support grip. A world-space target lets the
// first-person rig reuse this solve after its own arm fitting. Zero restores it.
export function poseShieldArm(
  group: RiggedGroup<GunMesh | null>,
  amount = 0,
  targetWorld?: THREE.Vector3,
) {
  const rig = group.userData.character;
  if (!rig?.bones?.LeftHand) return;
  const {
    LeftUpperArm: upper,
    LeftForeArm: forearm,
    LeftHand: hand,
  } = rig.bones;
  let pose = shieldArmPoses.get(group);
  if (!pose) {
    if (!(amount > 0)) return;
    pose = {
      upper: upper.quaternion.clone(),
      forearm: forearm.quaternion.clone(),
      hand: hand.quaternion.clone(),
      shoulder: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      wrist: new THREE.Vector3(),
      target: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      pole: new THREE.Vector3(),
      upperDirection: new THREE.Vector3(),
      foreDirection: new THREE.Vector3(),
      upperWorld: new THREE.Quaternion(),
      foreWorld: new THREE.Quaternion(),
      rotation: new THREE.Quaternion(),
      local: new THREE.Quaternion(),
    };
    shieldArmPoses.set(group, pose);
  }
  upper.quaternion.copy(pose.upper);
  forearm.quaternion.copy(pose.forearm);
  hand.quaternion.copy(pose.hand);
  amount = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  if (!amount) return;
  group.updateWorldMatrix(true, true);
  upper.getWorldPosition(pose.shoulder);
  forearm.getWorldPosition(pose.elbow);
  hand.getWorldPosition(pose.wrist);
  const upperLength = pose.shoulder.distanceTo(pose.elbow),
    foreLength = pose.elbow.distanceTo(pose.wrist);
  pose.upperDirection.copy(pose.elbow).sub(pose.shoulder).normalize();
  pose.foreDirection.copy(pose.wrist).sub(pose.elbow).normalize();
  upper.getWorldQuaternion(pose.upperWorld);
  forearm.getWorldQuaternion(pose.foreWorld);
  if (targetWorld) pose.target.copy(targetWorld);
  else {
    rig.bones.Chest.getWorldPosition(pose.target);
    group.worldToLocal(pose.target);
    pose.target.set(-0.2, pose.target.y, -0.2);
    group.localToWorld(pose.target);
  }
  pose.direction.copy(pose.target).sub(pose.shoulder);
  const distance = THREE.MathUtils.clamp(
    pose.direction.length(),
    Math.abs(upperLength - foreLength) + 0.005,
    upperLength + foreLength - 0.005,
  );
  pose.direction.normalize();
  pose.target.copy(pose.shoulder).addScaledVector(pose.direction, distance);
  pose.pole.set(-1, -0.45, 0.15).transformDirection(group.matrixWorld);
  pose.pole
    .addScaledVector(pose.direction, -pose.pole.dot(pose.direction))
    .normalize();
  const along =
    (upperLength ** 2 + distance ** 2 - foreLength ** 2) / (2 * distance);
  pose.elbow
    .copy(pose.shoulder)
    .addScaledVector(pose.direction, along)
    .addScaledVector(
      pose.pole,
      Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)),
    );
  pose.rotation.setFromUnitVectors(
    pose.upperDirection,
    pose.wrist.copy(pose.elbow).sub(pose.shoulder).normalize(),
  );
  pose.upperWorld.premultiply(pose.rotation);
  pose.rotation.setFromUnitVectors(
    pose.foreDirection,
    pose.wrist.copy(pose.target).sub(pose.elbow).normalize(),
  );
  pose.foreWorld.premultiply(pose.rotation);
  upper
    .parent!.getWorldQuaternion(pose.local)
    .invert()
    .multiply(pose.upperWorld);
  upper.quaternion.copy(pose.upper).slerp(pose.local, amount);
  pose.local.copy(pose.upperWorld).invert().multiply(pose.foreWorld);
  forearm.quaternion.copy(pose.forearm).slerp(pose.local, amount);
  upper.updateWorldMatrix(true, true);
}

function blendCompactBone(
  bone: THREE.Bone,
  crouch: THREE.Quaternion,
  slide: THREE.Quaternion,
  compact: number,
  slideBlend: number,
) {
  compactRotation.copy(crouch).slerp(slide, slideBlend);
  bone.quaternion.slerp(compactRotation, compact);
}
function compactLegPoses(
  group: RiggedGroup<GunMesh | null>,
  rig: CharacterRig<GunMesh | null>,
): CompactPoses {
  if (compactPoseCache.has(rig.classId))
    return compactPoseCache.get(rig.classId)!;
  const result: CompactPoses = {
    crouch: [],
    slide: [],
    crouchDrop: rig.classId === 'scout' ? 0.72 : 0.695,
    slideDrop: rig.classId === 'heavy' ? 0.75 : 0.71,
  };
  const rest = group.userData.restJointPositions;
  for (const pose of ['crouch', 'slide'] as const) {
    result[pose] = ['Left', 'Right'].map((side) => {
      const hip = new THREE.Vector3(...rest[`${side}UpperLeg`]);
      const knee = new THREE.Vector3(...rest[`${side}LowerLeg`]);
      const ankle = new THREE.Vector3(...rest[`${side}Foot`]);
      const start = hip.clone();
      start.y -= result[`${pose}Drop`];
      const target = ankle.clone(),
        upperLength = hip.distanceTo(knee),
        lowerLength = knee.distanceTo(ankle);
      if (pose === 'slide') {
        target.x = start.x;
        target.z = start.z - (upperLength + lowerLength) * 0.92;
      }
      const direction = target.clone().sub(start),
        distance = Math.min(
          direction.length(),
          upperLength + lowerLength - 0.001,
        );
      direction.normalize();
      const along =
        (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
      const bend = new THREE.Vector3(
        0,
        pose === 'slide' ? 1 : 0,
        pose === 'slide' ? 0 : -1,
      );
      bend.addScaledVector(direction, -bend.dot(direction)).normalize();
      const joint = start
        .clone()
        .addScaledVector(direction, along)
        .addScaledVector(
          bend,
          Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)),
        );
      const upper = new THREE.Quaternion().setFromUnitVectors(
        knee.clone().sub(hip).normalize(),
        joint.clone().sub(start).normalize(),
      );
      const lower = new THREE.Quaternion().setFromUnitVectors(
        ankle.clone().sub(knee).normalize(),
        target.sub(joint).normalize(),
      );
      return [
        upper,
        upper.clone().invert().multiply(lower),
        lower.clone().invert(),
      ];
    });
  }
  compactPoseCache.set(rig.classId, result);
  return result;
}

// Internal-only articulation: callers own position, facing, health and labels.
// Pose fitting is cached; ordinary updates allocate no vectors or geometry.
export function updateCharacter(
  group: CharacterGroup,
  motion: CharacterMotion = {},
) {
  const rig = group.userData.character;
  if (!rig) return;
  const finite = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value);
  const time = finite(motion.time) ? motion.time : 0;
  if (rig.kind === 'practice') {
    rig.head.rotation.y = Math.sin(time * 0.6) * 0.1;
    return;
  }
  const dt = finite(motion.delta)
    ? Math.min(0.05, Math.max(0, motion.delta))
    : 0;
  const speed = finite(motion.speed) ? Math.max(0, motion.speed) : 0;
  const grounded = motion.grounded !== false;
  const sliding = !!motion.sliding;
  const crouching = !!motion.crouching;
  const power = getPower(rig.classId);
  const abilityTime = finite(motion.abilityTime)
    ? THREE.MathUtils.clamp(motion.abilityTime, 0, power.duration)
    : 0;
  const active =
    abilityTime > 0 &&
    (rig.classId !== 'heavy' || (motion.shieldHealth ?? 0) > 0);
  const bracing = active && rig.classId === 'heavy';
  const dashing = active && rig.classId === 'scout';
  const launch =
    rig.classId === 'assault' && !grounded && finite(motion.vy)
      ? THREE.MathUtils.clamp((motion.vy - 8.6) / 3, 0, 1)
      : 0;
  const gesture =
    active && (rig.classId === 'assault' || rig.classId === 'sniper')
      ? Math.sin(
          Math.PI *
            Math.min(
              1,
              (power.duration - abilityTime) /
                (rig.classId === 'assault' ? 0.35 : 0.4),
            ),
        )
      : 0;
  const yaw = finite(motion.yaw) ? motion.yaw : group.rotation.y;
  const dashX = finite(motion.dashX) ? motion.dashX : -Math.sin(yaw);
  const dashZ = finite(motion.dashZ) ? motion.dashZ : -Math.cos(yaw);
  const dashLength = Math.hypot(dashX, dashZ) || 1;
  const dashSide = (Math.cos(yaw) * dashX - Math.sin(yaw) * dashZ) / dashLength;
  const dashForward =
    (-Math.sin(yaw) * dashX - Math.cos(yaw) * dashZ) / dashLength;
  const targetStride =
    grounded && !sliding
      ? Math.min(speed / 9, 1) * (bracing ? 0.35 : dashing ? 0.2 : 1)
      : 0;
  const stance = Math.max(
    sliding ? 0.52 : crouching ? 0.28 : 0,
    grounded ? (bracing ? 0.078 : dashing ? 0.084 : 0) : 0,
  );
  if (rig.classId === 'heavy')
    poseShieldArm(group as RiggedGroup<GunMesh | null>, 0);
  if (motion.reset) {
    rig.stride = targetStride;
    rig.phase = 0;
    rig.stance = stance;
    rig.slideBlend = Number(sliding);
  } else {
    rig.stride += (targetStride - rig.stride) * (1 - Math.exp(-12 * dt));
    rig.phase += dt * (3 + Math.min(speed, 14) * 1.25);
    rig.stance =
      (rig.stance || 0) +
      (stance - (rig.stance || 0)) * (1 - Math.exp(-14 * dt));
    rig.slideBlend =
      (rig.slideBlend || 0) +
      (Number(sliding) - (rig.slideBlend || 0)) * (1 - Math.exp(-14 * dt));
  }
  const step = Math.sin(rig.phase) * rig.stride;
  const compact = Math.min(1, rig.stance / 0.28),
    poses = compactLegPoses(group as RiggedGroup<GunMesh | null>, rig);
  const bones = rig.bones;
  bones.Hips.position.y =
    rig.hipsY -
    compact *
      THREE.MathUtils.lerp(poses.crouchDrop, poses.slideDrop, rig.slideBlend);
  for (let side = 0; side < 2; side++) {
    const prefix = side === 0 ? 'Left' : 'Right';
    const stride = side === 0 ? step : -step;
    const upper = bones[`${prefix}UpperLeg`],
      lower = bones[`${prefix}LowerLeg`],
      foot = bones[`${prefix}Foot`];
    upper.rotation.set(!grounded ? 0.22 + side * 0.15 : stride * 0.36, 0, 0);
    lower.rotation.set(!grounded ? -0.45 : -Math.max(0, -stride) * 0.45, 0, 0);
    foot.rotation.set(Math.max(0, -stride) * 0.15, 0, 0);
    if (dashing && !grounded) {
      const leading = side === (dashSide < 0 ? 1 : 0);
      upper.rotation.x = leading ? 0.95 : 0.4;
      lower.rotation.x = leading ? -1.35 : -0.7;
      foot.rotation.x = leading ? 0.25 : 0.05;
    }
    if (launch) {
      upper.rotation.x = THREE.MathUtils.lerp(
        upper.rotation.x,
        side === 0 ? 0.85 : 0.5,
        launch,
      );
      lower.rotation.x = THREE.MathUtils.lerp(
        lower.rotation.x,
        side === 0 ? -1.15 : -0.75,
        launch,
      );
      foot.rotation.x = 0.2 * launch;
    }
    blendCompactBone(
      upper,
      poses.crouch[side][0],
      poses.slide[side][0],
      compact,
      rig.slideBlend,
    );
    blendCompactBone(
      lower,
      poses.crouch[side][1],
      poses.slide[side][1],
      compact,
      rig.slideBlend,
    );
    blendCompactBone(
      foot,
      poses.crouch[side][2],
      poses.slide[side][2],
      compact,
      rig.slideBlend,
    );
    upper.rotateX(stride * 0.01 * compact * (1 - rig.slideBlend));
  }
  const pitch = finite(motion.pitch)
    ? Math.max(-1.48, Math.min(1.48, motion.pitch))
    : 0;
  const torsoPitch = bracing
    ? -0.16
    : dashing
      ? -0.28 * dashForward
      : Math.max(-0.8, Math.min(0.8, pitch - gesture * 0.12));
  const weaponPitch = bracing ? -0.45 : dashing ? -0.5 : pitch;
  bones.Chest.rotation.x =
    torsoPitch +
    (motion.reloading && !bracing && !dashing
      ? 0.08 + Math.sin(time * 7) * 0.025
      : 0);
  bones.Chest.rotation.z =
    (sliding ? -0.05 : step * 0.018) +
    (bracing
      ? -0.045
      : dashing
        ? -0.3 * dashSide
        : gesture * (rig.classId === 'assault' ? 0.09 : -0.16));
  // Counter the chest's gait roll when applying the remaining pitch, so the
  // barrel stays on the actual aim ray even while running or sliding.
  aimAxis.set(
    Math.cos(bones.Chest.rotation.z),
    -Math.sin(bones.Chest.rotation.z),
    0,
  );
  rig.aim.quaternion.setFromAxisAngle(aimAxis, weaponPitch - torsoPitch);
  const headPitch = pitch - torsoPitch + torsoPitch * 0.05;
  bones.Head.rotation.set(
    bracing || dashing
      ? THREE.MathUtils.clamp(headPitch, -0.65, 0.65)
      : headPitch,
    0,
    0,
  );
  if (bracing) poseShieldArm(group as RiggedGroup<GunMesh | null>, 1);
  // Short, interruptible personality poses use the existing rig. Keep the
  // chest, arms and weapon aim untouched, and never move the network root.
  const celebration = finite(motion.celebration) ? motion.celebration : 0;
  if (
    !active &&
    celebration > 0 &&
    celebration < 1 &&
    grounded &&
    speed < 0.15 &&
    compact < 0.01 &&
    !crouching &&
    !sliding &&
    !motion.reloading &&
    !motion.firing
  ) {
    const envelope = Math.sin(celebration * Math.PI);
    const beat = Math.sin(celebration * Math.PI * 4) * envelope;
    if (rig.classId === 'assault') {
      bones.Head.rotation.z = beat * 0.16;
      bones.Head.rotation.x += envelope * 0.09;
      bones.RightUpperLeg.rotateX(Math.max(0, beat) * 0.12);
      bones.RightLowerLeg.rotateX(-Math.max(0, beat) * 0.18);
    } else if (rig.classId === 'sniper') {
      bones.Head.rotation.y = envelope * 0.22;
      bones.Head.rotation.z = -envelope * 0.1;
    } else if (rig.classId === 'scout') {
      bones.Head.rotation.z = beat * 0.14;
      for (const [side, sign] of [
        ['Left', 1],
        ['Right', -1],
      ] as const) {
        const tap = Math.max(0, beat * sign);
        bones[`${side}UpperLeg`].rotateX(tap * 0.2);
        bones[`${side}LowerLeg`].rotateX(-tap * 0.3);
      }
    } else {
      bones.Head.rotation.x += beat * 0.18;
      bones.Head.rotation.z = envelope * 0.055;
    }
  }
  if (grounded || compact > 0.01) {
    group.updateWorldMatrix(true, false);
    group.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const index of rig.body.geometry.userData.soleVertices) {
      solePoint.fromBufferAttribute(
        rig.body.geometry.attributes.position,
        index,
      );
      rig.body.applyBoneTransform(index, solePoint);
      lowest = Math.min(lowest, solePoint.y);
    }
    // The compact squat includes the curved boot edges beyond the sole samples.
    if (Number.isFinite(lowest))
      bones.Hips.position.y += (compact > 0.01 && !sliding ? 0.01 : 0) - lowest;
  }
}
