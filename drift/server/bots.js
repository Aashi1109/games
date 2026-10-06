import { EYE_HEIGHT, PLAYER_HEIGHT, RADIUS, STEP, traceShot } from '../shared/simulation.js';
import { getClass } from '../shared/classes.js';

const DECISION_INTERVAL = 0.12;
const TURN_SPEED = 2.6;
const GRID_SPACING = 2;
const navigation = new WeakMap();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angleDifference = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

// Bots route around ground-floor solids. Physics still resolves every movement,
// including pads and incidental jumps; the navigation grid grants no extra movement.
function segmentClear(from, to, map, margin = RADIUS + 0.12) {
  for (const box of map.boxes) {
    if (box.y + box.h <= from.y + 0.4 || box.y >= from.y + PLAYER_HEIGHT) continue;
    let near = 0; let far = 1;
    for (const [axis, size] of [['x', 'w'], ['z', 'd']]) {
      const delta = to[axis] - from[axis];
      const low = box[axis] - box[size] / 2 - margin;
      const high = box[axis] + box[size] / 2 + margin;
      if (Math.abs(delta) < 1e-8) {
        if (from[axis] < low || from[axis] > high) { near = 2; break; }
      } else {
        const a = (low - from[axis]) / delta; const b = (high - from[axis]) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
    }
    if (near <= far) return false;
  }
  return true;
}

function getNavigation(map) {
  if (navigation.has(map)) return navigation.get(map);
  const edge = map.size / 2 - 2;
  function coordinates(axis, size) {
    const values = Array.from({ length: Math.floor(edge * 2 / GRID_SPACING) + 1 }, (_, index) => -edge + index * GRID_SPACING);
    const solids = map.boxes.filter((box) => box.y < PLAYER_HEIGHT && box.y + box.h > 0.4);
    const otherAxis = axis === 'x' ? 'z' : 'x'; const otherSize = size === 'w' ? 'd' : 'w';
    // Keep the coarse grid, adding only centers of narrow walkable slots that
    // it can miss between overlapping cliff faces, doorways, or containers.
    for (const left of solids) for (const right of solids) {
      const low = left[axis] + left[size] / 2; const high = right[axis] - right[size] / 2;
      const gap = high - low; const midpoint = (high + low) / 2;
      const overlap = Math.abs(left[otherAxis] - right[otherAxis]) <= (left[otherSize] + right[otherSize]) / 2;
      if (overlap && gap > 2 * (RADIUS + 0.12) && gap < GRID_SPACING + 2 * RADIUS && Math.abs(midpoint) < edge
        && !values.some((value) => Math.abs(value - midpoint) < 0.2)) values.push(midpoint);
    }
    return values.sort((a, b) => a - b);
  }
  const xs = coordinates('x', 'w'); const zs = coordinates('z', 'd');
  const width = xs.length;
  const nodes = zs.flatMap((z) => xs.map((x) => ({ x, y: 0, z })));
  const links = nodes.map((point, index) => {
    if (!segmentClear(point, point, map)) return [];
    const neighbors = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = index % width + dx; const z = Math.floor(index / width) + dz;
      if (x < 0 || x >= width || z < 0 || z >= zs.length) continue;
      const next = z * width + x;
      if (segmentClear(point, nodes[next], map)) neighbors.push(next);
    }
    return neighbors;
  });
  const graph = { nodes, links };
  navigation.set(map, graph);
  return graph;
}

