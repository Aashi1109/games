'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="topbar">
        <a className="back" href="/">
          ALL GAMES
        </a>
        <a className="maker" href="./">
          POCKET PINBALL
        </a>
        <span className="catalogue">THREE BALLS / FREE PLAY</span>
      </header>
      <main className="workshop">
        <aside className="instruments" aria-label="Scores and balls">
          <div className="marquee">
            <h1>
              ORBITAL<span>No. 8</span>
            </h1>
            <p>PINBALL / SCORE ATTACK</p>
          </div>
          <div className="counter-panel">
            <span className="counter-label">SCORE</span>
            <div id="score" className="score-wheels" aria-label="Score 0"></div>
            <div className="machine-stats">
              <span>
                BALL<strong id="ball-number">01 / 03</strong>
              </span>
              <span>
                MULTIPLIER<strong id="multiplier">×1</strong>
              </span>
            </div>
          </div>
          <div className="record-plate">
            <span>PERSONAL BEST</span>
            <strong id="best">000000</strong>
          </div>
          <div className="ball-plate">
            <span>BALLS REMAINING</span>
            <div id="ball-lights" className="ball-lights">
              <span>1</span>
              <span>2</span>
              <span>3</span>
            </div>
          </div>
          <p className="key-guide">
            <kbd>A</kbd>
            <kbd>D</kbd> Flippers
            <br />
            <kbd>SPACE</kbd> Hold & release
            <br />
            <kbd>ESC</kbd> Pause
          </p>
        </aside>
        <section className="machine" aria-label="Orbital No. 8 pinball machine">
          <div className="table-window">
            <canvas
              id="table"
              width="560"
              height="800"
              tabIndex={0}
              aria-label="Pinball table. A and D or arrow keys activate the flippers. Hold and release Space or Enter to launch the ball."
            ></canvas>
            <div className="table-overlay" id="overlay">
              <h2>Ready to launch?</h2>
              <p>
                Hold Space, then release.
                <br />A and D keep the ball in play.
              </p>
              <button id="overlay-action" className="small-button">
                Play pinball
              </button>
            </div>
            <div className="table-status" id="table-status" aria-live="polite">
              THREE BALLS. MAKE THEM COUNT.
            </div>
          </div>
          <div className="control-deck">
            <button
              className="flipper-button"
              id="left-flipper"
              aria-label="Hold left flipper"
              disabled
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 18V6h12M6 6l12 12"></path>
              </svg>
              <small>LEFT</small>
            </button>
            <button className="plunger-button" id="launch" disabled>
              <span className="plunger-meter" id="plunger-meter"></span>
              <strong id="launch-label">HOLD TO LAUNCH</strong>
              <small>RELEASE TO FIRE</small>
            </button>
            <button
              className="flipper-button"
              id="right-flipper"
              aria-label="Hold right flipper"
              disabled
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 18V6H6M18 6 6 18"></path>
              </svg>
              <small>RIGHT</small>
            </button>
          </div>
        </section>
        <aside className="mission-panel">
          <div className="switches">
            <button className="start-button" id="start">
              NEW GAME
            </button>
            <button id="pause" disabled>
              Pause
            </button>
            <button id="restart" disabled>
              Restart
            </button>
            <button id="sound" aria-pressed="false">
              Sound off
            </button>
          </div>
          <details className="rules" open>
            <summary>How to score</summary>
            <div className="mission-card">
              <h2>
                COMPLETE
                <br />
                THE ORBIT.
              </h2>
              <div className="target-lights" id="target-lights">
                <span>O</span>
                <span>R</span>
                <span>B</span>
              </div>
              <p>
                Light all three for <strong>1,000 points</strong> and a higher
                multiplier.
              </p>
              <span className="combo-label" id="combo-label">
                LINK DIFFERENT TARGETS.
              </span>
              <p className="ball-save">
                A four-second ball saver protects each new launch once.
              </p>
            </div>
          </details>
        </aside>
      </main>
    </GameRuntime>
  );
}
