'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <main className="machine">
        <header className="masthead">
          <a className="shelf-link" href="/" aria-label="Back to Game Shelf">
            ↙ GAME SHELF
          </a>
          <h1>
            ASTEROID <span>RUN</span>
            <i aria-hidden="true">{'//'}</i>
          </h1>
          <span className="edition">
            DEEP SPACE OPERATIONS <b>INTERCEPTOR / 07</b>
          </span>
        </header>

        <section className="console" aria-label="Asteroid Run game">
          <div className="hud" aria-label="Run statistics">
            <div className="hud-score">
              <span>SCORE</span>
              <strong id="score">00000</strong>
            </div>
            <div className="sector-instrument">
              <span>SECTOR</span>
              <strong id="sector">
                01 <small>/ 04</small>
              </strong>
              <div className="route" aria-hidden="true">
                <i className="route-step is-current"></i>
                <i className="route-step"></i>
                <i className="route-step"></i>
                <i className="route-step"></i>
              </div>
            </div>
            <div>
              <span>HULL INTEGRITY</span>
              <strong id="hulls" aria-label="3 hulls remaining">
                △ △ △
              </strong>
            </div>
            <div className="hud-best">
              <span>PERSONAL BEST</span>
              <strong id="best">00000</strong>
            </div>
          </div>

          <div className="flight-deck">
            <canvas
              id="field"
              width="960"
              height="640"
              tabIndex={0}
              aria-label="Space playfield. Left and right arrows or A and D rotate, up arrow or W thrusts, Space fires, Escape pauses."
              aria-describedby="how-to"
            >
              Your browser needs canvas support to render this space shooter.
            </canvas>
            <div className="field-label">
              <span id="flight-state">FLIGHT SYSTEMS READY</span>
              <span id="rock-count">02 CONTACTS</span>
            </div>
            <div className="prompt" id="prompt">
              <p className="prompt-kicker" id="prompt-kicker">
                FLIGHT SIMULATION / STANDBY
              </p>
              <h2 id="prompt-title">
                Into the
                <br />
                asteroid belt.
              </h2>
              <p id="prompt-copy">
                The route is yours to clear.
                <br />
                Keep moving. Make every shot count.
              </p>
              <div className="mission-spec" id="mission-spec">
                <span>
                  <b>04</b> SECTORS
                </span>
                <span>
                  <b>03</b> HULLS
                </span>
              </div>
              <dl className="debrief" id="debrief" hidden>
                <div>
                  <dt>FLIGHT TIME</dt>
                  <dd id="debrief-time">0:00</dd>
                </div>
                <div>
                  <dt>ACCURACY</dt>
                  <dd id="debrief-accuracy">—</dd>
                </div>
              </dl>
              <button type="button" className="launch" id="launch">
                START RUN <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="sector-banner" id="sector-banner" hidden>
              <span>SECTOR CLEAR</span>
              <strong id="next-sector">02 INBOUND</strong>
            </div>
            <span className="coordinate">
              ORBITAL CLEARANCE <i aria-hidden="true"></i> MANUAL FLIGHT
            </span>
            <div className="flight-telemetry" aria-hidden="true">
              <span id="velocity">000 M/S</span>
              <i>
                <b id="thrust-meter"></b>
              </i>
            </div>
          </div>

          <div className="deck-toolbar">
            <p id="run-hint">
              Thrust in short bursts. Momentum stays with you.
            </p>
            <div className="utility-controls">
              <button type="button" id="pause" disabled>
                PAUSE <span>ESC</span>
              </button>
              <button type="button" id="restart">
                RESTART
              </button>
              <button type="button" id="sound" aria-pressed="false">
                SOUND OFF
              </button>
            </div>
          </div>
          <div
            className="flight-controls"
            aria-label="Hold flight controls. Multiple buttons can be held together."
          >
            <div className="steering">
              <button
                type="button"
                data-action="left"
                aria-label="Hold to rotate left"
              >
                <b aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 10a8 8 0 1 1 1 9M5 4v6h6"></path>
                  </svg>
                </b>
                <span>LEFT</span>
              </button>
              <button
                type="button"
                data-action="right"
                aria-label="Hold to rotate right"
              >
                <b aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 10a8 8 0 1 0-1 9M19 4v6h-6"></path>
                  </svg>
                </b>
                <span>RIGHT</span>
              </button>
            </div>
            <button
              type="button"
              className="thrust-control"
              data-action="thrust"
              aria-label="Hold to thrust forward"
            >
              <b aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m7 13 5-10 5 10-5-2ZM9 16v4m3-5v7m3-6v4"></path>
                </svg>
              </b>
              <span>THRUST</span>
            </button>
            <button
              type="button"
              className="fire-control"
              data-action="fire"
              aria-label="Hold to fire"
            >
              <b aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="7">
                    <path d="M12 1v4m0 14v4M1 12h4m14 0h4">
                      <circle cx="12" cy="12" r="2"></circle>
                    </path>
                  </circle>
                </svg>
              </b>
              <span>FIRE</span>
            </button>
          </div>
        </section>

        <footer className="instructions" id="how-to">
          <p>
            <kbd>←</kbd>
            <kbd>→</kbd> rotate <span>·</span> <kbd>↑</kbd> thrust{' '}
            <span>·</span> <kbd>SPACE</kbd> fire{' '}
            <span className="alt-keys">/ W A D also work</span>
          </p>
          <details>
            <summary>FLIGHT NOTES</summary>
            <p>
              Hold the on-screen buttons together, or use your keyboard. Fly off
              an edge to wrap to the opposite side. Each large rock splits into
              two medium rocks, then four small ones. Clear all four sectors to
              win. A collision costs one hull; the ring around your ship gives
              2.8 seconds of protection after respawning. Large, medium and
              small rocks earn 50, 100 and 200 points; finishing adds 500 per
              remaining hull. Escape or Pause stops the run. Leaving the tab
              pauses automatically.
            </p>
          </details>
        </footer>
        <p
          id="announcement"
          className="sr-only"
          role="status"
          aria-live="polite"
        ></p>
        <noscript>
          <p className="no-script">
            JavaScript is needed to fly. Enable it, then reload to start a run.
          </p>
        </noscript>
      </main>
    </GameRuntime>
  );
}
