import type { Fish } from './engine.ts';
import {
  FISH,
  safeProgress,
  createTrip,
  startTrip,
  pauseTrip,
  castLine,
  hookFish,
  setReeling,
  bankBasket,
  riskBasket,
  advanceTrip,
} from './engine.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const wideLayout = matchMedia(
      '(min-width: 900px), (min-width: 640px) and (max-height: 500px)',
    );
    const logDocked = matchMedia('(min-width: 900px) and (min-height: 900px)');
    const catchLog = root.querySelector<HTMLDetailsElement>('.catch-log')!;
    const syncCatchLog = () => {
      catchLog.open = logDocked.matches;
      const overlay = scope.byId('overlay');
      root.querySelector('.tackle-station')!.prepend(overlay);
    };
    syncCatchLog();
    scope.listen(wideLayout, 'change', syncCatchLog);
    scope.listen(logDocked, 'change', syncCatchLog);
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
        scope.byId<T>(id),
      canvas = $<HTMLCanvasElement>('pond'),
      ctx = canvas.getContext('2d')!;
    let saved = safeProgress({});
    try {
      saved = safeProgress(
        JSON.parse(localStorage.getItem('claw-catch-journal') ?? 'null'),
      );
    } catch {}
    let state = createTrip(saved),
      lastRevision = -1,
      previousPhase = 'ready',
      lastTime = 0,
      visualTime = 0,
      raf = 0,
      disposed = false,
      sound = false,
      audio: AudioContext | undefined,
      serialized = '';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function fishSVG(fish: Fish, _locked = false) {
      return `<svg viewBox="0 0 100 50" aria-hidden="true"><path d="m26 25-20-15 2 28Z" fill="${fish.accent}"/><path d="m43 13 13-9 6 13m-15 19 10 9 5-11" fill="${fish.accent}"/><ellipse cx="58" cy="25" rx="32" ry="15" fill="${fish.color}"/>${fish.id === 'koi' ? '<path d="M38 13q16 2 11 20l-9 4q-15-8-2-24m30 1q12 3 13 14l-12 5-5-9Z" fill="#bf745a"/>' : ''}${fish.id === 'perch' ? '<path d="m42 13 2 22m10-24 3 26m9-25 3 24" stroke="#526f50" stroke-width="4"/>' : ''}<circle cx="79" cy="21" r="2" fill="#34483d"/><path d="m65 22-7 8 11-2" fill="${fish.accent}"/>${fish.id === 'catfish' ? '<path d="m83 29 14 6m-14-6 12-5" stroke="#526b6d" fill="none"/>' : ''}</svg>`;
    }
    function tone(kind = 'cast') {
      if (!sound) return;
      try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
        const o = audio.createOscillator(),
          g = audio.createGain();
        o.type = 'sine';
        o.connect(g);
        g.connect(audio.destination);
        const f = kind === 'catch' ? 660 : kind === 'miss' ? 180 : 390;
        o.frequency.setValueAtTime(f, audio.currentTime);
        o.frequency.exponentialRampToValueAtTime(
          f * 1.4,
          audio.currentTime + 0.3,
        );
        g.gain.setValueAtTime(0.025, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
        o.start();
        o.stop(audio.currentTime + 0.65);
      } catch {}
    }
    function save() {
      const data = { best: state.best, collection: state.collection };
      saved = safeProgress(data);
      const next = JSON.stringify(saved);
      if (next !== serialized) {
        serialized = next;
        try {
          localStorage.setItem('claw-catch-journal', next);
        } catch {}
      }
    }
    function focusPond() {
      canvas.focus({ preventScroll: true });
      // Keep the desktop HUD in view when returning from the lower action dock.
      if (matchMedia('(min-width: 781px)').matches)
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function render() {
      if (lastRevision !== state.revision) {
        lastRevision = state.revision;
        $('casts').textContent = String(state.casts);
        $('banked').textContent = String(state.banked);
        $('best').textContent = String(state.best);
        const total = state.basket.reduce((sum, item) => sum + item.points, 0);
        $('basket-points').textContent = String(total);
        $<HTMLButtonElement>('bank').innerHTML =
          `Bank ${total} ${total === 1 ? 'point' : 'points'} <span>✓</span>`;
        $('basket-detail').textContent = state.basket.length
          ? `${state.basket.length} unbanked ${state.basket.length === 1 ? 'catch' : 'catches'}. Bank now to keep them. A lost fish takes this basket, too.`
          : 'Unbanked catches travel with you. A lost fish takes the basket, too.';
        $('basket-label').innerHTML = state.basket.length
          ? `${state.basket.length} in the basket · ${total} points<br>Next catch ×${(1 + state.basket.length * 0.25).toFixed(2)}`
          : 'Nothing to carry.<br>Everything to discover.';
        $('collection-count').textContent =
          `${FISH.filter((f) => state.collection[f.id]).length} / 6`;
        $('collection').innerHTML = FISH.map(
          (f) =>
            `<div class="collection-item ${state.collection[f.id] ? '' : 'locked'}">${fishSVG(f)}<div><strong>${state.collection[f.id] ? f.name : 'Undiscovered'}</strong><small>${state.collection[f.id] ? `${f.length} · ${f.title}` : 'A story still beneath the surface'}</small></div><span>${state.collection[f.id] ? `×${state.collection[f.id]}` : '—'}</span></div>`,
        ).join('');
        $('message').textContent = state.message;
        $<HTMLButtonElement>('action').hidden = state.phase === 'decision';
        $<HTMLButtonElement>('action').disabled =
          ['ready', 'ended'].includes(state.phase) || state.paused;
        $<HTMLButtonElement>('bank').hidden =
          !state.basket.length || !['decision', 'shore'].includes(state.phase);
        $<HTMLButtonElement>('risk').hidden = state.phase !== 'decision';
        $('basket-label').hidden =
          state.phase === 'decision' || !state.basket.length;
        $<HTMLButtonElement>('action').innerHTML =
          state.phase === 'casting'
            ? 'Set the hook <span>↓</span>'
            : state.phase === 'reeling'
              ? 'Hold to reel <span>◌</span>'
              : 'Cast a line <span>↗</span>';
        $('phase-label').textContent =
          state.phase === 'reeling'
            ? '02 / FEEL THE PULL'
            : state.phase === 'decision'
              ? '03 / A LITTLE DECISION'
              : '01 / FIND YOUR MOMENT';
        $('phase-hint').textContent =
          state.phase === 'reeling'
            ? 'HOLD TO REEL · RELEASE TO EASE'
            : state.phase === 'decision'
              ? 'SAFE IN THE JOURNAL, OR ONE MORE?'
              : 'CAST · HOOK · REEL · KEEP';
        $('cast-meter').hidden =
          state.phase === 'reeling' || state.phase === 'decision';
        $('reel-meters').hidden = state.phase !== 'reeling';
        $('meter-caption').textContent =
          state.phase === 'casting'
            ? 'Tap again in the green zone. The center finds rarer fish.'
            : state.phase === 'reeling'
              ? 'Ease off during a surge. Too much tension snaps the line; too much slack loses the fish.'
              : state.phase === 'decision'
                ? 'Bank to save your catches. One more cast increases the reward — and risks the entire basket.'
                : 'Tap to cast, then tap again in the green zone.';
        $('pond-badge').hidden = !['reeling', 'decision'].includes(state.phase);
        if (state.phase === 'decision')
          $('pond-badge').textContent =
            `${state.fish!.name} · ${state.basket.at(-1)?.points || 0} points`;
        save();
      }
      $('cast-marker').style.left =
        `calc(${state.marker * 100}% - ${state.marker * 5}px)`;
      $('tension-fill').style.width = `${Math.min(100, state.tension * 100)}%`;
      $('tension-fill').style.background =
        state.tension > 0.78 ? '#f78f70' : '#a3d697';
      $('distance-fill').style.width =
        `${Math.min(100, state.distance * 100)}%`;
      $('distance-label').textContent = `${Math.round(state.distance * 100)}%`;
      $('tension-label').textContent =
        state.tension > 0.8
          ? 'EASE OFF'
          : state.tension < 0.09
            ? 'TOO LOOSE'
            : 'STEADY';
      $<HTMLButtonElement>('action').classList.toggle('held', state.held);
      if (state.phase === 'reeling')
        $('pond-badge').textContent = state.surge
          ? 'The fish is surging — ease the line'
          : state.held
            ? 'Nice and steady. Bring it home.'
            : 'A breath, then reel again.';
    }
    function begin() {
      save();
      state = createTrip(saved);
      startTrip(state);
      lastRevision = -1;
      previousPhase = 'shore';
      lastTime = performance.now();
      $('overlay').hidden = true;
      $('tackle').hidden = false;
      $('tackle').inert = false;
      $<HTMLButtonElement>('pause').disabled = $<HTMLButtonElement>(
        'restart',
      ).disabled = false;
      $<HTMLButtonElement>('pause').textContent = 'Ⅱ';
      $<HTMLButtonElement>('pause').setAttribute('aria-label', 'Pause fishing');
      canvas.tabIndex = 0;
      render();
      canvas.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    function togglePause() {
      if (!pauseTrip(state)) return;
      lastTime = performance.now();
      $('tackle').inert = state.paused;
      canvas.tabIndex = state.paused ? -1 : 0;
      $<HTMLButtonElement>('pause').textContent = state.paused ? '▶' : 'Ⅱ';
      $<HTMLButtonElement>('pause').setAttribute(
        'aria-label',
        state.paused ? 'Resume fishing' : 'Pause fishing',
      );
      $('overlay').hidden = !state.paused;
      if (state.paused) {
        $('overlay').innerHTML =
          '<div class="opening"><span class="overline">THE POND WILL WAIT</span><h2>A moment<br>to yourself.</h2><p>Your line, your basket, and the afternoon are right where you left them.</p><button class="stamp-button" data-action="resume">Back to the water <span>↗</span></button></div>';
        $('overlay').querySelector('button')!.focus();
      } else focusPond();
      render();
    }
    function finish() {
      save();
      $('overlay').hidden = false;
      $('tackle').inert = true;
      $('tackle').hidden = true;
      $<HTMLButtonElement>('pause').disabled = true;
      canvas.tabIndex = -1;
      $('overlay').innerHTML =
        `<div class="opening"><span class="overline">THE AFTERNOON, WELL SPENT</span><h2>${state.banked ? 'That’s a<br>lovely little haul.' : 'A quiet<br>afternoon.'}</h2><div class="result-score">${state.banked}</div><small>POINTS SAFELY BANKED · BEST ${state.best}</small><div class="result-details"><span>${state.landed} landed</span><span>${state.lost} got away</span><span>${FISH.filter((f) => state.collection[f.id]).length} / 6 found</span></div><p>${!state.banked ? 'The pond kept its secrets today. Try a centered cast, then reel with little pauses.' : state.lost ? 'Some stories swam away. The ones you banked are waiting in your journal.' : 'A few quiet moments, and something new to remember.'}</p><button class="stamp-button" data-action="start">Another afternoon <span>↗</span></button></div>`;
      $('overlay').querySelector('button')!.focus({ preventScroll: true });
      $('overlay').scrollIntoView({ block: 'start' });
    }
    function action() {
      if (state.paused) return;
      if (state.phase === 'shore') {
        castLine(state);
        tone();
      } else if (state.phase === 'casting') {
        const caught = hookFish(state);
        tone(caught ? 'catch' : 'miss');
      }
      render();
      if (state.phase === 'ended') {
        previousPhase = 'ended';
        finish();
      } else focusPond();
    }
    const controller = new AbortController(),
      opts = { signal: controller.signal };
    for (const el of [canvas, $<HTMLButtonElement>('action')]) {
      scope.listen(
        el,
        'pointerdown',
        (e) => {
          if (state.phase === 'reeling' && !state.paused) {
            e.preventDefault();
            el.setPointerCapture?.(e.pointerId);
            setReeling(state, true);
          }
        },
        opts,
      );
      scope.listen(el, 'pointerup', () => setReeling(state, false), opts);
      scope.listen(el, 'pointercancel', () => setReeling(state, false), opts);
      scope.listen(
        el,
        'lostpointercapture',
        () => setReeling(state, false),
        opts,
      );
      scope.listen(el, 'click', action, opts);
    }
    scope.listen(
      $('overlay'),
      'click',
      (e) => {
        if (!(e.target instanceof Element)) return;
        const button = e.target.closest('button');
        if (button?.id === 'start' || button?.dataset.action === 'start')
          begin();
        else if (button?.dataset.action === 'resume') togglePause();
      },
      opts,
    );
    scope.listen(
      $<HTMLButtonElement>('bank'),
      'click',
      () => {
        bankBasket(state);
        render();
        tone('catch');
        if (state.phase === 'ended') {
          previousPhase = 'ended';
          finish();
        } else focusPond();
      },
      opts,
    );
    scope.listen(
      $<HTMLButtonElement>('risk'),
      'click',
      () => {
        riskBasket(state);
        render();
        focusPond();
      },
      opts,
    );
    scope.listen($<HTMLButtonElement>('pause'), 'click', togglePause, opts);
    scope.listen($<HTMLButtonElement>('restart'), 'click', begin, opts);
    scope.listen(
      $<HTMLButtonElement>('sound'),
      'click',
      () => {
        sound = !sound;
        $<HTMLButtonElement>('sound').innerHTML =
          `${sound ? 'Sound on' : 'Sound off'} <span>♪</span>`;
        $<HTMLButtonElement>('sound').setAttribute(
          'aria-pressed',
          String(sound),
        );
        tone();
      },
      opts,
    );
    scope.listen(
      window,
      'keydown',
      (e) => {
        if (!(e.target instanceof Element)) return;
        if (
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          e.target.closest('input,textarea,select,[contenteditable]')
        )
          return;
        if (
          !e.repeat &&
          (e.key.toLowerCase() === 'p' || e.key === 'Escape') &&
          !['ready', 'ended'].includes(state.phase)
        ) {
          e.preventDefault();
          togglePause();
          return;
        }
        if (
          e.code !== 'Space' ||
          state.paused ||
          ['ready', 'ended'].includes(state.phase)
        )
          return;
        if (
          e.target.closest('button,a') &&
          e.target !== $<HTMLButtonElement>('action')
        )
          return;
        if (
          e.target === $<HTMLButtonElement>('action') &&
          state.phase !== 'reeling'
        )
          return;
        e.preventDefault();
        if (state.phase === 'reeling') setReeling(state, true);
        else if (!e.repeat) action();
      },
      opts,
    );
    scope.listen(
      window,
      'keyup',
      (e) => {
        if (e.code === 'Space') setReeling(state, false);
      },
      opts,
    );
    scope.listen(window, 'blur', () => setReeling(state, false), opts);
    scope.listen(
      document,
      'visibilitychange',
      () => {
        if (
          document.hidden &&
          !state.paused &&
          !['ready', 'ended'].includes(state.phase)
        )
          togglePause();
      },
      opts,
    );
    $('tackle').inert = true;
    canvas.tabIndex = -1;
    function ellipse(
      x: number,
      y: number,
      rx: number,
      ry: number,
      fill: string | CanvasGradient | null,
      stroke?: string,
    ) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }
    function path(points: number[][], fill: string | CanvasGradient) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    function drawFish(
      x: number,
      y: number,
      scale: number,
      color: string,
      direction: number,
      t: number,
    ) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(direction * scale, scale);
      ctx.rotate(Math.sin(t) * 0.06);
      path(
        [
          [-27, 0],
          [-46, -14],
          [-42, 14],
        ],
        color,
      );
      ellipse(0, 0, 31, 13, color);
      ellipse(17, -3, 2, 2, '#426159');
      path(
        [
          [-8, -10],
          [3, -21],
          [13, -10],
        ],
        color,
      );
      ctx.restore();
    }
    function draw(now: number) {
      const t = reduced.matches || state.paused ? 0 : now;
      ctx.clearRect(0, 0, 960, 500);
      const sky = ctx.createLinearGradient(0, 0, 0, 500);
      sky.addColorStop(0, '#82abb6');
      sky.addColorStop(1, '#356c80');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 960, 500);
      path(
        [
          [0, 128],
          [70, 88],
          [167, 109],
          [252, 52],
          [364, 110],
          [462, 60],
          [558, 101],
          [679, 43],
          [787, 81],
          [894, 59],
          [960, 110],
          [960, 300],
          [0, 300],
        ],
        '#607f91',
      );
      path(
        [
          [0, 172],
          [114, 142],
          [200, 162],
          [284, 126],
          [384, 142],
          [445, 113],
          [550, 152],
          [674, 105],
          [824, 138],
          [960, 97],
          [960, 310],
          [0, 310],
        ],
        '#496e80',
      );
      for (let i = 0; i < 19; i++) {
        const x = i * 59 - 15,
          y = 135 + ((i * 19) % 42);
        ellipse(
          x,
          y,
          31 + (i % 3) * 8,
          45 + (i % 4) * 7,
          i % 2 ? '#3b6d70' : '#56847e',
        );
        ctx.strokeStyle = '#315d62';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 55);
        ctx.lineTo(x, y - 8);
        ctx.stroke();
      }
      ellipse(555, 342, 602, 228, '#486f6042');
      ellipse(555, 336, 602, 228, '#276a78');
      const water = ctx.createLinearGradient(0, 140, 0, 500);
      water.addColorStop(0, '#4f95a0');
      water.addColorStop(0.48, '#317c8d');
      water.addColorStop(1, '#1b506b');
      ellipse(558, 330, 558, 193, water);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(558, 330, 558, 193, 0, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 22; i++) {
        const x = ((i * 131) % 1050) - 40,
          y = 201 + ((i * 47) % 289);
        ctx.strokeStyle = i % 2 ? '#b1ead376' : '#163f6547';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(
          x + Math.sin(t * 0.5 + i) * 5,
          y,
          25 + (i % 4) * 16,
          3,
          0,
          0,
          Math.PI,
        );
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const x = 350 + ((i * 117) % 570) + Math.sin(t * 0.2 + i) * 32,
          y = 252 + ((i * 53) % 198);
        ctx.globalAlpha = 0.29;
        drawFish(x, y, 0.55 + (i % 2) * 0.2, '#123e55', i % 2 ? 1 : -1, t + i);
      }
      ctx.globalAlpha = 1;
      const rippleX =
          state.phase === 'reeling' ? 654 - state.distance * 260 : 654,
        rippleY = state.phase === 'reeling' ? 302 + state.distance * 47 : 302;
      if (['casting', 'reeling', 'decision'].includes(state.phase)) {
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.55 - i * 0.12;
          ctx.lineWidth = 1.4;
          ellipse(
            rippleX,
            rippleY,
            16 + i * 15 + Math.sin(t * 2) * 3,
            4 + i * 4,
            null,
            '#e9f8cd',
          );
        }
        ctx.globalAlpha = 1;
      }
      for (const [x, y, s] of [
        [798, 380, 1],
        [834, 413, 0.7],
        [893, 358, 0.85],
        [525, 190, 0.5],
        [635, 439, 0.9],
        [691, 468, 0.7],
      ]) {
        ctx.save();
        ctx.translate(x, y + Math.sin(t * 0.7 + x) * 1.2);
        ctx.scale(s, s);
        ellipse(1, 3, 26, 10, '#275d5952');
        const pad = ctx.createLinearGradient(0, -10, 0, 10);
        pad.addColorStop(0, '#a6c482');
        pad.addColorStop(1, '#547d58');
        ellipse(0, 0, 25, 10, pad);
        path(
          [
            [0, 0],
            [25, -3],
            [21, 5],
          ],
          '#a9c6b9',
        );
        ctx.strokeStyle = '#99b28c';
        ctx.beginPath();
        ctx.moveTo(-17, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      path(
        [
          [0, 332],
          [91, 354],
          [176, 410],
          [203, 500],
          [0, 500],
        ],
        '#618578',
      );
      path(
        [
          [0, 369],
          [79, 385],
          [145, 434],
          [164, 500],
          [0, 500],
        ],
        '#3e6c65',
      );
      for (let i = 0; i < 21; i++) {
        const x = (i * 41) % 156,
          y = 350 + ((i * 31) % 140);
        ctx.strokeStyle = i % 2 ? '#315853' : '#558276';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 32);
        ctx.quadraticCurveTo(
          x + Math.sin(t * 0.6 + i) * 4,
          y - 5,
          x + 8,
          y - 20,
        );
        ctx.stroke();
      }
      // The little pier, its uneven planks, and our patient angler.
      ctx.shadowColor = '#204b4055';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 12;
      path(
        [
          [88, 381],
          [341, 334],
          [395, 407],
          [123, 470],
        ],
        '#70553c',
      );
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const wood = ctx.createLinearGradient(100, 340, 350, 450);
      wood.addColorStop(0, '#d4b585');
      wood.addColorStop(0.5, '#ba9463');
      wood.addColorStop(1, '#916c45');
      path(
        [
          [85, 364],
          [338, 320],
          [394, 389],
          [120, 449],
        ],
        wood,
      );
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = '#987c58';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(99 + i * 34, 361 - i * 5.8);
        ctx.lineTo(130 + i * 34, 444 - i * 7.4);
        ctx.stroke();
        ctx.fillStyle = '#785b3e';
        ellipse(108 + i * 33, 370 - i * 6, 1.8, 1.8, '#705c42');
        ctx.strokeStyle = '#edcea057';
        ctx.beginPath();
        ctx.moveTo(102 + i * 34, 363 - i * 5.8);
        ctx.lineTo(129 + i * 34, 438 - i * 7.4);
        ctx.stroke();
      }
      path(
        [
          [145, 438],
          [155, 436],
          [155, 487],
          [145, 487],
        ],
        '#77674c',
      );
      path(
        [
          [355, 397],
          [365, 395],
          [365, 443],
          [355, 443],
        ],
        '#77674c',
      );
      ellipse(259, 369, 47, 13, '#786c5133');
      ctx.strokeStyle = '#bd9972';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(226, 348);
      ctx.bezierCurveTo(182, 366, 175, 318, 199, 324);
      ctx.stroke();
      ellipse(252, 320, 30, 43, '#e5c8a0');
      ellipse(241, 353, 16, 10, '#e5c8a0');
      ellipse(273, 353, 16, 10, '#e5c8a0');
      path(
        [
          [226, 277],
          [222, 241],
          [248, 256],
        ],
        '#e5c8a0',
      );
      path(
        [
          [260, 255],
          [286, 239],
          [282, 278],
        ],
        '#e5c8a0',
      );
      path(
        [
          [231, 265],
          [229, 251],
          [243, 260],
        ],
        '#cf9f86',
      );
      path(
        [
          [268, 260],
          [281, 249],
          [278, 267],
        ],
        '#cf9f86',
      );
      ellipse(255, 278, 32, 29, '#e8cda6');
      ellipse(264, 288, 22, 15, '#f2dfbe');
      ellipse(247, 279, 2.4, 3.2, '#4f5542');
      ellipse(269, 278, 2.4, 3.2, '#4f5542');
      path(
        [
          [255, 287],
          [262, 287],
          [258, 291],
        ],
        '#ab8069',
      );
      ctx.strokeStyle = '#957d60';
      ctx.lineWidth = 1.2;
      for (const y of [287, 293]) {
        ctx.beginPath();
        ctx.moveTo(234, y);
        ctx.lineTo(216, y - 2);
        ctx.moveTo(279, y);
        ctx.lineTo(296, y - 2);
        ctx.stroke();
      }
      path(
        [
          [229, 311],
          [277, 307],
          [282, 317],
          [237, 323],
        ],
        '#a66950',
      );
      path(
        [
          [273, 315],
          [283, 313],
          [285, 337],
          [270, 332],
        ],
        '#a66950',
      );
      // Straw hat and a gently flexing bamboo rod.
      ellipse(253, 250, 48, 8, '#c4a573');
      path(
        [
          [226, 247],
          [234, 232],
          [269, 231],
          [281, 246],
        ],
        '#d4ba85',
      );
      ctx.strokeStyle = '#a08b5d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(234, 241);
      ctx.lineTo(274, 241);
      ctx.stroke();
      ctx.strokeStyle = '#6b6247';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(272, 318);
      ctx.quadraticCurveTo(340, 190, 438, 158 + (state.held ? 7 : 0));
      ctx.stroke();
      ellipse(277, 318, 9, 8, '#efd6af');
      ctx.strokeStyle = '#e8dab3';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(438, 158 + (state.held ? 7 : 0));
      ctx.quadraticCurveTo(566, 205, rippleX, rippleY - 5);
      ctx.stroke();
      ellipse(rippleX, rippleY - 4 + Math.sin(t * 2) * 1.5, 4, 8, '#ffae76');
      ellipse(rippleX, rippleY - 8 + Math.sin(t * 2) * 1.5, 4, 4, '#f4e7ce');
      if (state.phase === 'reeling' && state.fish) {
        ctx.globalAlpha = 0.6;
        drawFish(rippleX + 22, rippleY + 12, 0.6, state.fish.color, -1, t * 3);
        ctx.globalAlpha = 1;
      }
      if (state.phase === 'decision' && state.fish) {
        ctx.save();
        ctx.translate(375, 297 + Math.sin(t * 2) * 3);
        ctx.rotate(-0.4);
        drawFish(0, 0, 0.8, state.fish.color, 1, t);
        ctx.restore();
      }
      ellipse(171, 408, 20, 9, '#927954');
      path(
        [
          [152, 392],
          [154, 411],
          [187, 406],
          [188, 387],
        ],
        '#b39566',
      );
      ellipse(170, 390, 19, 7, '#6c7457');
      ctx.strokeStyle = '#cfb78a';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(155 + i * 9, 393);
        ctx.lineTo(157 + i * 8, 407);
        ctx.stroke();
      }
      // Willow boughs frame the view; no downloaded artwork.
      ctx.strokeStyle = '#2c5a65';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(960, 24);
      ctx.bezierCurveTo(872, 9, 866, 86, 781, 91);
      ctx.stroke();
      for (let i = 0; i < 10; i++) {
        const x = 808 + i * 16,
          y = 77 - i * 4;
        ctx.strokeStyle = '#3d736d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
          x - 12 + Math.sin(t * 0.55 + i) * 3,
          y + 40,
          x - 8,
          y + 90,
        );
        ctx.stroke();
        for (let j = 0; j < 5; j++) {
          ctx.save();
          ctx.translate(x - 7 + Math.sin(t * 0.55 + i) * 2, y + 18 + j * 14);
          ctx.rotate(j % 2 ? -0.5 : 0.4);
          ellipse(0, 0, 3, 10, '#4b8779');
          ctx.restore();
        }
      }
    }
    document.fonts.ready.then(() => {
      if (!disposed) draw(visualTime);
    });
    function frame(now: number) {
      if (disposed) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;
      if (!state.paused) visualTime += dt;
      const oldLanded = state.landed,
        oldLost = state.lost;
      advanceTrip(state, dt);
      render();
      draw(visualTime);
      if (state.landed > oldLanded) tone('catch');
      if (state.lost > oldLost) tone('miss');
      if (state.phase === 'ended' && previousPhase !== 'ended') finish();
      previousPhase = state.phase;
      raf = scope.raf(frame);
    }
    scope.listen(window, 'pagehide', (event) => {
      if (event.persisted) {
        if (!state.paused && !['ready', 'ended'].includes(state.phase))
          togglePause();
        return;
      }
      disposed = true;
      scope.cancelFrame(raf);
      controller.abort();
      audio?.close();
    });
    render();
    raf = scope.raf(frame);
    scope.add(() => {
      disposed = true;
      controller.abort();
      audio?.close().catch(() => {});
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
