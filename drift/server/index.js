import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createPlayer, stepPlayer, traceShot, STEP } from '../shared/simulation.js';
import { DEFAULT_MAP, getMap, isMapId } from '../shared/world.js';
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';
import { DEFAULT_MODE, getMode, isModeId } from '../shared/modes.js';
import { createBotController } from './bots.js';
import { createPowerEffect, powerEvent, resolvePowerShot, stepPowerEffects } from '../shared/powers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOLEAN_KEYS = ['jump', 'sprint', 'crouch', 'fire', 'reload'];
const neutral = (p) => ({ seq: p.seq, forward: 0, strafe: 0, yaw: p.yaw, pitch: p.pitch, jump: false, sprint: false, crouch: false, fire: false, reload: false, interact: false, ability: false });

export function sanitizeInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Number.isSafeInteger(value.seq) || value.seq < 0 || value.seq > 2 ** 31 - 1) return null;
  if (!Number.isFinite(value.forward) || Math.abs(value.forward) > 1 || !Number.isFinite(value.strafe) || Math.abs(value.strafe) > 1) return null;
  if (!Number.isFinite(value.yaw) || Math.abs(value.yaw) > Math.PI * 4 || !Number.isFinite(value.pitch) || Math.abs(value.pitch) > Math.PI / 2) return null;
  if (BOOLEAN_KEYS.some((key) => typeof value[key] !== 'boolean')) return null;
  const interact = Object.hasOwn(value, 'interact') ? value.interact : false;
  const ability = Object.hasOwn(value, 'ability') ? value.ability : false;
  if (typeof interact !== 'boolean' || typeof ability !== 'boolean') return null;
  return { ...Object.fromEntries(['seq', 'forward', 'strafe', 'yaw', 'pitch', ...BOOLEAN_KEYS].map((key) => [key, value[key]])), interact, ability };
}

