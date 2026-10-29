import type { ClassId } from './classes.ts';
import type {
  Player,
  Vec3,
  Box,
  ArenaMap,
  PowerEffect,
  BlastEffect,
  EchoEffect,
  PowerEvent,
  Shot,
} from './types.ts';
const POWERS = Object.freeze({
  assault: Object.freeze({
    id: 'blast-pop',
    name: 'Blast Pop',
    description:
      'Q to aim, left-click to throw; right-click to cancel. The puck sticks, then launches nearby players after a short warning. Aim down for a self-launch. No damage.',
    cooldown: 12,
    duration: 4.65,
    fuse: 0.65,
    maxFlight: 4,
    radius: 4.5,
    throwSpeed: 15,
    throwLift: 4.5,
    color: '#f99a50',
  }),
  sniper: Object.freeze({
    id: 'echo',
    name: 'Echo',
    description:
      'Send a running hologram ahead. Its fake shots deal no damage; a hit makes it glitch away.',
    cooldown: 12,
    duration: 4,
    speed: 6,
    color: '#76c9f2',
  }),
  scout: Object.freeze({
    id: 'air-juke',
    name: 'Air Juke',
    description:
      'Burst in your movement direction, on the ground or in the air. Your weapon lowers during the burst.',
    cooldown: 8,
    duration: 0.18,
    speed: 18,
    color: '#69e2c1',
  }),
  heavy: Object.freeze({
    id: 'bulwark',
    name: 'Bulwark',
    description:
      'Raise a breakable frontal shield. Your back stays exposed and your weapon lowers.',
    cooldown: 16,
    duration: 4,
    health: 120,
    shieldWidth: 1.55,
    shieldHeight: 1.65,
    shieldOffset: 0.7,
    color: '#d5d98b',
  }),
});

export function getPower<C extends ClassId>(classId: C): (typeof POWERS)[C];
export function getPower(classId: unknown): (typeof POWERS)[ClassId];
export function getPower(classId: unknown) {
  return typeof classId === 'string' && Object.hasOwn(POWERS, classId)
    ? POWERS[classId as ClassId]
    : POWERS.assault;
}

export function powerEvent(
  player: Pick<
    Player,
    'id' | 'classId' | 'life' | 'abilitySeq' | 'x' | 'y' | 'z'
  >,
  action: string,
  extra: Pick<PowerEvent, 'effectId' | 'radius'> = {},
): PowerEvent {
  return {
    type: 'power',
    action,
    powerId: getPower(player.classId).id,
    owner: player.id,
    life: player.life,
    abilitySeq: player.abilitySeq,
    x: player.x,
    y: player.y,
    z: player.z,
    ...extra,
  };
}

export function createPowerEffect(
  player: Player & { classId: 'assault' },
): BlastEffect;
export function createPowerEffect(
  player: Player & { classId: 'sniper' },
): EchoEffect;
export function createPowerEffect(player: Player): PowerEffect | null;
export function createPowerEffect(player: Player): PowerEffect | null {
  if (player.classId !== 'assault' && player.classId !== 'sniper') return null;
  const base = {
    id: `${player.id}:${player.life}:${player.abilitySeq}`,
    owner: player.id,
    life: player.life,
    abilitySeq: player.abilitySeq,
    x: player.x,
    z: player.z,
    yaw: player.yaw,
  };
  if (player.classId === 'assault') {
    const power = getPower('assault');
    const speed = power.throwSpeed * Math.cos(player.pitch);
    return {
      ...base,
      type: 'blast',
      classId: 'assault',
      y: player.y + Math.max(0.45, player.eyeHeight - 0.2),
      remaining: power.duration,
      vx: -Math.sin(player.yaw) * speed,
      vz: -Math.cos(player.yaw) * speed,
      vy: Math.sin(player.pitch) * power.throwSpeed + power.throwLift,
      fuse: power.fuse,
      flightRemaining: power.maxFlight,
      landed: false,
      normal: null,
    };
  }
  const power = getPower('sniper');
  return {
    ...base,
    type: 'echo',
    classId: 'sniper',
    y: player.y,
    remaining: power.duration,
    vx: -Math.sin(player.yaw) * power.speed,
    vz: -Math.cos(player.yaw) * power.speed,
    vy: player.vy,
    grounded: player.grounded,
  };
}

