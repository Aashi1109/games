import { getMap } from './world.js';
import { DEFAULT_CLASS, getClass } from './classes.js';
import { getPower } from './powers.js';

export const STEP = 1 / 60;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.6;
export const CROUCH_EYE_HEIGHT = 1.0;
export const RADIUS = 0.35;
export const MAX_AMMO = getClass(DEFAULT_CLASS).magazine;
const CROUCH_HEIGHT = 1.15;
const GRAVITY = 24;
const EPSILON = 0.0001;

export function createPlayer(id, name, spawnIndex = 0, classId = DEFAULT_CLASS, map = getMap()) {
  const spawn = map.spawns[((spawnIndex % map.spawns.length) + map.spawns.length) % map.spawns.length];
  const loadout = getClass(classId);
  return {
    id, name, ...spawn, vx: 0, vy: 0, vz: 0, pitch: 0,
    classId: loadout.id, nextClassId: loadout.id,
    grounded: true, crouching: false, sliding: false, eyeHeight: EYE_HEIGHT, health: 100,
    ammo: loadout.magazine, kills: 0, deaths: 0, seq: -1, life: 0,
    respawnIn: 0, reloadIn: 0, fireCooldown: 0, padCooldown: 0,
    slideTime: 0, slideBoost: 0, slideCooldown: 0, coyoteTime: 0, jumpBuffer: 0,
    ropeId: null, ropeT: 0, ropeDirection: 1, ropeCooldown: 0, interactHeld: false,
    jumpHeld: false, crouchHeld: false, reloadHeld: false, fireHeld: false, fired: false,
    abilityCooldown: 0, abilityTime: 0, abilityHeld: false, abilitySeq: 0, abilityUsed: false,
    shieldHealth: 0, dashX: 0, dashZ: 0, dashExitSpeed: 0,
  };
}

function horizontalOverlap(p, box) {
  return p.x + RADIUS > box.x - box.w / 2 && p.x - RADIUS < box.x + box.w / 2
    && p.z + RADIUS > box.z - box.d / 2 && p.z - RADIUS < box.z + box.d / 2;
}
function verticalOverlap(p, box, height) {
  return p.y + height > box.y + EPSILON && p.y < box.y + box.h - EPSILON;
}
function clearAt(p, height, map) {
  return !map.boxes.some((box) => horizontalOverlap(p, box) && verticalOverlap(p, box, height));
}
function moveHorizontal(p, axis, amount, height, wantsMantle, map) {
  p[axis] += amount;
  for (const box of map.boxes) {
    if (!horizontalOverlap(p, box) || !verticalOverlap(p, box, height)) continue;
    const rise = box.y + box.h - p.y;
    if ((p.grounded || wantsMantle) && rise > 0 && rise <= (wantsMantle ? 1.35 : 0.4)) {
      const previousY = p.y;
      p.y = box.y + box.h;
      if (clearAt(p, height, map)) {
        p.grounded = true;
        p.vy = Math.max(0, p.vy);
        continue;
      }
      p.y = previousY;
    }
    const half = axis === 'x' ? box.w / 2 : box.d / 2;
    if (amount > 0) p[axis] = box[axis] - half - RADIUS;
    else if (amount < 0) p[axis] = box[axis] + half + RADIUS;
    p[axis === 'x' ? 'vx' : 'vz'] = 0;
  }
}

function jump(p) {
  p.vy = 8.6; p.grounded = false; p.sliding = false;
  p.slideBoost = 0; p.coyoteTime = 0; p.jumpBuffer = 0;
}

function beginSlide(p, boost) {
  p.sliding = true; p.slideTime = 0; p.slideCooldown = 1;
  p.slideBoost = boost ? Math.max(0, Math.min(2.6, 13.5 - Math.hypot(p.vx, p.vz))) : 0;
}

function updateEyeHeight(p, dt, map) {
  const target = p.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
  p.eyeHeight += (target - p.eyeHeight) * (1 - Math.exp(-12 * dt));
  // The collider crouches immediately to fit beneath cover; the sight line must fit too.
  for (const box of map.boxes) {
    if (horizontalOverlap(p, box) && box.y > p.y + EPSILON) {
      p.eyeHeight = Math.min(p.eyeHeight, Math.max(0.1, box.y - p.y - 0.08));
    }
  }
}

