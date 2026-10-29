export function DriftShell() {
  return (
    <>
      <canvas id="game" aria-label="DRIFT 3D multiplayer arena"></canvas>
      <div id="boot" role="status">
        <span className="logo">
          DRIFT<span>↗</span>
        </span>
        <span>Opening the arena…</span>
      </div>
      <div id="lobby" className="lobby">
        <header className="topbar">
          <a className="logo" href="/drift/" aria-label="DRIFT home">
            DRIFT<span aria-hidden="true">↗</span>
          </a>
          <span className="topbar-caption">THE MOVEMENT ARENA</span>
          <div className="header-actions">
            <a className="collection-link" href="/">
              All games ↗
            </a>
            <button className="settings-button" id="settings-open">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 17h16" />
                <circle cx="9" cy="7" r="2.5" />
                <circle cx="15" cy="17" r="2.5" />
              </svg>
              Settings
            </button>
          </div>
        </header>
        <main className="entry">
          <div className="eyebrow entry-kicker">
            <span className="accent-line"></span> SMALL GAME. BIG MOVES.
          </div>
          <h1>
            Find your <br />
            <em>flow.</em>
          </h1>
          <p className="intro">
            A movement-first arena shooter. Drop in solo. Bring your friends.
          </p>
          <div className="entry-form">
            <fieldset
              className="mode-picker lobby-mode-picker"
              aria-labelledby="lobby-mode-label"
              aria-describedby="lobby-mode-details"
            >
              <legend>
                <span className="mode-heading">
                  <span id="lobby-mode-label">GAME MODE</span>
                  <span id="lobby-mode-details" className="mode-meta">
                    <span>6 players</span>
                    <span aria-hidden="true">·</span>
                    <span>5 min</span>
                  </span>
                </span>
              </legend>
              <div id="lobby-modes" className="mode-options"></div>
            </fieldset>
            <div className="name-heading">
              <label className="field-label" htmlFor="player-name">
                PLAYER NAME
              </label>
              <span id="play-context">Open room</span>
            </div>
            <input
              id="player-name"
              name="callsign"
              maxLength={16}
              defaultValue="Rookie"
              autoComplete="off"
              spellCheck="false"
            />
            <button className="play-button" id="play">
              <span id="play-label">Enter arena</span>
              <span className="button-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            <div className="room-actions">
              <button
                id="create-room"
                className="room-button"
                aria-haspopup="dialog"
                aria-expanded="false"
                aria-controls="create-room-dialog"
              >
                <span aria-hidden="true">+</span>Create room
              </button>
              <button
                id="join-toggle"
                className="room-button"
                aria-haspopup="dialog"
                aria-expanded="false"
                aria-controls="join-room-dialog"
              >
                Join friends<span aria-hidden="true">↗</span>
              </button>
            </div>
            <div id="bot-settings-home">
              <div className="bot-settings" id="bot-settings">
                <label className="bot-fill-toggle" htmlFor="bot-fill">
                  <input type="checkbox" id="bot-fill" defaultChecked />
                  Fill empty slots with bots
                </label>
                <fieldset
                  className="bot-difficulty-picker"
                  aria-describedby="bot-difficulty-note"
                >
                  <legend>BOT DIFFICULTY</legend>
                  <div
                    id="bot-difficulty-options"
                    className="difficulty-options"
                  ></div>
                </fieldset>
                <p id="bot-difficulty-note" className="bot-difficulty-note">
                  A relaxed start with more time to react.
                </p>
              </div>
            </div>
            <p className="entry-note" id="entry-note">
              No account or install needed.
            </p>
            <p className="error-message" id="lobby-error" role="alert"></p>
          </div>
        </main>
        <aside className="character-panel" aria-label="Choose your character">
          <fieldset className="class-picker">
            <legend>CHARACTER / CLASS</legend>
            <div id="lobby-classes" className="class-options"></div>
          </fieldset>
          <p
            id="lobby-power-description"
            className="power-description"
            aria-live="polite"
          ></p>
        </aside>
        <aside
          className="map-label"
          id="map-preview"
          aria-label="Arena preview"
        >
          <div className="map-overline">
            <span className="preview-dot" aria-hidden="true"></span> EXPLORE THE
            ARENAS <span id="map-number">01 / 04</span>
          </div>
          <fieldset className="map-picker">
            <legend>
              Choose your arena<span aria-hidden="true">↗</span>
            </legend>
            <div id="map-choices" className="map-choices"></div>
          </fieldset>
          <div className="map-details" aria-live="polite" aria-atomic="true">
            <span id="map-subtitle" className="map-subtitle"></span>
            <div className="map-title">
              <strong id="map-name">Canyon Relay</strong>
            </div>
            <p id="map-description"></p>
            <div className="map-traits">
              <span id="map-traversal">Rope routes</span>
              <span id="map-scale">84 m arena</span>
            </div>
          </div>
        </aside>
      </div>
      <dialog
        id="create-room-dialog"
        className="menu-panel room-dialog"
        aria-labelledby="create-room-title"
        aria-describedby="create-room-context"
      >
        <div className="panel-heading">
          <span className="eyebrow">YOUR ARENA. YOUR RULES.</span>
          <button
            id="create-room-close"
            className="icon-button"
            type="button"
            aria-label="Close create room"
          >
            ×
          </button>
        </div>
        <h2 id="create-room-title">
          Create a <em>room.</em>
        </h2>
        <p id="create-room-context" className="panel-intro"></p>
        <form id="create-room-form">
          <fieldset className="mode-picker">
            <legend>GAME MODE</legend>
            <div id="create-modes" className="mode-options"></div>
          </fieldset>
          <fieldset className="team-picker" id="create-team-field" hidden>
            <legend>TEAM</legend>
            <div id="create-teams" className="team-options"></div>
          </fieldset>
          <div id="create-bot-settings"></div>
          <p className="entry-note">
            Create your room, then share its invite link with friends.
          </p>
          <button id="create-room-submit" className="play-button" type="submit">
            <span>Create room</span>
            <span aria-hidden="true">↗</span>
          </button>
          <button
            id="create-room-cancel"
            className="outline-button"
            type="button"
          >
            Cancel
          </button>
        </form>
      </dialog>
      <dialog
        id="join-room-dialog"
        className="menu-panel room-dialog"
        aria-labelledby="join-room-title"
        aria-describedby="join-room-context"
      >
        <div className="panel-heading">
          <span className="eyebrow">BRING YOUR FRIENDS.</span>
          <button
            id="join-room-close"
            className="icon-button"
            type="button"
            aria-label="Close join room"
          >
            ×
          </button>
        </div>
        <h2 id="join-room-title">
          Join a <em>room.</em>
        </h2>
        <p id="join-room-context" className="panel-intro">
          Enter your friend’s room code to jump into their arena.
        </p>
        <form id="join-form">
          <label htmlFor="room-code" className="field-label">
            ROOM CODE
          </label>
          <input
            id="room-code"
            name="room"
            placeholder="Enter your friend’s code"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            pattern="[A-Za-z0-9\-]{1,12}"
            title="Use 1–12 letters, numbers, or hyphens."
            aria-describedby="join-room-note"
            required
          />
          <p id="join-room-note" className="entry-note">
            Joining friends uses their room’s arena and bot difficulty.
          </p>
          <button id="join-submit" className="play-button" type="submit">
            <span>Join room</span>
            <span aria-hidden="true">↗</span>
          </button>
          <button
            id="join-room-cancel"
            className="outline-button"
            type="button"
          >
            Cancel
          </button>
        </form>
      </dialog>
      <div id="hud" className="hud" hidden>
        <div
          id="sniper-scope"
          className="sniper-scope"
          hidden
          aria-hidden="true"
        >
          <div className="scope-lens">
            <i className="scope-line scope-line-horizontal"></i>
            <i className="scope-line scope-line-vertical"></i>
            <i className="scope-dot"></i>
          </div>
        </div>
        <div className="hud-top">
          <div className="session-block">
            <div className="hud-brand">
              <span id="room-label">OPEN ARENA</span>
            </div>
            <div className="match-info">
              <span className="eyebrow" id="hud-mode">
                FREE-FOR-ALL
              </span>
              <div className="match-numbers">
                <strong id="match-time">5:00</strong>
                <span className="match-players">
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    aria-hidden="true"
                  >
                    <circle cx="10" cy="6" r="3" />
                    <path d="M4 17v-2a6 6 0 0 1 12 0v2" />
                  </svg>
                  <span id="player-count">1 / 6</span>
                </span>
              </div>
              <span id="bot-count" className="bot-count" hidden></span>
            </div>
            <div id="hud-zones" className="hud-zones" hidden></div>
          </div>
          <div className="network-info">
            <div>
              <span id="ping">— ms</span>
              <span id="fps">— fps</span>
            </div>
            <span className="menu-hint">
              <kbd>ESC</kbd> Menu
            </span>
          </div>
        </div>
        <div id="kill-feed" className="kill-feed" aria-live="polite"></div>
        <div id="crosshair" className="crosshair" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div
          id="damage-flash"
          className="damage-flash"
          aria-hidden="true"
        ></div>
        <div
          id="damage-direction"
          className="damage-direction"
          hidden
          aria-hidden="true"
        ></div>
        <div className="hud-bottom">
          <div className="hud-left">
            <div className="hud-notices">
              <div className="death-notice" id="death-notice" hidden>
                <span className="eyebrow">BACK IN THE FIGHT</span>
                <strong id="respawn-count">2</strong>
                <p>Keep your momentum.</p>
              </div>
              <div className="toast" id="toast" role="status"></div>
              <div id="interact-hint" className="interact-hint" hidden>
                <kbd>E</kbd>
                <span id="interact-action">Ride rope</span>
              </div>
            </div>
            <div className="vitals-block">
              <div
                id="health-block"
                className="health-block"
                data-health="healthy"
              >
                <div className="health-heading">
                  <span className="hud-caption">YOUR HEALTH</span>
                  <span
                    id="health-status"
                    className="health-status"
                    aria-hidden="true"
                  ></span>
                </div>
                <div className="health-number">
                  <span aria-hidden="true">+</span>
                  <strong id="health">100</strong>
                  <span className="health-max">/ 100 HP</span>
                </div>
                <div
                  id="health-meter"
                  className="health-track"
                  role="meter"
                  aria-label="Your health"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={100}
                >
                  <div id="health-trail" aria-hidden="true"></div>
                  <div id="health-fill"></div>
                </div>
              </div>
              <div className="movement-block">
                <span id="movement-state">GROUNDED</span>
                <div>
                  <strong id="speed">0</strong>
                  <small>M/S</small>
                </div>
              </div>
            </div>
          </div>
          <div
            id="ability-block"
            className="ability-block"
            data-ready="true"
            data-state="ready"
            data-power="blast-pop"
            role="group"
            aria-label="Blast Pop: ready. Press Q to aim."
          >
            <div className="ability-core" aria-hidden="true">
              <svg className="ability-ring" viewBox="0 0 80 80" fill="none">
                <circle className="ability-ring-track" cx="40" cy="40" r="35" />
                <circle
                  id="ability-fill"
                  cx="40"
                  cy="40"
                  r="35"
                  pathLength="100"
                  strokeDasharray="100"
                />
              </svg>
              <div className="ability-emblem">
                <svg
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <g data-power-icon="blast-pop">
                    <ellipse cx="16" cy="19" rx="8" ry="4" />
                    <path d="M8 19v4c0 5 16 5 16 0v-4M16 3v5M5 8l4 4M27 8l-4 4M3 17h2M27 17h2" />
                    <path d="m14 15 2-4 2 4" />
                  </g>
                  <g data-power-icon="echo">
                    <path d="M13 6h-3a5 5 0 0 0-5 5v4M5 19l-2 6h5M23 6h3M27 11h2M27 17h2M26 23h3" />
                    <circle cx="17" cy="11" r="5" />
                    <path d="M9 27v-3a8 8 0 0 1 16 0v3Z" />
                  </g>
                  <g data-power-icon="air-juke">
                    <path d="m15 5 10 11-10 11M7 5l10 11L7 27M2 12h5M2 20h5" />
                  </g>
                  <g data-power-icon="bulwark">
                    <path d="m16 3 11 4v8c0 7-7 12-11 14C12 27 5 22 5 15V7Z" />
                    <path d="M16 8v15M10 13h12" />
                  </g>
                </svg>
              </div>
              <strong
                id="ability-countdown"
                className="ability-countdown"
              ></strong>
              <kbd className="ability-key">Q</kbd>
            </div>
            <span id="ability-name" className="ability-name">
              Blast Pop
            </span>
            <strong id="ability-status" className="ability-status">
              READY
            </strong>
            <small id="ability-hint" className="ability-hint">
              PRESS Q TO AIM
            </small>
          </div>
          <div className="weapon-block">
            <span id="hit-marker" className="hit-marker" aria-hidden="true">
              HIT
            </span>
            <span id="class-name" className="weapon-class">
              ASSAULT
            </span>
            <span className="hud-caption">
              <span id="weapon-name">AR-01</span>
              <span>
                {' '}
                / <span id="weapon-mode">AUTO</span>
              </span>
            </span>
            <div className="ammo">
              <strong id="ammo">24</strong>
              <span>
                / <span id="ammo-max">24</span>
              </span>
            </div>
            <span id="reload-hint">
              <kbd>R</kbd> RELOAD
            </span>
          </div>
        </div>
      </div>
      <section
        id="pause"
        className="overlay"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <div className="menu-panel">
          <div className="panel-heading">
            <span className="eyebrow">MATCH IN PROGRESS</span>
            <span className="pause-shortcut">
              <kbd>ESC</kbd> Menu
            </span>
          </div>
          <h2 id="pause-title">
            Arena <em>menu.</em>
          </h2>
          <p className="room-chip" id="pause-room"></p>
          <p className="pause-bots" id="pause-bots"></p>
          <button id="resume" className="play-button">
            <span>Back to the arena</span>
            <span aria-hidden="true">↗</span>
          </button>
          <button id="leave" className="outline-button arena-exit">
            <span>
              Change arena<small>Leave room &amp; choose a map</small>
            </span>
            <span aria-hidden="true">←</span>
          </button>
          <p id="capture-note" className="capture-note" hidden></p>
          <details id="class-menu" className="class-menu">
            <summary>
              Change class <span aria-hidden="true">+</span>
            </summary>
            <fieldset className="class-picker">
              <legend>NEXT SPAWN</legend>
              <div id="pause-classes" className="class-options"></div>
            </fieldset>
            <p
              id="pause-power-description"
              className="power-description"
              aria-live="polite"
            ></p>
          </details>
          <p
            id="class-status"
            className="class-status"
            role="status"
            aria-live="polite"
          ></p>
          <button id="copy-link" className="outline-button">
            <span id="copy-link-label">Copy invite link</span>
            <span aria-hidden="true">↗</span>
          </button>
          <p id="menu-status" className="menu-status" role="status"></p>
          <p className="muted" id="warmup-tip">
            Warm up on the orange targets. Copy an invite link to bring friends.
          </p>
          <div className="menu-links">
            <button id="pause-settings" className="text-button">
              Settings &amp; controls <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="muted">The match continues while this menu is open.</p>
        </div>
      </section>
      <section
        id="settings"
        className="overlay"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-panel">
          <div className="panel-heading">
            <span className="eyebrow">SETTINGS & CONTROLS</span>
            <button
              id="settings-close"
              className="icon-button"
              aria-label="Close settings"
            >
              ×
            </button>
          </div>
          <h2 id="settings-title">Your setup.</h2>
          <p className="panel-intro">Make every move feel right.</p>
          <div className="settings-group">
            <h3>Feel</h3>
            <div className="setting">
              <label htmlFor="sensitivity">Mouse sensitivity</label>
              <output id="sensitivity-value" htmlFor="sensitivity">
                1.0
              </output>
            </div>
            <input
              type="range"
              id="sensitivity"
              aria-label="Mouse sensitivity"
              min="0.2"
              max="2"
              step="0.1"
              defaultValue="1"
            />
            <div className="range-labels">
              <span>Precise</span>
              <span>Fast</span>
            </div>
            <div className="setting">
              <label htmlFor="sound">Game sound</label>
              <input id="sound" type="checkbox" defaultChecked />
            </div>
            <div className="setting">
              <label htmlFor="motion">
                Camera motion
                <span className="setting-help">
                  Head bob and movement effects
                </span>
              </label>
              <input id="motion" type="checkbox" defaultChecked />
            </div>
          </div>
          <div className="settings-group">
            <h3>Performance</h3>
            <div className="setting">
              <label htmlFor="quality">Render quality</label>
              <select id="quality">
                <option value="balanced">Balanced</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="settings-group">
            <h3>Controls</h3>
            <div className="key-guide">
              <span>
                Move <kbd>W A S D</kbd>
              </span>
              <span>
                Look <kbd>MOUSE</kbd>
              </span>
              <span>
                Sprint <kbd>SHIFT</kbd>
              </span>
              <span>
                Toggle slide / crouch <kbd>C</kbd>
              </span>
              <span>
                Hold slide / crouch <kbd>CTRL</kbd>
              </span>
              <span>
                Jump / mantle <kbd>SPACE</kbd>
              </span>
              <span>
                Fire / aim <kbd>LMB / RMB</kbd>
              </span>
              <span>
                Reload <kbd>R</kbd>
              </span>
              <span>
                Other powers <kbd>Q</kbd>
              </span>
              <span>
                Ride / release rope <kbd>E</kbd>
              </span>
              <span>
                Scoreboard <kbd>TAB</kbd>
              </span>
              <span>
                Blast Pop aim <kbd>Q</kbd>
              </span>
              <span>
                Blast Pop throw <kbd>LMB</kbd>
              </span>
              <span>
                Blast Pop cancel <kbd>RMB</kbd>
              </span>
            </div>
          </div>
          <p className="movement-tip">
            <span aria-hidden="true">↗</span> Sprint, tap C to slide, then Space
            to jump with momentum. Tap C again to exit, or hold Ctrl for manual
            crouch/slide. Use E near a yellow rope to ride or release it. Space
            jumps off.
          </p>
        </div>
      </section>
      <section
        className="scoreboard overlay"
        id="scoreboard"
        hidden
        aria-labelledby="scoreboard-title"
      >
        <div className="score-panel">
          <div className="panel-heading">
            <span className="eyebrow" id="score-map">
              FREE-FOR-ALL
            </span>
            <span className="team-score" id="score-teams" hidden></span>
            <kbd>TAB</kbd>
          </div>
          <h2 id="scoreboard-title">The lineup.</h2>
          <table>
            <thead>
              <tr>
                <th>PLAYER</th>
                <th id="score-team-header" hidden>
                  TEAM
                </th>
                <th>KILLS</th>
                <th>DEATHS</th>
              </tr>
            </thead>
            <tbody id="score-rows"></tbody>
          </table>
          <p className="muted">Release Tab to get back to the action.</p>
        </div>
      </section>
      <div id="unsupported" className="overlay" hidden>
        <div className="menu-panel">
          <h2>
            A desktop
            <br />
            kind of game.
          </h2>
          <p id="unsupported-message">
            Open DRIFT in a desktop browser with a keyboard and mouse.
          </p>
        </div>
      </div>
    </>
  );
}
