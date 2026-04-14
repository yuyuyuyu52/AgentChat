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
