export const DEFAULT_CLASS = 'assault';

export const CLASSES = Object.freeze({
  assault: Object.freeze({
    id: 'assault', name: 'Assault', character: 'Ember', weapon: 'AR-01', mode: 'AUTO',
    description: 'Automatic rifle. Stay mobile and keep the pressure on.',
    damage: 20, magazine: 24, fireInterval: 0.15, reloadTime: 1.35,
    automatic: true, aimFov: 66, recoil: 1, color: '#df5938',
  }),
  sniper: Object.freeze({
    id: 'sniper', name: 'Sniper', character: 'Wisp', weapon: 'SR-02', mode: 'BOLT',
    description: 'Scoped rifle. Powerful shots with time to line up the next.',
    damage: 80, magazine: 6, fireInterval: 1.05, reloadTime: 2.2,
    automatic: false, aimFov: 30, recoil: 1.8, color: '#52798a',
  }),
  scout: Object.freeze({
    id: 'scout', name: 'Scout', character: 'Dash', weapon: 'SMG-03', mode: 'AUTO',
    description: 'Fast-firing SMG. Close the distance and stay in motion.',
    damage: 14, magazine: 36, fireInterval: 0.09, reloadTime: 1.6,
    automatic: true, aimFov: 70, recoil: 0.65, color: '#bc9b51',
  }),
  heavy: Object.freeze({
    id: 'heavy', name: 'Heavy', character: 'Rook', weapon: 'LMG-04', mode: 'AUTO',
    description: 'Heavy machine gun. Sustained fire with a longer reload.',
    damage: 26, magazine: 60, fireInterval: 0.2, reloadTime: 3.2,
    automatic: true, aimFov: 58, recoil: 1.25, color: '#6c8660',
  }),
});

export function isClassId(id) {
  return typeof id === 'string' && Object.hasOwn(CLASSES, id);
}

export function getClass(id) {
  return CLASSES[isClassId(id) ? id : DEFAULT_CLASS];
}
