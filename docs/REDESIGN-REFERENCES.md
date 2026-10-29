# Full game UI redesign — 6 October 2026

User direction: redesign all games; use concrete online game interfaces; give each game a different polished visual world. Show real gameplay, not decorative cover illustrations. Reference sites supply composition and interaction evidence only; their artwork, code and branding are not imported.

## Directly inspected screens

- [Ricochet Orchard](https://ricochet-orchard-play.web.app/): opened its title screen and started play. The arena fills the viewport; start, pause, scores and short instructions belong to the game. Applied to the standalone games and the seven original arcade screens.
- [DEADSHOT.io](https://deadshot.io/): inspected the live loaded lobby. A visible game world/character, a dominant Play action, secondary room controls, and peripheral options informed DRIFT's lobby hierarchy. DRIFT instead uses its own live arena, left match controls, right character loadout, and a horizontal five-map selector. Ad, login and commerce panels were not carried across.
- [Poki arcade catalogue](https://poki.com/en/arcade): inspected the rendered catalogue. Immediate visual discovery and short category selection informed the homepage. The implementation uses original typography and a restrained dark library layout; every cover is a capture of our actual game, not Poki's illustrations.
- [Poki quality requirements](https://developers.poki.com/guide/requirements-quality) and [easy access](https://developers.poki.com/guide/easy-access): supporting guidance for immediate play and responsive controls, not visual references.

## Genre-specific screenshot research

Research and implementation agents inspected these real screens in addition to the parent review. Exact source/transfer details are recorded in each game's research notes.

| Reference | Transferred interface principle | Games |
|---|---|---|
| [Papa's Burgeria official screenshot](https://i.flipline.com/gamefiles/papasburgeria/images/screenshot_03.jpg) | Central assembly, visible tickets, adjacent ingredient bank, service dock | Kitchen Rush |
| [Kingdom Rush official battle](https://files.ironhidegames.com/ironhidegames-www-upfiles/original/Games/0x1000/d204eabe-c764-48b3-b529-9cef8be16150.jpg) | Battlefield first, currency/wave at edges, contextual command deck | Tiny Tower Defense |
| [Squaredle](https://squaredle.app/) | Large letter tiles, clear found count, immediate word feedback | Word Weave |
| [Twofold official gameplay](https://twofoldinc.com/images/screenshot_0.png) | Board, score and piece tray form one compact game surface | Block Bloom |
| [Atari Asteroids screenshot](https://atari.com/cdn/shop/files/asteroids-recharged-screenshots-02.jpg?v=1657169070) | Arena-wide playfield, corner status, unobtrusive action information | Asteroid Run |
| [Atari Breakout screenshot](https://atari.com/cdn/shop/files/6.png?v=1657179437) | Court-dominant composition and short score hierarchy | Breakpoint |
| [Rhythm Doctor official Steam screenshot](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/774181/ss_0ad870eb7a1cc4315b17c2aaa2e54c0b5f220684.1920x1080.jpg?t=1769200761) | Timing line as the primary surface, feedback located at the hit zone | Beat Bounce |
| [Black Hole official Steam screenshot](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/908221/ss_cf6c0dd2eb27e9c0b8866c7898af023b0192f154.1920x1080.jpg?t=1532984102) | Full-height table, marginal score, goals on the table | Pocket Pinball |
| [Skribbl published game screen](https://img.api.video/scribbel_ef69a32aa9.webp) | Round bar, central drawing area and slim roster/guess columns | Doodle Dash |

Alexandria tools are not exposed in this session. Web search and direct browser inspection supplied the available research. The source notes distinguish live interactions from published screenshots; screenshot research is not a claim of full gameplay verification.

## Design critique applied

The previous interfaces had too much framing around small playfields, oversized control decks, repeated introductory copy, and several competing actions before play. The old root catalogue also hid seven games behind a second catalogue. These were the main hierarchy and discovery problems.

The redesign makes the board/arena the primary surface, gives each game its own composition and palette, moves instructions into concise contextual hints, keeps retries close, and presents all nineteen games on the root shelf. Keyboard focus, pointer/touch controls, pause/restart, saved scores and reduced-motion preferences remain part of verification.

## DRIFT

The 3D renderer and game rules are unchanged. Its lobby, loadout, map selector, menus and combat HUD are re-composed in ink blue and warm gold. Controls retain their existing IDs and event bindings. Joining a Sky Garden match, leaving to the lobby, changing the arena and opening settings were checked in the running browser. Pointer-lock movement cannot be fully exercised in a hidden automation tab.
