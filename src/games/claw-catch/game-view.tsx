'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';
import './viewport.css';

const load = () => import('./app.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="site-head">
        <a href="/">← The games shelf</a>
        <h1 className="wordmark">
          claw <i>&</i> catch<span>EIGHT CASTS. YOUR NEXT CATCH.</span>
        </h1>
        <button id="sound" aria-pressed="false">
          Sound off <span>♪</span>
        </button>
      </header>
      <main>
        <section
          className="fishing-layout"
          aria-label="Claw and Catch fishing game"
        >
          <div className="waterside">
            <div className="pond-frame">
              <div className="pond-heading">
                <span>
                  <i></i> WILLOW POND
                </span>
                <span id="weather">BLUE HOUR · STILL WATER</span>
                <div className="trip-stats">
                  <div>
                    <strong id="casts">8</strong>
                    <span>CASTS LEFT</span>
                  </div>
                  <div>
                    <strong id="banked">0</strong>
                    <span>BANKED POINTS</span>
                  </div>
                </div>
              </div>
              <canvas
                id="pond"
                width="960"
                height="500"
                tabIndex={0}
                aria-label="Fishing pond. Space casts, sets the hook, and hold Space to reel. Release to ease tension."
              ></canvas>
              <div id="pond-badge" className="pond-badge" hidden></div>
              <div className="session-tools">
                <button id="pause" disabled aria-label="Pause fishing">
                  Ⅱ
                </button>
                <button id="restart" disabled aria-label="Restart fishing trip">
                  ↻
                </button>
              </div>
              <div id="overlay" className="overlay">
                <div className="opening">
                  <h2>
                    One pond.
                    <br />A little possibility.
                  </h2>
                  <p>
                    Hook in the green. Hold to reel; release to ease tension.
                    Bank your catch, or risk one more.
                  </p>
                  <button id="start" className="stamp-button">
                    Start fishing <span>↗</span>
                  </button>
                  <small>Mouse, touch, or Space · P to pause</small>
                </div>
              </div>
            </div>
          </div>
          <div className="tackle-station">
            <div className="tackle" id="tackle">
              <div className="tackle-top">
                <span id="phase-label">01 / FIND YOUR MOMENT</span>
                <span id="phase-hint">CAST · HOOK · REEL · KEEP</span>
              </div>
              <div className="meter-area">
                <div className="cast-meter" id="cast-meter">
                  <span className="cast-target"></span>
                  <i id="cast-marker"></i>
                  <span className="meter-water"></span>
                </div>
                <div id="reel-meters" className="reel-meters" hidden>
                  <div>
                    <label>
                      LINE TENSION <span id="tension-label">STEADY</span>
                    </label>
                    <div className="tension-track">
                      <i id="tension-fill"></i>
                    </div>
                  </div>
                  <div>
                    <label>
                      TO THE SHORE <span id="distance-label">0%</span>
                    </label>
                    <div className="distance-track">
                      <i id="distance-fill"></i>
                    </div>
                  </div>
                </div>
                <p id="meter-caption">
                  Tap to cast, then tap again in the green zone.
                </p>
              </div>
              <div className="action-row">
                <button id="action" className="stamp-button" disabled>
                  Cast a line <span>↗</span>
                </button>
                <button id="bank" className="paper-button" hidden>
                  Bank the basket <span>✓</span>
                </button>
                <button id="risk" className="paper-button risk" hidden>
                  One more cast <span>→</span>
                </button>
                <p id="basket-label">
                  Nothing to carry.
                  <br />
                  Everything to discover.
                </p>
              </div>
            </div>
            <p
              className="status-line"
              id="message"
              role="status"
              aria-live="polite"
            >
              A quiet pond. Eight casts. Something lovely beneath the surface.
            </p>
            <details className="catch-log">
              <summary>
                Catch log <span>COLLECTION & BASKET ＋</span>
              </summary>
              <aside className="journal">
                <h2>The catch log</h2>
                <div className="collection-heading">
                  <span>YOUR FINDS</span>
                  <span id="collection-count">0 / 6</span>
                </div>
                <div id="collection" className="collection"></div>
                <div className="basket-note">
                  <span>IN YOUR BASKET</span>
                  <strong id="basket-points">0</strong>
                  <p id="basket-detail">
                    Unbanked catches travel with you.
                    <br />A lost fish takes the basket, too.
                  </p>
                </div>
                <div className="journal-bottom">
                  <span>PERSONAL BEST</span>
                  <strong id="best">0</strong>
                </div>
              </aside>
            </details>
          </div>
        </section>
        <footer>
          <span>
            Hold Space or the button to reel. Release to ease tension.
          </span>
          <span>Eight casts · Six species · Your own pace</span>
        </footer>
      </main>
    </GameRuntime>
  );
}