// Ray distances are measured in metres. Used for small server-owned power objects,
// cover visibility and oriented shields; ordinary players retain their shared collider.
function boxHit(
  origin: Vec3,
  direction: Vec3,
  box: Pick<Box, 'x' | 'y' | 'z' | 'w' | 'h' | 'd'>,
  limit = Infinity,
) {
  let near = 0;
  let far = limit;
  let normal = { x: 0, y: 0, z: 0 };
  for (const [axis, width] of [
    ['x', 'w'],
    ['y', 'h'],
    ['z', 'd'],
  ] as const) {
    const low = axis === 'y' ? box.y : box[axis] - box[width] / 2;
    const high = low + box[width];
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < low || origin[axis] > high) return null;
    } else {
      const a = (low - origin[axis]) / direction[axis];
      const b = (high - origin[axis]) / direction[axis];
      const entry = Math.min(a, b);
      if (entry >= near) {
        near = entry;
        normal = { x: 0, y: 0, z: 0, [axis]: a < b ? -1 : 1 };
      }
      far = Math.min(far, Math.max(a, b));
      if (near > far) return null;
    }
  }
  return { distance: near, normal };
}

function visible(from: Vec3, to: Vec3, map: ArenaMap) {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < 1e-6) return true;
  const direction = {
    x: (to.x - from.x) / length,
    y: (to.y - from.y) / length,
    z: (to.z - from.z) / length,
  };
  return !map.boxes.some((box) => boxHit(from, direction, box, length - 0.001));
}

function movePuck(effect: BlastEffect, dt: number, map: ArenaMap) {
  effect.vy -= 18 * dt;
  const delta = { x: effect.vx * dt, y: effect.vy * dt, z: effect.vz * dt };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (length > 1e-8) {
    const direction = {
      x: delta.x / length,
      y: delta.y / length,
      z: delta.z / length,
    };
    const nearest: { value: { distance: number; normal: Vec3 } | null } = {
      value: null,
    };
    const contact = (distance: number, normal: Vec3) => {
      if (
        distance >= 0 &&
        distance <= length &&
        (!nearest.value || distance < nearest.value.distance)
      )
        nearest.value = { distance, normal };
    };
    for (const box of map.boxes) {
      const expanded = {
        ...box,
        y: box.y - 0.1,
        w: box.w + 0.2,
        h: box.h + 0.2,
        d: box.d + 0.2,
      };
      const hit = boxHit(effect, direction, expanded, length);
      if (hit) contact(hit.distance, hit.normal);
    }
    if (direction.y < 0)
      contact(Math.max(0, (0.1 - effect.y) / direction.y), {
        x: 0,
        y: 1,
        z: 0,
      });
    const edge = map.size / 2 - 0.1;
    for (const axis of ['x', 'z'] as const) {
      if (Math.abs(direction[axis]) < 1e-9) continue;
      const sign = Math.sign(direction[axis]);
      contact((sign * edge - effect[axis]) / direction[axis], {
        x: 0,
        y: 0,
        z: 0,
        [axis]: -sign,
      });
    }
    const travel = nearest.value ? nearest.value.distance : length;
    effect.x += direction.x * travel;
    effect.y += direction.y * travel;
    effect.z += direction.z * travel;
    if (nearest.value) {
      effect.landed = true;
      effect.normal = nearest.value.normal;
      effect.vx = effect.vy = effect.vz = 0;
    }
  }
}

// Match the server's fixed tick without importing simulation.js, which imports
// power metadata itself. Preview and live pucks share every collision/fuse step.
const BLAST_STEP = 1 / 60;

function stepBlast(effect: BlastEffect, dt: number, map: ArenaMap) {
  for (
    let left = dt;
    left > 1e-8 && effect.remaining > 1e-8;
    left -= BLAST_STEP
  ) {
    const step = Math.min(BLAST_STEP, left);
    if (effect.landed || effect.flightRemaining <= 1e-8) {
      effect.remaining = Math.max(0, effect.remaining - step);
    } else {
      const flight = Math.min(step, effect.flightRemaining);
      movePuck(effect, flight, map);
      effect.flightRemaining = Math.max(0, effect.flightRemaining - flight);
      if (effect.landed || effect.flightRemaining <= 1e-8) {
        // The first impact starts the complete warning. An extreme airborne
        // throw has the same bounded warning at the end of its flight budget.
        effect.remaining = effect.fuse;
        effect.vx = effect.vy = effect.vz = 0;
      } else effect.remaining = effect.flightRemaining + effect.fuse;
    }
  }
}

/** Pure aim preview. `landing` is the final pop center, offset from its surface
 * by the puck radius; a missing surface has landed:false and normal:null. */