function ropePoint(rope, t) {
  return {
    x: rope.from.x + (rope.to.x - rope.from.x) * t,
    y: rope.from.y + (rope.to.y - rope.from.y) * t,
    z: rope.from.z + (rope.to.z - rope.from.z) * t,
  };
}

function closestRopeT(p, rope) {
  const dx = rope.to.x - rope.from.x; const dy = rope.to.y - rope.from.y; const dz = rope.to.z - rope.from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared < EPSILON) return null;
  return Math.max(0, Math.min(1, ((p.x - rope.from.x) * dx + (p.y - rope.from.y) * dy + (p.z - rope.from.z) * dz) / lengthSquared));
}

// Sweep the whole player body, including the short snap onto the line. Expanding
// solids by the collider prevents thin walls and diagonal corners being skipped.
function clearRopePath(from, to, height, map) {
  if (Math.abs(to.x) > map.size / 2 - RADIUS || Math.abs(to.z) > map.size / 2 - RADIUS
    || to.y < 0 || !clearAt(to, height, map)) return false;
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < EPSILON) return true;
  const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
  return !map.boxes.some((box) => rayBox(from, direction, {
    x: box.x, y: box.y - height + EPSILON, z: box.z,
    w: box.w + 2 * RADIUS - 2 * EPSILON, h: box.h + height - 2 * EPSILON, d: box.d + 2 * RADIUS - 2 * EPSILON,
  }) < length);
}

/** Nearby usable line, shared by prediction and the interaction prompt. */
export function getNearbyRope(p, map = getMap()) {
  if (p.health <= 0 || p.ropeId || p.ropeCooldown > EPSILON) return null;
  let nearest = null; let distance = 1.4;
  const height = p.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  for (const rope of map.ropes || []) {
    const t = closestRopeT(p, rope);
    if (t === null) continue;
    const point = ropePoint(rope, t);
    const candidate = Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z);
    if (candidate <= distance && clearRopePath(p, point, height, map)) {
      distance = candidate; nearest = rope;
    }
  }
  return nearest;
}

function attachRope(p, rope) {
  p.ropeId = rope.id; p.ropeT = closestRopeT(p, rope);
  const dx = rope.to.x - rope.from.x; const dy = rope.to.y - rope.from.y; const dz = rope.to.z - rope.from.z;
  const facing = -Math.sin(p.yaw) * Math.cos(p.pitch) * dx + Math.sin(p.pitch) * dy - Math.cos(p.yaw) * Math.cos(p.pitch) * dz;
  p.ropeDirection = p.ropeT < 0.2 ? 1 : p.ropeT > 0.8 ? -1 : facing >= 0 ? 1 : -1;
  Object.assign(p, ropePoint(rope, p.ropeT));
  p.grounded = false; p.sliding = false; p.slideBoost = 0; p.slideTime = 0;
  p.coyoteTime = 0; p.jumpBuffer = 0;
}

function releaseRope(p) {
  p.ropeId = null; p.ropeCooldown = 0.4;
  p.grounded = false; p.coyoteTime = 0;
}

function rideRope(p, dt, height, map) {
  const rope = (map.ropes || []).find((candidate) => candidate.id === p.ropeId);
  if (!rope) { releaseRope(p); return false; }
  const dx = rope.to.x - rope.from.x; const dy = rope.to.y - rope.from.y; const dz = rope.to.z - rope.from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < EPSILON) { releaseRope(p); return false; }
  const speed = rope.speed || 11;
  const t = Math.max(0, Math.min(1, p.ropeT + p.ropeDirection * speed * dt / length));
  const destination = ropePoint(rope, t);
  if (!clearRopePath(p, destination, height, map)) {
    releaseRope(p); p.vx = 0; p.vy = 0; p.vz = 0;
    return false;
  }
  Object.assign(p, destination);
  p.ropeT = t; p.grounded = false;
  p.vx = dx / length * speed * p.ropeDirection;
  p.vy = dy / length * speed * p.ropeDirection;
  p.vz = dz / length * speed * p.ropeDirection;
  if (t === 0 || t === 1) releaseRope(p);
  return true;
}

