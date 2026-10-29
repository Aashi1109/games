'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createGameLifecycle } from '../../lib/game-lifecycle.ts';
import { bindGameDocument } from '../../lib/game-document.ts';
import { ARCADE_GAMES, DESKTOP_CONTROLS } from './games.ts';
import { readStored, writeStored } from './src/lib/core.ts';
import { ArcadeIcon, useArcadeSound } from './arcade-ui';
import './src/style.css';
import './src/viewport.css';

type Phase = 'preview' | 'playing' | 'paused' | 'finished';
type Stat = { label: string; value: string | number };
type Result = {
  title?: string;
  message?: string;
  score: number;
  unit?: string;
  personalBest?: boolean;
};
const scoreValue = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function ArcadeGame({ gameId }: { gameId: string }) {
  const game = ARCADE_GAMES.find((item) => item.id === gameId)!;
  const shell = useRef<HTMLDivElement>(null),
    host = useRef<HTMLDivElement>(null),
    help = useRef<HTMLDialogElement>(null);
  const phaseRef = useRef<Phase>('preview'),
    focusTarget = useRef<HTMLElement | null>(null),
    resumeAfterHelp = useRef(false);
  const [phase, setPhase] = useState<Phase>('preview'),
    [round, setRound] = useState(0);
  const [stats, setStats] = useState<Stat[]>([]),
    [hint, setHint] = useState(game.goal);
  const [result, setResult] = useState<Result | null>(null),
    [best, setBest] = useState(0);
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const { enabled, sound, toggleSound } = useArcadeSound();
  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const focusGame = useCallback(() => {
    const area = host.current;
    const target =
      focusTarget.current?.isConnected && area?.contains(focusTarget.current)
        ? focusTarget.current
        : area?.querySelector<HTMLElement>(
            'canvas,[tabindex="0"],button:not(:disabled)',
          );
    target?.focus({ preventScroll: true });
  }, []);
  const pauseGame = useCallback(
    (pause: boolean) => {
      if (!['playing', 'paused'].includes(phaseRef.current)) return;
      changePhase(pause ? 'paused' : 'playing');
      if (!pause) focusGame();
    },
    [changePhase, focusGame],
  );

  useLayoutEffect(() => {
    const scope = createGameLifecycle(shell.current!);
    document.body.dataset.game = game.id;
    scope.listen(window, 'keydown', (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !help.current?.open &&
        !event.defaultPrevented &&
        ['playing', 'paused'].includes(phaseRef.current)
      ) {
        event.preventDefault();
        pauseGame(phaseRef.current !== 'paused');
      }
    });
    scope.listen(document, 'visibilitychange', () => {
      if (document.hidden) pauseGame(true);
    });
    scope.listen(document, 'focusin', (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        host.current?.contains(event.target)
      )
        focusTarget.current = event.target;
    });
    return () => scope.dispose();
  }, [game.id, pauseGame]);

  useEffect(() => {
    const area = host.current!;
    let cancelled = false,
      dispose: (() => void) | undefined;
    const stop = () => {
      cancelled = true;
      const release = dispose;
      dispose = undefined;
      release?.();
      area.replaceChildren();
    };
    const unbind = bindGameDocument(stop);
    const preview = phaseRef.current === 'preview';
    game
      .module()
      .then((module) => {
        if (cancelled) return;
        setBest(scoreValue(readStored(`${game.id}:best`, 0)));
        area.replaceChildren();
        dispose = module.mount(area, {
          setStats(next: Stat[]) {
            if (!cancelled)
              setStats((previous) =>
                JSON.stringify(previous) === JSON.stringify(next)
                  ? previous
                  : next,
              );
          },
          setHint(message: string) {
            if (!cancelled) setHint(message);
          },
          sound: preview ? () => {} : sound,
          isPaused: () => cancelled || phaseRef.current !== 'playing',
          getBest: () => scoreValue(readStored(`${game.id}:best`, 0)),
          save: (key: string, value: unknown) =>
            preview ? true : writeStored(`${game.id}:${key}`, value),
          load: (key: string, fallback: unknown) =>
            readStored(`${game.id}:${key}`, fallback),
          finish(next: Result) {
            if (cancelled || phaseRef.current === 'finished') return;
            const previousBest = scoreValue(readStored(`${game.id}:best`, 0));
            const score = scoreValue(next.score);
            if (score > previousBest) writeStored(`${game.id}:best`, score);
            setBest(Math.max(previousBest, score));
            setResult({ ...next, score, personalBest: score > previousBest });
            changePhase('finished');
            sound(score > 0 ? 'win' : 'lose');
          },
        });
        setLoading(false);
        if (!preview) focusGame();
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Could not start arcade game:', error);
          setLoading(false);
          setFailed(true);
        }
      });
    return () => {
      unbind();
      stop();
    };
  }, [game, round, sound, changePhase, focusGame]);

  useEffect(() => {
    if (loading) return;
    if (phase === 'playing') focusGame();
    else if (phase === 'paused' || phase === 'finished')
      shell.current
        ?.querySelector<HTMLButtonElement>(
          phase === 'paused' ? '[data-resume]' : '[data-again]',
        )
        ?.focus({ preventScroll: true });
  }, [phase, loading, focusGame]);

  function startGame() {
    sound();
    setFailed(false);
    setLoading(true);
    setResult(null);
    changePhase('playing');
    setRound((value) => value + 1);
  }
  const keys = DESKTOP_CONTROLS[game.id];
  return (
    <div ref={shell} id="app">
      <header className="game-navigation">
        <a href="/arcade/" className="back-link" aria-label="All games">
          <ArcadeIcon name="back" size={18} />
          <span>All games</span>
        </a>
        <h1 className="game-nav-title">{game.name}</h1>
        <a className="game-collection-link" href="/">
          Game Shelf
        </a>
        <button
          className="game-help-button"
          data-help
          aria-label="How to play"
          onClick={() => {
            resumeAfterHelp.current = phaseRef.current === 'playing';
            if (resumeAfterHelp.current) pauseGame(true);
            help.current?.showModal();
          }}
        >
          ?
        </button>
        <button
          className="sound-switch"
          data-sound
          aria-label={`Sound ${enabled ? 'on' : 'off'}`}
          aria-pressed={enabled}
          onClick={toggleSound}
        >
          <ArcadeIcon name={enabled ? 'sound' : 'muted'} />
          <span>Sound {enabled ? 'on' : 'off'}</span>
        </button>
      </header>
      <main
        className="play-page"
        style={{ '--game-accent': game.color } as CSSProperties}
      >
        <section className="play-shell" aria-label={`${game.name} game`}>
          <div className="play-toolbar">
            <div className="game-stats" id="game-stats">
              {stats.map((stat) => (
                <div className="stat" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
            <div className="personal-best">
              <span>BEST</span>
              <strong id="personal-best">{best.toLocaleString()}</strong>
            </div>
            <div className="play-actions">
              <button
                className="tool-button"
                data-pause
                disabled={loading || !['playing', 'paused'].includes(phase)}
                aria-label={phase === 'paused' ? 'Resume game' : 'Pause game'}
                onClick={() => pauseGame(phase !== 'paused')}
              >
                <ArcadeIcon name={phase === 'paused' ? 'play' : 'pause'} />
                <span>{phase === 'paused' ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                className="tool-button"
                data-restart
                disabled={loading || phase === 'preview'}
                aria-label="Restart game"
                onClick={startGame}
              >
                <ArcadeIcon name="restart" />
                <span>Restart</span>
              </button>
              <button
                className="tool-button fullscreen-button"
                data-expand
                aria-label="Enter fullscreen"
                onClick={async () => {
                  try {
                    if (document.fullscreenElement)
                      await document.exitFullscreen();
                    else
                      await shell.current
                        ?.querySelector('.play-shell')
                        ?.requestFullscreen();
                  } catch {
                    setHint(
                      'Fullscreen is unavailable in this browser. You can keep playing here.',
                    );
                  }
                }}
              >
                <ArcadeIcon name="expand" />
              </button>
            </div>
          </div>
          <div className="game-stage">
            <div id="game-host" ref={host} inert={phase !== 'playing'} />
            <div
              id="game-overlay"
              className={`game-overlay ${phase === 'preview' ? 'intro-overlay' : phase === 'paused' ? 'paused-overlay' : phase === 'finished' ? 'finished-overlay' : ''}`}
              hidden={!loading && !failed && phase === 'playing'}
            >
              {loading ? (
                <div className="result-content">
                  <h2>Getting ready…</h2>
                </div>
              ) : failed ? (
                <div className="result-content">
                  <span className="eyebrow">A LITTLE HICCUP</span>
                  <h2>Let’s try that again.</h2>
                  <p>The game could not start. Reload it for a fresh try.</p>
                  <button
                    className="button button-dark"
                    data-retry
                    onClick={startGame}
                  >
                    Try again
                  </button>
                </div>
              ) : phase === 'preview' ? (
                <div className="intro-content">
                  <h2>{game.goal}</h2>
                  <button
                    className="button button-dark start-button"
                    data-start
                    onClick={startGame}
                  >
                    Play <ArcadeIcon name="play" size={18} />
                  </button>
                </div>
              ) : phase === 'paused' ? (
                <div className="result-content">
                  <h2>Paused.</h2>
                  <p>Ready when you are.</p>
                  <button
                    className="button button-dark"
                    data-resume
                    onClick={() => pauseGame(false)}
                  >
                    Keep playing <ArcadeIcon name="play" size={18} />
                  </button>
                </div>
              ) : result ? (
                <div
                  className="result-content"
                  role="region"
                  aria-label="Game result"
                >
                  <span className="eyebrow">
                    {result.personalBest
                      ? 'A NEW PERSONAL BEST'
                      : 'ROUND COMPLETE'}
                  </span>
                  <h2 id="result-title">
                    {result.title || 'Lovely little run!'}
                  </h2>
                  <p id="result-message">
                    {result.message || 'Ready for another?'}
                  </p>
                  <div className="result-score">
                    <strong>{result.score.toLocaleString()}</strong>
                    <span id="score-unit">{result.unit || 'points'}</span>
                  </div>
                  <div className="result-actions">
                    <button
                      className="button button-dark"
                      data-again
                      onClick={startGame}
                    >
                      One more round <ArcadeIcon name="restart" size={18} />
                    </button>
                    <a className="text-link" href="/arcade/">
                      Find another favorite{' '}
                      <ArcadeIcon name="arrow" size={18} />
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="play-bottom">
            <p id="game-hint">{hint}</p>
            {keys && (
              <dl className="desktop-keys">
                {keys.map(([action, value]) => (
                  <div key={action}>
                    <dt>{action}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>
        <dialog
          ref={help}
          className="game-help"
          aria-labelledby="help-title"
          onClose={() => {
            if (resumeAfterHelp.current) {
              resumeAfterHelp.current = false;
              pauseGame(false);
            }
          }}
        >
          <h2 id="help-title">How to play</h2>
          <p>{game.description}</p>
          <ul>
            {game.controls.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
          <button
            className="button"
            data-close-help
            onClick={() => help.current?.close()}
          >
            Back to game
          </button>
        </dialog>
      </main>
    </div>
  );
}
