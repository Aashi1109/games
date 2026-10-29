> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Pocket Putt — The Clover Club

A standalone six-hole botanical miniature-golf game. Original canvas courses, fixed-step physics, solo and two-player pass-and-play, expandable scorecard, water penalties, sand, and a local lowest-stroke best. No runtime dependencies or network assets. Fonts are bundled locally.

## Run

From this directory: `npm start` (uses the repository's `scripts/serve.mjs`). The root collection server also serves `/pocket-putt/`. All app URLs are relative, so the directory can be hosted at a URL prefix or as the web root.

## Play

- Choose solo or two players, then **Start round**.
- Drag backward from the ball and release; direction and power appear before the shot.
- Alternatively use the **Aim** and **Power** sliders and **Putt**. On the focused course, left/right aim, up/down set power, and Space putts.
- P or Escape pauses; the visible controls remain keyboard accessible.
- Sand slows the ball. Water returns to the previous lie and adds one penalty stroke. A cup catches only a gently moving ball. Eight unsuccessful putts end the hole at nine.
- Complete all six holes. In two-player mode, hand the device over after each completed hole. Lowest total wins.

## Check

`npm test` runs physics, hazards, turn-order, scoring, and course-reachability tests. `research.md` records the live source research and separates observed reference mechanics from original design choices.

Live browser verification on 2026-10-06 covered desktop and 390px mobile layouts, a complete two-player round through the visible aim/power controls (18 strokes each), saved best, restart, keyboard Space activation of pause/resume, and a real touch drag. No page errors or horizontal overflow were observed.


## Full interface redesign — 6 October 2026

On wide screens, the miniature course sits beside a shot station that groups player setup, current turn, aim, power, and Putt. Start uses this same station before the shot controls appear. The six-hole scorecard and local best stay visible beneath the controls. On phones, setup appears inside the course, controls sit directly below it, and the scorecard uses an expandable disclosure.

Concrete online gameplay screenshots and primary game pages were inspected before the redesign; URLs, observations and original decisions are in `research.md`. Each stylesheet is a clean replacement. No remote reference assets were copied; artwork and licensed fonts remain local. All gameplay engines, scores and existing keyboard/touch controls are preserved.

Verification: all 32 engine tests across these five games passed, and each client app passed JavaScript syntax checking. Parent task performs the consolidated rendered desktop and phone checks.

## Viewport layout

The course and shot station share a viewport-sized shell. Setup, aim, power and Putt remain grouped; the six-hole scorecard docks on taller desktops and opens as a compact panel elsewhere, with a two-column layout in short landscape. Verified at 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390 in initial, active and paused states.
