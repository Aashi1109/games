# Asteroid Run — reference research

Researched 6 October 2026, before implementation. Sources below are the publisher and the manufacturer of its licensed arcade adaptation. These are mechanic and control references, not assets to reproduce.

## Observed in primary sources

- [Atari — Asteroids: Recharged](https://atari.com/products/asteroids-recharged), product page; release date 14 December 2021, accessed 6 October 2026. Describes asteroid destruction, UFO threats, additional weapons, score chasing, cooperative play and 30 challenges. The approachable shooting loop can support both replay and bounded challenges.
- [Alan-1 — Asteroids Recharged Pro](https://alan-1.com/product/asteroids-recharged-2-player-cabinet/), undated product page, accessed 6 October 2026. Describes five physical buttons, vector-style graphics, simultaneous players and a 256-wave structure. Independent actions are appropriate for held keyboard keys and simultaneous touch buttons.
- [Alan-1 / Atari — Asteroids Recharged Pro 2P Game Manual v0.9](https://alan-1.com/wp-content/uploads/2024/11/Asteroids-Recharged-Pro-2P-Game-Manual-V0.9.pdf), copyright 2024, page 17. Retrieved its indexed manufacturer-hosted text on 6 October 2026; direct full-PDF retrieval exceeded the browsing tool's file-size limit. It describes rotating left/right, forward thrust, fire and risky hyperspace. Large rocks split into two smaller pieces; those split again; smallest pieces disappear. Smaller rocks move faster. The manual distinguishes the arcade edition from the 2021 home release.

## Original implementation decisions

Asteroid Run is an original small browser game, with its own code, shapes, type treatment and synthesized sound. It uses no Atari marks or copied artwork. Four finite sectors begin with 2, 3, 4 and 5 rocks; clearing the fourth wins. Three hulls, a protected respawn, capped ship speed and readable hit boxes keep retries fair. Rocks award 50/100/200 points by size; a surviving hull adds 500 at victory. There is no hyperspace, UFO, multiplayer, power-up system or online leaderboard.

Controls use arrows or W/A/D plus Space, alongside four simultaneously holdable touch buttons. Pause and restart remain visible. Reduced motion removes cosmetic fragments and thrust flicker. A separate preview URL runs the actual engine with an autopilot and never registers player controls, creates audio or accesses storage.

## Visual refinement — 6 October 2026

The user clarified that Wonder Shelf is a quality reference only, with no permission or request to copy its designs or assets. The parent agent reported directly inspecting Ricochet Orchard and Tandem Tug: their actual arenas dominate the viewport, material treatment makes game pieces feel finished, controls and HUD belong to each game's theme, and feedback makes actions legible. This is a summary of the parent's observation, not a claim that this implementation agent personally visited those games.

The revised original direction is a deep-space flight console. Procedural basalt facets and crater marks, a layered metal spacecraft, visible engine exhaust, shot trails and impact fragments are drawn from our own geometry. A quiet distant planetary limb and depth-separated stars form the environment. Cool ice-blue instruments and amber warnings replace the initial flat green wireframe presentation. No reference artwork, layout, motifs, code, screenshots, image-generation output or external assets are used. The existing rock radii and physics are preserved; surface detail is clipped to each rock's original boundary. Start, pause and results remain compact instrument panels over the real renderer.

Typography uses self-hosted [Chakra Petch](https://github.com/google/fonts/tree/main/ofl/chakrapetch) and [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), with the included SIL Open Font Licenses. These are independent type resources, not assets from the quality reference.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://atari.com/products/asteroids-recharged
- Gameplay screen inspected visually through the browser: https://atari.com/cdn/shop/files/asteroids-recharged-screenshots-02.jpg?v=1657169070
- Observed composition: The arena fills the frame. Objective and score sit directly in opposite top corners; there is no separate control dashboard.
- Original application: Use a full-screen amber survey arena with sparse corner instruments and thumb controls at the lower edges. Remove the enclosed flight-console frame. Keep rock outlines readable and effects subordinate to collisions.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
