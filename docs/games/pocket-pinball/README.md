> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Pocket Pinball — Orbital No. 8

An original standalone three-ball pinball table styled as a space-age mechanical toy. Local fixed-step physics, moving flippers, a hold/release plunger, pop bumpers, slingshots, ORB completion bonuses, timed combos, a limited ball saver, opt-in synthesized sound, and a local best. No runtime dependencies or network assets.

## Run

From this directory: `npm start` (uses the repository's `scripts/serve.mjs`). The root server also serves `/pocket-pinball/`. Relative app assets work at a URL prefix or as the web root.

## Controls and rules

- **Start machine**, then hold/release Space or Enter to charge and launch. A light plunge can return to the shooter lane for a free retry.
- A/D or left/right arrows independently move the flippers. Timing a rising flipper adds energy; holding one up does not repeatedly kick the ball.
- Touch controls below the table support holding both flippers at once. The launcher also supports hold/release. Keyboard users can tab to the same buttons and hold Space/Enter.
- P or Escape pauses. Pause, Resume, Restart, and Sound are visible controls. Sound starts off and only initializes after opt-in.
- Bumpers score 100 × multiplier; star targets 250 × multiplier; slingshots 50 × multiplier. Hit different targets within 2.8 seconds to build a combo, adding 25 points for each additional combo step.
- Light all three ORB bumpers for a 1,000 × multiplier bonus and increase the multiplier up to ×5. ORB progress and multiplier persist between balls.
- The first four seconds after each ball enters the playfield have a single-use ball saver. Saved balls must be relaunched. Three consumed balls finish a game.

## Verification

`npm test` checks collisions, launch recovery, flipper impulses, scoring/contact suppression, combos, ball-save/three-ball lifecycle, and long-run finite-state physics. `research.md` records the live reference research completed before implementation.

Live browser verification on 2026-10-06 covered desktop and 390px mobile layouts, a complete three-ball game through the actual keyboard launcher (2,575 points), saved best, restart, keyboard Space activation of pause/resume, touch plunger charging/release, and simultaneous two-finger flipper holds/releases. A discovered upper-guide wedge was corrected and given a regression test. No page errors or horizontal overflow were observed.

## Game-screen refinement — 6 October 2026

The pinball cabinet now leads the page. The decorative promotional planet panel was removed; the actual enamel playfield, mechanical score wheels, physical controls, and ORB objective carry the screen. Bumpers have radial cap and metal-bezel materials with brief contact rings; the original rails and flippers retain their physical boundaries. On phones, the machine and its flipper/plunger controls precede the supporting rules. Starting the machine no longer forces a page scroll, and modified browser shortcuts are ignored. All physics, ball saves, three-ball progression, scoring, and optional gesture-enabled sound are preserved.

Typography uses local Bebas Neue and Outfit WOFF2 files with accompanying OFL licenses in `fonts/`. No external font service is contacted. No reference-site artwork or game objects were copied.

Changed: `index.html`, `style.css`, `app.js`, `fonts/`. All 12 existing engine tests and app syntax checks passed. Desktop composition was inspected; consolidated phone interaction checks are handled by the parent task.


## Reference-grounded UI redesign — 6 October 2026

A navy, silver and vermillion table replaces the cream workshop cabinet. The table uses the available screen height, with score/balls beside it on desktop and a compact top strip on phones. Flippers and launch controls remain adjacent to the table. ORB scoring and the three-ball mechanism are unchanged.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 12 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** 390 × 844 Chrome verification: score, physical table, launch/flippers and session controls fit. Start, launch into the ball-in-play state, both flipper buttons and Pause worked. This UI check does not claim a newly completed three-ball run; the engine lifecycle suite covers that behavior.


## Viewport containment — 6 October 2026

Table width follows the available height while preserving its 7:10 geometry. The flippers and plunger remain directly below the table. Phone instruments and session controls occupy fixed compact rows; scoring help becomes a bounded disclosure with a visible close handle on small or short screens.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.

The parent browser reviewer also launched a real ball; the table, both flippers, plunger and session buttons remained accessible on the smallest phone.

The final parent review confirmed expanded help at 320 × 568 and 844 × 390, including visible close controls and no overflow.
