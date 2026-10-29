export type ModeId = 'ffa' | 'tdm' | 'domination';
export const DEFAULT_MODE = 'ffa';
export const MODES = Object.freeze({
  ffa: Object.freeze({
    id: 'ffa',
    name: 'Free-for-all',
    teams: false,
    scoring: 'kills',
  }),
  tdm: Object.freeze({
    id: 'tdm',
    name: 'Team Deathmatch',
    teams: true,
    scoring: 'kills',
  }),
  domination: Object.freeze({
    id: 'domination',
    name: 'Domination',
    teams: true,
    scoring: 'zones',
  }),
});
export function isModeId(id: unknown): id is ModeId {
  return typeof id === 'string' && Object.hasOwn(MODES, id);
}
export function getMode(id: unknown = DEFAULT_MODE) {
  return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE];
}
