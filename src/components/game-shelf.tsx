'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Game runtimes require a fresh document when navigating between games and the shelf. */

import Image from 'next/image';
import { useState, type CSSProperties } from 'react';
import { games, type Game, type GameFilter } from '../lib/catalogue';

type ShelfStyle = CSSProperties & {
  '--tile'?: string;
  '--feature'?: string;
};

const filters: readonly {
  value: GameFilter;
  label: string;
  countLabel: string;
}[] = [
  { value: 'all', label: 'All games', countLabel: '' },
  {
    value: 'arcade',
    label: 'Arcade & racing',
    countLabel: ' for a high score',
  },
  {
    value: 'brain',
    label: 'Puzzles & strategy',
    countLabel: ' to get you thinking',
  },
  { value: 'cozy', label: 'Take it easy', countLabel: ' for taking it easy' },
  { value: 'friends', label: 'With friends', countLabel: ' for good company' },
];

function GameCard({ game, hidden }: { game: Game; hidden: boolean }) {
  return (
    <article
      className="game"
      data-moods={game.moods.join(' ')}
      style={{ '--tile': game.color } as ShelfStyle}
      hidden={hidden}
    >
      <a
        className="game-link"
        href={game.href}
        aria-label={`Play ${game.title}`}
      >
        <div className="game-cover">
          <Image
            src={game.image}
            width={1280}
            height={800}
            alt={game.imageAlt}
            loading="lazy"
            unoptimized
          />
          <span className="play-arrow" aria-hidden="true">
            ▶
          </span>
        </div>
        <div className="game-caption">
          <div>
            <p className="game-category">{game.category}</p>
            <h3>{game.title}</h3>
          </div>
          <span className="game-number" aria-hidden="true">
            ↗
          </span>
        </div>
        <p className="game-description">{game.description}</p>
      </a>
      <p className="game-facts">{game.facts}</p>
    </article>
  );
}

export function GameShelf() {
  const [selectedFilter, setSelectedFilter] = useState<GameFilter>('all');
  const visibleGames = games.filter(
    (game) => selectedFilter === 'all' || game.moods.includes(selectedFilter),
  );
  const countLabel =
    filters.find((filter) => filter.value === selectedFilter)?.countLabel ?? '';

  function playSurprise() {
    const game = visibleGames[Math.floor(Math.random() * visibleGames.length)];
    if (game) window.location.assign(game.href);
  }

  return (
    <>
      <a className="skip-link" href="#games">
        Skip to games
      </a>
      <header className="site-header wrap">
        <a className="brand" href="/" aria-label="The Game Shelf home">
          <span className="brand-symbol" aria-hidden="true">
            ✳
          </span>
          <span>
            GAME
            <br />
            SHELF<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#games">
            All games <span>{games.length}</span>
          </a>
          <a href="/word-weave/">Daily puzzle ↗</a>
        </nav>
        <button
          className="shuffle-button"
          type="button"
          data-surprise
          onClick={playSurprise}
        >
          Surprise me <span aria-hidden="true">⤨</span>
        </button>
      </header>
      <main className="wrap">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-heading">
            <div>
              <p className="eyebrow">A LITTLE TIME. A LOT OF PLAY.</p>
              <h1 id="hero-title">
                Your next <span>good game.</span>
              </h1>
            </div>
            <p>
              Pick something. Get into it.
              <br />
              Free to play. No account needed.
            </p>
          </div>
          <div className="featured-grid">
            <article className="feature-main">
              <a
                href="/brick-breaker/"
                className="feature-image"
                aria-label="Play Breakpoint"
              >
                <Image
                  src="/assets/screens/brick-breaker.png?v=viewport-4-final"
                  width={1280}
                  height={800}
                  alt="Breakpoint’s playable brick-breaking court"
                  fetchPriority="high"
                  loading="eager"
                  unoptimized
                />
              </a>
              <div className="feature-copy">
                <span className="feature-label">
                  THE NEXT HIGH SCORE IS YOURS
                </span>
                <h2>
                  BREAKPOINT<span>↗</span>
                </h2>
                <p>Four courts. Three lives. One more go.</p>
                <a className="button" href="/brick-breaker/">
                  Play now <span aria-hidden="true">▶</span>
                </a>
              </div>
            </article>
            <div className="feature-side">
              <a
                className="feature-small"
                href="/drift/"
                style={{ '--feature': '#d7b98d' } as ShelfStyle}
              >
                <Image
                  src="/assets/screens/drift.png?v=viewport-4-final"
                  width={1280}
                  height={800}
                  alt="DRIFT multiplayer arena"
                  unoptimized
                />
                <span className="small-feature-copy">
                  <span>
                    <small>BRING YOUR FRIENDS</small>
                    <strong>DRIFT</strong>
                  </span>
                  <b aria-hidden="true">↗</b>
                </span>
              </a>
              <a
                className="feature-small"
                href="/pocket-putt/"
                style={{ '--feature': '#b5ce95' } as ShelfStyle}
              >
                <Image
                  src="/assets/screens/pocket-putt.png?v=viewport-4-final"
                  width={1280}
                  height={800}
                  alt="Pocket Putt mini golf course"
                  unoptimized
                />
                <span className="small-feature-copy">
                  <span>
                    <small>TAKE THE SCENIC ROUTE</small>
                    <strong>Pocket Putt</strong>
                  </span>
                  <b aria-hidden="true">↗</b>
                </span>
              </a>
            </div>
          </div>
        </section>
        <section
          className="collection"
          id="games"
          aria-labelledby="collection-title"
        >
          <div className="collection-heading">
            <div>
              <span className="eyebrow">THE WHOLE COLLECTION</span>
              <h2 id="collection-title">What’s your kind of fun?</h2>
            </div>
            <p id="game-count" role="status" aria-live="polite">
              {visibleGames.length}{' '}
              {visibleGames.length === 1 ? 'game' : 'games'}
              {countLabel}
            </p>
          </div>
          <div className="filters" role="group" aria-label="Filter games">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                data-filter={filter.value}
                aria-pressed={selectedFilter === filter.value}
                onClick={() => setSelectedFilter(filter.value)}
              >
                {filter.label}
                {filter.value === 'all' && (
                  <>
                    {' '}
                    <span>{games.length}</span>
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="games-grid" id="game-list">
            {games.map((game) => (
              <GameCard
                key={game.href}
                game={game}
                hidden={
                  selectedFilter !== 'all' &&
                  !game.moods.includes(selectedFilter)
                }
              />
            ))}
          </div>
          <div className="collection-end">
            <span>Still deciding?</span>
            <button type="button" data-surprise onClick={playSurprise}>
              Pick a game for me <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
      </main>
      <footer className="site-footer wrap">
        <a className="footer-brand" href="/">
          the game shelf.
        </a>
        <p>Less scrolling. More playing.</p>
        <a href="#">Back to top ↑</a>
      </footer>
    </>
  );
}
