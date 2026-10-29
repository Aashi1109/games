> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Asteroid Run

An original single-player space shooter with a procedural deep-space renderer. The actual playfield is drawn immediately, with a live training feed behind a compact Start run prompt. Clear four sectors with three hulls. No install, external assets or runtime dependencies.

## Run

From this folder: `npm start` (or `npm run dev`). The shared launcher runs `node ../scripts/serve.mjs .`; use the URL it prints. From the root collection server, open `/asteroid-run/`. Relative asset paths work under either URL. Tests: `npm test`.

## Play

- **Left / Right arrows or A / D:** rotate.
- **Up arrow or W:** thrust. Momentum persists; short bursts are easier to control.
- **Space:** hold to fire, with a 0.16-second cooldown.
- **Touch:** hold Left, Right, Thrust and Fire. Multiple buttons work together. Keyboard users can also focus a flight button and hold Space/Enter.
- **Escape / Pause:** pause or resume. Changing tabs or leaving the window pauses; return and resume explicitly.
- **Restart:** starts a fresh run immediately. The results button also starts a fresh run.
- **Sound:** off by default; the optional button enables synthesized effects after a user gesture.

Ships, rocks and bullets wrap around edges. Large rocks split into two medium rocks, each of which splits into two small rocks. The four sectors start with 2, 3, 4 and 5 large rocks, with escalating speed. Hits cost one hull. A replacement ship appears in the clearest available position after 0.85 seconds and has 2.8 seconds of protection, shown by its ring. The starting ship also has protection; a new sector adds at least 1.8 seconds. Losing three hulls ends the run. Clearing sector four wins.

Large / medium / small rocks score 50 / 100 / 200. Winning adds 500 per surviving hull. Local personal best is saved only when a run ends; blocked or malformed storage never prevents play. There is no account, online leaderboard, gamepad mode or multiplayer. Canvas gameplay is visual; readable DOM controls, keyboard access and live run announcements complement it. Reduced motion removes cosmetic debris and flame flicker; movement essential to play remains.

## Homepage preview

`?preview=1` uses the same engine and renderer with an autonomous pilot, advanced through ten seconds of real simulation before its first frame. It shows the board and HUD, automatically starts again after a win or loss, and has no player-input listeners, storage reads/writes or audio creation. Header, controls and prompts are hidden; the canvas is removed from keyboard tab order. Hidden documents stop simulation. A parent may place the preview iframe inside its own linked cover; the iframe itself is presentation, not a game launcher.

## Implementation and validation

`engine.js` is browser-independent deterministic logic. Physics uses steps no larger than 1/120 second, toroidal collision distances and swept bullet segments. `renderer.js` draws the original faceted rock geometry, ship materials, starfield, shot trails and fragments. `app.js` handles UI, multi-pointer input, audio and optional persistence. [Research](./research.md) records primary Atari / Alan-1 references and distinguishes observed mechanics from original design decisions.

Focused tests cover seeded starts, wrap boundaries, splitting and scoring, continuous bullet hits, cooldown, hull loss, invulnerability, safe respawn, all four sectors, the win bonus, fresh restarts, invalid time deltas and real autopilot hits.

Self-hosted Chakra Petch and DM Sans fonts are distributed under the bundled SIL Open Font Licenses in `fonts/`; no remote font service is contacted at runtime.


## Reference-grounded UI redesign — 6 October 2026

An amber survey arena replaces the framed flight console. The scene fills the window with restrained corner instruments and lower-edge flight buttons. The world keeps its original aspect ratio so rocks and collision boundaries remain coherent; hull icons are explicit compact horizontal SVGs.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 16 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** 390 × 844 Chrome verification: compact intrinsic 3:2 arena, horizontal hull icons, Start and Space fire were checked. Phone HUD, arena and flight buttons now sit together. The parent separately rechecked the compact phone composition.


## Viewport containment — 6 October 2026

Fixed minimum heights are removed. Phones and short landscape group the HUD, aspect-preserving arena, flight controls, session buttons and notes into height-bounded grid rows. Flight notes fit in a bounded panel; the simulation and input bindings are unchanged.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.
