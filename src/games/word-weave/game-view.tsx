'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';
import './viewport.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <main className="paper">
        <header className="masthead">
          <a className="publication" href="/">
            ← All games
          </a>
          <h1>
            Word <em>Weave</em>
            <span className="brand-thread" aria-hidden="true">
              〰
            </span>
          </h1>
          <button
            className="text-button"
            id="help-toggle"
            aria-expanded="false"
            aria-controls="rules"
          >
            How to play
          </button>
        </header>
        <section className="rules" id="rules" hidden>
          <button
            id="rules-close"
            className="panel-close"
            aria-label="Close field guide"
          >
            ×
          </button>
          <h2>A little field guide</h2>
          <p>
            Connect neighboring letters, including diagonals. Each tile may
            appear only once in a word. Words need at least 3 letters and must
            appear in our curated wordbook below. Different words can reuse the
            board.
          </p>
          <p>
            <strong>Tap</strong> letters, then Gather. Or drag a whole word and
            release. <strong>Keyboard:</strong> arrow keys move, Space adds a
            letter, Enter gathers, Backspace undoes, Escape clears. Daily rounds
            last 3 minutes; practice has no timer.
          </p>
          <p>
            Scoring: 3 letters = 1 point, 4 = 2, 5 = 5, then +2 for each extra
            letter. Gather 8 words on a fresh board to press a flower. Daily
            editions change at midnight UTC.
          </p>
        </section>
        <div className="issue-bar">
          <div className="mode-switch" role="group" aria-label="Puzzle mode">
            <button id="daily" className="selected" aria-pressed="true">
              Daily puzzle
            </button>
            <button id="practice" aria-pressed="false">
              Free practice
            </button>
          </div>
          <span id="edition">TODAY’S PUZZLE</span>
          <div className="best-line">
            BEST <strong id="best">0</strong>
          </div>
        </div>
        <section className="play-layout">
          <div className="board-column">
            <div className="game-hud">
              <div className="score-line">
                <span>POINTS</span>
                <strong id="score">0</strong>
              </div>
              <div className="clock">
                <span id="clock-label">TIME LEFT</span>
                <strong id="clock">3:00</strong>
              </div>
              <div className="round-actions">
                <button id="pause" className="text-button" disabled>
                  Pause
                </button>
                <button id="restart" className="text-button" disabled>
                  Restart
                </button>
                <button
                  id="finish"
                  className="text-button"
                  aria-label="Finish and reveal words"
                  disabled
                >
                  Finish
                </button>
              </div>
            </div>
            <div className="board-heading">
              <span id="board-label">DAILY PUZZLE</span>
              <span id="found-count">0 words found</span>
            </div>
            <div className="board-viewport">
              <div className="board-wrap">
                <div
                  id="letter-board"
                  className="letter-board"
                  role="group"
                  aria-label="Four by four letter garden"
                ></div>
                <svg id="thread" viewBox="0 0 100 100" aria-hidden="true"></svg>
                <div id="cover" className="cover">
                  <h2>
                    Find your
                    <br />
                    next <em>word.</em>
                  </h2>
                  <p>
                    Link neighboring letters.
                    <br />
                    Three minutes. Endless possibilities.
                  </p>
                  <button id="start" className="ink-button">
                    Start daily puzzle <span>→</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="word-tray">
              <output id="current-word" aria-label="Selected word">
                Choose a first letter
              </output>
              <div>
                <button
                  id="undo"
                  className="square-button"
                  aria-label="Remove last letter"
                  disabled
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M9 5h12v14H9L2 12Z M12 9l6 6m0-6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    ></path>
                  </svg>
                </button>
                <button id="submit" className="ink-button" disabled>
                  Gather <span>↵</span>
                </button>
              </div>
            </div>
            <p
              id="feedback"
              className="feedback"
              role="status"
              aria-live="polite"
            >
              Connect letters at the sides or corners.
            </p>
          </div>
          <details className="word-drawer">
            <summary>
              Your words &amp; garden <span>＋</span>
            </summary>
            <aside className="word-margin">
              <div className="notes-heading">
                <h2>Your words</h2>
                <span>THE COLLECTION</span>
              </div>
              <p className="empty-words" id="empty-words">
                Your next discovery starts with a single letter.
              </p>
              <ul
                id="found-words"
                className="found-words"
                aria-label="Words you found"
              ></ul>
              <button id="show-results" className="finish-link" hidden>
                View round results ↗
              </button>
              <p id="round-note">Three minutes to explore.</p>
              <div className="garden-label">
                FLOWER COLLECTION <span id="garden-count">0 / 8</span>
              </div>
              <div
                id="garden"
                className="garden"
                aria-label="Pressed-flower collection"
              ></div>
              <p className="small-note">
                Find 8 words on a new board to collect a flower.
              </p>
              <p className="dictionary-note">
                <strong id="wordbook-count"></strong> familiar words in our
                curated wordbook. Some English words are outside this edition.
              </p>
            </aside>
          </details>
        </section>
        <section
          id="results"
          className="results"
          hidden
          aria-labelledby="result-title"
        >
          <button
            id="results-close"
            className="panel-close"
            aria-label="Close round results"
          >
            ×
          </button>
          <div>
            <h2 id="result-title">A page worth keeping.</h2>
            <p id="result-summary"></p>
            <div className="result-actions">
              <button id="again" className="ink-button">
                A fresh practice patch →
              </button>
              <button id="replay" className="text-button">
                Revisit this board
              </button>
            </div>
          </div>
          <div>
            <h3>Still waiting to be found</h3>
            <p className="small-note">
              Select any word to trace its path on the board.
            </p>
            <div id="missed-words" className="missed-words"></div>
          </div>
        </section>
        <details className="wordbook">
          <summary>
            The complete wordbook <span>Our rules, in plain sight.</span>
          </summary>
          <p>
            Every accepted word is listed here. This is a hand-curated
            common-English collection, not an exhaustive dictionary.
          </p>
          <label>
            Find a word{' '}
            <input
              id="dictionary-search"
              type="search"
              placeholder="Try “garden”"
              autoComplete="off"
            />
          </label>
          <div id="dictionary-list"></div>
        </details>
        <footer>
          <span>A LITTLE DISCOVERY, EVERY DAY.</span>
          <a href="/">More games ↗</a>
        </footer>
      </main>
    </GameRuntime>
  );
}
