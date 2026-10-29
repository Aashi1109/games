# Claw & Catch — reference research

Checked 6 October 2026, before implementation. Research uses primary game distributor descriptions. Documented behaviors below were read live; embedded playthroughs were not claimed.

## Observed reference patterns

- [Tiny Fishing, Poki / BuyHTML5](https://poki.com/en/g/tiny-fishing): a repeating cast, catch, sell and upgrade loop makes each short excursion meaningful. Species and rarity give collection a purpose. The page lists an April 2022 update. Its automated catching and offline income are intentionally outside this smaller skill-game scope.
- [Ice Fishing, CrazyGames / Oleg Sandalov](https://www.crazygames.com/game/ice-fishing): a bite cue prompts a timely strike; reeling requires watching line tension. Too much pull can break the line, while too little lets the fish escape. Species, bait and location provide variation. The web release is September 2023.
- [Fishing.io, CrazyGames / Inlogic Software](https://www.crazygames.com/game/fishing-io): the distributor documents holding the mouse to control a hook and portrait support. This supports a single large hold/release interaction as a practical touch control, not an audience-size claim.

## Original design decisions

An illustrated cat fishes a quiet pond in a Japanese-inspired field journal. A session has eight casts. Each cast has an explicit timing phase followed by a hold-to-reel phase: release during fish surges to cool tension, but long slack lets the fish escape. Catches collect in an unbanked basket. Banking secures score and records new species; choosing another cast builds a reward multiplier while risking the unbanked basket if the next fish escapes. Banked progress is never lost. The last successful cast banks automatically so the final catch cannot be stranded.

The original visual direction uses warm washi paper, ink typography, vermilion stamps, fine journal rules, a painted green pond, custom swimming fish and hand-drawn shore details. It shares no dashboard or game chrome with Kitchen Rush. One action button / Space controls cast timing and reel hold, a labeled button banks the basket, and P pauses; normal button keyboard activation remains usable. Every cue has text as well as color. Collection and personal best are local and schema-validated. No external assets or live APIs are needed to play.

## Success checks

Catch skill has both successful and losing strategies; cast quality affects rarity and rewards; failed catches clear only unbanked fish; bank commits collection once; eight casts end the session; terminal/paused state rejects gameplay; held reel resets on pause/blur; restart clears session while preserving journal; reduced decorative motion and touch are supported.

The project-wide [research record](../RESEARCH.md#alexandria-check) documents the requested Alexandria discovery attempts and their lack of matching providers. This game relies on the primary pages above, not unavailable structured provider data.

### UI quality reference and typography revision

On 6 October 2026, the parent task inspected actual Wonder Shelf-hosted gameplay and documented it in `../WONDER-SHELF-REFERENCE.md`. The transferable principles were a dominant playable arena, readable integrated game state, tactile controls, and immediate cause/effect feedback. This pass uses those principles only; it does not copy reference designs, artwork, characters, assets, or game mechanics. This implementer did not independently view those later gameplay sessions.

Self-hosted lettering was sourced from the official [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl) and its [Google Fonts CSS service](https://fonts.googleapis.com/). The bundled font files are local WOFF2 subsets and include the corresponding SIL Open Font License notices. They add no external runtime requests.

## Full game-interface redesign — 6 October 2026

Concrete online interface reference: [WEBFISHING and Ice Fishing](https://culturalgutter.com/wp-content/uploads/2024/12/webfishing-12.jpg?w=1024).

**Observed:** Actual WEBFISHING reeling screenshot inspected in Chrome; this is a secondary screenshot, not an official source: a large meter is beside the fishing action with the reel prompt immediately adjacent. Primary playable listing https://www.crazygames.com/game/ice-fishing explains the tension bar and red threshold.

**Original implementation decisions:** A blue-hour pond with the fishing action dominant, compact trip counters above, meters and a large hold/release button attached to the water. Move the collection to a compact catch log below. Preserve eight casts, banking risk, tension and safe stored progress.

This research preceded this redesign. Screens were inspected visually, not claimed as full reference playthroughs. No reference assets or layouts are reproduced; all existing game artwork is local code. This supersedes the earlier website/editorial composition.


### Desktop decision flow — 6 October 2026

On wide screens, the blue-hour pond sits beside a fishing station: phase, timing/tension meters, Cast/Reel/Bank, and immediate feedback stay together. Start, pause, and results replace this same control area. The catch log, basket, and personal best remain visible below it. Phones retain the pond overlay, thumb controls below the water, and expandable catch log. This is a responsive composition change prompted by user review, not a new reference theme. Existing controls are moved as single DOM nodes at the desktop breakpoint; game engines, canvas dimensions, and interaction rules are unchanged.

### Viewport constraint refinement — 2026-10-06

The pond and tackle station share a viewport-sized shell. Start, timing, reel, bank and results stay in the same action station. The six-species catch log docks only when vertical space allows; its compact panel shows the full collection and basket without scrolling. This is a local usability refinement using the previously documented visual references, not a new reference observation. No game rules or physics changed.
