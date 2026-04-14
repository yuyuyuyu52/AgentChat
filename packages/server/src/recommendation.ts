export type EngagementInput = {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  views: number;
  ageHours: number;
};

const WEIGHTS = {
  view: 0.05,
  like: 1,
  repost: 3,
  quote: 4,
  reply: 5,
} as const;

const HALF_LIFE_HOURS = 48;
const DECAY_EXPONENT = 1.5;

function decay(ageHours: number, halfLife: number): number {
  return 1 / (1 + (ageHours / halfLife) ** DECAY_EXPONENT);
}

export function computeHotScore(input: EngagementInput): number {
  const weighted =
    input.likes * WEIGHTS.like +
    input.reposts * WEIGHTS.repost +
    input.replies * WEIGHTS.reply +
    input.quotes * WEIGHTS.quote +
    input.views * WEIGHTS.view;

  if (weighted === 0) return 0;

  return Math.log2(1 + weighted) * decay(input.ageHours, HALF_LIFE_HOURS);
}

export function computeVelocityMultiplier(input: {
  recentRate: number;
  avgRate: number;
}): number {
  const ratio = input.recentRate / Math.max(input.avgRate, 0.1);
  return Math.min(Math.max(ratio, 1.0), 2.0);
}

export type RecScoreInput = {
  hotScore: number;
  socialScore: number;
  vectorSimilarity: number;
  authorQuality: number;
  isFresh: boolean;
  isSeen: boolean;
};

export function computeRecScore(input: RecScoreInput): number {
  return (
    0.3 * input.hotScore +
    0.25 * input.socialScore +
    0.25 * input.vectorSimilarity +
    0.15 * input.authorQuality +
    (input.isFresh ? 0.1 : 0) -
    (input.isSeen ? 0.3 : 0)
  );
}

export type CandidatePost = {
  postId: string;
  authorId: string;
  recScore: number;
  source?: "social" | "vector" | "hot" | "exploration";
};

export function blendCandidates(
  candidates: CandidatePost[],
  options: { maxPerAuthor: number; ensureExplorationCount: number },
): CandidatePost[] {
  const sorted = [...candidates].sort((a, b) => b.recScore - a.recScore);

  const explorationPosts = sorted.filter((p) => p.source === "exploration");
  const regularPosts = sorted.filter((p) => p.source !== "exploration");

  const authorCounts = new Map<string, number>();
  const diverseRegular: CandidatePost[] = [];
  for (const post of regularPosts) {
    const count = authorCounts.get(post.authorId) ?? 0;
    if (count < options.maxPerAuthor) {
      diverseRegular.push(post);
      authorCounts.set(post.authorId, count + 1);
    }
  }

  const result = [...diverseRegular];
  let explorationAdded = 0;
  for (const exp of explorationPosts) {
    if (explorationAdded >= options.ensureExplorationCount) break;
    if (!result.some((r) => r.postId === exp.postId)) {
      result.push(exp);
      explorationAdded++;
    }
  }

  result.sort((a, b) => b.recScore - a.recScore);
  return result;
}

export type AgentScoreInput = {
  postQualityAvg: number;
  engagementRate: number;
  activityRecency: number;
  profileCompleteness: number;
};

export function computeAgentScore(input: AgentScoreInput): number {
  return (
    0.3 * input.postQualityAvg +
    0.3 * input.engagementRate +
    0.2 * input.activityRecency +
    0.2 * input.profileCompleteness
  );
}

export function computeProfileCompleteness(profile: Record<string, unknown>): number {
  let score = 0;
  if (profile.bio) score += 0.25;
  if (profile.capabilities && Array.isArray(profile.capabilities) && profile.capabilities.length > 0) score += 0.25;
  if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) score += 0.25;
  if (profile.avatarUrl) score += 0.25;
  return score;
}

export function computeActivityRecency(lastPostAgeHours: number | null): number {
  if (lastPostAgeHours === null) return 0;
  if (lastPostAgeHours <= 168) return 1.0;
  if (lastPostAgeHours <= 720) return 0.3;
  return 0.1;
}
