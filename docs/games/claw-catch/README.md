> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Claw & Catch

An original fishing game presented as a quiet pond journal. You have eight casts. Time the hook in the green zone, then hold and release to bring a fish ashore without snapping the line or letting it go slack. Centered casts can find rarer fish.

After a catch, **bank** the basket to keep its points and discoveries, or choose **one more cast** for a 25% larger multiplier on each successive catch. Any missed hook or lost fish returns the entire unbanked basket to the pond. Banked points and journal discoveries remain safe. The final successful cast banks automatically.

## Run

`npm start` or `npm run dev` from this directory uses `node ../scripts/serve.mjs .`. The root server also serves `/claw-catch/`. Relative assets support either URL. No dependency installation, build, external fonts, or network assets are needed; the pond and cat are drawn locally on canvas.

## Controls

- Click/tap **Cast a line**, then **Set the hook** in the green zone.
- Hold the reel button (or the pond) to reel; release to reduce tension. Ease off during visible surges. Prolonged slack also loses the fish.
- `Space` while the pond has focus performs the same actions. The action button supports native activation and Space-hold reeling. Tab/Enter/Space work on all other controls.
- `P`/`Escape`: pause/resume. Restart begins a new trip while keeping banked journal discoveries and your best score.

Leaving the tab pauses play. Pausing, releasing, pointer cancellation and window blur clear held input. Reduced motion keeps the scenery still; essential gameplay meters remain visible. Optional sound is synthesized locally. Local storage failures or malformed values do not block play.

## Verification

`npm test` checks timing, tension versus controlled reeling, slack/idle failure, risk multipliers, bank protection, the eight-cast endpoint, pause/restart and malformed saved progress. `research.md` records source behavior and original design decisions.


## Full interface redesign — 6 October 2026

On wide screens, the blue-hour pond sits beside a fishing station: phase, timing/tension meters, Cast/Reel/Bank, and immediate feedback stay together. Start, pause, and results replace this same control area. The catch log, basket, and personal best remain visible below it. Phones retain the pond overlay, thumb controls below the water, and expandable catch log.

Concrete online gameplay screenshots and primary game pages were inspected before the redesign; URLs, observations and original decisions are in `research.md`. Each stylesheet is a clean replacement. No remote reference assets were copied; artwork and licensed fonts remain local. All gameplay engines, scores and existing keyboard/touch controls are preserved.

Verification: all 32 engine tests across these five games passed, and each client app passed JavaScript syntax checking. Parent task performs the consolidated rendered desktop and phone checks.

## Viewport layout

The pond and tackle station share a viewport-sized shell. Start, timing, reel, bank and results stay in the same action station. The six-species catch log docks only when vertical space allows; its compact panel shows the full collection and basket without scrolling. Verified at 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390 in initial, active and paused states.
