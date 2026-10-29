'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <main className="game-shell">
        <header className="game-header">
          <a className="back" href="/" aria-label="Back to all games">
            ← <span>ALL GAMES</span>
          </a>
          <div className="wordmark">
            <h1>
              BREAK<span>POINT</span>
              <i aria-hidden="true">{'//'}</i>
            </h1>
            <p>PRECISION ARCADE · VOL. 01</p>
          </div>
          <button
            id="sound"
            className="sound-button"
            aria-pressed="false"
            aria-label="Turn sound on"
          >
            SOUND <span id="sound-state">OFF</span>
          </button>
        </header>
        <section className="cabinet" aria-label="BREAKPOINT game">
          <div className="scoreboard">
            <div className="score-main">
              <span>SCORE</span>
              <strong id="score">00000</strong>
            </div>
            <div className="court-score">
              <span id="level-name">OPENING SET</span>
              <strong>
                <span id="level">01</span>
                <b> / 04</b>
              </strong>
            </div>
            <div className="lives-score">
              <span>LIVES</span>
              <strong id="lives" aria-label="3 lives remaining">
                <i></i>
                <i></i>
                <i></i>
              </strong>
            </div>
            <div className="session-station">
              <div className="utility-controls">
                <button id="pause" disabled>
                  Ⅱ <span>PAUSE</span>
                </button>
                <button id="restart">
                  ↻ <span>RESTART</span>
                </button>
              </div>
              <details className="how-to">
                <summary>
                  HOW TO PLAY <span aria-hidden="true">＋</span>
                </summary>
                <div>
                  <p>
                    <b>Move.</b> Mouse, drag, ← → or A / D.
                  </p>
                  <p>
                    <b>Serve.</b> Space. Paddle edges steer. Marked bricks take
                    extra hits.
                  </p>
                  <p>
                    <b>Score.</b> Bricks, rallies and court clears earn points.
                  </p>
                  <p>
                    <b>Pause.</b> Escape / P. Restart keeps your best.
                  </p>
                </div>
              </details>
            </div>
            <div className="best-score">
              <span>BEST RUN</span>
              <strong id="best">00000</strong>
            </div>
          </div>
          <div className="court">
            <canvas
              id="game"
              width="800"
              height="600"
              tabIndex={0}
              aria-label="Brick breaker court. Move with left and right arrows or A and D. Space launches. Escape or P pauses."
            ></canvas>
            <div className="rally-tag" id="rally" hidden>
              HIT STREAK <strong>02</strong>
            </div>
            <div className="prompt" id="prompt">
              <div className="prompt-copy">
                <span className="prompt-label" id="prompt-label">
                  COURT 01 / READY TO SERVE
                </span>
                <h2 id="prompt-title">Make your break.</h2>
                <p id="prompt-description">
                  Four courts. Three lives. Find your angle.
                </p>
              </div>
              <button className="primary" id="start">
                START GAME <span>↗</span>
              </button>
              <span className="prompt-key" id="prompt-key">
                OR PRESS SPACE
              </span>
            </div>
            <span className="demo-label" hidden>
              LIVE COURT / AUTOPLAY
            </span>
          </div>
          <div className="control-deck">
            <div className="movement-controls" aria-label="Paddle controls">
              <button id="left" aria-label="Move paddle left">
                ←
              </button>
              <span>
                MOVE
                <br />
                <b>A / D</b>
              </span>
              <button id="right" aria-label="Move paddle right">
                →
              </button>
            </div>
            <button className="launch-button" id="launch">
              LAUNCH BALL <kbd>SPACE</kbd>
            </button>
          </div>
        </section>
        <div className="below-court">
          <p id="status" role="status" aria-live="polite">
            Three lives. Four courts. Your move.
          </p>
          <span id="bricks-left">50 BRICKS IN PLAY</span>
        </div>
      </main>
    </GameRuntime>
  );
}
