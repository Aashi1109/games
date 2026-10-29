'use client';

import { GameRuntime } from '../../components/game-runtime';
import './style.css';

const load = () => import('./main.ts');

export function GameView() {
  return (
    <GameRuntime load={load}>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Back to Game Shelf">
          <span className="brand-icon" aria-hidden="true">
            ◈
          </span>{' '}
          FAULTLINE<span className="edition">EXPEDITION 04</span>
        </a>
        <div className="top-location">
          <span className="signal-dot"></span> KEPLER RIDGE
          <span className="divider">/</span> SECTOR 09
        </div>
        <nav aria-label="Game controls">
          <button
            id="sound"
            className="icon-button"
            aria-label="Mute sound"
            title="Sound (M)"
          >
            ♪
          </button>
          <button
            id="help"
            className="icon-button"
            aria-label="How to play"
            title="How to play"
          >
            ?
          </button>
          <button
            id="pause"
            className="icon-button"
            aria-label="Pause game"
            title="Pause (Esc)"
            hidden
          >
            Ⅱ
          </button>
        </nav>
      </header>
      <main id="game-shell">
        <canvas
          id="world"
          tabIndex={0}
          aria-label="Faultline mining and defense game. Move with WASD or arrow keys, hold Space to drill. R recalls you to the shelter, E operates the turret, U opens upgrades."
        ></canvas>
        <div className="scene-grain" aria-hidden="true"></div>
        <div className="hud" id="hud" hidden>
          <section className="base-status" aria-label="Shelter health">
            <div className="hud-label">
              <span>SHELTER INTEGRITY</span>
              <strong id="health-number">100%</strong>
            </div>
            <div className="health-track">
              <div id="health-fill"></div>
            </div>
            <span className="status-sub" id="base-label">
              AUTOTURRET ONLINE
            </span>
          </section>
          <section className="wave-status" aria-label="Wave status">
            <span id="phase-label">NEXT WAVE</span>
            <strong id="wave-clock">01:05</strong>
            <div
              className="wave-pips"
              id="wave-pips"
              aria-label="0 of 4 waves survived"
            >
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          </section>
          <div className="mission-status">
            <span className="hud-label">EXTRACTION</span>
            <strong id="wave-number">WAVE 01 / 04</strong>
            <span id="threat-label">NO THREATS DETECTED</span>
          </div>
          <section className="cargo-panel">
            <div className="hud-label">
              <span>
                CARGO <strong id="cargo-count">0 / 6</strong>
              </span>
              <span className="depth" id="depth">
                DEPTH 12 M
              </span>
            </div>
            <div className="cargo-slots" id="cargo-slots"></div>
            <div className="cargo-bottom">
              <span>
                <i className="ore-dot"></i>
                <strong id="credits">8</strong> SALVAGE
              </span>
              <button id="workshop" title="Workshop (U)">
                UPGRADE <kbd>U</kbd>
              </button>
            </div>
          </section>
          <div className="action-panel">
            <button id="recall" className="control-button">
              <span className="control-symbol">↑</span>
              <span>
                <strong>RECALL</strong>
                <small id="recall-state">TO SHELTER</small>
              </span>
              <kbd>R</kbd>
            </button>
            <button id="interact" className="control-button">
              <span className="control-symbol">⌖</span>
              <span>
                <strong id="interact-label">TURRET</strong>
                <small id="interact-hint">AT THE SHELTER</small>
              </span>
              <kbd>E</kbd>
            </button>
          </div>
          <div id="objective" className="objective">
            <span className="objective-mark">↳</span>
            <span id="objective-text">
              Mine ore. Return to the shelter to deposit it.
            </span>
          </div>
          <div className="minimap-wrap">
            <span>SUBSURFACE SCAN</span>
            <canvas
              id="minimap"
              width="160"
              height="104"
              aria-label="Map of excavated tunnels, ore and your location"
            ></canvas>
          </div>
        </div>
        <section id="menu" className="menu-screen" aria-labelledby="game-title">
          <div className="menu-copy">
            <p className="eyebrow">
              <span></span> A SIGNAL FROM BELOW
            </p>
            <h1 id="game-title">
              FAULT<span>LINE</span>
              <i>04</i>
            </h1>
            <p className="tagline">
              Dig deep.
              <br />
              Hold the line.
            </p>
            <p className="menu-description">
              The ridge is alive. Mine its riches, arm your shelter, and survive
              until the evacuation ship arrives.
            </p>
            <div className="difficulty" role="group" aria-label="Difficulty">
              <button data-difficulty="normal" aria-pressed="true">
                EXPEDITION <small>THE FULL CHALLENGE</small>
              </button>
              <button data-difficulty="relaxed" aria-pressed="false">
                EXPLORER <small>MORE TIME TO DIG</small>
              </button>
            </div>
            <button id="start" className="primary-button" disabled>
              <span id="start-label">PREPARING EXPEDITION</span>
              <span aria-hidden="true">↗</span>
            </button>
            <button id="continue" className="text-button" hidden>
              Continue expedition <span>→</span>
            </button>
            <div className="menu-footnote">
              <span>SOLO EXPEDITION</span>
              <span>4 WAVES</span>
              <span>~6 MIN</span>
            </div>
            <p id="load-note" className="load-note" role="status"></p>
          </div>
          <div className="dispatch">
            <span className="dispatch-id">TRANSMISSION / 004</span>
            <div className="dispatch-line"></div>
            <p>
              “Whatever you find down there,
              <br />
              be back before the sun goes.”
            </p>
            <span className="dispatch-sign">— RIDGE CONTROL</span>
          </div>
          <div className="menu-coordinate">
            27° 04′ N &nbsp; 86° 09′ E <span>ALT. −2400 M</span>
          </div>
        </section>
        <div
          id="toast"
          className="toast"
          role="status"
          aria-live="polite"
          hidden
        ></div>
        <div id="wave-banner" className="wave-banner" hidden>
          <span>INCOMING TRANSMISSION</span>
          <strong id="banner-title"></strong>
          <p id="banner-copy"></p>
        </div>
        <section
          className="touch-controls"
          id="touch-controls"
          aria-label="Touch game controls"
          hidden
        >
          <div className="dpad">
            <button data-move="up" aria-label="Move up">
              ↑
            </button>
            <button data-move="left" aria-label="Move left">
              ←
            </button>
            <button data-move="down" aria-label="Move down">
              ↓
            </button>
            <button data-move="right" aria-label="Move right">
              →
            </button>
          </div>
          <button id="touch-drill" className="touch-drill">
            DRILL
            <br />
            <span>HOLD</span>
          </button>
        </section>
      </main>
      <footer className="bottom-bar">
        <div id="keyboard-hints">
          <span>
            <kbd>W A S D</kbd> MOVE
          </span>
          <span>
            <kbd>SPACE</kbd> DRILL
          </span>
          <span>
            <kbd>R</kbd> RECALL
          </span>
        </div>
        <span className="bottom-motto" id="bottom-motto">
          GOOD ORE. BAD COMPANY.
        </span>
        <span className="version">FAULTLINE / 1.0</span>
      </footer>
      <dialog id="panel" aria-labelledby="panel-title">
        <form method="dialog" className="dialog-close">
          <button aria-label="Close panel">×</button>
        </form>
        <p className="eyebrow" id="panel-eyebrow">
          RIDGE CONTROL
        </p>
        <h2 id="panel-title"></h2>
        <div id="panel-content"></div>
      </dialog>
      <noscript>
        <div className="no-script">
          Faultline needs JavaScript to run. Enable it in your browser, then
          reload.
        </div>
      </noscript>
    </GameRuntime>
  );
}