/** One deterministic fixed step; positions, health and damage never come from clients. */
export function stepPlayer(p, input, dt = STEP, map = getMap()) {
  p.fired = false;
  p.abilityUsed = false;
  p.seq = input.seq ?? p.seq;
  p.yaw = input.yaw ?? p.yaw;
  p.pitch = input.pitch ?? p.pitch;
  if (p.health <= 0) return;
  const loadout = getClass(p.classId);
  const power = getPower(p.classId);
  dt = Math.min(Math.max(dt, 0), 0.05);
  const wasDashing = p.classId === 'scout' && p.abilityTime > 0;
  p.abilityCooldown = Math.max(0, (p.abilityCooldown || 0) - dt);
  p.abilityTime = Math.max(0, (p.abilityTime || 0) - dt);
  if (p.abilityTime < EPSILON) p.abilityTime = 0;
  if (p.abilityTime === 0) p.shieldHealth = 0;
  if (wasDashing && p.abilityTime === 0) {
    const speed = Math.hypot(p.vx, p.vz);
    const retained = Math.max(10, p.dashExitSpeed || 0);
    if (speed > retained) { p.vx *= retained / speed; p.vz *= retained / speed; }
    p.dashExitSpeed = 0;
  }
  const abilityPressed = Boolean(input.ability) && !p.abilityHeld;
  p.abilityHeld = Boolean(input.ability);
  if (abilityPressed && p.abilityCooldown < EPSILON && !p.ropeId) {
    p.abilityCooldown = power.cooldown; p.abilityTime = power.duration;
    p.abilitySeq = (p.abilitySeq || 0) + 1; p.abilityUsed = true;
    if (p.classId === 'heavy') p.shieldHealth = power.health;
    if (p.classId === 'scout') {
      p.dashExitSpeed = Math.hypot(p.vx, p.vz);
      let forward = input.forward || 0; let strafe = input.strafe || 0;
      if (Math.hypot(forward, strafe) < EPSILON) forward = 1;
      const length = Math.hypot(forward, strafe);
      forward /= length; strafe /= length;
      p.dashX = -Math.sin(p.yaw) * forward + Math.cos(p.yaw) * strafe;
      p.dashZ = -Math.cos(p.yaw) * forward - Math.sin(p.yaw) * strafe;
      p.sliding = false; p.slideBoost = 0;
    }
  }
  const dashing = p.classId === 'scout' && p.abilityTime > 0;
  const weaponBlocked = dashing || (p.classId === 'heavy' && p.abilityTime > 0 && p.shieldHealth > 0);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.padCooldown = Math.max(0, p.padCooldown - dt);
  p.ropeCooldown = Math.max(0, (p.ropeCooldown || 0) - dt);
  p.slideCooldown = Math.max(0, p.slideCooldown - dt);
  p.coyoteTime = p.grounded ? 0.1 : Math.max(0, p.coyoteTime - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.reloadIn > 0) {
    p.reloadIn = Math.max(0, p.reloadIn - dt);
    if (p.reloadIn < EPSILON) { p.reloadIn = 0; p.ammo = loadout.magazine; }
  }
  const interactPressed = Boolean(input.interact) && !p.interactHeld;
  p.interactHeld = Boolean(input.interact);
  const jumpPressed = Boolean(input.jump) && !p.jumpHeld;
  const crouchPressed = Boolean(input.crouch) && !p.crouchHeld;
  const reloadPressed = Boolean(input.reload) && !p.reloadHeld;
  const firePressed = Boolean(input.fire) && !p.fireHeld;
  p.jumpHeld = Boolean(input.jump);
  p.crouchHeld = Boolean(input.crouch);
  p.reloadHeld = Boolean(input.reload);
  p.fireHeld = Boolean(input.fire);
  if (jumpPressed) p.jumpBuffer = 0.12;
  p.crouching = Boolean(input.crouch) || !clearAt(p, PLAYER_HEIGHT, map);
  const height = p.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;

  if (reloadPressed && p.ammo < loadout.magazine && !p.reloadIn) p.reloadIn = loadout.reloadTime;
  if (!weaponBlocked && input.fire && (loadout.automatic || firePressed) && !p.reloadIn && p.fireCooldown < EPSILON && p.ammo > 0) {
    p.ammo -= 1; p.fireCooldown = loadout.fireInterval; p.fired = true;
  }
  if (p.ammo === 0 && !p.reloadIn) p.reloadIn = loadout.reloadTime;

  if (p.ropeId && (interactPressed || jumpPressed)) {
    releaseRope(p);
    if (jumpPressed) { p.vy = Math.max(p.vy, 8.6); p.jumpBuffer = 0; }
  } else if (!p.ropeId && interactPressed && !jumpPressed && !dashing && !(p.classId === 'heavy' && p.abilityTime > 0)) {
    const rope = getNearbyRope(p, map);
    if (rope) attachRope(p, rope);
  }
  if (p.ropeId && rideRope(p, dt, height, map)) {
    updateEyeHeight(p, dt, map);
    return;
  }

  let forward = input.forward || 0;
  let strafe = input.strafe || 0;
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const dx = -Math.sin(p.yaw) * forward + Math.cos(p.yaw) * strafe;
  const dz = -Math.cos(p.yaw) * forward - Math.sin(p.yaw) * strafe;
  const speed = p.crouching ? 3.2 : input.sprint ? 10 : 7;
  const horizontalSpeed = Math.hypot(p.vx, p.vz);
  if (crouchPressed && p.grounded && horizontalSpeed > 6 && p.slideCooldown === 0) {
    beginSlide(p, true);
  }
  // Resolve jumps before ground acceleration so releasing crouch never erases slide momentum.
  if (p.jumpBuffer > 0 && p.coyoteTime > 0) jump(p);
  if (!input.crouch || !p.grounded || Math.hypot(p.vx, p.vz) <= 3.4) {
    p.sliding = false; p.slideBoost = 0;
  }
  if (dashing) {
    const burstSpeed = Math.max(power.speed, p.dashExitSpeed || 0);
    p.vx = p.dashX * burstSpeed; p.vz = p.dashZ * burstSpeed;
    p.sliding = false; p.slideBoost = 0;
  } else if (p.sliding) {
    const angle = Math.atan2(p.vx, p.vz);
    const wanted = magnitude > 0 ? Math.atan2(dx, dz) : angle;
    const turn = Math.atan2(Math.sin(wanted - angle), Math.cos(wanted - angle));
    const direction = angle + Math.max(-1.6 * dt, Math.min(1.6 * dt, turn));
    const push = Math.min(p.slideBoost, 20 * dt);
    p.slideBoost -= push;
    const momentum = (Math.hypot(p.vx, p.vz) + push) * Math.exp(-dt);
    p.vx = Math.sin(direction) * momentum; p.vz = Math.cos(direction) * momentum;
  } else if (p.grounded) {
    const changeX = dx * speed - p.vx; const changeZ = dz * speed - p.vz;
    const acceleration = magnitude === 0 ? 30 : horizontalSpeed > speed ? 18 : 42;
    const blend = Math.min(1, acceleration * dt / (Math.hypot(changeX, changeZ) || 1));
    p.vx += changeX * blend; p.vz += changeZ * blend;
  } else if (magnitude > 0) {
    // Air steering changes direction without deleting jump-pad or slide momentum.
    const currentSpeed = Math.hypot(p.vx, p.vz);
    p.vx += dx * 10 * dt; p.vz += dz * 10 * dt;
    const limit = Math.max(input.sprint ? 10 : 7, currentSpeed);
    const nextSpeed = Math.hypot(p.vx, p.vz);
    if (nextSpeed > limit) { p.vx *= limit / nextSpeed; p.vz *= limit / nextSpeed; }
  }
  p.slideTime = p.sliding ? p.slideTime + dt : 0;
  for (const pad of map.pads) {
    if (p.padCooldown === 0 && Math.abs(p.y - pad.y) < 0.3 && Math.hypot(p.x - pad.x, p.z - pad.z) < pad.radius) {
      p.vx = pad.vx; p.vy = pad.vy; p.vz = pad.vz;
      p.grounded = false; p.sliding = false; p.padCooldown = 1;
      p.slideBoost = 0; p.coyoteTime = 0; p.jumpBuffer = 0;
    }
  }
  const wasGrounded = p.grounded;
  // Substeps smaller than the player radius prevent fast bursts and blast
  // impulses from skipping thin walls. Ordinary movement keeps its old one-step path.
  const movementSteps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vz)) * dt / .3));
  for (let step = 0; step < movementSteps; step++) {
    moveHorizontal(p, 'x', p.vx * dt / movementSteps, height, !dashing && Boolean(input.jump), map);
    moveHorizontal(p, 'z', p.vz * dt / movementSteps, height, !dashing && Boolean(input.jump), map);
  }
  p.vy -= GRAVITY * dt;
  const previousY = p.y;
  p.y += p.vy * dt;
  p.grounded = false;
  for (const box of map.boxes) {
    if (!horizontalOverlap(p, box)) continue;
    const top = box.y + box.h;
    if (p.vy <= 0 && previousY >= top - EPSILON && p.y <= top + EPSILON) {
      p.y = top; p.vy = 0; p.grounded = true;
    } else if (verticalOverlap(p, box, height) && p.vy > 0 && previousY + height <= box.y + EPSILON) {
      p.y = box.y - height; p.vy = 0;
    }
  }
  p.x = Math.max(-map.size / 2 + RADIUS, Math.min(map.size / 2 - RADIUS, p.x));
  p.z = Math.max(-map.size / 2 + RADIUS, Math.min(map.size / 2 - RADIUS, p.z));
  if (p.y < 0) { p.y = 0; p.vy = 0; p.grounded = true; }
  if (p.grounded && p.jumpBuffer > 0) jump(p);
  else if (!wasGrounded && p.grounded && input.crouch && Math.hypot(p.vx, p.vz) > 6) {
    // A crouched landing continues existing momentum without granting another entry boost.
    beginSlide(p, false);
  }
  updateEyeHeight(p, dt, map);
}

