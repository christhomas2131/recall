import { nanoid } from 'nanoid';
import type { Segment, TokenSegment } from '@/types';
import type { RawSegment } from '@/llm/schemas';

export function segmentsToText(segments: Segment[]): string {
  return segments.map((s) => s.text).join('');
}

export function tokensOf(segments: Segment[]): TokenSegment[] {
  return segments.filter((s): s is TokenSegment => s.kind === 'token');
}

/** Assign ids and initial state to a freshly generated segment array. */
export function hydrateSegments(raw: RawSegment[]): Segment[] {
  return raw.map((s) =>
    s.kind === 'text'
      ? { kind: 'text', text: s.text }
      : {
          kind: 'token',
          id: nanoid(),
          text: s.text,
          originalText: s.text,
          state: 'unverified',
          category: s.category,
        },
  );
}

function needsSpaceBetween(left: string, right: string): boolean {
  const l = left.slice(-1);
  const r = right.slice(0, 1);
  if (!l.trim() || !r.trim()) return false;
  // No space before punctuation, or after an opening bracket, quote or symbol.
  if (/[.,;:!?%)\]}'’”-]/.test(r)) return false;
  if (/[([{“‘$#/-]/.test(l)) return false;
  return true;
}

/**
 * Concatenated segments must read as prose. Models routinely drop the space
 * on either side of a token span; this repairs the obvious cases so the
 * spacing validator only fires on genuinely broken output.
 *
 * A token's `text` is the claim itself — it is matched verbatim against
 * locked facts on regeneration and shown in the popover — so it is never
 * padded. When the gap sits after a token, a separate text segment carries
 * the space instead.
 */
export function repairSpacing(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && needsSpaceBetween(prev.text, segment.text)) {
      if (prev.kind === 'text') {
        out[out.length - 1] = { kind: 'text', text: `${prev.text} ` };
      } else {
        out.push({ kind: 'text', text: ' ' });
      }
    }
    out.push(segment);
  }
  return out;
}

/** True when concatenation produces prose without glued-together words. */
export function spacingLooksBroken(segments: Segment[]): boolean {
  const text = segmentsToText(segments);
  if (!text.trim()) return true;
  // A lowercase letter immediately followed by an uppercase letter mid-word,
  // or a word character butting straight into an opening quote/paren.
  return /[a-z][A-Z]{2}/.test(text) || /\s{3,}/.test(text);
}

/**
 * A specific claim often appears in both the short and long answer. Give the
 * long-answer copy the same token id so confirming it once confirms it
 * everywhere, and so progress counts it once.
 */
export function linkDuplicateTokens(shortAnswer: Segment[], longAnswer: Segment[]): Segment[] {
  const byText = new Map<string, TokenSegment>();
  for (const s of shortAnswer) {
    if (s.kind === 'token' && !byText.has(s.text)) byText.set(s.text, s);
  }
  return longAnswer.map((s) => {
    if (s.kind !== 'token') return s;
    const twin = byText.get(s.text);
    return twin ? { ...twin } : s;
  });
}

/** Unique tokens across a question's short and long answers, keyed by id. */
export function uniqueTokens(...arrays: Segment[][]): TokenSegment[] {
  const seen = new Map<string, TokenSegment>();
  for (const arr of arrays) {
    for (const s of arr) {
      if (s.kind === 'token' && !seen.has(s.id)) seen.set(s.id, s);
    }
  }
  return [...seen.values()];
}

/** Apply a patch to every copy of a token id across the given arrays. */
export function patchToken(
  segments: Segment[],
  tokenId: string,
  patch: Partial<Omit<TokenSegment, 'kind' | 'id'>>,
): Segment[] {
  return segments.map((s) =>
    s.kind === 'token' && s.id === tokenId ? { ...s, ...patch } : s,
  );
}
