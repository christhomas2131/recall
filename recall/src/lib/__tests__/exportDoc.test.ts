import { describe, expect, it } from 'vitest';
import { buildMarkdown, corrections, exportStats, MARK_CLOSE, MARK_OPEN } from '../exportDoc';
import type { Project, Question, Segment } from '@/types';

const token = (
  id: string,
  text: string,
  state: 'unverified' | 'confirmed' | 'edited',
  originalText = text,
): Segment => ({
  kind: 'token',
  id,
  text,
  originalText,
  state,
  category: 'duration',
  userNote: state === 'edited' ? 'It was six, not seven.' : undefined,
});

function makeQuestion(segments: Segment[]): Question {
  return {
    id: 'q1',
    text: 'Tell me about a process you fixed.',
    category: 'behavioral',
    sourceRoleId: 'r1',
    shortAnswer: segments,
    longAnswer: [],
    coachingNote: 'The seven-to-four contrast carries it. Say the last clause slowly.',
    versions: [],
    drillHistory: [],
    generatedAt: 1,
  };
}

function makeProject(question: Question, mode: Project['mode'] = 'standard'): Project {
  return {
    id: 'p1',
    name: 'Vantage Grid',
    mode,
    createdAt: 0,
    updatedAt: 0,
    resume: {
      rawText: '',
      roles: [
        {
          id: 'r1',
          employer: 'Northline',
          title: 'Program Operations Lead',
          startDate: '2021',
          endDate: null,
          bullets: [],
        },
      ],
      education: [],
      skills: [],
      gaps: [],
    },
    questions: [question],
  };
}

describe('export marking', () => {
  it('marks unverified spans and leaves confirmed and edited ones clean', () => {
    const q = makeQuestion([
      { kind: 'text', text: 'I cut it from ' },
      token('a', 'six weeks', 'edited', 'seven weeks'),
      { kind: 'text', text: ' to ' },
      token('b', 'four weeks', 'confirmed'),
      { kind: 'text', text: ' across ' },
      token('c', 'three teams', 'unverified'),
      { kind: 'text', text: '.' },
    ]);
    const md = buildMarkdown(makeProject(q));
    expect(md).toContain(`${MARK_OPEN}three teams${MARK_CLOSE}`);
    expect(md).toContain('six weeks');
    expect(md).not.toContain(`${MARK_OPEN}six weeks${MARK_CLOSE}`);
    expect(md).not.toContain(`${MARK_OPEN}four weeks${MARK_CLOSE}`);
  });

  it('adds a corrections appendix pairing each edit with its original', () => {
    const q = makeQuestion([token('a', 'six weeks', 'edited', 'seven weeks')]);
    const project = makeProject(q);
    expect(corrections(project)).toEqual([
      {
        questionText: q.text,
        original: 'seven weeks',
        current: 'six weeks',
        note: 'It was six, not seven.',
      },
    ]);
    const md = buildMarkdown(project);
    expect(md).toContain('## Corrections');
    expect(md).toContain('Recall first wrote “seven weeks”');
  });

  it('puts the unverified list at the top of a Fast mode export', () => {
    const q = makeQuestion([token('c', 'three teams', 'unverified')]);
    const md = buildMarkdown(makeProject(q, 'fast'));
    expect(md).toContain('1 detail below is AI-generated and unverified.');
    expect(md.indexOf('three teams')).toBeLessThan(md.indexOf('## Tell me about'));
  });

  it('always ends with a verification footer', () => {
    const q = makeQuestion([token('b', 'four weeks', 'confirmed')]);
    const md = buildMarkdown(makeProject(q));
    expect(md.trimEnd().endsWith('_')).toBe(true);
    expect(md).toContain('All 1 generated specifics were confirmed or corrected');
  });

  it('counts each token once even when it appears in both answers', () => {
    const shared = token('x', 'seven weeks', 'unverified');
    const q = makeQuestion([shared]);
    q.longAnswer = [{ kind: 'text', text: 'It ran ' }, shared, { kind: 'text', text: '.' }];
    expect(exportStats(makeProject(q)).total).toBe(1);
  });
});
