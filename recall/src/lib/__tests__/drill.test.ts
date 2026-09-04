import { describe, expect, it } from 'vitest';
import { DRILL_INTERVAL_MS, drillQueue, dueAt, isDrillable } from '../drill';
import type { DrillAttempt, Project, Question, Segment } from '@/types';

const unverifiedToken: Segment = {
  kind: 'token',
  id: 'tok',
  text: 'seven weeks',
  originalText: 'seven weeks',
  state: 'unverified',
  category: 'duration',
};

function question(id: string, history: DrillAttempt[], segments: Segment[] = []): Question {
  return {
    id,
    text: `Question ${id}`,
    category: 'behavioral',
    sourceRoleId: 'r1',
    shortAnswer: segments,
    longAnswer: [],
    coachingNote: '',
    versions: [],
    drillHistory: history,
    generatedAt: 1,
  };
}

function project(questions: Question[], mode: Project['mode'] = 'fast'): Project {
  return {
    id: 'p1',
    name: 'p',
    mode,
    createdAt: 0,
    updatedAt: 0,
    resume: { rawText: '', roles: [], education: [], skills: [], gaps: [] },
    questions,
  };
}

describe('spaced queue', () => {
  it('brings a redo back sooner than a nailed', () => {
    const at = Date.now();
    const redo = question('redo', [{ at, elapsedSeconds: 40, rating: 'redo' }]);
    const nailed = question('nailed', [{ at, elapsedSeconds: 30, rating: 'nailed' }]);
    expect(dueAt(redo)).toBeLessThan(dueAt(nailed));

    const queue = drillQueue(project([nailed, redo]));
    expect(queue.map((q) => q.id)).toEqual(['redo', 'nailed']);
  });

  it('puts never-drilled questions first', () => {
    const at = Date.now();
    const drilled = question('drilled', [{ at, elapsedSeconds: 20, rating: 'redo' }]);
    const fresh = question('fresh', []);
    expect(drillQueue(project([drilled, fresh])).map((q) => q.id)).toEqual(['fresh', 'drilled']);
  });

  it('spaces each rating by its own interval', () => {
    const at = Date.now();
    const redo = question('redo', [{ at, elapsedSeconds: 40, rating: 'redo' }]);
    const rough = question('rough', [{ at, elapsedSeconds: 40, rating: 'rough' }]);
    const nailed = question('nailed', [{ at, elapsedSeconds: 40, rating: 'nailed' }]);
    expect(dueAt(redo)).toBe(at + DRILL_INTERVAL_MS.redo);
    expect(dueAt(rough)).toBe(at + DRILL_INTERVAL_MS.rough);
    expect(dueAt(nailed)).toBe(at + DRILL_INTERVAL_MS.nailed);
    expect(dueAt(redo)).toBeLessThan(dueAt(rough));
    expect(dueAt(rough)).toBeLessThan(dueAt(nailed));
  });
});

describe('drill locking', () => {
  it('locks an unverified question in standard mode and allows it in fast mode', () => {
    const q = question('q', [], [unverifiedToken]);
    expect(isDrillable(project([q], 'standard'), q)).toBe(false);
    expect(isDrillable(project([q], 'fast'), q)).toBe(true);
  });

  it('unlocks in standard mode once every token is resolved', () => {
    const q = question('q', [], [{ ...unverifiedToken, state: 'confirmed' }]);
    expect(isDrillable(project([q], 'standard'), q)).toBe(true);
  });

  it('never drills a question with no answer', () => {
    const q = { ...question('q', []), generatedAt: null };
    expect(isDrillable(project([q], 'fast'), q)).toBe(false);
  });
});
