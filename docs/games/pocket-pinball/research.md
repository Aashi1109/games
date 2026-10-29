# Pocket Pinball — reference research

Research date: 2026-10-06. Written before implementation. Sources were retrieved live with web search/open and Firecrawl. References inform ordinary pinball conventions; no table layout, artwork, code, or sound is copied.

## Observed reference patterns

1. [Pinball Arcade — Sandy / CrazyGames](https://www.crazygames.com/game/pinball). Firecrawl retrieved the game page and current controls: hold Enter to pull the plunger, release to launch, and A/D for the flippers. The page describes scoring from bumpers and bonus targets, with a ball lost through the lower drain. Takeaway: separate flipper buttons and hold/release launch are familiar, economical inputs.
2. [The Pinball Arcade — official Xbox game help, FarSight Studios](https://dlassets-ssl.xboxlive.com/public/content/184c5232-c43d-4c69-82de-5e28d085a0f2/GameManual/cfaa0c4f-b5e5-4e4d-84c7-d1a02ce2c982/en-NZ/index.html). Official mappings separate left/right flippers, plunger, nudging, table menu, and camera. Takeaway: the table needs immediate independent controls; menu and pause input must never be swallowed by gameplay handlers.
3. [Pinball essentials — Zen Studios](https://zenstudios.freshdesk.com/support/solutions/articles/43000638115-pinball-essentials). Defines flippers, plunger, outlanes, nudging and tilt, saves, extra balls, multiball, and target-driven modes. Takeaway: simple scoring goals can sit above a physical loop; clear ball-save feedback makes early drains less punishing. Not every advanced feature belongs in a compact first table.
4. [Alien Crush — Konami official manual](https://dds.konami.com/games/manual/pcemini/en_Alien.pdf). Retrieved as a second actual game's official manual/reference. A reference to a classic themed pinball game, not a source of copied art or table geometry.

## Original design decisions

- A space-age physical toy named Orbital No. 8: parchment playfield, vermilion rails, navy enamel cabinet, brass screws, printed orbit graphics, and mechanical-style score wheels. A portrait table fills the main play surface; controls resemble the toy's physical controls.
- Three balls per game, a hold/release plunger, independently responsive flippers, pop bumpers, slingshots, and a center drain. A short first-launch ball saver is explicit and limited.
- Hit three letter targets to complete ORB, raise a scoring multiplier, and earn a completion bonus. Recent different-target hits build a timed combo. Target rules are visible on an instruction plate, not hidden behind unexplained blinking lights.
- Original local 2D physics with fixed substeps, circle/segment collisions, capped energy, and moving flipper collision velocity. A held flipper supports a ball but does not inject an endless impulse every frame.
- No multiball or tilt system in the initial table; reliable flippers and recoverable launches receive the effort. Weak launches can be retried from the shooter lane without consuming a ball.
- Keyboard (A/D or arrows; Space/Enter to launch) and multi-touch controls. Start, pause, restart, three-ball results, opt-in synthesized audio, local best, and reduced-motion handling. No runtime network assets.

## Verification targets

Plunger strength, weak-shot recovery, collision normals and energy, flipper impulse versus held state, single score per contact, target completion/multiplier cap, combo expiry, saver lifecycle, exactly three consumed balls, no movement while paused, restart reset, and prolonged finite-state simulation without NaNs or escape.

### UI quality reference and typography revision

On 6 October 2026, the parent task inspected actual Wonder Shelf-hosted gameplay and documented it in `../WONDER-SHELF-REFERENCE.md`. The transferable principles were a dominant playable arena, readable integrated game state, tactile controls, and immediate cause/effect feedback. This pass uses those principles only; it does not copy reference designs, artwork, characters, assets, or game mechanics. This implementer did not independently view those later gameplay sessions.

Self-hosted lettering was sourced from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) and its [Google Fonts CSS service](https://fonts.googleapis.com/). The bundled font files are local WOFF2 subsets and include the corresponding SIL Open Font License notices. They add no external runtime requests.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://store.steampowered.com/app/908221/Pinball_Arcade_Gottlieb_Pack_2/
- Gameplay screen inspected visually through the browser: https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/908221/ss_cf6c0dd2eb27e9c0b8866c7898af023b0192f154.1920x1080.jpg?t=1532984102
- Observed composition: The publisher gameplay image gives the physical table nearly all the view, with score and ball count in a corner. Table labels carry goals instead of a long adjacent explanation.
- Original application: Use a tall navy/vermillion orbital playfield, silver rails and pale bumpers. Move scoring into a compact side mast on desktop and a thin top strip on phones. Replace the large instructional sidebar with target lights and brief control labels.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
