'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';
import './viewport.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="masthead">
        <a className="back-link" href="/">
          ← All games
        </a>
        <a className="club-brand" href="./">
          <span className="club-mark" aria-hidden="true">
            ⚑
          </span>
          <h1>POCKET PUTT</h1>
        </a>
        <span className="edition">THE CLOVER CLUB</span>
      </header>
      <main>
        <section className="course-area" aria-label="Miniature golf course">
          <div className="course-heading">
            <div className="hole-index" id="hole-index">
              01
            </div>
            <div>
              <span className="eyebrow" id="hole-meta">
                HOLE ONE · PAR 2
              </span>
              <h2 id="hole-name">Clover Walk</h2>
            </div>
            <div className="course-actions">
              <button id="pause" className="quiet-button" disabled>
                Pause
              </button>
              <button id="restart" className="quiet-button" disabled>
                Restart
              </button>
            </div>
          </div>
          <div className="canvas-wrap">
            <canvas
              id="course"
              width="900"
              height="600"
              tabIndex={0}
              aria-label="Golf course. Arrow keys adjust aim and power; Space putts. You can also drag backward from the ball or use the aim and power controls."
            ></canvas>
            <div className="setup" id="setup">
              <div>
                <span className="eyebrow">SIX HOLES · NO TIME LIMIT</span>
                <h2>A little round?</h2>
              </div>
              <label htmlFor="players">Players</label>
              <select id="players">
                <option value="1">Solo round</option>
                <option value="2">Two players · pass & play</option>
              </select>
              <button className="primary-button" id="start">
                Start round <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="pause-message" id="pause-message" hidden>
              <span className="eyebrow">ROUND PAUSED</span>
              <h2>The green can wait.</h2>
              <button className="primary-button" id="resume">
                Back to the ball →
              </button>
            </div>
          </div>
          <div
            id="round-message"
            className="round-message"
            aria-live="polite"
            hidden
          >
            <div>
              <span className="eyebrow" id="message-kicker">
                NICELY PLAYED
              </span>
              <h3 id="message-title"></h3>
              <p id="message-detail"></p>
            </div>
            <button className="primary-button" id="continue">
              Next hole <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
        <aside
          className="shot-station"
          aria-label="Shot controls and round scores"
        >
          <div className="turn-line">
            <span className="player-dot" id="player-dot"></span>
            <strong id="turn-label">Your ball is waiting.</strong>
            <span id="stroke-label">Six holes. No time limit.</span>
          </div>
          <div className="shot-controls" id="shot-controls" inert>
            <label className="angle-control">
              Aim <span id="angle-value">−18°</span>
              <input
                id="angle"
                type="range"
                min="-180"
                max="180"
                defaultValue="-18"
                step="1"
                aria-label="Shot angle"
              />
            </label>
            <label className="power-control">
              Power <span id="power-value">55%</span>
              <input
                id="power"
                type="range"
                min="5"
                max="100"
                defaultValue="55"
                aria-label="Shot power"
              />
            </label>
            <button id="putt" className="primary-button">
              Putt <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="course-tip" id="course-tip">
            Pull back from the ball. The farther you pull, the stronger the
            putt.
          </p>
          <details className="score-drawer">
            <summary>
              <span>Round scorecard</span>
              <span>
                6 HOLES · PAR 19 <b>＋</b>
              </span>
            </summary>
            <aside className="scorecard">
              <div className="scorecard-top">
                <svg viewBox="0 0 54 35" aria-hidden="true">
                  <path
                    d="M6 30h43M15 30V7m0 0 25 7-25 7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <circle cx="13" cy="30" r="3" fill="currentColor"></circle>
                  </path>
                </svg>
                <h2>Scorecard</h2>
                <span className="rule-note">The fewest strokes wins.</span>
              </div>
              <table aria-label="Round scorecard">
                <thead>
                  <tr>
                    <th>HOLE</th>
                    <th>PAR</th>
                    <th className="p1-col">YOU</th>
                    <th className="p2-col" hidden>
                      P2
                    </th>
                  </tr>
                </thead>
                <tbody id="score-rows"></tbody>
                <tfoot>
                  <tr>
                    <th>TOTAL</th>
                    <td>19</td>
                    <td id="p1-total">—</td>
                    <td id="p2-total" className="p2-col" hidden>
                      —
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="best-line">
                <span>CLUBHOUSE BEST</span>
                <strong id="best">—</strong>
                <small>STROKES · ON THIS DEVICE</small>
              </div>

              <div className="scorecard-note">
                <p>
                  Sand softens your shot.
                  <br /> Water adds a stroke.
                  <br /> Eight putts? Pick up for nine.
                </p>
              </div>
            </aside>
          </details>
        </aside>
        <footer>
          <span>← → Aim · ↑ ↓ Power · Space Putt · P Pause</span>
          <span>Drag back from the ball to shoot.</span>
        </footer>
      </main>
    </GameRuntime>
  );
}
