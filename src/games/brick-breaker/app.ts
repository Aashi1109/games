type GameElements = {
  sound: HTMLButtonElement;
  pause: HTMLButtonElement;
  restart: HTMLButtonElement;
  game: HTMLCanvasElement;
  start: HTMLButtonElement;
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  launch: HTMLButtonElement;
};
import {
  WIDTH,
  HEIGHT,
  LEVELS,
  createGame,
  launch,
  pauseGame,
  resumeGame,
  movePaddle,
  stepGame,
  safeBest,
} from './engine.ts';
import { createRenderer } from './renderer.ts';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';

export function mountGame(root: HTMLElement) {
  const scope = createGameLifecycle(root);
  try {
    const $ = <K extends string>(id: K) =>
        scope.byId<
          K extends keyof GameElements ? GameElements[K] : HTMLElement
        >(id),
      canvas = $('game');
    const keys = new Set<string>();
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = createRenderer(canvas, reduced);
    let game = createGame(),
      best = 0,
      lastTime = 0,
      frameId: number = 0,
      disposed = false,
      revision = -1,
      shownPhase = '',
      target: number | null = null,
      dragging: number | null = null,
      audio: AudioContext | undefined,
      sound = false,
      demoDelay = 0,
      terminalSaved = false;
    if (!preview) {
      try {
        best = safeBest(
          JSON.parse(localStorage.getItem('breakpoint-best') ?? 'null'),
        );
      } catch {}
    } else {
      document.body.classList.add('preview');
      canvas.tabIndex = -1;
    }
    $('best').textContent = String(best).padStart(5, '0');
    function clearInput() {
      keys.clear();
      target = null;
      dragging = null;
      game.paddle.vx = 0;
      $('left').classList.remove('active');
      $('right').classList.remove('active');
    }
    function tone(type: string) {
      if (!sound || preview) return;
      try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume().catch(() => {});
        const osc = audio.createOscillator(),
          gain = audio.createGain(),
          now = audio.currentTime;
        osc.type = type === 'lost' ? 'triangle' : 'sine';
        const frequency =
          type === 'brick'
            ? 520 + Math.min(10, game.rally) * 35
            : type === 'clear'
              ? 880
              : type === 'paddle'
                ? 280
                : type === 'lost'
                  ? 120
                  : 420;
        osc.frequency.setValueAtTime(frequency, now);
        osc.frequency.exponentialRampToValueAtTime(
          type === 'lost' ? 65 : frequency * 1.18,
          now + 0.09,
        );
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(now);
        osc.stop(now + 0.17);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      } catch {
        sound = false;
        $('sound-state').textContent = 'OFF';
        $('sound').setAttribute('aria-pressed', 'false');
      }
    }
    function reset() {
      clearInput();
      game = createGame();
      renderer.reset();
      revision = -1;
      shownPhase = '';
      terminalSaved = false;
      lastTime = performance.now();
      update();
      if (!preview) canvas.focus({ preventScroll: true });
    }
    function serve() {
      if (launch(game)) {
        clearInput();
        update();
        if (!preview) canvas.focus({ preventScroll: true });
      }
    }
    function togglePause() {
      if (game.phase === 'paused') resumeGame(game);
      else pauseGame(game);
      clearInput();
      lastTime = performance.now();
      update();
      if (game.phase === 'paused') $('start').focus({ preventScroll: true });
      else canvas.focus({ preventScroll: true });
    }
    function update() {
      if (revision !== game.revision) {
        revision = game.revision;
        $('score').textContent = String(game.score).padStart(5, '0');
        $('level').textContent = String(game.level + 1).padStart(2, '0');
        $('level-name').textContent = LEVELS[game.level].name;
        $('lives').innerHTML = [0, 1, 2]
          .map((i) => `<i class="${i >= game.lives ? 'used' : ''}"></i>`)
          .join('');
        $('lives').setAttribute(
          'aria-label',
          `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} remaining`,
        );
        $('bricks-left').textContent =
          `${game.bricks.filter((b) => b.hp > 0).length} BRICKS IN PLAY`;
        if (['won', 'lost'].includes(game.phase) && !terminalSaved) {
          terminalSaved = true;
          if (!preview) {
            best = Math.max(best, game.score);
            try {
              localStorage.setItem('breakpoint-best', JSON.stringify(best));
            } catch {}
            $('best').textContent = String(best).padStart(5, '0');
          }
        }
      }
      $('rally').hidden = game.rally < 2 || game.phase !== 'playing';
      if (game.rally >= 2)
        $('rally').querySelector('strong')!.textContent = String(
          game.rally,
        ).padStart(2, '0');
      if (shownPhase === game.phase) return;
      const previous = shownPhase;
      shownPhase = game.phase;
      const active = game.phase === 'playing',
        terminal = ['won', 'lost'].includes(game.phase);
      $('prompt').hidden = active || preview;
      $('pause').disabled = ['ready', 'won', 'lost'].includes(game.phase);
      $('pause').innerHTML =
        game.phase === 'paused'
          ? '▶ <span>RESUME</span>'
          : 'Ⅱ <span>PAUSE</span>';
      $('launch').disabled = !['ready', 'serve'].includes(game.phase);
      $('left').disabled = $('right').disabled = [
        'paused',
        'won',
        'lost',
      ].includes(game.phase);
      canvas.tabIndex = preview || terminal || game.phase === 'paused' ? -1 : 0;
      const data =
        game.phase === 'ready'
          ? [
              'COURT 01 / READY TO SERVE',
              'Make your break.',
              'Four courts. Three lives. Find your angle.',
              'START GAME',
              'OR PRESS SPACE',
              'Three lives. Four courts. Your move.',
            ]
          : game.phase === 'serve'
            ? [
                `COURT ${String(game.level + 1).padStart(2, '0')} / ${LEVELS[game.level].name}`,
                'Back in play.',
                `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left. Line up your paddle, then launch.`,
                'LAUNCH BALL',
                'OR PRESS SPACE',
                `Court ${game.level + 1}: ${LEVELS[game.level].name.toLowerCase()}. ${game.lives} lives left.`,
              ]
            : game.phase === 'paused'
              ? [
                  'TIME OUT / GAME PAUSED',
                  'Time out.',
                  'Your court. Right where you left it.',
                  'RESUME GAME',
                  'ESC OR P TO RESUME',
                  'Paused. Your ball and score are safe.',
                ]
              : game.phase === 'won'
                ? [
                    'FOUR COURTS / ALL CLEAR',
                    'Game. Set. Match.',
                    `${game.score.toLocaleString()} points · best rally ${game.bestRally}. Every last brick, gone.`,
                    'PLAY AGAIN',
                    'A FRESH FOUR COURTS',
                    `All four courts cleared! Final score ${game.score}. Best rally ${game.bestRally}.`,
                  ]
                : game.phase === 'lost'
                  ? [
                      'MATCH OVER / ONE MORE TRY?',
                      'One more break.',
                      `${game.score.toLocaleString()} points · court ${game.level + 1} of 4 · best rally ${game.bestRally}.`,
                      'PLAY AGAIN',
                      'THREE FRESH LIVES',
                      `Match over. ${game.score} points on court ${game.level + 1}.`,
                    ]
                  : [
                      '',
                      '',
                      '',
                      '',
                      '',
                      'Keep the rally going. Paddle edges steer the return.',
                    ];
      if (!active) {
        $('prompt-label').textContent = data[0];
        $('prompt-title').textContent = data[1];
        $('prompt-description').textContent = data[2];
        $('start').innerHTML = `${data[3]} <span>↗</span>`;
        $('prompt-key').textContent = data[4];
      }
      $('status').textContent = data[5];
      if (terminal && previous && !preview) {
        clearInput();
        $('start').focus({ preventScroll: true });
      }
    }
    function consumeEvents() {
      for (const event of game.events.splice(0)) {
        tone(event.type);
        renderer.event(event);
      }
    }
    const draw = (dt: number) => renderer.draw(game, dt);
    const controller = new AbortController(),
      options = { signal: controller.signal };
    if (!preview) {
      scope.listen(
        $('start'),
        'click',
        () => {
          if (game.phase === 'paused') togglePause();
          else if (['won', 'lost'].includes(game.phase)) {
            reset();
            serve();
          } else serve();
        },
        options,
      );
      scope.listen($('launch'), 'click', serve, options);
      scope.listen($('pause'), 'click', togglePause, options);
      scope.listen(
        $('restart'),
        'click',
        () => {
          reset();
          serve();
        },
        options,
      );
      scope.listen(
        $('sound'),
        'click',
        () => {
          sound = !sound;
          $('sound-state').textContent = sound ? 'ON' : 'OFF';
          $('sound').setAttribute('aria-pressed', String(sound));
          $('sound').setAttribute(
            'aria-label',
            sound ? 'Turn sound off' : 'Turn sound on',
          );
          if (sound) tone('serve');
        },
        options,
      );
      function point(event: PointerEvent) {
        const rect = canvas.getBoundingClientRect(),
          scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT),
          left = rect.left + (rect.width - WIDTH * scale) / 2;
        return (event.clientX - left) / scale;
      }
      scope.listen(
        canvas,
        'pointerdown',
        (e) => {
          if (
            e.button > 0 ||
            !['ready', 'serve', 'playing'].includes(game.phase)
          )
            return;
          e.preventDefault();
          dragging = e.pointerId;
          canvas.setPointerCapture(e.pointerId);
          target = point(e);
          movePaddle(game, target);
          canvas.focus({ preventScroll: true });
        },
        options,
      );
      scope.listen(
        canvas,
        'pointermove',
        (e) => {
          if (!['ready', 'serve', 'playing'].includes(game.phase)) return;
          if (e.pointerType === 'mouse' || dragging === e.pointerId)
            target = point(e);
        },
        options,
      );
      const releasePointer = (e: PointerEvent) => {
        if (dragging === e.pointerId) dragging = null;
      };
      scope.listen(canvas, 'pointerup', releasePointer, options);
      scope.listen(
        canvas,
        'pointercancel',
        () => {
          dragging = null;
          target = null;
        },
        options,
      );
      scope.listen(canvas, 'lostpointercapture', releasePointer, options);
      for (const [id, key] of [
        ['left', 'ArrowLeft'],
        ['right', 'ArrowRight'],
      ]) {
        const button = $(id),
          down = (e: PointerEvent | KeyboardEvent) => {
            if (!['ready', 'serve', 'playing'].includes(game.phase)) return;
            e.preventDefault();
            if ('pointerId' in e) button.setPointerCapture(e.pointerId);
            target = null;
            keys.add(key);
            button.classList.add('active');
          },
          up = () => {
            keys.delete(key);
            button.classList.remove('active');
          };
        scope.listen(button, 'pointerdown', down, options);
        for (const event of [
          'pointerup',
          'pointercancel',
          'lostpointercapture',
          'blur',
        ])
          scope.listen(button, event, up, options);
        scope.listen(
          button,
          'keydown',
          (e) => {
            if (e.code === 'Space' || e.code === 'Enter') down(e);
          },
          options,
        );
        scope.listen(
          button,
          'keyup',
          (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
              e.preventDefault();
              up();
            }
          },
          options,
        );
        scope.listen(
          button,
          'click',
          (e) => {
            if (e.detail === 0) {
              target = null;
              movePaddle(game, game.paddle.x + (id === 'left' ? -28 : 28));
            }
          },
          options,
        );
      }
      scope.listen(
        window,
        'keydown',
        (e) => {
          if (
            e.altKey ||
            e.ctrlKey ||
            e.metaKey ||
            (e.target instanceof Element ? e.target : null)?.closest(
              'input,textarea,select,[contenteditable]',
            )
          )
            return;
          if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
            if (['playing', 'serve', 'paused'].includes(game.phase)) {
              e.preventDefault();
              togglePause();
            }
            return;
          }
          if (
            (e.target instanceof Element ? e.target : null)?.closest(
              'button,a,summary',
            ) ||
            !['ready', 'serve', 'playing'].includes(game.phase)
          )
            return;
          if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
            e.preventDefault();
            target = null;
            keys.add(e.code);
          } else if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            serve();
          }
        },
        options,
      );
      scope.listen(window, 'keyup', (e) => keys.delete(e.code), options);
      const automaticPause = () => {
        clearInput();
        if (['playing', 'serve'].includes(game.phase)) {
          pauseGame(game);
          update();
        }
      };
      scope.listen(window, 'blur', automaticPause, options);
      scope.listen(
        document,
        'visibilitychange',
        () => {
          if (document.hidden) automaticPause();
        },
        options,
      );
    }
    function frame(now: number) {
      if (disposed) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;
      if (preview) {
        if (!document.hidden) {
          if (['ready', 'serve', 'won', 'lost'].includes(game.phase)) {
            demoDelay += dt;
            if (demoDelay > 0.6) {
              if (['won', 'lost'].includes(game.phase)) reset();
              serve();
              demoDelay = 0;
            }
          }
          if (game.phase === 'playing')
            stepGame(game, dt, {
              targetX:
                game.ball.x -
                Math.sin(game.elapsed * 0.8) * game.paddle.w * 0.32,
            });
        }
      } else {
        const axis =
          (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
          (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
        stepGame(game, dt, target === null ? { axis } : { targetX: target });
      }
      consumeEvents();
      update();
      draw(dt);
      frameId = scope.raf(frame);
    }
    scope.listen(window, 'pagehide', (event) => {
      if (event.persisted) {
        clearInput();
        if (!preview && ['playing', 'serve'].includes(game.phase)) {
          pauseGame(game);
          update();
        }
        return;
      }
      disposed = true;
      scope.cancelFrame(frameId);
      controller.abort();
      audio?.close().catch(() => {});
    });
    update();
    draw(0);
    frameId = scope.raf(frame);
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
