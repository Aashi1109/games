import type { GameInput, GameState } from './engine.ts';
type GameElements = {
  field: HTMLCanvasElement;
  launch: HTMLButtonElement;
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  sound: HTMLButtonElement;
};
import {
  SECTORS,
  createGame,
  startGame,
  stepGame,
  autopilot,
} from './engine.ts';
import { createRenderer } from './renderer.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    const $ = <K extends string>(id: K) =>
      scope.byId<K extends keyof GameElements ? GameElements[K] : HTMLElement>(
        id,
      );
    const canvas = $('field');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = createRenderer(canvas, () => motion.matches);
    const keyActions: Record<string, keyof GameInput> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'thrust',
      KeyW: 'thrust',
      Space: 'fire',
    };
    const heldKeys = new Map<string, keyof GameInput>();
    const heldPointers = new Map<number, keyof GameInput>();
    let game = createGame(preview ? 76123 : Date.now());
    let attract = startGame(createGame(317));
    for (let i = 0; i < 720; i++) stepGame(attract, 1 / 60, autopilot(attract));
    let paused = false;
    let lastFrame = 0;
    let previewEndAt = 0;
    let previousPhase = 'ready';
    let previousHulls = 3;
    let best = 0;
    let sound = false;
    let audioContext: AudioContext | undefined;
    let finalRecorded = false;
    let lastHud = '';
    const fitCanvas = renderer.resize;
    if (preview) {
      document.body.classList.add('is-preview');
      canvas.removeAttribute('tabindex');
      canvas.setAttribute(
        'aria-label',
        'Autonomous Asteroid Run gameplay preview',
      );
      $('prompt').hidden = true;
      startGame(game);
      for (let i = 0; i < 600; i++) stepGame(game, 1 / 60, autopilot(game));
    } else {
      try {
        const saved: unknown = JSON.parse(
          localStorage.getItem('asteroid-run-best') ?? 'null',
        );
        if (typeof saved === 'number' && Number.isFinite(saved) && saved >= 0)
          best = Math.floor(saved);
      } catch {
        /* Storage is optional. */
      }
    }
    function announce(message: string) {
      if (!preview) $('announcement').textContent = message;
    }
    function updateHUD() {
      const scene = game.phase === 'ready' ? attract : game;
      const speed =
        Math.round(Math.hypot(scene.ship.vx, scene.ship.vy) / 5) * 5;
      const value = [
        game.score,
        game.sector,
        game.hulls,
        scene.rocks.length,
        game.phase,
        game.ship.shield > 0,
        paused,
        best,
        speed,
      ].join(':');
      if (value === lastHud) return;
      lastHud = value;
      $('score').textContent = String(game.score).padStart(5, '0');
      $('sector').innerHTML =
        `${String(game.sector).padStart(2, '0')} <small>/ 04</small>`;
      $('hulls').innerHTML = Array.from(
        { length: 3 },
        (_, index) =>
          `<svg class="hull-icon ${index < game.hulls ? '' : 'is-spent'}" viewBox="0 0 18 25" aria-hidden="true"><path d="M9 2 2 22l7-4 7 4Z"/></svg>`,
      ).join('');
      $('hulls').setAttribute('role', 'img');
      $('hulls').setAttribute(
        'aria-label',
        `${game.hulls} ${game.hulls === 1 ? 'hull' : 'hulls'} remaining`,
      );
      $('best').textContent = String(Math.max(best, game.score)).padStart(
        5,
        '0',
      );
      $('rock-count').textContent =
        `${String(scene.rocks.length).padStart(2, '0')} ${scene.rocks.length === 1 ? 'CONTACT' : 'CONTACTS'}`;
      $('velocity').textContent = `${String(speed).padStart(3, '0')} M/S`;
      $('thrust-meter').style.width = `${(speed / 280) * 100}%`;
      root.querySelectorAll('.route-step').forEach((step, index) => {
        step.classList.toggle('is-current', index + 1 === game.sector);
        step.classList.toggle(
          'is-cleared',
          index + 1 < game.sector || game.phase === 'won',
        );
      });
      $('flight-state').textContent = preview
        ? 'AUTOPILOT / LIVE'
        : paused
          ? 'FLIGHT PAUSED'
          : game.phase === 'ready'
            ? 'TRAINING FEED / STANDBY'
            : game.phase === 'won'
              ? 'ROUTE COMPLETE'
              : game.phase === 'lost'
                ? 'SIGNAL LOST'
                : game.ship.shield > 0
                  ? 'SHIELD ACTIVE'
                  : 'FLIGHT IN PROGRESS';
      $('flight-state').style.color = game.phase === 'lost' ? '#edbb7e' : '';
      $('pause').disabled = !['playing', 'between'].includes(game.phase);
      $('pause').innerHTML = paused
        ? 'RESUME <span>ESC</span>'
        : 'PAUSE <span>ESC</span>';
      $('pause').setAttribute(
        'aria-label',
        paused ? 'Resume run' : 'Pause run',
      );
      $('sector-banner').hidden = game.phase !== 'between' || paused;
      $('next-sector').textContent =
        `${String(game.sector + 1).padStart(2, '0')} INBOUND`;
    }
    function clearInputs() {
      heldKeys.clear();
      heldPointers.clear();
      root
        .querySelectorAll<HTMLButtonElement>('[data-action]')
        .forEach((button) => button.classList.remove('is-held'));
      game.ship.thrust = false;
    }
    function playerInput() {
      const input: GameInput = {};
      for (const action of [...heldKeys.values(), ...heldPointers.values()])
        input[action] = true;
      return input;
    }
    function showPrompt(kind: GameState['phase']) {
      const content = (
        {
          paused: [
            'FLIGHT ON HOLD',
            'Take a breath.',
            'Your ship is right where you left it.',
            'RESUME RUN',
          ],
          won: [
            'ALL SECTORS CLEAR',
            'The way is clear.',
            `${game.score.toLocaleString()} points · ${game.hulls} ${game.hulls === 1 ? 'hull' : 'hulls'} brought home.`,
            'FLY AGAIN',
          ],
          lost: [
            'TRANSMISSION ENDED',
            'Good run, pilot.',
            `${game.score.toLocaleString()} points · reached sector ${game.sector} of ${SECTORS}.`,
            'TRY AGAIN',
          ],
        } as Partial<Record<GameState['phase'], string[]>>
      )[kind];
      if (!content) return;
      $('prompt-kicker').textContent = content[0];
      $('prompt-title').textContent = content[1];
      $('prompt-copy').textContent = content[2];
      $('launch').innerHTML = `${content[3]} <span aria-hidden="true">↗</span>`;
      $('debrief').hidden = kind === 'paused';
      $('mission-spec').hidden = true;
      $('debrief-time').textContent =
        `${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}`;
      $('debrief-accuracy').textContent = game.shots
        ? `${Math.round((game.hits / game.shots) * 100)}%`
        : '—';
      $('prompt').dataset.state = kind;
      $('prompt').hidden = false;
    }
    function beginRun() {
      clearInputs();
      if (game.phase !== 'ready') game = createGame(Date.now());
      startGame(game);
      paused = false;
      finalRecorded = false;
      previousPhase = game.phase;
      previousHulls = 3;
      $('prompt').hidden = true;
      $('run-hint').textContent =
        'Clear all four sectors. Fly off an edge to wrap around.';
      canvas.focus({ preventScroll: true });
      announce('Run started. Three hulls, four sectors.');
      lastFrame = performance.now();
      updateHUD();
    }
    function setPaused(value: boolean, focus = false) {
      if (!['playing', 'between'].includes(game.phase)) return;
      paused = value;
      clearInputs();
      lastFrame = performance.now();
      if (paused) {
        showPrompt('paused');
        if (focus) $('launch').focus({ preventScroll: true });
        announce('Run paused. Activate Resume run to continue.');
      } else {
        $('prompt').hidden = true;
        canvas.focus({ preventScroll: true });
        announce('Run resumed.');
      }
      updateHUD();
    }
    function playTone(event: string) {
      if (!sound || !audioContext || audioContext.state !== 'running') return;
      const values = (
        {
          fire: [430, 0.045, 0.015],
          rock: [100, 0.08, 0.025],
          hit: [48, 0.3, 0.045],
          clear: [650, 0.16, 0.025],
          won: [900, 0.4, 0.03],
        } as Record<string, number[]>
      )[event];
      if (!values) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = event === 'fire' ? 'triangle' : 'square';
      oscillator.frequency.setValueAtTime(values[0], audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, values[0] * 0.5),
        audioContext.currentTime + values[1],
      );
      gain.gain.setValueAtTime(values[2], audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + values[1],
      );
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + values[1]);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    if (!preview) {
      scope.listen($('launch'), 'click', () =>
        paused ? setPaused(false) : beginRun(),
      );
      scope.listen($('restart'), 'click', beginRun);
      scope.listen($('pause'), 'click', () => setPaused(!paused, true));
      scope.listen($('sound'), 'click', async () => {
        try {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) throw new Error('Audio unavailable');
          audioContext ??= new Audio();
          await audioContext.resume();
          if (scope.disposed) return;
          sound = !sound;
          $('sound').textContent = sound ? 'SOUND ON' : 'SOUND OFF';
          $('sound').setAttribute('aria-pressed', String(sound));
          if (sound) playTone('clear');
        } catch {
          $('sound').textContent = 'NO AUDIO';
          $('sound').disabled = true;
          announce('Audio is unavailable. The game still works without sound.');
        }
      });
      scope.listen(document, 'keydown', (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === 'Escape' && !event.repeat) {
          event.preventDefault();
          setPaused(!paused, true);
          return;
        }
        if (
          (event.target instanceof Element ? event.target : null)?.closest(
            'button,a,summary,input,select,textarea',
          )
        )
          return;
        const action = keyActions[event.code];
        if (action && !paused && ['playing', 'between'].includes(game.phase)) {
          event.preventDefault();
          heldKeys.set(event.code, action);
        }
      });
      scope.listen(document, 'keyup', (event) => heldKeys.delete(event.code));
      root
        .querySelectorAll<HTMLButtonElement>('[data-action]')
        .forEach((button) => {
          const action = button.dataset.action as keyof GameInput;
          const release = (event: PointerEvent) => {
            heldPointers.delete(event.pointerId);
            if (
              ![...heldPointers.values(), ...heldKeys.values()].includes(action)
            )
              button.classList.remove('is-held');
          };
          scope.listen(button, 'pointerdown', (event) => {
            if (
              paused ||
              game.phase !== 'playing' ||
              (event.pointerType === 'mouse' && event.button !== 0)
            )
              return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            heldPointers.set(event.pointerId, action);
            button.classList.add('is-held');
          });
          for (const event of [
            'pointerup',
            'pointercancel',
            'lostpointercapture',
          ] as const)
            scope.listen(button, event, release);
          scope.listen(button, 'keydown', (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (
              !['Space', 'Enter'].includes(event.code) ||
              paused ||
              game.phase !== 'playing'
            )
              return;
            event.preventDefault();
            heldKeys.set(`button-${action}`, action);
            button.classList.add('is-held');
          });
          scope.listen(button, 'keyup', (event) => {
            if (!['Space', 'Enter'].includes(event.code)) return;
            event.preventDefault();
            heldKeys.delete(`button-${action}`);
            button.classList.remove('is-held');
          });
          scope.listen(button, 'blur', () => {
            heldKeys.delete(`button-${action}`);
            button.classList.remove('is-held');
          });
          scope.listen(button, 'contextmenu', (event) =>
            event.preventDefault(),
          );
        });
      scope.listen(window, 'blur', () => {
        clearInputs();
        setPaused(true);
      });
      scope.listen(document, 'visibilitychange', () => {
        if (document.hidden) {
          clearInputs();
          setPaused(true);
        }
      });
    }
    function render() {
      renderer.draw(game.phase === 'ready' ? attract : game, { paused });
    }
    function processState() {
      if (game.hulls < previousHulls) {
        announce(
          game.hulls
            ? `Hull lost. ${game.hulls} remaining. Respawning with a shield.`
            : 'Run ended. All hulls lost.',
        );
        $('run-hint').textContent = game.hulls
          ? `${game.hulls} ${game.hulls === 1 ? 'hull' : 'hulls'} left. Your respawn shield buys a little room.`
          : 'A fresh route is one launch away.';
      }
      previousHulls = game.hulls;
      if (game.phase !== previousPhase) {
        if (game.phase === 'between')
          announce(
            `Sector ${game.sector} clear. Sector ${game.sector + 1} incoming.`,
          );
        if (['won', 'lost'].includes(game.phase)) {
          clearInputs();
          if (!finalRecorded) {
            best = Math.max(best, game.score);
            try {
              localStorage.setItem('asteroid-run-best', JSON.stringify(best));
            } catch {
              /* A run never depends on storage. */
            }
            finalRecorded = true;
          }
          showPrompt(game.phase);
          $('launch').focus({ preventScroll: true });
          announce(
            `${game.phase === 'won' ? 'All four sectors cleared.' : 'Run ended.'} ${game.score} points. Activate ${game.phase === 'won' ? 'Fly again' : 'Try again'} to restart.`,
          );
        }
      }
      previousPhase = game.phase;
    }
    function frame(now: number) {
      const delta = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      if (!paused && !document.hidden) {
        if (game.phase === 'ready') {
          stepGame(attract, delta, autopilot(attract));
          if (['won', 'lost'].includes(attract.phase))
            attract = startGame(createGame(attract.seed + 997));
        }
        stepGame(game, delta, preview ? autopilot(game) : playerInput());
        if (preview) {
          if (['won', 'lost'].includes(game.phase)) {
            previewEndAt ||= now;
            if (now - previewEndAt > 1600) {
              game = startGame(createGame((game.seed + 991) >>> 0));
              previewEndAt = 0;
            }
          }
        } else {
          for (const event of game.events) playTone(event);
          processState();
        }
      }
      updateHUD();
      render();
      scope.raf(frame);
    }
    scope.observe(new ResizeObserver(fitCanvas)).observe(canvas);
    fitCanvas();
    updateHUD();
    render();
    scope.raf(frame);
    scope.add(() => {
      audioContext?.close().catch(() => {});
    });
    return () => scope.dispose();
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
