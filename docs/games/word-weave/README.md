> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Word Weave

A complete standalone letter-linking game styled as a botanical literary paper. No runtime packages, external assets, fonts, or network APIs.

From this folder, `npm start` runs `node ../scripts/serve.mjs .`. From the repository's shared server, visit `/word-weave/`. `npm test` runs the focused Node tests.

## Play

- Open the UTC daily edition for a three-minute round, or choose **Wander freely** for untimed practice.
- Tap neighboring letters, including diagonals, then **Gather**. Dragging a word and releasing also submits it.
- Keyboard: arrows navigate, Space adds/removes the focused letter, Enter submits, Backspace removes the last letter, Escape clears.
- Tiles cannot repeat within a word; each spelling scores once. The complete curated wordbook is visible below the game. This is deliberately not a full English dictionary.
- 3 letters score 1, 4 score 2, 5 score 5, then 2 more per extra letter. Eight words on a new board earn a pressed flower when the round ends.
- Pause freezes the clock and hides the letters. Finish reveals missed words; select one to study its path. Restart revisits the same board.

Local best and pressed flowers survive reload when browser storage is available. Corrupt or blocked storage falls back safely. The daily seed changes at UTC midnight when loading a new page. Research and original design decisions are in `research.md`.

The interface uses an original letterpress tray, selected-word feedback and compact literary layout. Newsreader is self-hosted from `fonts/`, with its SIL Open Font License included. There are no remote font requests at runtime.

## Full interface redesign — 6 October 2026

A violet word table replaces the newspaper framing. A square letter tray is the largest element, with points/time directly above and the current word directly beneath it. Found words, the finish/reveal action and flower collection sit beside the board on desktop and below on phones. Daily UTC timing, practice and the disclosed wordbook are unchanged.

Concrete online gameplay screenshots and primary game pages were inspected before the redesign; URLs, observations and original decisions are in `research.md`. Each stylesheet is a clean replacement. No remote reference assets were copied; artwork and licensed fonts remain local. All gameplay engines, scores and existing keyboard/touch controls are preserved.

Verification: all 32 engine tests across these five games passed, and each client app passed JavaScript syntax checking. Parent task performs the consolidated rendered desktop and phone checks.

## Viewport layout

The square letter board uses the remaining viewport height. Short landscape puts timer, selected word and Gather alongside it; smaller screens use bounded word/garden, guide and dictionary panels. Long dictionary and found/missed-word lists may scroll inside their reference panels; the playable board and controls do not. Verified at 1280×720, 1440×900, 768×1024, 390×844, 320×568 and 844×390 in initial, active and paused states.
