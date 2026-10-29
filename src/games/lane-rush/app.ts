type GameElements = {
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  road: HTMLCanvasElement;
  action: HTMLButtonElement;
  left: HTMLButtonElement;
  brake: HTMLButtonElement;
  right: HTMLButtonElement;
};
import {
  RUN_SECONDS,
  MAX_SPEED,
  createGame,
  startGame,
  moveLane,
  pauseGame,
  demoLane,
  stepGame,
  clamp,
} from './engine.ts';
import { createRenderer } from './renderer.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    document.documentElement.classList.toggle('preview', preview);
    const $ = <K extends string>(id: K) =>
      scope.byId<K extends keyof GameElements ? GameElements[K] : HTMLElement>(
        id,
      );
    const canvas = $('road');
    const reducedMotion = matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const renderer = createRenderer(canvas, { preview, reducedMotion });
    let state = preview ? startGame(742019) : createGame(Date.now());
    let best = 0;
    if (!preview) {
      try {
        const saved = Number(localStorage.getItem('lane-rush-best'));
        if (Number.isFinite(saved) && saved >= 0 && saved < 1e9) best = saved;
      } catch {
        /* Storage is optional. */
      }
    }
    let frame = 0;
    let lastTime = performance.now();
    let lastPhase = '';
    let lastUI = '';
    let endedAt = 0;
    let toastUntil = 0;
    let brakePointer: number | null = null;
    let brakeKey = false;
    let brakePulse = 0;
    let swipe: { id: number; x: number; y: number } | null = null;
    const keys = new Set<string>();
    function draw() {
      renderer.draw(state);
    }
    function clearInput() {
      keys.clear();
      brakeKey = false;
      brakePointer = null;
      brakePulse = 0;
      swipe = null;
    }
    function updateUI(force = false) {
      if (preview) return;
      document.body.dataset.phase = state.phase;
      const remaining = Math.max(0, RUN_SECONDS - state.time);
      const whole = Math.ceil(remaining);
      const stamp = `${state.phase}/${whole}/${Math.round(state.speed)}/${state.score}/${Math.floor(state.distance / 10)}/${state.health}/${state.brake}/${state.invulnerable > 0}`;
      if (!force && stamp === lastUI) return;
      lastUI = stamp;
      const time = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
      $('time').textContent = time;
      $('speed').textContent = String(
        state.phase === 'ready' ? 0 : Math.round(state.speed * 0.6),
      ).padStart(3, '0');
      $('score').textContent = String(state.score).padStart(5, '0');
      $('distance').innerHTML =
        `${(state.distance / 1000).toFixed(2)} <small>KM</small>`;
      $('best').textContent = best ? String(best).padStart(5, '0') : '—';
      $('health')
        .querySelectorAll('span')
        .forEach((element, index) =>
          element.classList.toggle('used', index >= state.health),
        );
      $('health').setAttribute(
        'aria-label',
        `${state.health} hit${state.health === 1 ? '' : 's'} remaining`,
      );
      $('health-copy').textContent =
        state.phase === 'lost'
          ? 'CAR RETIRED'
          : state.phase === 'won'
            ? 'FINISH REACHED'
            : state.invulnerable > 0
              ? 'RECOVERING · KEEP MOVING'
              : `${state.health} HIT${state.health === 1 ? '' : 'S'} TO RETIRE`;
      root
        .querySelectorAll('.speed-ticks i')
        .forEach((element, index) =>
          element.classList.toggle(
            'lit',
            state.phase !== 'ready' && index / 12 < state.speed / MAX_SPEED,
          ),
        );
      $('track-status').textContent =
        state.phase === 'ready'
          ? 'GRID OPEN'
          : state.phase === 'paused'
            ? 'SESSION PAUSED'
            : state.phase === 'won'
              ? 'CHEQUERED FLAG'
              : state.phase === 'lost'
                ? 'SESSION OVER'
                : state.brake
                  ? 'BRAKING'
                  : `SECTOR ${Math.min(3, Math.floor(state.time / 30) + 1)} / 3 · LIVE`;
      $('pause').disabled = !['playing', 'paused'].includes(state.phase);
      $('pause').innerHTML =
        state.phase === 'paused'
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg><span>RESUME</span>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span>PAUSE</span>';
      $('pause').setAttribute(
        'aria-label',
        state.phase === 'paused' ? 'Resume run' : 'Pause run',
      );
      $('restart').disabled = state.phase === 'ready';
      $('drive-controls').inert = state.phase !== 'playing';
      canvas.inert = state.phase !== 'playing';
      $('brake').classList.toggle(
        'pressed',
        state.brake && state.phase === 'playing',
      );
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        $('overlay').hidden = state.phase === 'playing';
        if (state.phase === 'paused') {
          $('overlay-kicker').textContent = 'TIME OUT';
          $('overlay-title').innerHTML = 'Hold<br>your line.';
          $('overlay-copy').textContent =
            'The clock is stopped. Your run is right here.';
          $('action').innerHTML =
            'RESUME RUN <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
          $('overlay-hint').textContent = 'ESC / P TO RESUME';
        } else if (state.phase === 'won' || state.phase === 'lost') {
          $('overlay-kicker').textContent =
            state.phase === 'won'
              ? 'CHEQUERED FLAG · 90 SECONDS'
              : `${state.time.toFixed(1)} SECONDS · THREE HITS`;
          $('overlay-title').innerHTML =
            state.phase === 'won'
              ? 'Finish<br>reached.'
              : 'End of<br>the road.';
          $('overlay-copy').textContent =
            `${state.score.toLocaleString()} points · ${(state.distance / 1000).toFixed(2)} km. ${state.overtakes} passes, ${state.nearMisses} close calls.`;
          $('action').innerHTML =
            'RACE AGAIN <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
          $('overlay-hint').textContent =
            state.score >= best && state.score > 0
              ? 'PERSONAL BEST. FIND ANOTHER GEAR.'
              : 'ANOTHER RUN. ANOTHER CHANCE.';
        }
      }
    }
    function begin() {
      clearInput();
      renderer.reset();
      state = startGame(Date.now());
      toastUntil = 0;
      $('toast').textContent = '';
      updateUI(true);
      canvas.focus({ preventScroll: true });
    }
    function pause(value: boolean) {
      state = pauseGame(state, value);
      clearInput();
      updateUI(true);
      (state.phase === 'paused' ? $('action') : canvas).focus({
        preventScroll: true,
      });
    }
    function steer(direction: number) {
      state = moveLane(state, direction);
      canvas.focus({ preventScroll: true });
    }
    function result() {
      clearInput();
      endedAt = performance.now();
      if (preview) return;
      if (state.score > best) {
        best = state.score;
        try {
          localStorage.setItem('lane-rush-best', String(best));
        } catch {
          /* A run works without storage. */
        }
      }
      $('toast').textContent = '';
      toastUntil = 0;
      updateUI(true);
      $('action').focus({ preventScroll: true });
    }
    if (!preview) {
      scope.listen($('action'), 'click', () =>
        state.phase === 'paused' ? pause(false) : begin(),
      );
      scope.listen($('restart'), 'click', begin);
      scope.listen($('pause'), 'click', () => pause(state.phase !== 'paused'));
      scope.listen($('left'), 'click', () => steer(-1));
      scope.listen($('right'), 'click', () => steer(1));
      scope.listen($('brake'), 'pointerdown', (event) => {
        if (state.phase !== 'playing') return;
        event.preventDefault();
        brakePointer = event.pointerId;
        $('brake').setPointerCapture(event.pointerId);
      });
      const releaseBrake = (event: PointerEvent) => {
        if (event.pointerId === brakePointer) brakePointer = null;
      };
      scope.listen($('brake'), 'pointerup', releaseBrake);
      scope.listen($('brake'), 'pointercancel', releaseBrake);
      scope.listen($('brake'), 'lostpointercapture', releaseBrake);
      scope.listen($('brake'), 'keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (
          ['Space', 'Enter'].includes(event.code) &&
          state.phase === 'playing'
        ) {
          event.preventDefault();
          event.stopPropagation();
          brakeKey = true;
        }
      });
      scope.listen($('brake'), 'keyup', (event) => {
        if (['Space', 'Enter'].includes(event.code)) {
          brakeKey = false;
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          event.stopPropagation();
        }
      });
      scope.listen($('brake'), 'blur', () => {
        brakeKey = false;
      });
      scope.listen($('brake'), 'click', (event) => {
        if (event.detail === 0) brakePulse = 0.35;
      });
      scope.listen(canvas, 'pointerdown', (event) => {
        if (state.phase !== 'playing' || swipe) return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
        canvas.focus({ preventScroll: true });
      });
      scope.listen(canvas, 'pointermove', (event) => {
        if (!swipe || swipe.id !== event.pointerId) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) {
          steer(Math.sign(dx));
          swipe = null;
        }
      });
      const clearSwipe = () => {
        swipe = null;
      };
      scope.listen(canvas, 'pointerup', clearSwipe);
      scope.listen(canvas, 'pointercancel', clearSwipe);
      scope.listen(canvas, 'lostpointercapture', clearSwipe);
      scope.listen(window, 'keydown', (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (!['playing', 'paused'].includes(state.phase)) return;
        if (['Escape', 'KeyP'].includes(event.code)) {
          event.preventDefault();
          if (!event.repeat) pause(state.phase !== 'paused');
          return;
        }
        if (
          state.phase !== 'playing' ||
          (event.target instanceof HTMLElement &&
            (event.target instanceof Element ? event.target : null)?.closest(
              'button,a,input,select,textarea,[contenteditable="true"]',
            ))
        )
          return;
        if (
          ![
            'ArrowLeft',
            'ArrowRight',
            'KeyA',
            'KeyD',
            'ArrowDown',
            'KeyS',
            'Space',
          ].includes(event.code)
        )
          return;
        event.preventDefault();
        keys.add(event.code);
        if (!event.repeat && ['ArrowLeft', 'KeyA'].includes(event.code))
          steer(-1);
        if (!event.repeat && ['ArrowRight', 'KeyD'].includes(event.code))
          steer(1);
      });
      scope.listen(window, 'keyup', (event) => keys.delete(event.code));
      scope.listen(window, 'blur', () => {
        if (state.phase === 'playing') pause(true);
        else clearInput();
      });
      scope.listen(document, 'visibilitychange', () => {
        if (document.hidden && state.phase === 'playing') pause(true);
      });
    } else {
      canvas.tabIndex = -1;
      canvas.setAttribute('aria-hidden', 'true');
    }
    function resize() {
      renderer.resize(state);
    }
    const observer = scope.observe(new ResizeObserver(resize));
    observer.observe(canvas);
    function animate(now: number) {
      const dt = clamp((now - lastTime) / 1000, 0, 1 / 30);
      lastTime = now;
      if (state.phase === 'playing') {
        brakePulse = Math.max(0, brakePulse - dt);
        const input = preview
          ? { lane: demoLane(state) }
          : {
              brake:
                brakePointer !== null ||
                brakeKey ||
                brakePulse > 0 ||
                ['ArrowDown', 'KeyS', 'Space'].some((key) => keys.has(key)),
            };
        state = stepGame(state, input, dt);
        renderer.update(dt, state.events, state);
        if (!preview) {
          for (const event of state.events) {
            if (event.type === 'damage' || event.type === 'near-miss') {
              $('toast').textContent =
                event.type === 'damage'
                  ? `${event.health} HIT${event.health === 1 ? '' : 'S'} LEFT · KEEP GOING`
                  : 'CLOSE CALL +125';
              $('toast').classList.toggle('damage', event.type === 'damage');
              toastUntil = state.time + 1.1;
              if (!reducedMotion)
                $('toast').animate(
                  [
                    {
                      opacity: 0,
                      transform: 'translate(-50%, 9px) scale(.92)',
                    },
                    { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
                  ],
                  { duration: 180, easing: 'ease-out' },
                );
            }
          }
        }
        if (state.phase === 'won' || state.phase === 'lost') result();
      } else if (preview && endedAt && now - endedAt > 900) {
        renderer.reset();
        state = startGame(state.initialSeed + 719);
        endedAt = 0;
      }
      if (!preview) {
        if (toastUntil && state.time > toastUntil) {
          $('toast').textContent = '';
          toastUntil = 0;
        }
        $('progress').style.transform = `scaleX(${state.time / RUN_SECONDS})`;
        $('timer-bar').style.transform =
          `scaleX(${1 - state.time / RUN_SECONDS})`;
        updateUI();
      }
      draw();
      frame = scope.raf(animate);
    }
    scope.listen(window, 'pagehide', () => {
      scope.cancelFrame(frame);
      observer.disconnect();
    });
    scope.listen(window, 'pageshow', (event) => {
      if (event.persisted) {
        observer.observe(canvas);
        lastTime = performance.now();
        scope.cancelFrame(frame);
        frame = scope.raf(animate);
      }
    });
    updateUI(true);
    resize();
    frame = scope.raf(animate);
    scope.add(() => {
      observer.disconnect();
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
