> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Kitchen Rush

An original, two-minute diner game. Pick a ticket, add its ingredients in the pictured order, then serve. Fast, accurate orders earn tips and increasing combo bonuses. A wrong order costs five seconds of that customer's patience; four walkouts end the shift.

## Run

From this directory: `npm start` (or `npm run dev`). The shared launcher is `node ../scripts/serve.mjs .`. From the repository server, open `/kitchen-rush/`. All assets are local and relative; no install, build or network asset is required.

## Controls

- Touch or click a ticket, ingredient, Undo, Clear or Serve.
- `1–6`: ingredients. `← / →`: choose ticket. `Backspace`: undo. `Enter`: serve while the assembly area has focus (adding an ingredient moves focus there).
- `P` or `Escape`: pause/resume. Native focused buttons also work with Enter/Space.
- Restart begins a fresh shift. Tab and a visible focus ring support every control.

Sound is optional and synthesized locally. The best score is saved only on this device; unavailable or malformed storage is handled. Switching browser tabs pauses the shift. Reduced-motion preferences disable decorative movement.

## Verification

`npm test` runs pure game rules covering recipe order, repair, combo scoring, expiry, pause, restart, the two-minute endpoint and invalid saved scores. Research and original design decisions are in `research.md`.



## Full interface redesign — 6 October 2026

A red-and-stainless diner station replaces the website layout: order tickets line the top, the assembled burger fills the central workspace, ingredient bins sit within reach, and serving controls dock along the counter. Phones use horizontally scrollable tickets and a three-column ingredient bank.

Concrete online gameplay screenshots and primary game pages were inspected before the redesign; URLs, observations and original decisions are in `research.md`. Each stylesheet is a clean replacement. No remote reference assets were copied; artwork and licensed fonts remain local. All gameplay engines, scores and existing keyboard/touch controls are preserved.

Verification: all 32 engine tests across these five games passed, and each client app passed JavaScript syntax checking. Parent task performs the consolidated rendered desktop and phone checks.

## Viewport layout

The kitchen uses a viewport-sized workstation. Phone tickets keep the selected recipe visible with compact choices; short landscape puts the order rail beside the pass. Burger artwork scales with its actual layer count to stay on the plate. Verified at 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390 in initial, active and paused states.
