> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Beat Bounce

An original rhythm-console game with three original synthesized tracks, audio-clock note judging, calibration, pause, grades and local best scores. No dependencies or audio downloads.

Run from the repository: `npm --prefix beat-bounce start` (http://127.0.0.1:4180). Or run the root `npm start` and visit `/beat-bounce/`. Set `PORT=4182` to run alongside the collection.

Space or tap the pad when notes reach the red timing line. Do not tap rests. Escape pauses; hiding the tab pauses automatically. Sound begins only after Play. Use the timing panel to calibrate devices. All essential gameplay remains visible with sound off. Storage denial does not prevent play. A canvas rhythm game requires visual or audio timing and is not a screen-reader-only experience.

`npm --prefix beat-bounce test` checks charts, timing boundaries, duplicate judgements, anti-mashing, completion and calibration. `research.md` records primary sources and original design choices. HTML/CSS/client JS can be hosted statically.


## Playing-screen refinement

A dark olive rhythm rail carries grooved record notes into a golden timing gate. Compact score and combo readouts, a physical-looking hit pad, track selectors and a four-beat light indicator frame the gameplay. Notes use the same audio clock as scoring; visual changes do not change judging windows or calibration.

Bricolage Grotesque and DM Sans are self-hosted in `fonts/`; their OFL licenses ship alongside them, so each game remains independently deployable.

Focused verification on 2026-10-06: 5 game-rule tests passed. Changed client JavaScript passed syntax checks. The parent reviewer verified the refreshed desktop and 390px phone layouts and gameplay controls.


## Reference-grounded UI redesign — 6 October 2026

A light coral and ink rhythm stage replaces the record console. One red timing gate, traveling note discs and beat markers dominate, with compact score/combo feedback and a bottom track strip. Calibration visuals now use their actual 96 BPM clock, while all judging windows remain unchanged.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 5 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** 390 × 844 Chrome verification: all controls and track choices fit; a real tap earned Perfect / 100 points, and Pause/Resume worked. No new phone repair was needed.

## Control placement refinement — 6 October 2026

On wide screens, track selection and calibration form a right-hand setup station. The tap pad remains directly below the timing gate, with elapsed time and tempo alongside it. Phones retain the compact track strip and expandable calibration panel.

This HTML/CSS-only pass was checked in Chrome at 1280 × 800, 1440 × 800 and 390 × 844, including expanded calibration, track selection, a complete run, replay and Pause/Resume. HTML IDs remain unique. Engine tests were not rerun because no JavaScript or rules changed. The collection screenshot is a fresh capture of actual play.


## Viewport containment — 6 October 2026

The page uses a 100dvh flex shell and a remaining-height rhythm stage. Wide screens retain the track station; short landscape moves setup beside the runway. Calibration opens as a bounded panel and closes when a run or timing exercise begins, leaving the hit pad accessible.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.

The final 12-state Beat matrix matched document and viewport dimensions exactly. A complete 30-second run, results and replay passed in the browser.
