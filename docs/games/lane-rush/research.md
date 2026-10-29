# Lane Rush — reference research

Research date: 2026-10-06. Written before implementation. The following primary publisher-hosted game pages were opened live. Observations concern their published mechanics and controls; no claim is made of playing their embedded builds or measuring popularity.

## Observed patterns

- [Highway Bike Simulator — Brain Software / Poki](https://poki.com/en/g/highway-bike-simulator): its published description rewards passing close to traffic, while the controls use arrow keys for driving. This supports immediately understandable steering and a visible reward for a close pass.
- [Traffic Racer — skgames / CrazyGames](https://www.crazygames.com/game/traffic-racer-sxc): highway traffic, multiple vehicle types, and a time-trial option; the page explicitly maps left/right to steering and down to braking. Desktop, mobile, and tablet are listed. A compact racer can provide a brake without requiring a complicated driving tutorial.
- [Xtreme Traffic Racing — Kraken Ink Studio / CrazyGames](https://www.crazygames.com/game/racing-unlimited): its published keyboard mapping offers A/D or arrows, S/down to brake, and a separate pause key. Time trials and traffic modes are distinct stated options. Input and pause controls should stay legible around the actual road.

## Original implementation decisions

- A 90-second, top-down, three-lane sprint. The visible road is the game interface from the first frame; there is no promotional illustration or landing hero.
- Graphite asphalt, functional lane markings and barriers, an orange/ivory motorsport timing strip, and a lime player car. Original geometric vehicle drawing; no borrowed game artwork, game code, sound, or network assets.
- Each traffic row leaves a safe lane. Safe lanes between consecutive rows move at most one lane. Uniform row movement prevents overtaking rows from closing that route. Spacing is selected so the gap between collision windows exceeds a complete lane change even at maximum speed; traffic enters early enough to give at least 1.5 seconds of visible warning.
- Automatic acceleration with hold-to-brake. Braking makes traffic approach more slowly but reduces distance points, while the 90-second clock keeps running. No upgrades or persistent progression.
- Three hits end a run, with 1.6 seconds of recovery after a hit. Each car can cause damage or earn a close-pass bonus only once. A close pass is based on actual geometric clearance, not a random reward.
- Arrow/A-D lane changes, button controls, and horizontal swipes. Escape/P pause, automatic pause on blur/hidden, restart, terminal results, and optional local best storage. Sound is omitted to keep play immediate and quiet.
- `?preview=1` runs the same engine and renderer with an autonomous driver. It reads/writes no storage, attaches no gameplay input listeners, and produces no audio.

## Verification targets

Generated-route invariants across many seeds; reaction and lane-transition margins; collision, recovery, and single-car damage; close-pass scoring; brake tradeoff; time and distance progression; a full winning run; loss on exactly the third hit; pause/restart; bounded long-run state; preview autonomy and mobile keyboard/touch controls.


## Visual refinement — 2026-10-06

The parent reviewer inspected Wonder Shelf as a quality reference and reported viewport-filling gameplay, detailed interactive pieces, integrated themed HUDs, tactile controls and meaningful feedback. Those are attributed reviewer observations, not a claim that this implementation author played those reference games. No reference assets, compositions or game code were copied.

**An original motorsport frame.** Detailed original cars, glass, lamps, tires, road wear, passing track lights and projected service aprons. The live road remains the centerpiece; speed, distance, condition and timing are integrated into its frame. Projection maps the same world coordinates used by the engine; damage and near-miss effects follow actual engine events. The autonomous preview includes live engine-driven telemetry.

Typography is bundled locally with the game, including the applicable OFL license files. Reduced-motion preferences suppress optional feedback motion; movement required to read gameplay remains. No runtime font or asset network requests are required.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://poki.com/en/g/highway-bike-simulator
- Gameplay screen inspected visually through the browser: https://a.silvergames.com/screenshots/highway-bike-simulator/gameplay.jpg
- Observed composition: The published browser gameplay screen keeps nearly all pixels for the road, places small counters in the top corners, and locates speed near the vehicle.
- Original application: Replace the night dashboard with an original daylight concrete expressway. Make the track the page, with floating compact timing, condition and speed. Steering pedals stay at the lower edge.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
