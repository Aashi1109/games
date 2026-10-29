'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { ARCADE_GAMES } from './games.ts';
import {
  ArcadeIcon,
  saveArcadeSetting,
  useArcadeSetting,
  useArcadeSound,
} from './arcade-ui';
import './src/style.css';
import './src/viewport.css';

type ArcadeGame = (typeof ARCADE_GAMES)[number];
function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a
      className={`brand ${footer ? 'footer-brand' : ''}`}
      href="/arcade/"
      aria-label="Little Break home"
    >
      {!footer && (
        <svg className="brand-symbol" viewBox="0 0 44 44" aria-hidden="true">
          <path
            d="m22 2 5 12 13-2-9 11 7 12-13-5-8 12V28L3 23l14-6Z"
            fill="currentColor"
          />
        </svg>
      )}
      <span>
        little<span className="brand-break">break</span>
        <span className="brand-dot">✦</span>
      </span>
    </a>
  );
}

function GameCard({
  game,
  index,
  favorite,
  toggleFavorite,
}: {
  game: ArcadeGame;
  index: number;
  favorite: boolean;
  toggleFavorite: (id: string) => void;
}) {
  const stored = Number(useArcadeSetting(`${game.id}:best`, '0'));
  const best = Number.isFinite(stored) ? Math.max(0, Math.floor(stored)) : 0;
  return (
    <article
      className="game-card"
      style={{ '--tile': game.color, '--order': index } as CSSProperties}
    >
      <div className="card-art-wrap">
        <a
          href={`/${game.id}/`}
          className="card-art-link"
          aria-label={`Play ${game.name}`}
        >
          {/* Game previews are exported artwork with stable dimensions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="game-art"
            src={`/arcade/assets/screens/${game.id}.png?v=20261006-viewport-4`}
            width={1140}
            height={590}
            alt={`${game.name} actual gameplay`}
            loading="lazy"
          />
          <span className="card-play">
            <ArcadeIcon name="play" size={19} />
            <span>Let&apos;s play</span>
          </span>
        </a>
        <button
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          data-favorite={game.id}
          aria-label={`${favorite ? 'Remove' : 'Add'} ${game.name} ${favorite ? 'from' : 'to'} favorites`}
          aria-pressed={favorite}
          onClick={() => toggleFavorite(game.id)}
        >
          <ArcadeIcon name="heart" size={18} />
        </button>
      </div>
      <div className="card-info">
        <div className="card-kicker">
          {game.tag}
          <span>
            {best > 0 ? `BEST ${best.toLocaleString()}` : game.length}
          </span>
        </div>
        <a href={`/${game.id}/`} className="card-title">
          <h3>{game.name}</h3>
          <ArcadeIcon name="arrow" size={23} />
        </a>
        <p>{game.intro}</p>
      </div>
    </article>
  );
}

export function ArcadeHome() {
  const [category, setCategory] = useState('all'),
    [favoriteView, setFavoriteView] = useState(false);
  const serialized = useArcadeSetting('favorites', '[]');
  let favorites: Set<string>;
  try {
    const value: unknown = JSON.parse(serialized);
    favorites = new Set(
      Array.isArray(value)
        ? value.filter(
            (id: unknown): id is string =>
              typeof id === 'string' &&
              ARCADE_GAMES.some((game) => game.id === id),
          )
        : [],
    );
  } catch {
    favorites = new Set();
  }
  const { enabled, sound, toggleSound } = useArcadeSound();
  const filtered = ARCADE_GAMES.filter(
    (game) =>
      (category === 'all' || game.category === category) &&
      (!favoriteView || favorites.has(game.id)),
  );
  useEffect(() => {
    const legacy = location.hash.match(/^#play\/([a-z-]+)$/)?.[1];
    if (legacy && ARCADE_GAMES.some((game) => game.id === legacy))
      location.replace(`/${legacy}/${location.search}`);
  }, []);
  const toggleFavorite = (id: string) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveArcadeSetting('favorites', [...next]);
    sound();
  };
  return (
    <div id="app">
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a className="nav-link shelf-home" href="/">
            Game Shelf
          </a>
          <a
            className={`nav-link ${!favoriteView ? 'selected' : ''}`}
            href="#games"
            data-all
            onClick={() => {
              setFavoriteView(false);
              setCategory('all');
            }}
          >
            All games
          </a>
          <button
            className={`nav-link ${favoriteView ? 'selected' : ''}`}
            data-favorites
            onClick={() => {
              setFavoriteView(!favoriteView);
              setCategory('all');
            }}
          >
            <ArcadeIcon name="heart" size={16} />
            <span>Favorites</span>
          </button>
        </nav>
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
      <main id="main-content" className="arcade-home">
        <section className="collection" id="games">
          <div className="collection-intro">
            <div>
              <p className="collection-count">SEVEN GAMES. YOUR NEXT BREAK.</p>
              <h1>
                Pick your
                <br />
                <em>play.</em>
              </h1>
            </div>
            <div className="collection-about">
              <p>
                Quick reflexes. Quiet puzzles.
                <br />
                Something for every kind of break.
              </p>
              <button
                className="surprise-button"
                data-surprise
                onClick={() => {
                  const pool = filtered.length ? filtered : ARCADE_GAMES;
                  location.assign(
                    `/${pool[Math.floor(Math.random() * pool.length)].id}/`,
                  );
                }}
              >
                <ArcadeIcon name="shuffle" size={19} /> Choose for me
              </button>
            </div>
          </div>
          <div className="collection-toolbar">
            <div className="filters" role="group" aria-label="Filter games">
              {[
                ['all', 'All games'],
                ['thrills', 'Arcade'],
                ['brain', 'Puzzles'],
                ['chill', 'Unwind'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  data-filter={id}
                  className={`filter ${category === id ? 'active' : ''}`}
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="collection-note">
              {favoriteView ? 'YOUR SAVED GAMES' : 'PLAY IN YOUR BROWSER'}
            </span>
          </div>
          <div className="games-grid" id="game-list">
            {filtered.length ? (
              filtered.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  index={index}
                  favorite={favorites.has(game.id)}
                  toggleFavorite={toggleFavorite}
                />
              ))
            ) : (
              <div className="empty-favorites">
                <ArcadeIcon name="heart" size={32} />
                <h3>A little room for favorites.</h3>
                <p>Tap a heart on a game to save it here.</p>
                <button
                  className="button button-dark"
                  data-reset-filter
                  onClick={() => {
                    setCategory('all');
                    setFavoriteView(false);
                  }}
                >
                  Explore all games <ArcadeIcon name="arrow" />
                </button>
              </div>
            )}
          </div>
        </section>
        <footer>
          <Brand footer />
          <p>One more round?</p>
          <a href="/">
            Back to Game Shelf <ArcadeIcon name="arrow" size={16} />
          </a>
        </footer>
      </main>
    </div>
  );
}
