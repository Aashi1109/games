> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Lane Rush

A complete, standalone 90-second traffic sprint. The actual top-down road is visible immediately, with compact corner timing, daylight asphalt, a lime player car, and readable racing telemetry. No cover art, runtime dependencies, network assets, or audio. Licensed fonts are bundled locally.

## Run

From this folder, run `npm start` or `npm run dev`. Both use the collection's `../scripts/serve.mjs`. The root server serves `/lane-rush/`; all game assets use relative URLs and also work when this folder is served as the web root.

## Play

- Choose **Start engine**. Survive 90 seconds; the third collision retires the car.
- **A / D** or **left / right arrows** change one lane per press. The car moves across the lane smoothly and promptly.
- Hold **down arrow, S, or Space** to brake. Braking slows traffic and reduces distance points while the countdown continues.
- On touchscreens, swipe horizontally across the road or use the left/right buttons. Hold the center brake pedal to slow down. All visible driving controls are at least 44px tall.
- **Escape or P** pauses/resumes. Visible Pause, Resume, and Restart buttons also work with keyboard and touch. Switching away from the window or tab automatically pauses; resuming requires an explicit action.
- Each traveled meter scores one point. A clean overtake adds 25. Passing within 26 world pixels of another car without hitting it awards 125 instead. A car can score only once.
- Finishing adds 1,000 points, plus 250 for each remaining hit allowance. A collision gives 1.6 seconds of recovery so one contact cannot consume the entire run.
- The best completed or retired run is saved on this device when storage is available. Storage restrictions do not prevent play.

## Fair traffic

Traffic rows move at the same road speed and stay 450 world pixels apart. Every row has an open lane, and consecutive safe lanes differ by at most one lane. At maximum speed, a newly visible car gives more than 1.5 seconds of warning, and the clear time between consecutive row collision windows leaves over 0.3 seconds beyond a complete lane transition. Lane changes are always controlled by the player; the guarantee describes an available route, not automatic avoidance.

## Live preview

Use `/lane-rush/?preview=1` for an embedded autonomous run. It uses the same renderer, traffic generation, collisions, scoring, and finish lifecycle. The driver reads the upcoming safe route and steers through normal physics. Completed runs restart after a short pause. This mode attaches no gameplay input handlers, has no audio, and neither reads nor writes storage. The road fills the preview viewport while retaining vehicle proportions.

## Verification

`npm test` runs 10 meaningful Node tests, all passing on 2026-10-06. Coverage includes 20,000 generated rows, reaction/transition margins, lane bounds, damage/recovery, exactly three hits, geometric close-pass scoring, brake tradeoffs, pause, deterministic restart, and 25 complete 90-second autonomous runs without damage. The app, engine and renderer modules passed `node --check`.

Browser checks covered desktop 1280×720 and mobile 390×844 loading, keyboard lane/brake controls, Escape pause, keyboard activation of Resume, actual canvas preview, and absence of horizontal overflow or page errors. The parent review verified a natural three-hit loss, results, local best, and replay. A follow-up CSS adjustment brings controls and primary session actions into short desktop viewports; terminal condition copy was corrected after that review. Parent browser QA owns final refreshed screenshots.

`research.md` records the live publisher-source research completed before implementation and distinguishes observed conventions from original design decisions.


## Playing-screen refinement

Detailed original cars, glass, lamps, tires, road wear, passing track lights and projected service aprons. The live road remains the centerpiece; speed, distance, condition and timing are integrated into its frame. Projection maps the same world coordinates used by the engine; damage and near-miss effects follow actual engine events. The autonomous preview includes live engine-driven telemetry.

Rajdhani and DM Sans are self-hosted in `fonts/`; their OFL licenses ship alongside them, so each game remains independently deployable.

Focused verification on 2026-10-06: 10 game-rule tests passed. Changed client JavaScript passed syntax checks. The parent reviewer verified the refreshed desktop and phone layouts and pause behavior.


## Reference-grounded UI redesign — 6 October 2026

A daylight concrete expressway replaces the night-time dashboard. The road fills the window, with timing at the upper corners, speed and distance low beside the road, and central brake/steering controls. Mobile telemetry has pale compact backings for reliable asphalt contrast.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 10 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** Parent desktop and 390 × 844 phone verification checked real driving and the refreshed scene. Mobile corner HUD backings were added after a contrast finding; the parent owns the final capture and recheck.


## Viewport containment — 6 October 2026

The road uses the actual remaining dynamic viewport height. Minimum race height is removed; short landscape receives compact corner telemetry and a smaller start/pause/result panel, with 44px pedals and session controls retained.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.
