// One short effect is reused for incoming hits, including sustained fire.
export function createDamageFeedback(root = document) {
  const flash = root.querySelector('#damage-flash');
  const direction = root.querySelector('#damage-direction');
  const duration = 0.7;
  let remaining = 0;
  let strength = 0;
  let source = null;

  function reset() {
    remaining = 0;
    source = null;
    flash.style.opacity = '0';
    direction.hidden = true;
  }

  return {
    hit(amount, origin) {
      if (!Number.isFinite(amount) || amount <= 0) return;
      remaining = duration;
      strength = Math.min(0.72, 0.35 + amount * 0.006);
      source = Number.isFinite(origin?.x) && Number.isFinite(origin?.z) ? { x: origin.x, z: origin.z } : null;
    },
    update(delta, player, yaw, animate = true) {
      remaining = Math.max(0, remaining - Math.max(0, delta));
      const fade = remaining / duration;
      // Reduced motion keeps a quiet, static hit cue without a screen pulse.
      flash.style.opacity = String(animate ? strength * fade : remaining > 0 ? 0.14 : 0);
      direction.hidden = !remaining || !source || !player;
      if (direction.hidden) return;
      const angle = Math.atan2(source.x - player.x, player.z - source.z) + yaw;
      direction.style.setProperty('--damage-angle', `${angle}rad`);
      direction.style.opacity = String(animate ? Math.min(1, fade * 1.5) : 1);
    },
    reset,
  };
}
