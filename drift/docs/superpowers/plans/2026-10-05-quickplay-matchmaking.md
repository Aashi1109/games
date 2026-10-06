# Quickplay Matchmaking + Bot-Fill Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single fixed public room per map with mode-bucketed matchmaking ("Enter arena" joins any existing room for that map+mode with a free slot, or creates a new one), and add a lobby toggle to disable bot-fill for a room.

**Architecture:** A new `shared/modes.js` mode registry (mirrors `shared/classes.js`) backs a `bucket = "${mapId}:${modeId}"` key stored on each room. The WebSocket `join` handler gains a `quickplay` branch that scans `rooms` for a non-full room with a matching bucket before creating a new one; the existing explicit-room-code branch is untouched except for picking up the same `botFill` flag. `syncBots` skips filling bots when a room's `botFill` is `false`. This is Phase 1 of `docs/superpowers/specs/2026-10-05-game-modes-design.md` — mode stays `ffa`-only here; Team Deathmatch and Domination are separate follow-up plans.

**Tech Stack:** Node.js (`node:test`, `node --test`), `ws` WebSocket server, no new dependencies.

---

### Task 1: Mode registry

**Files:**
- Create: `shared/modes.js`
- Test: `test/modes.test.js` (new file, created in this task; more tests land in later tasks)

- [ ] **Step 1: Write the failing test**

```js
// test/modes.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, MODES, isModeId, getMode } from '../shared/modes.js';

test('mode registry exposes ffa and rejects unknown ids', () => {
  assert.equal(DEFAULT_MODE, 'ffa');
  assert.ok(isModeId('ffa'));
  assert.equal(isModeId('tdm'), false);
  assert.equal(isModeId(''), false);
  assert.equal(isModeId(null), false);
  assert.equal(getMode('ffa'), MODES.ffa);
  assert.equal(getMode('nope'), MODES.ffa);
  assert.equal(getMode(undefined), MODES.ffa);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/modes.test.js`
Expected: FAIL with `Cannot find module '../shared/modes.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// shared/modes.js
export const DEFAULT_MODE = 'ffa';
export const MODES = Object.freeze({
  ffa: Object.freeze({ id: 'ffa', name: 'Free-for-all', teams: false, scoring: 'kills' }),
});
export function isModeId(id) { return typeof id === 'string' && Object.hasOwn(MODES, id); }
export function getMode(id = DEFAULT_MODE) { return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE]; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/modes.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add shared/modes.js test/modes.test.js
git commit -m "feat: add mode registry with ffa as the default mode"
```

---

### Task 2: Server-side quickplay matchmaking

**Files:**
- Modify: `server/index.js:1-16` (imports, bucket counter state), `server/index.js:109-131` (join handler), `server/index.js:177-200` (`syncBots`)
- Test: `test/modes.test.js` (append)

The current join handler (`server/index.js:109-131`) always requires `message.room` and resolves exactly one room per literal code. This step adds a `quickplay` branch that resolves a room by `bucket` (map+mode) instead, with overflow to a fresh room when every matching room is full, and wires a `botFill` flag through room creation in both branches.

- [ ] **Step 1: Write the failing tests**

