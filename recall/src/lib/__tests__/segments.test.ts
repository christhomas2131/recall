import { describe, expect, it } from 'vitest';
import {
  hydrateSegments,
  linkDuplicateTokens,
  patchToken,
  repairSpacing,
  segmentsToText,
  uniqueTokens,
} from '../segments';
import type { RawSegment } from '@/llm/schemas';
import type { Segment } from '@/types';

const raw = (parts: RawSegment[]) => hydrateSegments(parts);

describe('hydrateSegments', () => {
  it('gives every token an id, an original, and unverified state', () => {
    const segments = raw([
      { kind: 'text', text: 'We cut it from ' },
      { kind: 'token', text: 'seven weeks to under four', category: 'duration' },
      { kind: 'text', text: '.' },
    ]);
    const tokens = uniqueTokens(segments);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].state).toBe('unverified');
    expect(tokens[0].originalText).toBe('seven weeks to under four');
    expect(tokens[0].id).toBeTruthy();
  });
});

describe('repairSpacing', () => {
  it('inserts the missing space between a word and a token', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'text', text: 'We cut it from' },
        { kind: 'token', text: 'seven weeks', category: 'duration' },
        { kind: 'text', text: 'to four' },
      ]),
    );
    expect(segmentsToText(segments)).toBe('We cut it from seven weeks to four');
  });

  it('does not push a space in front of punctuation', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'text', text: 'It closed in ' },
        { kind: 'token', text: 'month four', category: 'date' },
        { kind: 'text', text: '.' },
      ]),
    );
    expect(segmentsToText(segments)).toBe('It closed in month four.');
  });

  it('leaves existing spacing alone', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'text', text: 'Across ' },
        { kind: 'token', text: 'fifty-three organizations', category: 'count' },
        { kind: 'text', text: ', all of them funded.' },
      ]),
    );
    expect(segmentsToText(segments)).toBe(
      'Across fifty-three organizations, all of them funded.',
    );
  });
});

describe('linkDuplicateTokens', () => {
  it('gives the long-answer copy the same id as the short-answer token', () => {
    const short = raw([
      { kind: 'text', text: 'Down to ' },
      { kind: 'token', text: 'four weeks', category: 'duration' },
    ]);
    const long = raw([
      { kind: 'text', text: 'The chain ran ' },
      { kind: 'token', text: 'four weeks', category: 'duration' },
      { kind: 'text', text: ' by the end.' },
    ]);
    const linked = linkDuplicateTokens(short, long);
    expect(uniqueTokens(short, linked)).toHaveLength(1);
  });
});

describe('patchToken', () => {
  const build = (): Segment[] =>
    repairSpacing(
      raw([
        { kind: 'text', text: 'We reviewed ' },
        { kind: 'token', text: 'eleven of sixty-one', category: 'count' },
        { kind: 'text', text: ' files before the deadline.' },
      ]),
    );

  it('patches every copy of a token id', () => {
    const segments = build();
    const id = uniqueTokens(segments)[0].id;
    const next = patchToken(segments, id, { text: 'nine of sixty-one', state: 'edited' });
    expect(segmentsToText(next)).toBe('We reviewed nine of sixty-one files before the deadline.');
    expect(uniqueTokens(next)[0].state).toBe('edited');
    expect(uniqueTokens(next)[0].originalText).toBe('eleven of sixty-one');
  });
});

describe('repairSpacing never edits a token', () => {
  it('leaves token text alone when the model glued the following word on', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'text', text: 'I cut it from ' },
        { kind: 'token', text: 'seven weeks', category: 'duration' },
        { kind: 'text', text: 'to four.' },
      ]),
    );
    const token = uniqueTokens(segments)[0];
    // The claim itself must stay verbatim — it is matched against locked
    // facts on regeneration and shown in the popover.
    expect(token.text).toBe('seven weeks');
    expect(token.text).toBe(token.originalText);
    expect(segmentsToText(segments)).toBe('I cut it from seven weeks to four.');
  });

  it('leaves the first token alone when it opens the answer', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'text', text: 'later it shipped.' },
      ]),
    );
    expect(uniqueTokens(segments)[0].text).toBe('six weeks');
    expect(segmentsToText(segments)).toBe('six weeks later it shipped.');
  });

  it('handles two tokens butted together', () => {
    const segments = repairSpacing(
      raw([
        { kind: 'token', text: 'six weeks', category: 'duration' },
        { kind: 'token', text: 'across four teams', category: 'count' },
      ]),
    );
    const tokens = uniqueTokens(segments);
    expect(tokens.map((t) => t.text)).toEqual(['six weeks', 'across four teams']);
    expect(segmentsToText(segments)).toBe('six weeks across four teams');
  });
});
