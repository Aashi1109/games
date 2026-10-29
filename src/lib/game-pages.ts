import { ARCADE_GAMES, ARCADE_THEMES } from '../games/arcade/games.ts';

export interface GamePageMetadata {
  title: string;
  description: string;
  themeColor: string;
  icon?: string;
  viewportFit?: 'cover';
}
export const GAME_PAGES: Record<string, GamePageMetadata> = {
  arcade: {
    title: 'Little Break — Small games. Big good time.',
    description:
      'Seven little games for a well-earned break. Play original puzzles, tiny adventures, and joyful arcade games instantly.',
    themeColor: '#f6f3eb',
    icon: '/arcade/public/favicon.svg',
  },
  drift: {
    title: 'DRIFT — Find your flow',
    description:
      'A lightweight movement-first multiplayer arena. Slide, jump, and challenge your friends in your desktop browser.',
    themeColor: '#202b29',
    icon: '/drift/mark.svg',
  },
  ...Object.fromEntries(
    ARCADE_GAMES.map((game) => [
      game.id,
      {
        title: `${game.name} — Little Break`,
        description: game.description,
        themeColor: ARCADE_THEMES[game.id],
        icon: '/arcade/public/favicon.svg',
      },
    ]),
  ),
  'asteroid-run': {
    title: 'Asteroid Run — Four sectors. One ship.',
    description:
      'Pilot a deep-space interceptor through four asteroid sectors. An original quick-play space shooter.',
    themeColor: '#0c151e',
    viewportFit: 'cover',
  },
  'beat-bounce': {
    title: 'Beat Bounce — Find your groove',
    description: 'Beat Bounce — Find your groove',
    themeColor: '#f8f5ed',
  },
  'brick-breaker': {
    title: 'BREAKPOINT — Brick breaker',
    description:
      'BREAKPOINT: four brick-breaking courts, three lives, one more rally. Play with keyboard, mouse or touch.',
    themeColor: '#080e1c',
  },
  'claw-catch': {
    title: 'Claw & Catch — A little time by the water',
    description:
      'A peaceful, skillful fishing break. Cast a line, feel the pull, and fill your little pond journal.',
    themeColor: '#163946',
  },
  'doodle-dash': {
    title: 'Doodle Dash — Questionable art. Excellent company.',
    description: 'Doodle Dash — Questionable art. Excellent company.',
    themeColor: '#26282b',
  },
  faultline: {
    title: 'FAULTLINE — Dig deep. Hold the line.',
    description:
      'Dig deep. Hold the line. A complete mining and survival game on an alien frontier.',
    themeColor: '#151b20',
    viewportFit: 'cover',
  },
  'kitchen-rush': {
    title: 'Kitchen Rush — Good food. Fast hands.',
    description:
      'A two-minute burger-building shift at the happiest little roadside diner.',
    themeColor: '#bc3226',
  },
  'lane-rush': {
    title: 'Lane Rush — 90 second traffic sprint',
    description: 'Lane Rush — 90 second traffic sprint',
    themeColor: '#141b20',
  },
  'pocket-pinball': {
    title: 'Pocket Pinball — Orbital No. 8',
    description: 'Pocket Pinball — Orbital No. 8',
    themeColor: '#101f30',
  },
  'pocket-putt': {
    title: 'Pocket Putt — Six little greens',
    description: 'Pocket Putt — Six little greens',
    themeColor: '#123941',
  },
  'tiny-tower-defense': {
    title: 'Tiny Tower Defense — The Garden Guard',
    description:
      'A tiny garden, a big little battle. Plant defenders and protect your greenhouse through seven bug-filled waves.',
    themeColor: '#315b48',
  },
  'word-weave': {
    title: 'Word Weave — Find your next word',
    description:
      'Link neighboring letters in a daily three-minute word puzzle, or explore in untimed practice.',
    themeColor: '#30243f',
  },
};
export const GAME_SLUGS = Object.freeze(Object.keys(GAME_PAGES));
