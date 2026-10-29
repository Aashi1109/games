import type { Vec3 } from '../shared/types.ts';
// One short effect is reused for incoming hits, including sustained fire.
export function createDamageFeedback(root: ParentNode = document) {
  const flash = root.querySelector<HTMLElement>('#damage-flash')!;
  const direction = root.querySelector<HTMLElement>('#damage-direction')!;
  const duration = 0.7;
  let remaining = 0;
  let strength = 0;
  let source: Pick<Vec3, 'x' | 'z'> | null = null;

  function reset() {
    remaining = 0;
    source = null;
    flash.style.opacity = '0';
    direction.hidden = true;
  }

  return {
    hit(amount: number, origin?: Partial<Vec3> | null) {
      if (!Number.isFinite(amount) || amount <= 0) return;
      remaining = duration;
      strength = Math.min(0.72, 0.35 + amount * 0.006);
      source =
        Number.isFinite(origin?.x) && Number.isFinite(origin?.z)
          ? { x: origin!.x!, z: origin!.z! }
          : null;
    },
    update(delta: number, player: Vec3 | null, yaw: number, animate = true) {
      remaining = Math.max(0, remaining - Math.max(0, delta));
      const fade = remaining / duration;
      // Reduced motion keeps a quiet, static hit cue without a screen pulse.
      flash.style.opacity = String(
        animate ? strength * fade : remaining > 0 ? 0.14 : 0,
      );
      direction.hidden = !remaining || !source || !player;
      if (direction.hidden || !source || !player) return;
      const angle = Math.atan2(source.x - player.x, player.z - source.z) + yaw;
      direction.style.setProperty('--damage-angle', `${angle}rad`);
      direction.style.opacity = String(animate ? Math.min(1, fade * 1.5) : 1);
    },
    reset,
  };
}
