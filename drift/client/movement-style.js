// Cosmetic recognition only: prediction never awards damage, speed or score.
export function createMovementStyle() {
  let playerId, life, ropeId, padCooldown = 0, expires = 0, landedAt;
  function reset() { playerId = undefined; life = undefined; ropeId = null; padCooldown = 0; expires = 0; landedAt = undefined; }
  return {
    reset,
    update(player, now) {
      if (!player || player.health <= 0) { reset(); return null; }
      if (playerId !== player.id || life !== player.life) {
        reset(); playerId = player.id; life = player.life;
        ropeId = player.ropeId; padCooldown = player.padCooldown;
        return null;
      }
      if (!player.grounded && ((ropeId && !player.ropeId) || player.padCooldown > padCooldown + .25)) {
        expires = now + 6000; landedAt = undefined;
      }
      ropeId = player.ropeId; padCooldown = player.padCooldown;
      if (expires && player.grounded && landedAt === undefined) landedAt = now;
      if (now > expires || (landedAt !== undefined && now - landedAt > 650)) expires = 0;
      if (expires && player.grounded && player.sliding && Math.hypot(player.vx, player.vz) > 3.4) {
        expires = 0;
        return 'SMOOTH OPERATOR';
      }
      return null;
    },
  };
}
