# Standalone games — research index

Research conducted 6 October 2026. Official game pages and developer documentation informed mechanics before implementation. A follow-up browser inspection of actual Wonder Shelf games informed the arcade presentation revision; the earlier pass had only examined its catalogue and guides. References are not copied assets or claims that the new concepts are proven commercially.

| Game | Evidence and original decisions |
|---|---|
| Breakpoint | [Research](brick-breaker/research.md) |
| Asteroid Run | [Research](asteroid-run/research.md) |
| Lane Rush | [Research](lane-rush/research.md) |
| Pocket Putt | [Research](pocket-putt/research.md) |
| Pocket Pinball | [Research](pocket-pinball/research.md) |
| Kitchen Rush | [Research](kitchen-rush/research.md) |
| Claw & Catch | [Research](claw-catch/research.md) |
| Beat Bounce | [Research](beat-bounce/research.md) |
| Word Weave | [Research](word-weave/research.md) |
| Tiny Tower Defense | [Research](tiny-tower-defense/research.md) |
| Doodle Dash | [Research](doodle-dash/research.md) |

## Alexandria check

The user explicitly requested Alexandria. Firecrawl's combined web/provider search returned no matching providers. Two Alexandria `firecrawl_find_tools` calls also returned zero matches: semantic discovery for game metadata/reviews/screenshots/mechanics, followed by domain discovery for Steam, Poki, CrazyGames and itch.io. No structured game data was available from those searches. The implementation therefore uses the linked primary web sources, rather than claiming Alexandria supplied gameplay or popularity evidence.

## Scope

Eleven separate top-level game folders with independent HTML, CSS and gameplay code. Only development serving and verification tooling are shared. No shared game UI template. The latest three games use their actual playfields and HUDs as the visual centerpiece; homepage images are browser captures, with an optional real-engine Breakpoint demo. Existing `arcade/` and `drift/` remain intact. Ten games support static hosting; Doodle Dash's multiplayer requires its Node room server. No external libraries, copied music or remote runtime assets.

## Arcade follow-up

The additional Alexandria-only search for browser arcade mechanics, controls and screenshots returned no matching providers (`data.tools: []`). Primary publisher sources informed the three game-specific research files. These sources establish gameplay conventions, not market demand or measured retention for our games. The latest scope follows the user's explicit preference for more arcade gameplay and actual game UI.
