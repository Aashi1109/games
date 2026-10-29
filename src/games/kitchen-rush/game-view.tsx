'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';
import './viewport.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="masthead">
        <a href="/" className="back-link">
          <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14 6-6 6 6 6M8 12h12"></path>
          </svg>{' '}
          All games
        </a>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32">
              <path d="M9 5v9m-4-9v6c0 6 8 6 8 0V5m-4 11v12M23 5c-5 3-5 11 0 13V5Zm0 13v10"></path>
            </svg>
          </span>
          KITCHEN RUSH
        </div>
        <div className="header-right">
          <span>OPEN LATE. PLAY ANYTIME.</span>
          <button id="sound" aria-pressed="false">
            Sound off
          </button>
        </div>
      </header>
      <main>
        <section className="diner" aria-label="Kitchen Rush game">
          <div className="shift-strip">
            <div className="shift-state">
              <span className="status-light"></span>
              <span id="shift-label">TAKING A BREATHER</span>
            </div>
            <div className="numbers">
              <div>
                <span>SHIFT</span>
                <strong id="clock">2:00</strong>
              </div>
              <div>
                <span>TIPS</span>
                <strong id="score">0</strong>
              </div>
              <div>
                <span>COMBO</span>
                <strong id="combo">×0</strong>
              </div>
              <div>
                <span>WALKOUTS</span>
                <strong id="walkouts">0/4</strong>
              </div>
            </div>
            <div className="tools">
              <button id="pause" disabled aria-label="Pause shift">
                <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14M16 5v14"></path>
                </svg>{' '}
                Pause
              </button>
              <button id="restart" disabled aria-label="Restart shift">
                <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9a8 8 0 1 1 0 6M4 4v5h5"></path>
                </svg>{' '}
                Restart
              </button>
            </div>
          </div>
          <div className="play-area" id="play-area">
            <div className="ticket-rail">
              <div className="rail-label">
                <span>ORDER RAIL</span>
                <span>Pick a ticket · build left to right</span>
              </div>
              <div
                id="orders"
                className="orders"
                aria-label="Customer order tickets"
              ></div>
            </div>
            <div className="workstation">
              <div className="plate-area">
                <div className="station-label">
                  <span>THE PASS</span>
                  <span id="active-recipe">YOUR NEXT MASTERPIECE</span>
                </div>
                <div className="plate-scene">
                  <div className="counter-shadow"></div>
                  <div className="steam" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                  </div>
                  <div className="plate">
                    <div id="stack" className="stack"></div>
                    <span id="plate-note">
                      A clean plate.
                      <br />A world of possibilities.
                    </span>
                  </div>
                  <div
                    id="service-pop"
                    className="service-pop"
                    aria-live="off"
                  ></div>
                </div>
                <div className="plate-actions">
                  <button id="undo" className="quiet">
                    <svg
                      className="ui-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12"
                        transform="translate(0 -2)"
                      ></path>
                    </svg>{' '}
                    Undo <kbd>⌫</kbd>
                  </button>
                  <button id="clear" className="quiet">
                    Clear plate
                  </button>
                  <button id="serve" className="serve">
                    SERVE IT!{' '}
                    <svg
                      className="ui-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14m-6-6 6 6-6 6"></path>
                    </svg>
                    <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
              <div className="pantry">
                <div className="station-label">
                  <span>PREP STATION</span>
                  <span>TAP OR PRESS 1–6</span>
                </div>
                <div id="ingredients" className="ingredients"></div>
                <div className="pantry-note">
                  {' '}
                  Bun first. Bun last.
                  <br />
                  The good stuff goes in between.
                </div>
              </div>
            </div>
            <div
              id="message"
              className="message"
              role="status"
              aria-live="polite"
            >
              Your counter is ready. Time to make someone’s lunch.
            </div>
          </div>
          <div id="overlay" className="overlay">
            <div className="welcome">
              <div>
                <h2>
                  Your counter.
                  <br />
                  Your lunch rush.
                </h2>
                <p>
                  Build each burger in ticket order. Serve it hot.
                  <br />
                  Two minutes. Four walkouts close the kitchen.
                </p>
                <button id="start" className="big-button">
                  OPEN THE KITCHEN{' '}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14m-7-7 7 7-7 7"></path>
                  </svg>
                </button>
                <small>1–6 to add · Enter to serve · P to pause</small>
              </div>
            </div>
          </div>
        </section>
        <footer>
          <div>
            <b>Freshly made. Happily played.</b>
          </div>
          <p>
            BEST SHIFT <strong id="best">0</strong>{' '}
            <span>· saved on this device</span>
          </p>
          <p>
            Tap ingredients or use <kbd>1–6</kbd> · <kbd>← →</kbd> tickets ·{' '}
            <kbd>P</kbd> pause
          </p>
        </footer>
      </main>
    </GameRuntime>
  );
}
