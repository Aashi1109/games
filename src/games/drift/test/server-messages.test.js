import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerMessage } from '../client/server-messages.ts';
import { createPlayer, traceShot } from '../shared/simulation.ts';
import { createPowerEffect, powerEvent } from '../shared/powers.ts';

const player = createPlayer('abc12345', 'Player');
const echo = createPowerEffect(createPlayer('def12345', 'Wisp', 0, 'sniper'));
const blast = createPowerEffect(player);
const welcome = { type: 'welcome', id: player.id, room: 'canyon-relay:ffa:easy#1', mapId: 'canyon-relay', mode: 'ffa', botDifficulty: 'easy', player, effects: [blast, echo], maxPlayers: 6 };
const snapshot = {
  type: 'state', room: 'canyon-relay:ffa:easy#1', mapId: 'canyon-relay', botDifficulty: 'easy', remaining: 299,
  players: [player], effects: [blast, echo], events: [
    { type: 'shot', id: player.id, classId: player.classId, ...traceShot(player, []) },
    powerEvent(player, 'activate', { effectId: blast.id }),
    powerEvent(player, 'pop', { effectId: blast.id, radius: 4.5 }),
    { type: 'kill', killer: player.id, victim: 'def12345', airborne: true, killerName: 'Player', victimName: 'Wisp' },
    { type: 'round', winnerTeam: 'a', scoreA: 2, scoreB: 1 },
    { type: 'round', winnerId: player.id, winnerName: player.name },
    { type: 'round' },
  ],
};

test('accepts JSON wire shapes produced by the authoritative simulation', () => {
  for (const message of [welcome, snapshot, { type: 'error', message: 'Room full.' }, { type: 'pong', sent: 123 }, { type: 'class-selected', classId: 'heavy', activeClassId: 'assault' }]) {
    const decoded = JSON.parse(JSON.stringify(message));
    assert.deepEqual(parseServerMessage(decoded), decoded);
  }
});

test('rejects malformed discriminants, canonical IDs, nested players and effects', () => {
  for (const message of [
    null, [], {}, { type: 'unknown' }, { type: 'pong', sent: '123' },
    { ...welcome, mapId: '__proto__' }, { ...welcome, mode: 'constructor' },
    { ...welcome, botDifficulty: 'impossible' }, { ...welcome, maxPlayers: 0 },
    { ...welcome, player: { ...player, id: 'someone-else' } },
    { ...snapshot, players: [{ ...player, x: Infinity }] },
    { ...snapshot, players: [{ ...player, ropeId: {} }] },
    { ...snapshot, players: [{ ...player, classId: 'constructor' }] },
    { ...snapshot, effects: [{ ...blast, normal: { x: 0, y: '1', z: 0 } }] },
    { ...snapshot, effects: [{ ...echo, classId: 'assault' }] },
    { ...snapshot, events: [{ type: 'shot', id: player.id, classId: 'assault', from: {}, to: {} }] },
    { ...snapshot, events: [{ type: 'kill', killer: player.id, victim: 'def12345', airborne: true, killerName: {} }] },
  ]) assert.equal(parseServerMessage(message), null);
});

test('bounds snapshot arrays and rejects missing prediction state fields', () => {
  const partial = { ...player };
  delete partial.abilityCooldown;
  for (const message of [
    { ...snapshot, players: [partial] },
    { ...snapshot, players: Array(257).fill(player) },
    { ...snapshot, effects: Array(1025).fill(echo) },
    { ...snapshot, events: Array(4097).fill({ type: 'round' }) },
  ]) assert.equal(parseServerMessage(message), null);
});
