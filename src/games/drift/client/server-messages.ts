import { isClassId } from '../shared/classes.ts';
import { isMapId } from '../shared/world.ts';
import { isModeId } from '../shared/modes.ts';
import { BOT_DIFFICULTIES } from '../shared/bot-difficulty.ts';
import type {
  Player,
  PowerEffect,
  GameEvent,
  ServerMessage,
} from '../shared/types.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, maximum = 160): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;
const id = (value: unknown): value is string =>
  text(value, 64) && /^[a-z0-9-]+$/i.test(value);
const effectId = (value: unknown): value is string =>
  text(value, 160) && /^[a-z0-9:-]+$/i.test(value);
const roomCode = (value: unknown): value is string =>
  text(value, 160) && /^[a-z0-9:#-]+$/i.test(value);
const team = (value: unknown) => value === 'a' || value === 'b';
const vector = (value: unknown) =>
  record(value) && finite(value.x) && finite(value.y) && finite(value.z);
const difficulty = (value: unknown) =>
  BOT_DIFFICULTIES.some(({ id }) => id === value);
const optional = (
  value: Record<string, unknown>,
  key: string,
  valid: (field: unknown) => boolean,
) => value[key] === undefined || valid(value[key]);
function list<T>(
  value: unknown,
  maximum: number,
  valid: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.length <= maximum && value.every(valid);
}

const playerNumbers = [
  'x',
  'y',
  'z',
  'yaw',
  'pitch',
  'vx',
  'vy',
  'vz',
  'eyeHeight',
  'health',
  'ammo',
  'kills',
  'deaths',
  'seq',
  'life',
  'respawnIn',
  'reloadIn',
  'fireCooldown',
  'padCooldown',
  'slideTime',
  'slideBoost',
  'slideCooldown',
  'coyoteTime',
  'jumpBuffer',
  'ropeT',
  'ropeDirection',
  'ropeCooldown',
  'abilityCooldown',
  'abilityTime',
  'abilitySeq',
  'shieldHealth',
  'dashX',
  'dashZ',
  'dashExitSpeed',
] as const;
const playerBooleans = [
  'grounded',
  'crouching',
  'sliding',
  'interactHeld',
  'jumpHeld',
  'crouchHeld',
  'reloadHeld',
  'fireHeld',
  'fired',
  'abilityHeld',
  'abilityUsed',
] as const;
function player(value: unknown): value is Player {
  return (
    record(value) &&
    id(value.id) &&
    text(value.name, 64) &&
    isClassId(value.classId) &&
    isClassId(value.nextClassId) &&
    playerNumbers.every((key) => finite(value[key])) &&
    playerBooleans.every((key) => typeof value[key] === 'boolean') &&
    (value.ropeId === null || id(value.ropeId)) &&
    optional(value, 'team', team) &&
    optional(value, 'bot', (field) => typeof field === 'boolean')
  );
}
function effect(value: unknown): value is PowerEffect {
  if (
    !record(value) ||
    !effectId(value.id) ||
    !id(value.owner) ||
    !vector(value) ||
    !['life', 'abilitySeq', 'yaw', 'remaining', 'vx', 'vy', 'vz'].every((key) =>
      finite(value[key]),
    )
  )
    return false;
  if (value.type === 'blast')
    return (
      value.classId === 'assault' &&
      finite(value.fuse) &&
      finite(value.flightRemaining) &&
      typeof value.landed === 'boolean' &&
      (value.normal === null || vector(value.normal))
    );
  return (
    value.type === 'echo' &&
    value.classId === 'sniper' &&
    typeof value.grounded === 'boolean'
  );
}
function gameEvent(value: unknown): value is GameEvent {
  if (!record(value)) return false;
  switch (value.type) {
    case 'shot':
      return (
        id(value.id) &&
        isClassId(value.classId) &&
        vector(value.from) &&
        vector(value.to) &&
        optional(value, 'hit', id) &&
        optional(value, 'shieldHit', id) &&
        optional(value, 'echoHit', effectId) &&
        optional(
          value,
          'surface',
          (surface) =>
            record(surface) &&
            vector(surface.normal) &&
            text(surface.style, 64),
        )
      );
    case 'kill':
      return (
        id(value.killer) &&
        id(value.victim) &&
        typeof value.airborne === 'boolean' &&
        optional(value, 'killerName', (name) => text(name, 64)) &&
        optional(value, 'victimName', (name) => text(name, 64))
      );
    case 'round':
      return (
        optional(value, 'winnerTeam', team) &&
        optional(value, 'scoreA', finite) &&
        optional(value, 'scoreB', finite) &&
        optional(value, 'winnerId', id) &&
        optional(value, 'winnerName', (name) => text(name, 64))
      );
    case 'power':
      return (
        vector(value) &&
        id(value.owner) &&
        finite(value.life) &&
        finite(value.abilitySeq) &&
        typeof value.action === 'string' &&
        ['activate', 'pop', 'glitch', 'shatter'].includes(value.action) &&
        typeof value.powerId === 'string' &&
        ['blast-pop', 'echo', 'air-juke', 'bulwark'].includes(value.powerId) &&
        optional(value, 'effectId', effectId) &&
        optional(value, 'radius', finite) &&
        ['yaw', 'dashX', 'dashZ'].every((key) =>
          optional(value, key, finite),
        ) &&
        optional(value, 'grounded', (field) => typeof field === 'boolean')
      );
    default:
      return false;
  }
}
function isServerMessage(value: unknown): value is ServerMessage {
  if (!record(value)) return false;
  switch (value.type) {
    case 'error':
      return text(value.message, 1000);
    case 'pong':
      return finite(value.sent);
    case 'class-selected':
      return isClassId(value.classId) && isClassId(value.activeClassId);
    case 'welcome':
      return (
        id(value.id) &&
        roomCode(value.room) &&
        isMapId(value.mapId) &&
        isModeId(value.mode) &&
        difficulty(value.botDifficulty) &&
        player(value.player) &&
        value.player.id === value.id &&
        list(value.effects, 1024, effect) &&
        finite(value.maxPlayers) &&
        Number.isInteger(value.maxPlayers) &&
        value.maxPlayers >= 1 &&
        value.maxPlayers <= 256
      );
    case 'state':
      return (
        roomCode(value.room) &&
        isMapId(value.mapId) &&
        difficulty(value.botDifficulty) &&
        finite(value.remaining) &&
        list(value.players, 256, player) &&
        list(value.effects, 1024, effect) &&
        list(value.events, 4096, gameEvent)
      );
    default:
      return false;
  }
}

/** Validate a decoded network message before it reaches rendering or prediction. */
export function parseServerMessage(value: unknown): ServerMessage | null {
  return isServerMessage(value) ? value : null;
}
