# Beat Bounce: research before implementation

Researched 6 October 2026. These are interface/mechanics references, not evidence of market growth. No reference artwork, code, or music is copied.

## Observations and sources
- [Rhythm Doctor, official](https://rhythmdr.com/) describes a one-button rhythm game with music central to its experience.
- [Developer's Rhythm Doctor page](https://fizzd.itch.io/rhythm-doctor) documents Space to play, Escape to pause, and levels that introduce rhythm concepts progressively. Implication: one clear input, count-in, readable feedback, pause, and graduated tracks.
- [Developer's A Dance of Fire and Ice page](https://fizzd.itch.io/a-dance-of-fire-and-ice) documents single-key control, offset adjustment, calibration, and a historical anti-mashing guard. Implication: score discrete notes once, penalize stray taps, offer offset calibration, and avoid timing from animation frames. Live page and presentation inspected in browser; gameplay was not exhaustively played.
- [MDN getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp) documents mapping audio output to the performance clock. Implication: schedule synthesized notes ahead on Web Audio's clock, judge against the output timeline, and retain a manual offset control for device/input latency.

## Original art direction and behavior
A vermilion and butter-yellow record sleeve: oversized condensed display type, dark vinyl disc, a horizontal note runway, and a physical-looking tap pad. This differs from the green golf landscape, diner countertop, notebook drawing game, and existing Little Break shell.

Three original synthesized tracks with increasing tempo/rhythm density; each is a complete short song. Incoming stepping stones cross a fixed hit line. Space or tap performs one action. Perfect/good/miss feedback, combo, accuracy, final grade and per-track best. Four-beat count-in; optional sound, clearly labeled visual play; calibration with eight taps; manual offset. Pause freezes audio and gameplay, tab hiding pauses, retry begins cleanly. No external audio dependencies.

## Verification targets
Boundary timing, one judgement per note, stray tap penalties, misses and final grade; start/pause/resume/retry; mobile hit pad and layout; audio scheduling cleanup; calibration persistence under denied storage.


## Visual refinement — 2026-10-06

The parent reviewer inspected Wonder Shelf as a quality reference and reported viewport-filling gameplay, detailed interactive pieces, integrated themed HUDs, tactile controls and meaningful feedback. Those are attributed reviewer observations, not a claim that this implementation author played those reference games. No reference assets, compositions or game code were copied.

**An original listening console.** A dark olive rhythm rail carries grooved record notes into a golden timing gate. Compact score and combo readouts, a physical-looking hit pad, track selectors and a four-beat light indicator frame the gameplay. Notes use the same audio clock as scoring; visual changes do not change judging windows or calibration.

Typography is bundled locally with the game, including the applicable OFL license files. Reduced-motion preferences suppress optional feedback motion; movement required to read gameplay remains. No runtime font or asset network requests are required.


## Full UI redesign: concrete screen references — 2026-10-06

- Game: https://rhythmdr.com/
- Gameplay screen inspected visually through the browser: https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/774181/ss_0ad870eb7a1cc4315b17c2aaa2e54c0b5f220684.1920x1080.jpg?t=1769200761
- Observed composition: The official Steam gameplay screenshot uses one dominant horizontal timing line, beat count near the action, and small progress meters at the top.
- Original application: Replace the ornamental record console with a light coral/ink rhythm stage. A large single timing gate and traveling note discs dominate. Track selection becomes one compact bottom strip; feedback stays near the gate.

These are layout references only. No screenshot, artwork, source code or brand asset was copied into the game. Existing mechanics, hitboxes, scoring, input and persistence remain the contract.
