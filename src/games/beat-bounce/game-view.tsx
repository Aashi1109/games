'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header>
        <a className="back" href="/" aria-label="All games">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 6-6 6 6 6M8 12h12"></path>
          </svg>
          <span>All games</span>
        </a>
        <h1>
          Beat<span>Bounce</span>
          <i>33⅓</i>
        </h1>
        <button id="sound" aria-pressed="true">
          Sound on
        </button>
      </header>
      <main>
        <section className="deck" aria-label="Rhythm game">
          <div className="deck-top">
            <span id="track-title">01 — SUNROOM</span>
            <div>
              <button id="pause" disabled>
                Pause
              </button>
              <button id="restart" disabled>
                Restart
              </button>
            </div>
          </div>
          <div className="readout">
            <div>
              <small>SCORE</small>
              <strong id="score">00000</strong>
            </div>
            <p id="feedback" role="status">
              Tap when a note meets the red line.
            </p>
            <div className="combo">
              <small>COMBO</small>
              <strong id="combo">×0</strong>
            </div>
          </div>
          <div className="stage">
            <canvas
              id="stage"
              width="1000"
              height="320"
              aria-label="Rhythm runway. Notes travel left toward the hit line. Press Space or tap the beat pad."
              tabIndex={0}
            ></canvas>
            <div id="overlay">
              <b id="overlay-title">Find your groove.</b>
              <p id="overlay-copy">
                Tap when a note meets the red line. Leave the gaps quiet.
              </p>
              <button id="play">Play Sunroom</button>
            </div>
          </div>
          <div className="progress">
            <div id="progress"></div>
          </div>
          <div className="transport">
            <span id="elapsed">0:00 / 0:30</span>
            <button id="tap" disabled>
              <span>TAP THE BEAT</span>
              <kbd>SPACE</kbd>
            </button>
            <span id="tempo">
              96 BPM
              <br />
              <small>FOUR BEATS TO GET READY</small>
            </span>
          </div>
        </section>
        <aside
          className="track-station"
          aria-label="Track selection and timing setup"
        >
          <section className="collection">
            <div className="section-heading">
              <h2>Select track</h2>
              <p>Choose your tempo before you start.</p>
            </div>
            <div id="tracks" className="tracks"></div>
          </section>
          <details className="calibration">
            <summary>Timing feel off? Tune your setup</summary>
            <p>
              Headphones and devices can introduce delay. Tap with eight clicks
              to calibrate, or adjust manually. Positive values compensate for
              late input.
            </p>
            <div className="calibration-controls">
              <button id="calibrate">Calibrate with 8 taps</button>
              <label>
                Timing offset{' '}
                <input
                  id="offset"
                  type="range"
                  min="-250"
                  max="250"
                  step="5"
                  defaultValue="0"
                />
                <output id="offset-value">0 ms</output>
              </label>
            </div>
          </details>
        </aside>
        <footer>
          ORIGINAL BEATS. GOOD TIMING. <span>SPACE TO TAP · ESC TO PAUSE</span>
        </footer>
      </main>
    </GameRuntime>
  );
}
