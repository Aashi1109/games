import { RoomError, isRecord, isPoint } from './types.ts';
import type {
  Phase,
  Stroke,
  RoomState,
  RoomMessage,
  RoomPlayer,
} from './types.ts';
interface Player extends RoomPlayer {
  token: string;
  seen: number;
  lastGuess: number;
}
interface Room {
  code: string;
  players: Player[];
  host: string | null;
  phase: Phase;
  created: number;
  touched: number;
  turn: number;
  roster: string[];
  rounds: number;
  duration: number;
  deadline: number;
  word: string | null;
  choices: string[];
  used: string[];
  strokes: Stroke[];
  revision: number;
  messages: RoomMessage[];
  guessed: string[];
  roundScore: number[];
  reveal: string;
  turnId: number;
}
import { randomBytes } from 'node:crypto';
const WORDS = [
  'bicycle',
  'sunflower',
  'jellyfish',
  'snowman',
  'pineapple',
  'rocket',
  'umbrella',
  'sandcastle',
  'butterfly',
  'lighthouse',
  'popcorn',
  'cactus',
  'rainbow',
  'suitcase',
  'volcano',
  'telescope',
  'penguin',
  'watermelon',
  'headphones',
  'campfire',
  'guitar',
  'dinosaur',
  'pancakes',
  'octopus',
  'sailboat',
  'toothbrush',
  'elephant',
  'cupcake',
  'backpack',
  'helicopter',
  'mushroom',
  'crocodile',
  'rollercoaster',
  'hotdog',
  'teapot',
  'snowflake',
  'dragon',
  'castle',
  'pizza',
  'robot',
  'beehive',
  'mermaid',
  'tornado',
  'turtle',
  'strawberry',
  'fireworks',
  'sunglasses',
  'mailbox',
  'seahorse',
  'kangaroo',
  'astronaut',
  'scarecrow',
  'ladybird',
  'ferris wheel',
  'sleeping bag',
  'rubber duck',
  'hot air balloon',
  'ice cream',
  'traffic light',
  'birthday cake',
];
const id = () => randomBytes(18).toString('hex');
function fail(message: string, status = 400): never {
  throw new RoomError(message, status);
}
export class RoomService {
  rooms: Map<string, Room>;
  now: () => number;
  random: () => number;
  constructor({ now = () => Date.now(), random = Math.random } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.random = random;
  }
  cleanName(value: unknown) {
    if (typeof value !== 'string')
      fail('Use a name between 1 and 20 characters.');
    const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!name || name.length > 20)
      fail('Use a name between 1 and 20 characters.');
    return name;
  }
  create(name: unknown) {
    const cleanName = this.cleanName(name);
    if (this.rooms.size >= 100)
      fail('The studio is full. Try again shortly.', 503);
    let code;
    do {
      code = randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      players: [],
      host: null,
      phase: 'lobby',
      created: this.now(),
      touched: this.now(),
      turn: 0,
      roster: [],
      rounds: 2,
      duration: 60,
      deadline: 0,
      word: null,
      choices: [],
      used: [],
      strokes: [],
      revision: 0,
      messages: [],
      guessed: [],
      roundScore: [],
      reveal: '',
      turnId: 0,
    };
    this.rooms.set(code, room);
    return this.join(code, cleanName);
  }
  room(code: string) {
    const room = this.rooms.get(code);
    if (!room) fail('Room not found or expired. Create a fresh room.', 404);
    return room;
  }
  join(code: string, name: unknown) {
    const room = this.room(code);
    const cleanName = this.cleanName(name);
    if (room.players.length >= 8) fail('This room already has eight players.');
    if (
      room.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())
    )
      fail('That name is taken in this room. Pick another.');
    const p = {
      id: id(),
      token: id(),
      name: cleanName,
      score: 0,
      seen: this.now(),
      connected: true,
      lastGuess: 0,
    };
    room.players.push(p);
    room.host ??= p.id;
    room.touched = this.now();
    this.say(room, `${cleanName} joined the studio.`);
    return { code, playerId: p.id, token: p.token };
  }
  authorize(room: Room, token: string) {
    const p = room.players.find((p) => p.token === token);
    if (!p) fail('Your room session ended. Join again.', 401);
    p.seen = this.now();
    p.connected = true;
    room.touched = this.now();
    return p;
  }
  say(room: Room, text: string, kind = 'system', name = '') {
    room.messages.push({ id: id(), text, kind, name });
    room.messages = room.messages.slice(-45);
  }
  online(room: Room) {
    return room.players.filter((p) => p.connected);
  }
  artist(room: Room): string | undefined {
    return room.roster[room.turn % room.roster.length];
  }
  begin(room: Room) {
    room.turnId++;
    room.strokes = [];
    room.revision++;
    room.guessed = [];
    room.word = null;
    room.reveal = '';
    if (room.turn >= room.roster.length * room.rounds) {
      room.phase = 'finished';
      room.deadline = 0;
      this.say(room, 'That’s a wrap! The final scores are in.');
      return;
    }
    const artist = room.players.find((p) => p.id === this.artist(room));
    if (!artist?.connected) {
      room.turn++;
      this.begin(room);
      return;
    }
    if (
      this.online(room).filter((p) => room.roster.includes(p.id)).length < 2
    ) {
      room.phase = 'lobby';
      room.deadline = 0;
      this.say(room, 'Waiting for at least two connected players.');
      return;
    }
    const pool = WORDS.filter((w) => !room.used.includes(w));
    room.choices = [];
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(this.random() * pool.length);
      room.choices.push(pool.splice(index, 1)[0]);
    }
    room.phase = 'choosing';
    room.deadline = this.now() + 15000;
    this.say(room, `${artist.name} is choosing a word.`);
  }
  choose(room: Room, index: number) {
    room.word = room.choices[index];
    room.used.push(room.word);
    room.choices = [];
    room.phase = 'drawing';
    room.deadline = this.now() + room.duration * 1000;
    this.say(room, 'Pencils ready. Guess the drawing!');
  }
  reveal(room: Room, reason = 'Time’s up!') {
    room.phase = 'reveal';
    room.reveal = room.word || 'Skipped';
    room.deadline = this.now() + 4500;
    this.say(room, `${reason} The word was ${room.reveal}.`, 'reveal');
  }
  tick() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (now - room.touched > 30 * 60 * 1000) {
        this.rooms.delete(code);
        continue;
      }
      for (const p of room.players)
        if (now - p.seen > 20000) p.connected = false;
      const host = room.players.find((p) => p.id === room.host);
      if (!host?.connected) {
        const next = this.online(room)[0];
        if (next) room.host = next.id;
      }
      if (['choosing', 'drawing'].includes(room.phase)) {
        const artist = room.players.find((p) => p.id === this.artist(room));
        if (!artist?.connected) {
          this.reveal(room, 'The artist disconnected.');
          continue;
        }
      }
      if (room.phase === 'choosing' && now >= room.deadline)
        this.choose(room, 0);
      else if (room.phase === 'drawing' && now >= room.deadline)
        this.reveal(room);
      else if (room.phase === 'reveal' && now >= room.deadline) {
        room.turn++;
        this.begin(room);
      }
    }
  }
  state(code: string, token: string): RoomState {
    const room = this.room(code);
    const me = this.authorize(room, token);
    this.tick();
    const drawing = room.phase === 'drawing',
      artist = this.artist(room);
    let hint = room.word?.replace(/[^ ]/g, '_') || '';
    if (drawing && this.now() > room.deadline - room.duration * 500)
      hint = (room.word?.[0] ?? '') + hint.slice(1);
    return {
      code,
      me: me.id,
      host: room.host,
      phase: room.phase,
      players: room.players.map(({ id, name, score, connected }) => ({
        id,
        name,
        score,
        connected,
      })),
      artist,
      turnId: room.turnId,
      round: Math.floor(room.turn / Math.max(1, room.roster.length)) + 1,
      rounds: room.rounds,
      duration: room.duration,
      remaining: Math.max(0, Math.ceil((room.deadline - this.now()) / 1000)),
      word: me.id === artist && drawing ? room.word : null,
      choices:
        me.id === artist && room.phase === 'choosing' ? room.choices : [],
      hint: drawing ? hint : '',
      reveal: room.phase === 'reveal' ? room.reveal : null,
      strokes: room.strokes,
      revision: room.revision,
      messages: room.messages,
      guessed: room.guessed,
      spectator:
        room.roster.length > 0 &&
        !room.roster.includes(me.id) &&
        !['lobby', 'finished'].includes(room.phase),
    };
  }
  act(code: string, token: string, data: unknown) {
    const room = this.room(code),
      me = this.authorize(room, token);
    this.tick();
    if (!isRecord(data) || typeof data.action !== 'string')
      fail('Unknown action.');
    const host = room.host === me.id,
      artist = this.artist(room) === me.id;
    switch (data.action) {
      case 'start': {
        if (!host) fail('Only the host can start.', 403);
        if (!['lobby', 'finished'].includes(room.phase))
          fail('A match is already in progress.');
        if (this.online(room).length < 2)
          fail('Invite one more player to start.');
        if (
          typeof data.duration !== 'number' ||
          ![45, 60, 90].includes(data.duration)
        )
          fail('Choose a 45, 60 or 90 second turn.');
        room.duration = data.duration;
        room.roster = this.online(room).map((p) => p.id);
        room.players.forEach((p) => (p.score = 0));
        room.turn = 0;
        room.used = [];
        room.messages = [];
        this.begin(room);
        break;
      }
      case 'choose':
        if (!artist || room.phase !== 'choosing')
          fail('It is not your turn to choose.', 403);
        if (
          typeof data.index !== 'number' ||
          !Number.isInteger(data.index) ||
          data.index < 0 ||
          data.index > 2
        )
          fail('Choose one of the three words.');
        this.choose(room, data.index);
        break;
      case 'stroke': {
        if (!artist || room.phase !== 'drawing')
          fail('Only the current artist can draw.', 403);
        if (room.strokes.length >= 1200)
          fail('This page is full. Undo or clear to keep drawing.');
        if (
          typeof data.color !== 'string' ||
          !/^#[0-9a-f]{6}$/i.test(data.color) ||
          typeof data.size !== 'number' ||
          ![3, 7, 14, 26].includes(data.size) ||
          !Array.isArray(data.points) ||
          !data.points.length ||
          data.points.length > 120 ||
          typeof data.strokeId !== 'string' ||
          data.strokeId.length > 40
        )
          fail('Invalid brush stroke.');
        if (!data.points.every(isPoint)) fail('Invalid drawing coordinates.');
        room.strokes.push({
          id: data.strokeId,
          color: data.color,
          size: data.size,
          points: data.points,
        });
        room.revision++;
        break;
      }
      case 'undo':
      case 'clear':
        if (!artist || room.phase !== 'drawing')
          fail('Only the artist can edit the page.', 403);
        if (data.action === 'clear') room.strokes = [];
        else {
          const last = room.strokes.at(-1)?.id;
          room.strokes = room.strokes.filter((s) => s.id !== last);
        }
        room.revision++;
        break;
      case 'guess': {
        if (
          room.phase !== 'drawing' ||
          artist ||
          !room.roster.includes(me.id) ||
          room.guessed.includes(me.id)
        )
          fail('Wait for your next guessing turn.');
        if (
          typeof data.text !== 'string' ||
          !data.text.trim() ||
          data.text.length > 60
        )
          fail('Guesses must be 1–60 characters.');
        if (this.now() - me.lastGuess < 600) fail('One guess at a time.', 429);
        me.lastGuess = this.now();
        const text = data.text.trim();
        const normalize = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalize(text) === normalize(room.word ?? '')) {
          const score =
            100 +
            Math.round(
              (100 * (room.deadline - this.now())) / (room.duration * 1000),
            );
          me.score += score;
          const drawer = room.players.find((p) => p.id === this.artist(room));
          if (drawer) drawer.score += 50;
          room.guessed.push(me.id);
          this.say(room, `${me.name} got it! +${score}`, 'correct');
          const eligible = room.roster.filter(
            (id) =>
              id !== this.artist(room) &&
              room.players.find((p) => p.id === id)?.connected,
          );
          if (eligible.every((id) => room.guessed.includes(id)))
            this.reveal(room, 'Everyone got it!');
        } else this.say(room, text, 'guess', me.name);
        break;
      }
      case 'kick':
        if (!host) fail('Only the host can remove players.', 403);
        if (data.playerId === me.id) fail('Use Leave to exit your own room.');
        if (typeof data.playerId !== 'string') fail('Player not found.');
        this.remove(room, data.playerId);
        break;
      case 'leave':
        this.remove(room, me.id);
        return { left: true };
      default:
        fail('Unknown action.');
    }
    return this.state(code, token);
  }
  remove(room: Room, playerId: string) {
    const p = room.players.find((p) => p.id === playerId);
    if (!p) fail('Player not found.');
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.host === playerId)
      room.host = this.online(room)[0]?.id || room.players[0]?.id || null;
    this.say(room, `${p.name} left the studio.`);
    if (
      this.artist(room) === playerId &&
      ['drawing', 'choosing'].includes(room.phase)
    )
      this.reveal(room, 'The artist left.');
    if (!room.players.length) this.rooms.delete(room.code);
  }
}
