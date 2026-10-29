export type BotDifficultyId = 'easy' | 'normal' | 'hard';
export const DEFAULT_BOT_DIFFICULTY = 'easy';

// Timing is in seconds and aim/turn values are in radians. Difficulty only
// changes controller inputs; bots keep the same weapons and physics as players.
export const BOT_DIFFICULTIES = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'Easy',
    description: 'Relaxed reactions and forgiving aim.',
    reactionTime: 1.25,
    trackingInterval: 0.28,
    turnSpeed: 1.35,
    pitchSpeed: 0.85,
    yawError: 0.085,
    pitchError: 0.04,
    burstDuration: 0.32,
    burstPause: 1.45,
    shotPause: 1.15,
    abilityDelay: 3,
    abilityInterval: 24,
  }),
  Object.freeze({
    id: 'normal',
    label: 'Normal',
    description: 'Balanced pressure with room to dodge.',
    reactionTime: 0.9,
    trackingInterval: 0.18,
    turnSpeed: 1.85,
    pitchSpeed: 1.1,
    yawError: 0.05,
    pitchError: 0.028,
    burstDuration: 0.42,
    burstPause: 1.05,
    shotPause: 0.75,
    abilityDelay: 1.5,
    abilityInterval: 18,
  }),
  Object.freeze({
    id: 'hard',
    label: 'Hard',
    description: 'Fast reactions and sharper aim.',
    reactionTime: 0.55,
    trackingInterval: 0.12,
    turnSpeed: 2.6,
    pitchSpeed: 1.6,
    yawError: 0.025,
    pitchError: 0.014,
    burstDuration: 0.78,
    burstPause: 0.72,
    shotPause: 0.35,
    abilityDelay: 0.4,
    abilityInterval: 12,
  }),
]);

export function normalizeBotDifficulty(value: unknown): BotDifficultyId {
  return (
    BOT_DIFFICULTIES.find(({ id }) => id === value)?.id ??
    DEFAULT_BOT_DIFFICULTY
  );
}

export function getBotDifficulty(value: unknown) {
  const id = normalizeBotDifficulty(value);
  return BOT_DIFFICULTIES.find((difficulty) => difficulty.id === id)!;
}
