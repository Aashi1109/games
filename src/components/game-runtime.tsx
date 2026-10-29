'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bindGameDocument } from '../lib/game-document.ts';

type GameModule = { mountGame: (root: HTMLElement) => (() => void) | void };
export type GameLoader = () => Promise<GameModule>;

/** React owns the shell; the lazily bundled game owns only its mounted interaction. */
export function GameRuntime({
  load,
  children,
}: {
  load: GameLoader;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | void;
    const stop = () => {
      cancelled = true;
      const release = dispose;
      dispose = undefined;
      release?.();
    };
    const unbind = bindGameDocument(stop);
    load()
      .then((module) => {
        if (!cancelled && root.current)
          dispose = module.mountGame(root.current);
      })
      .catch((cause) => {
        if (!cancelled) {
          console.error('Could not initialize game:', cause);
          setError(true);
        }
      });
    return () => {
      unbind();
      stop();
    };
  }, [load]);

  return (
    <div ref={root} style={{ display: 'contents' }}>
      {children}
      {error && (
        <p role="alert">
          The game could not start.{' '}
          <button type="button" onClick={() => window.location.reload()}>
            Reload game
          </button>
        </p>
      )}
    </div>
  );
}
