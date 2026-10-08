import { getPower } from '../shared/powers.js';

/** Keep availability, prompts and cooldown feedback consistent for every class. */
export function getAbilityHudState(player, { aiming = false, preview = null, deployed = false } = {}) {
  const power = getPower(player.classId);
  const cooldown = Math.max(0, player.abilityCooldown || 0);
  const progress = Math.max(0, 1 - Math.min(1, cooldown / power.cooldown));
  const result = (state, status, hint) => ({ state, status, hint, progress,
    ready: state === 'ready', active: ['aiming', 'active', 'deployed'].includes(state) });
  if (player.health <= 0) return result('dead', 'RESPAWNING', 'Back in the fight soon');
  if (player.ropeId) return result('blocked', 'ON ROPE', 'Release with E to use power');
  if (aiming) return result('aiming', preview?.landed ? 'AIMING' : 'AIM LOWER',
    preview?.landed ? `${Math.round(preview.distance)}m · LMB throw · RMB cancel` : 'Find a surface · RMB cancel');
  if (player.abilityTime > 0 && player.classId === 'heavy') {
    return result('active', `${Math.ceil(player.shieldHealth)} SHIELD`, `${player.abilityTime.toFixed(1)}s remaining`);
  }
  if (deployed) return result('deployed', 'DEPLOYED', 'Power in play');
  if (player.abilityTime > 0) return result('active', 'ACTIVE', `${player.abilityTime.toFixed(1)}s remaining`);
  if (cooldown > 0) return result('cooldown', `${Math.ceil(cooldown)}s`, 'RECHARGING');
  return result('ready', 'READY', player.classId === 'assault' ? 'PRESS Q TO AIM' : 'PRESS Q TO USE');
}
