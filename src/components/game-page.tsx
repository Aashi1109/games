'use client';

import dynamic from 'next/dynamic';

// Keep each game's global CSS and client bundle behind its own lazy boundary.
const views = {
  arcade: dynamic(() =>
    import('../games/arcade/arcade-home').then((module) => module.ArcadeHome),
  ),
  drift: dynamic(() =>
    import('../games/drift/DriftGame').then((module) => module.DriftGame),
  ),
  'asteroid-run': dynamic(() =>
    import('../games/asteroid-run/game-view').then((module) => module.GameView),
  ),
  'beat-bounce': dynamic(() =>
    import('../games/beat-bounce/game-view').then((module) => module.GameView),
  ),
  'brick-breaker': dynamic(() =>
    import('../games/brick-breaker/game-view').then(
      (module) => module.GameView,
    ),
  ),
  'claw-catch': dynamic(() =>
    import('../games/claw-catch/game-view').then((module) => module.GameView),
  ),
  'doodle-dash': dynamic(() =>
    import('../games/doodle-dash/game-view').then((module) => module.GameView),
  ),
  faultline: dynamic(() =>
    import('../games/faultline/game-view').then((module) => module.GameView),
  ),
  'kitchen-rush': dynamic(() =>
    import('../games/kitchen-rush/game-view').then((module) => module.GameView),
  ),
  'lane-rush': dynamic(() =>
    import('../games/lane-rush/game-view').then((module) => module.GameView),
  ),
  'pocket-pinball': dynamic(() =>
    import('../games/pocket-pinball/game-view').then(
      (module) => module.GameView,
    ),
  ),
  'pocket-putt': dynamic(() =>
    import('../games/pocket-putt/game-view').then((module) => module.GameView),
  ),
  'tiny-tower-defense': dynamic(() =>
    import('../games/tiny-tower-defense/game-view').then(
      (module) => module.GameView,
    ),
  ),
  'word-weave': dynamic(() =>
    import('../games/word-weave/game-view').then((module) => module.GameView),
  ),
};
const ArcadeGame = dynamic(() =>
  import('../games/arcade/game-view').then((module) => module.ArcadeGame),
);

/** The server validates slugs against the shared game metadata registry. */
export function GamePage({ slug }: { slug: string }) {
  if (Object.hasOwn(views, slug)) {
    const View = views[slug as keyof typeof views];
    return <View />;
  }
  return <ArcadeGame gameId={slug} />;
}