function findPath(from, to, map) {
  const { nodes, links } = getNavigation(map);
  let goal = -1; let goalDistance = Infinity;
  const starts = [];
  for (let index = 0; index < nodes.length; index++) {
    if (!links[index].length) continue;
    const point = nodes[index];
    const fromDistance = Math.hypot(point.x - from.x, point.z - from.z);
    const toDistance = Math.hypot(point.x - to.x, point.z - to.z);
    starts.push({ index, distance: fromDistance });
    if (toDistance < goalDistance) { goalDistance = toDistance; goal = index; }
  }
  const start = starts.sort((a, b) => a.distance - b.distance).slice(0, 32)
    .find(({ index }) => segmentClear(from, nodes[index], map, RADIUS - 0.001))?.index ?? -1;
  if (start < 0 || goal < 0) return [];
  const previous = new Int32Array(nodes.length).fill(-1);
  const queue = [start]; previous[start] = start;
  for (let cursor = 0; cursor < queue.length && previous[goal] < 0; cursor++) {
    for (const next of links[queue[cursor]]) {
      if (previous[next] >= 0) continue;
      previous[next] = queue[cursor]; queue.push(next);
    }
  }
  if (previous[goal] < 0) return [];
  const path = [];
  for (let index = goal; index !== start; index = previous[index]) path.push(nodes[index]);
  path.push(nodes[start]);
  return path.reverse();
}

function aimAt(player, target) {
  const dx = target.x - player.x; const dz = target.z - player.z;
  const height = target.crouching ? 0.72 : 1.15;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(target.y + height - player.y - (player.eyeHeight ?? EYE_HEIGHT), Math.hypot(dx, dz)),
  };
}

function canSee(player, target, players, map) {
  if (target.id === player.id || target.health <= 0 || Math.hypot(target.x - player.x, target.z - player.z) > 58) return false;
  const aim = aimAt(player, target);
  // Wide peripheral awareness, but no sensing through walls or players.
  if (Math.abs(angleDifference(aim.yaw, player.yaw)) > 2.2) return false;
  return traceShot({ ...player, ...aim }, players, map).hit === target.id;
}