```js
// test/modes.test.js (append to the file from Task 1)
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

function receive(ws, type, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, timeout);
    function listener(data) { const message = JSON.parse(data); if (message.type === type) { clearTimeout(timer); ws.off('message', listener); resolve(message); } }
    ws.on('message', listener);
  });
}
async function quickjoin(url, { mapId = 'vertex', mode = 'ffa', name = 'Player', classId, botFill } = {}) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', quickplay: true, mapId, mode, name, classId, botFill }));
  return { ws, welcome: await welcome };
}

test('quickplay joins reuse an existing room for the same map+mode until it is full, then overflow to a new one', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, maxPlayers: 2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => b.ws.terminate());
  assert.equal(a.welcome.room, b.welcome.room, 'second quickplay join lands in the same room while there is space');
  const c = await quickjoin(url, { mapId: 'vertex', mode: 'ffa' }); t.after(() => c.ws.terminate());
  assert.notEqual(c.welcome.room, a.welcome.room, 'a full bucket overflows into a newly created room');
  assert.equal(game.rooms.size, 2);
});

test('quickplay buckets by map and mode independently', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await quickjoin(url, { mapId: 'vertex' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mapId: 'canyon-relay' }); t.after(() => b.ws.terminate());
  assert.notEqual(a.welcome.room, b.welcome.room);
  assert.equal(game.rooms.get(a.welcome.room).mapId, 'vertex');
  assert.equal(game.rooms.get(b.welcome.room).mapId, 'canyon-relay');
});

test('quickplay rejects an unknown mode before creating a room', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 });
  t.after(() => game.close());
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  const failure = receive(ws, 'error');
  ws.send(JSON.stringify({ type: 'join', quickplay: true, mapId: 'vertex', mode: 'chaos', name: 'A' }));
  assert.match((await failure).message, /valid mode/);
  assert.equal(game.rooms.size, 0);
});

test('bot-fill toggle off keeps quickplay rooms free of bots while other rooms still fill', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 3, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const noBots = await quickjoin(url, { mapId: 'vertex', mode: 'ffa', botFill: false }); t.after(() => noBots.ws.terminate());
  assert.equal(game.rooms.get(noBots.welcome.room).peers.size, 1);
  const withBots = await quickjoin(url, { mapId: 'canyon-relay', mode: 'ffa' }); t.after(() => withBots.ws.terminate());
  assert.equal(game.rooms.get(withBots.welcome.room).peers.size, 4);
});

test('explicit room codes still work without the quickplay flag and default to ffa', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 });
  t.after(() => game.close());
  const ws = new WebSocket(`ws://127.0.0.1:${game.port}/ws`); await once(ws, 'open'); t.after(() => ws.terminate());
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room: 'legacy-code', name: 'A', mapId: 'vertex' }));
  await welcome;
  assert.equal(game.rooms.get('legacy-code').mode, 'ffa');
  assert.equal(game.rooms.get('legacy-code').bucket, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/modes.test.js`
Expected: FAIL — `quickplay` joins get the current `'Choose a room and player name.'` error because `message.room` is required today, and `error.message` won't match `/valid mode/` (mode isn't validated), and `room.bucket`/`room.mode` are `undefined`.

- [ ] **Step 3: Add the bucket counter and import the mode registry**

In `server/index.js`, update the import line and add bucket-counter state next to the existing `rooms`/`sockets` maps:

```js
// server/index.js:8 — replace the existing world/classes import block with:
import { DEFAULT_MAP, getMap, isMapId } from '../shared/world.js';
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';
import { DEFAULT_MODE, isModeId } from '../shared/modes.js';
```

```js
// server/index.js:43-44 — replace:
  const rooms = new Map();
  const sockets = new Map();
// with:
  const rooms = new Map();
  const sockets = new Map();
  const bucketSequence = new Map();
```

- [ ] **Step 4: Replace the join handler**

Replace the entire `if (message.type === 'join') { ... }` block (`server/index.js:109-131`) with:

```js
      if (message.type === 'join') {
        if (peer.player) { error(ws, 'Already in a room.'); return; }
        if (typeof message.name !== 'string') { error(ws, 'Choose a player name.'); return; }
        const classId = message.classId === undefined ? DEFAULT_CLASS : message.classId;
        if (!isClassId(classId)) { error(ws, 'Choose a valid class.'); return; }
        const mapId = message.mapId === undefined ? DEFAULT_MAP : message.mapId;
        if (!isMapId(mapId)) { error(ws, 'Choose a valid map.'); return; }
        const name = message.name.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 16) || 'Runner';
        const botFill = message.botFill !== false;
        let room;
        if (message.quickplay) {
          const modeId = message.mode === undefined ? DEFAULT_MODE : message.mode;
          if (!isModeId(modeId)) { error(ws, 'Choose a valid mode.'); return; }
          const bucket = `${mapId}:${modeId}`;
          room = [...rooms.values()].find((candidate) => candidate.bucket === bucket
            && [...candidate.peers.values()].filter((other) => !other.bot).length < maxPlayers);
          if (!room) {
            if (rooms.size >= maxRooms) { error(ws, 'Server is busy. Try again shortly.'); return; }
            const sequence = (bucketSequence.get(bucket) || 0) + 1;
            bucketSequence.set(bucket, sequence);
            const code = `${bucket}#${sequence}`;
            room = { code, mapId, map: getMap(mapId), mode: modeId, botFill, bucket, peers: new Map(), events: [], effects: [], remaining: roundSeconds, spawnCounter: 0 };
            rooms.set(code, room);
          }
        } else {
          if (typeof message.room !== 'string') { error(ws, 'Choose a room and player name.'); return; }
          const code = message.room.trim().toLowerCase() || 'open';
          if (!/^[a-z0-9-]{1,12}$/.test(code)) { error(ws, 'Room codes use up to 12 letters, numbers, or dashes.'); return; }
          room = rooms.get(code);
          if (!room) {
            if (rooms.size >= maxRooms) { error(ws, 'Server is busy. Try an existing room.'); return; }
            room = { code, mapId, map: getMap(mapId), mode: DEFAULT_MODE, botFill, bucket: null, peers: new Map(), events: [], effects: [], remaining: roundSeconds, spawnCounter: 0 };
            rooms.set(code, room);
          }
          const humans = [...room.peers.values()].filter((other) => !other.bot);
          if (humans.length >= maxPlayers) { error(ws, 'This room is full. Try another room code.'); return; }
        }
        peer.player = createPlayer(randomUUID().slice(0, 8), name, chooseSpawn(room), classId, room.map);
        peer.room = room; peer.lastInput = neutral(peer.player); room.peers.set(peer.player.id, peer);
        syncBots(room);
        send(ws, { type: 'welcome', id: peer.player.id, room: room.code, mapId: room.mapId, mode: room.mode, player: peer.player, effects: room.effects, maxPlayers });
        return;
      }
