# Team Deathmatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second game mode, Team Deathmatch (`tdm`): two player-picked teams, friendly fire off, team-kill-count scoring, round-end winner by team score, and the lobby/scoreboard UI to pick a mode/team and see team scores.

**Architecture:** Extend the existing `shared/modes.js` registry with a `tdm` entry (`teams: true`). Server gains team assignment (join-time pick or auto-balance, bots balance the same way `syncBots` already balances classes), a `room.score = { a, b }` counter incremented on team kills, a friendly-fire skip in shot resolution, and a team-aware round-end winner. Client gains a mode picker + team picker in the lobby (same radio-card pattern as the existing map/class pickers) and a scoreboard that groups by team and shows a team-score header — team totals are derived client-side by summing each team's `kills` from the state snapshot, no new wire field needed for that.

**Tech Stack:** Node.js (`node:test`, `ws`), vanilla JS client, no new dependencies. Phase 1 (quickplay matchmaking + bot-fill) is already shipped — this plan only touches what's listed below.

---

### Task 1: Mode registry gains `tdm`

**Files:**
- Modify: `shared/modes.js`
- Modify: `test/modes.test.js:8-17` (existing test's assertions change — `tdm` becomes valid)

- [ ] **Step 1: Update the existing registry test**

Replace the test at `test/modes.test.js:8-17`:

```js
test('mode registry exposes ffa and tdm, rejects unknown ids', () => {
  assert.equal(DEFAULT_MODE, 'ffa');
  assert.ok(isModeId('ffa'));
  assert.ok(isModeId('tdm'));
  assert.equal(MODES.tdm.teams, true);
  assert.equal(isModeId('domination'), false);
  assert.equal(isModeId(''), false);
  assert.equal(isModeId(null), false);
  assert.equal(getMode('ffa'), MODES.ffa);
  assert.equal(getMode('nope'), MODES.ffa);
  assert.equal(getMode(undefined), MODES.ffa);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/modes.test.js`
Expected: FAIL — `isModeId('tdm')` is currently `false`, and `MODES.tdm` is `undefined`.

- [ ] **Step 3: Add the `tdm` entry**

Replace the `MODES` export in `shared/modes.js`:

```js
export const DEFAULT_MODE = 'ffa';
export const MODES = Object.freeze({
  ffa: Object.freeze({ id: 'ffa', name: 'Free-for-all', teams: false, scoring: 'kills' }),
  tdm: Object.freeze({ id: 'tdm', name: 'Team Deathmatch', teams: true, scoring: 'kills' }),
});
export function isModeId(id) { return typeof id === 'string' && Object.hasOwn(MODES, id); }
export function getMode(id = DEFAULT_MODE) { return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE]; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/modes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/modes.js test/modes.test.js
git commit -m "feat: add Team Deathmatch to the mode registry"
```

---

### Task 2: Server — team assignment (join + bot balancing)

**Files:**
- Modify: `server/index.js:10` (import), `server/index.js:111-153` (join handler), `server/index.js:199-222` (`syncBots`), `server/index.js:223-230` (`respawn`)
- Test: `test/modes.test.js` (append)

- [ ] **Step 1: Extend the `quickjoin` test helper to send a team, and write the failing tests**

In `test/modes.test.js`, replace the `quickjoin` helper (added in the Phase 1 plan) with a version that passes `team` through:

```js
async function quickjoin(url, { mapId = 'vertex', mode = 'ffa', name = 'Player', classId, botFill, team } = {}) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', quickplay: true, mapId, mode, name, classId, botFill, team }));
  return { ws, welcome: await welcome };
}
```

Append these tests to `test/modes.test.js`:

```js
test('tdm quickplay auto-assigns the less-populated team when no team is requested', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await quickjoin(url, { mode: 'tdm', team: 'a' }); t.after(() => a.ws.terminate());
  const b = await quickjoin(url, { mode: 'tdm' }); t.after(() => b.ws.terminate());
  const room = game.rooms.get(a.welcome.room);
  assert.equal(room.peers.get(a.welcome.id).player.team, 'a');
  assert.equal(room.peers.get(b.welcome.id).player.team, 'b', 'second joiner auto-assigned to the smaller team');
});

test('tdm bots balance onto whichever team has fewer players', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 4, maxPlayers: 6 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await quickjoin(url, { mode: 'tdm', team: 'a' }); t.after(() => a.ws.terminate());
  const room = game.rooms.get(a.welcome.room);
  const teams = [...room.peers.values()].map((peer) => peer.player.team);
  const counts = { a: teams.filter((x) => x === 'a').length, b: teams.filter((x) => x === 'b').length };
  assert.ok(Math.abs(counts.a - counts.b) <= 1, `teams should be balanced, got ${JSON.stringify(counts)}`);
});

test('ffa quickplay joins never get a team assigned', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 });
  t.after(() => game.close());
  const a = await quickjoin(`ws://127.0.0.1:${game.port}/ws`, { mode: 'ffa' }); t.after(() => a.ws.terminate());
  assert.equal(a.welcome.player.team, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/modes.test.js`
Expected: FAIL — `player.team` is `undefined` on every join today (no team assignment exists yet).

- [ ] **Step 3: Import `getMode` and add the `assignTeam` helper**

In `server/index.js:10`, replace:

```js
import { DEFAULT_MODE, isModeId } from '../shared/modes.js';
```

with:

```js
import { DEFAULT_MODE, getMode, isModeId } from '../shared/modes.js';
```

Add this function next to `syncBots` (`server/index.js:199`, immediately before `function syncBots(room) {`):

```js
  function assignTeam(room) {
    const counts = { a: 0, b: 0 };
    for (const peer of room.peers.values()) if (peer.player.team) counts[peer.player.team]++;
    return counts.a <= counts.b ? 'a' : 'b';
  }
```

- [ ] **Step 4: Rewrite the join handler to resolve mode once and assign a team**

Replace the entire `if (message.type === 'join') { ... }` block at `server/index.js:111-153` with:

```js
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
```

This resolves `mode` from the room that was actually joined (not the request), matching how `mapId` already works: a joiner's requested mode only takes effect when it creates a brand-new room.

- [ ] **Step 5: Balance bots onto the smaller team**

Replace the bot-creation line in `syncBots` at `server/index.js`:

```js
      const player = { ...createPlayer(randomUUID().slice(0, 8), name, chooseSpawn(room), classId, room.map), bot: true };
```

with:

```js
      const mode = getMode(room.mode);
      const team = mode.teams ? assignTeam(room) : undefined;
      const player = { ...createPlayer(randomUUID().slice(0, 8), name, chooseSpawn(room), classId, room.map), bot: true, ...(team ? { team } : {}) };
```

- [ ] **Step 6: Preserve team through respawn**

In `respawn()` (`server/index.js:223-230`), replace:

```js
    peer.player = { ...createPlayer(previous.id, previous.name, chooseSpawn(peer.room, peer), previous.nextClassId, peer.room.map), ...(peer.bot ? { bot: true } : {}), life: previous.life + 1, kills: resetScores ? 0 : previous.kills, deaths: resetScores ? 0 : previous.deaths, seq: peer.receivedSeq };
```

with:

```js
    peer.player = { ...createPlayer(previous.id, previous.name, chooseSpawn(peer.room, peer), previous.nextClassId, peer.room.map), ...(peer.bot ? { bot: true } : {}), ...(previous.team ? { team: previous.team } : {}), life: previous.life + 1, kills: resetScores ? 0 : previous.kills, deaths: resetScores ? 0 : previous.deaths, seq: peer.receivedSeq };
```

(Without this, a player's team would silently vanish on their first respawn — `createPlayer` doesn't know about teams.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --test test/modes.test.js`
Expected: PASS (all tests, including Task 1's)

- [ ] **Step 8: Run the full server test suite to check nothing else broke**

Run: `node --test test/server.test.js test/bots-server.test.js test/powers-server.test.js test/maps-server.test.js`
Expected: PASS, same counts as before this change

- [ ] **Step 9: Commit**

```bash
git add server/index.js test/modes.test.js
git commit -m "feat: assign and balance teams for team-based modes"
```

---

### Task 3: Server — friendly fire off, team scoring, team round-end winner

**Files:**
- Modify: `server/index.js` (tick loop: per-room `mode` lookup, shot resolution, round-end)
- Test: `test/server.test.js` (append)

- [ ] **Step 1: Add a `joinTeam` test helper and write the failing tests**

In `test/server.test.js`, add this helper right after the existing `join` function (`test/server.test.js:16-20`):

```js
async function joinTeam(url, room, name, team, classId) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name, classId, mode: 'tdm', team }));
  return { ws, welcome: await welcome };
}
```

Append these tests to `test/server.test.js` (they reuse the file's existing `command`, `stateWhere` helpers):

```js
test('friendly fire is off in team deathmatch: same-team hits deal no damage and no kill', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await joinTeam(url, 'ff-tdm', 'A', 'a'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'ff-tdm', 'B', 'a'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('ff-tdm');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true })] })), 40);
  t.after(() => clearInterval(fire));
  const shot = await stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'shot' && event.hit === b.welcome.id));
  clearInterval(fire);
  assert.equal(shot.events.some((event) => event.type === 'kill'), false, 'no kill event for a same-team hit');
  const victim = shot.players.find((p) => p.id === b.welcome.id);
  assert.equal(victim.health, 100, 'teammate takes no damage');
});

test('a kill in team deathmatch increments the killer team score', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, respawnSeconds: 0.2 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await joinTeam(url, 'tdm-score', 'A', 'a'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'tdm-score', 'B', 'b'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('tdm-score');
  Object.assign(room.peers.get(a.welcome.id).player, { x: -27, y: 0, z: 15, yaw: 0 });
  Object.assign(room.peers.get(b.welcome.id).player, { x: -27, y: 0, z: 10 });
  let seq = 0;
  const fire = setInterval(() => a.ws.send(JSON.stringify({ type: 'input', inputs: [command({ seq: ++seq, fire: true })] })), 40);
  t.after(() => clearInterval(fire));
  await stateWhere(a.ws, (state) => state.events.some((event) => event.type === 'kill'));
  clearInterval(fire);
  assert.equal(room.score.a, 1);
  assert.equal(room.score.b, 0);
});

test('round expiration in team deathmatch declares the higher-scoring team and resets scores', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, roundSeconds: 0.2 });
  t.after(() => game.close());
  const a = await joinTeam(`ws://127.0.0.1:${game.port}/ws`, 'tdm-round', 'A', 'a'); t.after(() => a.ws.terminate());
  const room = game.rooms.get('tdm-round');
  room.score.a = 5; room.score.b = 2;
  const state = await stateWhere(a.ws, (message) => message.events.some((event) => event.type === 'round'));
  const roundEvent = state.events.find((event) => event.type === 'round');
  assert.equal(roundEvent.winnerTeam, 'a');
  assert.equal(roundEvent.scoreA, 5); assert.equal(roundEvent.scoreB, 2);
  assert.equal(room.score.a, 0); assert.equal(room.score.b, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — teammates currently still damage/kill each other, `room.score` is never incremented, and round-end events never carry `winnerTeam`/`scoreA`/`scoreB`.

- [ ] **Step 3: Look up each room's mode once per tick**

In the `tick()` function, replace:

```js
    for (const room of rooms.values()) {
      room.remaining -= STEP;
```

with:

```js
    for (const room of rooms.values()) {
      const mode = getMode(room.mode);
      room.remaining -= STEP;
```

- [ ] **Step 4: Make the round-end winner team-aware**

Replace:

```js
      if (room.remaining <= 0) {
        const winner = [...room.peers.values()].map((peer) => peer.player)
          .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
        room.remaining = roundSeconds;
        room.effects.length = 0;
        for (const peer of room.peers.values()) respawn(peer, true);
        room.events.push({ type: 'round', ...(winner?.kills > 0 ? { winnerId: winner.id, winnerName: winner.name } : {}) });
      }
```

with:

```js
      if (room.remaining <= 0) {
        room.remaining = roundSeconds;
        room.effects.length = 0;
        for (const peer of room.peers.values()) respawn(peer, true);
        if (mode.teams) {
          const { a, b } = room.score;
          room.events.push({ type: 'round', ...(a === b ? {} : { winnerTeam: a > b ? 'a' : 'b' }), scoreA: a, scoreB: b });
          room.score = { a: 0, b: 0 };
        } else {
          const winner = [...room.peers.values()].map((peer) => peer.player)
            .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
          room.events.push({ type: 'round', ...(winner?.kills > 0 ? { winnerId: winner.id, winnerName: winner.name } : {}) });
        }
      }
```

- [ ] **Step 5: Skip friendly-fire damage and score team kills**

Replace:

```js
          const victim = room.peers.get(result.hit)?.player;
          if (victim && victim.health > 0) {
            victim.health = Math.max(0, victim.health - getClass(peer.player.classId).damage);
            if (victim.health === 0) {
              victim.deaths++; victim.respawnIn = respawnSeconds; victim.vx = 0; victim.vy = 0; victim.vz = 0;
              victim.abilityTime = 0; victim.shieldHealth = 0; clearOwnerEffects(room, victim.id);
              peer.player.kills++;
              room.events.push({ type: 'kill', killer: peer.player.id, victim: victim.id, airborne: !peer.player.grounded && !peer.player.ropeId });
            }
          }
```

with:

```js
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS (all tests, including pre-existing ffa combat/round tests — friendly-fire skip only applies `when mode.teams`, so ffa behavior is unchanged)

- [ ] **Step 7: Run the full test suite**

Run: `node --test test/`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add server/index.js test/server.test.js
git commit -m "feat: turn off friendly fire and add team scoring for team deathmatch"
```

---

### Task 4: Client — mode picker + team picker

**Files:**
- Modify: `index.html:25` (replace the static mode-row), `index.html:61` (give the HUD mode label an id)
- Modify: `client/ui.css` (append mode/team picker styles)
- Modify: `client/main.js` (imports, state, picker population, `start()` payload, welcome handler)

- [ ] **Step 1: Replace the static mode-row with mode and team pickers**

In `index.html:25`, replace:

```html
          <div class="mode-row"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/></svg>Free-for-all</span><span>6 players <i aria-hidden="true">·</i> 5 min</span></div>
```

with:

```html
          <fieldset class="mode-picker"><legend>GAME MODE</legend><div id="lobby-modes" class="mode-options"></div></fieldset>
          <fieldset class="team-picker" id="team-picker" hidden><legend>TEAM</legend><div id="lobby-teams" class="team-options"></div></fieldset>
          <div class="mode-row"><span>6 players <i aria-hidden="true">·</i> 5 min</span></div>
```

- [ ] **Step 2: Give the HUD mode label an id**

In `index.html:61`, replace:

```html
<div class="match-info"><span class="eyebrow">FREE-FOR-ALL</span><div class="match-numbers">
```

with:

```html
<div class="match-info"><span class="eyebrow" id="hud-mode">FREE-FOR-ALL</span><div class="match-numbers">
```

- [ ] **Step 3: Style the new pickers**

Append to `client/ui.css` (after the `.bot-fill-toggle input` rule):

```css
.mode-picker, .team-picker { min-width: 0; padding: 0; margin: 14px 0 0; border: 0; }
.mode-picker legend, .team-picker legend { padding: 0; color: #d4dbcf; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; }
.mode-options, .team-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 7px; }
.mode-option, .team-option { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; padding: 9px; border: 1px solid #a5b6a650; border-radius: 4px; background: #192c26f2; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s, border-color .15s; }
.mode-option:hover, .team-option:hover { background: #2b4035; border-color: #c4cebaaa; }
.mode-option:has(input:checked), .team-option:has(input:checked) { background: color-mix(in srgb, var(--accent) 22%, #1b2d26); border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.mode-option:has(input:focus-visible), .team-option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }
.mode-option:has(input:disabled), .team-option:has(input:disabled) { opacity: .5; cursor: wait; }
.mode-option input, .team-option input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: inherit; }
```

- [ ] **Step 4: Import the mode registry and add lobby state**

In `client/main.js`, replace the import at the top:

```js
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';
```

with:

```js
import { CLASSES, DEFAULT_CLASS, getClass, isClassId } from '../shared/classes.js';
import { MODES, DEFAULT_MODE, isModeId } from '../shared/modes.js';
```

After the existing `selectedClass` block (`client/main.js:41-45`):

```js
let selectedClass = DEFAULT_CLASS;
try {
  const saved = localStorage.getItem('drift-class');
  if (isClassId(saved)) selectedClass = saved;
} catch { /* Optional. */ }
```

add:

```js
let selectedMode = DEFAULT_MODE;
try {
  const saved = localStorage.getItem('drift-mode');
  if (isModeId(saved)) selectedMode = saved;
} catch { /* Optional. */ }
let selectedTeam = 'a';
let roomMode = DEFAULT_MODE;
```

- [ ] **Step 5: Populate the mode and team pickers**

In `client/main.js`, right after the `$('map-choices').replaceChildren(...)` block closes (`client/main.js:182-209`, ends with `}));`), insert:

```js
  $('lobby-modes').replaceChildren(...Object.values(MODES).map((mode) => {
    const label = document.createElement('label');
    label.className = 'mode-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'mode'; input.value = mode.id;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      selectedMode = mode.id;
      try { localStorage.setItem('drift-mode', selectedMode); } catch { /* Optional. */ }
      syncModes();
    });
    label.append(input, document.createTextNode(mode.name));
    return label;
  }));
  $('lobby-teams').replaceChildren(...['a', 'b'].map((team) => {
    const label = document.createElement('label');
    label.className = 'team-option';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'team'; input.value = team;
    input.addEventListener('change', () => {
      if (!input.checked || connecting || player) return;
      selectedTeam = team;
    });
    label.append(input, document.createTextNode(`Team ${team.toUpperCase()}`));
    return label;
  }));
  function syncModes() {
    for (const input of $('lobby-modes').querySelectorAll('input')) {
      input.checked = input.value === selectedMode;
      input.disabled = connecting;
    }
    $('team-picker').hidden = !MODES[selectedMode].teams;
    for (const input of $('lobby-teams').querySelectorAll('input')) {
      input.checked = input.value === selectedTeam;
      input.disabled = connecting;
    }
  }
  syncModes();
```

- [ ] **Step 6: Keep the pickers in sync while connecting**

In `setLobbyBusy` (`client/main.js:457-464`), replace:

```js
  function setLobbyBusy(busy) {
    connecting = busy;
    for (const id of ['play', 'create-room', 'join-toggle', 'room-code', 'join-submit', 'player-name']) $(id).disabled = busy;
    $('lobby').setAttribute('aria-busy', String(busy));
    updateLobbyRoom();
    syncClasses();
    syncMapDetails();
  }
```

with:

```js
  function setLobbyBusy(busy) {
    connecting = busy;
    for (const id of ['play', 'create-room', 'join-toggle', 'room-code', 'join-submit', 'player-name']) $(id).disabled = busy;
    $('lobby').setAttribute('aria-busy', String(busy));
    updateLobbyRoom();
    syncClasses();
    syncMapDetails();
    syncModes();
  }
```

- [ ] **Step 7: Send the selected mode/team when joining**

In `start()` (`client/main.js:680-688`), replace:

```js
      const botFill = $('bot-fill').checked;
      connection.send(JSON.stringify(quickplay
        ? { type: 'join', quickplay: true, mapId: selectedMap, mode: 'ffa', name, classId, botFill }
        : { type: 'join', room: nextRoom, name, classId, mapId: selectedMap, botFill }));
```

with:

```js
      const botFill = $('bot-fill').checked;
      const mode = selectedMode;
      const team = MODES[mode].teams ? selectedTeam : undefined;
      connection.send(JSON.stringify(quickplay
        ? { type: 'join', quickplay: true, mapId: selectedMap, mode, team, name, classId, botFill }
        : { type: 'join', room: nextRoom, name, classId, mapId: selectedMap, mode, team, botFill }));
```

- [ ] **Step 8: Use the server-confirmed mode in the HUD/scoreboard header**

In the `welcome` handler (`client/main.js:736`), replace:

```js
        $('score-map').textContent = `${currentMap.name.toUpperCase()} / FREE-FOR-ALL`;
```

with:

```js
        roomMode = isModeId(message.mode) ? message.mode : DEFAULT_MODE;
        $('hud-mode').textContent = MODES[roomMode].name.toUpperCase();
        $('score-map').textContent = `${currentMap.name.toUpperCase()} / ${MODES[roomMode].name.toUpperCase()}`;
```

- [ ] **Step 9: Manual verification**

Run: `pnpm start` (or `node server/index.js`), open `http://localhost:5173`.
Expected:
- Lobby shows two mode cards ("Free-for-all", "Team Deathmatch") and, only when Team Deathmatch is selected, two team cards ("Team A", "Team B") appear below it.
- Picking Team Deathmatch + Team A and clicking "Enter arena" joins a match; the HUD's mode label and the scoreboard header (Tab) both read "TEAM DEATHMATCH" instead of "FREE-FOR-ALL".
- Selecting Free-for-all keeps today's behavior unchanged (no team picker, "FREE-FOR-ALL" label).

- [ ] **Step 10: Commit**

```bash
git add index.html client/ui.css client/main.js
git commit -m "feat: add a mode and team picker to the lobby"
```

---

### Task 5: Client — scoreboard team grouping and round-end messaging

**Files:**
- Modify: `index.html:118` (scoreboard markup)
- Modify: `client/main.js` (`renderScores`, the `round` event branch)

This task depends on Task 4's `roomMode`/`MODES` import existing in `client/main.js` — do Task 4 first.

- [ ] **Step 1: Add the team column and team-score header to the scoreboard markup**

In `index.html:118`, replace:

```html
    <section class="scoreboard overlay" id="scoreboard" hidden aria-labelledby="scoreboard-title"><div class="score-panel"><div class="panel-heading"><span class="eyebrow" id="score-map">FREE-FOR-ALL</span><kbd>TAB</kbd></div><h2 id="scoreboard-title">The lineup.</h2><table><thead><tr><th>PLAYER</th><th>KILLS</th><th>DEATHS</th></tr></thead><tbody id="score-rows"></tbody></table><p class="muted">Release Tab to get back to the action.</p></div></section>
```

with:

```html
    <section class="scoreboard overlay" id="scoreboard" hidden aria-labelledby="scoreboard-title"><div class="score-panel"><div class="panel-heading"><span class="eyebrow" id="score-map">FREE-FOR-ALL</span><span class="team-score" id="score-teams" hidden></span><kbd>TAB</kbd></div><h2 id="scoreboard-title">The lineup.</h2><table><thead><tr><th>PLAYER</th><th id="score-team-header" hidden>TEAM</th><th>KILLS</th><th>DEATHS</th></tr></thead><tbody id="score-rows"></tbody></table><p class="muted">Release Tab to get back to the action.</p></div></section>
```

(`hidden` is a global HTML attribute that works on any element, including `<th>`/`<span>` — no new CSS is required to hide/show these.)

- [ ] **Step 2: Append a small style for the team-score header text**

Append to `client/ui.css`:

```css
.team-score { font-size: 11px; font-weight: 500; color: var(--muted); }
```

- [ ] **Step 3: Group the scoreboard by team and show team totals**

In `client/main.js`, replace `renderScores` (`client/main.js:928-940`):

```js
  function renderScores() {
    const rows = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map((state) => {
      const row = document.createElement('tr');
      if (state.id === playerId) row.className = 'self';
      for (const value of [displayName(state) + (state.id === playerId ? ' (you)' : ''), state.kills, state.deaths]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    $('score-rows').replaceChildren(...rows);
  }
```

with:

```js
  function renderScores() {
    const teams = MODES[roomMode]?.teams;
    const sorted = [...players].sort((a, b) => (teams ? (a.team || '').localeCompare(b.team || '') : 0) || b.kills - a.kills || a.deaths - b.deaths);
    const rows = sorted.map((state) => {
      const row = document.createElement('tr');
      if (state.id === playerId) row.className = 'self';
      const nameCell = document.createElement('td'); nameCell.textContent = displayName(state) + (state.id === playerId ? ' (you)' : '');
      const teamCell = document.createElement('td'); teamCell.textContent = state.team ? `TEAM ${state.team.toUpperCase()}` : ''; teamCell.hidden = !teams;
      const killsCell = document.createElement('td'); killsCell.textContent = state.kills;
      const deathsCell = document.createElement('td'); deathsCell.textContent = state.deaths;
      row.append(nameCell, teamCell, killsCell, deathsCell);
      return row;
    });
    $('score-rows').replaceChildren(...rows);
    $('score-team-header').hidden = !teams;
    if (teams) {
      const totals = players.reduce((acc, p) => { if (p.team) acc[p.team] = (acc[p.team] || 0) + p.kills; return acc; }, { a: 0, b: 0 });
      $('score-teams').hidden = false;
      $('score-teams').textContent = `TEAM A ${totals.a} · TEAM B ${totals.b}`;
    } else {
      $('score-teams').hidden = true;
    }
  }
```

- [ ] **Step 4: Make the round-end toast and celebration team-aware**

In the `round` event branch inside `receiveState` (`client/main.js:849-857`), replace:

```js
      } else if (event.type === 'round') {
        shotEffects.clear();
        powerEffects.clear();
        blastInput.cancel(); blastPreview = null;
        movementStyle.reset();
        powerFeedbackUntil = 0;
        celebration = event.winnerId ? { winnerId: event.winnerId, startedAt: performance.now() / 1000 } : null;
        showToast(event.winnerId ? `${event.winnerName} takes the round! Fresh start.` : 'New round. Fresh start.');
      }
```

with:

```js
      } else if (event.type === 'round') {
        shotEffects.clear();
        powerEffects.clear();
        blastInput.cancel(); blastPreview = null;
        movementStyle.reset();
        powerFeedbackUntil = 0;
        if (MODES[roomMode]?.teams) {
          celebration = null;
          showToast(event.winnerTeam ? `Team ${event.winnerTeam.toUpperCase()} wins the round, ${event.scoreA}–${event.scoreB}! Fresh start.` : `Round tied, ${event.scoreA}–${event.scoreB}. Fresh start.`);
        } else {
          celebration = event.winnerId ? { winnerId: event.winnerId, startedAt: performance.now() / 1000 } : null;
          showToast(event.winnerId ? `${event.winnerName} takes the round! Fresh start.` : 'New round. Fresh start.');
        }
      }
```

- [ ] **Step 5: Manual verification**

Run: `pnpm start` (or `node server/index.js`), join a Team Deathmatch match in two browser tabs on opposite teams, get a kill.
Expected:
- Scoreboard (Tab) shows a TEAM column, rows grouped by team, and a "TEAM A n · TEAM B n" line next to the mode name in the scoreboard header.
- At round end, the toast reads "Team A/B wins the round, n–n!" (or "Round tied, n–n.") instead of the FFA per-player message.
- Joining a Free-for-all match still shows the scoreboard exactly as before (no TEAM column, no team-score line).

- [ ] **Step 6: Commit**

```bash
git add index.html client/ui.css client/main.js
git commit -m "feat: group the scoreboard by team and add team-aware round-end messaging"
```

---

## Self-Review Notes

- **Spec coverage:** Covers every Phase 2 item from `docs/superpowers/specs/2026-10-05-game-modes-design.md`: mode registry `tdm` entry, room `team`/`score` state, team assignment (join-time pick + auto-balance, same spot bots already balance classes), friendly fire off, TDM scoring, round-end winner by team score, lobby mode/team pickers, scoreboard team column/grouping and team-score header. Domination (Phase 3) is explicitly out of scope — separate plan, per the spec's phased delivery.
- **Why team totals aren't a new wire field:** every team-scoring kill (`room.score[team]++`) happens in lockstep with that killer's own `kills++`, so summing `players[].kills` by `team` client-side reproduces `room.score` exactly, without adding a redundant field to the `state` snapshot or to `welcome`.
- **Backward compatibility:** `mode.teams` gates every new branch (friendly-fire skip, team scoring, team round-end, scoreboard grouping) — an `ffa` room takes none of these paths, so Phase 1 behavior and its existing tests are untouched.
- **Parallel dispatch:** Task 1 is tiny and has no dependents conflict — do it first, directly. Tasks 2+3 only touch `server/index.js` and `test/server.test.js`/`test/modes.test.js`; Tasks 4+5 only touch `index.html`, `client/ui.css`, and `client/main.js`. These two groups touch disjoint files and can run as two parallel background agents once Task 1 is committed.