/** Lightweight server input producer. Never changes health, position, or ammo. */
export function createBotController(map, seed = 0) {
  getNavigation(map);
  const patrol = [
    { x: 0, z: 0 }, { x: -12, z: 10 }, { x: 12, z: -10 },
    ...map.spawns,
  ];
  let time; let decisionAt; let targetId; let readyAt; let lastSeen; let path; let pathAt;
  let patrolIndex; let moveX; let moveZ; let lastPosition; let stuckTime; let jumpUntil; let jumpAt; let nextShot;
  function reset() {
    time = 0; decisionAt = 0; targetId = null; readyAt = 0.8; lastSeen = null;
    path = []; pathAt = 0; patrolIndex = 0; moveX = 0; moveZ = 0;
    lastPosition = null; stuckTime = 0; jumpUntil = 0; jumpAt = 0; nextShot = 0;
  }
  reset();
  function update(player, players, dt = STEP, effects = []) {
    players = [...players, ...effects.filter((effect) => effect.type === 'echo' && effect.owner !== player.id)
      .map((effect) => ({ ...effect, health: 100, crouching: false }))];
    time += dt;
    if (time >= decisionAt) {
      decisionAt = time + DECISION_INTERVAL;
      const visible = players.filter((other) => canSee(player, other, players, map));
      const target = visible.find((other) => other.id === targetId) || visible.sort((a, b) =>
        Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
      if ((target?.id ?? null) !== targetId) {
        targetId = target?.id ?? null;
        readyAt = time + 0.55 + (seed % 3) * 0.08;
      }
      if (target) lastSeen = { x: target.x, z: target.z, at: time };
      let destination = lastSeen && time - lastSeen.at < 3 ? lastSeen : patrol[patrolIndex];
      if (!target && (Math.hypot(destination.x - player.x, destination.z - player.z) < 3 || (!path.length && time < pathAt))) {
        lastSeen = null;
        patrolIndex = (patrolIndex + 1 + seed % 2) % patrol.length;
        destination = patrol[patrolIndex]; pathAt = 0;
      }
      if (time >= pathAt || !path.length) {
        path = findPath(player, destination, map); pathAt = time + 1.2;
      }
      while (path.length && Math.hypot(path[0].x - player.x, path[0].z - player.z) < 1.2) path.shift();
      const waypoint = path[0];
      moveX = waypoint ? waypoint.x - player.x : 0;
      moveZ = waypoint ? waypoint.z - player.z : 0;
      if (target) {
        const dx = target.x - player.x; const dz = target.z - player.z;
        const distance = Math.hypot(dx, dz) || 1;
        const preferred = player.classId === 'sniper' ? 24 : player.classId === 'scout' ? 12 : 18;
        if (distance < preferred + 5) {
          const approach = distance < 7 ? -0.8 : distance > preferred ? 0.6 : 0;
          const side = Math.sin(time * 0.65 + seed * 2) > 0 ? 0.7 : -0.7;
          moveX = dx / distance * approach - dz / distance * side;
          moveZ = dz / distance * approach + dx / distance * side;
        }
      }
      const length = Math.hypot(moveX, moveZ) || 1;
      moveX /= length; moveZ /= length;
      // Stop strafing into cover; the next path decision can route around it.
      if (!segmentClear(player, { x: player.x + moveX * 1.3, z: player.z + moveZ * 1.3 }, map)) {
        if (waypoint) {
          const distance = Math.hypot(waypoint.x - player.x, waypoint.z - player.z) || 1;
          moveX = (waypoint.x - player.x) / distance; moveZ = (waypoint.z - player.z) / distance;
        }
      }
      if (lastPosition && Math.hypot(player.x - lastPosition.x, player.z - lastPosition.z) < 0.12 && Math.hypot(moveX, moveZ) > 0.1) stuckTime += DECISION_INTERVAL;
      else stuckTime = 0;
      if (stuckTime > 0.65 && time >= jumpAt) {
        jumpUntil = time + 0.15; jumpAt = time + 1.3;
        pathAt = 0;
        if (stuckTime > 2) { patrolIndex = (patrolIndex + 1) % patrol.length; lastSeen = null; stuckTime = 0; }
      }
      lastPosition = { x: player.x, z: player.z };
    }
    const target = players.find((other) => other.id === targetId && other.health > 0);
    const aim = target ? aimAt(player, target) : { yaw: Math.atan2(-moveX, -moveZ), pitch: 0 };
    // Deliberate tracking error and a bounded turn rate leave room to dodge.
    if (target) {
      aim.yaw += Math.sin(time * 2.3 + seed * 1.7) * 0.025;
      aim.pitch += Math.sin(time * 1.8 + seed) * 0.014;
    }
    const yaw = player.yaw + clamp(angleDifference(aim.yaw, player.yaw), -TURN_SPEED * dt, TURN_SPEED * dt);
    const pitch = clamp(player.pitch + clamp(aim.pitch - player.pitch, -1.6 * dt, 1.6 * dt), -1.3, 1.3);
    const loadout = getClass(player.classId);
    let fire = Boolean(target && time >= readyAt && Math.abs(angleDifference(aim.yaw, yaw)) < 0.1
      && Math.abs(aim.pitch - pitch) < 0.1 && canSee(player, target, players, map));
    if (loadout.automatic) fire &&= (time + seed * 0.23) % 1.5 < 0.78;
    else {
      fire &&= time >= nextShot;
      if (fire) nextShot = time + loadout.fireInterval + 0.35;
    }
    const targetDistance = target ? Math.hypot(target.x - player.x, target.z - player.z) : Infinity;
    const powerOpportunity = player.classId === 'assault' ? targetDistance < 14
      : player.classId === 'sniper' ? targetDistance < 28
        : player.classId === 'scout' ? targetDistance < 22 : targetDistance < 18 || player.health < 75;
    const ability = Boolean(target && time >= readyAt && powerOpportunity && player.abilityCooldown <= 0
      && !player.abilityHeld && !player.ropeId && canSee(player, target, players, map));
    return {
      seq: player.seq + 1, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch,
      forward: clamp(-Math.sin(yaw) * moveX - Math.cos(yaw) * moveZ, -1, 1),
      strafe: clamp(Math.cos(yaw) * moveX - Math.sin(yaw) * moveZ, -1, 1),
      jump: time < jumpUntil, sprint: !target, crouch: false, fire,
      reload: !target && player.ammo < loadout.magazine * 0.5 && !player.reloadIn,
      interact: false, ability,
    };
  }
  return { update, reset };
}
