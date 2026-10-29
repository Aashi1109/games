export type Point = [number, number];
export interface Stroke {
  id: string;
  color: string;
  size: number;
  points: Point[];
}
export type Phase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'finished';
export interface RoomPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}
export interface RoomMessage {
  id: string;
  text: string;
  kind: string;
  name: string;
}
export interface RoomSession {
  code: string;
  playerId: string;
  token: string;
}
export interface RoomState {
  code: string;
  me: string;
  host: string | null;
  phase: Phase;
  players: RoomPlayer[];
  artist: string | undefined;
  turnId: number;
  round: number;
  rounds: number;
  duration: number;
  remaining: number;
  word: string | null;
  choices: string[];
  hint: string;
  reveal: string | null;
  strokes: Stroke[];
  revision: number;
  messages: RoomMessage[];
  guessed: string[];
  spectator: boolean;
}
export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(
    (n: unknown) =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1,
  );
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => typeof item === 'string');
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
export function isRoomSession(value: unknown): value is RoomSession {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.token === 'string'
  );
}
function isPlayer(value: unknown): value is RoomPlayer {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    finite(value.score) &&
    typeof value.connected === 'boolean'
  );
}
function isStroke(value: unknown): value is Stroke {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.color === 'string' &&
    finite(value.size) &&
    Array.isArray(value.points) &&
    value.points.every(isPoint)
  );
}
function isMessage(value: unknown): value is RoomMessage {
  return (
    isRecord(value) &&
    ['id', 'text', 'kind', 'name'].every(
      (key) => typeof value[key] === 'string',
    )
  );
}
export function isRoomState(value: unknown): value is RoomState {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.me === 'string' &&
    nullableString(value.host) &&
    typeof value.phase === 'string' &&
    ['lobby', 'choosing', 'drawing', 'reveal', 'finished'].includes(
      value.phase,
    ) &&
    (value.artist === undefined || typeof value.artist === 'string') &&
    ['turnId', 'round', 'rounds', 'duration', 'remaining', 'revision'].every(
      (key) => finite(value[key]),
    ) &&
    nullableString(value.word) &&
    strings(value.choices) &&
    typeof value.hint === 'string' &&
    nullableString(value.reveal) &&
    Array.isArray(value.players) &&
    value.players.every(isPlayer) &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStroke) &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage) &&
    strings(value.guessed) &&
    typeof value.spectator === 'boolean'
  );
}
