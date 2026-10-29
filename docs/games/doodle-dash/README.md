> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Doodle Dash

Private drawing-and-guessing rooms for 2–8 players, two rotations, three prompt choices, timed guessing, hints, artist rewards, leaderboard, rematch, host removal, reconnect and a solo sketch studio. Each player needs their own browser session/tab and the same running server.

Run `npm --prefix doodle-dash start` → http://127.0.0.1:4180, or root `npm start` → http://127.0.0.1:4180/doodle-dash/. No packages to install. `PORT=4182` changes the port. Default host is loopback. For devices on a trusted local network, explicitly run with `HOST=0.0.0.0` and share the computer's LAN address instead of 127.0.0.1. Internet play requires deploying the Node server with HTTPS and sharing that hosted address; it is not publicly deployed by this task.

Rooms and drawings are held in server memory and expire after 30 minutes of inactivity; restarting the server removes them. Returning in the same tab restores the ephemeral room identity from sessionStorage. Disconnected artists are skipped after 20 seconds. Players who join during a match spectate and join the next match. Host removal is not a durable identity ban.

The server validates actions, bounds request/drawing sizes and room/player counts, rate-limits traffic, keeps secret words out of guesser responses, checks artist/host authority, rejects cross-origin room requests, and scores guesses itself. No accounts, uploads, third-party services, or runtime dependencies. Solo sketching works on static hosting; multiplayer requires Node.

Pointer/touch draws. Arrow keys move a drawing cursor; Shift + arrow draws. Brush size, palette, eraser, undo and clear are visible controls. User names/guesses always render as text. Canvas drawing remains a visual activity.

`npm --prefix doodle-dash test` exercises room state, authorization, full game lifecycle, prompt secrecy, validation and disconnection. See `research.md` for sources and design decisions.


## Playing-screen refinement

The paper, pencil palette, brush controls, room scorecard and guessing desk form a compact studio. Large cover art was removed. Initials identify players; selected pencils, visible tool state and tactile eraser/undo/clear controls make drawing actions clear. Phone layouts keep drawing first and preserve access to room controls. Private-room API, authorization and scoring logic are unchanged.

Bricolage Grotesque and DM Sans are self-hosted in `fonts/`; their OFL licenses ship alongside them, so each game remains independently deployable.

Focused verification on 2026-10-06: 9 game-rule tests passed. Changed client JavaScript passed syntax checks. The parent reviewer verified the refreshed 1280px desktop and 320px phone layouts, including an actual drawing drag.


## Reference-grounded UI redesign — 6 October 2026

Graphite and yellow room chrome replaces the lilac notebook. A central white canvas leads the room, with compact prompt, narrow roster/guess columns and a vertical desktop tool rail. Phone tools dock below the drawing; private-room state, authorization, scoring and server code are unchanged.

Concrete online gameplay screens and the composition decisions they informed are recorded in `research.md`. This supersedes the earlier visual directions above; no reference artwork or assets were copied. 9 focused tests passed after this redesign, and all affected JavaScript passed `node --check`. Fresh desktop/mobile visual checks are coordinated by the parent task.

**Fresh phone verification:** 390 × 844 Chrome verification: actual pointer strokes, palette selection and Undo worked in solo mode. A local test room was created, reloaded through session recovery, visually checked, then left. The phone roster was adjusted so names and host controls occupy separate rows. Multiplayer capacity remains eight, confirmed by the server and its existing test. This pass did not repeat a full two-player match.


## Viewport containment — 6 October 2026

The drawing studio is a 100dvh workspace with a remaining-height canvas. Only guess history scrolls. Small or short screens use 44px tools and a color disclosure; the player/settings disclosure fits a two-column eight-player roster. The canvas preserves its 900:620 proportions and pointer coordinates account for letterboxing. Entry/create/join forms compact for short landscape without removing solo mode.

Initial and active layouts were measured by the parent browser reviewer at 1280 × 720, 1440 × 900, 768 × 1024, 390 × 844, 320 × 568 and 844 × 390. The 72-state collection matrix checks document size, visible control/canvas bounds and internal layout overflow. No gameplay-engine rules changed.
Three focused tests verify drawing coordinates in wide, tall and collapsed surfaces; the changed JavaScript passed syntax checks.

The final 12-state Doodle matrix matched document and viewport dimensions exactly. Palette selection, real drawing, and a two-player create/join/word-choice/drawing/accepted-guess/leave flow passed in the browser.
