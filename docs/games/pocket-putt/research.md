# Pocket Putt — reference research

Research date: 2026-10-06. Written before implementation. Sources were retrieved live with web search/open; these are gameplay references, not assets or layouts to copy.

## Observed reference patterns

1. [Golfparty.io — publisher-hosted game page, Milkshake Games / Poki](https://poki.com/en/g/golfparty-io). The published controls use mouse or touch, pulling backward to choose direction and shot strength, then releasing to putt. The stated challenge is navigating obstacles while minimizing shots; it also includes multiplayer racing. Its page explicitly supports desktop, phone, and tablet. Takeaway: one gesture can communicate both direction and power, but the direction must be visible before release.
2. [Pocket Golf — Coolmath Games](https://www.coolmathgames.com/0-pocket-golf). The live instructions describe dragging on the ball to set aim and power, a three-putt limit, and banking off walls around obstacles. This is evidence for precision and bank-shot mechanics. It is not evidence for the popularity of our new design. Takeaway: predictable wall restitution and readable shot strength make an intentionally small course interesting.
3. [Golf With Your Friends — Nintendo publisher storefront](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-download-software/Golf-With-Your-Friends-1766988.html). Used as a secondary product reference for a social miniature-golf format. No claim of having played its current build or inspected its controls.

## Original design decisions

- A quiet botanical country club: ivory printed scorecard, forest-green typography, copper accents, a top-down landscaped course, and original canvas-drawn planting. No artwork, courses, sounds, or brand marks are copied.
- Six authored holes introduce distance, banks, a dogleg, sand, water, and a final combination. A round has a clear end. Eight strokes per hole prevents endless stalls; a pickup scores nine and advances.
- Solo or two-player pass-and-play on one device. Players alternate complete holes; separate scorecard columns make each player's total clear. Lowest total wins. No networking or account setup.
- Pull back from the ball to aim and choose power; a visible aiming line and meter explain the gesture. An explicit angle control, power slider, and Putt button provide a complete keyboard/touch alternative. Shots are blocked while a ball is moving.
- A ball enters the cup only at a controlled speed. Sand dissipates energy. Water resets to the previous lie and adds one penalty stroke. Physics use small fixed steps and actual geometric collision tests.
- Pause, restart, result scorecard, local lowest-stroke best, mobile controls, and reduced-motion support are part of the first version. No countdown timer; precision is the challenge.

## Verification targets

Fixed-step collision/settling, shot lockout, cup-speed threshold, water penalty applied once, all six holes reachable with ordinary shots, eight-stroke pickup, two-player turn order, scorecard totals, full-round completion, and restart/pause behavior. Browser visual review is separate from these source observations.

### UI quality reference and typography revision

On 6 October 2026, the parent task inspected actual Wonder Shelf-hosted gameplay and documented it in `../WONDER-SHELF-REFERENCE.md`. The transferable principles were a dominant playable arena, readable integrated game state, tactile controls, and immediate cause/effect feedback. This pass uses those principles only; it does not copy reference designs, artwork, characters, assets, or game mechanics. This implementer did not independently view those later gameplay sessions.

Self-hosted lettering was sourced from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) and its [Google Fonts CSS service](https://fonts.googleapis.com/). The bundled font files are local WOFF2 subsets and include the corresponding SIL Open Font License notices. They add no external runtime requests.

## Full game-interface redesign — 6 October 2026

Concrete online interface reference: [Mini Golf Club](https://www.obumogames.com/assets/ObumoGamesBackground_Y46NjEvL1Z6BHBcx1H7iK.png).

**Observed:** Official developer gameplay image inspected in Chrome: raised physical course borders, saturated striped turf, a visible ring around the active ball, and no editorial framing. The primary playable listing https://www.crazygames.com/game/mini-golf-club documents corner hole/par information and a shot-power percentage.

**Original implementation decisions:** A full miniature court with compact corner HUD, an attached shot-control dock, and a collapsible scorecard. Navy surrounds and vivid fairway colors separate the playable surface from controls. Preserve all six authored holes and exact collision geometry.

This research preceded this redesign. Screens were inspected visually, not claimed as full reference playthroughs. No reference assets or layouts are reproduced; all existing game artwork is local code. This supersedes the earlier website/editorial composition.


### Desktop decision flow — 6 October 2026

On wide screens, the miniature course sits beside a shot station that groups player setup, current turn, aim, power, and Putt. Start uses this same station before the shot controls appear. The six-hole scorecard and local best stay visible beneath the controls. On phones, setup appears inside the course, controls sit directly below it, and the scorecard uses an expandable disclosure. This is a responsive composition change prompted by user review, not a new reference theme. Existing controls are moved as single DOM nodes at the desktop breakpoint; game engines, canvas dimensions, and interaction rules are unchanged.

### Viewport constraint refinement — 2026-10-06

The course and shot station share a viewport-sized shell. Setup, aim, power and Putt remain grouped; the six-hole scorecard docks on taller desktops and opens as a compact panel elsewhere, with a two-column layout in short landscape. This is a local usability refinement using the previously documented visual references, not a new reference observation. No game rules or physics changed.
