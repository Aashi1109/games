# Doodle Dash: research before implementation

Researched 6 October 2026. References establish interaction patterns, not growth statistics. All artwork and implementation are original.

## Observations and sources
- [skribbl.io official](https://skribbl.io/) explains alternating artist/guesser roles, private rooms, selecting a prompt, no spelling, and points over multiple rounds. Its published UI changes include undo, palette, mobile support, and host moderation. Browser inspection confirmed a direct name → room entry flow and playful illustration-led identity.
- [Gartic.io official](https://gartic.io/) offers nickname-based play and private rooms. Its visible UI makes joining versus room creation separate actions. The official [Gartic introduction](https://www.youtube.com/watch?v=hl8j6q77wk4) describes drawing/guessing and sharing rooms with friends.

## Original art direction and behavior
A lilac artist's desk with a large off-white sketchpad, perforated paper, colored pencil palette, sticky-note player roster and orange accents. A persistent compact timer/prompt strip reserves most space for art. Guesses sit beside the drawing on desktop and underneath on phones. User text is rendered as text, never HTML.

Private rooms for 2–8 players, room-code/link invitations, two rotations of the artists, choice of three prompts, configurable 45/60/90-second turns, faster-guess scoring, artist rewards, hints, reveal between turns, final leaderboard and rematch. Host can remove players. Late joins spectate the current turn and enter the next match. Disconnection and reconnect status are visible; a missing artist's turn is skipped. A clearly labeled solo sketch studio lets a visitor draw without pretending to have live opponents.

Server owns turns, words, guesses, scores and clocks; only the artist receives the hidden word. Ephemeral bearer room capabilities identify players. Bound input lengths, drawing payloads, room/player counts and rate limits prevent trivial abuse. Rooms expire in memory; server restart loses them. Real multi-browser play requires the same running Node server, not static hosting. Local launch defaults to loopback; remote hosting is a separate deployment step.

## Verification targets
Two-player create/join/start/draw/guess/reveal/rotation/final/rematch; hidden word absent from guesser state; host-only operations; invalid IDs/payloads rejected; drawing synchronization, undo/clear; reconnect/disconnect handling; mobile layout and pointer drawing.


## Visual refinement — 2026-10-06

The parent reviewer inspected Wonder Shelf as a quality reference and reported viewport-filling gameplay, detailed interactive pieces, integrated themed HUDs, tactile controls and meaningful feedback. Those are attributed reviewer observations, not a claim that this implementation author played those reference games. No reference assets, compositions or game code were copied.

**An original drawing workbench.** The paper, pencil palette, brush controls, room scorecard and guessing desk form a compact studio. Large cover art was removed. Initials identify players; selected pencils, visible tool state and tactile eraser/undo/clear controls make drawing actions clear. Phone layouts keep drawing first and preserve access to room controls. Private-room API, authorization and scoring logic are unchanged.

Typography is bundled locally with the game, including the applicable OFL license files. Reduced-motion preferences suppress optional feedback motion; movement required to read gameplay remains. No runtime font or asset network requests are required.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://skribbl.io/
- Gameplay screen inspected visually through the browser: https://img.api.video/scribbel_ef69a32aa9.webp
- Observed composition: The live landing page/tutorial and a published actual match screenshot were inspected. The match has one compact round/prompt strip, a central white drawing canvas, a narrow player roster and an attached guess feed. Creating a reference room was rejected by automatic approval review; no room was created.
- Original application: Rebuild as a graphite/yellow drawing workspace. Eliminate the invitation hero and decorative notebook framing. Keep the canvas dominant, tools docked to it and the guess feed narrow; preserve private-room behavior.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
