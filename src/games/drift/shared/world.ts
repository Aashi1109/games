import type { Box, ArenaMap } from './types.ts';
export type MapId =
  'solstice' | 'canyon-relay' | 'freight-yard' | 'sky-garden' | 'vertex';
import { canyonRelay } from './maps/canyon-relay.ts';
import { freightYard } from './maps/freight-yard.ts';
import { skyGarden } from './maps/sky-garden.ts';
import { vertex } from './maps/vertex.ts';

export const WORLD_SIZE = 64;
// Boxes use center coordinates; y is the bottom face. Shared by rendering and collision.
export const BOXES: Box[] = [
  { x: 0, y: -1, z: 0, w: 64, h: 1, d: 64, style: 'floor' },
  { x: -32, y: 0, z: 0, w: 1, h: 6, d: 64, style: 'wall' },
  { x: 32, y: 0, z: 0, w: 1, h: 6, d: 64, style: 'wall' },
  { x: 0, y: 0, z: -32, w: 64, h: 6, d: 1, style: 'wall' },
  { x: 0, y: 0, z: 32, w: 64, h: 6, d: 1, style: 'wall' },
  { x: -16, y: 0, z: -11, w: 13, h: 4, d: 12, style: 'terrace' },
  { x: 17, y: 0, z: 12, w: 12, h: 4, d: 12, style: 'terrace' },
  { x: -8.5, y: 0, z: -11, w: 2, h: 3, d: 7, style: 'step' },
  { x: -6.5, y: 0, z: -11, w: 2, h: 2, d: 7, style: 'step' },
  { x: -4.5, y: 0, z: -11, w: 2, h: 1, d: 7, style: 'step' },
  { x: 9.5, y: 0, z: 12, w: 3, h: 3, d: 6, style: 'step' },
  { x: 7, y: 0, z: 12, w: 2, h: 2, d: 6, style: 'step' },
  { x: 5, y: 0, z: 12, w: 2, h: 1, d: 6, style: 'step' },
  { x: 0, y: 0, z: 0, w: 8, h: 1.2, d: 8, style: 'center' },
  { x: -2.8, y: 1.2, z: 0, w: 1.2, h: 4.6, d: 1.2, style: 'pillar' },
  { x: 2.8, y: 1.2, z: 0, w: 1.2, h: 4.6, d: 1.2, style: 'pillar' },
  { x: 0, y: 5.8, z: 0, w: 7, h: 0.7, d: 2, style: 'beam' },
  { x: -20, y: 0, z: 11, w: 6, h: 2.5, d: 2.5, style: 'cover' },
  { x: 18, y: 0, z: -13, w: 3, h: 2.5, d: 7, style: 'cover' },
  { x: 1, y: 0, z: -24, w: 8, h: 1.6, d: 2.5, style: 'cover' },
  { x: -4, y: 0, z: 24, w: 8, h: 1.6, d: 2.5, style: 'cover' },
];
export const PADS = [
  { x: -25, y: 0, z: 18, radius: 1.8, vx: 3, vy: 16, vz: -8 },
  { x: 25, y: 0, z: -20, radius: 1.8, vx: -3, vy: 16, vz: 8 },
];
export const SPAWNS = [
  { x: 0, y: 0, z: 22, yaw: 0 },
  { x: -24, y: 0, z: -24, yaw: -2.3 },
  { x: 24, y: 0, z: 24, yaw: 0.8 },
  { x: 24, y: 0, z: -24, yaw: 2.3 },
  { x: -24, y: 0, z: 24, yaw: -0.8 },
  { x: 0, y: 0, z: -20, yaw: Math.PI },
];
export const TARGETS = [
  { id: 'target-a', x: -14, y: 4, z: -13 },
  { id: 'target-b', x: 17, y: 4, z: 12 },
  { id: 'target-c', x: 10, y: 0, z: -23 },
];
export const ZONES = [
  { id: 'zone-a', x: -14, z: -13, radius: 6 },
  { id: 'zone-b', x: 17, z: 12, radius: 6 },
  { id: 'zone-c', x: 10, z: -23, radius: 6 },
];

export const DEFAULT_MAP = 'solstice';
export const MAPS: Readonly<Record<MapId, ArenaMap>> = Object.freeze({
  solstice: {
    id: 'solstice',
    name: 'Solstice',
    subtitle: 'TRAINING / SUNLIT COURT',
    description:
      'The original compact training court. Learn to slide, mantle, and chain launch pads.',
    size: WORLD_SIZE,
    boxes: BOXES,
    pads: PADS,
    spawns: SPAWNS,
    targets: TARGETS,
    zones: ZONES,
    ropes: [],
    theme: { sky: '#bdd4dc', fog: '#bdd4dc', ground: '#adb6a9', palette: {} },
    preview: {
      position: { x: 35, y: 29, z: 38 },
      target: { x: 0, y: 0, z: 0 },
    },
  },
  'canyon-relay': canyonRelay(),
  'freight-yard': freightYard(),
  'sky-garden': skyGarden(),
  vertex: vertex(),
});
export function isMapId(id: unknown): id is MapId {
  return typeof id === 'string' && Object.hasOwn(MAPS, id);
}
export function getMap(id: unknown = DEFAULT_MAP) {
  return isMapId(id) ? MAPS[id] : MAPS[DEFAULT_MAP];
}
