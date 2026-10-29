# Arcade UI rebuild — 6 October 2026

The user requested a different polished visual world for every game, informed by real online game interfaces. References guide hierarchy and interaction, not copied compositions or assets.

## Actual screens inspected online

- [Twofold Inc. official gameplay screenshot](https://twofoldinc.com/images/screenshot_0.png): personally inspected in Chrome. The grid owns the center, state sits in a narrow band above, and the immediate tools sit below. Applied to **Block Bloom**: large ceramic board and compact score row. The three-piece tray now sits alongside on desktop, following the user’s later control-composition feedback; phones retain the tray below.
- [F-ZERO 99 official Nintendo gameplay screenshot](https://img-eshop.cdn.nintendo.net/i/3f5efd8de3892913a1002ea150ab37f648537646aa67f33fac5922e34e5a8c51.jpg?w=1000): personally inspected in Chrome. Track remains unobstructed, fast-changing metrics live at the edges, and large numerals make racing state scannable. Applied to **Corner Rush**: large circuit, edge timer, lap display, distinct checkpoint markings and a compact timing strip.
- [Mini Metro official full gameplay screenshot](https://dinopoloclub.com/wp-content/uploads/2019/09/screenshot-2.jpg): personally inspected in Chrome, reached from the official current gallery. Minimal back navigation, almost the entire screen devoted to the playable system, functional shapes with clear contrast. Applied across the arcade: game name in navigation, no page-sized introductory heading; **Daily Circuit** uses legible circuit traces and stateful components.
- [Mini Metro official Lisbon screen](https://dinopoloclub.com/wp-content/uploads/2023/12/Miniversary_Lisbon-1.png): inspected for functional line/shape clarity. The older press site's certificate failed; it was not bypassed.

No third-party screenshots or illustrations are bundled into the games. The local chooser uses captures of these games. All game graphics remain locally rendered Canvas or SVG.

## Individual directions

| Game | Visual world and composition |
| --- | --- |
| Trap Sprint | Industrial hazard trial. Structural beams, metal platforms, vermilion hazards, courier robot, green exit; narrow score/control rail beside the field on desktop. |
| Daily Circuit | Precision switchboard. Dark green board, brass traces, lit component states, restrained support controls. Large board with useful instructions beside it on desktop, controls below on phones. |
| Corner Rush | Motorsport time attack. Asphalt, red/cream kerbs, service bays, directional checkpoints, open-wheel car, dark timing panel beside the circuit. |
| Block Bloom | Ceramic puzzle table. Warm neutral surface, colored tactile pieces, centered board and immediately adjacent selection tray. |
| Shelf Shuffle | Walnut archive cabinet. Recessed sorting bays, brass number labels, physical parcels; a sorting desk beside the cabinet on desktop, grouping selection feedback, parcel legend, Undo, Reset and hints. |
| Bumper Ring | Competitive table sport. Red timber surround, cream circular play surface, numbered pucks, directional player marker, functional shrinking boundary and charge meter; movement pad and dash form a controller beside the desktop ring. |
| Wobble Delivery | Cargo route simulator. Cream/yellow dispatch panel, working cargo cart, industrial depots, road aligned exactly to the physics surface, balance needle and route progress. |

## Behavior and checks

- Entry screens mount the actual game in a paused preview. They do not increment progress, write best scores, consume run counters, or play audio. Starting initializes the live run.
- Pause, restart, keyboard/touch input, focus restoration, reduced motion, storage fallback, daily generation, and existing game mechanics are retained.
- Self-hosted fonts: Bricolage Grotesque, DM Sans, Rajdhani and DM Serif Display. Licenses are included beside the files.
- Standalone server and build include `assets/` for fonts and gameplay captures.
- Focused game tests cover physics, reachable courses, puzzle solvability, line clearing, sorting rules, complete delivery runs, keyboard handling, pause/cleanup and paused-preview drawing. Browser screenshots and responsive UI verification are coordinated by the parent task.

## Mobile verification

Chrome at 390 × 844: Circuit, Block Bloom, Shelf Shuffle, Bumper Ring, Corner Rush and Wobble Delivery were visually inspected. None overflowed horizontally. Circuit rotation/pause/resume/restart, Block placement, Shelf move/undo, Bumper pause/resume/restart and Corner recovery were exercised. The race recovery increased time from 20.0s to 24.8s including the four-second penalty. Bumper uses a square mobile camera, and Wobble uses a closer 720-unit view with repositioned meters. Media changes update the view without resetting gameplay. Action controls are at least 44px high. Screenshots: `output/mobile-bumper.png` and `output/mobile-wobble.png`. Desktop and Trap mobile verification were coordinated by the parent task.


## Desktop interaction composition — follow-up

The user asked for meaningful use of desktop side space, rather than squeezing everything into one viewport. Block’s next-piece tray and placement feedback now sit next to its large board; Shelf’s source/destination feedback and undo/hint actions form an adjacent sorting desk; Circuit’s live feedback precedes its secondary reset/practice actions. Their initial Play action occupies that same station. Generic Restart is hidden for Circuit and Shelf because each already has a local reset that preserves the current puzzle.

Trap keeps its left score rail, now with course guidance and keys. Corner’s race instruments and recovery guidance sit on the right. Wobble’s cargo instruments and driving guidance sit beside the road. Their movement, jump and pedal buttons stay beneath the field, where the relationship remains intuitive. Bumper’s direction pad and charge button form one adjacent controller. Mobile retains board-first stacking and thumb controls. Duplicate instructions were removed instead of filling the margins with prose.

Verified all seven at 1280 × 800 and 390 × 844, with wide desktop inspection at 1440 × 800 and short desktop checks at 1280 × 720. Puzzle placement/rotation/shelf transfer, race recovery and action focus were exercised. All seven refreshed desktop captures have scrollY 0 and no horizontal overflow; captures include the header, HUD and controls together and are true PNG files. The local chooser now chooses within the selected category, verified with Puzzles; its preview cache version is `20261006-controls-3`. JavaScript syntax check passed for 21 files and the production build passed. Game mechanics did not change, so the engine suite was not rerun for this layout follow-up.


## Viewport-only play — follow-up

All game routes now occupy `100dvh`, with zero-minimum grid tracks for their remaining play space. The chooser retains normal scrolling. `src/viewport.css` scopes these rules to gameplay, preserving the desktop action stations and mobile control order. Canvas uses a size-contained viewport and its logical aspect ratio, so rendering and pointer coordinates remain aligned. Circuit and Block boards stay square; shelf bays divide the available height while keeping every selectable shelf and action visible.

Help moved from the expanding document footer to a native modal dialog. Opening it pauses a running game; closing it restores the previous running state and game focus. Pause/results use the available screen, with a compact landscape result arrangement. Essential actions remain visible; secondary rules are available through Help instead of extending the page. Small 8×8 board cells necessarily fall below 44px, while main action buttons retain 44px targets.

Chrome verification: all seven games × six sizes × initial/active/help/paused = 168 cases, plus four representative result cases (Block and Bumper at 320×568 and 844×390). Sizes: 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390. No document overflow, visible button/board/canvas outside viewport, gameplay-panel overflow or aspect-ratio mismatch was detected. `output/viewport-checks.json` records the measurements. Real puzzle placement, circuit rotation, shelf transfer, replay and Escape-to-close-help were verified. Nine focused canvas lifecycle/input-mapping tests passed. These browser checks emulate sizes; they are not physical-device verification or a new complete win/loss playthrough of every game.

The seven previews were captured from actual active games at 1280×720 and scrollY 0, converted to true PNG, and versioned `20261006-viewport-4` in the chooser.
