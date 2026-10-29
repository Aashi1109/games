# Domination (Phase 3 of Game Modes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `domination` game mode where two teams fight over 3 fixed capture zones per map; holding a zone alone ticks your team's score up over time, and the first team to a score cap (or the higher score when the round timer runs out) wins.

**Architecture:** Reuse every piece of team infrastructure Phase 2 (Team Deathmatch) already built — `peer.player.team`, `room.score = {a,b}`, friendly fire skip, team-aware round-end event, mode picker / team picker UI, scoreboard team grouping. Domination only adds: (1) a `zones` array on each map (3 per map, reusing each map's existing curated `targets` x/z coordinates as zone centers — already well-spread, already proven-reachable landmarks, radius 6, horizontal-only distance check), (2) a per-tick server-side occupancy scan that increments `room.score[team]` for each zone held by only one team, (3) a `scoreCap` early-win check alongside the existing round-timer check, (4) a client-only capture-bar HUD that derives zone ownership locally from the `state` snapshot's existing `players` array (same trick Phase 2 used to derive team-kill totals) — no new WebSocket message type.

**Tech Stack:** Node.js `node:test`, `ws`, Vite (client), vanilla JS/CSS (no framework).

---

### Task 1: Register the `domination` mode and add `zones` to all 5 maps

**Files:**
- Modify: `shared/modes.js`
- Modify: `shared/world.js` (solstice's inline `TARGETS`/`MAPS.solstice`)
- Modify: `shared/maps/canyon-relay.js`
- Modify: `shared/maps/freight-yard.js`
- Modify: `shared/maps/sky-garden.js`
- Modify: `shared/maps/vertex.js`
- Test: `test/modes.test.js`
- Test: `test/maps-layout.test.js`

- [ ] **Step 1: Write the failing registry + zones tests**

Add to `test/modes.test.js` (after the existing `'mode registry exposes ffa and tdm...'` test):

```js
test('mode registry exposes domination with team scoring', () => {
  assert.ok(isModeId('domination'));
  assert.equal(MODES.domination.teams, true);
  assert.equal(MODES.domination.scoring, 'zones');
});
```

Add a new file `test/maps-zones.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../shared/world.js';

test('every map defines exactly 3 capture zones with id/x/z/radius', () => {
  for (const [mapId, map] of Object.entries(MAPS)) {
    assert.equal(map.zones.length, 3, `${mapId} should have 3 zones`);
    const ids = new Set();
    for (const zone of map.zones) {
      assert.equal(typeof zone.id, 'string');
      assert.equal(typeof zone.x, 'number');
      assert.equal(typeof zone.z, 'number');
      assert.equal(typeof zone.radius, 'number');
      ids.add(zone.id);
    }
    assert.equal(ids.size, 3, `${mapId} zone ids should be unique`);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/modes.test.js test/maps-zones.test.js`
Expected: FAIL — `MODES.domination` is undefined, and `map.zones` is undefined for every map.

- [ ] **Step 3: Add the `domination` entry to `shared/modes.js`**

Replace the full contents of `shared/modes.js`:

```js
export const DEFAULT_MODE = 'ffa';
export const MODES = Object.freeze({
  ffa: Object.freeze({ id: 'ffa', name: 'Free-for-all', teams: false, scoring: 'kills' }),
  tdm: Object.freeze({ id: 'tdm', name: 'Team Deathmatch', teams: true, scoring: 'kills' }),
  domination: Object.freeze({ id: 'domination', name: 'Domination', teams: true, scoring: 'zones' }),
});
export function isModeId(id) { return typeof id === 'string' && Object.hasOwn(MODES, id); }
export function getMode(id = DEFAULT_MODE) { return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE]; }
```

Also update the existing registry test's negative assertion in `test/modes.test.js` (it currently asserts `domination` is unknown — that's now wrong):

Find:
```js
  assert.equal(isModeId('domination'), false);
```
Replace with:
```js
  assert.equal(isModeId('chaos'), false);
```

- [ ] **Step 4: Add `zones` to `shared/world.js` (solstice)**

In `shared/world.js`, the `TARGETS` export (lines 43-47) is the reference list of this map's 3 curated landmark locations. Add a parallel `ZONES` export right after it, and reference it from `MAPS.solstice`:

Find:
```js
export const TARGETS = [
  { id: 'target-a', x: -14, y: 4, z: -13 },
  { id: 'target-b', x: 17, y: 4, z: 12 },
  { id: 'target-c', x: 10, y: 0, z: -23 },
];
```
Replace with:
```js
export const TARGETS = [
  { id: 'target-a', x: -14, y: 4, z: -13 },
  { id: 'target-b', x: 17, y: 4, z: 12 },
  { id: 'target-c', x: 10, y: 0, z: -23 },
];
export const ZONES = [
  { id: 'zone-a', x: -14, z: -13, radius: 6 },
  { id: 'zone-b', x: 17, z: 12, radius: 6 },
  { id: 'zone-c', x: 10, z: -23, radius: 6 },
];
```

Find (in the `MAPS.solstice` object):
```js
    size: WORLD_SIZE, boxes: BOXES, pads: PADS, spawns: SPAWNS, targets: TARGETS, ropes: [],
```
Replace with:
```js
    size: WORLD_SIZE, boxes: BOXES, pads: PADS, spawns: SPAWNS, targets: TARGETS, zones: ZONES, ropes: [],
```

- [ ] **Step 5: Add `zones` to `shared/maps/canyon-relay.js`**

Find the `targets` array in `canyonRelay()`'s return object and add a `zones` array right after it:

Find:
```js
    targets: [
      { id: 'canyon-a', x: 33, y: 9.6, z: -19 },
      { id: 'canyon-b', x: -28, y: 9.6, z: 27 },
      { id: 'canyon-c', x: 0, y: 9.6, z: 5 },
    ],
```
Replace with:
```js
    targets: [
      { id: 'canyon-a', x: 33, y: 9.6, z: -19 },
      { id: 'canyon-b', x: -28, y: 9.6, z: 27 },
      { id: 'canyon-c', x: 0, y: 9.6, z: 5 },
    ],
    zones: [
      { id: 'zone-a', x: 33, z: -19, radius: 6 },
      { id: 'zone-b', x: -28, z: 27, radius: 6 },
      { id: 'zone-c', x: 0, z: 5, radius: 6 },
    ],
```

(If the exact punctuation/whitespace of the `targets` block differs slightly from what's shown here when you open the file, match on the `canyon-a`/`canyon-b`/`canyon-c` id strings instead — they are unique in the file.)

- [ ] **Step 6: Add `zones` to `shared/maps/freight-yard.js`**

Find:
```js
    targets: [
      { id: 'freight-a', x: -28, y: 9.6, z: 13 },
      { id: 'freight-b', x: 35, y: 6.4, z: 34 },
      { id: 'freight-c', x: 18, y: 9.6, z: -11 },
    ],
```
Replace with:
```js
    targets: [
      { id: 'freight-a', x: -28, y: 9.6, z: 13 },
      { id: 'freight-b', x: 35, y: 6.4, z: 34 },
      { id: 'freight-c', x: 18, y: 9.6, z: -11 },
    ],
    zones: [
      { id: 'zone-a', x: -28, z: 13, radius: 6 },
      { id: 'zone-b', x: 35, z: 34, radius: 6 },
      { id: 'zone-c', x: 18, z: -11, radius: 6 },
    ],
```

- [ ] **Step 7: Add `zones` to `shared/maps/sky-garden.js`**

Find:
```js
    targets: [{ id: 'garden-a', x: -23, y: 6.4, z: 12 }, { id: 'garden-b', x: 27, y: 6.4, z: 25 }, { id: 'garden-c', x: -4, y: 0.32, z: 7 }],
```
Replace with:
```js
    targets: [{ id: 'garden-a', x: -23, y: 6.4, z: 12 }, { id: 'garden-b', x: 27, y: 6.4, z: 25 }, { id: 'garden-c', x: -4, y: 0.32, z: 7 }],
    zones: [
      { id: 'zone-a', x: -23, z: 12, radius: 6 },
      { id: 'zone-b', x: 27, z: 25, radius: 6 },
      { id: 'zone-c', x: -4, z: 7, radius: 6 },
    ],
```

- [ ] **Step 8: Add `zones` to `shared/maps/vertex.js`**

This file computes its targets from local `radius`/`band` variables already in scope at the point the `targets` array is built. Find:

```js
    targets: [
      { id: 'vertex-core', x: 0, y: ringY + ringH, z: 0 },
      { id: 'vertex-ring-n', x: 0, y: ringY + ringH, z: -(radius - band / 2) },
      { id: 'vertex-ring-s', x: 0, y: ringY + ringH, z: radius - band / 2 },
    ],
```
Replace with:
```js
    targets: [
      { id: 'vertex-core', x: 0, y: ringY + ringH, z: 0 },
      { id: 'vertex-ring-n', x: 0, y: ringY + ringH, z: -(radius - band / 2) },
      { id: 'vertex-ring-s', x: 0, y: ringY + ringH, z: radius - band / 2 },
    ],
    zones: [
      { id: 'zone-a', x: 0, z: 0, radius: 6 },
      { id: 'zone-b', x: 0, z: -(radius - band / 2), radius: 6 },
      { id: 'zone-c', x: 0, z: radius - band / 2, radius: 6 },
    ],
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `node --test test/modes.test.js test/maps-zones.test.js`
Expected: PASS (all tests, including the full `modes.test.js` suite).

- [ ] **Step 10: Run the full test suite as a regression check**

Run: `node --test`
Expected: All tests pass (no pre-existing test should reference `isModeId('domination') === false` anymore — Step 3 already fixed the one that did).

- [ ] **Step 11: Commit**

```bash
git add shared/modes.js shared/world.js shared/maps/canyon-relay.js shared/maps/freight-yard.js shared/maps/sky-garden.js shared/maps/vertex.js test/modes.test.js test/maps-zones.test.js
git commit -m "$(cat <<'EOF'
feat: add domination mode and capture zones to all maps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server-side zone-occupancy scoring and score-cap early win

**Depends on:** Task 1 (needs `MODES.domination` and `map.zones` to exist).

**Files:**
- Modify: `server/index.js`
- Test: `test/server.test.js`

**Do not touch client files** (`index.html`, `client/main.js`, `client/ui.css`) — a parallel agent owns those in Task 3.

- [ ] **Step 1: Extend the `joinTeam()` test helper to accept a mode**

Open `test/server.test.js`. The existing `joinTeam()` helper (line 21) is hardcoded to `mode: 'tdm'`:

```js
async function joinTeam(url, room, name, team, classId) {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name, classId, mode: 'tdm', team }));
  return { ws, welcome: await welcome };
}
```

Replace it with a version that defaults to `'tdm'` (so all 5 existing call sites, which never pass a 6th argument, keep working unchanged) but accepts an override:

```js
async function joinTeam(url, room, name, team, classId, mode = 'tdm') {
  const ws = new WebSocket(url); await once(ws, 'open');
  const welcome = receive(ws, 'welcome');
  ws.send(JSON.stringify({ type: 'join', room, name, classId, mode, team }));
  return { ws, welcome: await welcome };
}
```

No explicit `mapId` is sent, so these rooms land on the server's `DEFAULT_MAP` (`solstice`) — the new tests below read zone coordinates back out of `room.map.zones[0]` dynamically rather than hardcoding a map's coordinates, so this is fine regardless of which map a room defaults to.

- [ ] **Step 2: Write the failing zone-scoring test**

Add to `test/server.test.js`:

```js
test('domination ticks a team\'s score while it alone holds a zone, and does not score a contested zone', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, maxPlayers: 6, roundSeconds: 300 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await joinTeam(url, 'dom-room', 'A', 'a', undefined, 'domination'); t.after(() => a.ws.terminate());
  const b = await joinTeam(url, 'dom-room', 'B', 'b', undefined, 'domination'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('dom-room');
  const zone = room.map.zones[0];
  const peerA = room.peers.get(a.welcome.id);
  const peerB = room.peers.get(b.welcome.id);
  // Put only A's player inside zone 0, and B far away from every zone.
  peerA.player.x = zone.x; peerA.player.z = zone.z;
  peerB.player.x = zone.x + 1000; peerB.player.z = zone.z + 1000;
  const before = room.score.a;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(room.score.a > before, `expected room.score.a to increase while team a alone holds the zone, was ${before} now ${room.score.a}`);
  assert.equal(room.score.b, 0, 'team b should not score while absent from every zone');

  // Now contest the same zone with a player from team b; score should stop advancing for a.
  peerB.player.x = zone.x; peerB.player.z = zone.z;
  const contestedA = room.score.a;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(room.score.a, contestedA, 'a contested zone (both teams present) should not score for either team');
});

test('domination round ends early when a team reaches the score cap', async (t) => {
  const game = await createGameServer({ port: 0, host: '127.0.0.1', serveClient: false, botTarget: 0, maxPlayers: 6, roundSeconds: 300, scoreCap: 1 });
  t.after(() => game.close());
  const url = `ws://127.0.0.1:${game.port}/ws`;
  const a = await joinTeam(url, 'dom-cap', 'A', 'a', undefined, 'domination');
  const roundPromise = receive(a.ws, 'round', 2000);
  const b = await joinTeam(url, 'dom-cap', 'B', 'b', undefined, 'domination'); t.after(() => b.ws.terminate());
  const room = game.rooms.get('dom-cap');
  const zone = room.map.zones[0];
  const peerA = room.peers.get(a.welcome.id);
  const peerB = room.peers.get(b.welcome.id);
  peerA.player.x = zone.x; peerA.player.z = zone.z;
  peerB.player.x = zone.x + 1000; peerB.player.z = zone.z + 1000;
  const round = await roundPromise;
  assert.equal(round.winnerTeam, 'a');
  assert.ok(round.scoreA >= 1);
  t.after(() => a.ws.terminate());
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — `room.map.zones` is undefined if Task 1 wasn't merged yet (check first), or more likely `room.score.a` never increases and `scoreCap` option has no effect, since no server logic exists yet.

- [ ] **Step 4: Add the `scoreCap` option to `createGameServer`**

In `server/index.js`, find:

```js
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
} = {}) {
```

Replace with:

```js
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
```

- [ ] **Step 5: Add per-tick zone-occupancy scoring inside `tick()`**

In `server/index.js`, find the block inside `tick()` right after shot resolution and before the effects/snapshot block:

```js
      room.events.push(...stepPowerEffects(room.effects, [...room.peers.values()].map((peer) => peer.player), STEP, room.map));
      if (ticks % 3 === 0) {
```

Replace with:

```js
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
```

This runs the score-cap check by forcing `room.remaining` to `0`, which lets the **existing** round-end block (just above, `if (room.remaining <= 0) { ... }`) handle emitting the `round` event and resetting state — no duplicate round-end logic needed. Note the zone-scoring block must run *after* shot resolution (so a kill inside a zone this tick doesn't let a dead player still count as an occupant) but it runs every tick (not gated by `ticks % 3`), same as `room.remaining` decrementing every tick.

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS for both new tests.

- [ ] **Step 7: Run the full test suite as a regression check**

Run: `node --test`
Expected: All tests pass — specifically re-check the existing "round expiration" and "team deathmatch round end" tests in `test/server.test.js` still pass, since the round-end block is shared code and `mode.scoring === 'zones'` is `false` for `ffa`/`tdm`, so this new block should be a no-op for them.

- [ ] **Step 8: Commit**

```bash
git add server/index.js test/server.test.js
git commit -m "$(cat <<'EOF'
feat: add domination zone-occupancy scoring and score-cap early win

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Client capture-bar HUD + mode picker verification

**Depends on:** Task 1 (needs `MODES.domination` and `map.zones` to exist). Does NOT depend on Task 2 — the HUD derives zone ownership client-side from player positions already present in every `state` snapshot, independent of the server's own authoritative scoring in Task 2.

**Files:**
- Modify: `client/main.js`
- Modify: `index.html`
- Modify: `client/ui.css`

**Do not touch server files** (`server/index.js`, `shared/*`) — a parallel agent owns those in Task 2. (`shared/modes.js` and the map files are already done in Task 1 by the time you start — only read them, don't edit them.)

- [ ] **Step 1: Verify the mode picker already shows Domination with no code changes**

Open `client/main.js` and find the `syncModes()` function (added in Phase 2). It iterates `Object.values(MODES)` (imported from `../shared/modes.js`) to populate the mode-picker fieldset. Since Task 1 added `domination` to `MODES`, this should already render a "Domination" option with zero code changes.

Start the dev server to confirm:
```bash
node server/index.js &
```
Then open the lobby in a browser (or use the project's existing browser-verification approach) and visually confirm a "Domination" option appears in the mode picker, and that selecting it reveals the team picker (same `mode.teams` conditional Phase 2 already wired up). If this does NOT work automatically, read `syncModes()` fully and fix whatever assumption it makes that doesn't generalize (e.g. a hardcoded `['ffa', 'tdm']` list instead of `Object.values(MODES)` — if you find one, replace it with the generic form). Report in your final summary whether this step required any code change or not.

Kill the server process you started for this check before moving on (`kill %1` or find its PID and `kill` it) — do not leave stray node processes running.

- [ ] **Step 2: Add a capture-bar HUD container to `index.html`**

Find the HUD markup block containing the `#hud-mode` eyebrow span (added in Phase 2). Add a sibling container for zone capture bars right after the element that wraps the HUD eyebrow row. Example — if the existing structure looks like:

```html
<div class="hud-eyebrow">
  <span id="hud-mode">FREE-FOR-ALL</span>
</div>
```

Add immediately after it:

```html
<div id="hud-zones" class="hud-zones" hidden></div>
```

Match the plan's intent (a hidden-by-default container sitting near the existing HUD eyebrow) to whatever the real surrounding markup looks like — the exact parent tag names may differ slightly from this example; place `#hud-zones` as a sibling of the eyebrow block, not nested inside an unrelated element.

- [ ] **Step 3: Style the capture bars in `client/ui.css`**

Add, near the existing HUD/scoreboard rules (e.g. after the `.team-score` rule added in Phase 2):

```css
.hud-zones {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.hud-zones:not([hidden]) {
  display: flex;
}
.hud-zone {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}
.hud-zone-fill {
  height: 100%;
  width: 100%;
  transition: background-color 0.2s ease;
}
.hud-zone-fill.team-a { background: #4da3ff; }
.hud-zone-fill.team-b { background: #ff5d5d; }
.hud-zone-fill.contested { background: repeating-linear-gradient(45deg, #ffd24d, #ffd24d 4px, #c99a2e 4px, #c99a2e 8px); }
.hud-zone-fill.empty { background: transparent; }
```

- [ ] **Step 4: Render and update the capture bars from the existing `state` handler in `client/main.js`**

First, locate where `currentMap` is read (near the top of the module, `let currentMap = getMap(selectedMap);`) and where it's reassigned on map change (`currentMap = nextMap;`). Also locate the message handler's `state` branch (same place `renderScores()` is called from — search for where the `players` array from the snapshot is consumed, e.g. a line like `const players = message.players;` or similar inside the `case 'state':`/`if (message.type === 'state')` block).

Add a new function near `renderScores()` (same file, so it can share the `MODES`/`roomMode` state already in scope):

```js
function renderZones(players) {
  const container = $('hud-zones');
  if (!MODES[roomMode]?.teams || roomMode !== 'domination' || !currentMap.zones?.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.replaceChildren(...currentMap.zones.map((zone) => {
    let holder;
    let contested = false;
    for (const player of players) {
      if (player.health <= 0) continue;
      const dx = player.x - zone.x, dz = player.z - zone.z;
      if (Math.hypot(dx, dz) > zone.radius) continue;
      if (holder === undefined) holder = player.team;
      else if (holder !== player.team) { contested = true; break; }
    }
    const bar = document.createElement('div');
    bar.className = 'hud-zone';
    const fill = document.createElement('div');
    fill.className = `hud-zone-fill ${contested ? 'contested' : holder ? `team-${holder}` : 'empty'}`;
    bar.appendChild(fill);
    return bar;
  }));
}
```

Then call it from the existing `state` message handler, passing the same `players` array `renderScores()` already receives — find the call site of `renderScores(...)` inside the state handler and add a call to `renderZones(...)` right after it, passing the identical players argument `renderScores` was given. Do not introduce a new message type or new server round-trip — `players` is already present in every `state` snapshot (it's `message.players` from the server, each entry already has `.x`, `.z`, `.team`, `.health`).

- [ ] **Step 5: Manual verification — start the server and play**

```bash
pkill -f "node server/index.js" 2>/dev/null; sleep 1
nohup node server/index.js > /tmp/drift-server-domination.log 2>&1 &
```

Using the project's established Chrome DevTools MCP browser-verification technique (WebSocket proxy instrumentation + real button clicks, as used for Phases 1 and 2 — see prior session notes if unfamiliar with the exact steps), open the lobby, select "Domination" mode, select a team, join, and confirm:
- The team picker shows for Domination (same as it does for TDM).
- `#hud-zones` becomes visible once in a domination room and shows 3 bars.
- Moving a bot or the player into a zone's vicinity colors that zone's bar for the correct team; leaving it empties the bar; having both teams present marks it contested (striped).
- The scoreboard's existing team-score header line still works (reused from Phase 2, should need no changes since `MODES.domination.teams === true`).

Kill the server process afterward (find the PID via `ps aux | grep "node server/index.js"` and `kill` it) so you don't leave it running for the next verification step.

- [ ] **Step 6: Commit**

```bash
git add index.html client/main.js client/ui.css
git commit -m "$(cat <<'EOF'
feat: add domination capture-bar HUD, derived client-side from player positions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Final Integration Check (after both Task 2 and Task 3 land)

This step is NOT part of either parallel chunk — do it once both agents report back, in the main session:

1. Restart the server process (kill any stale `node server/index.js`, relaunch via `nohup`).
2. Run the full test suite once more: `node --test` — expect everything green (this is the first time Task 2's server changes and Task 1's map/mode changes run together with Task 3's client changes all present in the same tree, though Task 3 has no test suite impact since it's browser-only code).
3. Live-verify end-to-end in-browser exactly as described in Task 3 Step 5, but this time also confirm the server-side `room.score` increments shown in the scoreboard's "TEAM A n · TEAM B n" line actually climb while a zone is held uncontested (Task 2's authoritative scoring), not just the client-only capture-bar color (Task 3's visual-only derivation) — these are two independent computations of "who holds the zone" by design (server authoritative for scoring, client-derived for the HUD, same convention as Phase 2's client-derived kill totals), so both must agree in observed behavior even though neither reads the other's output.