export function predictBlastTrajectory(player: Player, map: ArenaMap) {
  const power = getPower('assault');
  const effect = createPowerEffect({ ...player, classId: 'assault' });
  const position = () => ({ x: effect.x, y: effect.y, z: effect.z });
  const points = [position()];
  let flightTime = 0,
    detonationTime = 0;
  for (
    let tick = 1;
    tick <= Math.ceil(power.duration / BLAST_STEP) + 1;
    tick++
  ) {
    const flying = !effect.landed && effect.flightRemaining > 1e-8;
    stepBlast(effect, BLAST_STEP, map);
    detonationTime = tick * BLAST_STEP;
    if (flying) {
      const stopped = effect.landed || effect.flightRemaining <= 1e-8;
      if (tick % 2 === 0 || stopped) points.push(position());
      if (stopped) flightTime = detonationTime;
    }
    if (effect.remaining <= 1e-8) break;
  }
  return {
    points,
    landing: position(),
    normal: effect.normal,
    landed: effect.landed,
    flightTime,
    detonationTime,
    radius: power.radius,
  };
}

function moveEcho(effect: EchoEffect, dt: number, map: ArenaMap) {
  // The decoy runs straight, but obeys the same body envelope and gravity as a
  // player. A blocked route ends the illusion instead of leaving an idle statue.
  const length = Math.hypot(effect.vx, effect.vz) * dt;
  if (length > 1e-8) {
    const direction = {
      x: (effect.vx * dt) / length,
      y: 0,
      z: (effect.vz * dt) / length,
    };
    let distance = length;
    for (const box of map.boxes) {
      if (box.y + box.h <= effect.y + 0.001) continue;
      const hit = boxHit(
        effect,
        direction,
        {
          ...box,
          y: box.y - 1.799,
          w: box.w + 0.7,
          h: box.h + 1.798,
          d: box.d + 0.7,
        },
        length,
      );
      if (hit) distance = Math.min(distance, hit.distance);
    }
    const travel = Math.max(0, distance - (distance < length ? 0.001 : 0));
    effect.x += direction.x * travel;
    effect.z += direction.z * travel;
    if (distance < length) return false;
  }
  const edge = map.size / 2 - 0.35;
  if (Math.abs(effect.x) > edge || Math.abs(effect.z) > edge) {
    effect.x = Math.max(-edge, Math.min(edge, effect.x));
    effect.z = Math.max(-edge, Math.min(edge, effect.z));
    return false;
  }
  const previousY = effect.y;
  effect.vy = (effect.vy || 0) - 24 * dt;
  effect.y += effect.vy * dt;
  effect.grounded = false;
  for (const box of map.boxes) {
    if (
      Math.abs(effect.x - box.x) >= box.w / 2 + 0.35 ||
      Math.abs(effect.z - box.z) >= box.d / 2 + 0.35
    )
      continue;
    const top = box.y + box.h;
    if (effect.vy <= 0 && previousY >= top - 0.001 && effect.y <= top) {
      effect.y = top;
      effect.vy = 0;
      effect.grounded = true;
    } else if (
      effect.vy > 0 &&
      previousY + 1.8 <= box.y + 0.001 &&
      effect.y + 1.8 >= box.y
    ) {
      effect.y = box.y - 1.8;
      effect.vy = 0;
    }
  }
  if (effect.y < 0) {
    effect.y = 0;
    effect.vy = 0;
    effect.grounded = true;
  }
  return true;
}

/** Server only: authoritative effects and impulses, never damage from a Blast Pop. */
export function stepPowerEffects(
  effects: PowerEffect[],
  players: Player[],
  dt: number,
  map: ArenaMap,
) {
  const events: PowerEvent[] = [];
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    let blocked = false;
    if (effect.type === 'blast') stepBlast(effect, dt, map);
    else {
      const elapsed = Math.min(dt, effect.remaining);
      for (let left = elapsed; left > 1e-8; left -= 0.05) {
        if (!moveEcho(effect, Math.min(0.05, left), map)) {
          blocked = true;
          break;
        }
      }
      effect.remaining = Math.max(0, effect.remaining - dt);
    }
    if (effect.remaining > 1e-8 && !blocked) continue;
    effects.splice(index, 1);
    if (effect.type !== 'blast') {
      const owner = players.find(
        (p) =>
          p.id === effect.owner &&
          p.life === effect.life &&
          p.abilitySeq === effect.abilitySeq,
      );
      if (owner) owner.abilityTime = 0;
      if (blocked)
        events.push(
          powerEvent({ ...effect, id: effect.owner }, 'glitch', {
            effectId: effect.id,
          }),
        );
      continue;
    }
    const power = getPower('assault');
    const owner = players.find(
      (p) =>
        p.id === effect.owner &&
        p.life === effect.life &&
        p.abilitySeq === effect.abilitySeq,
    );
    if (owner) owner.abilityTime = 0;
    for (const p of players) {
      if (p.health <= 0) continue;
      const target = { x: p.x, y: p.y + (p.crouching ? 0.55 : 0.9), z: p.z };
      const distance = Math.hypot(
        target.x - effect.x,
        target.y - effect.y,
        target.z - effect.z,
      );
      if (distance >= power.radius || !visible(effect, target, map)) continue;
      const strength = 1 - distance / power.radius;
      const horizontal = Math.hypot(p.x - effect.x, p.z - effect.z);
      const dx =
        horizontal > 0.01 ? (p.x - effect.x) / horizontal : -Math.sin(p.yaw);
      const dz =
        horizontal > 0.01 ? (p.z - effect.z) / horizontal : -Math.cos(p.yaw);
      p.vx += dx * (5 + 10 * strength);
      p.vz += dz * (5 + 10 * strength);
      p.vy = Math.max(p.vy, 7 + 7 * strength);
      p.grounded = false;
      p.sliding = false;
      p.slideBoost = 0;
      p.coyoteTime = 0;
      p.ropeId = null;
      p.ropeCooldown = 0.4;
    }
    events.push(
      powerEvent({ ...effect, id: effect.owner }, 'pop', {
        effectId: effect.id,
        radius: power.radius,
      }),
    );
  }
  return events;
}

