'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';
import './viewport.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="topbar">
        <a href="/" className="back">
          ← More games
        </a>
        <h1 className="garden-club">
          TINY TOWER <span>DEFENSE</span>
        </h1>
        <button id="guide-button" aria-expanded="false" aria-controls="guide">
          Field guide <span>?</span>
        </button>
      </header>
      <main>
        <section id="guide" className="guide" hidden>
          <h2>Welcome to the garden guard</h2>
          <ol>
            <li>
              <strong>Choose an empty plot</strong> on the map. Pick a seed
              packet and review its range before you plant.
            </li>
            <li>
              <strong>Spend sunlight</strong> to plant or upgrade. Every
              defeated bug earns more; each cleared wave gives a bonus.
            </li>
            <li>
              <strong>Send the wave</strong> when you are ready. Towers attack
              automatically. You can still build during a wave.
            </li>
            <li>
              <strong>Protect 12 garden hearts</strong> through all 7 waves.
              Ants/skippers cost 1 heart, beetles 2, and the grand snail 5 if
              they escape.
            </li>
          </ol>
          <p>
            Peashooters hit quickly. Acorns splash nearby bugs. Dew slows a
            small group for 2 seconds. Each defender upgrades twice; selling
            returns 70% of its total investment. Tab/Enter select controls;
            arrows move between plots, 1–3 choose seeds, P pauses, and Escape
            clears your plot.
          </p>
        </section>
        <div className="garden-game">
          <section className="map-column">
            <div className="field-toolbar">
              <div className="resources">
                <span className="resource sun">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="5">
                      <path
                        d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      ></path>
                    </circle>
                  </svg>
                  <strong id="sun">150</strong>
                  <small>sunlight</small>
                </span>
                <span className="resource hearts">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21C-8 8 5-4 12 6 19-4 32 8 12 21Z"></path>
                  </svg>
                  <strong id="hearts">12</strong>
                  <small>hearts</small>
                </span>
                <span className="wave-pill">
                  WAVE <strong id="wave-count">0 / 7</strong>
                </span>
              </div>
              <div className="top-controls">
                <button id="speed" disabled aria-label="Change game speed">
                  1×
                </button>
                <button id="pause" disabled aria-label="Pause game">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M8 5v14M16 5v14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    ></path>
                  </svg>
                </button>
                <button id="restart" disabled aria-label="Restart game">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 9a8 8 0 1 1 0 7M5 4v6h6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
            <div className="map-viewport">
              <div className="map-frame">
                <canvas
                  id="field"
                  width="800"
                  height="560"
                  aria-label="A garden path winds from the bug burrow to the greenhouse. Choose a labeled build plot using the controls on this map."
                ></canvas>
                <div
                  id="plots"
                  className="plots"
                  role="group"
                  aria-label="Defender build plots"
                ></div>
                <div id="cover" className="map-cover">
                  <div className="welcome-sign">
                    <h2>
                      The garden
                      <br />
                      <em>needs you.</em>
                    </h2>
                    <p>
                      Plant defenders. Stop the bugs.
                      <br />
                      Seven waves to keep the garden safe.
                    </p>
                    <button id="start" className="primary-button">
                      Start defense <span>→</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="wave-bar">
              <div>
                <span id="wave-status">A QUIET MOMENT, FOR NOW</span>
                <strong id="wave-name">Plant your first defenders.</strong>
              </div>
              <button id="send-wave" className="primary-button" disabled>
                Send wave 1 <span>→</span>
              </button>
            </div>
            <p id="status" className="status" role="status" aria-live="polite">
              Start your watch. Then choose a plot and a seed packet.
            </p>
          </section>
          <aside className="potting-bench">
            <div className="bench-heading">
              <span>PLANT YOUR DEFENSE</span>
              <h2>Seed selection</h2>
              <p>Choose a seed, then a plot.</p>
            </div>
            <div
              className="seed-packets"
              role="group"
              aria-label="Choose defender type"
            >
              <button
                className="seed-packet selected"
                data-type="pea"
                aria-pressed="true"
              >
                <span className="packet-art" data-art="pea"></span>
                <span className="packet-copy">
                  <strong>Peashooter</strong>
                  <small>QUICK & PRECISE</small>
                </span>
                <span className="packet-cost">60</span>
              </button>
              <button
                className="seed-packet"
                data-type="acorn"
                aria-pressed="false"
              >
                <span className="packet-art" data-art="acorn"></span>
                <span className="packet-copy">
                  <strong>Acorn Mortar</strong>
                  <small>HITS A WHOLE BUNCH</small>
                </span>
                <span className="packet-cost">95</span>
              </button>
              <button
                className="seed-packet"
                data-type="dew"
                aria-pressed="false"
              >
                <span className="packet-art" data-art="dew"></span>
                <span className="packet-copy">
                  <strong>Dew Sprinkler</strong>
                  <small>SLOW & STEADY</small>
                </span>
                <span className="packet-cost">75</span>
              </button>
            </div>
            <section
              className="plot-inspector"
              aria-label="Selected plot details"
            >
              <span id="plot-label" className="eyebrow">
                A HOME FOR YOUR DEFENDER
              </span>
              <h3 id="inspector-title">Choose a little plot.</h3>
              <p id="inspector-description">
                Tap a letter on the map to preview your defender’s reach.
              </p>
              <div id="tower-stats" className="tower-stats"></div>
              <div className="inspector-actions">
                <button id="plant" className="plant-button" disabled>
                  Plant Peashooter · 60
                </button>
                <button id="upgrade" className="plant-button" hidden>
                  Upgrade
                </button>
                <button id="sell" className="sell-button" hidden>
                  Sell
                </button>
              </div>
              <p className="economy-note" id="economy-note">
                Defeat bugs for sunlight. Finish a wave for a bonus.
              </p>
            </section>
            <div className="best-stamp">
              <span>BEST DEFENSE</span>
              <strong id="best">0</strong>
              <span>POINTS</span>
            </div>
          </aside>
        </div>
      </main>
    </GameRuntime>
  );
}
