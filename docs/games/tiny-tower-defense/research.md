# Tiny Tower Defense — research before implementation

Research completed 6 October 2026. Sources were read live before implementation. All illustrations, map geometry, units, copy, and balance are original.

## Primary sources and observed behavior

1. **Ironhide Game Studio, official Kingdom Rush page** (released 2011; accessed 2026-10-06 via Firecrawl): https://www.ironhidegames.com/Games/kingdom-rush
   - Describes defensive strategy through tower upgrades and specializations, different enemy abilities, and a humorous illustrated fantasy setting. Official game screenshots are supplied on the page.
   - Takeaway: the strategic choices should remain visible and distinct, with personality integrated into the game world. No screenshot assets are reused.
2. **Ninja Kiwi's original Bloons Tower Defense listing on Kongregate** (developer-listed controls, released 19 August 2007; accessed 2026-10-06): https://www.kongregate.com/en/games/ninjakiwi/bloons-tower-defense
   - The developer's description asks players to stop enemies escaping through building and upgrading towers. The controls select a tower type before placement and use Escape to cancel. Selling returns 80% in that reference game.
   - Published interface instructions locate tower types beside the map. The listed tower attacks include darts, tacks, bombs, and ice, demonstrating readable damage/control differences.
   - Observation limitation: reference mechanics were read from the developer's published description, controls, and official product page; this is not a claim of a manual 50-round reference playthrough.

## Original design decisions

- A bright hand-illustrated garden under siege: mint sky, mossy terrain, a sandy winding trail, vegetable guardians, expressive bugs, seed packets, and a wooden garden sign. Use a large playable map, not a repeated dashboard layout.
- One original fixed path and named build plots keep placement legible on touchscreens and fully usable through native keyboard-focusable controls.
- Three defenders: quick single-target Peashooter, slow splash-damage Acorn Mortar, and control-focused Dew Sprinkler. Each has two paid upgrades. Enemies include ordinary ants, quick bugs, armored beetles, and a final snail.
- Explicit economy: starting sunlight, posted build/upgrade costs, kill bounty, wave-clear reward, and a disclosed 70% sell refund. A range preview appears before spending, including on touch.
- Seven increasingly difficult waves, manual wave launch, optional double speed, pause, restart, clear victory and defeat, and safe local best score.
- All art is drawn locally with Canvas/SVG/CSS; no runtime libraries, fonts, images, audio downloads, account, or payment.

## Verification priorities

Distance-based path traversal across corners and large time steps, spawn scheduling, target selection, projectile damage, splash and slowing, no duplicate rewards, build restrictions, insufficient funds, upgrade limits, sell refunds, pause/terminal state protection, complete win/loss simulations, touch/keyboard controls, and readable 360px layout.

## UI refinement, 6 October 2026

The parent agent inspected Wonder Shelf gameplay and recorded its observations in the root reference note. We used only the general quality principles: prioritize actual play, finish interactive materials, integrate controls with the game world, and show meaningful feedback. No reference assets, designs, characters or code were copied. The original garden materials, defender firing and planting feedback, compact HUD and potting bench retain this game's established identity and rules. Local Bricolage Grotesque and DM Sans fonts are distributed with the included SIL Open Font Licenses.

Font sources: [Google Fonts / Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque) and [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans), copied from the licensed local project resources.

## Full game-interface redesign — 6 October 2026

Concrete online interface reference: [Kingdom Rush](https://files.ironhidegames.com/ironhidegames-www-upfiles/original/Games/0x1000/d204eabe-c764-48b3-b529-9cef8be16150.jpg).

**Observed:** Official Ironhide screenshot inspected in Chrome: battlefield fills the frame, compact life/currency/wave counters sit at top-left, pause at top-right, selection/action context runs along the bottom. The primary https://www.ironhidegames.com/Games/kingdom-rush describes distinct tower specializations.

**Original implementation decisions:** Enlarge the arena; dock resources at the top edge and seed/selected-plot decisions in an attached control cabinet, reflowing below on phones. Rich grass, warm timber control surfaces and clear range rings retain the original garden theme. Preserve seven waves, three defenders, prices and path geometry.

This research preceded this redesign. Screens were inspected visually, not claimed as full reference playthroughs. No reference assets or layouts are reproduced; all existing game artwork is local code. This supersedes the earlier website/editorial composition.

### Viewport constraint refinement — 2026-10-06

The canvas and plot buttons scale together inside a viewport-sized map area. Seed selection and plot actions sit alongside the map on desktop and short landscape, and below it on phones. Edge plot touch targets remain inside the map; the field guide keeps the best score available on compact layouts. This is a local usability refinement using the previously documented visual references, not a new reference observation. No game rules or physics changed.
