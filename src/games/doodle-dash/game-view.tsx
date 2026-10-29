'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header>
        <a href="/">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 6-6 6 6 6M8 12h12"></path>
          </svg>
          <span>All games</span>
        </a>
        <h1>
          Doodle<span>Dash</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 16 10-10 3 3L8 19l-5 2 2-5ZM13 8l3 3M5 16l3 3"></path>
          </svg>
        </h1>
        <button id="leave" hidden>
          Leave studio
        </button>
        <span className="header-note">GOOD COMPANY. QUESTIONABLE ART.</span>
      </header>
      <main>
        <section id="entry" className="entry">
          <div className="invitation">
            <h2>
              Draw.
              <br />
              Guess. Repeat.
            </h2>
            <p>
              A private drawing game for 2–8 friends. Sketch the word. Guess it
              first.
            </p>
            <ol>
              <li>
                <b>1</b>
                <span>
                  <strong>Make room for your people</strong>Share a private
                  invite. Everyone plays here.
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  <strong>Pick a word. Make your mark.</strong>Everyone gets a
                  turn with the pencil.
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  <strong>Guess it before the bell</strong>Quick answers earn
                  the most points.
                </span>
              </li>
            </ol>
            <div className="studio-note">Stick figures absolutely count.</div>
          </div>
          <div className="entry-form">
            <div className="tabs">
              <button id="create-tab" aria-pressed="true">
                Make a room
              </button>
              <button id="join-tab" aria-pressed="false">
                Join friends
              </button>
            </div>
            <form id="room-form">
              <label htmlFor="name">Your nickname</label>
              <input
                id="name"
                name="name"
                maxLength={20}
                required
                placeholder="Your nickname"
                autoComplete="nickname"
              />
              <div id="code-field" hidden>
                <label htmlFor="code">Six-character room code</label>
                <input
                  id="code"
                  maxLength={6}
                  placeholder="ABC123"
                  autoComplete="off"
                  pattern="[A-Fa-f0-9]{6}"
                />
              </div>
              <button className="primary" id="enter" type="submit">
                Create room
              </button>
            </form>
            <p className="fine">Private rooms. No account needed.</p>
            <div className="or">
              <span>JUST HERE TO DRAW?</span>
            </div>
            <button id="practice">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 16 10-10 3 3L8 19l-5 2 2-5ZM13 8l3 3M5 16l3 3"></path>
              </svg>
              <span>Solo sketch studio</span>
            </button>
          </div>
        </section>
        <p id="notice" role="status" className="notice"></p>
        <section id="workspace" hidden aria-label="Drawing studio">
          <div className="room-bar">
            <div>
              <span className="tiny" id="mode-label">
                PRIVATE STUDIO
              </span>
              <button id="invite">
                Room <b id="room-code">—</b>
                <span>Copy invite</span>
              </button>
            </div>
            <div className="round-info">
              <span id="round">Waiting for friends</span>
              <strong id="timer">—</strong>
            </div>
          </div>
          <div className="studio-grid">
            <aside className="roster">
              <h2>
                <button
                  id="roster-toggle"
                  aria-expanded="false"
                  aria-controls="roster-content"
                >
                  Players <span id="player-count">1/8</span>
                  <span className="disclosure-mark" aria-hidden="true">
                    +
                  </span>
                </button>
              </h2>
              <div id="roster-content">
                <div id="players"></div>
                <p className="roster-note">
                  50 points for helping each friend guess. Up to 200 for a
                  speedy answer.
                </p>
                <label id="duration-label">
                  Time per drawing
                  <select id="duration" defaultValue="60">
                    <option value="45">45 seconds</option>
                    <option value="60">60 seconds</option>
                    <option value="90">90 seconds</option>
                  </select>
                </label>
                <button id="start" className="primary">
                  Start the party
                </button>
              </div>
            </aside>
            <div className="paper-column">
              <div className="prompt-strip">
                <span id="prompt-label">THE CANVAS IS YOURS</span>
                <b id="prompt">Make something wonderfully weird.</b>
              </div>
              <div className="paper">
                <canvas
                  id="drawing"
                  width="900"
                  height="620"
                  tabIndex={0}
                  aria-label="Drawing canvas. Drag to sketch; in solo studio arrow keys move the cursor and holding Shift draws."
                ></canvas>
                <div id="paper-overlay">
                  <h2 id="paper-title">Pull up a chair.</h2>
                  <p id="paper-copy">
                    Your friends will appear here when they join.
                  </p>
                  <div id="choices"></div>
                </div>
              </div>
              <div className="toolbar" id="toolbar">
                <button
                  id="palette-toggle"
                  aria-label="Choose pencil color: Ink"
                  aria-expanded="false"
                  aria-controls="palette"
                >
                  <i aria-hidden="true"></i>
                  <span>Color</span>
                </button>
                <div id="palette" aria-label="Pencil colors"></div>
                <label className="brush-label">
                  Brush
                  <select id="brush" defaultValue="7">
                    <option value="3">Fine</option>
                    <option value="7">Medium</option>
                    <option value="14">Bold</option>
                    <option value="26">Wide</option>
                  </select>
                </label>
                <button id="erase" aria-pressed="false">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 13 9-9 7 7-9 9H8l-4-4v-3ZM8 9l7 7M11 20h10"></path>
                  </svg>
                  <span>Eraser</span>
                </button>
                <button id="undo">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12"
                      transform="translate(0 -2)"
                    ></path>
                  </svg>
                  <span>Undo</span>
                </button>
                <button id="clear">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"></path>
                  </svg>
                  <span>Clear</span>
                </button>
              </div>
              <div id="tool-state" className="tool-state" role="status">
                Medium ink pencil
              </div>
              <p className="paper-foot" id="paper-foot">
                Pencils ready. No letters, numbers, or spelling the answer!
              </p>
            </div>
            <aside className="guesses">
              <h2>Guesses</h2>
              <div
                id="messages"
                role="log"
                aria-label="Guesses and game updates"
              ></div>
              <form id="guess-form">
                <label className="sr" htmlFor="guess">
                  Your guess
                </label>
                <input
                  id="guess"
                  maxLength={60}
                  placeholder="Type your guess…"
                  autoComplete="off"
                />
                <button aria-label="Send guess" type="submit">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m5 4 16 8-16 8 3-8-3-8ZM8 12h13"></path>
                  </svg>
                </button>
              </form>
            </aside>
          </div>
        </section>
        <footer>
          <span>BAD DRAWINGS MAKE GOOD MEMORIES.</span>
          <span>MADE FOR FRIENDS, NOT MASTERPIECES.</span>
        </footer>
      </main>
    </GameRuntime>
  );
}
