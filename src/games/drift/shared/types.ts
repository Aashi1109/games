import type { ClassId } from './classes.ts';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Box extends Vec3 {
  w: number;
  h: number;
  d: number;
  style: string;
  label?: string;
  facadeBase?: number;
}
export interface Spawn extends Vec3 {
  yaw: number;
}
export interface Pad extends Vec3 {
  radius: number;
  vx: number;
  vy: number;
  vz: number;
}
export interface Rope {
  id: string;
  from: Vec3;
  to: Vec3;
  speed: number;
}
export interface Zone {
  id: string;
  x: number;
  z: number;
  radius: number;
}
export type MapDetail =
  | (Vec3 & { kind: 'tree'; height: number; radius: number })
  | (Vec3 & { kind: 'dish'; radius: number; yaw: number });
export interface ArenaMap {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  size: number;
  boxes: Box[];
  pads: Pad[];
  spawns: Spawn[];
  targets: (Vec3 & { id: string })[];
  zones: Zone[];
  ropes: Rope[];
  details?: MapDetail[];
  theme: {
    sky: string;
    fog: string;
    ground: string;
    palette: Record<string, string>;
    hemisphere?: string;
    ambientGround?: string;
    sun?: string;
  };
  preview: { position: Vec3; target: Vec3 };
}
export type World = ArenaMap;
export type Team = 'a' | 'b';
export interface Player extends Spawn {
  id: string;
  name: string;
  classId: ClassId;
  nextClassId: ClassId;
  vx: number;
  vy: number;
  vz: number;
  pitch: number;
  grounded: boolean;
  crouching: boolean;
  sliding: boolean;
  eyeHeight: number;
  health: number;
  ammo: number;
  kills: number;
  deaths: number;
  seq: number;
  life: number;
  respawnIn: number;
  reloadIn: number;
  fireCooldown: number;
  padCooldown: number;
  slideTime: number;
  slideBoost: number;
  slideCooldown: number;
  coyoteTime: number;
  jumpBuffer: number;
  ropeId: string | null;
  ropeT: number;
  ropeDirection: number;
  ropeCooldown: number;
  interactHeld: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  reloadHeld: boolean;
  fireHeld: boolean;
  fired: boolean;
  abilityCooldown: number;
  abilityTime: number;
  abilityHeld: boolean;
  abilitySeq: number;
  abilityUsed: boolean;
  shieldHealth: number;
  dashX: number;
  dashZ: number;
  dashExitSpeed: number;
  team?: Team;
  bot?: boolean;
}
export interface Input {
  seq?: number;
  forward?: number;
  strafe?: number;
  yaw?: number;
  pitch?: number;
  jump?: boolean;
  sprint?: boolean;
  crouch?: boolean;
  fire?: boolean;
  reload?: boolean;
  interact?: boolean;
  ability?: boolean;
}
export type ValidatedInput = Required<Input>;
export interface Shot {
  from: Vec3;
  to: Vec3;
  hit?: string;
  surface?: { normal: Vec3; style: string };
  shieldHit?: string;
  echoHit?: string;
}
interface EffectBase extends Vec3 {
  id: string;
  owner: string;
  life: number;
  abilitySeq: number;
  classId: ClassId;
  yaw: number;
  remaining: number;
  vx: number;
  vy: number;
  vz: number;
}
export interface BlastEffect extends EffectBase {
  type: 'blast';
  classId: 'assault';
  fuse: number;
  flightRemaining: number;
  landed: boolean;
  normal: Vec3 | null;
}
export interface EchoEffect extends EffectBase {
  type: 'echo';
  classId: 'sniper';
  grounded: boolean;
}
export type PowerEffect = BlastEffect | EchoEffect;
export interface PowerEvent extends Vec3 {
  type: 'power';
  action: string;
  powerId: string;
  owner: string;
  life: number;
  abilitySeq: number;
  yaw?: number;
  dashX?: number;
  dashZ?: number;
  grounded?: boolean;
  effectId?: string;
  radius?: number;
}
export interface ShotTarget extends Vec3 {
  id: string;
  health: number;
  crouching?: boolean;
}
export type GameEvent =
  | PowerEvent
  | ({ type: 'shot'; id: string; classId: ClassId } & Shot)
  | {
      type: 'kill';
      killer: string;
      victim: string;
      airborne: boolean;
      killerName?: string;
      victimName?: string;
    }
  | {
      type: 'round';
      winnerTeam?: Team;
      scoreA?: number;
      scoreB?: number;
      winnerId?: string;
      winnerName?: string;
    };
export type ServerMessage =
  | { type: 'error'; message: string }
  | { type: 'pong'; sent: number }
  | {
      type: 'welcome';
      id: string;
      room: string;
      mapId: import('./world.ts').MapId;
      mode: import('./modes.ts').ModeId;
      botDifficulty: import('./bot-difficulty.ts').BotDifficultyId;
      player: Player;
      effects: PowerEffect[];
      maxPlayers: number;
    }
  | { type: 'class-selected'; classId: ClassId; activeClassId: ClassId }
  | {
      type: 'state';
      room: string;
      mapId: import('./world.ts').MapId;
      botDifficulty: import('./bot-difficulty.ts').BotDifficultyId;
      remaining: number;
      players: Player[];
      effects: PowerEffect[];
      events: GameEvent[];
    };
