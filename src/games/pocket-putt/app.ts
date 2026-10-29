import type { Point } from './engine.ts';
type Paint = string | CanvasGradient | CanvasPattern;
type GameElements = {
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  course: HTMLCanvasElement;
  players: HTMLSelectElement;
  start: HTMLButtonElement;
  resume: HTMLButtonElement;
  continue: HTMLButtonElement;
  angle: HTMLInputElement;
  power: HTMLInputElement;
  putt: HTMLButtonElement;
};
import {
  WIDTH,
  HEIGHT,
  HOLES,
  BALL_RADIUS,
  clamp,
  createRound,
  takeShot,
  tickRound,
  nextTurn,
  totalScore,
  scoreName,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const wideLayout = matchMedia(
      '(min-width: 1040px), (min-width: 640px) and (max-height: 500px)',
    );
    const scoreDocked = matchMedia(
      '(min-width: 1040px) and (min-height: 800px)',
    );
    const scoreDrawer =
      root.querySelector<HTMLDetailsElement>('.score-drawer')!;
    const syncScoreDrawer = () => {
      scoreDrawer.open = scoreDocked.matches;
      const setup = scope.byId('setup');
      (wideLayout.matches
        ? root.querySelector<HTMLElement>('.shot-station')!
        : root.querySelector<HTMLElement>('.canvas-wrap')!
      ).prepend(setup);
    };
    syncScoreDrawer();
    scope.listen(wideLayout, 'change', syncScoreDrawer);
    scope.listen(scoreDocked, 'change', syncScoreDrawer);
    const $ = <K extends string>(id: K) =>
      scope.byId<K extends keyof GameElements ? GameElements[K] : HTMLElement>(
        id,
      );
    const canvas = $('course');
    const ctx = canvas.getContext('2d')!;
    const grassTexture = document.createElement('canvas');
    grassTexture.width = 900;
    grassTexture.height = 600;
    const grassInk = grassTexture.getContext('2d')!;
    for (let i = 0; i < 6500; i++) {
      grassInk.fillStyle = i % 3 ? '#254e2920' : '#e4f3c631';
      grassInk.fillRect((i * 137) % 900, (i * 79) % 600, 0.8, 1.5 + (i % 3));
    }
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let round = createRound();
    let started = false;
    let paused = false;
    let angle = -0.332;
    let power = 55;
    let dragging: (Point & { id: number; distance: number }) | null = null;
    let lastTime = performance.now();
    let frame = 0;
    let trail: Point[] = [];
    const keys = new Set<string>();
    let best: number | null = null;
    try {
      const saved = Number(localStorage.getItem('clover-club-best'));
      if (Number.isInteger(saved) && saved >= 6 && saved <= 54) best = saved;
    } catch {
      /* Storage is optional. */
    }
    function rounded(
      x: number,
      y: number,
      w: number,
      h: number,
      radius: number,
      fill?: Paint | null,
      stroke?: Paint,
    ) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
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
      color: Paint,
      align: CanvasTextAlign = 'left',
      serif = false,
    ) {
      ctx.font = `${serif ? 400 : 600} ${size}px ${serif ? 'DM Serif, Georgia, serif' : 'Outfit, sans-serif'}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    }
    function leaf(
      x: number,
      y: number,
      size: number,
      turn: number,
      color: Paint,
    ) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.44, size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d9e0b866';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.7);
      ctx.lineTo(0, size * 0.8);
      ctx.stroke();
      ctx.restore();
    }
    function bush(x: number, y: number, radius: number, variant = 0) {
      ctx.fillStyle = '#405e4430';
      ctx.beginPath();
      ctx.ellipse(x + 4, y + 8, radius, radius * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const theta = (i / 7) * Math.PI * 2;
        leaf(
          x + Math.cos(theta) * radius * 0.37,
          y + Math.sin(theta) * radius * 0.33,
          radius * 0.68,
          theta,
          ['#1e7757', '#288a5d', '#49ab6d'][(i + variant) % 3],
        );
      }
    }
    function drawCourse() {
      const hole = HOLES[round.hole];
      const verge = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      verge.addColorStop(0, '#42b796');
      verge.addColorStop(1, '#238c77');
      ctx.fillStyle = verge;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.strokeStyle = '#55c9a2';
      ctx.lineWidth = 1;
      for (let i = 0; i < 42; i++) {
        const x = (i * 157 + 18) % 900;
        const y = (i * 91 + 26) % 600;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0.3, 2.7);
        ctx.stroke();
      }
      ctx.shadowColor = '#284b3660';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 10;
      rounded(38, 53, 824, 494, 28, '#0c625a');
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const coping = ctx.createLinearGradient(0, 47, 0, 539);
      coping.addColorStop(0, '#e2f0bd');
      coping.addColorStop(0.35, '#a8c994');
      coping.addColorStop(1, '#739e77');
      rounded(40, 47, 820, 492, 25, coping, '#2d765e');
      rounded(43, 49, 814, 486, 22, null, '#fff7df80');
      rounded(48, 60, 804, 476, 16, '#125c48');
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(52, 64, 796, 468, 11);
      ctx.clip();
      const green = ctx.createRadialGradient(320, 170, 0, 450, 290, 530);
      green.addColorStop(0, '#a4d96a');
      green.addColorStop(0.65, '#65b84e');
      green.addColorStop(1, '#318b48');
      ctx.fillStyle = green;
      ctx.fillRect(52, 64, 796, 468);
      for (let i = -6; i < 16; i++) {
        ctx.fillStyle = i % 2 ? '#264d2910' : '#eaf5bb12';
        ctx.beginPath();
        ctx.moveTo(i * 90, 64);
        ctx.lineTo(i * 90 + 73, 64);
        ctx.lineTo(i * 90 + 400, 532);
        ctx.lineTo(i * 90 + 327, 532);
        ctx.fill();
      }
      ctx.drawImage(grassTexture, 0, 0);
      for (const sand of hole.sand) {
        ctx.fillStyle = '#7c945e';
        ctx.beginPath();
        ctx.ellipse(
          sand.x,
          sand.y + 4,
          sand.rx + 4,
          sand.ry + 4,
          -0.16,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = '#e3c997';
        ctx.beginPath();
        ctx.ellipse(sand.x, sand.y, sand.rx, sand.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cbb37e';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 13; i++) {
          const y = sand.y - sand.ry + 15 + i * 11;
          const spread =
            Math.sqrt(Math.max(0, 1 - ((y - sand.y) / sand.ry) ** 2)) *
            sand.rx *
            0.77;
          ctx.beginPath();
          ctx.moveTo(sand.x - spread, y);
          ctx.quadraticCurveTo(sand.x, y - 5, sand.x + spread, y);
          ctx.stroke();
        }
      }
      for (const water of hole.water) {
        ctx.fillStyle = '#789768';
        ctx.beginPath();
        ctx.ellipse(
          water.x,
          water.y + 3,
          water.rx + 6,
          water.ry + 5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        const waterFill = ctx.createLinearGradient(
          0,
          water.y - water.ry,
          0,
          water.y + water.ry,
        );
        waterFill.addColorStop(0, '#396f73');
        waterFill.addColorStop(0.55, '#599b99');
        waterFill.addColorStop(1, '#8bc4b2');
        ctx.fillStyle = waterFill;
        ctx.beginPath();
        ctx.ellipse(water.x, water.y, water.rx, water.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b2d1b0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(water.x, water.y, water.rx - 9, water.ry - 9, 0, -1.4, 1.5);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const x = water.x + Math.sin(i * 8.1) * water.rx * 0.65;
          const y = water.y + Math.cos(i * 6.7) * water.ry * 0.72;
          ctx.strokeStyle = '#4f918c';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 9, y);
          ctx.lineTo(x + 7, y);
          ctx.stroke();
        }
        ctx.fillStyle = '#a9bc79';
        ctx.beginPath();
        ctx.arc(
          water.x - water.rx * 0.42,
          water.y - water.ry * 0.32,
          12,
          0.3,
          Math.PI * 2,
        );
        ctx.lineTo(water.x - water.rx * 0.42, water.y - water.ry * 0.32);
        ctx.fill();
        ctx.fillStyle = '#efcaba';
        ctx.beginPath();
        ctx.arc(
          water.x - water.rx * 0.42 + 2,
          water.y - water.ry * 0.32 - 4,
          4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      for (const wall of hole.walls) {
        rounded(wall.x + 5, wall.y + 8, wall.w, wall.h, 5, '#43604044');
        rounded(wall.x, wall.y, wall.w, wall.h, 5, '#d0b990', '#756b50');
        rounded(wall.x + 5, wall.y + 5, wall.w - 10, wall.h - 10, 2, '#65824c');
        const vertical = wall.h > wall.w;
        const length = vertical ? wall.h : wall.w;
        for (let i = 13; i < length - 8; i += 27) {
          const x = vertical ? wall.x + wall.w / 2 : wall.x + i;
          const y = vertical ? wall.y + i : wall.y + wall.h / 2;
          leaf(x - 5, y, 10, -0.6, '#89a365');
          leaf(x + 5, y + 3, 9, 0.8, '#567547');
          if (i % 81 === 13) {
            ctx.fillStyle = '#e0b6a0';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.strokeStyle = '#f0f0c377';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(hole.tee.x, hole.tee.y, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#556941';
      ctx.beginPath();
      ctx.ellipse(hole.cup.x + 1, hole.cup.y + 4, 17, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e4937';
      ctx.beginPath();
      ctx.arc(hole.cup.x, hole.cup.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4edca';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hole.cup.x, hole.cup.y);
      ctx.lineTo(hole.cup.x, hole.cup.y - 56);
      ctx.stroke();
      ctx.fillStyle = '#ff8965';
      ctx.beginPath();
      ctx.moveTo(hole.cup.x + 1, hole.cup.y - 57);
      ctx.lineTo(hole.cup.x + 34, hole.cup.y - 48);
      ctx.lineTo(hole.cup.x + 1, hole.cup.y - 36);
      ctx.closePath();
      ctx.fill();
      text(
        String(round.hole + 1),
        hole.cup.x + 12,
        hole.cup.y - 43,
        11,
        '#fff2d5',
        'center',
      );
      if (started && round.phase === 'aiming' && !paused) {
        const distance = 38 + power * 2.35;
        ctx.strokeStyle = '#fff4cebb';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 7]);
        ctx.beginPath();
        ctx.moveTo(round.ball.x, round.ball.y);
        ctx.lineTo(
          round.ball.x + Math.cos(angle) * distance,
          round.ball.y + Math.sin(angle) * distance,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.save();
        ctx.translate(
          round.ball.x + Math.cos(angle) * distance,
          round.ball.y + Math.sin(angle) * distance,
        );
        ctx.rotate(angle);
        ctx.fillStyle = '#fff4ce';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-6, -5);
        ctx.lineTo(-6, 5);
        ctx.fill();
        ctx.restore();
        if (dragging) {
          ctx.strokeStyle = '#395a3e77';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(round.ball.x, round.ball.y);
          ctx.lineTo(dragging.x, dragging.y);
          ctx.stroke();
        }
      }
      if (!reduceMotion)
        for (let i = 0; i < trail.length; i++) {
          ctx.fillStyle = `rgba(251,248,223,${(i / trail.length) * 0.23})`;
          ctx.beginPath();
          ctx.arc(trail[i].x, trail[i].y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      if (started && round.phase === 'aiming') {
        ctx.strokeStyle = '#eaffaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(round.ball.x, round.ball.y, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (round.ball.status !== 'sunk') {
        ctx.fillStyle = '#2f492f55';
        ctx.beginPath();
        ctx.ellipse(
          round.ball.x + 3,
          round.ball.y + 5,
          9,
          5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        const ballFill = ctx.createRadialGradient(
          round.ball.x - 3,
          round.ball.y - 4,
          0.5,
          round.ball.x,
          round.ball.y,
          BALL_RADIUS,
        );
        ballFill.addColorStop(0, round.player ? '#ffe0b6' : '#ffffff');
        ballFill.addColorStop(0.55, round.player ? '#dda273' : '#fff8d8');
        ballFill.addColorStop(1, round.player ? '#a85f3f' : '#bfc3a8');
        ctx.fillStyle = ballFill;
        ctx.strokeStyle = round.player ? '#9c603e' : '#d4d4b7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(round.ball.x, round.ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = round.player ? '#f1be8f' : '#fffbee';
        ctx.beginPath();
        ctx.arc(round.ball.x - 2.5, round.ball.y - 2.5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      bush(40, 41, 38);
      bush(873, 549, 41, 1);
      bush(17, 532, 25, 2);
      bush(857, 35, 27, 1);
      text('C L O V E R   C L U B', 450, 577, 11, '#e2f0bd', 'center');
      text(
        `HOLE ${String(round.hole + 1).padStart(2, '0')}`,
        78,
        578,
        10,
        '#e2f0bd',
      );
      text('TAKE THE SCENIC ROUTE', 820, 578, 9, '#e2f0bd', 'right');
    }
    function aimAtCup() {
      const hole = HOLES[round.hole];
      angle = Math.atan2(hole.cup.y - round.ball.y, hole.cup.x - round.ball.x);
      power = 55;
      updateAim();
    }
    function updateAim() {
      const degrees = Math.round((angle * 180) / Math.PI);
      $('angle').value = String(degrees);
      $('angle-value').textContent = `${degrees}°`;
      $('power').value = String(Math.round(power));
      $('power-value').textContent = `${Math.round(power)}%`;
    }
    function updateUI() {
      const hole = HOLES[round.hole];
      $('hole-index').textContent = String(round.hole + 1).padStart(2, '0');
      $('hole-meta').textContent =
        `HOLE ${round.hole + 1} OF 6 · PAR ${hole.par}`;
      $('hole-name').textContent = hole.name;
      $('best').textContent = best === null ? '—' : String(best);
      $('pause').disabled = !started || round.phase === 'complete';
      $('restart').disabled = !started;
      $('pause').textContent = paused ? 'Resume' : 'Pause';
      $('pause-message').hidden = !paused;
      canvas.inert = paused;
      $('shot-controls').inert = !started || paused || round.phase !== 'aiming';
      $('setup').hidden = started && round.phase !== 'complete';
      $('start').innerHTML =
        round.phase === 'complete'
          ? 'Another garden round <span aria-hidden="true">→</span>'
          : 'Start round <span aria-hidden="true">→</span>';
      const name =
        round.players === 1 ? 'Your' : `Player ${round.player + 1}’s`;
      $('turn-label').textContent = !started
        ? 'Your ball is waiting.'
        : round.phase === 'complete'
          ? 'Back at the clubhouse.'
          : `${name} ${round.player ? 'copper' : 'ivory'} ball`;
      $('player-dot').style.background = round.player ? '#d88d5e' : '#fbf6df';
      $('stroke-label').textContent = started
        ? `${round.strokes} ${round.strokes === 1 ? 'stroke' : 'strokes'} · par ${hole.par}`
        : 'Six holes. No time limit.';
      $('course-tip').textContent =
        round.notice ||
        (started
          ? hole.tip
          : 'Pull back from the ball. The farther you pull, the stronger the putt.');
      root.querySelectorAll<HTMLElement>('.p2-col').forEach((cell) => {
        cell.hidden = round.players !== 2;
      });
      root.querySelector('.p1-col')!.textContent =
        round.players === 2 ? 'P1' : 'YOU';
      $('score-rows').replaceChildren(
        ...HOLES.map((item, index) => {
          const row = document.createElement('tr');
          if (started && index === round.hole && round.phase !== 'complete')
            row.className = 'score-current';
          const head = document.createElement('th');
          head.scope = 'row';
          head.textContent = String(index + 1).padStart(2, '0');
          row.append(head);
          const par = document.createElement('td');
          par.textContent = String(item.par);
          row.append(par);
          for (let player = 0; player < round.players; player++) {
            const cell = document.createElement('td');
            const score = round.scores[player][index];
            cell.textContent = score === null ? '—' : String(score);
            if (score !== null && score < item.par)
              cell.className = 'score-low';
            row.append(cell);
          }
          return row;
        }),
      );
      $('p1-total').textContent = String(totalScore(round.scores[0]) || '—');
      $('p2-total').textContent =
        round.players === 2 ? String(totalScore(round.scores[1]) || '—') : '—';
      const finishedHole = round.phase === 'hole-complete';
      const finishedRound = round.phase === 'complete';
      $('round-message').hidden = !finishedHole && !finishedRound;
      $('continue').hidden = finishedRound;
      if (finishedHole) {
        $('message-kicker').textContent =
          round.result === 'pickup'
            ? 'A FRESH FAIRWAY AWAITS'
            : 'NICELY PLAYED';
        $('message-title').textContent =
          round.result === 'pickup'
            ? 'Pick up for nine.'
            : scoreName(round.strokes, hole.par);
        const playerNext = round.players === 2 && round.player === 0;
        $('message-detail').textContent = playerNext
          ? 'Pass the device to Player 2 for this hole.'
          : round.hole === 5
            ? 'Your garden round is complete. Let’s see the scorecard.'
            : 'A new little corner of the garden is waiting.';
        $('continue').innerHTML =
          `${playerNext ? 'Player 2’s turn' : round.hole === 5 ? 'To the clubhouse' : 'Next hole'} <span aria-hidden="true">→</span>`;
      } else if (finishedRound) {
        const totals = round.scores.map(totalScore);
        const result =
          round.players === 1
            ? `${totals[0]} strokes. A lovely afternoon.`
            : totals[0] === totals[1]
              ? 'An honourable draw.'
              : `Player ${totals[0] < totals[1] ? 1 : 2} takes the honours.`;
        $('message-kicker').textContent = 'THE GARDEN ROUND · COMPLETE';
        $('message-title').textContent = result;
        $('message-detail').textContent =
          `Par 19. ${round.players === 2 ? `Player 1: ${totals[0]} · Player 2: ${totals[1]}. ` : ''}There’s always time for one more round.`;
      }
    }
    function startRound() {
      round = createRound(Number($('players').value));
      started = true;
      paused = false;
      keys.clear();
      dragging = null;
      trail = [];
      aimAtCup();
      updateUI();
      canvas.focus({ preventScroll: true });
      if (wideLayout.matches) window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function setPaused(value: boolean) {
      if (!started || round.phase === 'complete') return;
      paused = value;
      keys.clear();
      dragging = null;
      updateUI();
      (paused ? $('resume') : canvas).focus({ preventScroll: true });
    }
    function putt() {
      if (!started || paused) return;
      round = takeShot(round, angle, power);
      dragging = null;
      trail = [];
      updateUI();
      canvas.focus({ preventScroll: true });
      if (wideLayout.matches) window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function continueRound() {
      round = nextTurn(round);
      trail = [];
      if (round.phase === 'complete') {
        const candidate = Math.min(...round.scores.map(totalScore));
        if (best === null || candidate < best) {
          best = candidate;
          try {
            localStorage.setItem('clover-club-best', String(best));
          } catch {
            /* Optional persistence. */
          }
        }
      } else aimAtCup();
      updateUI();
      (round.phase === 'complete' ? $('start') : canvas).focus({
        preventScroll: true,
      });
    }
    scope.listen($('start'), 'click', startRound);
    scope.listen($('restart'), 'click', startRound);
    scope.listen($('pause'), 'click', () => setPaused(!paused));
    scope.listen($('resume'), 'click', () => setPaused(false));
    scope.listen($('putt'), 'click', putt);
    scope.listen($('continue'), 'click', continueRound);
    scope.listen($('players'), 'change', () => {
      if (!started || round.phase === 'complete') {
        round = createRound(Number($('players').value));
        started = false;
        aimAtCup();
        updateUI();
      }
    });
    scope.listen($('angle'), 'input', () => {
      angle = (Number($('angle').value) * Math.PI) / 180;
      updateAim();
    });
    scope.listen($('power'), 'input', () => {
      power = Number($('power').value);
      updateAim();
    });
    function point(event: PointerEvent) {
      const box = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - box.left) / box.width) * WIDTH,
        y: ((event.clientY - box.top) / box.height) * HEIGHT,
      };
    }
    scope.listen(canvas, 'pointerdown', (event) => {
      if (!started || paused || round.phase !== 'aiming' || dragging) return;
      const p = point(event);
      if (Math.hypot(p.x - round.ball.x, p.y - round.ball.y) > 48) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      dragging = { ...p, id: event.pointerId, distance: 0 };
      canvas.focus({ preventScroll: true });
    });
    scope.listen(canvas, 'pointermove', (event) => {
      if (!dragging || dragging.id !== event.pointerId || paused) return;
      const p = point(event);
      const dx = round.ball.x - p.x;
      const dy = round.ball.y - p.y;
      const distance = Math.hypot(dx, dy);
      dragging = { ...p, id: event.pointerId, distance };
      if (distance > 4) {
        angle = Math.atan2(dy, dx);
        power = clamp(distance / 1.65, 5, 100);
        updateAim();
      }
    });
    scope.listen(canvas, 'pointerup', (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const distance = dragging.distance;
      dragging = null;
      if (distance > 5) putt();
    });
    scope.listen(canvas, 'pointercancel', () => {
      dragging = null;
    });
    scope.listen(window, 'keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'button,input,select,a,textarea,[contenteditable="true"]',
        )
      )
        return;
      if (!started || round.phase === 'complete') return;
      if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        if (!event.repeat) setPaused(!paused);
        return;
      }
      if (paused || round.phase !== 'aiming') return;
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (event.code === 'Space' && !event.repeat) putt();
      else keys.add(event.code);
    });
    scope.listen(window, 'keyup', (event) => keys.delete(event.code));
    scope.listen(window, 'blur', () => {
      keys.clear();
      dragging = null;
    });
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden && started && round.phase !== 'complete')
        setPaused(true);
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
      drawCourse();
    }
    const resizeObserver = scope.observe(new ResizeObserver(resize));
    resizeObserver.observe(canvas);
    function animate(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      if (started && !paused) {
        if (round.phase === 'aiming') {
          let changed = false;
          if (keys.has('ArrowLeft') || keys.has('ArrowRight')) {
            angle +=
              (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) *
              dt *
              1.2;
            angle = Math.atan2(Math.sin(angle), Math.cos(angle));
            changed = true;
          }
          if (keys.has('ArrowUp') || keys.has('ArrowDown')) {
            power = clamp(
              power +
                (Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'))) *
                  dt *
                  38,
              5,
              100,
            );
            changed = true;
          }
          if (changed) updateAim();
        }
        const oldPhase = round.phase;
        round = tickRound(round, dt);
        if (!reduceMotion && round.phase === 'rolling') {
          trail.push({ x: round.ball.x, y: round.ball.y });
          if (trail.length > 20) trail.shift();
        }
        if (round.phase !== oldPhase) {
          trail = [];
          keys.clear();
          updateUI();
          if (round.phase === 'hole-complete')
            $('continue').focus({ preventScroll: true });
        }
      }
      drawCourse();
      frame = scope.raf(animate);
    }
    scope.listen(window, 'pagehide', () => {
      scope.cancelFrame(frame);
      resizeObserver.disconnect();
    });
    aimAtCup();
    updateUI();
    resize();
    frame = scope.raf(animate);
    scope.add(() => {
      resizeObserver.disconnect();
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
