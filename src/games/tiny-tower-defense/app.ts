import type { TowerType, Tower, Enemy } from './engine.ts';
import { isTowerType } from './engine.ts';
type Paint = string | CanvasGradient | CanvasPattern;
type GameElements = {
  'guide-button': HTMLButtonElement;
  speed: HTMLButtonElement;
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  field: HTMLCanvasElement;
  start: HTMLButtonElement;
  'send-wave': HTMLButtonElement;
  plant: HTMLButtonElement;
  upgrade: HTMLButtonElement;
  sell: HTMLButtonElement;
};
import {
  WIDTH,
  HEIGHT,
  PATH,
  PLOTS,
  TOWERS,
  BUGS,
  WAVE_NAMES,
  MAX_WAVES,
  createGame,
  towerStats,
  upgradeCost,
  sellValue,
  buildTower,
  upgradeTower,
  sellTower,
  startWave,
  stepGame,
  gameScore,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const $ = <K extends string>(id: K) =>
      scope.byId<K extends keyof GameElements ? GameElements[K] : HTMLElement>(
        id,
      );
    const canvas = $('field'),
      ctx = canvas.getContext('2d')!;
    const reducedMotion = matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    let state = createGame(),
      started = false,
      paused = false,
      speed = 1,
      selectedPlot: number | null = null,
      hoveredPlot: number | null = null,
      selectedType: TowerType = 'pea',
      previousTime = performance.now(),
      lastHUD = '';
    let best = 0;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem('garden-guard-best') ?? 'null',
      );
      if (typeof saved === 'number' && Number.isFinite(saved) && saved >= 0)
        best = saved;
    } catch {
      /* Storage is optional. */
    }
    $('best').textContent = best.toLocaleString();
    const packetArt = {
      pea: '<path d="M32 50V28M31 43C13 43 11 28 29 34" fill="#71a55a" stroke="#43663a" stroke-width="2"/><circle cx="34" cy="22" r="15" fill="#7aa85b" stroke="#43663a" stroke-width="2"/><path d="M44 17h12v12H43" fill="#88b766" stroke="#43663a" stroke-width="2"/><ellipse cx="55" cy="23" rx="4" ry="6" fill="#365b39"/><circle cx="34" cy="18" r="2" fill="#293d2c"/><path d="M19 45h29l-5 15H24Z" fill="#c38462" stroke="#805b44" stroke-width="2"/>',
      acorn:
        '<path d="m21 37 14-19 17 13-14 20Z" fill="#b7854b" stroke="#6c543a" stroke-width="2"/><ellipse cx="43" cy="25" rx="11" ry="7" transform="rotate(37 43 25)" fill="#594a36"/><path d="M17 45Q32 30 49 45v10H17Z" fill="#876746" stroke="#594a36" stroke-width="2"/><path d="m20 47 5 6 6-8 6 8 6-6" fill="none" stroke="#b49364" stroke-width="2"/><path d="M33 53v8" stroke="#594a36" stroke-width="3"/>',
      dew: '<path d="M30 12h7v13c15 12 18 27-4 31C10 53 16 35 30 25Z" fill="#92bec6" stroke="#497982" stroke-width="2"/><path d="M21 42q12 7 23 0" fill="none" stroke="#d6eff0" stroke-width="3"/><path d="M26 13h16M35 11V6M45 19l7-3M49 28l8 1" stroke="#497982" stroke-width="3" stroke-linecap="round"/><path d="M18 56h30" stroke="#805b44" stroke-width="5"/>',
    };
    root.querySelectorAll<HTMLElement>('[data-art]').forEach((node) => {
      const type = node.dataset.art;
      if (!type || !isTowerType(type)) return;
      node.innerHTML = `<svg viewBox="0 0 68 66" aria-hidden="true">${packetArt[type]}</svg>`;
    });
    const plotButtons = PLOTS.map((plot, index) => {
      const button = document.createElement('button');
      button.className = 'plot-button';
      button.textContent = String.fromCharCode(65 + index);
      button.style.left = `clamp(22px, ${(plot.x / WIDTH) * 100}%, calc(100% - 22px))`;
      button.style.top = `clamp(22px, ${(plot.y / HEIGHT) * 100}%, calc(100% - 22px))`;
      button.setAttribute('aria-label', `${plot.name}, empty build plot`);
      scope.listen(button, 'click', () => {
        if (!manageable()) return;
        selectedPlot = index;
        updateUI(true);
      });
      scope.listen(button, 'pointerenter', () => {
        hoveredPlot = index;
      });
      scope.listen(button, 'pointerleave', () => {
        hoveredPlot = null;
      });
      scope.listen(button, 'focus', () => {
        hoveredPlot = index;
      });
      scope.listen(button, 'blur', () => {
        hoveredPlot = null;
      });
      scope.listen(button, 'keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        const offset = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        plotButtons[(index + offset + PLOTS.length) % PLOTS.length].focus();
      });
      $('plots').append(button);
      return button;
    });
    function manageable() {
      return started && !paused && ['planning', 'wave'].includes(state.phase);
    }
    function tell(message: string) {
      $('status').textContent = message;
    }
    function plantedFeedback() {
      if (reducedMotion || selectedPlot === null) return;
      plotButtons[selectedPlot].animate(
        [
          { transform: 'translate(-50%,-50%) scale(1.22)' },
          { transform: 'translate(-50%,-50%) scale(1)' },
        ],
        { duration: 330, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
    function updateUI(force = false) {
      const signature = [
        state.sun,
        state.hearts,
        state.wave,
        state.phase,
        state.enemies.length + state.queue.length,
        started,
        paused,
        speed,
        selectedPlot,
        selectedType,
        ...state.towers.map((tower) => `${tower.plot}:${tower.level}`),
      ].join('|');
      if (!force && signature === lastHUD) return;
      lastHUD = signature;
      $('sun').textContent = String(state.sun);
      $('hearts').textContent = String(state.hearts);
      $('wave-count').textContent = `${state.wave} / ${MAX_WAVES}`;
      $('speed').textContent = `${speed}×`;
      $('speed').setAttribute(
        'aria-label',
        `Game speed ${speed} times. Change to ${speed === 1 ? 2 : 1} times`,
      );
      $('speed').disabled = !manageable();
      $('pause').disabled = !started || ['won', 'lost'].includes(state.phase);
      $('pause').innerHTML = paused
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
      $('pause').setAttribute(
        'aria-label',
        paused ? 'Resume game' : 'Pause game',
      );
      $('restart').disabled = !started;
      $('send-wave').disabled = !manageable() || state.phase !== 'planning';
      const terminal = ['won', 'lost'].includes(state.phase);
      $('send-wave').innerHTML = terminal
        ? 'Watch complete'
        : state.phase === 'wave'
          ? `${state.enemies.length + state.queue.length} bugs left`
          : `Send wave ${Math.min(state.wave + 1, MAX_WAVES)} <span>→</span>`;
      $('wave-status').textContent = terminal
        ? 'THE WATCH IS OVER'
        : state.phase === 'wave'
          ? `WAVE ${state.wave} IS ON THE MOVE`
          : state.wave
            ? 'TAKE A BREATH. TEND YOUR DEFENDERS.'
            : 'A QUIET MOMENT, FOR NOW';
      $('wave-name').textContent = terminal
        ? state.phase === 'won'
          ? 'The greenhouse is safe.'
          : 'The bugs made it to the picnic.'
        : state.phase === 'wave'
          ? WAVE_NAMES[state.wave - 1]
          : `Up next: ${WAVE_NAMES[state.wave]}.`;
      plotButtons.forEach((button, index) => {
        const tower = state.towers.find((item) => item.plot === index);
        button.disabled = !manageable();
        button.classList.toggle('selected', index === selectedPlot);
        button.classList.toggle('occupied', Boolean(tower));
        button.setAttribute(
          'aria-pressed',
          index === selectedPlot ? 'true' : 'false',
        );
        button.setAttribute(
          'aria-label',
          `${PLOTS[index].name}, ${tower ? `${TOWERS[tower.type].name}, level ${tower.level}` : 'empty build plot'}`,
        );
        button.innerHTML = tower
          ? `<span class="tower-level" aria-hidden="true">${tower.level}</span>`
          : String.fromCharCode(65 + index);
      });
      root
        .querySelectorAll<HTMLButtonElement>('[data-type]')
        .forEach((button) => {
          button.classList.toggle(
            'selected',
            button.dataset.type === selectedType,
          );
          button.setAttribute(
            'aria-pressed',
            String(button.dataset.type === selectedType),
          );
          button.disabled = started && !manageable();
        });
      const tower = state.towers.find((item) => item.plot === selectedPlot),
        base = TOWERS[selectedType];
      const stats = tower ? towerStats(tower) : base;
      $('plot-label').textContent =
        selectedPlot === null
          ? 'A HOME FOR YOUR DEFENDER'
          : PLOTS[selectedPlot].name.toUpperCase();
      $('inspector-title').textContent =
        selectedPlot === null
          ? 'Choose a little plot.'
          : tower
            ? `${stats.name} · ${tower.level === 3 ? 'max level' : `level ${tower.level}`}`
            : `Plant a ${base.name}?`;
      $('inspector-description').textContent =
        selectedPlot === null
          ? 'Tap a letter on the map to preview your defender’s reach.'
          : stats.description;
      $('tower-stats').innerHTML =
        selectedPlot === null
          ? ''
          : `<span><strong>${stats.damage}</strong>damage</span><span><strong>${Math.round(stats.range)}</strong>range</span><span><strong>${stats.rate.toFixed(1)}s</strong>per shot</span>`;
      $('plant').hidden = Boolean(tower);
      $('plant').textContent = `Plant ${base.name} · ${base.cost}`;
      $('plant').disabled =
        !manageable() || selectedPlot === null || state.sun < base.cost;
      $('upgrade').hidden = !tower;
      $('sell').hidden = !tower;
      if (tower) {
        $('upgrade').textContent =
          tower.level === 3
            ? 'Fully grown · level 3'
            : `Upgrade · ${upgradeCost(tower)}`;
        $('upgrade').disabled =
          !manageable() || tower.level === 3 || state.sun < upgradeCost(tower);
        $('sell').textContent = `Sell · +${sellValue(tower)} sunlight`;
        $('sell').disabled = !manageable();
      }
      const cost = tower ? upgradeCost(tower) : base.cost;
      $('economy-note').textContent =
        tower && tower.level === 3
          ? 'Fully grown. Selling returns 70% of all sunlight spent.'
          : selectedPlot !== null && state.sun < cost
            ? `You need ${cost - state.sun} more sunlight. Defeat bugs or sell a defender.`
            : tower
              ? 'Upgrades increase damage, range, and firing speed.'
              : 'Defeat bugs for sunlight. Finish a wave for a bonus.';
    }
    function selectType(type: string | undefined) {
      if (!type || !isTowerType(type)) return;
      selectedType = type;
      updateUI(true);
    }
    root
      .querySelectorAll<HTMLButtonElement>('[data-type]')
      .forEach((button) =>
        scope.listen(button, 'click', () => selectType(button.dataset.type)),
      );
    scope.listen($('plant'), 'click', () => {
      if (
        manageable() &&
        selectedPlot !== null &&
        buildTower(state, selectedPlot, selectedType)
      ) {
        tell(
          `${TOWERS[selectedType].name} planted at ${PLOTS[selectedPlot].name}.`,
        );
        updateUI(true);
        plantedFeedback();
      }
    });
    scope.listen($('upgrade'), 'click', () => {
      if (
        manageable() &&
        selectedPlot !== null &&
        upgradeTower(state, selectedPlot)
      ) {
        tell('A little sunlight, a stronger defender. Upgrade complete.');
        updateUI(true);
        plantedFeedback();
      }
    });
    scope.listen($('sell'), 'click', () => {
      if (
        manageable() &&
        selectedPlot !== null &&
        sellTower(state, selectedPlot)
      ) {
        tell(
          'Defender returned to the nursery. 70% of its investment is back.',
        );
        updateUI(true);
      }
    });
    scope.listen($('send-wave'), 'click', () => {
      if (manageable() && startWave(state)) {
        tell(
          `Wave ${state.wave}: ${WAVE_NAMES[state.wave - 1]}. Your defenders attack automatically.`,
        );
        updateUI(true);
      }
    });
    scope.listen($('speed'), 'click', () => {
      if (manageable()) {
        speed = speed === 1 ? 2 : 1;
        updateUI(true);
      }
    });
    scope.listen($('pause'), 'click', togglePause);
    scope.listen($('restart'), 'click', restart);
    scope.listen($('guide-button'), 'click', () => {
      const show = $('guide').hidden;
      $('guide').hidden = !show;
      $('guide-button').setAttribute('aria-expanded', String(show));
    });
    scope.listen($('cover'), 'click', (event) => {
      if (
        (event.target instanceof Element ? event.target : null)?.closest(
          '#start, #play-again',
        )
      )
        restart();
      if (
        (event.target instanceof Element ? event.target : null)?.closest(
          '#resume',
        )
      )
        togglePause();
    });
    function restart() {
      state = createGame();
      started = true;
      paused = false;
      speed = 1;
      selectedPlot = null;
      hoveredPlot = null;
      $('cover').hidden = true;
      tell(
        'Your watch begins with 150 sunlight. Choose a plot, plant defenders, then send the first wave.',
      );
      updateUI(true);
      plotButtons[0].focus({ preventScroll: true });
    }
    function togglePause() {
      if (!started || ['won', 'lost'].includes(state.phase)) return;
      paused = !paused;
      $('cover').hidden = !paused;
      if (paused) {
        $('cover').innerHTML =
          '<div class="welcome-sign"><h2>Gone to<br><em>smell the roses.</em></h2><p>Your garden will wait right here.</p><button id="resume" class="primary-button">Back to the garden →</button></div>';
        $('resume').focus({ preventScroll: true });
      }
      updateUI(true);
      if (!paused)
        plotButtons[selectedPlot ?? 0].focus({ preventScroll: true });
    }
    function finish() {
      const score = gameScore(state),
        won = state.phase === 'won';
      if (score > best) {
        best = score;
        try {
          localStorage.setItem('garden-guard-best', JSON.stringify(best));
        } catch {
          /* Private browsing stays playable. */
        }
        $('best').textContent = best.toLocaleString();
      }
      $('cover').hidden = false;
      $('cover').innerHTML =
        `<div class="welcome-sign result-sign"><h2>${won ? 'Small crew.<br><em>Big victory.</em>' : 'The bugs found<br><em>the picnic.</em>'}</h2><p>${won ? 'Seven waves weathered. Your greenhouse is safe.' : 'Every garden guard starts somewhere. Try covering more bends in the path.'}</p><div class="results-numbers"><span><strong>${score.toLocaleString()}</strong>points</span><span><strong>${state.kills}</strong>bugs stopped</span><span><strong>${won ? 7 : Math.max(0, state.wave - 1)}</strong>waves cleared</span></div><button id="play-again" class="primary-button">Plant a fresh defense →</button></div>`;
      tell(
        won
          ? `Victory! You protected ${state.hearts} garden hearts and earned ${score} points.`
          : `Garden overrun on wave ${state.wave}. You earned ${score} points.`,
      );
      updateUI(true);
      $('play-again').focus({ preventScroll: true });
    }
    scope.listen(document, 'keydown', (event) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        /INPUT|TEXTAREA|SELECT/.test(
          event.target instanceof Element ? event.target.tagName : '',
        )
      )
        return;
      if (event.code === 'KeyP') {
        event.preventDefault();
        togglePause();
      }
      if (['1', '2', '3'].includes(event.key) && manageable()) {
        selectType(['pea', 'acorn', 'dew'][Number(event.key) - 1]);
      }
      if (event.key === 'Escape') {
        selectedPlot = null;
        hoveredPlot = null;
        updateUI(true);
      }
    });
    scope.listen(document, 'visibilitychange', () => {
      if (
        document.hidden &&
        started &&
        !paused &&
        !['won', 'lost'].includes(state.phase)
      )
        togglePause();
    });
    function ellipse(
      x: number,
      y: number,
      rx: number,
      ry: number,
      color: Paint,
      rotation = 0,
    ) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    function shadedEllipse(
      x: number,
      y: number,
      rx: number,
      ry: number,
      light: string,
      dark: string,
      rotation = 0,
    ) {
      const shade = ctx.createRadialGradient(
        x - rx * 0.35,
        y - ry * 0.45,
        1,
        x,
        y,
        rx * 1.3,
      );
      shade.addColorStop(0, light);
      shade.addColorStop(1, dark);
      ellipse(x, y, rx, ry, shade, rotation);
    }
    function line(points: number[][], color: Paint, width: number) {
      ctx.beginPath();
      points.forEach(([x, y], index) =>
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    function leaf(x: number, y: number, scale = 1, color = '#789957') {
      ellipse(x, y, 9 * scale, 4 * scale, color, -0.5);
      ellipse(x + 9 * scale, y + 2 * scale, 8 * scale, 4 * scale, color, 0.65);
    }
    function flower(x: number, y: number, color = '#f3dbae', size = 1) {
      for (let n = 0; n < 5; n++) {
        const angle = (n / 5) * Math.PI * 2;
        ellipse(
          x + Math.cos(angle) * 4 * size,
          y + Math.sin(angle) * 4 * size,
          3 * size,
          3 * size,
          color,
        );
      }
      ellipse(x, y, 2 * size, 2 * size, '#b78e52');
    }
    const scenery = document.createElement('canvas');
    scenery.width = WIDTH * dpr;
    scenery.height = HEIGHT * dpr;
    function background() {
      ctx.fillStyle = '#7fbb56';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ellipse(85, 420, 142, 135, '#9dcb69');
      ellipse(586, 75, 192, 110, '#74a945');
      ellipse(393, 502, 160, 70, '#8ebd55');
      // A winding gravel path stays readable under every defender and bug.
      line(PATH, '#4f853c', 76);
      line(PATH, '#b4a360', 70);
      line(PATH, '#a87543', 64);
      line(PATH, '#e1bb76', 59);
      line(PATH, '#f2d293', 44);
      for (let i = 0; i < PATH.length - 1; i++) {
        const [x1, y1] = PATH[i],
          [x2, y2] = PATH[i + 1],
          length = Math.hypot(x2 - x1, y2 - y1);
        for (let n = 0; n < length; n += 13) {
          const offset = Math.sin(n * 1.8 + i) * 18;
          const x =
              x1 + ((x2 - x1) * n) / length - ((y2 - y1) / length) * offset,
            y = y1 + ((y2 - y1) * n) / length + ((x2 - x1) / length) * offset;
          ellipse(x, y, 1.1 + (n % 3) * 0.3, 0.7, '#c8ad7b75');
        }
      }
      for (let n = 0; n < 115; n++) {
        const x = (n * 173 + 43) % WIDTH,
          y = (n * 97 + 28) % HEIGHT;
        ellipse(x, y, 1.2, 0.8, '#589943');
      }
      const shrub = (x: number, y: number, size = 1) => {
        ellipse(x, y + 7 * size, 28 * size, 10 * size, '#3e783b');
        shadedEllipse(
          x - 12 * size,
          y,
          20 * size,
          17 * size,
          '#74ac47',
          '#315e2d',
        );
        shadedEllipse(
          x + 9 * size,
          y - 9 * size,
          23 * size,
          22 * size,
          '#a7cf62',
          '#4b8a39',
        );
        shadedEllipse(
          x + 25 * size,
          y + 1 * size,
          15 * size,
          16 * size,
          '#89bd54',
          '#346e2e',
        );
        leaf(x - 2 * size, y - 14 * size, 0.7 * size, '#a0b879');
      };
      [
        [22, 28, 1.4],
        [340, 36, 1.4],
        [412, 47, 1.2],
        [752, 46, 1.5],
        [39, 316, 1.5],
        [34, 506, 1.5],
        [129, 508, 1.2],
        [463, 518, 1.5],
        [551, 539, 1],
      ].forEach((args) => shrub(args[0], args[1], args[2]));
      [
        [55, 53],
        [72, 340],
        [373, 44],
        [731, 60],
        [749, 95],
        [62, 468],
        [443, 500],
        [647, 32],
        [397, 432],
      ].forEach(([x, y], index) => {
        leaf(x, y + 8, 0.8);
        flower(x, y, index % 2 ? '#f1c6a0' : '#faf1c9', 1.1);
        flower(x + 14, y + 5, '#f2e5bd', 0.8);
      });
      // Pond, vegetable bed, burrow, and greenhouse are original vector scenery.
      ellipse(100, 395, 52, 29, '#9aac82', -0.13);
      shadedEllipse(100, 391, 47, 24, '#bedbca', '#689ba1', -0.13);
      ellipse(94, 388, 36, 15, '#a3c1bb', -0.13);
      ellipse(120, 386, 10, 6, '#6c966b');
      flower(120, 382, '#ecd7c9', 0.7);
      ctx.save();
      ctx.translate(329, 120);
      ctx.rotate(-0.05);
      ctx.fillStyle = '#a28b5d';
      ctx.fillRect(-42, -25, 84, 50);
      ctx.fillStyle = '#826d4d';
      ctx.fillRect(-36, -19, 72, 38);
      for (let x = -25; x < 35; x += 20)
        for (let y = -10; y < 20; y += 20) leaf(x, y, 0.9, '#7b9c55');
      ctx.restore();
      ellipse(5, 128, 37, 35, '#9c9167');
      ellipse(5, 130, 25, 24, '#605840');
      ellipse(1, 138, 20, 14, '#514a36');
      ctx.save();
      ctx.translate(755, 506);
      ctx.fillStyle = '#597b64';
      ctx.fillRect(-33, -31, 66, 43);
      ctx.fillStyle = '#b7d0bd';
      ctx.fillRect(-27, -26, 54, 33);
      line(
        [
          [-35, -32],
          [0, -57],
          [35, -32],
        ],
        '#f0e7cf',
        7,
      );
      line(
        [
          [-29, -29],
          [29, -29],
        ],
        '#f0e7cf',
        4,
      );
      line(
        [
          [0, -47],
          [0, 10],
        ],
        '#eef0d4',
        4,
      );
      line(
        [
          [-28, -10],
          [28, -10],
        ],
        '#eef0d4',
        3,
      );
      line(
        [
          [-28, 11],
          [28, 11],
        ],
        '#526d51',
        5,
      );
      flower(17, 1, '#e6b076', 0.7);
      ctx.restore();
      ctx.font = 'bold 10px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#315332';
      ctx.fillText('BUG BURROW', 55, 84);
      ctx.fillText('THE GREENHOUSE', 730, 551);
      for (const [i, plot] of PLOTS.entries()) {
        ellipse(plot.x, plot.y + 7, 31, 23, '#6b844a45');
        shadedEllipse(plot.x, plot.y + 3, 27, 20, '#ceb286', '#937048');
        ellipse(plot.x, plot.y + 2, 22, 15, '#cc9f62');
        for (let n = 0; n < 13; n++) {
          const a = n * 2.4 + i,
            r = 5 + (n % 5) * 3;
          ellipse(
            plot.x + Math.cos(a) * r,
            plot.y + 2 + Math.sin(a) * r * 0.6,
            1.3,
            0.9,
            '#7e5e3966',
          );
        }
      }
      scenery.getContext('2d')!.drawImage(canvas, 0, 0);
    }
    background();
    function drawTower(tower: Tower) {
      const point = PLOTS[tower.plot];
      ctx.save();
      ctx.translate(point.x, point.y);
      ellipse(0, 17, 26, 10, '#6c7c5266');
      const pot = ctx.createLinearGradient(-17, 0, 17, 0);
      pot.addColorStop(0, '#a46946');
      pot.addColorStop(0.35, '#dfac7b');
      pot.addColorStop(1, '#9b6340');
      ctx.fillStyle = pot;
      ctx.beginPath();
      ctx.moveTo(-17, 9);
      ctx.lineTo(17, 9);
      ctx.lineTo(12, 27);
      ctx.lineTo(-12, 27);
      ctx.closePath();
      ctx.fill();
      line(
        [
          [-17, 9],
          [17, 9],
        ],
        '#ad7551',
        5,
      );
      line(
        [
          [-16, 7],
          [16, 7],
        ],
        '#ebbc87',
        1.5,
      );
      const recoil = reducedMotion
        ? 0
        : Math.max(0, 1 - (towerStats(tower).rate - tower.cooldown) / 0.12) * 2;
      ctx.translate(
        -Math.cos(tower.angle) * recoil,
        -Math.sin(tower.angle) * recoil,
      );
      if (tower.type === 'pea') {
        line(
          [
            [0, 9],
            [0, -9],
          ],
          '#4d763f',
          7,
        );
        leaf(-13, 2, 1, '#749e4d');
        ctx.translate(0, -13);
        ctx.rotate(tower.angle);
        shadedEllipse(0, 0, 16, 16, '#b6d57d', '#4f813c');
        line(
          [
            [7, 0],
            [23, 0],
          ],
          '#68984b',
          15,
        );
        line(
          [
            [9, -4],
            [22, -4],
          ],
          '#a0c569',
          3,
        );
        ellipse(24, 0, 4, 8, '#2c5631');
        ellipse(25, -2, 1, 4, '#618b44');
        ellipse(2, -8, 2.5, 2.5, '#2f4b2c');
      } else if (tower.type === 'acorn') {
        shadedEllipse(0, 1, 23, 18, '#b99561', '#6b4b2f');
        ctx.rotate(tower.angle);
        line(
          [
            [0, -3],
            [21, -3],
          ],
          '#ae8150',
          20,
        );
        ellipse(23, -3, 5, 10, '#554732');
        ellipse(-5, -4, 9, 15, '#735a3d');
      } else {
        shadedEllipse(0, -4, 17, 19, '#c2e2dc', '#528992');
        ellipse(-5, -8, 4, 9, '#bdd8d5', 0.25);
        line(
          [
            [0, -18],
            [0, -29],
          ],
          '#557f81',
          6,
        );
        line(
          [
            [-10, -27],
            [10, -27],
          ],
          '#527a7c',
          4,
        );
        ellipse(0, -28, 4, 4, '#d8e8d3');
        leaf(4, 13, 0.8, '#5e8b5c');
      }
      ctx.restore();
    }
    function drawBug(enemy: Enemy, now: number) {
      const size =
        enemy.type === 'snail' ? 1.5 : enemy.type === 'beetle' ? 1.2 : 1;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ellipse(0, 5, 13 * size, 6 * size, '#76694f36');
      ctx.rotate(enemy.angle);
      ctx.scale(size, size);
      const swing =
        reducedMotion || paused ? 0 : Math.sin(now * 0.017 + enemy.id) * 2;
      if (enemy.type === 'snail') {
        ellipse(0, 3, 16, 7, '#a49a65');
        shadedEllipse(1, -3, 12, 12, '#e1b780', '#9c6b43');
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.1) {
          const r = a * 0.6;
          ctx.lineTo(1 + Math.cos(a) * r, -3 + Math.sin(a) * r);
        }
        ctx.strokeStyle = '#795e40';
        ctx.lineWidth = 2;
        ctx.stroke();
        line(
          [
            [11, -1],
            [17, -8],
          ],
          '#807a52',
          2,
        );
        ellipse(17, -8, 2, 2, '#374333');
      } else {
        for (const side of [-1, 1])
          for (let n = -1; n <= 1; n++)
            line(
              [
                [n * 5, side * 4],
                [n * 6 + swing, side * 10],
                [n * 7 - 3 + swing, side * 12],
              ],
              '#665947',
              1.5,
            );
        if (enemy.type === 'runner') {
          ellipse(-4, -5, 9, 5, '#b9d4c4bb', -0.3);
          ellipse(-4, 5, 9, 5, '#b9d4c4bb', 0.3);
        }
        shadedEllipse(
          -5,
          0,
          enemy.type === 'beetle' ? 12 : 9,
          enemy.type === 'beetle' ? 10 : 6,
          BUGS[enemy.type].color,
          enemy.type === 'beetle' ? '#523d51' : '#805137',
        );
        ellipse(6, 0, 6, 6, BUGS[enemy.type].color);
        ellipse(9, -2, 1.5, 1.5, '#343f31');
        if (enemy.type === 'beetle') {
          line(
            [
              [-15, 0],
              [2, 0],
            ],
            '#584b64',
            1.2,
          );
          ellipse(-7, -5, 2, 2, '#ad92a9');
          ellipse(-7, 5, 2, 2, '#ad92a9');
        }
        line(
          [
            [9, -3],
            [15, -7],
          ],
          '#665947',
          1,
        );
        line(
          [
            [9, 3],
            [15, 7],
          ],
          '#665947',
          1,
        );
      }
      ctx.restore();
      if (enemy.hp < enemy.maxHp) {
        ctx.fillStyle = '#536344';
        ctx.fillRect(enemy.x - 15, enemy.y - 22 * size, 30, 4);
        ctx.fillStyle = enemy.slowTimer > 0 ? '#8fc8d3' : '#eff0b0';
        ctx.fillRect(
          enemy.x - 14,
          enemy.y - 22 * size + 1,
          28 * Math.max(0, enemy.hp / enemy.maxHp),
          2,
        );
      }
    }
    function draw(now: number) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(scenery, 0, 0, WIDTH, HEIGHT);
      const preview = hoveredPlot ?? selectedPlot;
      if (preview !== null && manageable()) {
        const point = PLOTS[preview],
          tower = state.towers.find((item) => item.plot === preview),
          stats = tower ? towerStats(tower) : TOWERS[selectedType];
        ctx.beginPath();
        ctx.arc(point.x, point.y, stats.range, 0, Math.PI * 2);
        ctx.fillStyle = `${stats.color}18`;
        ctx.fill();
        ctx.strokeStyle = `${stats.color}aa`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      state.towers.forEach(drawTower);
      state.enemies.forEach((enemy) => drawBug(enemy, now));
      for (const projectile of state.projectiles) {
        const r = projectile.type === 'acorn' ? 6 : 4;
        shadedEllipse(
          projectile.x,
          projectile.y,
          r,
          projectile.type === 'dew' ? 6 : r,
          projectile.type === 'pea'
            ? '#d8e89b'
            : projectile.type === 'dew'
              ? '#dbf6ee'
              : '#dec08a',
          TOWERS[projectile.type].color,
        );
      }
      if (!reducedMotion)
        for (const effect of state.effects) {
          ctx.beginPath();
          ctx.arc(
            effect.x,
            effect.y,
            Math.max(1, (effect.radius * effect.age) / 0.4),
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = `${TOWERS[effect.type].color}${Math.round(
            (1 - effect.age / 0.4) * 140,
          )
            .toString(16)
            .padStart(2, '0')}`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
    }
    function animate(now: number) {
      const dt = Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      if (started && !paused && state.phase === 'wave') {
        const previousPhase = state.phase;
        stepGame(state, dt * speed);
        if (previousPhase !== state.phase) {
          if (['won', 'lost'].includes(state.phase)) finish();
          else
            tell(
              `Wave ${state.wave} cleared! ${30 + state.wave * 8} bonus sunlight. Plant or upgrade before the next wave.`,
            );
        }
      }
      draw(now);
      updateUI();
      scope.raf(animate);
    }
    updateUI(true);
    scope.raf(animate);
    const compactBench = matchMedia('(max-width: 899px), (max-height: 500px)');
    const bestStamp = root.querySelector<HTMLElement>('.best-stamp')!;
    function placeBestScore() {
      (compactBench.matches
        ? $('guide')
        : root.querySelector<HTMLElement>('.potting-bench')!
      ).append(bestStamp);
    }
    placeBestScore();
    scope.listen(compactBench, 'change', placeBestScore);
    scope.add(() => {
      for (const button of plotButtons) button.remove();
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