/** A single small authoritative process. Room links work on the same reachable host. */
export async function createGameServer({
  port = Number(process.env.PORT) || 5173,
  host = process.env.HOST || '0.0.0.0',
  production = process.argv.includes('--production') || process.env.NODE_ENV === 'production',
  serveClient = true,
  maxPlayers = 6,
  botTarget = 4,
  maxRooms = 64,
  maxSockets = 256,
  roundSeconds = 300,
  respawnSeconds = 2,
  scoreCap = 200,
} = {}) {
  let vite;
  const rooms = new Map();
  const sockets = new Map();
  const bucketSequence = new Map();
  const desiredPopulation = Math.max(0, Math.min(maxPlayers, Number.isFinite(botTarget) ? Math.floor(botTarget) : 4));
  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: rooms.size })); return;
    }
    if (vite) { vite.middlewares(req, res); return; }
    if (!serveClient) { res.writeHead(404).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const dist = path.join(ROOT, 'dist');
    let file = path.resolve(dist, `.${pathname}`);
    if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) { res.writeHead(403).end(); return; }
    try {
      if (pathname === '/') file = path.join(dist, 'index.html');
      const details = await stat(file);
      if (!details.isFile()) throw new Error('Not a file');
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found. Build the client with pnpm run build.'); }
  });
  if (serveClient && !production) {
    const { createServer } = await import('vite');
    vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  function send(ws, value) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 128 * 1024) { ws.terminate(); return; }
    ws.send(JSON.stringify(value));
  }
  function error(ws, message) { send(ws, { type: 'error', message }); }
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws') { if (!vite) socket.destroy(); return; }
    if (sockets.size >= maxSockets) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return; }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
      } catch { socket.destroy(); return; }
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    const peer = { ws, player: null, room: null, queue: [], lastInput: null, receivedSeq: -1, lastInputAt: 0, tokens: 180, tokenAt: performance.now(), alive: true, connectedAt: performance.now(), violations: 0 };
    sockets.set(ws, peer);
    ws.on('error', () => {});
    ws.on('pong', () => { peer.alive = true; });
    ws.on('message', (raw, binary) => {
      const now = performance.now();
      peer.tokens = Math.min(180, peer.tokens + (now - peer.tokenAt) * 0.12); peer.tokenAt = now;
      if (--peer.tokens < 0) { ws.close(1008, 'Too many messages'); return; }
      if (binary) { ws.close(1003, 'Text messages only'); return; }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { if (++peer.violations > 5) ws.close(1008, 'Invalid JSON'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'ping') {
        if (typeof message.sent === 'number' && Number.isFinite(message.sent)) send(ws, { type: 'pong', sent: message.sent });
        return;
      }
      if (message.type === 'join') {
        if (peer.player) { error(ws, 'Already in a room.'); return; }
        if (typeof message.name !== 'string') { error(ws, 'Choose a player name.'); return; }
        const classId = message.classId === undefined ? DEFAULT_CLASS : message.classId;
        if (!isClassId(classId)) { error(ws, 'Choose a valid class.'); return; }
        const mapId = message.mapId === undefined ? DEFAULT_MAP : message.mapId;
        if (!isMapId(mapId)) { error(ws, 'Choose a valid map.'); return; }
        const modeId = message.mode === undefined ? DEFAULT_MODE : message.mode;
        if (!isModeId(modeId)) { error(ws, 'Choose a valid mode.'); return; }
        const name = message.name.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 16) || 'Runner';
        const botFill = message.botFill !== false;
        let room;
        if (message.quickplay) {
          const bucket = `${mapId}:${modeId}`;
          room = [...rooms.values()].find((candidate) => candidate.bucket === bucket
            && [...candidate.peers.values()].filter((other) => !other.bot).length < maxPlayers);
          if (!room) {
            if (rooms.size >= maxRooms) { error(ws, 'Server is busy. Try again shortly.'); return; }
            const sequence = (bucketSequence.get(bucket) || 0) + 1;
            bucketSequence.set(bucket, sequence);
            const code = `${bucket}#${sequence}`;
            room = { code, mapId, map: getMap(mapId), mode: modeId, botFill, bucket, score: { a: 0, b: 0 }, peers: new Map(), events: [], effects: [], remaining: roundSeconds, spawnCounter: 0 };
            rooms.set(code, room);
          }
        } else {
          if (typeof message.room !== 'string') { error(ws, 'Choose a room and player name.'); return; }
          const code = message.room.trim().toLowerCase() || 'open';
          if (!/^[a-z0-9-]{1,12}$/.test(code)) { error(ws, 'Room codes use up to 12 letters, numbers, or dashes.'); return; }
          room = rooms.get(code);
          if (!room) {
            if (rooms.size >= maxRooms) { error(ws, 'Server is busy. Try an existing room.'); return; }
            room = { code, mapId, map: getMap(mapId), mode: modeId, botFill, bucket: null, score: { a: 0, b: 0 }, peers: new Map(), events: [], effects: [], remaining: roundSeconds, spawnCounter: 0 };
            rooms.set(code, room);
          }
          const humans = [...room.peers.values()].filter((other) => !other.bot);
          if (humans.length >= maxPlayers) { error(ws, 'This room is full. Try another room code.'); return; }
        }
        const mode = getMode(room.mode);
        const team = mode.teams ? (['a', 'b'].includes(message.team) ? message.team : assignTeam(room)) : undefined;
        peer.player = { ...createPlayer(randomUUID().slice(0, 8), name, chooseSpawn(room), classId, room.map), ...(team ? { team } : {}) };
        peer.room = room; peer.lastInput = neutral(peer.player); room.peers.set(peer.player.id, peer);
        syncBots(room);
        send(ws, { type: 'welcome', id: peer.player.id, room: room.code, mapId: room.mapId, mode: room.mode, player: peer.player, effects: room.effects, maxPlayers });
        return;
      }
      if (message.type === 'class') {
        if (!peer.player) { error(ws, 'Join a room before changing class.'); return; }
        if (!isClassId(message.classId)) { error(ws, 'Choose a valid class.'); return; }
        peer.player.nextClassId = message.classId;
        send(ws, { type: 'class-selected', classId: peer.player.nextClassId, activeClassId: peer.player.classId });
        return;
      }
      if (message.type === 'input' && peer.player) {
        if (!Array.isArray(message.inputs) || message.inputs.length < 1 || message.inputs.length > 4) return;
        for (const rawInput of message.inputs) {
          const input = sanitizeInput(rawInput);
          if (!input || input.seq <= peer.receivedSeq) continue;
          peer.receivedSeq = input.seq;
          // Keep no more than 100ms of work. Backlogs must never speed up simulation.
          if (peer.queue.length >= 6) peer.queue.shift();
          peer.queue.push(input); peer.lastInputAt = now;
        }
      }
    });
    ws.on('close', () => {
      sockets.delete(ws);
      if (!peer.room) return;
      peer.room.peers.delete(peer.player.id);
      clearOwnerEffects(peer.room, peer.player.id);
      syncBots(peer.room);
    });
  });

  function chooseSpawn(room, excludedPeer) {
    const { spawns } = room.map;
    // Select a far spawn so respawns do not deliberately overlap active opponents.
    const start = room.spawnCounter++ % spawns.length;
    let chosen = start; let best = -1;
    for (let i = 0; i < spawns.length; i++) {
      const index = (start + i) % spawns.length;
      const spawn = spawns[index];
      const others = [...room.peers.values()].filter((other) => other !== excludedPeer && other.player.health > 0);
      const distance = others.length ? Math.min(...others.map((other) => Math.hypot(other.player.x - spawn.x, other.player.z - spawn.z))) : 100;
      if (distance > best) { best = distance; chosen = index; }
    }
    return chosen;
  }
  function clearOwnerEffects(room, owner) {
    room.effects = room.effects.filter((effect) => effect.owner !== owner);
  }
  function assignTeam(room) {
    const counts = { a: 0, b: 0 };
    for (const peer of room.peers.values()) if (peer.player.team) counts[peer.player.team]++;
    return counts.a <= counts.b ? 'a' : 'b';
  }
  function syncBots(room) {
    const humans = [...room.peers.values()].filter((peer) => !peer.bot).length;
    if (!humans) { room.peers.clear(); rooms.delete(room.code); return; }
    const bots = [...room.peers.values()].filter((peer) => peer.bot);
    const wanted = room.botFill ? Math.max(0, desiredPopulation - humans) : 0;
    while (bots.length > wanted) {
      const owner = bots.pop().player.id;
      room.peers.delete(owner); clearOwnerEffects(room, owner);
    }
    while (bots.length < wanted) {
      let slot = 0;
      while (bots.some((peer) => peer.botSlot === slot)) slot++;
      const population = [...room.peers.values()].map((peer) => peer.player);
      const counts = Object.fromEntries(Object.keys(CLASSES).map((id) => [id, 0]));
      for (const player of population) counts[player.classId]++;
      const classId = Object.keys(CLASSES).sort((a, b) => counts[a] - counts[b])[0];
      const character = getClass(classId).character;
      let name = character; let suffix = 2;
      while (population.some((player) => player.name === name)) name = `${character} ${suffix++}`;
      const mode = getMode(room.mode);
      const team = mode.teams ? assignTeam(room) : undefined;
      const player = { ...createPlayer(randomUUID().slice(0, 8), name, chooseSpawn(room), classId, room.map), bot: true, ...(team ? { team } : {}) };
      const peer = { player, room, ws: null, bot: createBotController(room.map, slot), botSlot: slot, queue: [], receivedSeq: -1, lastInput: neutral(player) };
      room.peers.set(player.id, peer); bots.push(peer);
    }
  }
  function respawn(peer, resetScores = false) {
    const previous = peer.player;
    peer.player = { ...createPlayer(previous.id, previous.name, chooseSpawn(peer.room, peer), previous.nextClassId, peer.room.map), ...(peer.bot ? { bot: true } : {}), ...(previous.team ? { team: previous.team } : {}), life: previous.life + 1, kills: resetScores ? 0 : previous.kills, deaths: resetScores ? 0 : previous.deaths, seq: peer.receivedSeq };
    peer.player.abilityCooldown = resetScores ? 0 : previous.abilityCooldown;
    clearOwnerEffects(peer.room, previous.id);
    peer.queue.length = 0; peer.lastInput = neutral(peer.player);
    peer.bot?.reset();
  }
  let ticks = 0;
  function tick() {
    const now = performance.now();
    for (const room of rooms.values()) {
      const mode = getMode(room.mode);
      room.remaining -= STEP;
      if (room.remaining <= 0) {
        const winner = mode.teams ? null : [...room.peers.values()].map((peer) => peer.player)
          .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
        room.remaining = roundSeconds;
        room.effects.length = 0;
        for (const peer of room.peers.values()) respawn(peer, true);
        if (mode.teams) {
          const { a, b } = room.score;
          room.events.push({ type: 'round', ...(a === b ? {} : { winnerTeam: a > b ? 'a' : 'b' }), scoreA: a, scoreB: b });
          room.score = { a: 0, b: 0 };
        } else {
          room.events.push({ type: 'round', ...(winner?.kills > 0 ? { winnerId: winner.id, winnerName: winner.name } : {}) });
        }
      }
      for (const peer of room.peers.values()) {
        if (peer.player.health <= 0) {
          // Dead clients still send neutral input; acknowledge it without simulating
          // so their prediction backlog does not grow throughout the respawn delay.
          peer.player.seq = peer.receivedSeq;
          peer.queue.length = 0;
          peer.lastInput = neutral(peer.player);
          peer.player.respawnIn = Math.max(0, peer.player.respawnIn - STEP);
          peer.player.abilityCooldown = Math.max(0, peer.player.abilityCooldown - STEP);
          peer.player.abilityTime = 0; peer.player.shieldHealth = 0;
          clearOwnerEffects(room, peer.player.id);
          if (peer.player.respawnIn === 0) respawn(peer);
          continue;
        }
        const input = peer.bot ? peer.bot.update(peer.player, [...room.peers.values()].map((other) => other.player), STEP, room.effects) : peer.queue.shift();
        if (input) peer.lastInput = input;
        if (peer.bot) peer.receivedSeq = input.seq;
        const controls = peer.bot || now - peer.lastInputAt <= 250 ? peer.lastInput : neutral(peer.player);
        stepPlayer(peer.player, controls, STEP, room.map);
        if (peer.player.abilityUsed) {
          const effect = createPowerEffect(peer.player);
          if (effect) room.effects.push(effect);
          room.events.push(powerEvent(peer.player, 'activate', effect ? { effectId: effect.id } : {}));
        }
      }
      // Resolve shots after every player's movement/activation, so a shield raised
      // this tick does not depend on the owner's insertion order in the room.
      for (const peer of room.peers.values()) {
        if (peer.player.health > 0 && peer.player.fired) {
          const population = [...room.peers.values()].map((other) => other.player);
          const resolved = resolvePowerShot(peer.player, population, room.effects, traceShot(peer.player, population, room.map), getClass(peer.player.classId).damage);
          const result = resolved.result;
          room.events.push(...resolved.events);
          room.events.push({ type: 'shot', id: peer.player.id, classId: peer.player.classId, ...result });
          const victim = room.peers.get(result.hit)?.player;
          if (victim && victim.health > 0 && !(mode.teams && victim.team === peer.player.team)) {
            victim.health = Math.max(0, victim.health - getClass(peer.player.classId).damage);
            if (victim.health === 0) {
              victim.deaths++; victim.respawnIn = respawnSeconds; victim.vx = 0; victim.vy = 0; victim.vz = 0;
              victim.abilityTime = 0; victim.shieldHealth = 0; clearOwnerEffects(room, victim.id);
              peer.player.kills++;
              if (mode.teams) room.score[peer.player.team]++;
              room.events.push({ type: 'kill', killer: peer.player.id, victim: victim.id, airborne: !peer.player.grounded && !peer.player.ropeId });
            }
          }
        }
      }
      room.events.push(...stepPowerEffects(room.effects, [...room.peers.values()].map((peer) => peer.player), STEP, room.map));
      if (mode.scoring === 'zones') {
        for (const zone of room.map.zones) {
          let holder;
          let contested = false;
          for (const peer of room.peers.values()) {
            if (peer.player.health <= 0) continue;
            const dx = peer.player.x - zone.x, dz = peer.player.z - zone.z;
            if (Math.hypot(dx, dz) > zone.radius) continue;
            if (holder === undefined) holder = peer.player.team;
            else if (holder !== peer.player.team) { contested = true; break; }
          }
          if (holder && !contested) room.score[holder] += STEP;
        }
        if (room.score.a >= scoreCap || room.score.b >= scoreCap) room.remaining = 0;
      }
      if (ticks % 3 === 0) {
        const snapshot = { type: 'state', room: room.code, mapId: room.mapId, remaining: Math.ceil(room.remaining), players: [...room.peers.values()].map((peer) => peer.player), effects: room.effects, events: room.events.splice(0) };
        for (const peer of room.peers.values()) send(peer.ws, snapshot);
      }
    }
    ticks++;
  }
  let previous = performance.now(); let accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min(0.1, (now - previous) / 1000); previous = now;
    while (accumulator >= STEP) { tick(); accumulator -= STEP; }
  }, 8);
  const heartbeat = setInterval(() => {
    const now = performance.now();
    for (const peer of sockets.values()) {
      if (!peer.alive || (!peer.player && now - peer.connectedAt > 5000)) { peer.ws.terminate(); continue; }
      peer.alive = false; peer.ws.ping();
    }
  }, 15000);
  let closed = false;
  async function close() {
    if (closed) return; closed = true;
    clearInterval(timer); clearInterval(heartbeat);
    for (const peer of sockets.values()) peer.ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    if (vite) await vite.close();
    httpServer.closeAllConnections();
    await new Promise((resolve) => httpServer.close(resolve));
  }
  try {
    await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, resolve); });
  } catch (error) { await close(); throw error; }
  return { port: httpServer.address().port, close, rooms, httpServer };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const game = await createGameServer();
  console.log(`DRIFT is running at http://localhost:${game.port}`);
  const shutdown = async () => { await game.close(); process.exit(0); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
