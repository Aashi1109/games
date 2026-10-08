import { getPower } from '../shared/powers.js';

const MAX_TRACKED = 64;
const STEP_DISTANCE = 2.1;
const ECHO_INTERVAL = .7;
const positionValid = (p) => p && ['x', 'y', 'z'].every((axis) => Number.isFinite(p[axis]));
const identity = (p) => p ? `${p.id}:${p.life}:${p.classId}` : null;
const dashing = (p) => p.classId === 'scout' && p.abilityTime > 0;
const walking = (p) => p.health > 0 && p.grounded && !p.sliding && !p.ropeId && !dashing(p);
const travelled = (a, b) => positionValid(a) && positionValid(b) ? Math.hypot(b.x - a.x, b.z - a.z) : 0;

/** Distance uses all three axes; stereo bearing follows the listener's yaw. */
export function spatialAudio(source, listener, radius = 45) {
  if (!positionValid(source) || !positionValid(listener) || !Number.isFinite(radius) || radius <= 0) return null;
  const yaw = listener.yaw ?? 0;
  if (!Number.isFinite(yaw)) return null;
  const dx = source.x - listener.x, dy = source.y - listener.y, dz = source.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= radius) return null;
  const horizontal = Math.hypot(dx, dz);
  return {
    volume: (1 - distance / radius) ** 2,
    pan: horizontal > 1e-6 ? Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / horizontal)) : 0,
  };
}

/** Live prediction emits local one-shots. Snapshot reconciliation only syncs state. */
export function createAudioFeedback(audio) {
  let localIdentity = null, reloading = false, sliding = false, stepDistance = 0;
  let listenerIdentity = null;
  let remotePlayers = new Map(), echoes = new Map();

  function stopLocal() {
    if (reloading) audio.stopReload();
    if (sliding) audio.setSliding(false);
    localIdentity = null; reloading = sliding = false; stepDistance = 0;
  }

  function sync(player, active = true) {
    if (!active || !player || player.health <= 0) { stopLocal(); return false; }
    if (localIdentity !== identity(player)) { stopLocal(); localIdentity = identity(player); }
    if (player.reloadIn > 0) {
      // A failed start means buffers are not ready yet; retry with remaining time.
      if (!reloading) reloading = Boolean(audio.startReload(player.classId, player.reloadIn));
    } else if (reloading) { audio.stopReload(); reloading = false; }
    const nextSlide = Boolean(player.sliding && player.grounded && !player.ropeId && !dashing(player));
    // The engine retries a missing slide buffer while this state stays enabled.
    if (nextSlide || sliding) audio.setSliding(nextSlide);
    sliding = nextSlide;
    return true;
  }

  function step(before, player, input, dt, active = true) {
    const live = active && player?.health > 0 && before?.health > 0 && identity(before) === identity(player);
    if (!live) { sync(player, active); return; }
    if (player.fired) audio.play('fire', { classId: player.classId });
    // Empty-magazine reload cancels a sniper's just-scheduled bolt cycle.
    sync(player, active);
    const blocked = dashing(player) || (player.classId === 'heavy' && player.abilityTime > 0 && player.shieldHealth > 0);
    if (input.fire && !before.fireHeld && before.ammo === 0 && before.reloadIn <= 0
      && (before.fireCooldown || 0) <= (Number.isFinite(dt) ? dt : 0) && !player.fired && !blocked) {
      audio.play('dry-fire');
    }
    const distance = travelled(before, player);
    const stepTime = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
    if (!walking(before) || !walking(player) || distance <= 0 || distance > Math.max(.5, stepTime * 40)) {
      stepDistance = 0; return;
    }
    stepDistance += distance;
    const stride = player.crouching ? 1.65 : input.sprint ? 2.7 : STEP_DISTANCE;
    if (stepDistance >= stride) {
      stepDistance %= stride;
      audio.play('footstep', { volume: player.crouching ? .35 : input.sprint ? .75 : .6 });
    }
  }

  function playAt(kind, source, listener, radius, volume = 1, options = {}) {
    const spatial = spatialAudio(source, listener, radius);
    if (spatial) audio.play(kind, { ...options, ...spatial, volume: spatial.volume * volume, local: false });
  }

  function observe(players, effects, listener, { active = true } = {}) {
    if (!active || !positionValid(listener)) {
      listenerIdentity = null; remotePlayers.clear(); echoes.clear(); return;
    }
    if (listenerIdentity !== identity(listener)) {
      remotePlayers.clear(); echoes.clear(); listenerIdentity = identity(listener);
    }
    const nextPlayers = new Map();
    for (const player of (players || []).slice(0, MAX_TRACKED)) {
      if (player.id === listener.id || player.health <= 0 || !positionValid(player)) continue;
      const previous = remotePlayers.get(player.id);
      const next = { state: { ...player }, distance: 0, slideDistance: 0 };
      nextPlayers.set(player.id, next);
      if (!previous || identity(previous.state) !== identity(player)) continue;
      const distance = travelled(previous.state, player);
      // Teleports, respawns and stale snapshots must not produce a burst of steps.
      if (distance <= 0 || distance > 3 || Math.abs(player.y - previous.state.y) > 3) continue;
      if (player.sliding && player.grounded && !player.ropeId && !dashing(player)) {
        next.slideDistance = previous.slideDistance + distance;
        if (!previous.state.sliding || next.slideDistance >= 5) {
          next.slideDistance %= 5;
          playAt('slide', player, listener, 12, .45);
        }
      } else if (walking(player) && walking(previous.state)) {
        next.distance = previous.distance + distance;
        const stride = player.crouching ? 1.65 : STEP_DISTANCE;
        if (next.distance >= stride) {
          next.distance %= stride;
          playAt('footstep', player, listener, 12, player.crouching ? .2 : .45);
        }
      }
    }
    remotePlayers = nextPlayers;
    const nextEchoes = new Map();
    for (const effect of (effects || []).slice(0, MAX_TRACKED)) {
      if (effect.type !== 'echo' || !positionValid(effect) || !Number.isFinite(effect.remaining) || effect.remaining <= 0) continue;
      const elapsed = Math.max(0, getPower('sniper').duration - effect.remaining);
      const pulse = Math.floor((elapsed + 1e-6) / ECHO_INTERVAL);
      const previous = echoes.get(effect.id);
      nextEchoes.set(effect.id, pulse);
      // Start observing at the current pulse; never replay earlier decoy shots.
      if (previous !== undefined && pulse === previous + 1) {
        playAt('fire', effect, listener, 35, .55, { classId: effect.classId || 'sniper' });
      }
    }
    echoes = nextEchoes;
  }

  function remoteShot(event, listener) {
    if (event?.type !== 'shot' || !listener || !event.id || event.id === listener.id) return;
    playAt('fire', event.from, listener, 45, .8, { classId: event.classId });
  }

  function clear() {
    audio.stopAll();
    localIdentity = listenerIdentity = null;
    reloading = sliding = false; stepDistance = 0;
    remotePlayers.clear(); echoes.clear();
  }

  return { step, sync, observe, remoteShot, clear };
}
