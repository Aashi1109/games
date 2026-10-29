> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Tiny Tower Defense — The Garden Guard

A standalone, illustrated garden defense game. Seven hand-paced bug waves, nine build plots, three complementary defenders, and an original canvas landscape. No runtime packages, fonts, analytics, or network assets.

From this folder, run `npm start` (or `npm run dev`). The shared launcher is `node ../scripts/serve.mjs .`. From the workspace launcher, open `/tiny-tower-defense/`. All game resources also work when this folder is served at `/`.

Run focused logic checks with `npm test` or `node --test test/*.test.js`.

## Play

Start your watch, select a map letter, choose a seed packet, then press **Plant**. A dotted circle shows the selected defender’s actual range before buying. Send each wave when ready. You can build, upgrade, or sell during a wave. Each tower aims for the furthest enemy along the path within range.

- **Peashooter — 60 sunlight:** frequent single-target hits.
- **Acorn Mortar — 95 sunlight:** slower, stronger hits with splash damage.
- **Dew Sprinkler — 75 sunlight:** lighter hits that slow a nearby group to 48% speed for two seconds.

All defenders upgrade twice. Upgrades improve range, damage, and firing speed. Selling returns 70% of the total investment, rounded down. Begin with 150 sunlight and 12 hearts. Ants and skippers leak one heart, beetles two, the grand snail five. Each kill rewards sunlight; a cleared wave rewards `30 + wave × 8`. Survive wave seven with at least one heart to win. Score is `kills × 20 + wave reached × 150 + hearts × 60 + sunlight remaining`.

Tap/click the visible controls. Keyboard: Tab/Enter operate controls, arrows move between map plots, 1–3 select seed packets, P pauses/resumes, Escape clears the selection. Pause freezes the simulation; switching tabs automatically pauses. The speed button switches between 1× and 2×. Restart restores the initial economy. Essential movement remains visible under reduced-motion preferences, while decorative wiggling and impact rings stop.

Only a numeric personal best is stored under `garden-guard-best`; missing, malformed, or unavailable storage never prevents play. No server leaderboard or online account.

`research.md` documents the primary references consulted before implementation and distinguishes observed conventions from original design choices.

The interface uses an original garden materials, defender firing and planting feedback, compact HUD and potting bench. Bricolage Grotesque and DM Sans is self-hosted from `fonts/`, with its SIL Open Font License included. There are no remote font requests at runtime.

## Full interface redesign — 6 October 2026

A compact game bar leads directly into the saturated garden arena. Resources and game controls sit against its top edge; an attached defender cabinet keeps seed costs and selected-plot actions visible. Phone controls reflow into a three-seed command deck below the map. The path, build plots and all seven waves remain unchanged.

Concrete online gameplay screenshots and primary game pages were inspected before the redesign; URLs, observations and original decisions are in `research.md`. Each stylesheet is a clean replacement. No remote reference assets were copied; artwork and licensed fonts remain local. All gameplay engines, scores and existing keyboard/touch controls are preserved.

Verification: all 32 engine tests across these five games passed, and each client app passed JavaScript syntax checking. Parent task performs the consolidated rendered desktop and phone checks.

## Viewport layout

The canvas and plot buttons scale together inside a viewport-sized map area. Seed selection and plot actions sit alongside the map on desktop and short landscape, and below it on phones. Edge plot touch targets remain inside the map; the field guide keeps the best score available on compact layouts. Verified at 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390 in initial, active and paused states.
