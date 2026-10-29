# Game modes: quickplay matchmaking, Team Deathmatch, Domination

**Date:** 2026-10-05
**Status:** approved, pending implementation

## Problem

Drift has exactly one mode: free-for-all deathmatch, kills/deaths scored, 300s
round timer, winner = most kills. There's no team play, no objective mode,
and no matchmaking — "Enter arena" joins one fixed room per map
(`PUBLIC_ROOMS`, e.g. `vertex` → room `open-vertex`). Once 6 humans are in
that room, later joiners get a hard "room is full" error with no fallback.

## Goals

1. Quickplay: "Enter arena" finds an existing public room with space for the
   chosen map+mode, or creates a new one — no more dead-end "room full" error.
2. A bot-fill on/off toggle in the lobby (room-wide setting).
3. Team Deathmatch mode: 2 teams, player-picked side, friendly fire off,
   team kill count wins.
4. Domination mode: 3 capture zones per map, teams score by holding zones,
   first to a score cap wins (or highest score at round timeout).

## Non-goals

- Ranked/skill-based matchmaking — "has space" is the only matching criterion.
- Persisted player stats/accounts.
- More than 2 teams.
- Spectator mode.

## Architecture

### Mode registry — `shared/modes.js` (new file)

Mirrors `shared/classes.js`'s pattern:

```js
export const DEFAULT_MODE = 'ffa';
export const MODES = Object.freeze({
  ffa: { id: 'ffa', name: 'Free-for-all', teams: false, scoring: 'kills' },
  tdm: { id: 'tdm', name: 'Team Deathmatch', teams: true, scoring: 'kills' },
  domination: { id: 'domination', name: 'Domination', teams: true, scoring: 'zones' },
});
export function isModeId(id) { ... }
export function getMode(id = DEFAULT_MODE) { ... }
```

### Room state (`server/index.js`)

Room gains:
- `mode` (one of `MODES`, fixed at room creation, same convention as today's
  `mapId`)
- `botFill` (bool, fixed at room creation)
- `bucket` (string, `${mapId}:${mode}`, only set for quickplay-created rooms)
- `score: { a: 0, b: 0 }` when `mode.teams` is true

Player/peer gains `team: 'a' | 'b'` when `mode.teams` is true. Bots are
assigned to whichever team currently has fewer players, same spot
`syncBots` already balances class counts.

### Quickplay matchmaking

Client's "Enter arena" sends `{ type: 'join', mapId, mode, team?, classId,
name, botFill? }` with **no room code**. Server:

1. Computes `bucket = ${mapId}:${mode}`.
2. Scans `rooms` for one with matching `bucket` and `< maxPlayers` humans;
   joins the first match.
3. If none, creates a new room with code `` `${bucket}#${n}` `` (`n`
   incrementing per bucket) and the requested `mode`/`botFill`.

"Create room" / "Join friends" keep today's explicit-room-code flow
unchanged — no `bucket`, `mode`/`team` picked the same way `mapId` is today
(set by the creator, inherited by joiners).

### Scoring

- `ffa`: unchanged — round-end winner sorts by `kills` desc, `deaths` asc.
- `tdm`: kill increments `room.score[killer.team]` in addition to
  `peer.player.kills`. Round-end winner = team with higher `score`.
- `domination`: every tick, for each zone, find players standing inside
  `zone.radius` of `(zone.x, zone.z)`; if all occupants belong to one team,
  that team's `score` ticks `+1` per zone per second (3 zones held = +3/s).
  Contested (both teams present) or empty zones tick nothing. After the
  score update, check `score.a >= cap || score.b >= cap` (cap e.g. 200) as an
  **early** win check, in addition to the existing `remaining <= 0` timeout
  check — whichever happens first ends the round, winner = higher score.
  Cap is a `scoreCap` room config, default `200`.

### Friendly fire

In the shot-resolution block in `server/index.js`, skip damage when
`mode.teams && victim.team === shooter.team`.

### Map data — zones

Each of the 5 maps (`solstice` inline in `shared/world.js`, plus
`canyon-relay.js`, `freight-yard.js`, `sky-garden.js`, `vertex.js`) gains a
hand-placed `zones: [{ id, x, z, radius }]` array, 3 entries (A/B/C),
positioned for roughly even walk-time from each team's spawns. Only read
when `mode === 'domination'`.

### Client — lobby UI

- Mode picker: new `fieldset.mode-picker` in the entry form, same shape/CSS
  pattern as the existing `map-picker` (radio-style option cards).
- Team picker: shown only when the selected mode has `teams: true` — two
  buttons (Team A / Team B), styled like the existing class-picker options.
- Bot-fill toggle: a checkbox next to `room-actions` ("Fill empty slots with
  bots", default on, matches current always-on behavior).
- "Enter arena" (`#play`) builds the quickplay `join` message described
  above instead of `{ room: nextRoom }`.

### Client — HUD

- Scoreboard (`#scoreboard`): header (`#score-map`, currently hardcoded
  "FREE-FOR-ALL") shows the mode name; table gains a `TEAM` column and rows
  group by team when `mode.teams`; a team-score header line shows
  `score.a` vs `score.b`.
- Domination: a small capture-bar HUD element per zone (owner color +
  contested state), driven off zone-ownership events the server already
  needs to compute for scoring — piggyback those onto the existing
  `events`/`state` snapshot instead of inventing a new message type.

## Error handling

- Quickplay join with an unknown `mode`/`mapId` → same `error` reply pattern
  as today's invalid `mapId`/`classId` checks (reject before room lookup).
- Team picker required when `mode.teams` — if omitted, server auto-assigns
  least-populated team rather than erroring (keeps the join flow
  forgiving).

## Testing

- `test/maps-layout.test.js`-style unit tests: zone positions have no
  overlapping solids, are reachable on foot (reuse existing stair/pad
  reachability helpers where applicable).
- New `test/modes.test.js`: bucket matchmaking (room reuse vs overflow to a
  new instance), team balance assignment, friendly-fire-off damage skip,
  TDM round-end winner-by-team-score, Domination zone tick scoring
  (single-team hold ticks, contested zone does not, score-cap early win).
- Manual: verify bot-fill toggle off actually yields 0 bots in a room via a
  live join.

## Phased delivery

1. **Quickplay matchmaking** — bucketing, overflow-to-new-room, bot-fill
   toggle. Mode stays `ffa` only. Independently shippable: fixes today's
   "room full" dead end.
2. **Team Deathmatch** — mode registry, team assignment, friendly-fire-off,
   team scoring, lobby mode+team pickers, scoreboard team grouping.
3. **Domination** — zone data (5 maps), capture scoring + score cap,
   capture HUD.