export function shotRay(p) {
  const pitchCos = Math.cos(p.pitch);
  return {
    origin: { x: p.x, y: p.y + p.eyeHeight, z: p.z },
    direction: { x: -Math.sin(p.yaw) * pitchCos, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * pitchCos },
  };
}

function rayBox(origin, direction, box, normal) {
  let near = 0; let far = 100;
  let nearAxis; let nearSign; let farAxis; let farSign;
  for (const [axis, width] of [['x', 'w'], ['y', 'h'], ['z', 'd']]) {
    const minimum = axis === 'y' ? box.y : box[axis] - box[width] / 2;
    const maximum = minimum + box[width];
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < minimum || origin[axis] > maximum) return Infinity;
    } else {
      const a = (minimum - origin[axis]) / direction[axis];
      const b = (maximum - origin[axis]) / direction[axis];
      const entry = Math.min(a, b); const exit = Math.max(a, b);
      if (entry >= near) { near = entry; nearAxis = axis; nearSign = a < b ? -1 : 1; }
      if (exit <= far) { far = exit; farAxis = axis; farSign = a < b ? 1 : -1; }
      if (near > far) return Infinity;
    }
  }
  if (normal) {
    normal.x = normal.y = normal.z = 0;
    // An origin inside solid cover still blocks at zero, but has no surface to mark.
    const axis = nearAxis ?? (far === 0 ? farAxis : undefined);
    if (axis) normal[axis] = nearAxis ? nearSign : farSign;
  }
  return near;
}

export function traceShot(shooter, players, map = getMap()) {
  const { origin, direction } = shotRay(shooter);
  let distance = 100; let hit; let surface;
  const normal = { x: 0, y: 0, z: 0 };
  for (const box of map.boxes) {
    const candidate = rayBox(origin, direction, box, normal);
    if (candidate < distance) {
      distance = candidate;
      surface = normal.x || normal.y || normal.z ? { normal: { ...normal }, style: box.style } : undefined;
    }
  }
  for (const player of players) {
    if (player.id === shooter.id || player.health <= 0) continue;
    const candidate = rayBox(origin, direction, { x: player.x, y: player.y, z: player.z, w: RADIUS * 2, h: player.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT, d: RADIUS * 2 });
    if (candidate < distance) { distance = candidate; hit = player.id; surface = undefined; }
  }
  for (const target of map.targets) {
    const candidate = rayBox(origin, direction, { ...target, y: target.y + 0.1, w: 0.8, h: 1.8, d: 0.35 });
    if (candidate < distance) { distance = candidate; hit = target.id; surface = undefined; }
  }
  return {
    from: origin,
    to: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance },
    ...(hit ? { hit } : {}),
    ...(surface ? { surface } : {}),
  };
}
