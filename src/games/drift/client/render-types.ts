import type * as THREE from 'three';
import type { ClassId } from '../shared/classes.ts';

export type Tuple3 = [number, number, number];
export type Tuple4 = [number, number, number, number];
export type BoneMap = Record<string, THREE.Bone>;
export interface HandGrip {
  palmCenter: Tuple3;
  localPalmOffset: Tuple3;
}
export interface GunAnchors {
  grip: Tuple3;
  support: Tuple3;
  sight: Tuple3;
  muzzle: Tuple3;
}
export type GunMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
> & {
  userData: { sharedModel: boolean; anchors: GunAnchors };
};
export interface CharacterRig<Gun = GunMesh> {
  kind: 'runner';
  classId: ClassId;
  bones: BoneMap;
  upper: THREE.Bone;
  head: THREE.Bone;
  arms: THREE.Bone[];
  legs: THREE.Bone[];
  phase: number;
  stride: number;
  hipsY: number;
  body: THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  gun: Gun;
  aim: THREE.Bone;
  stance: number;
  slideBlend: number;
}
export interface CharacterData<Gun = GunMesh> {
  character: CharacterRig<Gun>;
  restJointPositions: Record<string, Tuple3>;
  handGrips: Record<string, HandGrip>;
}
export type RiggedGroup<Gun = GunMesh> = THREE.Object3D & {
  userData: CharacterData<Gun>;
};
export type PracticeGroup = THREE.Group & {
  userData: { character: { kind: 'practice'; head: THREE.Object3D } };
};
export type CharacterGroup = RiggedGroup<GunMesh | null> | PracticeGroup;
export interface CharacterMotion {
  delta?: number;
  time?: number;
  reset?: boolean;
  speed?: number;
  grounded?: boolean;
  vy?: number;
  crouching?: boolean;
  sliding?: boolean;
  pitch?: number;
  reloading?: boolean;
  firing?: boolean;
  abilityTime?: number;
  abilitySeq?: number;
  shieldHealth?: number;
  dashX?: number;
  dashZ?: number;
  yaw?: number;
  celebration?: number;
}
