import { nanoid } from 'nanoid';
import type { Segment, TokenSegment } from '@/types';
import type { AnswerGenResponse } from '@/llm/schemas';
import { linkDuplicateTokens, repairSpacing } from './segments';

export interface MergeResult {
  shortAnswer: Segment[];
  longAnswer: Segment[];
  coachingNote: string;
  /** Locked facts the model failed to reproduce verbatim. */
  missingFacts: string[];
}

/**
 * Section 6.4 merge. A returned token whose text exactly matches a locked
 * fact keeps that fact's identity and verification state; everything else
 * is new and unverified.
 */
export function mergeRegeneration(
  data: AnswerGenResponse,
  lockedFacts: TokenSegment[],
): MergeResult {
  const pool = new Map<string, TokenSegment[]>();
  for (const fact of lockedFacts) {
    const list = pool.get(fact.text) ?? [];
    list.push(fact);
    pool.set(fact.text, list);
  }

  const claimed = new Set<string>();

  const take = (text: string): TokenSegment | undefined => {
    const list = pool.get(text);
    if (!list?.length) return undefined;
    const fact = list.shift()!;
    claimed.add(fact.id);
    return fact;
  };

  const hydrate = (raw: AnswerGenResponse['shortAnswer']): Segment[] =>
    raw.map((s) => {
      if (s.kind === 'text') return { kind: 'text', text: s.text };
      const locked = take(s.text);
      if (locked) {
        return {
          kind: 'token',
          id: locked.id,
          text: locked.text,
          originalText: locked.originalText,
          state: locked.state,
          category: locked.category,
          userNote: locked.userNote,
        };
      }
      return {
        kind: 'token',
        id: nanoid(),
        text: s.text,
        originalText: s.text,
        state: 'unverified',
        category: s.category,
      };
    });

  const shortAnswer = repairSpacing(hydrate(data.shortAnswer));
  const longAnswerRaw = repairSpacing(hydrate(data.longAnswer));
  const longAnswer = linkDuplicateTokens(shortAnswer, longAnswerRaw);

  const missingFacts = lockedFacts.filter((f) => !claimed.has(f.id)).map((f) => f.text);

  return {
    shortAnswer,
    longAnswer,
    coachingNote: data.coachingNote,
    missingFacts,
  };
}
