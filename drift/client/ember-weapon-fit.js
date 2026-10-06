// Fits the actual AR mesh to the approved Ember carry pose. This transform
// matches stock center (83,276), muzzle (337,539), and trigger grip (147,369)
// in the native reference image. The original support marker then falls at
// (246.68,455.47), without the earlier forward-marker offset.
export function fitEmberWeapon(weapon) {
  weapon.scale.setScalar(0.8309586661973839);
  weapon.rotation.set(-0.7155938316909094, 0.6631135374512233, -0.792909081992158, 'YXZ');
  weapon.position.set(0.16882470131127014, 1.1717330802330381, -0.3267033537580212);
  weapon.updateMatrixWorld(true);
  return weapon;
}
