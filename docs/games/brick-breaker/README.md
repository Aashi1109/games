> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# BREAKPOINT

An original, single-player brick breaker: four courts, three lives, paddle steering, durable bricks, and rally bonuses. The first screen is the actual ready court with a compact in-arena Start control. An ivory precision court, red/ochre/forest brick bands and an ink ball give the playable objects a clear visual hierarchy. Everything is drawn locally; there are no runtime packages, downloaded assets, accounts, or external network requests.

## Run

From this folder, use `npm start` (or `npm run dev`). This uses the repository's shared `../scripts/serve.mjs`. From the root preview server, visit `/brick-breaker/`.

## Play

- Move with **← / →** or **A / D**, move the mouse over the court, drag a finger across it, or hold the two onscreen arrow buttons.
- Click **Start Game**, **Launch Ball**, or press **Space** to serve. Each missed ball and cleared court requires a fresh serve.
- Catch the ball near a paddle edge to steer its return. Marked bricks need two or three hits.
- **Escape / P** or **Pause** freezes the game. Leaving the window or hiding its tab pauses automatically and clears held inputs. Resume explicitly when you return.
- **Restart** begins a new match immediately. Win and loss panels have immediate **Play Again**.
- Sound starts off. The Sound button enables short synthesized cues after that user gesture.

Destroying a brick earns 50 points per original strength; damaging a surviving brick earns 20. Every successive contact before a paddle return increases the destruction rally bonus by 10, capped at 150. Court clear bonuses are 500 × court number. Clearing all four adds 300 per remaining life. The best completed-match score is stored on this device; unavailable or malformed storage does not prevent play.

## Homepage preview

Use `/brick-breaker/?preview=1`. This is the same four-court engine and canvas renderer with an autonomous paddle. It automatically serves and starts a new match after a win or loss. A compact score/court/lives strip remains visible; titles, prompts, controls, and navigation are hidden. The canvas preserves its 4:3 proportions inside the available space, including 600 × 380 and 350 × 260 frames, with an ivory surround where necessary.

Preview mode registers no gameplay keyboard or pointer handlers, creates no audio, and never reads or writes local storage. Physics stops while its document is hidden. The embedding page may remove the iframe when offscreen to eliminate its animation work entirely.

## Implementation and checks

- `engine.js`: deterministic state, court layouts, continuous circle/rectangle face and corner collision detection, scoring, progression, pause.
- `app.js`: input, lifecycle, safe local best, optional audio, autonomous preview.
- `renderer.js`: original cached court surface, physical brick materials, paddle and ball, trails, impact chips/rings, and score feedback. The renderer consumes engine events and cannot change collisions or scoring.
- `index.html` / `style.css`: responsive game cabinet, real scoreboard, native controls, instructions and results. Reduced motion removes cosmetic trails and impact particles; gameplay motion remains necessary.
- `research.md`: official Atari references and the original design choices they informed.

Run `npm test` for the focused Node engine suite. On 6 October 2026, **14 tests passed** again after the presentation revision: layout bounds, high-speed tunneling, exact rounded corners, false-corner rejection, paddle steering, wall/corner reflection, durable scoring, three-ball loss, four-court win, pause/resume, input bounds, invalid values, and deterministic autonomous play. Syntax checks passed for `app.js`, `engine.js`, and `renderer.js`. An additional deterministic autonomous run cleared all four real layouts in 507 simulated seconds, scoring 21,610 points across 256 contacts.

The pure-engine checks do not substitute for rendered desktop/mobile browser QA. There is no multiplayer, remote leaderboard, save-and-resume match, or power-up system.

## Catalog metadata

- Title: **BREAKPOINT**
- Genre: arcade / skill
- Players: one
- Controls: keyboard, mouse, touch
- Structure: four original courts, three lives, replayable completed-match score
- Availability: fully local static page; works both at `/brick-breaker/` and as a standalone directory root

## Final typography and touch pass

Local Bebas Neue and Outfit WOFF2 lettering now replaces platform display fonts. OFL licenses are included in `fonts/`. HUD and control text are more readable, and phone movement/pause/restart hit areas are larger. These refinements preserve the original renderer overhaul and all tested engine behavior. A real coordinate click on Start at a 1512 × 861 desktop viewport kept `scrollY` at zero and the court at the same position; all programmatic game focus calls already use `preventScroll`.


## Reference-grounded UI redesign — 6 October 2026

Ivory precision court with ink, red, ochre and forest brick bands. The court leads the viewport; a slim score rail sits beside it on desktop and becomes a top strip on phones. Start and result prompts are compact, and the pointer conversion accounts for aspect-preserving letterboxing.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 14 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** 390 × 844 Chrome verification: Start, live ball movement, a +50 brick score and Pause worked. The phone layout now groups the intrinsic 4:3 court, HUD and controls without an artificial full-height letterbox; pointer hit coordinates still use the actual contained court.

## Control placement refinement — 6 October 2026

Desktop Pause, Restart and concise expandable help now live in the score rail. Paddle and launch controls remain centered directly beneath the court, preserving the relationship between input and play. Phone controls retain their compact positions below the 4:3 court.

This HTML/CSS-only pass was checked in Chrome at 1280 × 800, 1440 × 800 and 390 × 844. Actual play earned 50 points; the relocated Pause/Resume and Restart controls worked, and expanded help fits with the score and best run. HTML IDs remain unique. Engine tests were not rerun because no JavaScript or rules changed. The collection screenshot is a fresh capture of actual play.


## Viewport containment — 6 October 2026

The court receives the remaining viewport height with its 4:3 rendering intact. Phones use an intrinsic court when space permits; short landscape condenses the score rail into two columns. Help opens with its own visible close handle, and paddle/launch/session controls remain reachable.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.

The final parent review confirmed expanded help at 320 × 568 and 844 × 390, including visible close controls and no overflow.
