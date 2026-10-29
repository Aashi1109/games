# BREAKPOINT — reference research

Read on 6 October 2026, before implementation. These are official descriptions, not an embedded playthrough or evidence of present-day popularity.

- [Atari: Breakout](https://atari.com/pages/breakout) documents the paddle below a brick wall, serving a ball, scoring when bricks disappear, losing a ball when the paddle misses, and advancing to a second wall. This page describes the 1978 console edition, including five balls and optional catch/steering variants; it should not be treated as the release date of the entire Breakout franchise.
- [Atari: Breakout: Recharged](https://atari.com/products/breakout-recharged) describes refined classic controls, an endless arcade mode, fifty challenges, power-ups, and local co-op. The page lists 10 February 2022 as its release date. The useful design lesson is variety in meaningful court layouts with readable feedback; its weapons, co-op, and online leaderboards are outside this game's scope.

## Original implementation decisions

BREAKPOINT is a single-player four-court game with three lives, manually served balls, paddle-contact steering, durable bricks on later courts, rally scoring, and local personal best. It uses original layouts, scores, code, sound, and visuals. The actual cobalt canvas court is the first view; ivory score strips and coral/yellow bricks provide the athletic cabinet identity. A compact start prompt leaves the playable board visible. No promotional illustration or title-screen art substitutes for gameplay.

Collision detection sweeps a circle against rectangle faces and rounded corner regions, rather than checking only the ball's final position. Keyboard, pointer and touch use the same engine. Pause freezes physics; blur/hidden pages release inputs. Preview mode runs the same engine and renderer with an autonomous paddle, with no controls, sound or storage.

## Verification criteria

No tunneling at high speed; correct face and corner reflections; no false collision in empty rounded-corner space; damage and score awarded once per contact; three lost balls finish a run; all four cleared courts produce a win; pause and terminal states reject gameplay; invalid saved scores fall back safely. Mobile and desktop must show a real ready court immediately.

## Presentation revision — 6 October 2026

The parent agent personally inspected actual Ricochet Orchard and Tandem Tug gameplay reached from [Wonder Shelf](https://wonder-shelf.web.app/games/). Its reported observations were a dominant playable arena, integrated game HUD, tactile controls, and immediate score or hit feedback. This implementer did not independently view those game sessions. The reference was used only as a quality and interaction reference: no page layouts, compositions, artwork, game objects, or assets were copied.

BREAKPOINT's original direction is an electric cobalt arcade court inside a dark precision cabinet. The real collision bricks have coral, amber, and cyan beveled material faces; the rails and paddle have metal surfaces and edge lights. The same ball and engine produce a tapered trail, impact chips, brief rings, and floating score feedback. A cached brushed arena surface supplies material texture without visual noise animation. A compact dark ready prompt belongs to the court rather than replacing it with a landing screen. Reduced motion removes the trails and transient impact animation while preserving gameplay. The full court and compact HUD remain visible in the real autonomous preview, without cropping.

### UI quality reference and typography revision

On 6 October 2026, the parent task inspected actual Wonder Shelf-hosted gameplay and documented it in `../WONDER-SHELF-REFERENCE.md`. The transferable principles were a dominant playable arena, readable integrated game state, tactile controls, and immediate cause/effect feedback. This pass uses those principles only; it does not copy reference designs, artwork, characters, assets, or game mechanics. This implementer did not independently view those later gameplay sessions.

Self-hosted lettering was sourced from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) and its [Google Fonts CSS service](https://fonts.googleapis.com/). The bundled font files are local WOFF2 subsets and include the corresponding SIL Open Font License notices. They add no external runtime requests.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://atari.com/products/breakout-recharged
- Gameplay screen inspected visually through the browser: https://atari.com/cdn/shop/files/6.png?v=1657179437
- Observed composition: The inspected gameplay image dedicates nearly its entire area to the bounded brick court; the paddle and ball are unambiguous against quiet negative space.
- Original application: Rebuild as an ivory precision court, red/ochre/green brick bands and ink ball; use a slim vertical scoreboard on desktop and a top strip on phones. Remove the dark web cabinet and prose below it.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
