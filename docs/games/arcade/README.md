> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Little Break

A complete collection of seven original browser mini games. Seven distinct game worlds with actual playable fields, responsive layouts, keyboard and touch controls, synthesized sound, pause/resume, restart, favorites, and local best scores. No installs, accounts, remote assets, runtime dependencies, or analytics.

## Play locally

Requires Node 22 or newer. No package install is necessary.

```sh
cd arcade
npm run dev
```

Open http://127.0.0.1:4173. `PORT=4180 npm run dev` selects another port. The preview binds to loopback by default. For another device on your own network, explicitly run `HOST=0.0.0.0 npm run dev` and use your computer's LAN address.

## The games

| Game | Play | Controls |
| --- | --- | --- |
| Trap Sprint | Six short platforming routes with gaps, telegraphed thorns, and moving hazards. Instant retries. | Arrows / A D; Space / W / Up to jump. |
| Daily Circuit | Rotate a seeded wire network until every connection and bulb links to the battery. Daily and practice boards. | Tap tiles; arrows to navigate, Enter/Space to rotate. |
| Bumper Ring | Charge and dash opponents off a shrinking arena through three rounds. | Arrows / WASD; hold and release Space to dash. |
| Block Bloom | Place pieces on an 8×8 garden. Clear rows/columns; moving garden patches add bonus points. | Select a piece, then its top-left board square. Arrows/Enter and 1/2/3 also work. |
| Shelf Shuffle | Sort top parcels into matching stacks across five increasingly difficult depots. Undo/reset/legal-move help. | Tap source then destination; Tab/Enter for keyboard. |
| Wobble Delivery | Deliver a tower of boxes over three bumpy routes. Braking, hopping, and smooth acceleration preserve cargo. | Arrows / A D; Space / Up to hop. |
| Corner Rush | Complete three laps through every checkpoint on a daily course. Grass slows the car. | Left/right / A D; R recovers to the last gate with a penalty. |

Every action game has on-screen touch controls. Escape pauses/resumes; a game-specific selection can consume Escape first. Leaving a tab pauses the active game. Bumper Ring opponents are bots; this collection does not implement online multiplayer. Daily puzzles and courses change at midnight UTC. Personal bests, preferences, and shelf progression are saved only on the current browser/device; clearing browser storage resets them. Games continue working when storage or audio is unavailable.

The root Game Shelf links directly to each game. Little Break also runs independently.

## Verify and build

```sh
npm test
npm run check
npm run build
```

Focused tests cover placement/line clearing, generated puzzle solvability, parcel move legality, platformer reachability, race checkpoints, knockback, cargo loss, complete delivery runs, pause, and cleanup. The build copies native ES modules and assets to `dist/`; serve the contents at the root of a static HTTPS host. Routes use URL hashes and need no server rewrite rules. `npm start` serves the source application for local or Node hosting.

## Structure

- `src/app.js`: catalogue, routing, common game shell, audio, persistence.
- `src/art.js`: UI icons (legacy artwork exports are not used by the interface).
- `src/style.css`: visual system and responsive shell.
- `src/games/`: independent playable games, each exporting `mount(host, api)` and cleanup.
- `src/lib/core.js`: canvas, animation, seeded randomness, and safe storage helpers.
- `test/`: focused Node tests; no third-party test framework.

Graphics are drawn locally in SVG and Canvas. Text uses self-hosted Bricolage Grotesque, DM Sans, Rajdhani, and DM Serif Display with their licenses under `assets/fonts/`; no font or asset CDN is required. Decorative motion respects reduced-motion preferences. Real-time gameplay still moves as required by its mechanics.
