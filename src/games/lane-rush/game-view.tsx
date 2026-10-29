'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="masthead">
        <a href="/" className="back-link" aria-label="Back to all games">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7"></path>
          </svg>
          <span>ALL GAMES</span>
        </a>
        <h1>
          LANE<span>RUSH</span>
          <i aria-hidden="true">{'//'}</i>
        </h1>
        <div className="session-controls">
          <button id="pause" disabled aria-label="Pause run">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14M16 5v14"></path>
            </svg>
            <span>PAUSE</span>
          </button>
          <button id="restart" disabled aria-label="Restart run">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6"></path>
            </svg>
            <span>RESTART</span>
          </button>
        </div>
      </header>
      <main className="race-layout">
        <section className="race-column" aria-label="Race track">
          <div className="road-frame">
            <canvas
              id="road"
              width="1200"
              height="720"
              tabIndex={0}
              aria-label="Lane Rush race track. Left and right arrows or A and D change lanes. Hold down arrow, S, or Space to brake. Escape pauses."
            ></canvas>
            <div className="race-overlay" id="overlay">
              <h2 id="overlay-title">
                90 SECONDS.
                <br />
                NO SLOW LANE.
              </h2>
              <span className="run-detail" id="overlay-kicker">
                EXPRESSWAY / ROUTE 90
              </span>
              <p id="overlay-copy">
                90 seconds. Three lanes.
                <br />
                Stay clear of traffic. Three hits end the run.
              </p>
              <button id="action" className="start-button">
                START ENGINE{' '}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 19 19 5M5 5h14v14"></path>
                </svg>
              </button>
              <span className="overlay-hint" id="overlay-hint">
                ← → CHANGE LANE &nbsp; · &nbsp; ↓ BRAKE
              </span>
            </div>
            <div
              className="race-toast"
              id="toast"
              role="status"
              aria-live="polite"
            ></div>
            <div className="finish-progress" aria-hidden="true">
              <span id="progress"></span>
            </div>
          </div>
          <div className="drive-controls" id="drive-controls" inert>
            <button id="left" aria-label="Move one lane left">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5m7-7-7 7 7 7"></path>
              </svg>
              <small>A / LEFT</small>
            </button>
            <button id="brake" aria-label="Hold to brake">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14M16 5v14"></path>
              </svg>
              <strong>HOLD TO BRAKE</strong>
              <small>↓ / S / SPACE</small>
            </button>
            <button id="right" aria-label="Move one lane right">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14m-7-7 7 7-7 7"></path>
              </svg>
              <small>D / RIGHT</small>
            </button>
          </div>
        </section>
        <aside className="telemetry" aria-label="Race telemetry">
          <div className="track-label">
            <span>
              <i></i> <b id="track-status">GRID OPEN</b>
            </span>
            <span>
              EXPRESSWAY 90 <i>↗</i>
            </span>
          </div>
          <div className="score-block">
            <span className="eyebrow">RUN SCORE</span>
            <strong id="score">00000</strong>
            <span className="score-note">EVERY METER COUNTS</span>
          </div>
          <div className="time-block">
            <span className="eyebrow">TIME TO FLAG</span>
            <strong id="time">1:30</strong>
            <div className="timer-track" aria-hidden="true">
              <span id="timer-bar"></span>
            </div>
          </div>
          <div className="speed-block">
            <span className="eyebrow">GROUND SPEED</span>
            <div>
              <strong id="speed">000</strong>
              <span className="unit">KM/H</span>
            </div>
            <div className="speed-ticks" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          </div>
          <div className="distance-block">
            <span className="eyebrow">DISTANCE COVERED</span>
            <strong id="distance">
              0.00 <small>KM</small>
            </strong>
          </div>
          <div className="damage-block">
            <span className="eyebrow">CAR CONDITION</span>
            <div
              id="health"
              className="health"
              aria-label="Three hits remaining"
            >
              <span></span>
              <span></span>
              <span></span>
            </div>
            <small id="health-copy">3 HITS TO RETIRE</small>
          </div>
          <div className="best-block">
            <span className="eyebrow">PERSONAL BEST</span>
            <strong id="best">—</strong>
          </div>
          <div className="track-stamp" aria-hidden="true">
            <span>09</span>
            <small>
              RUSH SPEC
              <br />
              CLUBSPORT
            </small>
          </div>
        </aside>
      </main>
      <footer>
        <span>
          <kbd>A D</kbd> STEER &nbsp; / &nbsp; <kbd>↓</kbd> BRAKE &nbsp; /
          &nbsp; <kbd>ESC</kbd> PAUSE
        </span>
        <span>SWIPE TO SWITCH LANES · HOLD THE CENTER PEDAL TO BRAKE</span>
      </footer>
    </GameRuntime>
  );
}
