/**
 * Difficulty presets that scale bot AI behaviour. Each preset tunes reaction
 * time, accuracy, aggression, dodge chance, and health to create a distinct
 * skill curve from beginner-friendly to punishing.
 */

export type DifficultyLevel = 'EASY' | 'NORMAL' | 'HARD' | 'INSANE';

export interface DifficultyConfig {
  /** Multiplier applied to bot movement speed (0.6 = 60% speed). */
  botSpeedMultiplier: number;
  /** Multiplier applied to bot fire rate cooldown (higher = slower firing). */
  botFireRateMultiplier: number;
  /** Aim error in radians added to bot shots (0 = perfect aim). */
  botAimError: number;
  /** Probability per frame that a bot will dodge an incoming projectile (0-1). */
  botDodgeChance: number;
  /** Distance at which bots start dodging projectiles. */
  botDodgeRange: number;
  /** Probability per frame that a bot will dash when threatened (0-1). */
  botDashChance: number;
  /** Multiplier on bot health (1.0 = 100 HP, 0.7 = 70 HP). */
  botHealthMultiplier: number;
  /** How aggressively bots pursue enemies vs. collect resources (0 = passive, 1 = hyper-aggressive). */
  botAggression: number;
  /** Chance a bot will curve its shot even with clear line of sight (0-1). */
  botCurveShotChance: number;
  /** Label for UI display. */
  label: string;
  /** Description for UI display. */
  description: string;
}

export const DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyConfig> = {
  EASY: {
    botSpeedMultiplier: 0.65,
    botFireRateMultiplier: 1.8,
    botAimError: 0.35,
    botDodgeChance: 0.15,
    botDodgeRange: 3.0,
    botDashChance: 0.08,
    botHealthMultiplier: 0.7,
    botAggression: 0.3,
    botCurveShotChance: 0.1,
    label: 'Easy',
    description: 'Relaxed bots with slow reactions and poor aim. Great for learning the ropes.'
  },
  NORMAL: {
    botSpeedMultiplier: 0.85,
    botFireRateMultiplier: 1.2,
    botAimError: 0.18,
    botDodgeChance: 0.4,
    botDodgeRange: 4.0,
    botDashChance: 0.2,
    botHealthMultiplier: 1.0,
    botAggression: 0.6,
    botCurveShotChance: 0.3,
    label: 'Normal',
    description: 'Balanced bots that dodge, curve shots, and fight back. The intended experience.'
  },
  HARD: {
    botSpeedMultiplier: 1.0,
    botFireRateMultiplier: 0.85,
    botAimError: 0.08,
    botDodgeChance: 0.65,
    botDodgeRange: 5.0,
    botDashChance: 0.35,
    botHealthMultiplier: 1.15,
    botAggression: 0.85,
    botCurveShotChance: 0.5,
    label: 'Hard',
    description: 'Fast, accurate bots that dodge aggressively and rarely miss. A real challenge.'
  },
  INSANE: {
    botSpeedMultiplier: 1.15,
    botFireRateMultiplier: 0.6,
    botAimError: 0.03,
    botDodgeChance: 0.85,
    botDodgeRange: 6.0,
    botDashChance: 0.5,
    botHealthMultiplier: 1.3,
    botAggression: 1.0,
    botCurveShotChance: 0.7,
    label: 'Insane',
    description: 'Nightmare bots with near-perfect aim, lightning reflexes, and extra health. Good luck.'
  }
};

export const DIFFICULTY_ORDER: DifficultyLevel[] = ['EASY', 'NORMAL', 'HARD', 'INSANE'];

const STORAGE_KEY = 'incasters_difficulty';

export function loadDifficulty(): DifficultyLevel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in DIFFICULTY_PRESETS) return raw as DifficultyLevel;
  } catch {
    // ignore
  }
  return 'NORMAL';
}

export function saveDifficulty(level: DifficultyLevel) {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // ignore
  }
}