```

- [ ] **Step 5: Make `syncBots` respect `botFill`**

In `server/index.js`, inside `syncBots` (around `server/index.js:177-200`), replace:

```js
    const wanted = Math.max(0, desiredPopulation - humans);
```

with:

```js
    const wanted = room.botFill ? Math.max(0, desiredPopulation - humans) : 0;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/modes.test.js`
Expected: PASS (6 tests)

- [ ] **Step 7: Run the full server test suite to check nothing else broke**

Run: `node --test test/server.test.js test/bots-server.test.js test/powers-server.test.js test/maps-server.test.js`
Expected: PASS, same counts as before this change

- [ ] **Step 8: Commit**

```bash
git add server/index.js test/modes.test.js
git commit -m "feat: add quickplay matchmaking by map+mode bucket and a botFill room flag"
```

---

### Task 3: Client — quickplay join + bot-fill checkbox

**Files:**
- Modify: `client/main.js:645-682` (`start()`), `client/main.js:1023` (`#play` click handler), `client/main.js:1036` (`#join-form` submit handler)
- Modify: `index.html:31` (insert bot-fill checkbox after `.room-actions`)
- Modify: `client/ui.css` (append bot-fill checkbox style near the existing `.room-actions`/`.room-button` rules, `client/ui.css:102-105`)

- [ ] **Step 1: Add the bot-fill checkbox to the lobby markup**

In `index.html`, right after the `.room-actions` div (`index.html:31`), insert:

```html
          <label class="bot-fill-toggle" for="bot-fill"><input type="checkbox" id="bot-fill" checked />Fill empty slots with bots</label>
```

- [ ] **Step 2: Style the checkbox**

Append to `client/ui.css` (near the `.room-actions`/`.room-button` rules at `client/ui.css:102-105`):

```css
.bot-fill-toggle { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 12px; color: #c1d0b9; }
.bot-fill-toggle input { width: 14px; height: 14px; accent-color: var(--accent); }
```

- [ ] **Step 3: Update `start()` to send a quickplay join when there's no explicit room code**

In `client/main.js`, replace the `start` function signature and its room-resolution/send logic (`client/main.js:645-682`):

