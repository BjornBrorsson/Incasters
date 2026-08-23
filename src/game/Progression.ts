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
  /** 'daily' or 'weekly' — controls refresh cadence and UI grouping. */
  cadence: 'daily' | 'weekly';
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
  challengeWeek: string;
}

// Cosmetic part unlock costs (in tokens). 0 = free / always available.
export const PART_COST: Record<string, number> = {
  'hat:WIZARD': 0,
  'hat:NONE': 0,
  'hat:TOP': 20,
  'hat:CROWN': 40,
  'hat:HOOD': 30,
  'hat:HELMET': 35,
  'hat:MUSHROOM': 35,
  'hat:TIARA': 45,
  'hat:JESTER': 30,
  'hat:TURBAN': 40,
  'hat:BANDANA': 25,
  'acc:NONE': 0,
  'acc:WINGS': 25,
  'acc:CAPE': 25,
  'acc:PACK': 40,
  'acc:BANNER': 30,
  'acc:SCARF': 20,
  'acc:POTIONS': 35,
  'acc:SHIELD_BACK': 35,
  'acc:FAMILIAR': 50,
  'hair:NONE': 0,
  'hair:BUZZ': 10,
  'hair:MOHAWK': 20,
  'hair:LONG': 20,
  'hair:PONYTAIL': 25,
  'face:NONE': 0,
  'face:SHADES': 25,
  'face:EYEPATCH': 20,
  'face:BEARD': 15,
  'face:MASK': 30,
  'face:MONOCLE': 20,
  'face:RUNE_MARK': 30,
  'face:BLINDFOLD': 35,
  'face:MUSTACHE': 15,
  'weapon:STAFF': 0,
  'weapon:WAND': 15,
  'weapon:SWORD': 30,
  'weapon:SCYTHE': 40,
  'weapon:GRIMOIRE_FOCUS': 40,
  'weapon:ORB_SCEPTRE': 45,
  'weapon:BOW': 35,
  'weapon:BROOM': 30
};

type ChallengeTemplate = Omit<Challenge, 'progress' | 'done'>;

const CHALLENGE_POOL: ChallengeTemplate[] = [
  { desc: 'Land 10 eliminations', goal: 10, reward: 15, metric: 'kills', cadence: 'daily' },
  { desc: 'Land 20 eliminations', goal: 20, reward: 30, metric: 'kills', cadence: 'daily' },
  { desc: 'Win 1 match', goal: 1, reward: 15, metric: 'wins', cadence: 'daily' },
  { desc: 'Win 2 matches', goal: 2, reward: 25, metric: 'wins', cadence: 'daily' },
  { desc: 'Play 3 matches', goal: 3, reward: 10, metric: 'games', cadence: 'daily' }
];

const WEEKLY_CHALLENGE_POOL: ChallengeTemplate[] = [
  { desc: 'Land 50 eliminations this week', goal: 50, reward: 60, metric: 'kills', cadence: 'weekly' },
  { desc: 'Land 100 eliminations this week', goal: 100, reward: 120, metric: 'kills', cadence: 'weekly' },
  { desc: 'Win 5 matches this week', goal: 5, reward: 80, metric: 'wins', cadence: 'weekly' },
  { desc: 'Win 10 matches this week', goal: 10, reward: 160, metric: 'wins', cadence: 'weekly' },
  { desc: 'Play 15 matches this week', goal: 15, reward: 50, metric: 'games', cadence: 'weekly' },
  { desc: 'Play 30 matches this week', goal: 30, reward: 100, metric: 'games', cadence: 'weekly' }
];

const XP_PER_LEVEL = 250;
const STORAGE_KEY = 'incasters_progression';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Returns a stable week identifier (ISO year-week). Weeks run Monday→Sunday. */
function weekStr(): string {
  const d = new Date();
  // Set to nearest Thursday: current date + 4 - current day number
  // Makes Sunday(0) → 3, Monday(1) → 3, etc. — standard ISO week calculation.
  const dayNum = d.getDay() || 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${weekNum}`;
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
    this.ensureChallenges();
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
          challengeDate: parsed.challengeDate ?? '',
          challengeWeek: parsed.challengeWeek ?? ''
        };
      }
    } catch {
      // ignore malformed storage
    }
    return { xp: 0, tokens: 0, games: 0, wins: 0, kills: 0, unlocked: [], challenges: [], challengeDate: '', challengeWeek: '' };
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore storage failures
    }
  }

  /** Refresh daily and weekly challenges whose cadence window has elapsed. */
  private ensureChallenges() {
    const today = todayStr();
    const week = weekStr();

    // Preserve challenges that are still within their cadence window; replace
    // those whose day/week identifier has rolled over.
    const surviving = this.state.challenges.filter((ch) => {
      if (ch.cadence === 'weekly') return this.state.challengeWeek === week;
      return this.state.challengeDate === today;
    });

    const needDaily = !surviving.some((ch) => ch.cadence === 'daily');
    const needWeekly = !surviving.some((ch) => ch.cadence === 'weekly');

    const fresh: Challenge[] = [];

    if (needDaily) {
      const idxs: number[] = [];
      let seed = hashStr(today);
      while (idxs.length < 3 && idxs.length < CHALLENGE_POOL.length) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const i = seed % CHALLENGE_POOL.length;
        if (!idxs.includes(i)) idxs.push(i);
      }
      idxs.forEach((i) => {
        const t = CHALLENGE_POOL[i];
        fresh.push({ ...t, progress: 0, done: false });
      });
      this.state.challengeDate = today;
    }

    if (needWeekly) {
      const idxs: number[] = [];
      let seed = hashStr(week);
      while (idxs.length < 2 && idxs.length < WEEKLY_CHALLENGE_POOL.length) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const i = seed % WEEKLY_CHALLENGE_POOL.length;
        if (!idxs.includes(i)) idxs.push(i);
      }
      idxs.forEach((i) => {
        const t = WEEKLY_CHALLENGE_POOL[i];
        fresh.push({ ...t, progress: 0, done: false });
      });
      this.state.challengeWeek = week;
    }

    if (fresh.length > 0) {
      this.state.challenges = [...surviving, ...fresh];
      this.save();
    }
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
    this.ensureChallenges();
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
