import type { QuestionCategory, Role } from '@/types';

export interface DraftQuestion {
  text: string;
  category: QuestionCategory;
  sourceRoleId: string;
  competency?: string;
}

const STOPWORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'did', 'do',
  'for', 'from', 'had', 'has', 'have', 'how', 'in', 'into', 'is', 'it', 'me', 'my', 'of', 'on',
  'or', 'she', 'so', 'tell', 'that', 'the', 'their', 'them', 'then', 'there', 'they',
  'this', 'time', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why',
  'with', 'would', 'you', 'your',
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function roleVocabulary(role: Role): Set<string> {
  return words([role.employer, role.title, ...role.bullets].join(' '));
}

/** Shared content words between a question and a role's material. */
export function keywordScore(questionText: string, role: Role): number {
  const q = words(questionText);
  const r = roleVocabulary(role);
  let score = 0;
  for (const w of q) if (r.has(w)) score++;
  return score;
}

/**
 * Section 6.2 post-processing: no role may hold more than 30% of the
 * questions. Excess questions move to the least-used eligible roles,
 * preferring roles whose bullets share keywords with the question.
 * Skipped entirely for a single-role resume (Section 9).
 */
export function enforceDistribution(
  questions: DraftQuestion[],
  roles: Role[],
): DraftQuestion[] {
  if (roles.length <= 1 || questions.length === 0) return questions;

  const n = questions.length;
  // A hard 30% cap is unsatisfiable with few roles; the floor is the
  // even split, which is the strictest achievable distribution.
  const cap = Math.max(Math.floor(n * 0.3), Math.ceil(n / roles.length));

  const result = questions.map((q) => ({ ...q }));
  const counts = new Map<string, number>(roles.map((r) => [r.id, 0]));
  for (const q of result) counts.set(q.sourceRoleId, (counts.get(q.sourceRoleId) ?? 0) + 1);

  const roleById = new Map(roles.map((r) => [r.id, r]));

  for (const role of roles) {
    let count = counts.get(role.id) ?? 0;
    if (count <= cap) continue;

    // Give up the weakest keyword matches first.
    const owned = result
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.sourceRoleId === role.id)
      .sort((a, b) => keywordScore(a.q.text, role) - keywordScore(b.q.text, role));

    for (const { q, i } of owned) {
      if (count <= cap) break;

      const candidates = roles
        .filter((r) => r.id !== role.id && (counts.get(r.id) ?? 0) < cap)
        .sort((a, b) => {
          const byCount = (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0);
          if (byCount !== 0) return byCount;
          return keywordScore(q.text, b) - keywordScore(q.text, a);
        });

      const target = candidates[0];
      if (!target) break;

      result[i] = { ...q, sourceRoleId: target.id };
      counts.set(role.id, --count);
      counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
    }
  }

  // Any question pointing at a role that is not eligible lands on the least-used one.
  for (let i = 0; i < result.length; i++) {
    if (roleById.has(result[i].sourceRoleId)) continue;
    const target = [...roles].sort(
      (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0),
    )[0];
    result[i] = { ...result[i], sourceRoleId: target.id };
    counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
  }

  return result;
}
