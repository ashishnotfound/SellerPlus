export function titleStructureScore(title: string): number {
  const normalized = title.trim();
  if (!normalized) return 0;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  let score = 0;
  if (normalized.length >= 80 && normalized.length <= 200) score += 50;
  else if (normalized.length >= 40 && normalized.length <= 220) score += 30;
  if (normalized !== normalized.toUpperCase()) score += 15;
  if (wordCount >= 5 && wordCount <= 30) score += 15;
  if (!/\b(best|#1|guaranteed|free|sale|discount)\b/i.test(normalized)) score += 20;
  return score;
}

export function contentCompletenessScore(bullets: string[], description: string): number {
  let score = 0;
  if (description.trim().length >= 200) score += 40;
  else if (description.trim().length > 0) score += 20;
  if (bullets.length >= 5) score += 40;
  else score += Math.min(32, bullets.length * 8);
  if (bullets.length > 0 && bullets.every((bullet) => bullet.trim().length >= 20)) score += 20;
  return Math.min(100, score);
}

export function titleReadabilityScore(title: string): number {
  if (!title.trim()) return 0;
  const words = title.trim().split(/\s+/).filter(Boolean);
  const longWords = words.filter((word) => word.replace(/[^a-z]/gi, "").length >= 10).length;
  const lengthPenalty = Math.max(0, title.length - 200) / 2;
  return Math.max(0, Math.min(100, Math.round(100 - (longWords / words.length) * 35 - lengthPenalty)));
}
