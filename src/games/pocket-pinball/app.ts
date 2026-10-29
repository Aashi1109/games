import type { GameEvent, Point } from './engine.ts';
import {
  WIDTH,
  HEIGHT,
  BALL_RADIUS,
  BUMPERS,
  RAILS,
  SLINGS,
  TARGETS,
  createGame,
  launchBall,
  stepGame,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
      scope.byId<T>(id);
    const canvas = $<HTMLCanvasElement>('table');
    const ctx = canvas.getContext('2d')!;
    const reducedMotion = matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    let game = createGame();
    let started = false;
    let paused = false;
    let charge = 0;
    let charging = false;
    let lastTime = performance.now();
    let frame = 0;
    let lastUI = '';
    let message = '';
    let messageUntil = 0;
    let audioContext: AudioContext | null = null;
    let soundEnabled = false;
    let best = 0;
    let trail: Point[] = [];
    let floats: (Extract<GameEvent, { type: 'score' | 'orbit' }> & {
      life: number;
      big: boolean;
    })[] = [];
    const keys = new Set();
    const pointerHolds = { left: new Set(), right: new Set() };
    const buttonKeys = new Set();
    const pulses = { left: 0, right: 0 };
    try {
      const value = Number(localStorage.getItem('orbital-no8-best'));
      if (Number.isSafeInteger(value) && value > 0) best = value;
    } catch {
      /* Storage can be unavailable. */
    }
    function tone(
      frequency: number,
      length = 0.075,
      kind: OscillatorType = 'sine',
    ) {
      if (!soundEnabled || !audioContext || audioContext.state !== 'running')
        return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(0.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + length,
      );
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + length);
    }
    function roundRect(
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fill: string | CanvasGradient | null,
      stroke: string | null = null,
    ) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }
    function text(
      value: string,
      x: number,
      y: number,
      size: number,
      color: string,
      align: CanvasTextAlign = 'center',
      weight = 800,
    ) {
      ctx.font = `${weight} ${size}px Outfit, sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(value, x, y);
    }
    function star(x: number, y: number, size: number, color: string) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? size * 0.24 : size;
        if (!i) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
    function circle(
      x: number,
      y: number,
      r: number,
      fill: string | CanvasGradient | null,
      stroke: string | null = null,
    ) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }
    function drawTable() {
      const enamel = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      enamel.addColorStop(0, '#233f56');
      enamel.addColorStop(0.55, '#1a354b');
      enamel.addColorStop(1, '#122e43');
      ctx.fillStyle = enamel;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const inlay = ctx.createLinearGradient(0, 0, 26, 0);
      inlay.addColorStop(0, '#4f6678');
      inlay.addColorStop(0.4, '#8199a8');
      inlay.addColorStop(0.65, '#e0eaec');
      inlay.addColorStop(1, '#496777');
      ctx.fillStyle = inlay;
      ctx.fillRect(0, 0, 26, HEIGHT);
      ctx.fillStyle = '#3d5669';
      ctx.fillRect(545, 0, 15, HEIGHT);
      ctx.fillStyle = '#d0e5ed66';
      ctx.fillRect(26, 0, 2, HEIGHT);
      ctx.fillRect(543, 0, 2, HEIGHT);
      // Printed orbit paths and restrained stars belong to the toy's enamel artwork.
      ctx.strokeStyle = '#50718366';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(271, 365, 104 + i * 29, 220 + i * 15, -0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 25; i++) {
        const x = 81 + ((i * 101) % 391);
        const y = 144 + ((i * 73) % 442);
        if (i % 4 === 0) star(x, y, 4, '#537c91');
        else circle(x, y, 1.4, '#426c82');
      }
      ctx.save();
      ctx.translate(269, 485);
      ctx.rotate(-0.12);
      text('ORBITAL', 0, 0, 52, '#8caabc25');
      text('EXCURSION No. 8', 0, 21, 10, '#779bae');
      ctx.restore();
      // Backglass arch and the lane are physical boundaries, drawn to match the engine.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const rail of RAILS) {
        ctx.beginPath();
        ctx.moveTo(rail.a.x + 3, rail.a.y + 5);
        ctx.lineTo(rail.b.x + 3, rail.b.y + 5);
        ctx.strokeStyle = '#000b1777';
        ctx.lineWidth = 17;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rail.a.x, rail.a.y);
        ctx.lineTo(rail.b.x, rail.b.y);
        ctx.strokeStyle = '#4b697b';
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rail.a.x - 1, rail.a.y - 2);
        ctx.lineTo(rail.b.x - 1, rail.b.y - 2);
        ctx.strokeStyle = '#c9dbe0';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      text('THE THREE-LETTER MISSION', 271, 118, 10, '#adc6d0');
      for (let i = 0; i < 3; i++) {
        circle(
          211 + i * 60,
          148,
          8,
          game.targets[i] ? '#ed8257' : '#284b63',
          '#6991a6',
        );
        circle(209 + i * 60, 146, 2, '#cfedf3');
      }
      ctx.save();
      ctx.translate(519, 395);
      ctx.rotate(Math.PI / 2);
      text('PULL  •  RELEASE  •  ORBIT', 0, 0, 8, '#85a9bc');
      ctx.restore();
      for (const [i, bumper] of BUMPERS.entries()) {
        circle(bumper.x + 5, bumper.y + 9, bumper.r + 8, '#020a1477');
        const bezel = ctx.createRadialGradient(
          bumper.x - 8,
          bumper.y - 10,
          5,
          bumper.x,
          bumper.y,
          bumper.r + 8,
        );
        bezel.addColorStop(0, '#dde8e9');
        bezel.addColorStop(0.7, '#688695');
        bezel.addColorStop(1, '#283f4d');
        circle(bumper.x, bumper.y, bumper.r + 8, bezel, '#bacbd1');
        circle(bumper.x, bumper.y, bumper.r + 3, '#bd523c');
        const active = game.targets[i] || (game.cooldowns[bumper.id] || 0) > 0;
        const cap = ctx.createRadialGradient(
          bumper.x - 12,
          bumper.y - 17,
          2,
          bumper.x,
          bumper.y,
          bumper.r,
        );
        cap.addColorStop(0, active ? '#fff1d8' : '#f89c70');
        cap.addColorStop(0.55, active ? '#ffc99a' : '#de6c46');
        cap.addColorStop(1, '#8f3429');
        circle(bumper.x, bumper.y - 2, bumper.r - 2, cap, '#ffe6c4');
        if (!reducedMotion && (game.cooldowns[bumper.id] || 0) > 0) {
          ctx.lineWidth = 2;
          circle(bumper.x, bumper.y, bumper.r + 13, null, '#ffe3c7');
        }
        circle(
          bumper.x,
          bumper.y - 2,
          bumper.r - 9,
          active ? '#fff2d6' : '#e8eeea',
          '#aa5948',
        );
        text(bumper.id, bumper.x, bumper.y + 9, 31, '#22374a');
        ctx.strokeStyle = '#fff4ecb0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y - 2, bumper.r - 5, -2.8, -1);
        ctx.stroke();
        circle(bumper.x - 13, bumper.y - 18, 3, '#fff5e9');
      }
      for (const target of TARGETS) {
        ctx.save();
        const center = {
          x: (target.a.x + target.b.x) / 2,
          y: (target.a.y + target.b.y) / 2,
        };
        ctx.translate(center.x, center.y);
        ctx.rotate(
          Math.atan2(target.b.y - target.a.y, target.b.x - target.a.x),
        );
        roundRect(-26, -10, 52, 20, 5, '#264c65', '#8aacbe');
        star(
          0,
          0,
          8,
          (game.cooldowns[target.id] || 0) > 0 ? '#fff0c2' : '#ea8056',
        );
        ctx.restore();
      }
      for (let side = 0; side < 2; side++) {
        const points = SLINGS.slice(side * 3, side * 3 + 3);
        ctx.beginPath();
        ctx.moveTo(points[0].a.x, points[0].a.y);
        points.forEach((line) => ctx.lineTo(line.b.x, line.b.y));
        ctx.closePath();
        ctx.fillStyle = '#284d65';
        ctx.fill();
        ctx.strokeStyle = '#d25d43';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = '#f4ac87';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.save();
        ctx.translate(side ? 409 : 134, 603);
        ctx.rotate(side ? -0.54 : 0.54);
        text('BOOST', 0, 0, 10, '#d8eaf0');
        ctx.restore();
      }
      ctx.strokeStyle = '#9bb9c6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(187, 563);
      ctx.lineTo(206, 548);
      ctx.lineTo(200, 562);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(358, 563);
      ctx.lineTo(339, 548);
      ctx.lineTo(345, 562);
      ctx.stroke();
      for (const flipper of game.flippers) {
        const tip = {
          x: flipper.x + Math.cos(flipper.angle) * flipper.length,
          y: flipper.y + Math.sin(flipper.angle) * flipper.length,
        };
        ctx.beginPath();
        ctx.moveTo(flipper.x + 3, flipper.y + 6);
        ctx.lineTo(tip.x + 3, tip.y + 6);
        ctx.strokeStyle = '#00061177';
        ctx.lineWidth = 22;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(flipper.x, flipper.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.strokeStyle = '#b34834';
        ctx.lineWidth = 22;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(flipper.x, flipper.y - 1);
        ctx.lineTo(tip.x, tip.y - 1);
        ctx.strokeStyle = '#e8ece4';
        ctx.lineWidth = 17;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(flipper.x, flipper.y - 3);
        ctx.lineTo(tip.x, tip.y - 3);
        ctx.strokeStyle = '#f6fff4';
        ctx.lineWidth = 5;
        ctx.stroke();
        circle(flipper.x, flipper.y, 8, '#7294a2', '#254454');
        ctx.strokeStyle = '#254454';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(flipper.x - 3, flipper.y - 3);
        ctx.lineTo(flipper.x + 3, flipper.y + 3);
        ctx.stroke();
      }
      // Plunger spring compresses with the exact charge shown by the launch control.
      const springTop = 750 + charge * 12;
      ctx.strokeStyle = '#9ab2bc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(514, springTop);
      for (let i = 0; i < 9; i++)
        ctx.lineTo(
          514 + (i % 2 ? 7 : -7),
          springTop + (i * (779 - springTop)) / 9,
        );
      ctx.lineTo(514, 781);
      ctx.stroke();
      roundRect(503, springTop - 5, 22, 6, 2, '#cadbdf', '#3c5968');
      if (!reducedMotion)
        for (const [i, point] of trail.entries())
          circle(
            point.x,
            point.y,
            2 + i / trail.length,
            `rgba(248,239,212,${(i / trail.length) * 0.36})`,
          );
      if (game.phase !== 'ball-lost' && game.phase !== 'over') {
        const ball = game.ball;
        circle(ball.x + 3, ball.y + 5, BALL_RADIUS, '#00000077');
        const shine = ctx.createRadialGradient(
          ball.x - 3,
          ball.y - 4,
          1,
          ball.x,
          ball.y,
          BALL_RADIUS,
        );
        shine.addColorStop(0, '#ffffff');
        shine.addColorStop(0.38, '#dfecf1');
        shine.addColorStop(1, '#526c7a');
        circle(ball.x, ball.y, BALL_RADIUS, shine, '#233e4e');
        circle(ball.x - 3, ball.y - 4, 2.4, '#ffffff');
      }
      if (!reducedMotion)
        for (const item of floats) {
          ctx.globalAlpha = Math.max(0, item.life);
          text(
            `+${item.points}`,
            item.x,
            item.y - (1 - item.life) * 30,
            item.big ? 27 : 16,
            '#ffd9bb',
          );
          ctx.globalAlpha = 1;
        }
      if (game.saveTime > 0 && !game.saved) {
        roundRect(105, 77, 136, 21, 9, '#dc7650');
        text(`BALL SAVE · ${Math.ceil(game.saveTime)}s`, 173, 92, 9, '#132b3b');
      }
      text('MIND THE GAP', 270, 759, 8, '#84a4b7');
    }
    function flipperInput() {
      return {
        left:
          keys.has('KeyA') ||
          keys.has('ArrowLeft') ||
          pointerHolds.left.size > 0 ||
          buttonKeys.has('left') ||
          pulses.left > 0,
        right:
          keys.has('KeyD') ||
          keys.has('ArrowRight') ||
          pointerHolds.right.size > 0 ||
          buttonKeys.has('right') ||
          pulses.right > 0,
      };
    }
    function clearInput() {
      keys.clear();
      buttonKeys.clear();
      pointerHolds.left.clear();
      pointerHolds.right.clear();
      charging = false;
      charge = 0;
      pulses.left = pulses.right = 0;
    }
    function updateUI(force = false) {
      const stamp = `${started}-${paused}-${game.phase}-${game.score}-${game.balls}-${game.multiplier}-${game.targets.join('')}-${game.combo}-${Math.ceil(game.saveTime)}-${messageUntil > game.time ? message : ''}-${best}`;
      if (!force && stamp === lastUI) return;
      lastUI = stamp;
      $('score').replaceChildren(
        ...String(game.score)
          .padStart(7, '0')
          .slice(-7)
          .split('')
          .map((digit) => {
            const span = document.createElement('span');
            span.className = 'score-wheel';
            span.textContent = digit;
            span.setAttribute('aria-hidden', 'true');
            return span;
          }),
      );
      $('score').setAttribute('aria-label', `Score ${game.score}`);
      $('ball-number').textContent =
        `${String(game.ballNumber).padStart(2, '0')} / 03`;
      $('multiplier').textContent = `×${game.multiplier}`;
      $('best').textContent = String(best).padStart(6, '0');
      $<HTMLButtonElement>('pause').disabled =
        !started || game.phase === 'over';
      $<HTMLButtonElement>('restart').disabled = !started;
      $<HTMLButtonElement>('pause').textContent = paused ? 'Resume' : 'Pause';
      $<HTMLButtonElement>('left-flipper').disabled =
        !started || paused || game.phase === 'over';
      $<HTMLButtonElement>('right-flipper').disabled =
        $<HTMLButtonElement>('left-flipper').disabled;
      $<HTMLButtonElement>('launch').disabled =
        !started || paused || game.phase !== 'ready';
      $('launch-label').textContent =
        game.phase === 'playing'
          ? 'BALL IN PLAY'
          : game.phase === 'over'
            ? 'FLIGHT COMPLETE'
            : 'HOLD TO LAUNCH';
      $<HTMLButtonElement>('start').innerHTML =
        `<span>${!started ? 'START MACHINE' : game.phase === 'over' ? 'PLAY AGAIN' : 'NEW GAME'}</span><span aria-hidden="true">↗</span>`;
      $('target-lights')
        .querySelectorAll('span')
        .forEach((light, index) =>
          light.classList.toggle('lit', game.targets[index]),
        );
      $('ball-lights')
        .querySelectorAll('span')
        .forEach((light, index) => {
          light.classList.toggle('used', index < 3 - game.balls);
          light.classList.toggle(
            'current',
            game.phase !== 'over' && index === game.ballNumber - 1,
          );
        });
      $('combo-label').textContent =
        game.combo > 1
          ? `${game.combo}-HIT COMBO · +${(game.combo - 1) * 25} PER HIT`
          : 'FIND THE RHYTHM. LINK DIFFERENT TARGETS.';
      $('table-status').textContent = !started
        ? 'THREE BALLS. MAKE THEM COUNT.'
        : paused
          ? 'FLIGHT PAUSED. YOUR BALL IS SAFE.'
          : messageUntil > game.time
            ? message
            : game.phase === 'ready'
              ? 'HOLD THE LAUNCHER. RELEASE TO FLY.'
              : game.phase === 'over'
                ? 'FLIGHT COMPLETE. READY FOR ANOTHER?'
                : game.saveTime > 0
                  ? `ONE-TIME BALL SAVE · ${Math.ceil(game.saveTime)} SECONDS`
                  : 'LIGHT O + R + B. COMPLETE YOUR ORBIT.';
      canvas.inert = paused || !started || game.phase === 'over';
      $('overlay').hidden = started && !paused && game.phase !== 'over';
      if (paused) {
        $('overlay').innerHTML =
          '<p class="eyebrow">HOLDING PATTERN</p><h2>Paused.</h2><p>Your ball is safe.</p><button class="small-button" id="overlay-action">Resume</button>';
      } else if (game.phase === 'over') {
        $('overlay').innerHTML =
          `<p class="eyebrow">THREE BALLS · ONE FINE FLIGHT</p><h2>Game over.</h2><p><strong>${game.score.toLocaleString()} points.</strong><br>${game.score >= best && game.score > 0 ? 'A new house record. Nicely done.' : 'There’s always another orbit.'}</p><button class="small-button" id="overlay-action">Play again</button>`;
      }
      const action = $<HTMLButtonElement>('overlay-action');
      if (action)
        scope.handler(action, 'onclick', () =>
          paused ? setPaused(false) : startGame(),
        );
    }
    function startGame() {
      game = createGame();
      started = true;
      paused = false;
      clearInput();
      trail = [];
      floats = [];
      message = '';
      messageUntil = 0;
      updateUI(true);
      canvas.focus({ preventScroll: true });
      tone(180, 0.13, 'triangle');
    }
    function setPaused(value: boolean) {
      if (!started || game.phase === 'over') return;
      paused = value;
      clearInput();
      updateUI(true);
      (paused ? $<HTMLButtonElement>('overlay-action') : canvas).focus({
        preventScroll: true,
      });
    }
    function beginCharge() {
      if (!started || paused || game.phase !== 'ready') return;
      charging = true;
      charge = 0;
    }
    function releaseCharge() {
      if (!charging) return;
      charging = false;
      if (!started || paused || game.phase !== 'ready') {
        charge = 0;
        return;
      }
      game = launchBall(game, charge);
      charge = 0;
      trail = [];
      tone(160, 0.13, 'triangle');
      updateUI(true);
      canvas.focus({ preventScroll: true });
    }
    function processEvents(events: GameEvent[]) {
      for (const event of events) {
        if (event.type === 'score' || event.type === 'orbit') {
          if (!reducedMotion)
            floats.push({ ...event, life: 1, big: event.type === 'orbit' });
          tone(
            event.type === 'orbit'
              ? 880
              : event.id === 'O'
                ? 440
                : event.id === 'R'
                  ? 554
                  : 660,
            0.08,
            'triangle',
          );
          if (event.type === 'orbit') {
            message = `ORBIT COMPLETE! +${event.points} · MULTIPLIER ×${game.multiplier}`;
            messageUntil = game.time + 3;
          }
        } else if (event.type === 'save') {
          message = 'BALL SAVED! LOAD THE LAUNCHER AGAIN.';
          messageUntil = game.time + 4;
          tone(440, 0.17);
        } else if (event.type === 'drain') {
          message = `BALL ${game.ballNumber - 1} COMPLETE. NEXT BALL COMING UP.`;
          messageUntil = game.time + 2;
          tone(125, 0.18, 'triangle');
        } else if (event.type === 'retry-launch') {
          message = 'A LITTLE MORE POWER. HOLD, THEN RELEASE.';
          messageUntil = game.time + 3;
        } else if (event.type === 'flip') tone(220, 0.04, 'triangle');
      }
    }
    scope.listen($<HTMLButtonElement>('start'), 'click', startGame);
    scope.listen($<HTMLButtonElement>('restart'), 'click', startGame);
    scope.listen($<HTMLButtonElement>('pause'), 'click', () =>
      setPaused(!paused),
    );
    scope.listen($<HTMLButtonElement>('sound'), 'click', async () => {
      if (!soundEnabled) {
        try {
          audioContext ||= new (
            window.AudioContext || window.webkitAudioContext
          )();
          await audioContext.resume();
          if (scope.disposed) return;
          soundEnabled = audioContext.state === 'running';
        } catch {
          soundEnabled = false;
        }
      } else soundEnabled = false;
      $<HTMLButtonElement>('sound').setAttribute(
        'aria-pressed',
        String(soundEnabled),
      );
      $<HTMLButtonElement>('sound').textContent =
        `Sound ${soundEnabled ? 'on' : 'off'}`;
      if (soundEnabled) tone(440, 0.1, 'triangle');
    });
    for (const side of ['left', 'right'] as const) {
      const button = $(`${side}-flipper`);
      scope.listen(button, 'pointerdown', (event) => {
        if (!started || paused || game.phase === 'over') return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        pointerHolds[side].add(event.pointerId);
        tone(120, 0.025);
      });
      const release = (event: PointerEvent) =>
        pointerHolds[side].delete(event.pointerId);
      scope.listen(button, 'pointerup', release);
      scope.listen(button, 'pointercancel', release);
      scope.listen(button, 'lostpointercapture', release);
      scope.listen(button, 'keydown', (event) => {
        if (!['Space', 'Enter'].includes(event.code) || paused || !started)
          return;
        event.preventDefault();
        event.stopPropagation();
        buttonKeys.add(side);
      });
      scope.listen(button, 'keyup', (event) => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault();
        event.stopPropagation();
        buttonKeys.delete(side);
      });
      scope.listen(button, 'blur', () => buttonKeys.delete(side));
      scope.listen(button, 'click', (event) => {
        if (event.detail === 0 && started && !paused && game.phase !== 'over')
          pulses[side] = 0.13;
      });
    }
    scope.listen($<HTMLButtonElement>('launch'), 'pointerdown', (event) => {
      if ($<HTMLButtonElement>('launch').disabled) return;
      event.preventDefault();
      $<HTMLButtonElement>('launch').setPointerCapture(event.pointerId);
      beginCharge();
    });
    scope.listen($<HTMLButtonElement>('launch'), 'pointerup', releaseCharge);
    scope.listen($<HTMLButtonElement>('launch'), 'pointercancel', () => {
      charging = false;
      charge = 0;
    });
    scope.listen($<HTMLButtonElement>('launch'), 'keydown', (event) => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) beginCharge();
    });
    scope.listen($<HTMLButtonElement>('launch'), 'keyup', (event) => {
      if (!['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      releaseCharge();
    });
    scope.listen($<HTMLButtonElement>('launch'), 'click', (event) => {
      if (
        event.detail === 0 &&
        !charging &&
        started &&
        !paused &&
        game.phase === 'ready'
      ) {
        charging = true;
        charge = 0.75;
        releaseCharge();
      }
    });
    scope.listen(window, 'keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!started || game.phase === 'over') return;
      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        if (!event.repeat) setPaused(!paused);
        return;
      }
      if (
        paused ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            'button,a,input,select,textarea,[contenteditable="true"]',
          ))
      )
        return;
      if (
        !['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(
          event.code,
        )
      )
        return;
      event.preventDefault();
      keys.add(event.code);
      if (['Space', 'Enter'].includes(event.code) && !event.repeat)
        beginCharge();
    });
    scope.listen(window, 'keyup', (event) => {
      keys.delete(event.code);
      if (['Space', 'Enter'].includes(event.code) && !paused) releaseCharge();
    });
    scope.listen(window, 'blur', clearInput);
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden && started && game.phase !== 'over') setPaused(true);
    });
    function resize() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, canvas.clientWidth);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(((width * HEIGHT) / WIDTH) * ratio);
      ctx.setTransform(
        canvas.width / WIDTH,
        0,
        0,
        canvas.height / HEIGHT,
        0,
        0,
      );
      drawTable();
    }
    const resizeObserver = scope.observe(new ResizeObserver(resize));
    resizeObserver.observe(canvas);
    function animate(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      if (started && !paused && game.phase !== 'over') {
        if (charging) charge = Math.min(1, charge + dt / 1.1);
        pulses.left = Math.max(0, pulses.left - dt);
        pulses.right = Math.max(0, pulses.right - dt);
        const input = flipperInput();
        game = stepGame(game, input, dt);
        processEvents(game.events);
        $<HTMLButtonElement>('left-flipper').classList.toggle(
          'pressed',
          input.left,
        );
        $<HTMLButtonElement>('right-flipper').classList.toggle(
          'pressed',
          input.right,
        );
        if (!reducedMotion && game.phase === 'playing') {
          trail.push({ x: game.ball.x, y: game.ball.y });
          if (trail.length > 10) trail.shift();
        } else trail = [];
        floats = floats
          .map((item) => ({ ...item, life: item.life - dt * 1.1 }))
          .filter((item) => item.life > 0);
        if (game.phase === 'over') {
          clearInput();
          if (game.score > best) {
            best = game.score;
            try {
              localStorage.setItem('orbital-no8-best', String(best));
            } catch {
              /* Optional persistence. */
            }
          }
          updateUI(true);
          $<HTMLButtonElement>('overlay-action').focus({ preventScroll: true });
        }
      } else if (paused || !started || game.phase === 'over') {
        $<HTMLButtonElement>('left-flipper').classList.remove('pressed');
        $<HTMLButtonElement>('right-flipper').classList.remove('pressed');
      }
      $('plunger-meter').style.width = `${charge * 100}%`;
      $<HTMLButtonElement>('launch').setAttribute(
        'aria-label',
        `Hold and release to launch${charging ? `, power ${Math.round(charge * 100)} percent` : ''}`,
      );
      updateUI();
      drawTable();
      frame = scope.raf(animate);
    }
    scope.listen(window, 'pagehide', () => {
      scope.cancelFrame(frame);
      resizeObserver.disconnect();
      audioContext?.close();
    });
    if (matchMedia('(max-width: 740px)').matches)
      root.querySelector<HTMLDetailsElement>('.rules')!.open = false;
    updateUI(true);
    resize();
    frame = scope.raf(animate);
    scope.add(() => {
      resizeObserver.disconnect();
      audioContext?.close().catch(() => {});
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