/** Clip the existing authoritative hitscan before damage. Broken shields absorb
 * their breaking shot; echoes disappear on the first hit and never award kills. */
export function resolvePowerShot(
  shooter: Player,
  players: Player[],
  effects: PowerEffect[],
  shot: Shot,
  damage: number,
) {
  const { from, to } = shot;
  let distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (distance < 1e-8) return { result: shot, events: [] };
  const direction = {
    x: (to.x - from.x) / distance,
    y: (to.y - from.y) / distance,
    z: (to.z - from.z) / distance,
  };
  let shield: Player | null | undefined;
  let echo: EchoEffect | undefined;
  const power = getPower('heavy');
  for (const p of players) {
    if (
      p.id === shooter.id ||
      p.health <= 0 ||
      p.classId !== 'heavy' ||
      p.abilityTime <= 0 ||
      p.shieldHealth <= 0
    )
      continue;
    const nx = -Math.sin(p.yaw);
    const nz = -Math.cos(p.yaw);
    const denominator = direction.x * nx + direction.z * nz;
    if (denominator >= -1e-7) continue;
    const cx = p.x + nx * power.shieldOffset;
    const cz = p.z + nz * power.shieldOffset;
    const t = ((cx - from.x) * nx + (cz - from.z) * nz) / denominator;
    if (t < 0 || t >= distance) continue;
    const x = from.x + direction.x * t;
    const y = from.y + direction.y * t;
    const z = from.z + direction.z * t;
    const side = (x - cx) * Math.cos(p.yaw) - (z - cz) * Math.sin(p.yaw);
    if (
      Math.abs(side) > power.shieldWidth / 2 ||
      y < p.y + 0.1 ||
      y > p.y + 0.1 + power.shieldHeight
    )
      continue;
    distance = t;
    shield = p;
  }
  for (const effect of effects) {
    if (effect.type !== 'echo' || effect.owner === shooter.id) continue;
    const hit = boxHit(
      from,
      direction,
      { ...effect, w: 0.7, h: 1.8, d: 0.7 },
      distance,
    );
    if (hit && hit.distance < distance) {
      distance = hit.distance;
      echo = effect;
      shield = null;
    }
  }
  if (!shield && !echo) return { result: shot, events: [] };
  const result: Shot = {
    from,
    to: {
      x: from.x + direction.x * distance,
      y: from.y + direction.y * distance,
      z: from.z + direction.z * distance,
    },
  };
  const events: PowerEvent[] = [];
  if (shield) {
    result.shieldHit = shield.id;
    shield.shieldHealth = Math.max(0, shield.shieldHealth - damage);
    if (shield.shieldHealth === 0) {
      shield.abilityTime = 0;
      events.push(powerEvent(shield, 'shatter'));
    }
  } else if (echo) {
    result.echoHit = echo.id;
    effects.splice(effects.indexOf(echo), 1);
    const owner = players.find(
      (p) =>
        p.id === echo.owner &&
        p.life === echo.life &&
        p.abilitySeq === echo.abilitySeq,
    );
    if (owner) owner.abilityTime = 0;
    events.push(
      powerEvent({ ...echo, id: echo.owner }, 'glitch', { effectId: echo.id }),
    );
  }
  return { result, events };
}
