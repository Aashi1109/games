// Local targeting is presentation only. The server still receives a single
// ordinary ability request and validates the throw, cooldown and trajectory.
export function createBlastInput() {
  let aiming = false, queued = null, life;
  const ready = (player, active) => active && player?.classId === 'assault' && player.health > 0
    && player.abilityCooldown <= 0 && !player.ropeId;
  const cancel = () => { aiming = false; queued = null; life = undefined; };
  function sync(player, active = true) {
    if (!ready(player, active) || ((aiming || queued) && player.life !== life)) cancel();
    return aiming;
  }
  return {
    get aiming() { return aiming; },
    cancel,
    sync,
    toggle(player, active = true) {
      sync(player, active);
      if (aiming || queued) cancel();
      else if (ready(player, active)) { aiming = true; life = player.life; }
      return aiming;
    },
    confirm(player, validLanding, aim = player) {
      if (!sync(player) || !validLanding) return false;
      aiming = false; queued = { yaw: aim.yaw, pitch: aim.pitch };
      return true;
    },
    takeThrow(player, active = true) {
      sync(player, active);
      const requested = queued; queued = null;
      return requested;
    },
  };
}
