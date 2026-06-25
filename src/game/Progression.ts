/**
 * Lightweight, local-only progression: XP/levels, tokens, daily challenges and
 * cosmetic-part unlocks. Everything persists to localStorage (no backend).
 */

export interface MatchResult {
  won: boolean;
  kills: number;
  mode: string;
}

export interface Challenge {
  desc: string;
  goal: number;
  progress: number;
  reward: number;
  metric: 'kills' | 'wins' | 'games';
  done: boolean;
}

export interface MatchSummary {
  xpGained: number;
  tokensGained: number;
  newLevel: number | null;
  completed: Challenge[];
}

interface ProgressionState {
  xp: number;
  tokens: number;
  games: number;
  wins: number;
  kills: number;
  unlocked: string[];
  challenges: Challenge[];
  challengeDate: string;
}

// Cosmetic part unlock costs (in tokens). 0 = free / always available.
export const PART_COST: Record<string, number> = {
  'hat:WIZARD': 0,
  'hat:NONE': 0,
  'hat:TOP': 20,
  'hat:CROWN': 40,
  'acc:NONE': 0,
  'acc:WINGS': 25,
  'acc:CAPE': 25,
  'acc:PACK': 40
};

type ChallengeTemplate = Omit<Challenge, 'progress' | 'done'>;

const CHALLENGE_POOL: ChallengeTemplate[] = [
  { desc: 'Land 10 eliminations', goal: 10, reward: 15, metric: 'kills' },
  { desc: 'Land 20 eliminations', goal: 20, reward: 30, metric: 'kills' },
  { desc: 'Win 1 match', goal: 1, reward: 15, metric: 'wins' },
  { desc: 'Win 2 matches', goal: 2, reward: 25, metric: 'wins' },
  { desc: 'Play 3 matches', goal: 3, reward: 10, metric: 'games' }
];

const XP_PER_LEVEL = 250;
const STORAGE_KEY = 'incasters_progression';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

class Progression {
  private state: ProgressionState;

  constructor() {
    this.state = this.load();
    this.ensureDailyChallenges();
  }

  private load(): ProgressionState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ProgressionState>;
        return {
          xp: parsed.xp ?? 0,
          tokens: parsed.tokens ?? 0,
          games: parsed.games ?? 0,
          wins: parsed.wins ?? 0,
          kills: parsed.kills ?? 0,
          unlocked: parsed.unlocked ?? [],
          challenges: parsed.challenges ?? [],
          challengeDate: parsed.challengeDate ?? ''
        };
      }
    } catch {
      // ignore malformed storage
    }
    return { xp: 0, tokens: 0, games: 0, wins: 0, kills: 0, unlocked: [], challenges: [], challengeDate: '' };
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore storage failures
    }
  }

  private ensureDailyChallenges() {
    const today = todayStr();
    if (this.state.challengeDate === today && this.state.challenges.length > 0) return;

    const idxs: number[] = [];
    let seed = hashStr(today);
    while (idxs.length < 3 && idxs.length < CHALLENGE_POOL.length) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const i = seed % CHALLENGE_POOL.length;
      if (!idxs.includes(i)) idxs.push(i);
    }

    this.state.challenges = idxs.map((i) => ({ ...CHALLENGE_POOL[i], progress: 0, done: false }));
    this.state.challengeDate = today;
    this.save();
  }

  get level(): number {
    return Math.floor(this.state.xp / XP_PER_LEVEL) + 1;
  }
  get xpIntoLevel(): number {
    return this.state.xp % XP_PER_LEVEL;
  }
  get xpForLevel(): number {
    return XP_PER_LEVEL;
  }
  get tokens(): number {
    return this.state.tokens;
  }
  get challenges(): Challenge[] {
    return this.state.challenges;
  }

  isPartUnlocked(key: string): boolean {
    return (PART_COST[key] ?? 0) === 0 || this.state.unlocked.includes(key);
  }

  partCost(key: string): number {
    return PART_COST[key] ?? 0;
  }

  unlockPart(key: string): boolean {
    if (this.isPartUnlocked(key)) return true;
    const cost = PART_COST[key] ?? 0;
    if (this.state.tokens < cost) return false;
    this.state.tokens -= cost;
    this.state.unlocked.push(key);
    this.save();
    return true;
  }

  /** Unlock a part for free (used to grandfather a previously-selected cosmetic). */
  grantPart(key: string) {
    if (!this.isPartUnlocked(key)) {
      this.state.unlocked.push(key);
      this.save();
    }
  }

  recordMatch(result: MatchResult): MatchSummary {
    const beforeLevel = this.level;
    const xpGained = result.kills * 10 + (result.won ? 60 : 20);
    const baseTokens = Math.floor(result.kills / 2) + (result.won ? 6 : 2);

    this.state.xp += xpGained;
    this.state.games += 1;
    this.state.kills += result.kills;
    if (result.won) this.state.wins += 1;
    this.state.tokens += baseTokens;

    let challengeTokens = 0;
    const completed: Challenge[] = [];
    this.ensureDailyChallenges();
    this.state.challenges.forEach((ch) => {
      if (ch.done) return;
      if (ch.metric === 'kills') ch.progress += result.kills;
      else if (ch.metric === 'wins') ch.progress += result.won ? 1 : 0;
      else ch.progress += 1; // games played
      if (ch.progress >= ch.goal) {
        ch.progress = ch.goal;
        ch.done = true;
        challengeTokens += ch.reward;
        completed.push(ch);
      }
    });
    this.state.tokens += challengeTokens;

    this.save();

    const afterLevel = this.level;
    return {
      xpGained,
      tokensGained: baseTokens + challengeTokens,
      newLevel: afterLevel > beforeLevel ? afterLevel : null,
      completed
    };
  }
}

export const progression = new Progression();
