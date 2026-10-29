export const ARCADE_GAMES = [
  {
    id: 'trap-sprint' as const,
    name: 'Trap Sprint',
    tag: 'QUICK THRILLS',
    category: 'thrills',
    color: '#ed7958',
    intro: 'Six hazard courses. Every jump counts.',
    description:
      'A tiny adventure with a mischievous streak. Read the hazards, time your jumps, and reach the exit.',
    controls: [
      '← → or A D to move',
      'Space / W to jump',
      'Touch buttons on mobile',
    ],
    goal: 'Clear all six hazard courses.',
    length: 'Quick attempts',
    label: 'A LITTLE MISCHIEF',
    module: () => import('./src/games/trap-sprint.ts'),
  },
  {
    id: 'daily-circuit' as const,
    name: 'Daily Circuit',
    tag: 'BRAIN FOOD',
    category: 'brain',
    color: '#b8cba9',
    intro: 'Rotate. Connect. Power every bulb.',
    description:
      'Turn the tiles, connect the circuit, and bring every bulb to life. A fresh shared puzzle every day, plus practice whenever you like.',
    controls: [
      'Tap a tile to rotate',
      'Arrow keys to explore',
      'Enter / Space to turn',
    ],
    goal: 'Connect every tile to the battery.',
    length: 'Daily + practice',
    label: 'YOUR DAILY SPARK',
    module: () => import('./src/games/daily-circuit.ts'),
  },
  {
    id: 'bumper-ring' as const,
    name: 'Bumper Ring',
    tag: 'QUICK THRILLS',
    category: 'thrills',
    color: '#a8c4df',
    intro: 'Charge your dash. Own the shrinking ring.',
    description:
      'Charge your dash and send the other bumpers flying. The arena is shrinking, so make every nudge count.',
    controls: [
      'WASD / arrows to move',
      'Hold Space, release to dash',
      'Touch controls on mobile',
    ],
    goal: 'Be the last puck in the ring.',
    length: '3 rounds · vs bots',
    label: 'MAKE SOME ROOM',
    module: () => import('./src/games/bumper-ring.ts'),
  },
  {
    id: 'block-bloom' as const,
    name: 'Block Bloom',
    tag: 'JUST CHILL',
    category: 'chill',
    color: '#c9badb',
    intro: 'Place your pieces. Keep the board open.',
    description:
      'Place your pieces, clear full rows and columns, and build your score. The highlighted garden patch gives your next placement a bonus.',
    controls: [
      'Choose a piece, then a cell',
      'Arrow keys to aim · Enter to place',
      '1 / 2 / 3 to choose a piece',
    ],
    goal: 'Place pieces. Clear lines. Keep going.',
    length: 'At your own pace',
    label: 'ROOM TO GROW',
    module: () => import('./src/games/block-bloom.ts'),
  },
  {
    id: 'shelf-shuffle' as const,
    name: 'Shelf Shuffle',
    tag: 'BRAIN FOOD',
    category: 'brain',
    color: '#b5cec6',
    intro: 'One type per shelf. Everything in its place.',
    description:
      'Give every parcel a matching home. Move the top parcel between shelves and use the empty space wisely.',
    controls: [
      'Select a shelf, then its destination',
      'Tab / Enter for keyboard play',
      'Undo whenever you need',
    ],
    goal: 'Sort each shelf into a single parcel type.',
    length: '5 tidy challenges',
    label: 'EVERYTHING IN ITS PLACE',
    module: () => import('./src/games/shelf-shuffle.ts'),
  },
  {
    id: 'wobble-delivery' as const,
    name: 'Wobble Delivery',
    tag: 'QUICK THRILLS',
    category: 'thrills',
    color: '#e5c873',
    intro: 'Three routes. Six boxes. Keep them upright.',
    description:
      'Deliver a precarious tower of parcels over bumpy little roads. Balance speed against the boxes you can actually keep.',
    controls: [
      'Arrow keys / A D to drive',
      'Space to hop',
      'Touch controls on mobile',
    ],
    goal: 'Deliver the cargo. Keep it upright.',
    length: '3 delivery routes',
    label: 'HANDLE WITH CHAOS',
    module: () => import('./src/games/wobble-delivery.ts'),
  },
  {
    id: 'corner-rush' as const,
    name: 'Corner Rush',
    tag: 'JUST CHILL',
    category: 'chill',
    color: '#adbccf',
    intro: 'Three laps against the clock.',
    description:
      'Find your racing line on today’s winding course. Smooth steering wins: the grass is a shortcut to going very slowly.',
    controls: [
      '← → or A D to steer',
      'Touch buttons on mobile',
      'Automatic acceleration',
    ],
    goal: 'Complete three laps before time runs out.',
    length: 'Daily track · 3 laps',
    label: 'TAKE THE LONG WAY',
    module: () => import('./src/games/corner-rush.ts'),
  },
];

export type ArcadeGameId = (typeof ARCADE_GAMES)[number]['id'];

export const ARCADE_THEMES = {
  'trap-sprint': '#e5e5dc',
  'daily-circuit': '#172c29',
  'bumper-ring': '#bf3f34',
  'block-bloom': '#f4ede1',
  'shelf-shuffle': '#e8e2d6',
  'wobble-delivery': '#f0ce57',
  'corner-rush': '#e6e9ed',
};
export const DESKTOP_CONTROLS: Partial<
  Record<ArcadeGameId, [string, string][]>
> = {
  'trap-sprint': [
    ['Move', '← → / A D'],
    ['Jump', 'Space / W'],
  ],
  'corner-rush': [
    ['Steer', '← → / A D'],
    ['Accelerate', 'Automatic'],
  ],
  'wobble-delivery': [
    ['Brake / drive', '← → / A D'],
    ['Hop', 'Space / ↑'],
  ],
};
