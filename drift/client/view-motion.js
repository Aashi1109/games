import { EYE_HEIGHT, RADIUS, STEP } from '../shared/simulation.js';
import { getMap } from '../shared/world.js';
import { getPower } from '../shared/powers.js';

const blend = (rate, dt) => 1 - Math.exp(-rate * dt);
const pose = (p) => ({ x: p.x, y: p.y, z: p.z, eye: p.eyeHeight ?? EYE_HEIGHT, grounded: p.grounded, vy: p.vy });

// Presentation only: interpolate fixed ticks without delaying mouse aim or changing physics.
export function createViewMotion() {
  let previous = null;
  let stepOffset = 0, landingTarget = 0, landingOffset = 0;
  let phase = 0, bobWeight = 0, slide = 0;
  const result = {};
  return {
    reset(player) {
      previous = player ? pose(player) : null;
      stepOffset = landingTarget = landingOffset = phase = bobWeight = slide = 0;
    },
    beforeStep(player) { previous = pose(player); },
    afterStep(player, dt = STEP) {
      if (!previous) return;
      const rise = player.y - previous.y - Math.max(0, player.vy) * dt;
      // Steps and mantles can change collision height instantly; let the view catch up.
      if (rise > 0.08) {
        stepOffset = Math.max(-1.35, stepOffset - rise);
        previous.y += rise;
      }
      if (player.grounded && !previous.grounded && previous.vy < -2) {
        landingTarget = Math.min(0.07, -previous.vy * 0.005);
      }
    },
    reconcile(oldPlayer, player) {
      if (!previous) return;
      previous.x += player.x - oldPlayer.x;
      previous.y += player.y - oldPlayer.y;
      previous.z += player.z - oldPlayer.z;
      previous.eye += (player.eyeHeight ?? EYE_HEIGHT) - (oldPlayer.eyeHeight ?? EYE_HEIGHT);
    },
    sample(player, alpha, dt, motion = true, aiming = false, correction, map = getMap()) {
      if (!previous) previous = pose(player);
      alpha = Math.max(0, Math.min(1, alpha));
      dt = Math.max(0, Math.min(0.1, dt));
      const speed = Math.hypot(player.vx, player.vz);
      stepOffset *= Math.exp(-dt * 16);
      slide += (Number(player.sliding && motion) - slide) * blend(14, dt);
      bobWeight += (Number(player.grounded && !player.sliding && speed > 0.8 && motion) - bobWeight) * blend(18, dt);
      phase += speed * dt * 1.5;
      landingTarget *= Math.exp(-dt * 12);
      landingOffset += (landingTarget - landingOffset) * blend(28, dt);
      if (!motion) { slide = bobWeight = landingTarget = landingOffset = 0; }
      const bob = Math.sin(phase) * 0.012 * bobWeight * Math.min(1, speed / 7) * (aiming ? 0.2 : 1);
      result.x = previous.x + (player.x - previous.x) * alpha;
      result.z = previous.z + (player.z - previous.z) * alpha;
      result.y = previous.y + (player.y - previous.y) * alpha + stepOffset
        + previous.eye + ((player.eyeHeight ?? EYE_HEIGHT) - previous.eye) * alpha
        + bob - landingOffset * (aiming ? 0.2 : 1);
      if (correction) {
        result.x += correction.x; result.y += correction.y; result.z += correction.z;
      }
      // Keep a transitioning view out of a climbed ledge and below low overhead cover.
      result.y = Math.max(player.y + 0.1, result.y);
      for (const box of map.boxes) {
        if (box.y > player.y && Math.abs(result.x - box.x) < box.w / 2 + RADIUS
          && Math.abs(result.z - box.z) < box.d / 2 + RADIUS) {
          result.y = Math.min(result.y, box.y - 0.08);
        }
      }
      result.roll = -slide * 0.008 * (aiming ? 0.2 : 1);
      const juke = motion && !aiming && player.health > 0 && player.classId === 'scout' && player.abilityTime > 0
        ? Math.sin(Math.PI * Math.min(1, player.abilityTime / getPower('scout').duration)) : 0;
      const side = (player.dashX || 0) * Math.cos(player.yaw) - (player.dashZ || 0) * Math.sin(player.yaw);
      result.roll -= side * juke * .035;
      result.powerFov = juke * 5;
      result.slide = slide;
      result.moving = bobWeight * Math.min(1, speed / 11);
      result.phase = phase;
      return result;
    },
  };
}
