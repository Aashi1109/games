# Faultline verification

Verified 7 October 2026 in the local project and Codex in-app browser.

## Automated checks

- `npm run test:faultline`: **29 passing tests**, scoped to this game.
- `npm --prefix faultline run check`: JavaScript syntax passes.
- `git diff --check`: passes. Existing unrelated DRIFT changes were preserved.
- PNGs decode with alpha; all 24 miner frames are populated, within bounds, and share a stable floor contact. Creature SVGs have no external dependencies. Runtime asset paths and interface IDs resolve.
- Simulated campaigns exercise both victory and defeat, repairs, resource prices, cargo capacity, safe saves and the final 950-HP siege beast. A normal campaign without mining loses late; three useful cargo trips can fund a winning loadout. Pointer and keyboard-assisted cannon fire have the same cadence.
- The optional `?preview=1` pilot uses genuine movement, mining, cargo, recall, purchasing and combat inputs. It never gives itself resources or changes the map directly. The demo does not save expeditions, clear player saves or write personal records.

## Observed browser checks

- Full autonomous browser campaign reached **EVACUATION CONFIRMED**: 4 waves, 43 creatures, 88 ore mined, 5:18 survived. The visible cargo, upgrade purchases, combat and ending were driven by the actual engine. [Victory capture](../design/assets/faultline/previews/faultline-victory.png).
- Start, pause, resume, recall, manual cannon entry, workshop restrictions, exit to title, reload and saved-expedition continuation were exercised through the interface.
- Audio preferences and explicit on-screen control selection were exercised. Sound generation also passed focused mocked lifecycle checks for unsupported AudioContext, volume bounds, voice limits, pause and disposal. Listening quality remains subjective.
- No browser errors or warnings were observed during the full campaign.
- Desktop 1280×800, portrait 390×844, small portrait 320×568, and short landscape 844×390 were inspected. The play page fits its viewport without document scrolling; the settings dialog can scroll on short screens. Touch controls were inspected with the actual on-screen control setting; this was not a physical-phone performance test.

## Delivery limits

- The game runs locally at `/faultline/` and is included in the catalogue and container file list. No public deployment or full collection Docker build was performed.
- Only Faultline's tests were run. Other games' suites were not rerun.
- The app uses Canvas for the playfield; keyboard/touch controls and labeled menus/HUD are provided, but a complete screen-reader gameplay alternative is not implemented.
- The art is an original playable interpretation of the earlier concept image. It is not a pixel-perfect recreation of that image.

Modly completed workflow `442e0bee-fccb-4658-a8d6-dfe556e4fd45` at 100% with a self-contained 2,308,984-byte GLB containing 128,232 triangles. The raw mesh, generation parameters, source and output hashes, validation, and generator license/notice are preserved in `design/assets/faultline/modly/`. The supplied source image already had transparency; a recorded four-line extension patch preserved that alpha mask and skipped a redundant background-removal model download.

The final Modly-derived runtime sprite is a 41,573-byte, 192 × 192 transparent PNG. Its raw source hash remained unchanged during coloring/rendering. All 29 tests and JavaScript syntax checks passed again after integration. The final browser reload visibly rendered the new crystal clusters with no errors or warnings; the [gameplay capture](../design/assets/faultline/previews/faultline-gameplay.png) and catalogue thumbnail show this build.