```js
  async function start(nextRoom, quickplay = !nextRoom) {
    if (connecting || player) return;
    if (!canvas.requestPointerLock) { showError('Please open this game in a desktop browser with a keyboard and mouse.'); return; }
    const name = $('player-name').value.trim().slice(0, 16) || 'Rookie';
    if (quickplay) {
      selectedRoom = '';
    } else {
      nextRoom = String(nextRoom || 'open').trim().toLowerCase();
      if (!/^[a-z0-9-]{1,12}$/.test(nextRoom)) { showError('Use a room code of 1–12 letters, numbers, or hyphens.'); return; }
      const publicMapId = Object.keys(PUBLIC_ROOMS).find((id) => PUBLIC_ROOMS[id] === nextRoom);
      if (publicMapId) loadMap(publicMapId);
      selectedRoom = Object.values(PUBLIC_ROOMS).includes(nextRoom) ? '' : nextRoom;
    }
    try { localStorage.setItem('drift-name', name); } catch { /* Optional. */ }
    setLobbyBusy(true);
    $('lobby-error').textContent = '';
    $('capture-note').hidden = true;
    primeAudio();
    requestLock();
    const attempt = ++joinAttempt;
    const classId = selectedClass;
    if (!hasGameModels(classId)) $('play-label').textContent = `Loading ${getClass(classId).character}…`;
    try {
      await requestClassModels(classId);
    } catch {
      if (attempt === joinAttempt) leave('Could not load your character. Check your connection and try again.');
      return;
    }
    if (attempt !== joinAttempt) return;
    updateLobbyRoom();
    const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    socket = connection;
    const connectionTimeout = () => { if (socket === connection && !player) leave('The server did not respond. Please try again.'); };
    // The static lobby can load before Cloudflare starts the match container.
    connectionTimer = setTimeout(connectionTimeout, 40000);
    connection.addEventListener('open', () => {
      if (socket !== connection) return;
      clearTimeout(connectionTimer);
      connectionTimer = setTimeout(connectionTimeout, 8000);
      const botFill = $('bot-fill').checked;
      connection.send(JSON.stringify(quickplay
        ? { type: 'join', quickplay: true, mapId: selectedMap, mode: 'ffa', name, classId, botFill }
        : { type: 'join', room: nextRoom, name, classId, mapId: selectedMap, botFill }));
    });
```

(Everything after the `connection.addEventListener('open', ...)` block — the `message` listener and the rest of `start` — is unchanged; only the lines shown above are replaced.)

- [ ] **Step 4: Stop falling back to the fixed public room code on Enter Arena**

Replace `client/main.js:1023`:

```js
  $('play').addEventListener('click', () => start(selectedRoom || PUBLIC_ROOMS[selectedMap]));
```

with:

```js
  $('play').addEventListener('click', () => start(selectedRoom));
```

(When `selectedRoom` is `''` — the common case — `start` now defaults `quickplay` to `true` and matchmakes by map+mode instead of joining the old fixed `open-<map>` room.)

- [ ] **Step 5: Keep the join-friends form on the explicit-room path**

Replace `client/main.js:1036`:

```js
  $('join-form').addEventListener('submit', (event) => { event.preventDefault(); start($('room-code').value); });
```

with:

```js
  $('join-form').addEventListener('submit', (event) => { event.preventDefault(); start($('room-code').value, false); });
```

(An explicit `false` keeps a blank submitted room code falling back to the shared `'open'` room — unchanged behavior — instead of accidentally triggering quickplay.)

- [ ] **Step 6: Manual verification**

Run: `pnpm start` (or `node server/index.js`), open `http://localhost:5173` in two browser tabs.
Expected:
- Tab 1: click "Enter arena" → joins a room (check Network/WS frames or server log — no `room` field sent, `quickplay: true` instead).
- Tab 2: click "Enter arena" with the same map selected → joins the *same* room as Tab 1 (both show each other in the player list).
- Uncheck "Fill empty slots with bots" before entering in a third tab with a different map selected → no bots appear in that room.
- "Create room" / "Join friends" still work exactly as before.

- [ ] **Step 7: Commit**

```bash
git add client/main.js index.html client/ui.css
git commit -m "feat: wire Enter Arena to quickplay matchmaking and add a bot-fill toggle"
```

---

## Self-Review Notes

- **Spec coverage:** Covers the "Quickplay matchmaking" and "bot-fill" portions of `docs/superpowers/specs/2026-10-05-game-modes-design.md`'s Phase 1. Team Deathmatch and Domination (Phases 2–3) are intentionally out of scope — they get their own plans once this one ships and is reviewed, per the spec's phased-delivery section.
- **Mode stays `ffa`-only on purpose:** the mode registry (Task 1) is structured so Task 2's bucket key (`${mapId}:${modeId}`) and the `room.mode`/`isModeId` plumbing need no changes when Phase 2 adds `tdm` — only `shared/modes.js` and the lobby UI change.
- **Backward compatibility:** explicit room-code joins (`Create room`, `Join friends`, direct `?room=` links) are untouched aside from picking up `botFill`; existing `test/server.test.js` coverage for that path still applies unmodified.
